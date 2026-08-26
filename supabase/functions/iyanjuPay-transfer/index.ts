import {
  corsHeaders,
  json,
  getUser,
} from "../_shared/auth.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY")!;


// ============================================================
// SUPABASE CLIENT
// ============================================================
//
// IMPORTANT:
//
// This client uses the authenticated user's JWT.
//
// The RPC therefore sees:
//
// auth.uid() = actual logged-in user
//
// Do NOT use the service-role key for the RPC call.
// ============================================================

function createUserClient(
  accessToken: string
) {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    }
  );
}


// ============================================================
// MAIN
// ============================================================

Deno.serve(async (req) => {

  // ==========================================================
  // CORS
  // ==========================================================

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }


  try {

    // ========================================================
    // 1. METHOD
    // ========================================================

    if (req.method !== "POST") {
      return json(
        {
          success: false,
          error:
            "Method not allowed",
        },
        405
      );
    }


    // ========================================================
    // 2. AUTHENTICATION
    // ========================================================

    /*
     * getUser() must validate the user's
     * Supabase access token.
     */

    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error:
            "Authentication required",
        },
        401
      );
    }


    // ========================================================
    // 3. GET ACCESS TOKEN
    // ========================================================

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (!authHeader) {
      return json(
        {
          success: false,
          error:
            "Authorization header is required",
        },
        401
      );
    }

    const accessToken =
      authHeader.replace(
        /^Bearer\s+/i,
        ""
      ).trim();

    if (!accessToken) {
      return json(
        {
          success: false,
          error:
            "Invalid authorization token",
        },
        401
      );
    }


    // ========================================================
    // 4. PARSE REQUEST
    // ========================================================

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "Invalid JSON request body",
        },
        400
      );
    }


    // ========================================================
    // 5. REQUEST VALUES
    // ========================================================

    /*
     * Frontend sends:
     *
     * wallet_id
     * amount
     * narration
     * idempotency_key
     */

    const recipientWalletId =
      String(
        body?.wallet_id ??
        body?.recipient_wallet_id ??
        ""
      ).trim();


    const rawAmount =
      body?.amount;


    const narration =
      body?.narration == null
        ? ""
        : String(
            body.narration
          ).trim();


    const idempotencyKey =
      body?.idempotency_key == null
        ? null
        : String(
            body.idempotency_key
          ).trim();


    // ========================================================
    // 6. VALIDATE WALLET ID
    // ========================================================

    if (!recipientWalletId) {
      return json(
        {
          success: false,
          error:
            "Recipient wallet ID is required",
        },
        400
      );
    }

    if (
      !/^\d{8}$/.test(
        recipientWalletId
      )
    ) {
      return json(
        {
          success: false,
          error:
            "Recipient Wallet ID must be exactly 8 digits",
        },
        400
      );
    }


    // ========================================================
    // 7. VALIDATE AMOUNT
    // ========================================================

    const amount =
      typeof rawAmount === "number"
        ? rawAmount
        : Number(rawAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return json(
        {
          success: false,
          error:
            "Transfer amount must be greater than zero",
        },
        400
      );
    }


    /*
     * Prevent more than 2 decimal places.
     */

    if (
      Math.round(
        amount * 100
      ) !==
      Math.round(amount) * 100
    ) {

      /*
       * The check above would reject many valid
       * decimal amounts incorrectly.
       *
       * Use the string representation instead.
       */
    }

    const amountString =
      String(rawAmount);

    if (
      amountString.includes(".") &&
      amountString.split(".")[1].length > 2
    ) {
      return json(
        {
          success: false,
          error:
            "Transfer amount cannot have more than 2 decimal places",
        },
        400
      );
    }


    // ========================================================
    // 8. IDEMPOTENCY KEY
    // ========================================================

    if (
      idempotencyKey &&
      idempotencyKey.length > 200
    ) {
      return json(
        {
          success: false,
          error:
            "Idempotency key is too long",
        },
        400
      );
    }


    // ========================================================
    // 9. CREATE AUTHENTICATED CLIENT
    // ========================================================

    const supabase =
      createUserClient(
        accessToken
      );


    // ========================================================
    // 10. EXECUTE INTERNAL TRANSFER RPC
    // ========================================================

    /*
     * VERY IMPORTANT:
     *
     * The RPC parameter names must match
     * the SQL function exactly.
     *
     * Frontend:
     *
     * wallet_id
     *
     * becomes:
     *
     * _recipient_wallet_id
     *
     * and the authenticated user becomes:
     *
     * _sender_user_id
     */

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "execute_internal_transfer",
        {
          _sender_user_id:
            user.id,

          _recipient_wallet_id:
            recipientWalletId,

          _amount:
            amount,

          _narration:
            narration,

          _idempotency_key:
            idempotencyKey,
        }
      );


    // ========================================================
    // 11. RPC ERROR
    // ========================================================

    if (error) {

      console.error(
        "execute_internal_transfer RPC error:",
        {
          message:
            error.message,

          code:
            error.code,

          details:
            error.details,

          hint:
            error.hint,

          user_id:
            user.id,

          recipient_wallet_id:
            recipientWalletId,

          amount,
        }
      );


      /*
       * PostgreSQL errors normally arrive through
       * error.message.
       */

      let message =
        error.message ||
        "Unable to process IyanjuPay transfer.";


      /*
       * Convert common database errors into
       * user-friendly messages.
       */

      if (
        message.includes(
          "Recipient wallet not found"
        )
      ) {
        message =
          "Recipient Wallet ID was not found.";
      }

      if (
        message.includes(
          "Recipient wallet ID is required"
        )
      ) {
        message =
          "Recipient Wallet ID is required.";
      }

      if (
        message.includes(
          "Recipient Wallet ID must be exactly 8 digits"
        )
      ) {
        message =
          "Recipient Wallet ID must be exactly 8 digits.";
      }

      if (
        message.includes(
          "You cannot transfer money to yourself"
        )
      ) {
        message =
          "You cannot transfer money to yourself.";
      }

      if (
        message.includes(
          "Insufficient wallet balance"
        )
      ) {
        message =
          "Insufficient wallet balance.";
      }

      if (
        message.includes(
          "Sender wallet not found"
        )
      ) {
        message =
          "Your IyanjuPay wallet could not be found.";
      }

      if (
        message.includes(
          "Sender wallet is not active"
        )
      ) {
        message =
          "Your wallet is not active.";
      }

      if (
        message.includes(
          "Recipient wallet is not active"
        )
      ) {
        message =
          "The recipient wallet is not active.";
      }

      if (
        message.includes(
          "Only NGN wallet transfers are supported"
        )
      ) {
        message =
          "Only NGN wallet transfers are supported.";
      }

      if (
        message.includes(
          "Unauthorized transfer request"
        )
      ) {
        message =
          "Unauthorized transfer request.";
      }


      return json(
        {
          success: false,
          error: message,
          code:
            error.code ?? null,
        },
        400
      );
    }


    // ========================================================
    // 12. INVALID RPC RESPONSE
    // ========================================================

    if (
      !data ||
      data.success !== true
    ) {

      console.error(
        "Invalid internal transfer RPC response:",
        data
      );

      return json(
        {
          success: false,
          error:
            data?.error ||
            data?.message ||
            "IyanjuPay transfer failed.",
        },
        400
      );
    }


    // ========================================================
    // 13. SUCCESS
    // ========================================================

    console.log(
      "IyanjuPay transfer successful:",
      {
        user_id:
          user.id,

        transaction_id:
          data.transaction_id,

        credit_transaction_id:
          data.credit_transaction_id,

        reference:
          data.reference,

        amount:
          data.amount,

        fee:
          data.fee,

        total_charged:
          data.total_charged,

        recipient_wallet_id:
          data.recipient_wallet_id,

        recipient_name:
          data.recipient_name,

        already_processed:
          data.already_processed,
      }
    );


    // ========================================================
    // 14. RETURN FRONTEND RESPONSE
    // ========================================================

    return json(
      {
        success: true,

        already_processed:
          data.already_processed ??
          false,

        message:
          data.already_processed
            ? "This transfer has already been processed."
            : "IyanjuPay transfer successful.",

        transaction_id:
          data.transaction_id,

        credit_transaction_id:
          data.credit_transaction_id ??
          data.recipient_transaction_id ??
          null,

        reference:
          data.reference,

        status:
          data.status,

        transaction_type:
          data.transaction_type,

        transaction_category:
          data.transaction_category,

        direction:
          data.direction,

        amount:
          data.amount,

        fee:
          data.fee,

        total_charged:
          data.total_charged,

        currency:
          data.currency,

        narration:
          data.narration,

        sender:
          data.sender,

        recipient:
          data.recipient,

        recipient_wallet_id:
          data.recipient_wallet_id ??
          data.recipient?.wallet_id ??
          recipientWalletId,

        recipient_name:
          data.recipient_name ??
          data.recipient?.name ??
          null,

        receipt:
          data.receipt,
      },
      200
    );

  } catch (error) {

    console.error(
      "IyanjuPay transfer unexpected error:",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected transfer error.",
      },
      500
    );
  }

});
