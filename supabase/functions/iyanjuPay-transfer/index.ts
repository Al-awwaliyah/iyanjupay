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

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


// ============================================================
// SUPABASE CLIENT
// ============================================================
//
// Authenticated user client.
//
// IMPORTANT:
//
// This client uses the user's JWT.
//
// Therefore:
//
// auth.uid() = actual logged-in user
//
// Do NOT use service-role for the transfer RPC.
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
    },
  );
}


// ============================================================
// ADMIN CLIENT
// ============================================================
//
// Used ONLY for server-side notification creation.
//
// The service-role key NEVER goes to the frontend.
// ============================================================

const adminClient =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );


// ============================================================
// HELPERS
// ============================================================

function formatNaira(
  value: unknown,
): string {

  const amount =
    Number(value ?? 0);

  if (
    !Number.isFinite(amount)
  ) {
    return "₦0.00";
  }

  return `₦${amount.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}


function cleanString(
  value: unknown,
): string {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


// ============================================================
// CREATE TRANSACTION NOTIFICATIONS
// ============================================================
//
// IMPORTANT:
//
// Notification failure must NEVER cause the completed
// wallet transfer to fail.
//
// The actual financial transaction has already been handled
// by execute_internal_transfer.
//
// ============================================================

async function createTransferNotifications(
  data: any,
  senderUserId: string,
  recipientWalletId: string,
) {

  try {

    // ========================================================
    // 1. BASIC TRANSACTION DATA
    // ========================================================

    const transactionId =
      data?.transaction_id ??
      null;

    const recipientTransactionId =
      data?.credit_transaction_id ??
      data?.recipient_transaction_id ??
      null;

    const reference =
      cleanString(
        data?.reference,
      );

    const amount =
      Number(
        data?.amount ?? 0,
      );

    const fee =
      Number(
        data?.fee ?? 0,
      );

    const totalCharged =
      Number(
        data?.total_charged ??
        amount + fee,
      );

    const currency =
      cleanString(
        data?.currency,
      ) ||
      "NGN";

    const narration =
      cleanString(
        data?.narration,
      );


    // ========================================================
    // 2. SENDER INFORMATION
    // ========================================================

    const sender =
      data?.sender ??
      {};

    const senderName =
      cleanString(
        sender?.name ??
        sender?.full_name ??
        data?.sender_name,
      ) ||
      "IyanjuPay user";

    const senderPhone =
      cleanString(
        sender?.phone_number ??
        sender?.phone ??
        data?.sender_phone_number,
      );


    // ========================================================
    // 3. RECIPIENT INFORMATION
    // ========================================================

    const recipient =
      data?.recipient ??
      {};

    const recipientName =
      cleanString(
        data?.recipient_name ??
        recipient?.name ??
        recipient?.full_name,
      ) ||
      "IyanjuPay user";

    const recipientPhone =
      cleanString(
        recipient?.phone_number ??
        recipient?.phone ??
        data?.recipient_phone_number,
      );

    const walletId =
      cleanString(
        data?.recipient_wallet_id ??
        recipient?.wallet_id ??
        recipientWalletId,
      );


    // ========================================================
    // 4. FIND RECIPIENT USER
    // ========================================================
    //
    // The wallet ID belongs to the recipient wallet.
    //
    // We use the service-role client here because the sender
    // cannot necessarily read another user's wallet record
    // through RLS.
    //
    // ========================================================

    const {
      data: recipientWallet,
      error: recipientWalletError,
    } =
      await adminClient
        .from("wallets")
        .select("user_id")
        .eq(
          "wallet_id",
          walletId,
        )
        .maybeSingle();


    if (
      recipientWalletError
    ) {

      console.error(
        "Unable to find recipient wallet owner for notification:",
        {
          error:
            recipientWalletError,
          wallet_id:
            walletId,
          transaction_id:
            transactionId,
        },
      );

    }


    const recipientUserId =
      recipientWallet?.user_id ??
      null;


    // ========================================================
    // 5. SAFETY CHECK
    // ========================================================

    if (!transactionId) {

      console.error(
        "Cannot create transfer notifications: missing transaction_id",
        {
          reference,
          sender_user_id:
            senderUserId,
          recipient_wallet_id:
            walletId,
        },
      );

      return;
    }


    if (!recipientUserId) {

      console.error(
        "Cannot create recipient notification: recipient user not found",
        {
          reference,
          transaction_id:
            transactionId,
          recipient_wallet_id:
            walletId,
        },
      );

      /*
       * We still continue and create the sender notification.
       */
    }


    // ========================================================
    // 6. NOTIFICATION METADATA
    // ========================================================

    const baseMetadata = {
      transaction_type:
        "transfer",

      transaction_category:
        "wallet_transfer",

      provider:
        "iyanjupay",

      reference,

      amount,

      fee,

      total_charged:
        totalCharged,

      currency,

      narration,

      sender: {
        user_id:
          senderUserId,

        name:
          senderName,

        phone_number:
          senderPhone || null,
      },

      recipient: {
        user_id:
          recipientUserId,

        name:
          recipientName,

        phone_number:
          recipientPhone || null,

        wallet_id:
          walletId,
      },

      transaction_id:
        transactionId,

      recipient_transaction_id:
        recipientTransactionId,
    };


    // ========================================================
    // 7. SENDER NOTIFICATION
    // ========================================================

    const senderMessage =
      `You sent ${formatNaira(amount)} to ${recipientName}.`;

    const {
      error: senderNotificationError,
    } =
      await adminClient
        .from("notifications")
        .insert({
          user_id:
            senderUserId,

          transaction_id:
            transactionId,

          type:
            "transfer_sent",

          title:
            "Money sent",

          message:
            senderMessage,

          amount:
            amount,

          is_read:
            false,

          metadata: {
            ...baseMetadata,

            direction:
              "outgoing",
          },
        });


    if (
      senderNotificationError
    ) {

      console.error(
        "Failed to create sender transfer notification:",
        {
          error:
            senderNotificationError,

          user_id:
            senderUserId,

          transaction_id:
            transactionId,

          reference,
        },
      );

    } else {

      console.log(
        "Sender transfer notification created:",
        {
          user_id:
            senderUserId,

          transaction_id:
            transactionId,

          reference,
        },
      );

    }


    // ========================================================
    // 8. RECIPIENT NOTIFICATION
    // ========================================================

    if (
      recipientUserId
    ) {

      /*
       * Prefer the recipient transaction ID because the
       * recipient's notification should point to the credit
       * transaction in their history.
       *
       * Fall back to the sender transaction if the RPC does
       * not return a separate credit transaction ID.
       */

      const notificationTransactionId =
        recipientTransactionId ??
        transactionId;


      const recipientMessage =
        `You received ${formatNaira(amount)} from ${senderName}.`;


      const {
        error:
          recipientNotificationError,
      } =
        await adminClient
          .from("notifications")
          .insert({
            user_id:
              recipientUserId,

            transaction_id:
              notificationTransactionId,

            type:
              "transfer_received",

            title:
              "Money received",

            message:
              recipientMessage,

            amount:
              amount,

            is_read:
              false,

            metadata: {
              ...baseMetadata,

              direction:
                "incoming",

              recipient_user_id:
                recipientUserId,
            },
          });


      if (
        recipientNotificationError
      ) {

        console.error(
          "Failed to create recipient transfer notification:",
          {
            error:
              recipientNotificationError,

            recipient_user_id:
              recipientUserId,

            transaction_id:
              notificationTransactionId,

            reference,
          },
        );

      } else {

        console.log(
          "Recipient transfer notification created:",
          {
            recipient_user_id:
              recipientUserId,

            transaction_id:
              notificationTransactionId,

            reference,
          },
        );

      }

    }


    // ========================================================
    // 9. COMPLETE
    // ========================================================

    console.log(
      "IyanjuPay transfer notifications processed:",
      {
        transaction_id:
          transactionId,

        recipient_transaction_id:
          recipientTransactionId,

        sender_user_id:
          senderUserId,

        recipient_user_id:
          recipientUserId,

        reference,
      },
    );

  } catch (notificationError) {

    /*
     * VERY IMPORTANT:
     *
     * Never throw this error back to the transfer handler.
     *
     * The financial transaction has already succeeded.
     */

    console.error(
      "Unexpected notification error:",
      notificationError,
    );
  }
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
        headers:
          corsHeaders,
      },
    );
  }


  try {

    // ========================================================
    // 1. METHOD
    // ========================================================

    if (
      req.method !== "POST"
    ) {

      return json(
        {
          success: false,
          error:
            "Method not allowed",
        },
        405,
      );

    }


    // ========================================================
    // 2. AUTHENTICATION
    // ========================================================

    /*
     * getUser() validates the Supabase access token.
     */

    const user =
      await getUser(req);


    if (!user) {

      return json(
        {
          success: false,
          error:
            "Authentication required",
        },
        401,
      );

    }


    // ========================================================
    // 3. GET ACCESS TOKEN
    // ========================================================

    const authHeader =
      req.headers.get(
        "Authorization",
      );


    if (!authHeader) {

      return json(
        {
          success: false,
          error:
            "Authorization header is required",
        },
        401,
      );

    }


    const accessToken =
      authHeader
        .replace(
          /^Bearer\s+/i,
          "",
        )
        .trim();


    if (!accessToken) {

      return json(
        {
          success: false,
          error:
            "Invalid authorization token",
        },
        401,
      );

    }


    // ========================================================
    // 4. PARSE REQUEST
    // ========================================================

    let body: any;


    try {

      body =
        await req.json();

    } catch {

      return json(
        {
          success: false,
          error:
            "Invalid JSON request body",
        },
        400,
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
        "",
      ).trim();


    const rawAmount =
      body?.amount;


    const narration =
      body?.narration == null
        ? ""
        : String(
            body.narration,
          ).trim();


    const idempotencyKey =
      body?.idempotency_key == null
        ? null
        : String(
            body.idempotency_key,
          ).trim();


    // ========================================================
    // 6. VALIDATE WALLET ID
    // ========================================================

    if (
      !recipientWalletId
    ) {

      return json(
        {
          success: false,
          error:
            "Recipient wallet ID is required",
        },
        400,
      );

    }


    if (
      !/^\d{8}$/.test(
        recipientWalletId,
      )
    ) {

      return json(
        {
          success: false,
          error:
            "Recipient Wallet ID must be exactly 8 digits",
        },
        400,
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
        400,
      );

    }


    // ========================================================
    // 7A. DECIMAL VALIDATION
    // ========================================================

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
        400,
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
        400,
      );

    }


    // ========================================================
    // 9. CREATE AUTHENTICATED CLIENT
    // ========================================================

    const supabase =
      createUserClient(
        accessToken,
      );


    // ========================================================
    // 10. EXECUTE INTERNAL TRANSFER RPC
    // ========================================================

    /*
     * IMPORTANT:
     *
     * We are NOT changing the RPC.
     *
     * Existing financial logic remains untouched.
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
        },
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
        },
      );


      let message =
        error.message ||
        "Unable to process IyanjuPay transfer.";


      // ------------------------------------------------------
      // USER-FRIENDLY ERRORS
      // ------------------------------------------------------

      if (
        message.includes(
          "Recipient wallet not found",
        )
      ) {

        message =
          "Recipient Wallet ID was not found.";

      }


      if (
        message.includes(
          "Recipient wallet ID is required",
        )
      ) {

        message =
          "Recipient Wallet ID is required.";

      }


      if (
        message.includes(
          "Recipient Wallet ID must be exactly 8 digits",
        )
      ) {

        message =
          "Recipient Wallet ID must be exactly 8 digits.";

      }


      if (
        message.includes(
          "You cannot transfer money to yourself",
        )
      ) {

        message =
          "You cannot transfer money to yourself.";

      }


      if (
        message.includes(
          "Insufficient wallet balance",
        )
      ) {

        message =
          "Insufficient wallet balance.";

      }


      if (
        message.includes(
          "Sender wallet not found",
        )
      ) {

        message =
          "Your IyanjuPay wallet could not be found.";

      }


      if (
        message.includes(
          "Sender wallet is not active",
        )
      ) {

        message =
          "Your wallet is not active.";

      }


      if (
        message.includes(
          "Recipient wallet is not active",
        )
      ) {

        message =
          "The recipient wallet is not active.";

      }


      if (
        message.includes(
          "Only NGN wallet transfers are supported",
        )
      ) {

        message =
          "Only NGN wallet transfers are supported.";

      }


      if (
        message.includes(
          "Unauthorized transfer request",
        )
      ) {

        message =
          "Unauthorized transfer request.";

      }


      return json(
        {
          success: false,

          error:
            message,

          code:
            error.code ??
            null,
        },
        400,
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
        data,
      );


      return json(
        {
          success: false,

          error:
            data?.error ??
            data?.message ??
            "IyanjuPay transfer failed.",
        },
        400,
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
      },
    );


    // ========================================================
    // 14. CREATE NOTIFICATIONS
    // ========================================================
    //
    // IMPORTANT:
    //
    // If this request is being replayed through the
    // idempotency mechanism, do NOT create another pair of
    // notifications.
    //
    // ========================================================

    if (
      data.already_processed !== true
    ) {

      await createTransferNotifications(
        data,
        user.id,
        recipientWalletId,
      );

    } else {

      console.log(
        "Skipping transfer notifications because transaction was already processed:",
        {
          transaction_id:
            data.transaction_id,

          reference:
            data.reference,

          user_id:
            user.id,
        },
      );

    }


    // ========================================================
    // 15. RETURN FRONTEND RESPONSE
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
      200,
    );

  } catch (error) {

    console.error(
      "IyanjuPay transfer unexpected error:",
      error,
    );


    return json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unexpected transfer error.",
      },
      500,
    );

  }

});
