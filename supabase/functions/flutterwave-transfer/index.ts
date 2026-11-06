
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const TEMPORARY_SERVICE_ERROR =
  "We're experiencing a temporary technical issue. Please try again in a few minutes.";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function maskAccountNumber(accountNumber: string): string {
  const clean = String(accountNumber ?? "").replace(/\D/g, "");
  return clean.length < 4 ? clean : `xxxxxx${clean.slice(-4)}`;
}

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
    if (transactionId) {
      const { data: existing, error: existingError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("transaction_id", transactionId)
        .eq("type", type)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error("Notification duplicate check failed:", existingError);
      }

      if (existing?.id) {
        return { success: true, already_exists: true, id: existing.id };
      }
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        transaction_id: transactionId,
        type,
        title,
        message,
        amount: amount == null ? null : roundMoney(amount),
        is_read: false,
        metadata,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Transaction notification creation failed:", error);
      return { success: false, error: error.message };
    }

    return { success: true, already_exists: false, id: data?.id ?? null };
  } catch (error) {
    console.error("Unexpected notification error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Notification creation failed.",
    };
  }
}

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
    account_number_masked: maskAccountNumber(accountNumber),
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
    history_amount_display: `-₦${totalCharged.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    provider_transfer_amount: amount,
    flutterwave_transfer_amount: amount,
    created_for_history: true,
  };
}

async function releaseKycReservation(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  amount: number,
  reservationKey: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc(
      "release_kyc_daily_transfer_v2",
      {
        _user_id: userId,
        _amount: amount,
        _reservation_key: reservationKey,
      },
    );

    if (error || !data?.success) {
      console.error("KYC reservation release failed:", error || data);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Unexpected KYC reservation release error:", error);
    return false;
  }
}

async function issueRefund(params: {
  supabase: ReturnType<typeof adminClient>;
  userId: string;
  transactionId: string;
  reference: string;
  amount: number;
  totalCharged: number;
  iyanjupayFee: number;
  electronicFee: number;
  beneficiaryName: string;
  providerReason: string;
  providerResponse?: unknown;
}) {
  const {
    supabase,
    userId,
    transactionId,
    reference,
    amount,
    totalCharged,
    iyanjupayFee,
    electronicFee,
    beneficiaryName,
    providerReason,
    providerResponse,
  } = params;

  return await supabase.rpc("wallet_operation", {
    _user_id: userId,
    _operation: "REFUND",
    _amount: totalCharged,
    _description: `Refund for failed transfer to ${beneficiaryName}`,
    _idempotency_key: `REFUND_${transactionId}`,
    _reference: `REFUND_${reference}`,
    _provider: "flutterwave",
    _category: "transfer_refund",
    _metadata: {
      original_transaction_id: transactionId,
      original_reference: reference,
      original_transfer_amount: amount,
      original_fee: iyanjupayFee,
      original_electronic_fee: electronicFee,
      original_total_charged: totalCharged,
      reason: providerReason,
      provider_response: providerResponse ?? null,
      refunded_amount: totalCharged,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const user = await getUser(req);

    if (!user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const supabase = adminClient();

    const { data: senderProfile, error: senderProfileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (senderProfileError) {
      console.error("Sender profile lookup failed:", senderProfileError);
      return json({
        success: false,
        error: "Unable to retrieve your profile information.",
      }, 500);
    }

    const senderName = String(senderProfile?.full_name ?? "").trim();

    if (!senderName) {
      return json({
        success: false,
        error: "Your profile name is required before you can make a bank transfer.",
      }, 400);
    }

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Invalid JSON request body." }, 400);
    }

    const amount = roundMoney(Number(body?.amount));

    const accountNumber = String(
      body?.account_number ?? body?.accountNumber ?? "",
    ).replace(/\D/g, "");

    const accountBank = String(
      body?.account_bank ?? body?.bank_code ?? body?.bankCode ?? "",
    ).trim();

    const beneficiaryName = String(
      body?.beneficiary_name ??
      body?.beneficiaryName ??
      body?.account_name ??
      body?.accountName ??
      body?.bank_account_name ??
      body?.recipient_name ??
      body?.recipientName ??
      "",
    ).trim();

    const safeBeneficiaryName = beneficiaryName || "Bank Transfer";

    const clientIdempotencyKey = String(
      body?.idempotency_key ?? body?.idempotencyKey ?? "",
    ).trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({
        success: false,
        error: "Transfer amount must be greater than zero.",
      }, 400);
    }

    if (Math.round(amount * 100) !== amount * 100) {
      return json({
        success: false,
        error: "Transfer amount cannot have more than 2 decimal places.",
      }, 400);
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return json({
        success: false,
        error: "Account number must contain exactly 10 digits.",
      }, 400);
    }

    if (!/^\d+$/.test(accountBank)) {
      return json({ success: false, error: "Invalid bank code." }, 400);
    }

    const iyanjupayFee = IYANJUPAY_TRANSFER_FEE;
    const electronicFee = amount > ELECTRONIC_FEE_THRESHOLD
      ? ELECTRONIC_FEE
      : 0;

    const totalCharged = roundMoney(amount + iyanjupayFee + electronicFee);

    const reference = `IYJ-${crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase()}`;

    const transferKey = clientIdempotencyKey ||
      `TRANSFER_${user.id}_${crypto.randomUUID()}`;

    const kycReservationKey = transferKey;
    const narration = `${senderName} - IyanjuPay`;

    let balanceResponse: any;

    try {
      balanceResponse = await flw("/balances", { method: "GET" });
    } catch (error) {
      console.error("Flutterwave balance request failed:", error);
      return json({
        success: false,
        code: "TEMPORARY_SERVICE_ERROR",
        error: TEMPORARY_SERVICE_ERROR,
      }, 503);
    }

    if (!balanceResponse.ok || balanceResponse.body?.status !== "success") {
      console.error("Flutterwave balance verification failed:", {
        reference,
        user_id: user.id,
        provider_status: balanceResponse.body?.status ?? null,
        provider_message: balanceResponse.body?.message ?? null,
        provider_response: balanceResponse.body ?? null,
      });

      return json({
        success: false,
        code: "TEMPORARY_SERVICE_ERROR",
        error: TEMPORARY_SERVICE_ERROR,
      }, 503);
    }

    const balanceData = balanceResponse.body?.data;
    let ngnBalance: any = null;

    if (Array.isArray(balanceData)) {
      ngnBalance = balanceData.find(
        (item: any) => String(item?.currency ?? "").toUpperCase() === "NGN",
      );
    } else if (
      balanceData &&
      typeof balanceData === "object" &&
      String(balanceData?.currency ?? "").toUpperCase() === "NGN"
    ) {
      ngnBalance = balanceData;
    }

    const flutterwaveAvailableBalance = Number(
      ngnBalance?.available_balance ?? 0,
    );
    const flutterwaveLedgerBalance = Number(
      ngnBalance?.ledger_balance ?? 0,
    );

    if (!Number.isFinite(flutterwaveAvailableBalance)) {
      console.error("Flutterwave available balance could not be determined:", {
        reference,
        user_id: user.id,
        available_balance: ngnBalance?.available_balance ?? null,
        ledger_balance: ngnBalance?.ledger_balance ?? null,
        provider_response: balanceResponse.body ?? null,
      });

      return json({
        success: false,
        code: "TEMPORARY_SERVICE_ERROR",
        error: TEMPORARY_SERVICE_ERROR,
      }, 503);
    }

    if (flutterwaveAvailableBalance < amount) {
      console.error("Flutterwave payout balance is insufficient:", {
        reference,
        user_id: user.id,
        transfer_amount: amount,
        flutterwave_available_balance: flutterwaveAvailableBalance,
        flutterwave_ledger_balance: flutterwaveLedgerBalance,
      });

      return json({
        success: false,
        code: "TEMPORARY_SERVICE_ERROR",
        error: TEMPORARY_SERVICE_ERROR,
      }, 503);
    }

    // Reserve the user's daily KYC transfer limit.
    const { data: kycReservation, error: kycReservationError } =
      await supabase.rpc("reserve_kyc_daily_transfer_v2", {
        _user_id: user.id,
        _amount: amount,
        _reservation_key: kycReservationKey,
      });

    if (kycReservationError) {
      console.error("KYC reservation failed:", kycReservationError);
      return json({
        success: false,
        stage: "kyc_limit",
        error: "Unable to reserve your daily transfer limit. Please try again.",
      }, 503);
    }

    if (!kycReservation?.success || !kycReservation?.allowed) {
      return json({
        success: false,
        stage: "kyc_limit",
        error: kycReservation?.error ?? "Daily transfer limit exceeded.",
        kyc_level: kycReservation?.kyc_level ?? null,
        daily_limit: kycReservation?.daily_limit ?? null,
        remaining: kycReservation?.remaining ?? null,
        requested_amount: amount,
        currency: "NGN",
      }, 400);
    }

    let kycReservationActive = true;

    const releaseReservation = async () => {
      if (!kycReservationActive) return true;

      const released = await releaseKycReservation(
        supabase,
        user.id,
        amount,
        kycReservationKey,
      );

      if (released) kycReservationActive = false;
      return released;
    };

    const historyMetadata = createHistoryMetadata({
      transactionId: "PENDING",
      reference,
      senderName,
      beneficiaryName: safeBeneficiaryName,
      accountNumber,
      accountBank,
      amount,
      iyanjupayFee,
      electronicFee,
      totalCharged,
      status: "pending",
    });

    // Debit the user's wallet.
    const { data: debitTransaction, error: debitError } =
      await supabase.rpc("wallet_operation", {
        _user_id: user.id,
        _operation: "DEBIT",
        _amount: totalCharged,
        _description: `Transfer to ${safeBeneficiaryName}`,
        _idempotency_key: transferKey,
        _reference: reference,
        _provider: "flutterwave",
        _category: "transfer",
        _metadata: {
          ...historyMetadata,
          kyc_limit_reserved: true,
          kyc_reserved_amount: amount,
          kyc_reservation_key: kycReservationKey,
          kyc_limit_completed: false,
          kyc_limit_released: false,
          flutterwave_transfer_amount: amount,
          flutterwave_available_balance: flutterwaveAvailableBalance,
          flutterwave_ledger_balance: flutterwaveLedgerBalance,
          beneficiary_name_provided: Boolean(beneficiaryName),
          status: "pending",
        },
      });

    if (debitError) {
      await releaseReservation();
      console.error("Wallet debit failed:", debitError);

      return json({
        success: false,
        stage: "wallet_debit",
        error: "Unable to complete the transfer. Please try again.",
      }, 400);
    }

    if (!debitTransaction?.id) {
      await releaseReservation();
      console.error("Wallet debit did not return a transaction:", {
        reference,
        user_id: user.id,
      });

      return json({
        success: false,
        error: "Unable to complete the transfer. Please try again.",
      }, 500);
    }

    const transactionId = String(debitTransaction.id);

    // Submit transfer to Flutterwave.
    let flutterwaveResponse: any;

    try {
      flutterwaveResponse = await flw("/transfers", {
        method: "POST",
        body: JSON.stringify({
          account_bank: accountBank,
          account_number: accountNumber,
          amount,
          currency: "NGN",
          debit_currency: "NGN",
          beneficiary_name: safeBeneficiaryName,
          narration,
          reference,
          meta: [
            { key: "sender_name", value: senderName },
            { key: "sender_platform", value: "IyanjuPay" },
            { key: "iyanjupay_reference", value: reference },
            { key: "iyanjupay_transaction_id", value: transactionId },
            { key: "iyanjupay_transfer_amount", value: String(amount) },
          ],
        }),
      });
    } catch (error) {
      /*
       * A network exception does not prove that Flutterwave rejected
       * the transfer. It may have accepted it before the connection
       * timed out. Never refund or release the KYC reservation here.
       */
      console.error("Flutterwave transfer submission outcome is unknown:", {
        reference,
        transaction_id: transactionId,
        error,
      });

      const { data: currentTransaction, error: lookupError } = await supabase
        .from("transactions")
        .select("id,status,metadata")
        .eq("id", transactionId)
        .maybeSingle();

      if (lookupError) {
        console.error(
          "Unable to read transaction after ambiguous Flutterwave submission:",
          lookupError,
        );
      } else if (currentTransaction?.status === "pending") {
        const existingMetadata =
          currentTransaction.metadata &&
          typeof currentTransaction.metadata === "object"
            ? currentTransaction.metadata
            : {};

        const reconciliationMetadata = {
          ...existingMetadata,
          ...historyMetadata,
          transaction_id: transactionId,
          reference,
          status: "pending",
          provider: "flutterwave",
          provider_submission_unknown: true,
          provider_reconciliation_pending: true,
          provider_submission_error:
            error instanceof Error ? error.message : String(error),
          provider_submission_unknown_at: new Date().toISOString(),
          kyc_limit_reserved: true,
          kyc_reserved_amount: amount,
          kyc_reservation_key: kycReservationKey,
          kyc_limit_completed: false,
          kyc_limit_released: false,
          refund_required: false,
          refund_pending: false,
          refunded: false,
        };

        const { error: metadataUpdateError } = await supabase
          .from("transactions")
          .update({
            provider: "flutterwave",
            metadata: reconciliationMetadata,
          })
          .eq("id", transactionId)
          .eq("status", "pending");

        if (metadataUpdateError) {
          console.error(
            "Unable to save ambiguous provider submission metadata:",
            metadataUpdateError,
          );
        }
      } else if (currentTransaction) {
        console.log(
          "Transaction was already finalized while Flutterwave submission was in progress:",
          {
            transaction_id: transactionId,
            status: currentTransaction.status,
          },
        );
      }

      return json({
        success: true,
        status: "pending",
        code: "PROVIDER_SUBMISSION_UNKNOWN",
        message:
          "Your transfer request is being reconciled. Please check your transaction history before trying again.",
        transaction_id: transactionId,
        reference,
        reconciliation_pending: true,
      }, 202);
    }

    const flutterwaveData = flutterwaveResponse.body;

    // Flutterwave explicitly rejected the transfer.
    if (!flutterwaveResponse.ok || flutterwaveData?.status !== "success") {
      const providerError =
        flutterwaveData?.message ??
        flutterwaveData?.error?.message ??
        flutterwaveData?.error ??
        "Flutterwave could not initiate the transfer.";

      console.error("Flutterwave rejected transfer:", {
        reference,
        transaction_id: transactionId,
        provider_error: providerError,
        provider_response: flutterwaveData,
      });

      const refundResult = await issueRefund({
        supabase,
        userId: user.id,
        transactionId,
        reference,
        amount,
        totalCharged,
        iyanjupayFee,
        electronicFee,
        beneficiaryName: safeBeneficiaryName,
        providerReason: String(providerError),
        providerResponse: flutterwaveData,
      });

      if (refundResult.error || !refundResult.data) {
        console.error(
          "Automatic refund for rejected transfer failed:",
          refundResult.error,
        );

        const { data: latest, error: latestError } = await supabase
          .from("transactions")
          .select("metadata,status")
          .eq("id", transactionId)
          .maybeSingle();

        const existingMetadata =
          latest?.metadata && typeof latest.metadata === "object"
            ? latest.metadata
            : {};

        if (!latestError && latest?.status === "pending") {
          await supabase
            .from("transactions")
            .update({
              status: "pending",
              metadata: {
                ...existingMetadata,
                ...historyMetadata,
                transaction_id: transactionId,
                kyc_reservation_key: kycReservationKey,
                refund_required: true,
                refund_pending: true,
                refund_amount: totalCharged,
                refund_error:
                  refundResult.error?.message ?? "Refund did not complete",
                provider_error: String(providerError),
              },
            })
            .eq("id", transactionId)
            .eq("status", "pending");
        }

        await createTransactionNotification({
          supabase,
          userId: user.id,
          transactionId,
          type: "transaction_refund_pending",
          title: "Transfer refund pending",
          message: `Your transfer to ${safeBeneficiaryName} could not be completed. Your refund requires reconciliation.`,
          amount: totalCharged,
          metadata: {
            reference,
            transfer_amount: amount,
            total_charged: totalCharged,
            beneficiary_name: safeBeneficiaryName,
            status: "refund_pending",
            direction: "outgoing",
            refund_required: true,
          },
        });

        return json({
          success: false,
          status: "refund_pending",
          code: "REFUND_PENDING",
          error:
            "The transfer could not be completed and your refund requires reconciliation.",
          reference,
          transaction_id: transactionId,
        }, 503);
      }

      const released = await releaseReservation();

      const { data: latest, error: latestError } = await supabase
        .from("transactions")
        .select("metadata,status")
        .eq("id", transactionId)
        .maybeSingle();

      if (latestError) {
        console.error("Unable to inspect rejected transfer after refund:", latestError);
      } else if (latest?.status === "pending") {
        const existingMetadata =
          latest.metadata && typeof latest.metadata === "object"
            ? latest.metadata
            : {};

        await supabase
          .from("transactions")
          .update({
            status: "failed",
            metadata: {
              ...existingMetadata,
              ...historyMetadata,
              transaction_id: transactionId,
              status: "failed",
              provider_error: String(providerError),
              refunded: true,
              refund_amount: totalCharged,
              kyc_reservation_key: kycReservationKey,
              kyc_limit_released: released,
              kyc_limit_release_pending: !released,
            },
          })
          .eq("id", transactionId)
          .eq("status", "pending");
      }

      await createTransactionNotification({
        supabase,
        userId: user.id,
        transactionId,
        type: "transaction_failed",
        title: "Transfer failed",
        message: `Your transfer of ₦${amount.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} to ${safeBeneficiaryName} was rejected. ₦${totalCharged.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} has been refunded to your wallet.`,
        amount: totalCharged,
        metadata: {
          reference,
          transfer_amount: amount,
          total_charged: totalCharged,
          beneficiary_name: safeBeneficiaryName,
          status: "failed",
          refunded: true,
          direction: "outgoing",
        },
      });

      return json({
        success: false,
        status: "failed",
        refunded: true,
        reference,
        transaction_id: transactionId,
        refund_amount: totalCharged,
        kyc_limit_released: released,
      });
    }

    // Flutterwave accepted the transfer; it is not yet confirmed successful.
    const flutterwaveTransferId = flutterwaveData?.data?.id
      ? String(flutterwaveData.data.id)
      : null;

    const transferStatus = String(
      flutterwaveData?.data?.status ?? "NEW",
    ).toUpperCase();

    const pendingMetadata = {
      ...createHistoryMetadata({
        transactionId,
        reference,
        senderName,
        beneficiaryName: safeBeneficiaryName,
        accountNumber,
        accountBank,
        amount,
        iyanjupayFee,
        electronicFee,
        totalCharged,
        status: "pending",
      }),
      flutterwave_transfer_id: flutterwaveTransferId,
      flutterwave_status: transferStatus,
      flutterwave_response: flutterwaveData,
      kyc_limit_reserved: true,
      kyc_reserved_amount: amount,
      kyc_reservation_key: kycReservationKey,
      kyc_limit_completed: false,
      kyc_limit_released: false,
      electronic_fee_due: electronicFee,
      provider_submission_unknown: false,
      provider_reconciliation_pending: false,
    };

    /*
     * Re-read and merge metadata before updating. Only update while
     * the transaction remains pending so a finalized transaction
     * cannot be downgraded.
     */
    const { data: latestTransaction, error: latestTransactionError } =
      await supabase
        .from("transactions")
        .select("id,status,metadata")
        .eq("id", transactionId)
        .maybeSingle();

    if (latestTransactionError) {
      console.error(
        "Unable to read transaction before pending metadata update:",
        latestTransactionError,
      );
    } else if (latestTransaction?.status === "pending") {
      const existingMetadata =
        latestTransaction.metadata &&
        typeof latestTransaction.metadata === "object"
          ? latestTransaction.metadata
          : {};

      const mergedPendingMetadata = {
        ...existingMetadata,
        ...pendingMetadata,
      };

      const { data: pendingUpdate, error: pendingUpdateError } =
        await supabase
          .from("transactions")
          .update({
            provider: "flutterwave",
            provider_reference: flutterwaveTransferId,
            metadata: mergedPendingMetadata,
          })
          .eq("id", transactionId)
          .eq("status", "pending")
          .select("id,status")
          .maybeSingle();

      if (pendingUpdateError) {
        console.error(
          "Pending transfer metadata update failed:",
          pendingUpdateError,
        );
      } else if (!pendingUpdate) {
        console.log(
          "Transaction status changed before pending metadata update:",
          transactionId,
        );
      }
    } else if (latestTransaction) {
      console.log("Transfer was already finalized before initiation update:", {
        transaction_id: transactionId,
        current_status: latestTransaction.status,
      });
    }

    return json({
      success: true,
      status: "pending",
      message: "Transfer has been initiated and is being processed.",
      reference,
      transaction_id: transactionId,
      flutterwave_transfer_id: flutterwaveTransferId,
      flutterwave_status: transferStatus,
      transfer_amount: amount,
      fee: iyanjupayFee,
      electronic_fee: electronicFee,
      total_charged: totalCharged,
      currency: "NGN",
    });
  } catch (error) {
    console.error("FLUTTERWAVE TRANSFER INTERNAL ERROR:", error);

    return json({
      success: false,
      code: "TEMPORARY_SERVICE_ERROR",
      error: TEMPORARY_SERVICE_ERROR,
    }, 503);
  }
});
