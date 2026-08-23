import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // ============================================================
  // METHOD
  // ============================================================

  if (req.method !== "POST") {
    return response(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    console.log("VA FUNCTION STARTED");

    // ==========================================================
    // 1. ENVIRONMENT
    // ==========================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecretKey =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    console.log(
      "Environment configuration check:",
      JSON.stringify({
        supabase_url:
          Boolean(supabaseUrl),

        supabase_anon_key:
          Boolean(supabaseAnonKey),

        service_role_key:
          Boolean(serviceRoleKey),

        flutterwave_secret_key:
          Boolean(flutterwaveSecretKey),
      }),
    );

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "Supabase configuration missing",
      );

      return response(
        {
          success: false,
          error:
            "Supabase configuration is missing",
        },
        500,
      );
    }

    if (!serviceRoleKey) {
      console.error(
        "SUPABASE_SERVICE_ROLE_KEY missing",
      );

      return response(
        {
          success: false,
          error:
            "Service role key is not configured",
        },
        500,
      );
    }

    if (!flutterwaveSecretKey) {
      console.error(
        "FLUTTERWAVE_SECRET_KEY missing",
      );

      return response(
        {
          success: false,
          error:
            "Flutterwave is not configured",
        },
        500,
      );
    }

    console.log(
      "Environment configuration loaded successfully",
    );

    // ==========================================================
    // 2. AUTHORIZATION
    // ==========================================================

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      console.error(
        "Authorization header missing",
      );

      return response(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    console.log(
      "Authorization header received",
    );

    // ==========================================================
    // 3. USER CLIENT
    // ==========================================================

    const userClient =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        },
      );

    console.log(
      "User Supabase client created",
    );

    const {
      data: { user },
      error: authError,
    } =
      await userClient.auth.getUser();

    if (authError || !user) {
      console.error(
        "Authentication error:",
        authError,
      );

      return response(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    console.log(
      "Authenticated user:",
      user.id,
    );

    // ==========================================================
    // 4. ADMIN CLIENT
    // ==========================================================

    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

    console.log(
      "Admin Supabase client created",
    );

    // ==========================================================
    // 5. CHECK EXISTING VIRTUAL ACCOUNT
    // ==========================================================

    console.log(
      "Checking existing permanent virtual account...",
    );

    const {
      data: existingAccount,
      error: existingError,
    } =
      await adminClient
        .from("virtual_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_permanent", true)
        .eq("status", "active")
        .maybeSingle();

    console.log(
      "Existing virtual account lookup completed:",
      JSON.stringify({
        found:
          Boolean(existingAccount),

        error:
          existingError?.message ??
          null,
      }),
    );

    if (existingError) {
      console.error(
        "Existing virtual account lookup error:",
        existingError,
      );

      return response(
        {
          success: false,
          error:
            "Failed to check virtual account",
          database_error:
            existingError.message,
        },
        500,
      );
    }

    // ==========================================================
    // 6. RETURN EXISTING ACCOUNT
    // ==========================================================

    if (existingAccount) {
      console.log(
        "Existing permanent virtual account found:",
        existingAccount.account_number,
      );

      return response(
        {
          success: true,
          existing: true,
          account: existingAccount,
        },
        200,
      );
    }

    console.log(
      "No existing permanent virtual account found",
    );

    // ==========================================================
    // 7. CHECK WALLET
    // ==========================================================

    console.log(
      "Checking wallet...",
    );

    const {
      data: wallet,
      error: walletError,
    } =
      await adminClient
        .from("wallets")
        .select(
          "id, user_id, balance, held_balance, currency, status",
        )
        .eq("user_id", user.id)
        .maybeSingle();

    console.log(
      "Wallet lookup completed:",
      JSON.stringify({
        found:
          Boolean(wallet),

        wallet_id:
          wallet?.id ??
          null,

        error:
          walletError?.message ??
          null,
      }),
    );

    if (walletError) {
      console.error(
        "Wallet lookup error:",
        walletError,
      );

      return response(
        {
          success: false,
          error:
            "Failed to load wallet",
          database_error:
            walletError.message,
        },
        500,
      );
    }

    if (!wallet) {
      console.error(
        "Wallet not found for user:",
        user.id,
      );

      return response(
        {
          success: false,
          error:
            "Wallet not found. Please initialize your wallet first.",
          code: "WALLET_NOT_FOUND",
        },
        400,
      );
    }

    console.log(
      "Wallet found:",
      wallet.id,
    );

    // ==========================================================
    // 8. CHECK PROFILE
    // ==========================================================

    console.log(
      "Checking user profile...",
    );

    const {
      data: profile,
      error: profileError,
    } =
      await adminClient
        .from("profiles")
        .select(
          "id, full_name, email, phone_number, bvn, nin, kyc_level, kyc_status, bvn_verified",
        )
        .eq("id", user.id)
        .maybeSingle();

    console.log(
      "Profile lookup completed:",
      JSON.stringify({
        found:
          Boolean(profile),

        profile_id:
          profile?.id ??
          null,

        has_bvn:
          Boolean(
            profile?.bvn,
          ),

        has_nin:
          Boolean(
            profile?.nin,
          ),

        kyc_level:
          profile?.kyc_level ??
          null,

        kyc_status:
          profile?.kyc_status ??
          null,

        bvn_verified:
          profile?.bvn_verified ??
          null,

        error:
          profileError?.message ??
          null,
      }),
    );

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError,
      );

      return response(
        {
          success: false,
          error:
            "Failed to load profile",
          database_error:
            profileError.message,
        },
        500,
      );
    }

    if (!profile) {
      console.error(
        "Profile not found:",
        user.id,
      );

      return response(
        {
          success: false,
          error:
            "Profile not found",
          code: "PROFILE_NOT_FOUND",
        },
        400,
      );
    }

    // ==========================================================
    // 9. KYC
    // ==========================================================

    const bvn =
      String(
        profile.bvn ?? "",
      ).trim();

    const nin =
      String(
        profile.nin ?? "",
      ).trim();

    console.log(
      "KYC data check:",
      JSON.stringify({
        has_bvn:
          Boolean(bvn),

        bvn_length:
          bvn.length,

        has_nin:
          Boolean(nin),

        nin_length:
          nin.length,

        kyc_level:
          profile.kyc_level,

        kyc_status:
          profile.kyc_status,

        bvn_verified:
          profile.bvn_verified,
      }),
    );

    if (!bvn && !nin) {
      console.error(
        "No BVN or NIN found for user",
      );

      return response(
        {
          success: false,
          error:
            "BVN or NIN is required to create your dedicated bank account",
          code: "KYC_REQUIRED",
        },
        400,
      );
    }

    console.log(
      "KYC available:",
      bvn ? "BVN" : "NIN",
    );

    // ==========================================================
    // 10. CUSTOMER DETAILS
    // ==========================================================

    console.log(
      "Preparing customer details...",
    );

    const fullName =
      profile.full_name?.trim() ||
      "IyanjuPay User";

    const nameParts =
      fullName.split(/\s+/);

    const firstname =
      nameParts[0] ||
      "IyanjuPay";

    const lastname =
      nameParts.slice(1).join(" ") ||
      "User";

    const email =
      profile.email?.trim() ||
      user.email?.trim();

    if (!email) {
      console.error(
        "No email address available",
      );

      return response(
        {
          success: false,
          error:
            "A valid email address is required",
        },
        400,
      );
    }

    console.log(
      "Customer details prepared:",
      JSON.stringify({
        firstname,
        lastname,
        has_email:
          Boolean(email),
        has_phone:
          Boolean(
            profile.phone_number,
          ),
      }),
    );

    // ==========================================================
    // 11. GENERATE REFERENCE
    // ==========================================================

    const txRef =
      `IYJ_VA_${user.id}_${crypto.randomUUID()}`;

    console.log(
      "Creating Flutterwave virtual account:",
      txRef,
    );

    // ==========================================================
    // 12. CALL FLUTTERWAVE
    // ==========================================================

    console.log(
      "Calling Flutterwave virtual-account API...",
    );

    let flutterwaveResponse: Response;

    try {
      flutterwaveResponse =
        await fetch(
          "https://api.flutterwave.com/v3/virtual-account-numbers",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${flutterwaveSecretKey}`,

              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                email,

                phonenumber:
                  profile.phone_number ||
                  undefined,

                firstname,

                lastname,

                currency:
                  "NGN",

                amount:
                  0,

                tx_ref:
                  txRef,

                is_permanent:
                  true,

                narration:
                  `${firstname} ${lastname}`,

                ...(bvn
                  ? { bvn }
                  : nin
                    ? { nin }
                    : {}),
              }),
          },
        );
    } catch (flutterwaveNetworkError) {
      console.error(
        "Flutterwave network error:",
        flutterwaveNetworkError,
      );

      return response(
        {
          success: false,
          error:
            "Unable to connect to Flutterwave",
        },
        503,
      );
    }

    console.log(
      "Flutterwave response received:",
      JSON.stringify({
        http_status:
          flutterwaveResponse.status,

        ok:
          flutterwaveResponse.ok,
      }),
    );

    let flutterwaveData: any = null;

    try {
      flutterwaveData =
        await flutterwaveResponse.json();
    } catch (parseError) {
      console.error(
        "Unable to parse Flutterwave response:",
        parseError,
      );
    }

    console.log(
      "Flutterwave response:",
      JSON.stringify(
        flutterwaveData,
      ),
    );

    // ==========================================================
    // 13. FLUTTERWAVE FAILURE
    // ==========================================================

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !==
        "success"
    ) {
      console.error(
        "Flutterwave virtual account creation failed:",
        JSON.stringify(
          flutterwaveData,
        ),
      );

      return response(
        {
          success: false,
          error:
            flutterwaveData?.message ||
            "Failed to create virtual account",
          provider:
            "flutterwave",
          provider_response:
            flutterwaveData,
        },
        502,
      );
    }

    const account =
      flutterwaveData.data;

    // ==========================================================
    // 14. VALIDATE ACCOUNT
    // ==========================================================

    console.log(
      "Validating Flutterwave account response...",
    );

    if (
      !account?.account_number ||
      !account?.bank_name
    ) {
      console.error(
        "Flutterwave returned incomplete account data:",
        JSON.stringify(
          account,
        ),
      );

      return response(
        {
          success: false,
          error:
            "Flutterwave returned incomplete virtual account details",
        },
        502,
      );
    }

    console.log(
      "Flutterwave returned valid virtual account:",
      JSON.stringify({
        bank_name:
          account.bank_name,

        account_number:
          account.account_number,

        has_account_name:
          Boolean(
            account.account_name,
          ),

        flw_ref:
          account.flw_ref ??
          null,
      }),
    );

    // ==========================================================
    // 15. SAVE ACCOUNT
    // ==========================================================

    console.log(
      "Saving virtual account to database...",
    );

    const {
      data: savedAccount,
      error: saveError,
    } =
      await adminClient
        .from("virtual_accounts")
        .insert({
          user_id:
            user.id,

          wallet_id:
            wallet.id,

          provider:
            "flutterwave",

          bank_name:
            account.bank_name,

          account_number:
            account.account_number,

          account_name:
            account.account_name ||
            `${firstname} ${lastname}`,

          provider_reference:
            account.flw_ref ||
            null,

          order_reference:
            account.order_ref ||
            txRef,

          is_permanent:
            true,

          status:
            "active",
        })
        .select()
        .single();

    if (saveError) {
      console.error(
        "Virtual account save error:",
        saveError,
      );

      return response(
        {
          success: false,
          error:
            "Virtual account was created by Flutterwave but could not be saved locally",
          code:
            "VIRTUAL_ACCOUNT_SAVE_FAILED",
          database_error:
            saveError.message,
        },
        500,
      );
    }

    console.log(
      "Virtual account saved successfully:",
      savedAccount.id,
    );

    // ==========================================================
    // 16. SUCCESS
    // ==========================================================

    console.log(
      "VA FUNCTION COMPLETED SUCCESSFULLY",
    );

    return response(
      {
        success: true,
        existing: false,
        account:
          savedAccount,
      },
      200,
    );
  } catch (error) {
    console.error(
      "Virtual account unexpected error:",
      error,
    );

    return response(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
});
