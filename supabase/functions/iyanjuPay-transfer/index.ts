import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function maskWalletId(walletId: string) {
  const value = String(walletId ?? "");

  if (value.length <= 4) {
    return value;
  }

  return `xxxx${value.slice(-4)}`;
}

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

Deno.serve(async (req) => {
  /*
   * ============================================================
   * CORS
   * ============================================================
   */

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  /*
   * ============================================================
   * METHOD
   * ============================================================
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
    /*
     * ============================================================
     * SUPABASE ENVIRONMENT
     * ============================================================
     */

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey
    ) {
      return response(
        {
          success: false,
          error:
            "Supabase environment variables are not configured.",
        },
        500,
      );
    }

    /*
     * ============================================================
     * AUTHENTICATION
     * ============================================================
     *
     * Authenticate the caller here.
     *
     * IMPORTANT:
     *
     * The authenticated user is established by this Edge Function.
     * The internal transfer RPC is called with the service-role
     * client, so the RPC must NOT depend on auth.uid().
     */

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return response(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization: authHeader,
            },
          },
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (userError || !user) {
      console.error(
        "IyanjuPay transfer authentication failed:",
        userError,
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

    /*
     * ============================================================
     * ADMIN CLIENT
     * ============================================================
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

    /*
     * ============================================================
     * REQUEST BODY
     * ============================================================
     */

    let body: Record<string, unknown>;

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

    /*
     * ============================================================
     * INPUTS
     * ============================================================
     */

    const walletId = String(
      body?.wallet_id ??
        body?.walletId ??
        "",
    ).trim();

    const rawAmount = Number(
      body?.amount,
    );

    const amount =
      Math.round(rawAmount * 100) / 100;

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

    /*
     * ============================================================
     * VALIDATE WALLET ID
     * ============================================================
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

    /*
     * ============================================================
     * VALIDATE AMOUNT
     * ============================================================
     */

    if (
      !Number.isFinite(rawAmount) ||
      rawAmount <= 0
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
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return response(
        {
          success: false,
          error:
            "Invalid transfer amount.",
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

    /*
     * ============================================================
     * FIND SENDER WALLET
     * ============================================================
     */

    const {
      data: senderWallet,
      error: senderWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, balance, held_balance, currency, status",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (senderWalletError) {
      console.error(
        "Sender wallet lookup failed:",
        senderWalletError,
      );

      return response(
        {
          success: false,
          error:
            "Unable to load your wallet.",
        },
        500,
      );
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

    /*
     * ============================================================
     * SENDER WALLET STATUS
     * ============================================================
     */

    if (
      String(senderWallet.status).toLowerCase() !==
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

    /*
     * ============================================================
     * FIND RECIPIENT
     * ============================================================
     *
     * IMPORTANT:
     *
     * wallet_id is the public 8-digit IyanjuPay Wallet ID.
     * Do NOT search wallets.id here.
     */

    const {
      data: recipientWallet,
      error: recipientWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, balance, held_balance, currency, status",
      )
      .eq("wallet_id", walletId)
      .maybeSingle();

    if (recipientWalletError) {
      console.error(
        "Recipient wallet lookup failed:",
        recipientWalletError,
      );

      return response(
        {
          success: false,
          error:
            "Unable to find recipient wallet.",
        },
        500,
      );
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

    /*
     * ============================================================
     * PREVENT SELF TRANSFER
     * ============================================================
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

    if (
      recipientWallet.id ===
      senderWallet.id
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

    /*
     * ============================================================
     * RECIPIENT STATUS
     * ============================================================
     */

    if (
      String(recipientWallet.status).toLowerCase() !==
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

    /*
     * ============================================================
     * CURRENCY
     * ============================================================
     */

    if (
      String(senderWallet.currency).toUpperCase() !==
        "NGN" ||
      String(recipientWallet.currency).toUpperCase() !==
        "NGN"
    ) {
      return response(
        {
          success: false,
          error:
            "Only NGN wallet transfers are supported.",
        },
        400,
      );
    }

    /*
     * ============================================================
     * BALANCE CHECK
     * ============================================================
     *
     * This is only an early UI/API check.
     *
     * The actual atomic balance check happens inside
     * execute_internal_transfer().
     */

    const senderBalance =
      Number(senderWallet.balance ?? 0);

    if (
      !Number.isFinite(senderBalance) ||
      senderBalance < amount
    ) {
      return response(
        {
          success: false,
          error: "Insufficient wallet balance.",
          balance: senderBalance,
          requested_amount: amount,
        },
        400,
      );
    }

    /*
     * ============================================================
     * LOAD NAMES
     * ============================================================
     */

    const {
      data: senderProfile,
    } = await admin
      .from("profiles")
      .select(
        "full_name, nickname",
      )
      .eq("id", user.id)
      .maybeSingle();

    const {
      data: recipientProfile,
    } = await admin
      .from("profiles")
      .select(
        "full_name, nickname",
      )
      .eq(
        "id",
        recipientWallet.user_id,
      )
      .maybeSingle();

    const senderName =
      String(
        senderProfile?.full_name ??
          senderProfile?.nickname ??
          "IyanjuPay User",
      ).trim();

    const recipientName =
      String(
        recipientProfile?.full_name ??
          recipientProfile?.nickname ??
          "IyanjuPay User",
      ).trim();

    /*
     * ============================================================
     * ELECTRONIC FEE
     * ============================================================
     *
     * Internal IyanjuPay transfer:
     *
     * Amount < ₦10,000
     *   electronic fee = ₦0
     *
     * Amount >= ₦10,000
     *   electronic fee = ₦50
     *
     * No ₦10 IyanjuPay transfer fee.
     */

    const electronicFee =
      amount >=
      ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;

    const expectedTotal =
      amount + electronicFee;

    /*
     * ============================================================
     * KYC DAILY LIMIT RESERVATION
     * ============================================================
     *
     * The transfer amount counts toward the daily limit.
     * Fees do not count.
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
          requested_amount: amount,
          currency: "NGN",
        },
        400,
      );
    }

    let kycReservationActive = true;

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
            error ?? data,
          );

          return false;
        }

        kycReservationActive =
          false;

        return true;
      };

    /*
     * ============================================================
     * ATOMIC INTERNAL TRANSFER
     * ============================================================
     *
     * IMPORTANT:
     *
     * The Edge Function has already authenticated user.id.
     *
     * The RPC is executed using service-role because it performs
     * privileged wallet mutations.
     *
     * Therefore execute_internal_transfer MUST NOT use
     * auth.uid() as its authentication mechanism.
     */

    console.log(
      "Calling execute_internal_transfer:",
      {
        sender_user_id: user.id,
        recipient_wallet_id: walletId,
        amount,
      },
    );

    const {
      data: transferResult,
      error: transferError,
    } = await admin.rpc(
      "execute_internal_transfer",
      {
        _sender_user_id: user.id,
        _recipient_wallet_id: walletId,
        _amount: amount,
        _narration:
          narration ||
          "IyanjuPay transfer",
        _idempotency_key:
          idempotencyKey || null,
      },
    );

    if (transferError) {
      await releaseKycReservation();

      console.error(
        "Internal transfer RPC failed:",
        transferError,
      );

      return response(
        {
          success: false,
          stage: "internal_transfer",
          error:
            transferError.message ||
            "Unable to complete IyanjuPay transfer.",
        },
        400,
      );
    }

    if (
      !transferResult ||
      transferResult.success !== true
    ) {
      await releaseKycReservation();

      console.error(
        "Internal transfer returned unsuccessful result:",
        transferResult,
      );

      return response(
        {
          success: false,
          stage: "internal_transfer",
          error:
            transferResult?.error ??
            "Unable to complete IyanjuPay transfer.",
        },
        400,
      );
    }

    const result =
      transferResult;

    /*
     * ============================================================
     * IDEMPOTENT REPLAY
     * ============================================================
     *
     * If the RPC tells us the transfer was already processed,
     * do NOT reserve/complete the daily limit again.
     */

    if (
      result.already_processed === true
    ) {
      kycReservationActive =
        false;

      const existingTransaction =
        result.transaction ?? null;

      return response({
        success: true,

        transfer_type:
          "iyanjupay",

        status:
          result.status ??
          "successful",

        already_processed:
          true,

        transaction_id:
          result.transaction_id ??
          existingTransaction?.id ??
          null,

        reference:
          result.reference ??
          existingTransaction?.reference_number ??
          null,

        amount:
          Number(
            result.amount ??
              existingTransaction?.amount ??
              amount,
          ),

        fee: 0,

        electronic_fee:
          electronicFee,

        total_charged:
          Number(
            result.amount ??
              existingTransaction?.amount ??
              amount,
          ) +
          electronicFee,

        recipient_wallet_id:
          walletId,

        recipient_name:
          recipientName,

        message:
          "This transfer has already been processed.",
      });
    }

    const transactionId =
      result.transaction_id ??
      null;

    /*
     * ============================================================
     * COMPLETE KYC DAILY LIMIT
     * ============================================================
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
        kycCompletionError ??
          kycCompletion,
      );

      /*
       * IMPORTANT:
       *
       * The actual wallet transfer already succeeded.
       *
       * Do NOT reverse the wallet transfer here.
       *
       * Mark the transaction as requiring KYC reconciliation.
       */

      if (transactionId) {
        await admin
          .from("transactions")
          .update({
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

              iyanjupay_fee: 0,

              electronic_fee:
                electronicFee,

              electronic_fee_charged:
                false,

              electronic_fee_pending:
                electronicFee > 0,

              total_charged:
                expectedTotal,

              currency: "NGN",

              status: "completed",

              reference:
                result.reference ??
                null,

              transaction_id:
                transactionId,

              history_amount:
                expectedTotal,

              history_sign: "-",

              history_amount_display:
                `-${formatNaira(
                  expectedTotal,
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
      }

      kycReservationActive =
        false;

      return response({
        success: true,

        transfer_type:
          "iyanjupay",

        status: "completed",

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
          expectedTotal,

        recipient_wallet_id:
          walletId,

        recipient_name:
          recipientName,

        message:
          `${formatNaira(
            amount,
          )} sent successfully.`,
      });
    }

    kycReservationActive =
      false;

    /*
     * ============================================================
     * ELECTRONIC FEE
     * ============================================================
     *
     * The transfer itself is already complete.
     *
     * If >= ₦10,000, charge the ₦50 electronic fee separately.
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
          _user_id: user.id,

          _operation: "DEBIT",

          _amount:
            electronicFee,

          _description:
            `Electronic transfer fee for IyanjuPay wallet transfer of ${formatNaira(
              amount,
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

            currency: "NGN",
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
          feeError ??
            feeResult,
        );
      } else {
        electronicFeeCharged =
          true;
      }
    }

    /*
     * ============================================================
     * FINAL AMOUNTS
     * ============================================================
     */

    const finalFee =
      electronicFeeCharged
        ? electronicFee
        : 0;

    const finalTotal =
      amount + finalFee;

    const finalReference =
      result.reference ??
      null;

    /*
     * ============================================================
     * UPDATE TRANSACTION
     * ============================================================
     */

    if (transactionId) {
      const {
        error: transactionUpdateError,
      } = await admin
        .from("transactions")
        .update({
          status: "successful",

          metadata: {
            history_version: 1,

            transaction_type:
              "wallet_transfer",

            transaction_category:
              "transfer",

            transfer_type:
              "wallet_to_wallet",

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

            iyanjupay_fee: 0,

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

            currency: "NGN",

            status: "successful",

            reference:
              finalReference,

            transaction_id:
              transactionId,

            history_amount:
              finalTotal,

            history_sign: "-",

            history_amount_display:
              `-${formatNaira(
                finalTotal,
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
    }

    /*
     * ============================================================
     * SUCCESS
     * ============================================================
     */

    return response({
      success: true,

      transfer_type:
        "iyanjupay",

      status:
        "completed",

      already_processed:
        false,

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
        `${formatNaira(
          amount,
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
