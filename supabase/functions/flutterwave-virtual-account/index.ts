import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: corsHeaders,
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const flutterwaveSecretKey =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    // --------------------------------------------------
    // 1. Check server configuration
    // --------------------------------------------------

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase configuration missing");

      return new Response(
        JSON.stringify({
          error: "Supabase configuration is missing",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY missing");

      return new Response(
        JSON.stringify({
          error: "Service role key is not configured",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    if (!flutterwaveSecretKey) {
      console.error("FLUTTERWAVE_SECRET_KEY missing");

      return new Response(
        JSON.stringify({
          error: "Flutterwave is not configured",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 2. Get user's Authorization token
    // --------------------------------------------------

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.error("Authorization header missing");

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 3. USER CLIENT
    // Used ONLY to authenticate the logged-in user
    // --------------------------------------------------

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error("Authentication error:", authError);

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    console.log("Authenticated user:", user.id);

    // --------------------------------------------------
    // 4. ADMIN CLIENT
    // Used ONLY for trusted database operations
    // --------------------------------------------------

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // --------------------------------------------------
    // 5. Check if permanent account already exists
    // --------------------------------------------------

    const {
      data: existingAccount,
      error: existingError,
    } = await adminClient
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_permanent", true)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      console.error(
        "Existing virtual account lookup error:",
        existingError
      );

      return new Response(
        JSON.stringify({
          error: "Failed to check virtual account",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 6. Return existing account
    // Prevent duplicate Flutterwave accounts
    // --------------------------------------------------

    if (existingAccount) {
      console.log(
        "Existing permanent virtual account found:",
        existingAccount.account_number
      );

      return new Response(
        JSON.stringify({
          success: true,
          existing: true,
          account: existingAccount,
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 7. Get user's wallet
    // --------------------------------------------------

    const {
      data: wallet,
      error: walletError,
    } = await adminClient
      .from("wallets")
      .select("id, user_id, balance, held_balance, currency, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError) {
      console.error("Wallet lookup error:", walletError);

      return new Response(
        JSON.stringify({
          error: "Failed to load wallet",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    if (!wallet) {
      return new Response(
        JSON.stringify({
          error:
            "Wallet not found. Please initialize your wallet first.",
          code: "WALLET_NOT_FOUND",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log("Wallet found:", wallet.id);

    // --------------------------------------------------
    // 8. Get user's profile / KYC
    // --------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await adminClient
      .from("profiles")
      .select(
        "id, full_name, email, phone_number, bvn, nin"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError);

      return new Response(
        JSON.stringify({
          error: "Failed to load profile",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: "Profile not found",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 9. Validate KYC
    // --------------------------------------------------

    const bvn = profile.bvn?.trim();
    const nin = profile.nin?.trim();

    if (!bvn && !nin) {
      return new Response(
        JSON.stringify({
          error:
            "BVN or NIN is required to create your dedicated bank account",
          code: "KYC_REQUIRED",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log(
      "KYC available:",
      bvn ? "BVN" : "NIN"
    );

    // --------------------------------------------------
    // 10. Prepare customer name
    // --------------------------------------------------

    const fullName =
      profile.full_name?.trim() || "IyanjuPay User";

    const nameParts = fullName.split(/\s+/);

    const firstname = nameParts[0] || "IyanjuPay";

    const lastname =
      nameParts.slice(1).join(" ") || "User";

    const email =
      profile.email?.trim() ||
      user.email?.trim();

    if (!email) {
      return new Response(
        JSON.stringify({
          error: "A valid email address is required",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 11. Generate unique Flutterwave reference
    // --------------------------------------------------

    const txRef =
      `IYJ_VA_${user.id}_${crypto.randomUUID()}`;

    console.log(
      "Creating Flutterwave virtual account:",
      txRef
    );

    // --------------------------------------------------
    // 12. Call Flutterwave
    // --------------------------------------------------

    const flutterwaveResponse = await fetch(
      "https://api.flutterwave.com/v3/virtual-account-numbers",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${flutterwaveSecretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          phonenumber:
            profile.phone_number || undefined,
          firstname,
          lastname,
          currency: "NGN",
          amount: 0,
          tx_ref: txRef,
          is_permanent: true,
          narration: `${firstname} ${lastname}`,

          // Flutterwave receives ONE available KYC identifier.
          ...(bvn
            ? { bvn }
            : nin
              ? { nin }
              : {}),
        }),
      }
    );

    const flutterwaveData =
      await flutterwaveResponse.json();

    console.log(
      "Flutterwave HTTP status:",
      flutterwaveResponse.status
    );

    console.log(
      "Flutterwave response:",
      JSON.stringify(flutterwaveData)
    );

    // --------------------------------------------------
    // 13. Check Flutterwave response
    // --------------------------------------------------

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !== "success"
    ) {
      console.error(
        "Flutterwave virtual account creation failed:",
        JSON.stringify(flutterwaveData)
      );

      return new Response(
        JSON.stringify({
          error:
            flutterwaveData?.message ||
            "Failed to create virtual account",
          provider: "flutterwave",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    const account = flutterwaveData.data;

    if (
      !account?.account_number ||
      !account?.bank_name
    ) {
      console.error(
        "Flutterwave returned incomplete account data:",
        JSON.stringify(account)
      );

      return new Response(
        JSON.stringify({
          error:
            "Flutterwave returned incomplete virtual account details",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 14. Save virtual account using ADMIN client
    // --------------------------------------------------

    const {
      data: savedAccount,
      error: saveError,
    } = await adminClient
      .from("virtual_accounts")
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        provider: "flutterwave",
        bank_name: account.bank_name,
        account_number: account.account_number,
        account_name:
          account.account_name ||
          `${firstname} ${lastname}`,
        provider_reference:
          account.flw_ref || null,
        order_reference:
          account.order_ref || txRef,
        is_permanent: true,
        status: "active",
      })
      .select()
      .single();

    if (saveError) {
      console.error(
        "Virtual account save error:",
        saveError
      );

      /*
       * IMPORTANT:
       *
       * Flutterwave may already have created the account
       * even if our database insert fails.
       *
       * Therefore we DO NOT automatically call Flutterwave
       * again here.
       */

      return new Response(
        JSON.stringify({
          error:
            "Virtual account was created by Flutterwave but could not be saved locally",
          code: "VIRTUAL_ACCOUNT_SAVE_FAILED",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 15. Success
    // --------------------------------------------------

    console.log(
      "Virtual account saved successfully:",
      savedAccount.id
    );

    return new Response(
      JSON.stringify({
        success: true,
        existing: false,
        account: savedAccount,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error(
      "Virtual account unexpected error:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
