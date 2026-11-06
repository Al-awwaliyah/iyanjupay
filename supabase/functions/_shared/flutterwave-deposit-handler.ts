import { flw } from "./auth.ts";
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

function maskAccountNumber(accountNumber: string) {
  const value = String(accountNumber ?? "").replace(/\D/g, "");
  if (!value) return "";
  if (value.length <= 4) return value;
  return `xxxxxx${value.slice(-4)}`;
}

function amountsMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

class NeedsReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeedsReviewError";
  }
}

async function createDepositNotification(
  supabase: any,
  params: {
    userId: string;
    transactionId: string;
    amount: number;
    senderName: string;
    reference: string;
    flutterwaveTransactionId: string;
    virtualAccountNumber: string;
  },
): Promise<void> {
  const formattedAmount = params.amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  await createFlutterwaveNotification(supabase, {
    kind: "deposit",
    userId: params.userId,
    transactionId: params.transactionId,
    type: "transaction_success",
    title: "Wallet deposit received",
    message: `Your wallet has been credited with ₦${formattedAmount}${params.senderName ? ` from ${params.senderName}` : ""}.`,
    amount: params.amount,
    metadata: {
      reference: params.reference,
      flutterwave_transaction_id: params.flutterwaveTransactionId,
      amount: params.amount,
      status: "successful",
      transaction_type: "wallet_funding",
      direction: "incoming",
      funding_source: "flutterwave_virtual_account",
      virtual_account_number: params.virtualAccountNumber,
      sender_name: params.senderName,
    },
  });
}

export async function handleDepositWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ?? {};

  const transactionId =
    data?.id
      ? String(data.id)
      : null;

  const webhookStatus =
    normalizeStatus(
      data?.status,
    );

  const webhookAmount =
    Number(
      data?.amount ?? 0,
    );

  const webhookCurrency =
    data?.currency
      ? String(
          data.currency,
        ).toUpperCase()
      : null;

  /*
   * BASIC VALIDATION
   */

  if (!transactionId) {
    return jsonResponse(
      {
        success: false,
        error:
          "Missing Flutterwave transaction ID",
      },
      400,
    );
  }

  if (
    webhookStatus !== "SUCCESSFUL" &&
    webhookStatus !== "SUCCEEDED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      reason:
        "Transaction not successful",
      transaction_id:
        transactionId,
      status:
        webhookStatus,
    });
  }

  if (
    !Number.isFinite(
      webhookAmount,
    ) ||
    webhookAmount <= 0
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Invalid transaction amount",
      },
      400,
    );
  }

  if (
    webhookCurrency &&
    webhookCurrency !== "NGN"
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Unsupported currency",
      },
      400,
    );
  }

  /*
   * ========================================================
   * VERIFY WITH FLUTTERWAVE
   * ========================================================
   */

  let verifyResponse: any;

  try {
    verifyResponse =
      await flw(
        `/transactions/${encodeURIComponent(
          transactionId,
        )}/verify`,
        {
          method: "GET",
        },
      );
  } catch (error) {
    console.error(
      "Flutterwave verification request failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to verify Flutterwave transaction",
      },
      503,
    );
  }

  if (
    !verifyResponse.ok ||
    verifyResponse.body?.status !==
      "success"
  ) {
    console.error(
      "Flutterwave verification failed:",
      verifyResponse.body,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Flutterwave verification failed",
      },
      503,
    );
  }

  const verified =
    verifyResponse.body?.data;

  if (!verified) {
    return jsonResponse(
      {
        success: false,
        error:
          "Missing verified transaction data",
      },
      503,
    );
  }

  /*
   * ========================================================
   * VERIFIED VALIDATION
   * ========================================================
   */

  const verifiedStatus =
    normalizeStatus(
      verified?.status,
    );

  const verifiedAmount =
    Number(
      verified?.amount ?? 0,
    );

  const verifiedCurrency =
    String(
      verified?.currency ?? "",
    ).toUpperCase();

  if (
    verifiedStatus !== "SUCCESSFUL" &&
    verifiedStatus !== "SUCCEEDED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      reason:
        "Verified transaction is not successful",
      transaction_id:
        transactionId,
      status:
        verifiedStatus,
    });
  }

  if (
    !Number.isFinite(
      verifiedAmount,
    ) ||
    verifiedAmount <= 0
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Invalid verified amount",
      },
      400,
    );
  }

  if (
    verifiedCurrency !== "NGN"
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Verified transaction currency is not NGN",
      },
      400,
    );
  }

  if (
    !amountsMatch(
      verifiedAmount,
      webhookAmount,
    )
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Transaction amount mismatch",
        webhook_amount:
          webhookAmount,
        verified_amount:
          verifiedAmount,
      },
      409,
    );
  }

  /*
   * ========================================================
   * PROCESS VERIFIED FUNDING
   * ========================================================
   */

  try {
    const result =
      await processVerifiedFunding(
        supabase,
        {
          transactionId,
          verified,
          webhookData: data,
          webhookMetaData:
            payload?.meta_data ??
            payload?.metaData ??
            data?.meta_data ??
            data?.metaData,
        },
      );

    return jsonResponse(
      result,
      200,
    );
  } catch (error) {
    console.error(
      "Wallet funding processing failed:",
      error,
    );

    if (error instanceof NeedsReviewError) {
      return jsonResponse(
        {
          success: false,
          needs_review: true,
          error: error.message,
          transaction_id: transactionId,
        },
        409,
      );
    }

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Wallet funding failed",
        transaction_id:
          transactionId,
      },
      500,
    );
  }
}

