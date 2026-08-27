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


// ============================================================
// USER-SAFE ERROR
// ============================================================
//
// Never expose Flutterwave/provider/internal implementation
// details to the frontend.
//
// Detailed errors are logged server-side only.
// ============================================================

const TEMPORARY_SERVICE_ERROR =
  "We're experiencing a temporary technical issue. Please try again in a few minutes.";


// ============================================================
// MONEY HELPERS
// ============================================================

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}


function maskAccountNumber(
  accountNumber: string,
): string {
  const clean =
    String(accountNumber ?? "")
      .replace(/\D/g, "");

  if (clean.length < 4) {
    return clean;
  }

  return `xxxxxx${clean.slice(-4)}`;
}


// ============================================================
// NOTIFICATION HELPER
// ============================================================
//
// This function ONLY creates the notification.
// It does not affect the transaction itself.
//
// If notification creation fails, the transaction must NOT fail.
//
// This is intentional because notifications are auxiliary data.
// ============================================================

async function createTransactionNotification(params: {
  supabase: ReturnType<typeof adminClient>;
  userId: string;
  transactionId?: string | null;
  type: string;
  title: string;
  message: string;
  amount?: number | null;
  metadata?: Record<string, any>;
}) {
  const {
    supabase,
    userId,
    transactionId = null,
    type,
    title,
    message,
    amount = null,
    metadata = {},
  } = params;

  try {
    /*
     * Prevent duplicate notifications for the same
     * transaction + notification type.
     *
     * This is especially useful when the Edge Function
     * is retried.
     */

    if (transactionId) {
      const {
        data: existing,
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

      if (existing?.id) {
        return {
          success: true,
          already_exists: true,
          id: existing.id,
        };
      }
    }

    const {
      data,
      error,
    } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,

        transaction_id:
          transactionId,

        type,

        title,

        message,

        amount:
          amount == null
            ? null
            : roundMoney(amount),

        is_read: false,

        metadata,
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        "Transaction notification creation failed:",
        error,
      );

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      already_exists: false,
      id: data?.id ?? null,
    };
  } catch (error) {
    console.error(
      "Unexpected notification error:",
      error,
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Notification creation failed.",
    };
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

    transaction_type:
      "bank_transfer",

    transaction_category:
      "transfer",

    direction,

    display_title:
      `Transfer to ${beneficiaryName}`,

    counterparty_type:
      "bank_account",

    counterparty_name:
      beneficiaryName,

    sender_name:
      senderName,

    sender_platform:
      "IyanjuPay",

    beneficiary_name:
      beneficiaryName,

    account_number:
      accountNumber,

    account_number_masked:
      maskAccountNumber(accountNumber),

    account_bank:
      accountBank,

    narration:
      `${senderName} - IyanjuPay`,

    transfer_amount:
      amount,

    iyanjupay_fee:
      iyanjupayFee,

    electronic_fee:
      electronicFee,

    total_charged:
      totalCharged,

    currency:
      "NGN",

    status,

    reference,

    transaction_id:
      transactionId,

    provider:
      "flutterwave",

    history_amount:
      totalCharged,

    history_sign:
      "-",

    history_amount_display:
      `-₦${totalCharged.toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}`,

    provider_transfer_amount:
      amount,

    flutterwave_transfer_amount:
      amount,

    created_for_history:
      true,
  };
}


// ============================================================
// MAIN
// ============================================================

