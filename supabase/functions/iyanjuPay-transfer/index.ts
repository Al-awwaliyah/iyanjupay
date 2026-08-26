import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * IyanjuPay — Internal Wallet Transfer
 * ============================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ELECTRONIC_FEE = 50;
const ELECTRONIC_FEE_THRESHOLD = 10000;

/**
 * ============================================================
 * RESPONSE HELPER
 * ============================================================
 */
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

/**
 * ============================================================
 * MASK WALLET ID
 * ============================================================
 */
function maskWalletId(walletId: string) {
  const value = String(walletId ?? "");

  if (value.length <= 4) {
    return value;
  }

  return `xxxx${value.slice(-4)}`;
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */
Deno.serve(async (req) => {
  /**
   * ----------------------------------------------------------
   * CORS
   * ----------------------------------------------------------
   */
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  /**
   * ----------------------------------------------------------
   * METHOD
   * ----------------------------------------------------------
   */
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
    /**
     * ========================================================
     * SUPABASE ENVIRONMENT
     * ========================================================
     */
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "Missing Supabase environment variables.",
      );

      return response(
        {
          success: false,
          error:
            "Supabase environment variables are not configured.",
        },
        500,
      );
    }

    /**
     * ========================================================
     * AUTHENTICATION
     * ========================================================
     *
     * IMPORTANT:
     *
     * We explicitly read the Authorization header and extract
     * the Bearer JWT.
     *
     * This avoids relying on a second anon-key client to
     * propagate the authorization state.
     */
    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      console.error(
        "IyanjuPay transfer: Authorization header missing.",
      );

      return response(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    const tokenMatch =
      authHeader.match(
        /^Bearer\s+(.+)$/i,
      );

    if (!tokenMatch) {
      console.error(
        "IyanjuPay transfer: Invalid Authorization header.",
      );

      return response(
        {
          success: false,
          error: "Invalid authentication token.",
        },
        401,
      );
    }

    const accessToken =
      tokenMatch[1].trim();

    if (!accessToken) {
      return response(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    /**
     * ========================================================
     * ADMIN CLIENT
     * ========================================================
     */
    const admin =
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

    /**
     * ========================================================
     * VALIDATE AUTHENTICATED USER
     * ========================================================
     *
     * We explicitly pass the JWT to getUser().
     */
    const {
      data: authData,
      error: authError,
    } =
      await admin.auth.getUser(
        accessToken,
      );

    if (authError) {
      console.error(
        "IyanjuPay transfer authentication failed:",
        authError,
      );

      return response(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    const user =
      authData?.user;

    if (!user) {
      console.error(
        "IyanjuPay transfer: authenticated user not found.",
      );

      return response(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    console.log(
      "IyanjuPay transfer authenticated user:",
      user.id,
    );

    /**
     * ========================================================
     * PARSE REQUEST BODY
     * ========================================================
     */
    let body: any;

    try {
      body = await req.json();
    } catch {
      return response(
        {
          success: false,
          error: "Invalid request body.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * REQUEST VALUES
     * ========================================================
     */
    const walletId =
      String(
        body?.wallet_id ??
          body?.walletId ??
          "",
      ).trim();

    const amount =
      Math.round(
        Number(body?.amount) * 100,
      ) / 100;

    const narration =
      String(
        body?.narration ??
          "IyanjuPay transfer",
      ).trim();

    const idempotencyKey =
      String(
        body?.idempotency_key ??
          body?.idempotencyKey ??
          "",
      ).trim();

    /**
     * ========================================================
     * VALIDATE WALLET ID
     * ========================================================
     */
    if (!/^\d{8}$/.test(walletId)) {
      return response(
        {
          success: false,
          error:
            "Invalid Wallet ID. Wallet ID must be exactly 8 digits.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * VALIDATE AMOUNT
     * ========================================================
     */
    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return response(
        {
          success: false,
          error:
            "Transfer amount must be greater than zero.",
        },
        400,
      );
    }

    if (
      Math.round(amount * 100) !==
      amount * 100
    ) {
      return response(
        {
          success: false,
          error:
            "Transfer amount cannot have more than 2 decimal places.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * FIND SENDER WALLET
     * ========================================================
     */
    const {
      data: senderWallet,
      error: senderWalletError,
    } = await admin
      .from("wallets")
      .select(
        `
        id,
        user_id,
        wallet_id,
        balance,
        held_balance,
        currency,
        status
        `,
      )
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

    if (senderWalletError) {
      console.error(
        "Sender wallet lookup failed:",
        senderWalletError,
      );

      throw senderWalletError;
    }

    if (!senderWallet) {
      return response(
        {
          success: false,
          error:
            "Sender wallet could not be found.",
        },
        404,
      );
    }

    /**
     * ========================================================
     * SENDER WALLET STATUS
     * ========================================================
     */
    if (
      senderWallet.status !==
      "active"
    ) {
      return response(
        {
          success: false,
          error:
            "Your wallet is not active.",
        },
        403,
      );
    }

    /**
     * ========================================================
     * FIND RECIPIENT WALLET
     * ========================================================
     */
    const {
      data: recipientWallet,
      error: recipientWalletError,
    } = await admin
      .from("wallets")
      .select(
        `
        id,
        user_id,
        wallet_id,
        balance,
        held_balance,
        currency,
        status
        `,
      )
      .eq(
        "wallet_id",
        walletId,
      )
      .maybeSingle();

    if (recipientWalletError) {
      console.error(
        "Recipient wallet lookup failed:",
        recipientWalletError,
      );

      throw recipientWalletError;
    }

    if (!recipientWallet) {
      return response(
        {
          success: false,
          error:
            "IyanjuPay Wallet ID not found.",
        },
        404,
      );
    }

    /**
     * ========================================================
     * PREVENT SELF TRANSFER
     * ========================================================
     */
    if (
      recipientWallet.user_id ===
      user.id
    ) {
      return response(
        {
          success: false,
          error:
            "You cannot transfer money to your own wallet.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * RECIPIENT STATUS
     * ========================================================
     */
    if (
      recipientWallet.status !==
      "active"
    ) {
      return response(
        {
          success: false,
          error:
            "Recipient wallet is not active.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * CURRENCY
     * ========================================================
     */
    if (
      senderWallet.currency !==
      recipientWallet.currency
    ) {
      return response(
        {
          success: false,
          error:
            "Sender and recipient wallets must use the same currency.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * GET SENDER / RECIPIENT NAMES
     * ========================================================
     */
    const {
      data: senderProfile,
    } = await admin
      .from("profiles")
      .select("full_name")
      .eq(
        "id",
        user.id,
      )
      .maybeSingle();

    const {
      data: recipientProfile,
    } = await admin
      .from("profiles")
      .select("full_name")
      .eq(
        "id",
        recipientWallet.user_id,
      )
      .maybeSingle();

    const senderName =
      String(
        senderProfile?.full_name ??
          "IyanjuPay User",
      ).trim();

    const recipientName =
      String(
        recipientProfile?.full_name ??
          "IyanjuPay User",
      ).trim();

    /**
     * ========================================================
     * ELECTRONIC FEE
     * ========================================================
     *
     * IyanjuPay-to-IyanjuPay:
     *
     * Base transfer fee = ₦0
     *
     * Electronic fee:
     *   < ₦10,000  = ₦0
     *   >= ₦10,000 = ₦50
     *
     * The electronic fee is charged AFTER the internal
     * transfer succeeds.
     */
    const electronicFee =
      amount >=
      ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;

    const totalCharged =
      amount +
      electronicFee;

    /**
     * ========================================================
     * RESERVE KYC DAILY LIMIT
     * ========================================================
     */
    const {
      data: kycReservation,
      error: kycReservationError,
    } = await admin.rpc(
      "reserve_kyc_daily_transfer",
      {
        _user_id: user.id,
        _amount: amount,
      },
    );

    if (kycReservationError) {
      console.error(
        "KYC reservation failed:",
        kycReservationError,
      );

      return response(
        {
          success: false,
          stage: "kyc_limit",
          error:
            "Unable to reserve your daily transfer limit. Please try again.",
        },
        503,
      );
    }

    if (
      !kycReservation?.success ||
      !kycReservation?.allowed
    ) {
      return response(
        {
          success: false,
          stage: "kyc_limit",
          error:
            kycReservation?.error ??
            "Daily transfer limit exceeded.",
          kyc_level:
            kycReservation?.kyc_level ??
            null,
          daily_limit:
            kycReservation?.daily_limit ??
            null,
          remaining:
            kycReservation?.remaining ??
            null,
          requested_amount:
            amount,
          currency: "NGN",
        },
        400,
      );
    }

    let kycReservationActive = true;

    /**
     * ========================================================
     * RELEASE KYC RESERVATION
     * ========================================================
     */
    const releaseKycReservation =
      async () => {
        if (!kycReservationActive) {
          return true;
        }

        const {
          data,
          error,
        } = await admin.rpc(
          "release_kyc_daily_transfer",
          {
            _user_id: user.id,
            _amount: amount,
          },
        );

        if (
          error ||
          !data?.success
        ) {
          console.error(
            "KYC release failed:",
            error || data,
          );

          return false;
        }

        kycReservationActive =
          false;

        return true;
      };

    /**
     * ========================================================
     * ATOMIC INTERNAL TRANSFER
     * ========================================================
     */
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
          amount,

        _narration:
          narration ||
          "IyanjuPay transfer",

        _idempotency_key:
          idempotencyKey ||
          null,
      },
    );

    if (error) {
      await releaseKycReservation();

      console.error(
        "Internal transfer RPC failed:",
        error,
      );

      return response(
        {
          success: false,
          stage:
            "internal_transfer",
          error:
            error.message ||
            "Unable to complete IyanjuPay transfer.",
        },
        400,
      );
    }

    const result =
      data ?? {};

    const transactionId =
      result.transaction_id ??
      null;

    /**
     * ========================================================
     * COMPLETE KYC LIMIT
     * ========================================================
     */
    const {
      data: kycCompletion,
      error: kycCompletionError,
    } = await admin.rpc(
      "complete_kyc_daily_transfer",
      {
        _user_id: user.id,
        _amount: amount,
      },
    );

    if (
      kycCompletionError ||
      !kycCompletion?.success
    ) {
      console.error(
        "KYC completion failed:",
        kycCompletionError ||
          kycCompletion,
      );

      /**
       * Transfer already succeeded.
       *
       * Do NOT reverse the successful wallet transfer.
       */
      await admin
        .from("transactions")
        .update({
          status: "successful",
          metadata: {
            history_version: 1,

            transaction_type:
              "wallet_transfer",

            transaction_category:
              "transfer",

            direction: "DEBIT",

            display_title:
              `Transfer to ${recipientName}`,

            counterparty_type:
              "iyanjupay_wallet",

            counterparty_name:
              recipientName,

            counterparty_wallet_id:
              walletId,

            counterparty_wallet_masked:
              maskWalletId(walletId),

            sender_name:
              senderName,

            beneficiary_name:
              recipientName,

            narration,

            transfer_amount:
              amount,

            iyanjupay_fee:
              0,

            electronic_fee:
              electronicFee,

            total_charged:
              totalCharged,

            currency:
              senderWallet.currency,

            status:
              "successful",

            reference:
              result.reference ??
              null,

            transaction_id:
              transactionId,

            history_amount:
              totalCharged,

            history_sign:
              "-",

            history_amount_display:
              `-₦${totalCharged.toLocaleString(
                "en-NG",
                {
                  minimumFractionDigits:
                    2,
                  maximumFractionDigits:
                    2,
                },
              )}`,

            kyc_status:
              "completion_pending",

            kyc_limit_completed:
              false,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      kycReservationActive =
        false;

      return response({
        success: true,

        transfer_type:
          "iyanjupay",

        status:
          "completed",

        kyc_status:
          "completion_pending",

        transaction_id:
          transactionId,

        reference:
          result.reference ??
          null,

        amount,

        fee: 0,

        electronic_fee:
          electronicFee,

        total_charged:
          totalCharged,

        recipient_wallet_id:
          walletId,

        recipient_name:
          recipientName,

        message:
          `₦${amount.toLocaleString(
            "en-NG",
          )} sent successfully.`,
      });
    }

    kycReservationActive =
      false;

    /**
     * ========================================================
     * CHARGE ELECTRONIC FEE
     * ========================================================
     */
    let electronicFeeCharged =
      false;

    let electronicFeePending =
      false;

    let electronicFeeError:
      string | null = null;

    if (electronicFee > 0) {
      const feeKey =
        `ELECTRONIC_FEE_${transactionId}`;

      const {
        data: feeResult,
        error: feeError,
      } = await admin.rpc(
        "wallet_operation",
        {
          _user_id:
            user.id,

          _operation:
            "DEBIT",

          _amount:
            electronicFee,

          _description:
            `Electronic transfer fee for IyanjuPay wallet transfer of ₦${amount.toLocaleString(
              "en-NG",
            )}`,

          _idempotency_key:
            feeKey,

          _reference:
            `ELECTRONIC_FEE_${transactionId}`,

          _provider:
            "iyanjupay",

          _category:
            "electronic_transfer_fee",

          _metadata: {
            original_transaction_id:
              transactionId,

            transfer_amount:
              amount,

            electronic_fee:
              electronicFee,

            currency:
              senderWallet.currency,
          },
        },
      );

      if (
        feeError ||
        !feeResult
      ) {
        electronicFeePending =
          true;

        electronicFeeError =
          feeError?.message ??
          "Electronic transfer fee could not be charged.";

        console.error(
          "Electronic fee debit failed:",
          feeError ||
            feeResult,
        );
      } else {
        electronicFeeCharged =
          true;
      }
    }

    /**
     * ========================================================
     * FINAL AMOUNT
     * ========================================================
     */
    const finalFee =
      electronicFeeCharged
        ? electronicFee
        : 0;

    const finalTotal =
      amount +
      finalFee;

    const finalReference =
      result.reference ??
      null;

    /**
     * ========================================================
     * UPDATE TRANSACTION HISTORY
     * ========================================================
     */
    const {
      error: transactionUpdateError,
    } = await admin
      .from("transactions")
      .update({
        status:
          "successful",

        metadata: {
          history_version: 1,

          transaction_type:
            "wallet_transfer",

          transaction_category:
            "transfer",

          direction:
            "DEBIT",

          display_title:
            `Transfer to ${recipientName}`,

          counterparty_type:
            "iyanjupay_wallet",

          counterparty_name:
            recipientName,

          counterparty_wallet_id:
            walletId,

          counterparty_wallet_masked:
            maskWalletId(walletId),

          sender_name:
            senderName,

          beneficiary_name:
            recipientName,

          narration,

          transfer_amount:
            amount,

          iyanjupay_fee:
            0,

          electronic_fee:
            electronicFee,

          electronic_fee_charged:
            electronicFeeCharged,

          electronic_fee_pending:
            electronicFeePending,

          electronic_fee_error:
            electronicFeeError,

          total_charged:
            finalTotal,

          currency:
            senderWallet.currency,

          status:
            "successful",

          reference:
            finalReference,

          transaction_id:
            transactionId,

          history_amount:
            finalTotal,

          history_sign:
            "-",

          history_amount_display:
            `-₦${finalTotal.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits:
                  2,
                maximumFractionDigits:
                  2,
              },
            )}`,

          kyc_limit_completed:
            true,

          kyc_completed_amount:
            amount,

          kyc_completed_at:
            new Date().toISOString(),
        },
      })
      .eq(
        "id",
        transactionId,
      );

    if (transactionUpdateError) {
      console.error(
        "Transaction metadata update failed:",
        transactionUpdateError,
      );
    }

    /**
     * ========================================================
     * SUCCESS
     * ========================================================
     */
    return response({
      success: true,

      transfer_type:
        "iyanjupay",

      status:
        "completed",

      reference:
        finalReference,

      transaction_id:
        transactionId,

      amount,

      fee: 0,

      electronic_fee:
        electronicFee,

      electronic_fee_charged:
        electronicFeeCharged,

      electronic_fee_pending:
        electronicFeePending,

      electronic_fee_error:
        electronicFeeError,

      total_charged:
        finalTotal,

      recipient_wallet_id:
        walletId,

      recipient_name:
        recipientName,

      message:
        `₦${amount.toLocaleString(
          "en-NG",
        )} sent successfully.`,
    });
  } catch (error) {
    console.error(
      "IyanjuPay transfer error:",
      error,
    );

    return response(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
