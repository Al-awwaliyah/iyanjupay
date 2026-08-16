import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  // ------------------------------------------------------------
  // 1. CORS
  // ------------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    // ------------------------------------------------------------
    // 2. ENVIRONMENT
    // ------------------------------------------------------------

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL is not configured");
    }

    if (!supabaseAnonKey) {
      throw new Error(
        "SUPABASE_ANON_KEY is not configured"
      );
    }

    if (!serviceRoleKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not configured"
      );
    }

    if (!flutterwaveSecret) {
      throw new Error(
        "FLUTTERWAVE_SECRET_KEY is not configured"
      );
    }

    // ------------------------------------------------------------
    // 3. AUTHENTICATE USER
    // ------------------------------------------------------------

    const authorization =
      req.headers.get("Authorization") ?? "";

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error(
        "Authentication error:",
        authError
      );

      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    // ------------------------------------------------------------
    // 4. ADMIN CLIENT
    // ------------------------------------------------------------

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // ------------------------------------------------------------
    // 5. READ REQUEST
    // ------------------------------------------------------------

    const body = await req.json();

    const accountNumber = String(
      body?.account_number ?? ""
    ).trim();

    const bankCode = String(
      body?.account_bank ??
        body?.bank_code ??
        ""
    ).trim();

    // ------------------------------------------------------------
    // 6. VALIDATE INPUT
    // ------------------------------------------------------------

    if (!accountNumber) {
      return jsonResponse(
        {
          success: false,
          error: "Account number is required",
        },
        400
      );
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Account number must contain exactly 10 digits",
        },
        400
      );
    }

    if (!bankCode) {
      return jsonResponse(
        {
          success: false,
          error: "Bank code is required",
        },
        400
      );
    }

    // Flutterwave Nigerian bank codes are normally numeric.
    if (!/^\d+$/.test(bankCode)) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid bank code",
        },
        400
      );
    }

    // ------------------------------------------------------------
    // 7. RESOLVE ACCOUNT WITH FLUTTERWAVE
    // ------------------------------------------------------------

    console.log(
      `Resolving bank account for user ${user.id}: bank=${bankCode}, account=${accountNumber}`
    );

    const flutterwaveResponse = await fetch(
      "https://api.flutterwave.com/v3/accounts/resolve",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flutterwaveSecret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          account_number: accountNumber,
          account_bank: bankCode,
        }),
      }
    );

    let flutterwaveData: any;

    try {
      flutterwaveData =
        await flutterwaveResponse.json();
    } catch {
      flutterwaveData = null;
    }

    console.log(
      "Flutterwave account resolution response:",
      JSON.stringify(flutterwaveData)
    );

    // ------------------------------------------------------------
    // 8. HANDLE FLUTTERWAVE ERROR
    // ------------------------------------------------------------

    if (!flutterwaveResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            flutterwaveData?.message ??
            "Unable to verify bank account",
          provider: "flutterwave",
        },
        400
      );
    }

    if (
      flutterwaveData?.status !== "success" ||
      !flutterwaveData?.data
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            flutterwaveData?.message ??
            "Bank account could not be verified",
        },
        400
      );
    }

    // ------------------------------------------------------------
    // 9. EXTRACT VERIFIED ACCOUNT DETAILS
    // ------------------------------------------------------------

    const resolvedAccountNumber = String(
      flutterwaveData.data.account_number ??
        accountNumber
    ).trim();

    const accountName = String(
      flutterwaveData.data.account_name ?? ""
    ).trim();

    if (!accountName) {
      console.error(
        "Flutterwave returned no account name"
      );

      return jsonResponse(
        {
          success: false,
          error:
            "The bank account could not be verified",
        },
        400
      );
    }

    // ------------------------------------------------------------
    // 10. RETURN VERIFIED BENEFICIARY
    // ------------------------------------------------------------

    console.log(
      `Account resolved successfully for user ${user.id}`
    );

    return jsonResponse({
      success: true,
      account: {
        account_number: resolvedAccountNumber,
        account_name: accountName,
        bank_code: bankCode,
      },
      provider: "flutterwave",
    });
  } catch (error) {
    console.error(
      "resolve-bank-account error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});
