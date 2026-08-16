import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  // ============================================================
  // 1. CORS PREFLIGHT
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ============================================================
  // 2. ONLY GET/POST
  // ============================================================

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    // ============================================================
    // 3. ENVIRONMENT
    // ============================================================

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

    // ============================================================
    // 4. AUTHENTICATE USER
    // ============================================================

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

    // ============================================================
    // 5. ADMIN CLIENT
    // ============================================================

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // ============================================================
    // 6. FETCH ALL FLUTTERWAVE NIGERIAN BANKS
    // ============================================================

    console.log(
      `Fetching Flutterwave banks for user ${user.id}`
    );

    const flutterwaveResponse = await fetch(
      "https://api.flutterwave.com/v3/banks/NG",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${flutterwaveSecret}`,
          Accept: "application/json",
        },
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
      "Flutterwave banks response:",
      JSON.stringify(flutterwaveData)
    );

    // ============================================================
    // 7. HANDLE FLUTTERWAVE ERROR
    // ============================================================

    if (!flutterwaveResponse.ok) {
      console.error(
        "Flutterwave banks request failed:",
        JSON.stringify(flutterwaveData)
      );

      return jsonResponse(
        {
          success: false,
          error:
            flutterwaveData?.message ??
            "Unable to load Nigerian banks",
          provider: "flutterwave",
        },
        400
      );
    }

    if (
      flutterwaveData?.status !== "success" ||
      !Array.isArray(flutterwaveData?.data)
    ) {
      console.error(
        "Invalid Flutterwave banks response"
      );

      return jsonResponse(
        {
          success: false,
          error:
            flutterwaveData?.message ??
            "Flutterwave did not return a valid bank list",
        },
        400
      );
    }

    // ============================================================
    // 8. NORMALIZE BANK LIST
    // ============================================================

    const banks = flutterwaveData.data
      .map((bank: any) => ({
        id: bank.id ?? null,
        code: String(
          bank.code ??
            bank.bank_code ??
            ""
        ).trim(),
        name: String(
          bank.name ??
            bank.bank_name ??
            ""
        ).trim(),
      }))
      .filter(
        (bank: any) =>
          bank.code &&
          bank.name
      );

    // Remove duplicate bank codes
    const uniqueBanks = Array.from(
      new Map(
        banks.map((bank: any) => [
          bank.code,
          bank,
        ])
      ).values()
    );

    // Sort alphabetically
    uniqueBanks.sort(
      (a: any, b: any) =>
        a.name.localeCompare(b.name)
    );

    console.log(
      `Loaded ${uniqueBanks.length} Nigerian banks`
    );

    // ============================================================
    // 9. OPTIONAL CACHE IN DATABASE
    // ============================================================

    /*
      We are NOT inserting banks into your database here.

      Flutterwave remains the source of truth.

      Your UI receives the current Nigerian bank list
      directly from Flutterwave through this Edge Function.
    */

    // ============================================================
    // 10. RETURN BANKS
    // ============================================================

    return jsonResponse({
      success: true,
      provider: "flutterwave",
      country: "NG",
      count: uniqueBanks.length,
      banks: uniqueBanks,
    });
  } catch (error) {
    console.error(
      "flutterwave-banks error:",
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
