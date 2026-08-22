import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // ==========================================================
  // CORS
  // ==========================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  try {
    // ==========================================================
    // ENVIRONMENT
    // ==========================================================

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL"
      ) ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      ) ?? "";

    const anonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY"
      ) ?? "";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey
    ) {
      throw new Error(
        "Supabase environment variables are not configured."
      );
    }

    // ==========================================================
    // AUTHORIZATION
    // ==========================================================

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // USER CLIENT
    // ==========================================================

    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        }
      );

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // ADMIN CLIENT
    // ==========================================================

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken:
              false,

            persistSession:
              false,
          },
        }
      );

    // ==========================================================
    // REQUEST BODY
    // ==========================================================

    let body: any;

    try {
      body =
        await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Invalid request body.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const walletId =
      String(
        body?.wallet_id ??
          body?.walletId ??
          ""
      ).trim();

    const amount =
      Number(
        body?.amount
      );

    const narration =
      String(
        body?.narration ??
          "IyanjuPay transfer"
      ).trim();

    const idempotencyKey =
      String(
        body?.idempotency_key ??
          body?.idempotencyKey ??
          ""
      ).trim();

    // ==========================================================
    // WALLET ID VALIDATION
    // ==========================================================

    if (
      !/^[0-9]{8}$/.test(
        walletId
      )
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Invalid Wallet ID. Wallet ID must be exactly 8 digits.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // AMOUNT VALIDATION
    // ==========================================================

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Transfer amount must be greater than zero.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // TWO DECIMAL PLACES
    // ==========================================================

    const roundedAmount =
      Math.round(
        amount * 100
      ) / 100;

    if (
      roundedAmount !==
      amount
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Transfer amount cannot have more than 2 decimal places.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // FIND SENDER
    // ==========================================================

    const {
      data: senderWallet,
      error:
        senderWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, balance, held_balance, currency, status"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      senderWalletError
    ) {
      console.error(
        "Sender wallet lookup failed:",
        senderWalletError
      );

      throw senderWalletError;
    }

    if (
      !senderWallet
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Sender wallet could not be found.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // SENDER STATUS
    // ==========================================================

    if (
      senderWallet.status !==
      "active"
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Your wallet is not active.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // FIND RECIPIENT
    // ==========================================================

    const {
      data: recipientWallet,
      error:
        recipientWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, balance, held_balance, currency, status"
      )
      .eq(
        "wallet_id",
        walletId
      )
      .maybeSingle();

    if (
      recipientWalletError
    ) {
      console.error(
        "Recipient wallet lookup failed:",
        recipientWalletError
      );

      throw recipientWalletError;
    }

    if (
      !recipientWallet
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "IyanjuPay Wallet ID not found.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // SELF TRANSFER
    // ==========================================================

    if (
      recipientWallet.user_id ===
      user.id
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "You cannot transfer money to your own wallet.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // RECIPIENT STATUS
    // ==========================================================

    if (
      recipientWallet.status !==
      "active"
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Recipient wallet is not active.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // CURRENCY
    // ==========================================================

    if (
      senderWallet.currency !==
      recipientWallet.currency
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Sender and recipient wallets must use the same currency.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // CALL ATOMIC INTERNAL TRANSFER RPC
    // ==========================================================

    const {
      data,
      error,
    } = await admin.rpc(
      "execute_internal_transfer",
      {
        _sender_user_id:
          user.id,

        _recipient_wallet_id:
          walletId,

        _amount:
          roundedAmount,

        _narration:
          narration ||
          "IyanjuPay transfer",

        _idempotency_key:
          idempotencyKey ||
          null,
      }
    );

    if (error) {
      console.error(
        "Atomic internal transfer failed:",
        error
      );

      const message =
        error.message ||
        "Unable to complete IyanjuPay transfer.";

      const lowerMessage =
        message.toLowerCase();

      let status = 400;

      if (
        lowerMessage.includes(
          "not found"
        )
      ) {
        status = 404;
      }

      if (
        lowerMessage.includes(
          "not active"
        )
      ) {
        status = 403;
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: message,
        }),
        {
          status,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==========================================================
    // RPC RETURNS JSON
    // ==========================================================

    const result =
      data ?? {};

    // ==========================================================
    // SUCCESS
    // ==========================================================

    return new Response(
      JSON.stringify({
        success: true,

        transfer_type:
          "iyanjupay",

        status:
          "completed",

        reference:
          result.reference ??
          null,

        transaction_id:
          result.transaction_id ??
          null,

        credit_transaction_id:
          result.credit_transaction_id ??
          null,

        amount:
          Number(
            result.amount ??
              roundedAmount
          ),

        fee:
          0,

        total_charged:
          Number(
            result.total_charged ??
              roundedAmount
          ),

        recipient_wallet_id:
          walletId,

        message:
          result.message ??
          `₦${roundedAmount.toLocaleString()} sent successfully.`,
      }),
      {
        status: 200,

        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "iyanjuPay-transfer error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      }),
      {
        status: 500,

        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});