Deno.serve(async (req) => {

  // ==========================================================
  // CORS
  // ==========================================================

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }


  // ==========================================================
  // METHOD
  // ==========================================================

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

    // ========================================================
    // AUTHENTICATION
    // ========================================================

    const user =
      await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }


    const supabase =
      adminClient();


    // ========================================================
    // SENDER PROFILE
    // ========================================================

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
          error:
            "Your profile name is required before you can make a bank transfer.",
        },
        400,
      );
    }


    // ========================================================
    // REQUEST BODY
    // ========================================================

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "Invalid JSON request body.",
        },
        400,
      );
    }


    // ========================================================
    // REQUEST VALUES
    // ========================================================

    const amount =
      roundMoney(
        Number(body?.amount),
      );


    const accountNumber =
      String(
        body?.account_number ??
        body?.accountNumber ??
        "",
      ).replace(/\D/g, "");


    const accountBank =
      String(
        body?.account_bank ??
        body?.bank_code ??
        body?.bankCode ??
        "",
      ).trim();


    /*
     * IMPORTANT:
     *
     * Different versions of the frontend may send
     * the beneficiary name under different property names.
     *
     * We accept all common variants.
     */

    const beneficiaryName =
      String(
        body?.beneficiary_name ??
        body?.beneficiaryName ??
        body?.account_name ??
        body?.accountName ??
        body?.bank_account_name ??
        body?.recipient_name ??
        body?.recipientName ??
        "",
      ).trim();


    /*
     * If the frontend did not provide the beneficiary name,
     * do NOT reject the transaction simply because of that.
     *
     * Flutterwave can still receive the account details.
     *
     * The final beneficiary information from the provider
     * will be saved later when available.
     */

    const safeBeneficiaryName =
      beneficiaryName ||
      "Bank Transfer";


    const clientIdempotencyKey =
      String(
        body?.idempotency_key ??
        body?.idempotencyKey ??
        "",
      ).trim();


    // ========================================================
    // VALIDATION
    // ========================================================

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
      !/^\d{10}$/.test(
        accountNumber,
      )
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
      !/^\d+$/.test(
        accountBank,
      )
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid bank code.",
        },
        400,
      );
    }


    // ========================================================
    // FEES
    // ========================================================

    const iyanjupayFee =
      IYANJUPAY_TRANSFER_FEE;


    const electronicFee =
      amount >
      ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;


    const totalCharged =
      roundMoney(
        amount +
        iyanjupayFee +
        electronicFee,
      );


    // ========================================================
    // REFERENCE
    // ========================================================

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


    // ========================================================
    // FLUTTERWAVE BALANCE
    // ========================================================

    let balanceResponse;

    try {
      balanceResponse =
        await flw(
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
          code:
            "TEMPORARY_SERVICE_ERROR",
          error:
            TEMPORARY_SERVICE_ERROR,
        },
        503,
      );
    }


    if (
      !balanceResponse.ok ||
      balanceResponse.body?.status !==
        "success"
    ) {
      console.error(
        "Flutterwave balance verification failed:",
        {
          reference,
          user_id: user.id,
          provider_status:
            balanceResponse.body?.status ?? null,
          provider_message:
            balanceResponse.body?.message ?? null,
          provider_response:
            balanceResponse.body ?? null,
        },
      );

      return json(
        {
          success: false,
          code:
            "TEMPORARY_SERVICE_ERROR",
          error:
            TEMPORARY_SERVICE_ERROR,
        },
        503,
      );
    }


    const balanceData =
      balanceResponse.body?.data;


    let ngnBalance: any = null;


    if (
      Array.isArray(balanceData)
    ) {
      ngnBalance =
        balanceData.find(
          (item: any) =>
            String(
              item?.currency ?? "",
            ).toUpperCase() ===
            "NGN",
        );
    } else if (
      balanceData &&
      typeof balanceData ===
        "object"
    ) {
      if (
        String(
          balanceData?.currency ?? "",
        ).toUpperCase() ===
        "NGN"
      ) {
        ngnBalance =
          balanceData;
      }
    }


    const flutterwaveAvailableBalance =
      Number(
        ngnBalance?.available_balance ??
          0,
      );


    const flutterwaveLedgerBalance =
      Number(
        ngnBalance?.ledger_balance ??
          0,
      );


    if (
      !Number.isFinite(
        flutterwaveAvailableBalance,
      )
    ) {
      console.error(
        "Flutterwave available balance could not be determined:",
        {
          reference,
          user_id: user.id,
          available_balance:
            ngnBalance?.available_balance ?? null,
          ledger_balance:
            ngnBalance?.ledger_balance ?? null,
          provider_response:
            balanceResponse.body ?? null,
        },
      );

      return json(
        {
          success: false,
          code:
            "TEMPORARY_SERVICE_ERROR",
          error:
            TEMPORARY_SERVICE_ERROR,
        },
        503,
      );
    }


    /*
     * Flutterwave only receives the actual
     * transfer amount.
     *
     * IMPORTANT:
     *
     * The actual Flutterwave balance is NEVER returned
     * to the frontend.
     */

    if (
      flutterwaveAvailableBalance <
      amount
    ) {
      console.error(
        "Flutterwave payout balance is insufficient for transfer:",
        {
          reference,
          user_id: user.id,
          transfer_amount:
            amount,
          flutterwave_available_balance:
            flutterwaveAvailableBalance,
          flutterwave_ledger_balance:
            flutterwaveLedgerBalance,
        },
      );

      return json(
        {
          success: false,
          code:
            "TEMPORARY_SERVICE_ERROR",
          error:
            TEMPORARY_SERVICE_ERROR,
        },
        503,
      );
    }


    // ========================================================
    // KYC RESERVATION
    // ========================================================

    const {
      data: kycReservation,
      error:
        kycReservationError,
    } = await supabase.rpc(
      "reserve_kyc_daily_transfer",
      {
        _user_id:
          user.id,

        _amount:
          amount,
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
          stage:
            "kyc_limit",
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
          stage:
            "kyc_limit",
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
          currency:
            "NGN",
        },
        400,
      );
    }


    let kycReservationActive =
      true;


    const releaseKycReservation =
      async () => {

        if (
          !kycReservationActive
        ) {
          return true;
        }


        const {
          data,
          error,
        } = await supabase.rpc(
          "release_kyc_daily_transfer",
          {
            _user_id:
              user.id,

            _amount:
              amount,
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


    // ========================================================
    // CREATE INITIAL HISTORY METADATA
    // ========================================================

    const historyMetadata =
      createHistoryMetadata({
        transactionId:
          "PENDING",

        reference,

        senderName,

        beneficiaryName:
          safeBeneficiaryName,

        accountNumber,

        accountBank,

        amount,

        iyanjupayFee,

        electronicFee,

        totalCharged,

        status:
          "pending",
      });


    // ========================================================
    // DEBIT USER WALLET
    // ========================================================

    const {
      data: debitTransaction,
      error: debitError,
    } = await supabase.rpc(
      "wallet_operation",
      {
        _user_id:
          user.id,

        _operation:
          "DEBIT",

        _amount:
          totalCharged,

        _description:
          `Transfer to ${safeBeneficiaryName}`,

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

          beneficiary_name_provided:
            Boolean(
              beneficiaryName,
            ),

          status:
            "pending",
        },
      },
    );


    if (debitError) {
      await releaseKycReservation();

      console.error(
        "Wallet debit failed:",
        debitError,
      );

      return json(
        {
          success: false,
          stage:
            "wallet_debit",
          error:
            "Unable to complete the transfer. Please try again.",
        },
        400,
      );
    }


    if (!debitTransaction) {
      await releaseKycReservation();

      console.error(
        "Wallet debit did not return a transaction.",
        {
          reference,
          user_id: user.id,
        },
      );

      return json(
        {
          success: false,
          error:
            "Unable to complete the transfer. Please try again.",
        },
        500,
      );
    }


    const transactionId =
      debitTransaction.id;


    // ========================================================
    // CREATE PENDING NOTIFICATION
    // ========================================================

    await createTransactionNotification({
      supabase,

      userId:
        user.id,

      transactionId:

        transactionId,

      type:
        "transaction_pending",

      title:
        "Transfer initiated",

      message:
        `Your transfer of ₦${amount.toLocaleString(
          "en-NG",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )} to ${safeBeneficiaryName} has been initiated and is being processed.`,

      amount:
        amount,

      metadata: {
        transaction_type:
          "bank_transfer",

        transaction_category:
          "transfer",

        direction:
          "outgoing",

        reference,

        account_number:
          accountNumber,

        account_number_masked:
          maskAccountNumber(
            accountNumber,
          ),

        account_bank:
          accountBank,

        beneficiary_name:
          safeBeneficiaryName,

        transfer_amount:
          amount,

        fee:
          iyanjupayFee,

        electronic_fee:
          electronicFee,

        total_charged:
          totalCharged,

        currency:
          "NGN",

        status:
          "pending",
      },
    });


    // ========================================================
    // INITIATE FLUTTERWAVE TRANSFER
    // ========================================================

    let flutterwaveResponse;

    try {

      flutterwaveResponse =
        await flw(
          "/transfers",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                account_bank:
                  accountBank,

                account_number:
                  accountNumber,

                amount,

                currency:
                  "NGN",

                debit_currency:
                  "NGN",

                beneficiary_name:
                  safeBeneficiaryName,

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


      // ======================================================
      // REFUND
      // ======================================================

      const refundResult =
        await supabase.rpc(
          "wallet_operation",
          {
            _user_id:
              user.id,

            _operation:
              "REFUND",

            _amount:
              totalCharged,

            _description:
              `Refund for failed transfer to ${safeBeneficiaryName}`,

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

        console.error(
          "Automatic refund failed:",
          refundResult.error,
        );

        await supabase
          .from("transactions")
          .update({
            status:
              "pending",

            metadata: {
              ...historyMetadata,

              transaction_id:
                transactionId,

              refund_pending:
                true,

              refund_required:
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
         * Notification:
         *
         * The original pending notification remains.
         * Add a separate refund-pending notification.
         */

        await createTransactionNotification({
          supabase,

          userId:
            user.id,

          transactionId,

          type:
            "transaction_refund_pending",

          title:
            "Transfer refund pending",

          message:
            `Your transfer of ₦${amount.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} to ${safeBeneficiaryName} failed. Your refund requires reconciliation.`,

          amount:
            totalCharged,

          metadata: {
            reference,

            transfer_amount:
              amount,

            total_charged:
              totalCharged,

            beneficiary_name:
              safeBeneficiaryName,

            status:
              "refund_pending",

            direction:
              "outgoing",

            refund_required:
              true,
          },
        });


        return json(
          {
            success: false,

            status:
              "refund_pending",

            code:
              "REFUND_PENDING",

            error:
              "The transfer could not be completed and your refund requires reconciliation.",

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
          status:
            "failed",

          metadata: {
            ...historyMetadata,

            transaction_id:
              transactionId,

            status:
              "failed",

            refunded:
              true,

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


      // ======================================================
      // FAILED TRANSACTION NOTIFICATION
      // ======================================================

      await createTransactionNotification({
        supabase,

        userId:
          user.id,

        transactionId,

        type:
          "transaction_failed",

        title:
          "Transfer failed",

        message:
          `Your transfer of ₦${amount.toLocaleString(
            "en-NG",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )} to ${safeBeneficiaryName} failed. ₦${totalCharged.toLocaleString(
            "en-NG",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )} has been refunded to your wallet.`,

        amount:
          totalCharged,

        metadata: {
          reference,

          transfer_amount:
            amount,

          total_charged:
            totalCharged,

          beneficiary_name:
            safeBeneficiaryName,

          status:
            "failed",

          refunded:
            true,

          direction:
            "outgoing",
        },
      });


      return json({
        success:
          false,

        status:
          "failed",

        refunded:
          true,

        reference,

        transaction_id:
          transactionId,

        refund_amount:
          totalCharged,
      });
    }


    // ========================================================
    // PROVIDER RESPONSE
    // ========================================================

    const flutterwaveData =
      flutterwaveResponse.body;


    // ========================================================
    // PROVIDER REJECTED
    // ========================================================

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


      /*
       * IMPORTANT:
       *
       * providerError is kept for INTERNAL logging/metadata.
       * It is NEVER returned to the frontend.
       */

      console.error(
        "Flutterwave rejected transfer:",
        {
          reference,
          transaction_id:
            transactionId,
          provider_error:
            providerError,
          provider_response:
            flutterwaveData,
        },
      );


      const refundResult =
        await supabase.rpc(
          "wallet_operation",
          {
            _user_id:
              user.id,

            _operation:
              "REFUND",

            _amount:
              totalCharged,

            _description:
              `Refund for rejected transfer to ${safeBeneficiaryName}`,

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

        console.error(
          "Automatic refund for rejected transfer failed:",
          refundResult.error,
        );

        await supabase
          .from("transactions")
          .update({
            status:
              "pending",

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


        await createTransactionNotification({
          supabase,

          userId:
            user.id,

          transactionId,

          type:
            "transaction_refund_pending",

          title:
            "Transfer refund pending",

          message:
            `Your transfer to ${safeBeneficiaryName} could not be completed. Your refund requires reconciliation.`,

          amount:
            totalCharged,

          metadata: {
            reference,

            transfer_amount:
              amount,

            total_charged:
              totalCharged,

            beneficiary_name:
              safeBeneficiaryName,

            status:
              "refund_pending",

            direction:
              "outgoing",

            refund_required:
              true,
          },
        });


        return json(
          {
            success:
              false,

            status:
              "refund_pending",

            code:
              "REFUND_PENDING",

            error:
              "The transfer could not be completed and your refund requires reconciliation.",

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
          status:
            "failed",

          metadata: {
            ...historyMetadata,

            transaction_id:
              transactionId,

            status:
              "failed",

            /*
             * Internal provider details are retained
             * for reconciliation/debugging.
             *
             * They are NOT returned by the API.
             */
            provider_error:
              providerError,

            refunded:
              true,

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


      // ======================================================
      // PROVIDER REJECTION NOTIFICATION
      // ======================================================

      await createTransactionNotification({
        supabase,

        userId:
          user.id,

        transactionId,

        type:
          "transaction_failed",

        title:
          "Transfer failed",

        message:
          `Your transfer of ₦${amount.toLocaleString(
            "en-NG",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )} to ${safeBeneficiaryName} was rejected. ₦${totalCharged.toLocaleString(
            "en-NG",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )} has been refunded to your wallet.`,

        amount:
          totalCharged,

        metadata: {
          reference,

          transfer_amount:
            amount,

          total_charged:
            totalCharged,

          beneficiary_name:
            safeBeneficiaryName,

          /*
           * Provider error intentionally NOT stored
           * in user-facing notification metadata.
           */

          status:
            "failed",

          refunded:
            true,

          direction:
            "outgoing",
        },
      });


      return json({
        success:
          false,

        status:
          "failed",

        refunded:
          true,

        reference,

        transaction_id:
          transactionId,

        refund_amount:
          totalCharged,
      });
    }


    // ========================================================
    // ACCEPTED BY FLUTTERWAVE
    // ========================================================

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
     *
     * Flutterwave can return 200 / success while the
     * transfer is still queued.
     */


    const pendingMetadata =
      createHistoryMetadata({
        transactionId,

        reference,

        senderName,

        beneficiaryName:
          safeBeneficiaryName,

        accountNumber,

        accountBank,

        amount,

        iyanjupayFee,

        electronicFee,

        totalCharged,

        status:
          "pending",
      });


    await supabase
      .from("transactions")
      .update({
        status:
          "pending",

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

          /*
           * Full provider response is retained internally
           * for reconciliation/debugging.
           *
           * It is NOT returned to the frontend here.
           */
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


    // ========================================================
    // IMPORTANT:
    // ========================================================
    //
    // The pending notification was already created after
    // wallet debit.
    //
    // We deliberately DO NOT create another pending
    // notification here.
    //
    // This prevents:
    //
    // Transfer initiated
    // Transfer initiated
    //
    // from appearing twice.
    //
    // The Flutterwave webhook should later create/update
    // the SUCCESSFUL or FAILED notification.
    // ========================================================


    // ========================================================
    // RESPONSE
    // ========================================================

    return json({
      success:
        true,

      status:
        "pending",

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

      currency:
        "NGN",
    });

  } catch (error) {

    // ========================================================
    // GLOBAL INTERNAL ERROR
    // ========================================================
    //
    // IMPORTANT:
    //
    // Never return error.message to the client.
    //
    // The complete internal error remains available in
    // Supabase Edge Function logs.
    // ========================================================

    console.error(
      "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
      error,
    );

    return json(
      {
        success:
          false,

        code:
          "TEMPORARY_SERVICE_ERROR",

        error:
          TEMPORARY_SERVICE_ERROR,
      },
      503,
    );
  }
});
