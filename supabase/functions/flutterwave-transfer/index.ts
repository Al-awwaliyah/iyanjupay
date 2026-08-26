import {
  adminClient,
  getUser,
  json,
  flw,
} from "../_shared/auth.ts";



const IYANJUPAY_TRANSFER_FEE = 10;
const ELECTRONIC_FEE = 50;
const ELECTRONIC_FEE_THRESHOLD = 5000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function maskAccountNumber(accountNumber: string): string {
  const clean = String(accountNumber ?? "").replace(/\D/g, "");

  if (clean.length < 4) {
    return clean;
  }

  return `xxxxxx${clean.slice(-4)}`;
}


// ============================================================
// NOTIFICATION HELPER
// ============================================================
//
// Creates a transaction notification safely.
//
// Duplicate protection:
//   user_id + transaction_id + type
//
// We intentionally do not make notification failure break
// the financial transaction.
//
async function createTransactionNotification(
  supabase: ReturnType<typeof adminClient>,
  params: {
    userId: string;
    transactionId: string | null;
    type: string;
    title: string;
    message: string;
    amount?: number | null;
    metadata?: Record<string, any>;
  },
) {
  const {
    userId,
    transactionId,
    type,
    title,
    message,
    amount = null,
    metadata = {},
  } = params;

  try {
    /*
     * ==========================================================
     * DUPLICATE PROTECTION
     * ==========================================================
     *
     * This prevents the same transaction notification from
     * being inserted more than once if an Edge Function is
     * retried.
     */
    if (transactionId) {
      const {
        data: existingNotification,
        error: existingError,
      } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("transaction_id", transactionId)
        .eq("type", type)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error(
          "Notification duplicate check failed:",
          existingError,
        );
      }

      if (existingNotification) {
        console.log(
          "Transaction notification already exists:",
          {
            user_id: userId,
            transaction_id: transactionId,
            type,
          },
        );

        return;
      }
    }

    /*
     * ==========================================================
     * INSERT NOTIFICATION
     * ==========================================================
     */
    const {
      error,
    } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        transaction_id: transactionId,
        type,
        title,
        message,
        amount,
        is_read: false,
        metadata,
      });

    if (error) {
      /*
       * Notification failure must NEVER reverse, interrupt,
       * or fail the financial transaction.
       */
      console.error(
        "Transaction notification insert failed:",
        {
          error,
          user_id: userId,
          transaction_id: transactionId,
          type,
        },
      );

      return;
    }

    console.log(
      "Transaction notification created:",
      {
        user_id: userId,
        transaction_id: transactionId,
        type,
      },
    );
  } catch (error) {
    /*
     * Notifications are secondary to the financial operation.
     *
     * Never throw notification errors back into the transfer
     * flow.
     */
    console.error(
      "Unexpected notification error:",
      error,
    );
  }
}


// ============================================================
// HISTORY METADATA
// ============================================================

