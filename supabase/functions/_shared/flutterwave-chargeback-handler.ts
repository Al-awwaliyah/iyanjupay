import { createFlutterwaveNotification } from "./flutterwave-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, flutterwave-signature, verif-hash",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

async function ensureChargebackNotification(
  supabase: any,
  params: {
    userId: string;
    transactionId: string;
    chargeId: string;
    chargebackId: string;
    webhookId: string | null;
    chargebackStatus: string;
    chargebackStage: string;
    chargebackAmount: number;
    chargebackReference: string;
    walletDebitTransactionId: string | null;
    completedAt: string | null;
  },
) {
  const formattedAmount = params.chargebackAmount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  await createFlutterwaveNotification(supabase, {
    kind: "chargeback",
    userId: params.userId,
    transactionId: params.transactionId,
    type: "wallet_chargeback",
    title: "Wallet funding reversed",
    message: `₦${formattedAmount} was reversed from your wallet because the original funding transaction was charged back.`,
    amount: params.chargebackAmount,
    metadata: {
      flutterwave_charge_id: params.chargeId,
      flutterwave_chargeback_id: params.chargebackId,
      flutterwave_webhook_id: params.webhookId,
      chargeback_status: params.chargebackStatus,
      chargeback_stage: params.chargebackStage,
      original_transaction_id: params.transactionId,
      chargeback_reference: params.chargebackReference,
      wallet_debit_transaction_id: params.walletDebitTransactionId,
      created_at: params.completedAt,
    },
  });
}