/*
 * ============================================================
 * PROCESS VERIFIED FUNDING
 * ============================================================
 */

async function processVerifiedFunding(
  supabase: any,
  params: {
    transactionId: string;
    verified: any;
    webhookData: any;
    webhookMetaData?: any;
  },
): Promise<Record<string, unknown>> {
  const {
    transactionId,
    verified,
    webhookData,
    webhookMetaData,
  } = params;

  const data =
    webhookData ?? {};

  /*
   * ==========================================================
   * EXTRACT REFERENCES
   * ==========================================================
   */

  const verifiedAmount =
    Number(
      verified?.amount ?? 0,
    );

  const verifiedCurrency =
    String(
      verified?.currency ?? "NGN",
    ).toUpperCase();

  const verifiedTxRef =
    verified?.tx_ref ??
    verified?.txRef ??
    verified?.reference ??
    null;

  const verifiedFlwRef =
    verified?.flw_ref ??
    verified?.flwRef ??
    null;

  const webhookTxRef =
    data?.tx_ref ??
    data?.txRef ??
    data?.reference ??
    null;

  const finalTxRef =
    String(
      verifiedTxRef ??
        webhookTxRef ??
        "",
    ).trim();

  /*
   * ==========================================================
   * FIND VIRTUAL ACCOUNT
   * ==========================================================
   */

  let virtualAccount: any =
    null;

  /*
   * LOOKUP FROM REFERENCE
   */

  if (
    finalTxRef.startsWith(
      "IYJ_VA_",
    )
  ) {
    const parts =
      finalTxRef.split("_");

    /*
     * Format:
     *
     * IYJ_VA_<user_id>
     *
     * UUID contains hyphens but no underscores,
     * so index 2 is safe.
     */

    const possibleUserId =
      parts[2];

    if (possibleUserId) {
      const {
        data: account,
        error,
      } = await supabase
        .from(
          "virtual_accounts",
        )
        .select(`
          id,
          user_id,
          wallet_id,
          provider,
          bank_name,
          account_number,
          account_name,
          provider_reference,
          order_reference,
          is_permanent,
          status
        `)
        .eq(
          "user_id",
          possibleUserId,
        )
        .eq(
          "provider",
          "flutterwave",
        )
        .eq(
          "is_permanent",
          true,
        )
        .eq(
          "status",
          "active",
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      virtualAccount =
        account;
    }
  }

  /*
   * FALLBACK:
   *
   * SEARCH ACCOUNT NUMBER
   */

  if (!virtualAccount) {
    const accountNumbers = [
      data?.account_number,
      data?.accountNumber,
      data?.virtual_account_number,
      data?.virtualAccountNumber,
      data?.destination_account_number,

      verified?.account_number,
      verified?.accountNumber,
      verified?.virtual_account_number,
      verified?.virtualAccountNumber,
      verified?.destination_account_number,

      data?.meta?.account_number,
      data?.meta?.accountNumber,

      verified?.meta?.account_number,
      verified?.meta?.accountNumber,
    ]
      .filter(Boolean)
      .map(
        (value: any) =>
          String(value).trim(),
      );

    const uniqueAccountNumbers =
      [
        ...new Set(
          accountNumbers,
        ),
      ];

    for (
      const accountNumber of
      uniqueAccountNumbers
    ) {
      const {
        data: account,
        error,
      } = await supabase
        .from(
          "virtual_accounts",
        )
        .select(`
          id,
          user_id,
          wallet_id,
          provider,
          bank_name,
          account_number,
          account_name,
          provider_reference,
          order_reference,
          is_permanent,
          status
        `)
        .eq(
          "account_number",
          accountNumber,
        )
        .eq(
          "provider",
          "flutterwave",
        )
        .eq(
          "is_permanent",
          true,
        )
        .eq(
          "status",
          "active",
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (account) {
        virtualAccount =
          account;

        break;
      }
    }
  }

  if (!virtualAccount) {
    throw new Error(
      "Virtual account not found",
    );
  }

  if (
    !virtualAccount.wallet_id
  ) {
    throw new Error(
      "Virtual account has no wallet",
    );
  }

  /*
   * ==========================================================
   * FIND WALLET
   * ==========================================================
   */

  const {
    data: wallet,
    error: walletError,
  } = await supabase
    .from("wallets")
    .select(`
      id,
      user_id,
      balance,
      currency,
      status
    `)
    .eq(
      "id",
      virtualAccount.wallet_id,
    )
    .maybeSingle();

  if (walletError) {
    throw walletError;
  }

  if (!wallet) {
    throw new Error(
      "Wallet not found",
    );
  }

  if (
    wallet.user_id !==
    virtualAccount.user_id
  ) {
    throw new Error(
      "Virtual account ownership mismatch",
    );
  }

  if (
    String(
      wallet.currency,
    ).toUpperCase() !==
    "NGN"
  ) {
    throw new Error(
      "Wallet currency mismatch",
    );
  }

  if (
    String(
      wallet.status,
    ).toLowerCase() !==
    "active"
  ) {
    throw new Error(
      "Wallet is not active",
    );
  }

  /*
   * ==========================================================
   * SENDER INFORMATION
   * ==========================================================
   */

  // Flutterwave's NGN virtual-account webhook places the payer's
  // originating-bank details in the TOP-LEVEL `meta_data` object,
  // not in `data.customer` (which describes the virtual-account
  // customer). Never use the IyanjuPay receiving account as sender data.
  const originator =
    webhookMetaData ??
    data?.meta_data ??
    data?.metaData ??
    verified?.meta_data ??
    verified?.metaData ??
    data?.meta ??
    verified?.meta ??
    {};

  const senderName = String(
    originator?.originatorname ??
      originator?.originator_name ??
      data?.sender_name ??
      data?.sender?.name ??
      data?.bank_transfer?.sender_name ??
      verified?.sender_name ??
      verified?.sender?.name ??
      "",
  ).trim();

  // Flutterwave commonly sends this value already masked (for example,
  // 123*******90). Preserve that masking; if an unmasked number is ever
  // supplied, mask it before persisting it in transaction metadata.
  const rawSenderAccount = String(
    originator?.originatoraccountnumber ??
      originator?.originator_account_number ??
      data?.originatoraccountnumber ??
      data?.sender_account_number ??
      data?.sender?.account_number ??
      data?.bank_transfer?.account_number ??
      verified?.originatoraccountnumber ??
      verified?.sender_account_number ??
      verified?.sender?.account_number ??
      "",
  ).trim();

  const senderAccount = rawSenderAccount
    ? /[*xX•]/.test(rawSenderAccount)
      ? rawSenderAccount
      : maskAccountNumber(rawSenderAccount)
    : "";

  const senderBank = String(
    originator?.bankname ??
      originator?.bank_name ??
      originator?.bankName ??
      data?.sender_bank ??
      data?.sender?.bank_name ??
      data?.bank_transfer?.bank_name ??
      verified?.sender_bank ??
      verified?.sender?.bank_name ??
      "",
  ).trim();

  /*
   * ==========================================================
   * FUNDING REFERENCE
   *
   * Stable and deterministic.
   *
   * Same Flutterwave transaction ID
   * = same funding reference.
   * ==========================================================
   */

  /*
   * ==========================================================
   * CANONICAL FUNDING REFERENCE
   * ==========================================================
   *
   * ONE Flutterwave transaction ID must map to ONE IyanjuPay
   * wallet-funding transaction.
   *
   * This reference is intentionally identical to the historical
   * webhook format already present in the database:
   *
   *   FLW_<flutterwave_transaction_id>
   *
   * The sync function must use this same reference.
   */

  const fundingReference =
    `FLW_${transactionId}`;

  const fundingSelect = `
    id,
    wallet_id,
    amount,
    status,
    reference_number,
    provider,
    transaction_type,
    provider_reference,
    metadata
  `;

  /*
   * ==========================================================
   * IDEMPOTENCY / LEGACY COMPATIBILITY
   * ==========================================================
   *
   * Older versions of the funding flow used:
   *
   *   IYJ-FUND-<transaction_id>
   *
   * and some older records stored the Flutterwave reference
   * instead of the Flutterwave transaction ID.
   *
   * We check all known forms BEFORE calling credit_wallet.
   * This is deliberately read-only and prevents a historical
   * record from being credited again after deployment.
   */

  const existingFundingCandidates: any[] = [];

  const lookupByReference = async (
    reference: string,
  ) => {
    if (!reference) return null;

    const {
      data,
      error,
    } = await supabase
      .from("transactions")
      .select(fundingSelect)
      .eq(
        "reference_number",
        reference,
      )
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  };

  const lookupByProviderReference = async (
    providerReference: string | null,
  ) => {
    if (!providerReference) return null;

    const {
      data,
      error,
    } = await supabase
      .from("transactions")
      .select(fundingSelect)
      .eq(
        "provider",
        "flutterwave",
      )
      .eq(
        "transaction_type",
        "wallet_funding",
      )
      .eq(
        "provider_reference",
        providerReference,
      )
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  };

  /*
   * 1. Canonical reference: FLW_<id>
   */
  const canonicalByReference =
    await lookupByReference(
      fundingReference,
    );

  if (canonicalByReference) {
    existingFundingCandidates.push(
      canonicalByReference,
    );
  }

  /*
   * 2. Legacy reference: IYJ-FUND-<id>
   */
  const legacyFundingReference =
    `IYJ-FUND-${transactionId}`;

  const legacyByReference =
    await lookupByReference(
      legacyFundingReference,
    );

  if (legacyByReference) {
    existingFundingCandidates.push(
      legacyByReference,
    );
  }

  /*
   * 3. Canonical provider reference: Flutterwave transaction ID
   */
  const byTransactionId =
    await lookupByProviderReference(
      transactionId,
    );

  if (byTransactionId) {
    existingFundingCandidates.push(
      byTransactionId,
    );
  }

  /*
   * 4. Flutterwave provider reference, when available.
   */
  const normalizedFlwReference =
    verifiedFlwRef
      ? String(verifiedFlwRef).trim()
      : null;

  if (
    normalizedFlwReference &&
    normalizedFlwReference !==
      transactionId
  ) {
    const byFlutterwaveReference =
      await lookupByProviderReference(
        normalizedFlwReference,
      );

    if (byFlutterwaveReference) {
      existingFundingCandidates.push(
        byFlutterwaveReference,
      );
    }
  }

  /*
   * IMPORTANT: finalTxRef is a reusable permanent virtual-account
   * reference. It is deliberately NOT used as a unique charge ID.
   * Each individual deposit is identified by the verified Flutterwave
   * transaction ID (and verified charge reference where supported).
   */

  /*
   * De-duplicate candidate rows by transaction ID.
   */
  const distinctFundingCandidates =
    existingFundingCandidates.filter(
      (candidate, index, array) =>
        candidate?.id &&
        array.findIndex(
          (item) => item?.id === candidate.id,
        ) === index,
    );

  if (distinctFundingCandidates.length > 1) {
    throw new NeedsReviewError(
      "Multiple existing funding records match this Flutterwave charge; manual reconciliation is required",
    );
  }

  const existingFunding =
    distinctFundingCandidates[0] ?? null;

  if (
    existingFunding &&
    (
      String(existingFunding.wallet_id ?? "") !== String(virtualAccount.wallet_id ?? "") ||
      String(existingFunding.provider ?? "").toLowerCase() !== "flutterwave" ||
      String(existingFunding.transaction_type ?? "").toLowerCase() !== "wallet_funding" ||
      !amountsMatch(Number(existingFunding.amount ?? 0), verifiedAmount)
    )
  ) {
    throw new NeedsReviewError(
      "Existing funding record does not match the verified virtual account and amount; manual reconciliation is required",
    );
  }

  /*
   * IMPORTANT:
   *
   * If ANY known record already represents this Flutterwave
   * transaction, STOP here. Do not call credit_wallet again.
   *
   * This protects deposits created by older versions of the
   * webhook/sync functions.
   */
  if (existingFunding) {
    const existingMetadata =
      existingFunding.metadata &&
      typeof existingFunding.metadata ===
        "object"
        ? existingFunding.metadata
        : {};

    await createDepositNotification(supabase, {
      userId: virtualAccount.user_id,
      transactionId: existingFunding.id,
      amount: Number(existingFunding.amount ?? verifiedAmount),
      senderName,
      reference: String(existingFunding.reference_number ?? fundingReference),
      flutterwaveTransactionId: transactionId,
      virtualAccountNumber: String(virtualAccount.account_number ?? ""),
    });

    console.log(
      "Flutterwave funding already processed:",
      JSON.stringify({
        flutterwave_transaction_id:
          transactionId,
        existing_transaction_id:
          existingFunding.id,
        existing_reference:
          existingFunding.reference_number,
        existing_provider_reference:
          existingFunding.provider_reference,
      }),
    );

    return {
      success: true,
      already_processed: true,
      reference:
        existingFunding.reference_number ??
        fundingReference,
      transaction_id:
        existingFunding.id,
      amount:
        existingFunding.amount,
      wallet_id:
        existingFunding.wallet_id,
      chargeback_processed:
        existingMetadata?.chargeback_processed ===
        true,
      chargeback_id:
        existingMetadata?.chargeback_id ??
        null,
      chargeback_amount:
        existingMetadata?.chargeback_amount ??
        null,
    };
  }

  /*
   * ==========================================================
   * CREDIT WALLET
   *
   * IMPORTANT:
   *
   * provider_reference is ALWAYS Flutterwave
   * transaction ID.
   *
   * This is important for webhook replay safety.
   * ==========================================================
   */

  const {
    data: creditResult,
    error: creditError,
  } = await supabase.rpc(
    "credit_wallet",
    {
      p_wallet_id:
        virtualAccount.wallet_id,

      p_amount:
        verifiedAmount,

      p_reference_number:
        fundingReference,

      p_description:
        `Transfer from ${senderName || "bank transfer"}`,

      p_provider:
        "flutterwave",

      p_provider_reference:
        transactionId,
    },
  );

  if (creditError) {
    console.error(
      "credit_wallet error:",
      creditError,
    );

    throw creditError;
  }

  /*
   * ==========================================================
   * UPDATE TRANSACTION HISTORY
   * ==========================================================
   */

  const fundingTransactionId =
    creditResult?.transaction_id ??
    creditResult?.id ??
    null;

  if (!fundingTransactionId) {
    throw new Error(
      "Wallet credit completed without returning a transaction ID; reconciliation is required",
    );
  }

  let historyUpdateError: any = null;

  if (fundingTransactionId) {
    const historyMetadata = {
      history_version: 1,

      transaction_type:
        "funding",

      transaction_category:
        "wallet_funding",

      direction:
        "CREDIT",

      display_title:
        `Transfer from ${senderName || "bank transfer"}`,

      counterparty_type:
        "bank_account",

      counterparty_name:
        senderName,

      sender_name:
        senderName,

      sender_bank:
        senderBank,

      sender_account:
        senderAccount,

      sender_account_masked:
        senderAccount,

      sender_bank_name:
        senderBank,

      // Compatibility aliases used by older transaction-history views.
      account_bank:
        senderBank,

      account_number:
        senderAccount,

      account_number_masked:
        senderAccount,

      transfer_amount:
        verifiedAmount,

      amount:
        verifiedAmount,

      total_charged:
        verifiedAmount,

      history_amount:
        verifiedAmount,

      history_sign: "+",

      history_amount_display:
        `+₦${verifiedAmount.toLocaleString(
          "en-NG",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}`,

      status:
        "successful",

      reference:
        fundingReference,

      transaction_id:
        fundingTransactionId,

      flutterwave_transaction_id:
        transactionId,

      flutterwave_reference:
        verifiedFlwRef,

      flutterwave_tx_ref:
        verifiedTxRef,

      webhook_tx_ref:
        webhookTxRef,

      currency:
        verifiedCurrency,

      funding_source:
        "flutterwave_virtual_account",

      virtual_account_number:
        virtualAccount.account_number,

      virtual_account_id:
        virtualAccount.id,

      /*
       * Explicit chargeback state.
       *
       * These are false for a new funding transaction.
       */

      chargeback_detected:
        false,

      chargeback_processed:
        false,

      chargeback_debit_completed:
        false,

      chargeback_pending:
        false,

      created_for_history:
        true,
    };

    const {
      error,
    } = await supabase
      .from("transactions")
      .update({
        status: "completed",

        provider:
          "flutterwave",

        provider_reference:
          transactionId,

        reference_number:
          fundingReference,

        metadata:
          historyMetadata,
      })
      .eq(
        "id",
        fundingTransactionId,
      );

    historyUpdateError = error;

    if (historyUpdateError) {
      /*
       * IMPORTANT:
       *
       * Wallet was already credited successfully.
       *
       * Do not throw and cause Flutterwave replay
       * to look like the wallet credit failed.
       */

      console.error(
        "Funding history update failed:",
        historyUpdateError,
      );
    }
  }

  // The wallet credit and transaction-history update are handled before
  // creating the notification. If notification insertion fails, the queue
  // retries; the next attempt finds the existing funding transaction and
  // retries only the missing notification, never the wallet credit.
  try {
    await createDepositNotification(supabase, {
      userId: virtualAccount.user_id,
      transactionId: String(fundingTransactionId),
      amount: verifiedAmount,
      senderName,
      reference: fundingReference,
      flutterwaveTransactionId: transactionId,
      virtualAccountNumber: String(virtualAccount.account_number ?? ""),
    });
  } catch (notificationError) {
    if (historyUpdateError) {
      console.error(
        "Deposit notification also failed after transaction-history update failure:",
        notificationError,
      );
      return {
        success: true,
        credited: true,
        needs_review: true,
        warning:
          "Wallet credited, but transaction history metadata and notification require reconciliation",
        flutterwave_transaction_id: transactionId,
        transaction_id: fundingTransactionId,
        wallet_id: virtualAccount.wallet_id,
        amount: verifiedAmount,
      };
    }
    throw notificationError;
  }

  if (historyUpdateError) {
    return {
      success: true,
      credited: true,
      needs_review: true,
      warning:
        "Wallet credited and notification recorded, but transaction history metadata requires reconciliation",
      flutterwave_transaction_id: transactionId,
      transaction_id: fundingTransactionId,
      wallet_id: virtualAccount.wallet_id,
      amount: verifiedAmount,
    };
  }

  /*
   * ==========================================================
   * SUCCESS
   * ==========================================================
   */

  return {
    success: true,

    already_processed:
      creditResult?.already_processed ===
      true,

    event:
      "charge.completed",

    flutterwave_transaction_id:
      transactionId,

    flutterwave_reference:
      verifiedFlwRef,

    transaction_reference:
      finalTxRef,

    reference:
      fundingReference,

    amount:
      verifiedAmount,

    currency:
      verifiedCurrency,

    sender: {
      name:
        senderName,

      bank:
        senderBank,

      account_number:
        senderAccount,

      account_number_masked:
        maskAccountNumber(
          senderAccount,
        ),
    },

    virtual_account:
      virtualAccount.account_number,

    wallet_id:
      virtualAccount.wallet_id,

    user_id:
      virtualAccount.user_id,

    transaction_id:
      fundingTransactionId,

    credit:
      creditResult,
  };
}
