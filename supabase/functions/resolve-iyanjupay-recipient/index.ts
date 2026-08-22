import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const jsonResponse = (
  body: Record<string, unknown>,
  status = 200
) => {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed.",
      },
      405
    );
  }

  try {
    // ==========================================================
    // ENVIRONMENT
    // ==========================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      ) ?? "";

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Supabase environment variables are not configured.",
        },
        500
      );
    }

    // ==========================================================
    // AUTHORIZATION
    // ==========================================================

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized.",
        },
        401
      );
    }

    // ==========================================================
    // USER CLIENT
    // ==========================================================

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: {
        user,
      },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized.",
        },
        401
      );
    }

    // ==========================================================
    // ADMIN CLIENT
    // ==========================================================

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ==========================================================
    // REQUEST BODY
    // ==========================================================

    let body: any;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid request body.",
        },
        400
      );
    }

    const walletId = String(
      body?.wallet_id ??
        body?.walletId ??
        ""
    ).trim();

    // ==========================================================
    // VALIDATE WALLET ID
    // ==========================================================

    if (!/^\d{8}$/.test(walletId)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Wallet ID must be exactly 8 digits.",
        },
        400
      );
    }

    // ==========================================================
    // FIND RECIPIENT WALLET
    // ==========================================================

    const {
      data: recipientWallet,
      error: recipientWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, currency, status"
      )
      .eq("wallet_id", walletId)
      .maybeSingle();

    if (recipientWalletError) {
      console.error(
        "Recipient wallet lookup failed:",
        recipientWalletError
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Unable to verify Wallet ID.",
        },
        500
      );
    }

    if (!recipientWallet) {
      return jsonResponse(
        {
          success: false,
          error:
            "IyanjuPay Wallet ID not found.",
        },
        404
      );
    }

    // ==========================================================
    // PREVENT SELF TRANSFER
    // ==========================================================

    if (
      recipientWallet.user_id === user.id
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "You cannot transfer money to your own wallet.",
        },
        400
      );
    }

    // ==========================================================
    // RECIPIENT WALLET STATUS
    // ==========================================================

    if (
      recipientWallet.status !== "active"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Recipient wallet is not active.",
        },
        400
      );
    }

    // ==========================================================
    // FIND RECIPIENT PROFILE
    // ==========================================================

    const {
      data: recipientProfile,
      error: profileError,
    } = await admin
      .from("profiles")
      .select(
        "id, full_name, nickname"
      )
      .eq(
        "id",
        recipientWallet.user_id
      )
      .maybeSingle();

    if (profileError) {
      console.error(
        "Recipient profile lookup failed:",
        profileError
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Unable to retrieve recipient information.",
        },
        500
      );
    }

    if (!recipientProfile) {
      return jsonResponse(
        {
          success: false,
          error:
            "Recipient profile could not be found.",
        },
        404
      );
    }

    // ==========================================================
    // RECIPIENT NAME
    // ==========================================================

    const fullName =
      String(
        recipientProfile.full_name ?? ""
      ).trim();

    const nickname =
      String(
        recipientProfile.nickname ?? ""
      ).trim();

    const displayName =
      fullName ||
      nickname;

    if (!displayName) {
      return jsonResponse(
        {
          success: false,
          error:
            "Recipient name is not available.",
        },
        400
      );
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    return jsonResponse({
      success: true,

      recipient: {
        wallet_id:
          recipientWallet.wallet_id,

        name:
          displayName,

        full_name:
          fullName || null,

        nickname:
          nickname || null,
      },
    });
  } catch (error) {
    console.error(
      "resolve-iyanjupay-recipient error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500
    );
  }
});