function createHistoryMetadata(params: {
  transactionId: string | number;
  reference: string;
  senderName: string;
  beneficiaryName: string;
  accountNumber: string;
  accountBank: string;
  amount: number;
  iyanjupayFee: number;
  electronicFee: number;
  totalCharged: number;
  status: string;
  direction?: string;
}) {
  const {
    transactionId,
    reference,
    senderName,
    beneficiaryName,
    accountNumber,
    accountBank,
    amount,
    iyanjupayFee,
    electronicFee,
    totalCharged,
    status,
    direction = "DEBIT",
  } = params;

  return {
    history_version: 1,

    transaction_type: "bank_transfer",
    transaction_category: "transfer",

    direction,

    display_title: `Transfer to ${beneficiaryName}`,

    counterparty_type: "bank_account",
    counterparty_name: beneficiaryName,

    sender_name: senderName,
    sender_platform: "IyanjuPay",

    beneficiary_name: beneficiaryName,

    account_number: accountNumber,
    account_number_masked:
      maskAccountNumber(accountNumber),

    account_bank: accountBank,

    narration: `${senderName} - IyanjuPay`,

    transfer_amount: amount,

    iyanjupay_fee: iyanjupayFee,

    electronic_fee: electronicFee,

    total_charged: totalCharged,

    currency: "NGN",

    status,

    reference,

    transaction_id: transactionId,

    provider: "flutterwave",

    history_amount: totalCharged,

    history_sign: "-",

    history_amount_display:
      `-₦${totalCharged.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,

    provider_transfer_amount: amount,

    flutterwave_transfer_amount: amount,

    created_for_history: true,
  };
}


// ============================================================
// MAIN
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    const supabase = adminClient();

    /*
     * ============================================================
     * SENDER PROFILE
     * ============================================================
     */

    const {
      data: senderProfile,
      error: senderProfileError,
    } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (senderProfileError) {
      console.error(
        "Sender profile lookup failed:",
        senderProfileError,
      );

      return json(
        {
          success: false,
          stage: "sender_profile",
          error:
            "Unable to retrieve your profile information.",
        },
        500,
      );
    }

    const senderName =
      String(
        senderProfile?.full_name ?? "",
      ).trim();

    if (!senderName) {
      return json(
        {
          success: false,
          stage: "sender_profile",
          error:
            "Your profile name is required before you can make a bank transfer.",
        },
        400,
      );
    }

    /*
     * ============================================================
     * REQUEST BODY
     * ============================================================
     */

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    const amount = roundMoney(
      Number(body?.amount),
    );

    const accountNumber =
      String(
        body?.account_number ?? "",
      ).replace(/\D/g, "");

    const accountBank =
      String(
        body?.account_bank ?? "",
      ).trim();

    const beneficiaryName =
      String(
        body?.beneficiary_name ?? "",
      ).trim();

    const clientIdempotencyKey =
      String(
        body?.idempotency_key ?? "",
      ).trim();

    /*
     * ============================================================
     * VALIDATION
     * ============================================================
     */

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return json(
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
      return json(
        {
          success: false,
          error:
            "Transfer amount cannot have more than 2 decimal places.",
        },
        400,
      );
    }

    if (
      !/^\d{10}$/.test(accountNumber)
    ) {
      return json(
        {
          success: false,
          error:
            "Account number must contain exactly 10 digits.",
        },
        400,
      );
    }

    if (
      !/^\d+$/.test(accountBank)
    ) {
      return json(
        {
          success: false,
          error: "Invalid bank code.",
        },
        400,
      );
    }

    if (!beneficiaryName) {
      return json(
        {
          success: false,
          error:
            "Beneficiary name is required.",
        },
        400,
      );
    }

    /*
     * ============================================================
     * FEES
     * ============================================================
     */

    const iyanjupayFee =
      IYANJUPAY_TRANSFER_FEE;

    const electronicFee =
      amount > ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;

    const totalCharged =
      roundMoney(
        amount +
          iyanjupayFee +
          electronicFee,
      );

    /*
     * ============================================================
     * REFERENCE
     * ============================================================
     */

    const reference =
      `IYJ-${crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 8)
        .toUpperCase()}`;

    const transferKey =
      clientIdempotencyKey ||
      `TRANSFER_${user.id}_${crypto.randomUUID()}`;

    const narration =
      `${senderName} - IyanjuPay`;

    /*
     * ============================================================
     * CHECK FLUTTERWAVE BALANCE
     * ============================================================
     */

    let balanceResponse;

    try {
      balanceResponse = await flw(
        "/balances",
        {
          method: "GET",
        },
      );
    } catch (error) {
      console.error(
        "Flutterwave balance request failed:",
        error,
      );

      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to verify Flutterwave balance. Please try again later.",
        },
        503,
      );
    }

    if (
      !balanceResponse.ok ||
      balanceResponse.body?.status !==
        "success"
    ) {
      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to verify Flutterwave balance.",
          provider_error:
            balanceResponse.body?.message ??
            null,
        },
        503,
      );
    }

    const balanceData =
      balanceResponse.body?.data;

    let ngnBalance: any = null;

    if (Array.isArray(balanceData)) {
      ngnBalance =
        balanceData.find(
          (item: any) =>
            String(
              item?.currency ?? "",
            ).toUpperCase() === "NGN",
        );
    } else if (
      balanceData &&
      typeof balanceData === "object"
    ) {
      if (
        String(
          balanceData?.currency ?? "",
        ).toUpperCase() === "NGN"
      ) {
        ngnBalance = balanceData;
      }
    }

    const flutterwaveAvailableBalance =
      Number(
        ngnBalance?.available_balance ?? 0,
      );

    const flutterwaveLedgerBalance =
      Number(
        ngnBalance?.ledger_balance ?? 0,
      );

    if (
      !Number.isFinite(
        flutterwaveAvailableBalance,
      )
    ) {
      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to determine Flutterwave available balance.",
        },
        503,
      );
    }

    /*
     * Flutterwave only needs the actual transfer amount.
     */

    if (
      flutterwaveAvailableBalance <
      amount
    ) {
      return json(
        {
          success: false,
          stage:
            "flutterwave_balance",
          error:
            "Insufficient Flutterwave balance. Please fund your Flutterwave account.",
          transfer_amount: amount,
          fee: iyanjupayFee,
          electronic_fee:
            electronicFee,
          total_charged:
            totalCharged,
          required: amount,
          available:
            flutterwaveAvailableBalance,
          currency: "NGN",
        },
        200,
      );
    }

    /*
     * ============================================================
     * KYC RESERVATION
     * ============================================================
     */

    const {
      data: kycReservation,
      error: kycReservationError,
    } = await supabase.rpc(
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

      return json(
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
      return json(
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
        } = await supabase.rpc(
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
            "KYC reservation release failed:",
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
     * DEBIT USER WALLET
     * ============================================================
     */

    const historyMetadata =
      createHistoryMetadata({
        transactionId:
          "PENDING",
        reference,
        senderName,
        beneficiaryName,
        accountNumber,
        accountBank,
        amount,
        iyanjupayFee,
        electronicFee,
        totalCharged,
        status: "pending",
      });

    const {
      data: debitTransaction,
      error: debitError,
    } = await supabase.rpc(
      "wallet_operation",
      {
        _user_id: user.id,
        _operation: "DEBIT",
        _amount: totalCharged,

        _description:
          `Transfer to ${beneficiaryName}`,

        _idempotency_key:
          transferKey,

        _reference:
          reference,

        _provider:
          "flutterwave",

        _category:
          "transfer",

        _metadata: {
          ...historyMetadata,

          kyc_limit_reserved:
            true,

          kyc_reserved_amount:
            amount,

          flutterwave_transfer_amount:
            amount,

          flutterwave_available_balance:
            flutterwaveAvailableBalance,

          flutterwave_ledger_balance:
            flutterwaveLedgerBalance,

          status:
            "pending",
        },
      },
    );

    if (debitError) {
      await releaseKycReservation();

      return json(
        {
          success: false,
          stage: "wallet_debit",
          error:
            debitError.message ||
            "Unable to debit wallet.",
        },
        400,
      );
    }

    if (!debitTransaction) {
      await releaseKycReservation();

      return json(
        {
          success: false,
          stage: "wallet_debit",
          error:
            "Wallet debit did not return a transaction.",
        },
        500,
      );
    }

    const transactionId =
      debitTransaction.id;

    /*
     * ============================================================
     * INITIATE FLUTTERWAVE TRANSFER
     * ============================================================
     */

    let flutterwaveResponse;

    try {
      flutterwaveResponse =
        await flw(
          "/transfers",
          {
            method: "POST",
            body: JSON.stringify({
              account_bank:
                accountBank,

              account_number:
                accountNumber,

              amount,

              currency: "NGN",

              debit_currency:
                "NGN",

              beneficiary_name:
                beneficiaryName,

              narration,

              reference,

              meta: [
                {
                  key:
                    "sender_name",
                  value:
                    senderName,
                },
                {
                  key:
                    "sender_platform",
                  value:
                    "IyanjuPay",
                },
                {
                  key:
                    "iyanjupay_reference",
                  value:
                    reference,
                },
                {
                  key:
                    "iyanjupay_transaction_id",
                  value:
                    transactionId,
                },
                {
                  key:
                    "iyanjupay_transfer_amount",
                  value:
                    String(amount),
                },
              ],
            }),
          },
        );
    } catch (error) {
      console.error(
        "Flutterwave transfer request failed:",
        error,
      );

      const refundResult =
        await supabase.rpc(
          "wallet_operation",
          {
            _user_id: user.id,
            _operation: "REFUND",
            _amount: totalCharged,

            _description:
              `Refund for failed transfer to ${beneficiaryName}`,

            _idempotency_key:
              `REFUND_${transactionId}`,

            _reference:
              `REFUND_${reference}`,

            _provider:
              "flutterwave",

            _category:
              "transfer_refund",

            _metadata: {
              original_transaction_id:
                transactionId,

              original_reference:
                reference,

              original_transfer_amount:
                amount,

              original_fee:
                iyanjupayFee,

              original_electronic_fee:
                electronicFee,

              original_total_charged:
                totalCharged,

              reason:
                "Flutterwave request failed",

              refunded_amount:
                totalCharged,
            },
          },
        );

      if (refundResult.error) {
        await supabase
          .from("transactions")
          .update({
            status: "pending",

            metadata: {
              ...historyMetadata,
              transaction_id:
                transactionId,

              refund_pending: true,
              refund_required: true,

              refund_amount:
                totalCharged,

              refund_error:
                refundResult.error.message,
            },
          })
          .eq(
            "id",
            transactionId,
          );

        /*
         * ========================================================
         * NOTIFICATION
         * ========================================================
         *
         * The financial operation requires reconciliation,
         * therefore notify the user that the transfer requires
         * attention rather than falsely saying it succeeded.
         */

        await createTransactionNotification(
          supabase,
          {
            userId: user.id,
            transactionId,
            type: "transfer_refund_pending",
            title:
              "Transfer refund pending",
            message:
              `Your transfer of ₦${totalCharged.toLocaleString(
                "en-NG",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )} to ${beneficiaryName} failed. Your refund requires reconciliation.`,
            amount: totalCharged,
            metadata: {
              reference,
              beneficiary_name:
                beneficiaryName,
              account_number:
                maskAccountNumber(
                  accountNumber,
                ),
              transfer_amount:
                amount,
              iyanjupay_fee:
                iyanjupayFee,
              electronic_fee:
                electronicFee,
              total_charged:
                totalCharged,
              refund_pending: true,
              refund_required: true,
            },
          },
        );

        return json(
          {
            success: false,
            status:
              "refund_pending",
            error:
              "Transfer failed and automatic refund requires reconciliation.",
            transaction_id:
              transactionId,
            reference,
          },
          503,
        );
      }

      await releaseKycReservation();

      await supabase
        .from("transactions")
        .update({
          status: "failed",

          metadata: {
            ...historyMetadata,

            transaction_id:
              transactionId,

            status: "failed",

            refunded: true,

            refund_amount:
              totalCharged,

            kyc_limit_released:
              true,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      /*
       * ========================================================
       * NOTIFICATION — FAILED + REFUNDED
       * ========================================================
       */

      await createTransactionNotification(
        supabase,
        {
          userId: user.id,
          transactionId,
          type: "transfer_failed",
          title:
            "Bank transfer failed",
          message:
            `Your transfer of ₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} to ${beneficiaryName} failed. ₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} has been refunded to your wallet.`,
          amount: totalCharged,
          metadata: {
            reference,
            beneficiary_name:
              beneficiaryName,
            account_number:
              maskAccountNumber(
                accountNumber,
              ),
            transfer_amount:
              amount,
            iyanjupay_fee:
              iyanjupayFee,
            electronic_fee:
              electronicFee,
            total_charged:
              totalCharged,
            refunded: true,
            refund_amount:
              totalCharged,
            status: "failed",
          },
        },
      );

      return json({
        success: false,
        status: "failed",
        refunded: true,
        reference,
        transaction_id:
          transactionId,
        refund_amount:
          totalCharged,
      });
    }

    const flutterwaveData =
      flutterwaveResponse.body;

    /*
     * ============================================================
     * PROVIDER REJECTED
     * ============================================================
     */

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !==
        "success"
    ) {
      const providerError =
        flutterwaveData?.message ||
        flutterwaveData?.error?.message ||
        flutterwaveData?.error ||
        "Flutterwave could not initiate the transfer.";

      const refundResult =
        await supabase.rpc(
          "wallet_operation",
          {
            _user_id: user.id,
            _operation: "REFUND",
            _amount: totalCharged,

            _description:
              `Refund for rejected transfer to ${beneficiaryName}`,

            _idempotency_key:
              `REFUND_${transactionId}`,

            _reference:
              `REFUND_${reference}`,

            _provider:
              "flutterwave",

            _category:
              "transfer_refund",

            _metadata: {
              original_transaction_id:
                transactionId,

              original_reference:
                reference,

              original_transfer_amount:
                amount,

              original_fee:
                iyanjupayFee,

              original_electronic_fee:
                electronicFee,

              original_total_charged:
                totalCharged,

              reason:
                providerError,

              provider_response:
                flutterwaveData,

              refunded_amount:
                totalCharged,
            },
          },
        );

      if (refundResult.error) {
        await supabase
          .from("transactions")
          .update({
            status: "pending",

            metadata: {
              ...historyMetadata,

              transaction_id:
                transactionId,

              refund_required:
                true,

              refund_pending:
                true,

              refund_amount:
                totalCharged,

              refund_error:
                refundResult.error.message,
            },
          })
          .eq(
            "id",
            transactionId,
          );

        /*
         * ========================================================
         * NOTIFICATION — REFUND PENDING
         * ========================================================
         */

        await createTransactionNotification(
          supabase,
          {
            userId: user.id,
            transactionId,
            type: "transfer_refund_pending",
            title:
              "Transfer refund pending",
            message:
              `Your transfer of ₦${totalCharged.toLocaleString(
                "en-NG",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )} to ${beneficiaryName} was rejected. Your refund requires reconciliation.`,
            amount: totalCharged,
            metadata: {
              reference,
              beneficiary_name:
                beneficiaryName,
              account_number:
                maskAccountNumber(
                  accountNumber,
                ),
              transfer_amount:
                amount,
              iyanjupay_fee:
                iyanjupayFee,
              electronic_fee:
                electronicFee,
              total_charged:
                totalCharged,
              provider_error:
                providerError,
              refund_pending: true,
              refund_required: true,
            },
          },
        );

        return json(
          {
            success: false,
            status:
              "refund_pending",
            error:
              "Flutterwave rejected the transfer but automatic refund requires retry.",
            reference,
            transaction_id:
              transactionId,
          },
          503,
        );
      }

      await releaseKycReservation();

      await supabase
        .from("transactions")
        .update({
          status: "failed",

          metadata: {
            ...historyMetadata,

            transaction_id:
              transactionId,

            status: "failed",

            provider_error:
              providerError,

            refunded: true,

            refund_amount:
              totalCharged,

            kyc_limit_released:
              true,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      /*
       * ========================================================
       * NOTIFICATION — PROVIDER REJECTED + REFUNDED
       * ========================================================
       */

      await createTransactionNotification(
        supabase,
        {
          userId: user.id,
          transactionId,
          type: "transfer_failed",
          title:
            "Bank transfer failed",
          message:
            `Your transfer of ₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} to ${beneficiaryName} was rejected. ₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} has been refunded to your wallet.`,
          amount: totalCharged,
          metadata: {
            reference,
            beneficiary_name:
              beneficiaryName,
            account_number:
              maskAccountNumber(
                accountNumber,
              ),
            transfer_amount:
              amount,
            iyanjupay_fee:
              iyanjupayFee,
            electronic_fee:
              electronicFee,
            total_charged:
              totalCharged,
            provider_error:
              providerError,
            refunded: true,
            refund_amount:
              totalCharged,
            status: "failed",
          },
        },
      );

      return json({
        success: false,
        status: "failed",
        refunded: true,
        reference,
        transaction_id:
          transactionId,
        refund_amount:
          totalCharged,
      });
    }

    /*
     * ============================================================
     * ACCEPTED BY FLUTTERWAVE
     * ============================================================
     */

    const flutterwaveTransferId =
      flutterwaveData?.data?.id
        ? String(
            flutterwaveData.data.id,
          )
        : null;

    const transferStatus =
      String(
        flutterwaveData?.data?.status ??
          "NEW",
      ).toUpperCase();

    /*
     * Never mark successful here.
     */

    const pendingMetadata =
      createHistoryMetadata({
        transactionId,
        reference,
        senderName,
        beneficiaryName,
        accountNumber,
        accountBank,
        amount,
        iyanjupayFee,
        electronicFee,
        totalCharged,
        status: "pending",
      });

    await supabase
      .from("transactions")
      .update({
        status: "pending",

        provider:
          "flutterwave",

        provider_reference:
          flutterwaveTransferId,

        metadata: {
          ...pendingMetadata,

          flutterwave_transfer_id:
            flutterwaveTransferId,

          flutterwave_status:
            transferStatus,

          flutterwave_response:
            flutterwaveData,

          kyc_limit_reserved:
            true,

          kyc_reserved_amount:
            amount,

          electronic_fee_due:
            electronicFee,
        },
      })
      .eq(
        "id",
        transactionId,
      );

    /*
     * ============================================================
     * NOTIFICATION — TRANSFER PENDING
     * ============================================================
     *
     * This is NOT a success notification.
     *
     * Flutterwave has only accepted/queued the request.
     */

    await createTransactionNotification(
      supabase,
      {
        userId: user.id,
        transactionId,
        type: "transfer_pending",
        title:
          "Bank transfer processing",
        message:
          `Your transfer of ₦${totalCharged.toLocaleString(
            "en-NG",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )} to ${beneficiaryName} is being processed.`,
        amount: totalCharged,
        metadata: {
          reference,
          beneficiary_name:
            beneficiaryName,
          account_number:
            maskAccountNumber(
              accountNumber,
            ),
          account_bank:
            accountBank,
          transfer_amount:
            amount,
          iyanjupay_fee:
            iyanjupayFee,
          electronic_fee:
            electronicFee,
          total_charged:
            totalCharged,
          flutterwave_transfer_id:
            flutterwaveTransferId,
          flutterwave_status:
            transferStatus,
          status: "pending",
        },
      },
    );

    return json({
      success: true,

      status: "pending",

      message:
        "Transfer has been initiated and is being processed.",

      reference,

      transaction_id:
        transactionId,

      flutterwave_transfer_id:
        flutterwaveTransferId,

      flutterwave_status:
        transferStatus,

      transfer_amount:
        amount,

      fee:
        iyanjupayFee,

      electronic_fee:
        electronicFee,

      total_charged:
        totalCharged,

      currency: "NGN",
    });
  } catch (error) {
    console.error(
      "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
      error,
    );

    return json(
      {
        success: false,
        stage: "internal",
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
