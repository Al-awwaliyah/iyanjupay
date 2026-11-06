import { flw } from "./auth.ts";
import { createFlutterwaveNotification } from "./flutterwave-notifications.ts";

const ELECTRONIC_FEE = 50;
const FLUTTERWAVE_ELECTRONIC_FEE_THRESHOLD = 5000;

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

async function createTransferNotification(
  supabase: any,
  params: {
    userId: string;
    transactionId: string;
    type: "transaction_success" | "transaction_failed" | "transaction_refund_pending";
    title: string;
    message: string;
    amount: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await createFlutterwaveNotification(supabase, {
    kind: "transfer",
    userId: params.userId,
    transactionId: params.transactionId,
    type: params.type,
    title: params.title,
    message: params.message,
    amount: params.amount,
    metadata: params.metadata,
  });
}


export async function handleTransferWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ?? {};

  const transferId =
    data?.id
      ? String(data.id)
      : null;

  const transferReference =
    data?.reference ??
    data?.tx_ref ??
    data?.txRef ??
    null;

  const webhookStatus =
    normalizeStatus(
      data?.status,
    );

  if (!transferId) {
    return jsonResponse(
      {
        success: false,
        error: "Transfer ID missing",
      },
      400,
    );
  }

  if (
    webhookStatus !== "SUCCESSFUL" &&
    webhookStatus !== "FAILED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      reason:
        "Transfer is not in a final state",
      transfer_id:
        transferId,
      status:
        webhookStatus,
    });
  }

  /*
   * ==========================================================
   * VERIFY TRANSFER
   * ==========================================================
   */

  let verifyResponse: any;

  try {
    verifyResponse =
      await flw(
        `/transfers/${encodeURIComponent(
          transferId,
        )}`,
        {
          method: "GET",
        },
      );
  } catch (error) {
    console.error(
      "Transfer verification failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to verify transfer status",
      },
      503,
    );
  }

  if (
    !verifyResponse.ok ||
    verifyResponse.body?.status !==
      "success"
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Flutterwave transfer verification failed",
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
          "Flutterwave verification returned no transfer data",
      },
      503,
    );
  }

  const verifiedStatus =
    normalizeStatus(
      verified?.status,
    );

  const verifiedReference =
    verified?.reference ??
    verified?.tx_ref ??
    verified?.txRef ??
    null;

  const verifiedAmount =
    Number(
      verified?.amount?.value ??
        verified?.amount ??
        0,
    );

  const verifiedCurrency =
    String(
      verified?.destination_currency ??
        verified?.currency ??
        "NGN",
    ).toUpperCase();

  if (
    verifiedStatus !== "SUCCESSFUL" &&
    verifiedStatus !== "FAILED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      status:
        verifiedStatus,
    });
  }

  if (verifiedCurrency !== "NGN") {
    return jsonResponse(
      {
        success: false,
        error:
          "Verified transfer currency is not NGN",
      },
      409,
    );
  }

  if (
    transferReference &&
    verifiedReference &&
    String(transferReference) !==
      String(verifiedReference)
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Transfer reference mismatch",
      },
      409,
    );
  }

  /*
   * ==========================================================
   * FIND ORIGINAL TRANSACTION
   * ==========================================================
   */

  let transaction: any =
    null;

  const {
    data:
      transactionByProvider,
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
      transferId,
    )
    .maybeSingle();

  if (providerLookupError) {
    throw providerLookupError;
  }

  transaction =
    transactionByProvider;

  if (
    !transaction &&
    transferReference
  ) {
    const {
      data:
        transactionByReference,
      error:
        referenceError,
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
        String(transferReference),
      )
      .maybeSingle();

    if (referenceError) {
      throw referenceError;
    }

    transaction =
      transactionByReference;
  }

  if (!transaction) {
    return jsonResponse(
      {
        success: false,
        error:
          "IyanjuPay transfer transaction not found",
        transfer_id:
          transferId,
      },
      404,
    );
  }

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
          "Transaction provider mismatch",
      },
      409,
    );
  }

  const metadata =
    transaction.metadata &&
    typeof transaction.metadata ===
      "object"
      ? transaction.metadata
      : {};

  const providerTransferAmount =
    Number(
      metadata?.transfer_amount ??
        metadata?.flutterwave_transfer_amount ??
        0,
    );

  if (
    !Number.isFinite(
      providerTransferAmount,
    ) ||
    providerTransferAmount <= 0
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Provider transfer amount is missing",
      },
      409,
    );
  }

  if (
    !amountsMatch(
      verifiedAmount,
      providerTransferAmount,
    )
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Transfer amount mismatch",
        expected:
          providerTransferAmount,
        verified:
          verifiedAmount,
      },
      409,
    );
  }

  const totalCharged =
    Number(
      metadata?.total_charged ??
        transaction.amount ??
        providerTransferAmount,
    );

  /*
   * ==========================================================
   * SUCCESSFUL TRANSFER
   * ==========================================================
   */

  if (
    verifiedStatus ===
    "SUCCESSFUL"
  ) {
    if (
      String(
        transaction.status,
      ).toLowerCase() ===
      "successful"
    ) {
      // Repair a missing notification if an earlier webhook attempt
      // completed the transaction update but notification delivery failed.
      const completedBeneficiary = String(
        metadata?.beneficiary_name ?? "Bank recipient",
      );
      const completedTotal = Number(
        metadata?.total_charged ?? totalCharged,
      );

      await createTransferNotification(supabase, {
        userId: transaction.user_id,
        transactionId: transaction.id,
        type: "transaction_success",
        title: "Bank transfer successful",
        message: `Your transfer of ₦${providerTransferAmount.toLocaleString(
          "en-NG",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )} to ${completedBeneficiary} was successful.`,
        amount: completedTotal,
        metadata: {
          reference: transaction.reference_number ?? verifiedReference ?? transferReference,
          transfer_id: transferId,
          transfer_amount: providerTransferAmount,
          total_charged: completedTotal,
          beneficiary_name: completedBeneficiary,
          account_number_masked: String(metadata?.account_number_masked ?? ""),
          account_bank: String(metadata?.account_bank ?? ""),
          status: "successful",
          direction: "outgoing",
        },
      });

      return jsonResponse({
        success: true,
        already_processed: true,
        status: "successful",
        transaction_id:
          transaction.id,
        transfer_id:
          transferId,
      });
    }

    const kycAlreadyCompleted =
      metadata?.kyc_limit_completed ===
      true;

    let updatedMetadata = {
      ...metadata,
    };

    /*
     * KYC FINALIZATION
     */

    if (!kycAlreadyCompleted) {
      const {
        data: kycCompletion,
        error:
          kycCompletionError,
      } = await supabase.rpc(
        "complete_kyc_daily_transfer",
        {
          _user_id:
            transaction.user_id,
          _amount:
            providerTransferAmount,
        },
      );

      if (
        kycCompletionError ||
        !kycCompletion?.success
      ) {
        return jsonResponse(
          {
            success: false,
            status: "pending",
            error:
              "Transfer succeeded but KYC finalization is pending",
          },
          503,
        );
      }

      updatedMetadata = {
        ...updatedMetadata,
        kyc_limit_completed: true,
        kyc_completed_amount:
          providerTransferAmount,
        kyc_completed_at:
          new Date().toISOString(),
      };
    }

    /*
     * ELECTRONIC FEE
     */

    const electronicFeeDue =
      providerTransferAmount >
      FLUTTERWAVE_ELECTRONIC_FEE_THRESHOLD
        ? ELECTRONIC_FEE
        : 0;

    let electronicFeeCharged =
      updatedMetadata?.electronic_fee_charged ===
      true;

    let electronicFeePending =
      false;

    let electronicFeeError:
      string | null =
        null;

    if (
      electronicFeeDue > 0 &&
      !electronicFeeCharged
    ) {
      const {
        data: feeResult,
        error: feeError,
      } = await supabase.rpc(
        "wallet_operation",
        {
          _user_id:
            transaction.user_id,

          _operation:
            "DEBIT",

          _amount:
            electronicFeeDue,

          _description:
            `Electronic transfer fee for Flutterwave transfer of ₦${providerTransferAmount.toLocaleString(
              "en-NG",
            )}`,

          _idempotency_key:
            `ELECTRONIC_FEE_${transaction.id}`,

          _reference:
            `ELECTRONIC_FEE_${transaction.id}`,

          _provider:
            "flutterwave",

          _category:
            "electronic_transfer_fee",

          _metadata: {
            original_transaction_id:
              transaction.id,
            flutterwave_transfer_id:
              transferId,
            transfer_amount:
              providerTransferAmount,
            electronic_fee:
              electronicFeeDue,
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
          "Electronic fee could not be charged";

        console.error(
          "Electronic fee debit failed:",
          feeError,
        );
      } else {
        electronicFeeCharged =
          true;
      }
    }

    const actualElectronicFee =
      electronicFeeCharged
        ? electronicFeeDue
        : 0;

    /*
     * HISTORY METADATA
     */

    const beneficiaryName =
      String(
        updatedMetadata?.beneficiary_name ??
          "Bank recipient",
      );

    const accountNumber =
      String(
        updatedMetadata?.account_number ??
          "",
      );

    const accountBank =
      String(
        updatedMetadata?.account_bank ??
          "",
      );

    const senderName =
      String(
        updatedMetadata?.sender_name ??
          "IyanjuPay User",
      );

    const reference =
      String(
        transaction.reference_number ??
          verifiedReference ??
          transferReference ??
          "",
      );

    const finalTotalCharged =
      providerTransferAmount +
      Number(
        updatedMetadata?.iyanjupay_fee ??
          10,
      ) +
      actualElectronicFee;

    updatedMetadata = {
      ...updatedMetadata,

      history_version: 1,

      transaction_type:
        "bank_transfer",

      transaction_category:
        "transfer",

      direction: "DEBIT",

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
        maskAccountNumber(
          accountNumber,
        ),

      account_bank:
        accountBank,

      transfer_amount:
        providerTransferAmount,

      iyanjupay_fee:
        Number(
          updatedMetadata?.iyanjupay_fee ??
            10,
        ),

      electronic_fee:
        electronicFeeDue,

      electronic_fee_charged:
        electronicFeeCharged,

      electronic_fee_pending:
        electronicFeePending,

      electronic_fee_error:
        electronicFeeError,

      total_charged:
        finalTotalCharged,

      history_amount:
        finalTotalCharged,

      history_sign: "-",

      history_amount_display:
        `-₦${finalTotalCharged.toLocaleString(
          "en-NG",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}`,

      status: "successful",

      reference,

      transaction_id:
        transaction.id,

      provider:
        "flutterwave",

      provider_reference:
        transferId,

      flutterwave_status:
        verifiedStatus,

      flutterwave_transfer_id:
        transferId,

      flutterwave_reference:
        verifiedReference ??
        transferReference,

      flutterwave_amount:
        verifiedAmount,

      flutterwave_currency:
        verifiedCurrency,

      transfer_completed:
        true,

      transfer_completed_at:
        new Date().toISOString(),

      refund_required:
        false,

      refunded: false,

      kyc_limit_completed:
        true,

      kyc_completed_amount:
        providerTransferAmount,

      kyc_completed_at:
        updatedMetadata?.kyc_completed_at ??
        new Date().toISOString(),
    };

    const {
      error: updateError,
    } = await supabase
      .from("transactions")
      .update({
        status: "successful",
        provider: "flutterwave",
        provider_reference:
          transferId,
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

    // Notify only after Flutterwave verification and the successful
    // transaction status update. The insert is idempotent, and its
    // database trigger fans the notification out to registered devices.
    await createTransferNotification(supabase, {
      userId: transaction.user_id,
      transactionId: transaction.id,
      type: "transaction_success",
      title: "Bank transfer successful",
      message: `Your transfer of ₦${providerTransferAmount.toLocaleString(
        "en-NG",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} to ${beneficiaryName} was successful.`,
      amount: finalTotalCharged,
      metadata: {
        reference,
        transfer_id: transferId,
        transfer_amount: providerTransferAmount,
        total_charged: finalTotalCharged,
        beneficiary_name: beneficiaryName,
        account_number_masked: maskAccountNumber(accountNumber),
        account_bank: accountBank,
        status: "successful",
        direction: "outgoing",
      },
    });

    return jsonResponse({
      success: true,
      status: "successful",
      transaction_id:
        transaction.id,
      transfer_id:
        transferId,
      transfer_amount:
        providerTransferAmount,
      electronic_fee:
        electronicFeeDue,
      electronic_fee_charged:
        electronicFeeCharged,
      electronic_fee_pending:
        electronicFeePending,
      total_charged:
        finalTotalCharged,
      refunded: false,
    });
  }

  /*
   * ==========================================================
   * FAILED TRANSFER
   * ==========================================================
   */

  if (
    verifiedStatus === "FAILED"
  ) {
    const existingMetadata =
      transaction.metadata &&
      typeof transaction.metadata ===
        "object"
        ? {
            ...transaction.metadata,
          }
        : {};

    /*
     * ALREADY REFUNDED
     */

    if (
      existingMetadata?.refunded ===
      true
    ) {
      if (
        String(
          transaction.status,
        ).toLowerCase() !==
        "failed"
      ) {
        await supabase
          .from("transactions")
          .update({
            status: "failed",
          })
          .eq(
            "id",
            transaction.id,
          );
      }

      await createTransferNotification(supabase, {
        userId: transaction.user_id,
        transactionId: transaction.id,
        type: "transaction_failed",
        title: "Bank transfer failed — refund completed",
        message: `Your transfer to ${String(existingMetadata?.beneficiary_name ?? "the recipient")} failed. ₦${totalCharged.toLocaleString(
          "en-NG",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )} has been refunded to your wallet.`,
        amount: totalCharged,
        metadata: {
          reference: transaction.reference_number ?? verifiedReference ?? transferReference,
          transfer_id: transferId,
          transfer_amount: providerTransferAmount,
          refund_amount: totalCharged,
          beneficiary_name: String(existingMetadata?.beneficiary_name ?? "Bank recipient"),
          status: "failed",
          refunded: true,
          direction: "outgoing",
        },
      });

      return jsonResponse({
        success: true,
        already_processed: true,
        status: "failed",
        refunded: true,
        transaction_id:
          transaction.id,
        transfer_id:
          transferId,
        refund_amount:
          totalCharged,
      });
    }

    /*
     * RELEASE KYC RESERVATION
     */

    if (
      existingMetadata?.kyc_limit_completed !==
        true &&
      existingMetadata?.kyc_limit_released !==
        true
    ) {
      const {
        data: releaseResult,
        error: releaseError,
      } = await supabase.rpc(
        "release_kyc_daily_transfer",
        {
          _user_id:
            transaction.user_id,
          _amount:
            providerTransferAmount,
        },
      );

      if (
        releaseError ||
        !releaseResult?.success
      ) {
        console.error(
          "KYC release failed:",
          releaseError,
        );
      } else {
        existingMetadata.kyc_limit_released =
          true;

        existingMetadata.kyc_released_amount =
          providerTransferAmount;

        existingMetadata.kyc_released_at =
          new Date().toISOString();
      }
    }

    /*
     * REFUND WALLET
     */

    const {
      data: refundData,
      error: refundError,
    } = await supabase.rpc(
      "wallet_operation",
      {
        _user_id:
          transaction.user_id,

        _operation:
          "REFUND",

        _amount:
          totalCharged,

        _description:
          "Refund for failed Flutterwave bank transfer",

        _idempotency_key:
          `REFUND_${transaction.id}`,

        _reference:
          `REFUND_${transaction.reference_number ?? transferId}`,

        _provider:
          "flutterwave",

        _provider_reference:
          transferId,

        _category:
          "transfer_refund",

        _metadata: {
          original_transaction_id:
            transaction.id,

          original_reference:
            transaction.reference_number ??
            transferReference,

          flutterwave_transfer_id:
            transferId,

          flutterwave_reference:
            verifiedReference ??
            transferReference,

          flutterwave_status:
            verifiedStatus,

          original_transfer_amount:
            providerTransferAmount,

          original_total_charged:
            totalCharged,

          reason:
            "Flutterwave transfer failed",

          refunded_amount:
            totalCharged,
        },
      },
    );

    if (refundError) {
      console.error(
        "Wallet refund failed:",
        refundError,
      );

      await supabase
        .from("transactions")
        .update({
          status: "pending",
          metadata: {
            ...existingMetadata,

            flutterwave_status:
              verifiedStatus,

            flutterwave_transfer_id:
              transferId,

            transfer_failed:
              true,

            refund_required:
              true,

            refunded:
              false,

            refund_pending:
              true,

            refund_error:
              refundError.message,

            refund_amount:
              totalCharged,
          },
        })
        .eq(
          "id",
          transaction.id,
        );

      await createTransferNotification(supabase, {
        userId: transaction.user_id,
        transactionId: transaction.id,
        type: "transaction_refund_pending",
        title: "Transfer refund pending",
        message: `Your transfer to ${String(existingMetadata?.beneficiary_name ?? "the recipient")} failed, but your ₦${totalCharged.toLocaleString(
          "en-NG",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )} refund is still being processed.`,
        amount: totalCharged,
        metadata: {
          reference: transaction.reference_number ?? verifiedReference ?? transferReference,
          transfer_id: transferId,
          transfer_amount: providerTransferAmount,
          refund_amount: totalCharged,
          beneficiary_name: String(existingMetadata?.beneficiary_name ?? "Bank recipient"),
          status: "refund_pending",
          refunded: false,
          refund_pending: true,
          direction: "outgoing",
        },
      });

      return jsonResponse(
        {
          success: false,
          status: "refund_pending",
          error:
            "Transfer failed but automatic refund could not be completed",
          transaction_id:
            transaction.id,
          transfer_id:
            transferId,
          refund_amount:
            totalCharged,
        },
        503,
      );
    }

    console.log(
      "Refund result:",
      refundData,
    );

    /*
     * MARK FAILED
     */

    const {
      error:
        failedUpdateError,
    } = await supabase
      .from("transactions")
      .update({
        status: "failed",

        provider: "flutterwave",

        provider_reference:
          transferId,

        metadata: {
          ...existingMetadata,

          history_version: 1,

          transaction_type:
            "bank_transfer",

          transaction_category:
            "transfer",

          direction: "DEBIT",

          status: "failed",

          flutterwave_status:
            verifiedStatus,

          flutterwave_transfer_id:
            transferId,

          flutterwave_reference:
            verifiedReference ??
            transferReference,

          transfer_failed: true,

          refund_required: false,

          refunded: true,

          refund_pending: false,

          refund_amount:
            totalCharged,

          refund_completed_at:
            new Date().toISOString(),

          history_amount:
            totalCharged,

          history_sign: "+",

          history_amount_display:
            `+₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}`,
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    if (failedUpdateError) {
      console.error(
        "Failed transaction update failed:",
        failedUpdateError,
      );

      return jsonResponse({
        success: true,
        warning:
          "Refund completed but transaction status requires reconciliation",
        refunded: true,
        transaction_id:
          transaction.id,
        transfer_id:
          transferId,
        refund_amount:
          totalCharged,
      });
    }

    await createTransferNotification(supabase, {
      userId: transaction.user_id,
      transactionId: transaction.id,
      type: "transaction_failed",
      title: "Bank transfer failed — refund completed",
      message: `Your transfer of ₦${providerTransferAmount.toLocaleString(
        "en-NG",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} to ${String(existingMetadata?.beneficiary_name ?? "the recipient")} failed. ₦${totalCharged.toLocaleString(
        "en-NG",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} has been refunded to your wallet.`,
      amount: totalCharged,
      metadata: {
        reference: transaction.reference_number ?? verifiedReference ?? transferReference,
        transfer_id: transferId,
        transfer_amount: providerTransferAmount,
        refund_amount: totalCharged,
        beneficiary_name: String(existingMetadata?.beneficiary_name ?? "Bank recipient"),
        status: "failed",
        refunded: true,
        direction: "outgoing",
      },
    });

    return jsonResponse({
      success: true,
      status: "failed",
      refunded: true,
      transaction_id:
        transaction.id,
      transfer_id:
        transferId,
      transfer_amount:
        providerTransferAmount,
      refund_amount:
        totalCharged,
    });
  }

  return jsonResponse({
    success: true,
    ignored: true,
    reason:
      "Unhandled transfer state",
  });
}