export async function handleChargebackWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ?? {};

  /*
   * Flutterwave webhook ID
   *
   * This identifies the webhook event itself.
   */

  const webhookId =
    payload?.id
      ? String(payload.id)
      : null;

  /*
   * Chargeback ID
   *
   * This identifies the dispute.
   */

  const chargebackId =
    data?.id
      ? String(data.id)
      : null;

  /*
   * Original Flutterwave charge ID.
   *
   * This identifies the original payment.
   */

  const chargeId =
    data?.charge_id ??
    data?.chargeId ??
    data?.transaction_id ??
    data?.transactionId ??
    null;

  const normalizedChargeId =
    chargeId
      ? String(chargeId)
      : null;

  const chargebackStatus =
    normalizeStatus(
      data?.status,
    ).toLowerCase();

  const chargebackStage =
    normalizeStatus(
      data?.stage,
    ).toLowerCase();

  const chargebackAmount =
    Number(
      data?.amount ?? 0,
    );

  /*
   * ========================================================
   * BASIC VALIDATION
   * ========================================================
   */

  if (!chargebackId) {
    return jsonResponse(
      {
        success: false,
        error:
          "Chargeback ID missing",
      },
      400,
    );
  }

  if (!normalizedChargeId) {
    return jsonResponse(
      {
        success: false,
        error:
          "Original Flutterwave charge ID missing",
        chargeback_id:
          chargebackId,
      },
      400,
    );
  }

  if (
    !Number.isFinite(
      chargebackAmount,
    ) ||
    chargebackAmount <= 0
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Invalid chargeback amount",
        chargeback_id:
          chargebackId,
        charge_id:
          normalizedChargeId,
      },
      400,
    );
  }

  /*
   * ========================================================
   * FIND ORIGINAL WALLET FUNDING TRANSACTION
   * ========================================================
   */

  const {
    data: transactionByProvider,
    error:
      providerLookupError,
  } = await supabase
    .from("transactions")
    .select(`
      id,
      user_id,
      wallet_id,
      amount,
      status,
      reference_number,
      provider,
      provider_reference,
      metadata
    `)
    .eq(
      "provider_reference",
      normalizedChargeId,
    )
    .eq(
      "provider",
      "flutterwave",
    )
    .maybeSingle();

  if (providerLookupError) {
    throw providerLookupError;
  }

  let transaction =
    transactionByProvider;

  /*
   * ========================================================
   * FALLBACK TO DETERMINISTIC FUNDING REFERENCE
   * ========================================================
   */

  if (!transaction) {
    const fundingReference =
      `IYJ-FUND-${normalizedChargeId}`;

    const {
      data: transactionByReference,
      error:
        referenceLookupError,
    } = await supabase
      .from("transactions")
      .select(`
        id,
        user_id,
        wallet_id,
        amount,
        status,
        reference_number,
        provider,
        provider_reference,
        metadata
      `)
      .eq(
        "reference_number",
        fundingReference,
      )
      .maybeSingle();

    if (referenceLookupError) {
      throw referenceLookupError;
    }

    transaction =
      transactionByReference;
  }

  /*
   * Never debit an unknown wallet.
   */

  if (!transaction) {
    console.error(
      "Chargeback original funding transaction not found",
      {
        webhook_id:
          webhookId,

        chargeback_id:
          chargebackId,

        charge_id:
          normalizedChargeId,
      },
    );

    return jsonResponse({
      success: true,

      pending_reconciliation:
        true,

      reason:
        "Original wallet funding transaction not found",

      webhook_id:
        webhookId,

      chargeback_id:
        chargebackId,

      charge_id:
        normalizedChargeId,
    });
  }

  /*
   * ========================================================
   * PROVIDER VALIDATION
   * ========================================================
   */

  if (
    transaction.provider &&
    String(
      transaction.provider,
    ).toLowerCase() !==
      "flutterwave"
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Chargeback transaction provider mismatch",
        transaction_id:
          transaction.id,
      },
      409,
    );
  }

  /*
   * ========================================================
   * METADATA
   * ========================================================
   */

  const metadata =
    transaction.metadata &&
    typeof transaction.metadata ===
      "object"
      ? {
          ...transaction.metadata,
        }
      : {};

  /*
   * ========================================================
   * FIRST IDEMPOTENCY PROTECTION
   *
   * If this original funding transaction has already been
   * reversed for a chargeback, DO NOT TOUCH THE WALLET.
   * ========================================================
   */

  if (
    metadata?.chargeback_processed ===
    true
  ) {
    await ensureChargebackNotification(supabase, {
      userId: transaction.user_id,
      transactionId: transaction.id,
      chargeId: normalizedChargeId,
      chargebackId: String(metadata?.chargeback_id ?? chargebackId),
      webhookId: metadata?.chargeback_webhook_id ?? webhookId,
      chargebackStatus: String(metadata?.chargeback_status ?? chargebackStatus),
      chargebackStage: String(metadata?.chargeback_stage ?? chargebackStage),
      chargebackAmount: Number(metadata?.chargeback_amount ?? chargebackAmount),
      chargebackReference: String(metadata?.chargeback_reference ?? `CHARGEBACK-${normalizedChargeId}`),
      walletDebitTransactionId: metadata?.chargeback_debit_transaction_id
        ? String(metadata.chargeback_debit_transaction_id)
        : null,
      completedAt: metadata?.chargeback_completed_at
        ? String(metadata.chargeback_completed_at)
        : null,
    });

    return jsonResponse({
      success: true,

      already_processed:
        true,

      chargeback_processed:
        true,

      webhook_id:
        webhookId,

      chargeback_id:
        chargebackId,

      charge_id:
        normalizedChargeId,

      transaction_id:
        transaction.id,

      chargeback_status:
        chargebackStatus,

      chargeback_stage:
        chargebackStage,

      chargeback_amount:
        metadata?.chargeback_amount ??
        chargebackAmount,
    });
  }

  /*
   * SECOND METADATA PROTECTION
   *
   * Useful if a transaction was partially updated during
   * a previous processing attempt.
   */

  if (
    metadata?.chargeback_id ===
      chargebackId &&
    metadata?.chargeback_debit_completed ===
      true
  ) {
    await ensureChargebackNotification(supabase, {
      userId: transaction.user_id,
      transactionId: transaction.id,
      chargeId: normalizedChargeId,
      chargebackId: String(metadata?.chargeback_id ?? chargebackId),
      webhookId: metadata?.chargeback_webhook_id ?? webhookId,
      chargebackStatus: String(metadata?.chargeback_status ?? chargebackStatus),
      chargebackStage: String(metadata?.chargeback_stage ?? chargebackStage),
      chargebackAmount: Number(metadata?.chargeback_amount ?? chargebackAmount),
      chargebackReference: String(metadata?.chargeback_reference ?? `CHARGEBACK-${normalizedChargeId}`),
      walletDebitTransactionId: metadata?.chargeback_debit_transaction_id
        ? String(metadata.chargeback_debit_transaction_id)
        : null,
      completedAt: metadata?.chargeback_completed_at
        ? String(metadata.chargeback_completed_at)
        : null,
    });

    return jsonResponse({
      success: true,

      already_processed:
        true,

      chargeback_processed:
        true,

      webhook_id:
        webhookId,

      chargeback_id:
        chargebackId,

      charge_id:
        normalizedChargeId,

      transaction_id:
        transaction.id,
    });
  }

  /*
   * ========================================================
   * CHARGEBACK LIFECYCLE
   * ========================================================
   *
   * Only accepted/lost cause the customer's wallet funding
   * value to be reversed.
   *
   * initiated/pending:
   *   dispute is still active
   *
   * declined/won:
   *   merchant won / chargeback denied
   *
   * reversed:
   *   previously withheld amount has been restored
   *
   * partially-accepted:
   *   do not automatically assume full amount
   *
   * invalid:
   *   invalid dispute
   */

  const finalDebitStatuses = [
    "accepted",
    "lost",
  ];

  const noDebitStatuses = [
    "initiated",
    "pending",
    "declined",
    "won",
    "reversed",
    "invalid",
    "partially-accepted",
  ];

  /*
   * ========================================================
   * NON-FINAL / NON-DEBIT STATUS
   * ========================================================
   */

  if (
    !finalDebitStatuses.includes(
      chargebackStatus,
    )
  ) {
    const updatedMetadata = {
      ...metadata,

      chargeback_detected:
        true,

      chargeback_id:
        chargebackId,

      chargeback_charge_id:
        normalizedChargeId,

      chargeback_amount:
        chargebackAmount,

      chargeback_status:
        chargebackStatus,

      chargeback_stage:
        chargebackStage,

      chargeback_webhook_id:
        webhookId,

      chargeback_last_updated_at:
        new Date().toISOString(),

      chargeback_processed:
        false,

      chargeback_debit_completed:
        false,

      /*
       * Explicit state.
       */

      chargeback_pending:
        chargebackStatus ===
        "initiated" ||
        chargebackStatus ===
        "pending",

      chargeback_won:
        chargebackStatus ===
          "won" ||
        chargebackStatus ===
          "declined",

      chargeback_reversed:
        chargebackStatus ===
        "reversed",
    };

    const {
      error: updateError,
    } = await supabase
      .from("transactions")
      .update({
        metadata:
          updatedMetadata,
      })
      .eq(
        "id",
        transaction.id,
      );

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({
      success: true,

      chargeback_recorded:
        true,

      debit_required:
        false,

      webhook_id:
        webhookId,

      chargeback_id:
        chargebackId,

      charge_id:
        normalizedChargeId,

      transaction_id:
        transaction.id,

      status:
        chargebackStatus,

      stage:
        chargebackStage,

      amount:
        chargebackAmount,
    });
  }

  /*
   * ========================================================
   * FINAL CHARGEBACK
   *
   * ACCEPTED / LOST
   * ========================================================
   */

  const originalFundingAmount =
    Number(
      metadata?.transfer_amount ??
        metadata?.amount ??
        transaction.amount ??
        0,
    );

  if (
    !Number.isFinite(
      originalFundingAmount,
    ) ||
    originalFundingAmount <= 0
  ) {
    return jsonResponse(
      {
        success: false,

        error:
          "Original funding amount is invalid",

        webhook_id:
          webhookId,

        chargeback_id:
          chargebackId,

        charge_id:
          normalizedChargeId,

        transaction_id:
          transaction.id,
      },
      409,
    );
  }

  /*
   * ========================================================
   * AMOUNT VALIDATION
   * ========================================================
   *
   * A chargeback must not remove more value than the
   * original funding transaction.
   */

  if (
    chargebackAmount >
    originalFundingAmount + 0.01
  ) {
    return jsonResponse(
      {
        success: false,

        error:
          "Chargeback amount exceeds original funding amount",

        original_amount:
          originalFundingAmount,

        chargeback_amount:
          chargebackAmount,

        webhook_id:
          webhookId,

        chargeback_id:
          chargebackId,

        charge_id:
          normalizedChargeId,

        transaction_id:
          transaction.id,
      },
      409,
    );
  }

  /*
   * ========================================================
   * DETERMINISTIC IDEMPOTENCY
   * ========================================================
   *
   * IMPORTANT:
   *
   * Use the ORIGINAL FLUTTERWAVE CHARGE ID here.
   *
   * Do NOT use the chargeback webhook ID.
   *
   * If Flutterwave sends the same chargeback again:
   *
   * CHARGEBACK_chg_xxx
   *
   * remains identical.
   * ========================================================
   */

  const chargebackIdempotencyKey =
    `CHARGEBACK_${normalizedChargeId}`;

  const chargebackReference =
    `CHARGEBACK-${normalizedChargeId}`;

  /*
   * ========================================================
   * WALLET DEBIT
   *
   * SECOND / FINANCIAL IDEMPOTENCY PROTECTION
   * ========================================================
   */

  const {
    data: debitResult,
    error: debitError,
  } = await supabase.rpc(
    "wallet_operation",
    {
      _user_id:
        transaction.user_id,

      _operation:
        "DEBIT",

      _amount:
        chargebackAmount,

      _description:
        "Wallet funding reversed due to Flutterwave chargeback",

      _idempotency_key:
        chargebackIdempotencyKey,

      _reference:
        chargebackReference,

      _provider:
        "flutterwave",

      _provider_reference:
        normalizedChargeId,

      _category:
        "wallet_funding_chargeback",

      _metadata: {
        original_transaction_id:
          transaction.id,

        original_funding_reference:
          transaction.reference_number,

        flutterwave_charge_id:
          normalizedChargeId,

        flutterwave_chargeback_id:
          chargebackId,

        flutterwave_webhook_id:
          webhookId,

        chargeback_status:
          chargebackStatus,

        chargeback_stage:
          chargebackStage,

        original_funding_amount:
          originalFundingAmount,

        chargeback_amount:
          chargebackAmount,

        reason:
          "Flutterwave wallet funding chargeback",

        currency:
          "NGN",

        idempotency_key:
          chargebackIdempotencyKey,
      },
    },
  );

  /*
   * ========================================================
   * DEBIT FAILED
   * ========================================================
   */

  if (
    debitError ||
    !debitResult
  ) {
    console.error(
      "Chargeback wallet debit failed:",
      debitError,
    );

    const pendingMetadata = {
      ...metadata,

      chargeback_detected:
        true,

      chargeback_id:
        chargebackId,

      chargeback_charge_id:
        normalizedChargeId,

      chargeback_webhook_id:
        webhookId,

      chargeback_amount:
        chargebackAmount,

      chargeback_status:
        chargebackStatus,

      chargeback_stage:
        chargebackStage,

      chargeback_processed:
        false,

      chargeback_debit_completed:
        false,

      chargeback_pending:
        true,

      chargeback_debit_error:
        debitError?.message ??
        "Wallet debit failed",

      chargeback_idempotency_key:
        chargebackIdempotencyKey,

      chargeback_reference:
        chargebackReference,

      chargeback_last_attempt_at:
        new Date().toISOString(),
    };

    await supabase
      .from("transactions")
      .update({
        metadata:
          pendingMetadata,
      })
      .eq(
        "id",
        transaction.id,
      );

    /*
     * Return 503 so the webhook can be retried.
     *
     * The same idempotency key means the retry is safe.
     */

    return jsonResponse(
      {
        success: false,

        status:
          "chargeback_pending",

        error:
          "Chargeback received but wallet reversal could not be completed",

        webhook_id:
          webhookId,

        chargeback_id:
          chargebackId,

        charge_id:
          normalizedChargeId,

        transaction_id:
          transaction.id,

        chargeback_amount:
          chargebackAmount,
      },
      503,
    );
  }

  /*
   * ========================================================
   * WALLET DEBIT COMPLETED
   * ========================================================
   */

  const completedAt =
    new Date().toISOString();

  const walletDebitTransactionId =
    debitResult?.transaction_id ??
    debitResult?.id ??
    null;

  const completedMetadata = {
    ...metadata,

    history_version: 1,

    status:
      "chargeback",

    /*
     * Chargeback details
     */

    chargeback_detected:
      true,

    chargeback_id:
      chargebackId,

    chargeback_charge_id:
      normalizedChargeId,

    chargeback_webhook_id:
      webhookId,

    chargeback_amount:
      chargebackAmount,

    chargeback_status:
      chargebackStatus,

    chargeback_stage:
      chargebackStage,

    /*
     * Critical idempotency state
     */

    chargeback_processed:
      true,

    chargeback_debit_completed:
      true,

    chargeback_pending:
      false,

    chargeback_idempotency_key:
      chargebackIdempotencyKey,

    chargeback_reference:
      chargebackReference,

    chargeback_completed_at:
      completedAt,

    chargeback_debit_transaction_id:
      walletDebitTransactionId,

    /*
     * History
     */

    history_amount:
      chargebackAmount,

    history_sign:
      "-",

    history_amount_display:
      `-₦${chargebackAmount.toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}`,
  };

  /*
   * ========================================================
   * UPDATE ORIGINAL FUNDING TRANSACTION
   * ========================================================
   */

  const {
    error: updateError,
  } = await supabase
    .from("transactions")
    .update({
      metadata:
        completedMetadata,
    })
    .eq(
      "id",
      transaction.id,
    );

  if (updateError) {
    /*
     * The wallet debit has already happened.
     *
     * NEVER attempt another debit.
     *
     * The deterministic idempotency key protects the
     * financial operation.
     */

    console.error(
      "Chargeback transaction metadata update failed:",
      updateError,
    );

    return jsonResponse(
      {
        success: false,
        retryable: true,
        debit_completed: true,
        error:
          "Wallet chargeback debit completed but transaction metadata update failed; retry is safe because the debit uses a deterministic idempotency key",
        webhook_id: webhookId,
        chargeback_id: chargebackId,
        charge_id: normalizedChargeId,
        transaction_id: transaction.id,
        chargeback_amount: chargebackAmount,
      },
      503,
    );
  }

  /*
   * ========================================================
   * CREATE / REPAIR NOTIFICATION
   * ========================================================
   *
   * If notification insertion fails, throw so the durable queue
   * retries. The early idempotency branch above repairs this
   * notification without repeating the wallet debit.
   */

  await ensureChargebackNotification(supabase, {
    userId: transaction.user_id,
    transactionId: transaction.id,
    chargeId: normalizedChargeId,
    chargebackId,
    webhookId,
    chargebackStatus,
    chargebackStage,
    chargebackAmount,
    chargebackReference,
    walletDebitTransactionId,
    completedAt,
  });

  /*
   * ========================================================
   * SUCCESS
   * ========================================================
   */

  return jsonResponse({
    success: true,

    chargeback_processed:
      true,

    already_processed:
      debitResult?.already_processed ===
      true,

    webhook_id:
      webhookId,

    chargeback_id:
      chargebackId,

    charge_id:
      normalizedChargeId,

    transaction_id:
      transaction.id,

    user_id:
      transaction.user_id,

    chargeback_amount:
      chargebackAmount,

    chargeback_status:
      chargebackStatus,

    chargeback_stage:
      chargebackStage,

    wallet_debit_transaction_id:
      walletDebitTransactionId,

    idempotency_key:
      chargebackIdempotencyKey,
  });
}

