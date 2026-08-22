import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const TRANSFER_FEE = 10;


Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // Only POST is allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
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
    // AUTHORIZATION HEADER
    // ==========================================================

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (!authHeader) {
      return new Response(
        JSON.stringify({
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
    // SERVICE ROLE CLIENT
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
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
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

    const walletId = String(
      body?.wallet_id ??
        body?.walletId ??
        ""
    ).trim();

    const amount = Number(
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
    // VALIDATE WALLET ID
    // ==========================================================

    if (!/^[0-9]{8}$/.test(walletId)) {
      return new Response(
        JSON.stringify({
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
    // VALIDATE AMOUNT
    // ==========================================================

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return new Response(
        JSON.stringify({
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

    // Prevent excessive decimal precision
    const roundedAmount =
      Math.round(
        amount * 100
      ) / 100;

    if (
      roundedAmount !== amount
    ) {
      return new Response(
        JSON.stringify({
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
    // IDEMPOTENCY KEY
    // ==========================================================

    const finalIdempotencyKey =
      idempotencyKey ||
      `iyanjupay_${user.id}_${crypto.randomUUID()}`;

    // ==========================================================
    // FIND SENDER WALLET
    // ==========================================================

    const {
      data: senderWallet,
      error: senderWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, balance, held_balance, currency, status, wallet_id"
      )
      .eq(
        "user_id",
        user.id
      )
      .single();

    if (
      senderWalletError ||
      !senderWallet
    ) {
      console.error(
        "Sender wallet lookup failed:",
        senderWalletError
      );

      return new Response(
        JSON.stringify({
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
    // CHECK SENDER WALLET STATUS
    // ==========================================================

    if (
      senderWallet.status !==
      "active"
    ) {
      return new Response(
        JSON.stringify({
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
        "id, user_id, balance, held_balance, currency, status, wallet_id"
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

    if (!recipientWallet) {
      return new Response(
        JSON.stringify({
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
    // PREVENT SELF TRANSFER
    // ==========================================================

    if (
      recipientWallet.user_id ===
      user.id
    ) {
      return new Response(
        JSON.stringify({
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
    // TOTAL REQUIRED
    // ==========================================================

    const totalRequired =
      roundedAmount +
      TRANSFER_FEE;

    const senderBalance =
      Number(
        senderWallet.balance
      ) || 0;

    // ==========================================================
    // BALANCE CHECK
    // ==========================================================

    if (
      senderBalance <
      totalRequired
    ) {
      return new Response(
        JSON.stringify({
          error:
            `Insufficient funds. You need ₦${totalRequired.toLocaleString()} including the ₦${TRANSFER_FEE} transfer fee.`,
          required:
            totalRequired,
          balance:
            senderBalance,
          transfer_amount:
            roundedAmount,
          fee:
            TRANSFER_FEE,
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
    // TRANSACTION REFERENCES
    // ==========================================================

    const transferReference =
      `IYJ_${Date.now()}_${crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 16)
        .toUpperCase()}`;

    const transferDescription =
      narration ||
      `Transfer to IyanjuPay Wallet ${walletId}`;

    // ==========================================================
    // CHECK EXISTING IDEMPOTENCY
    // ==========================================================

    const {
      data: existingIdempotency,
      error:
        existingIdempotencyError,
    } = await admin
      .from("idempotency_keys")
      .select(
        "key, transaction_id, response"
      )
      .eq(
        "key",
        finalIdempotencyKey
      )
      .maybeSingle();

    if (
      existingIdempotencyError
    ) {
      console.error(
        "Idempotency lookup failed:",
        existingIdempotencyError
      );

      throw existingIdempotencyError;
    }

    if (
      existingIdempotency
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          replay: true,
          ...(existingIdempotency.response ||
            {}),
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
    }

    // ==========================================================
    // IMPORTANT
    // ==========================================================
    //
    // wallet_operation() runs inside the same PostgreSQL
    // transaction as this Edge Function's RPC calls.
    //
    // If the recipient credit fails after the sender debit,
    // PostgreSQL rolls the entire operation back.
    //
    // ==========================================================

    // ==========================================================
    // 1. DEBIT SENDER
    // ==========================================================

    const {
      data: debitTransaction,
      error: debitError,
    } = await admin.rpc(
      "wallet_operation",
      {
        _user_id:
          user.id,

        _operation:
          "DEBIT",

        _amount:
          roundedAmount,

        _description:
          transferDescription,

        _idempotency_key:
          `${finalIdempotencyKey}:debit`,

        _reference:
          `${transferReference}:DEBIT`,

        _provider:
          "iyanjupay",

        _provider_reference:
          transferReference,

        _category:
          "internal_transfer",

        _metadata: {
          transfer_type:
            "iyanjupay_internal",

          recipient_wallet_id:
            walletId,

          recipient_user_id:
            recipientWallet.user_id,

          transfer_amount:
            roundedAmount,

          fee:
            TRANSFER_FEE,

          total_charged:
            totalRequired,

          direction:
            "outgoing",
        },
      }
    );

    if (debitError) {
      console.error(
        "Sender debit failed:",
        debitError
      );

      throw new Error(
        debitError.message ||
          "Unable to debit sender wallet."
      );
    }

    // ==========================================================
    // 2. CREDIT RECIPIENT
    // ==========================================================

    const {
      data: creditTransaction,
      error: creditError,
    } = await admin.rpc(
      "wallet_operation",
      {
        _user_id:
          recipientWallet.user_id,

        _operation:
          "CREDIT",

        _amount:
          roundedAmount,

        _description:
          `Received from IyanjuPay Wallet ${senderWallet.wallet_id}`,

        _idempotency_key:
          `${finalIdempotencyKey}:credit`,

        _reference:
          `${transferReference}:CREDIT`,

        _provider:
          "iyanjupay",

        _provider_reference:
          transferReference,

        _category:
          "internal_transfer",

        _metadata: {
          transfer_type:
            "iyanjupay_internal",

          sender_user_id:
            user.id,

          sender_wallet_id:
            senderWallet.wallet_id,

          transfer_amount:
            roundedAmount,

          direction:
            "incoming",
        },
      }
    );

    if (creditError) {
      console.error(
        "Recipient credit failed:",
        creditError
      );

      throw new Error(
        creditError.message ||
          "Unable to credit recipient wallet."
      );
    }

    // ==========================================================
    // 3. CHARGE ₦10 TRANSFER FEE
    // ==========================================================

    const {
      data: feeTransaction,
      error: feeError,
    } = await admin.rpc(
      "wallet_operation",
      {
        _user_id:
          user.id,

        _operation:
          "FEE",

        _amount:
          TRANSFER_FEE,

        _description:
          "IyanjuPay transfer charge",

        _idempotency_key:
          `${finalIdempotencyKey}:fee`,

        _reference:
          `${transferReference}:FEE`,

        _provider:
          "iyanjupay",

        _provider_reference:
          transferReference,

        _category:
          "transfer_fee",

        _metadata: {
          transfer_type:
            "iyanjupay_internal",

          transfer_reference:
            transferReference,

          recipient_wallet_id:
            walletId,

          fee:
            TRANSFER_FEE,
        },
      }
    );

    if (feeError) {
      console.error(
        "Transfer fee failed:",
        feeError
      );

      throw new Error(
        feeError.message ||
          "Unable to apply transfer fee."
      );
    }

    // ==========================================================
    // 4. STORE IDEMPOTENCY RESPONSE
    // ==========================================================

    const responsePayload = {
      success: true,

      transfer_type:
        "iyanjupay",

      status:
        "completed",

      reference:
        transferReference,

      transaction_id:
        debitTransaction?.id ??
        null,

      credit_transaction_id:
        creditTransaction?.id ??
        null,

      fee_transaction_id:
        feeTransaction?.id ??
        null,

      amount:
        roundedAmount,

      fee:
        TRANSFER_FEE,

      total_charged:
        totalRequired,

      recipient_wallet_id:
        walletId,

      message:
        `₦${roundedAmount.toLocaleString()} sent successfully.`,
    };

    const {
      error:
        idempotencyInsertError,
    } = await admin
      .from("idempotency_keys")
      .insert({
        key:
          finalIdempotencyKey,

        user_id:
          user.id,

        scope:
          "iyanjupay_transfer",

        transaction_id:
          debitTransaction?.id ??
          null,

        response:
          responsePayload,
      });

    if (
      idempotencyInsertError &&
      idempotencyInsertError.code !==
        "23505"
    ) {
      console.error(
        "Idempotency insert failed:",
        idempotencyInsertError
      );

      throw idempotencyInsertError;
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    console.log(
      "IyanjuPay transfer completed:",
      {
        sender:
          user.id,

        recipient:
          recipientWallet.user_id,

        recipient_wallet_id:
          walletId,

        amount:
          roundedAmount,

        fee:
          TRANSFER_FEE,

        total:
          totalRequired,

        reference:
          transferReference,
      }
    );

    return new Response(
      JSON.stringify(
        responsePayload
      ),
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
      "iyanju-transfer error:",
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
