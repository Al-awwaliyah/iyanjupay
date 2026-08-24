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

function maskWalletId(
  walletId: string,
) {
  const value =
    String(walletId ?? "");

  if (value.length <= 4) {
    return value;
  }

  return `xxxx${value.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

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
    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      ) ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      ) ?? "";

    const anonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY",
      ) ?? "";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey
    ) {
      throw new Error(
        "Supabase environment variables are not configured.",
      );
    }

    const authHeader =
      req.headers.get(
        "Authorization",
      );

    if (!authHeader) {
      return response(
        {
          success: false,
          error: "Unauthorized",
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
              Authorization:
                authHeader,
            },
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

    if (
      userError ||
      !user
    ) {
      return response(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

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
        },
      );

    let body: any;

    try {
      body = await req.json();
    } catch {
      return response(
        {
          success: false,
          error:
            "Invalid request body.",
        },
        400,
      );
    }

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

    if (
      !/^\d{8}$/.test(walletId)
    ) {
      return response(
        {
          success: false,
          error:
            "Invalid Wallet ID. Wallet ID must be exactly 8 digits.",
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
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

    if (senderWalletError) {
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

    /*
     * ============================================================
     * FIND RECIPIENT
     * ============================================================
     */

    const {
      data: recipientWallet,
      error: recipientWalletError,
    } = await admin
      .from("wallets")
      .select(
        "id, user_id, wallet_id, balance, held_balance, currency, status",
      )
      .eq(
        "wallet_id",
        walletId,
      )
      .maybeSingle();

    if (recipientWalletError) {
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

    /*
     * ============================================================
     * GET SENDER / RECIPIENT NAMES
     * ============================================================
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

    /*
     * ============================================================
     * ELECTRONIC FEE
     * ============================================================
     *
     * IMPORTANT:
     *
     * IyanjuPay internal transfers have NO ₦10 fee.
     *
     * ₦50 electronic fee applies at ₦10,000 and above.
     */

    const electronicFee =
      amount >=
      ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;

    const totalCharged =
      amount +
      electronicFee;

    /*
     * ============================================================
     * RESERVE KYC LIMIT
     * ============================================================
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

    /*
     * ============================================================
     * ATOMIC INTERNAL TRANSFER
     * ============================================================
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
        "Internal transfer failed:",
        error,
      );

      return response(
        {
          success: false,
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

    /*
     * ============================================================
     * COMPLETE KYC
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
        kycCompletionError ||
          kycCompletion,
      );

      /*
       * The money transfer has already succeeded.
       *
       * We DO NOT reverse it simply because
       * the KYC accounting finalization failed.
       *
       * Store reconciliation information.
       */

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

            transfer_amount:
              amount,

            iyanjupay_fee: 0,

            electronic_fee:
              electronicFee,

            total_charged:
              totalCharged,

            currency: "NGN",

            status: "completed",

            reference:
              result.reference ??
              null,

            transaction_id:
              transactionId,

            history_amount:
              totalCharged,

            history_sign: "-",

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

    /*
     * ============================================================
     * ELECTRONIC FEE
     * ============================================================
     */

    let electronicFeeCharged =
      false;

    let electronicFeePending =
      false;

    let electronicFeeError:
      string | null = null;

    if (
      electronicFee > 0
    ) {
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
          feeError ||
            feeResult,
        );
      } else {
        electronicFeeCharged =
          true;
      }
    }

    /*
     * ============================================================
     * FINAL TRANSACTION METADATA
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

          status:
            "successful",

          reference:
            finalReference,

          transaction_id:
            transactionId,

          history_amount:
            finalTotal,

          history_sign: "-",

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

    return response({
      success: true,

      transfer_type:
        "iyanjupay",

      status: "completed",

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
