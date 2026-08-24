import {
  adminClient,
  flw,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, flutterwave-signature, verif-hash",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ELECTRONIC_FEE = 50;
const FLUTTERWAVE_ELECTRONIC_FEE_THRESHOLD =
  5000;

function jsonResponse(
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

function normalizeStatus(
  value: unknown,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function safeEqual(
  a: string,
  b: string,
) {
  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  const aBytes =
    new TextEncoder().encode(a);

  const bBytes =
    new TextEncoder().encode(b);

  let result = 0;

  for (
    let i = 0;
    i < aBytes.length;
    i++
  ) {
    result |=
      aBytes[i] ^
      bBytes[i];
  }

  return result === 0;
}

function arrayBufferToBase64(
  buffer: ArrayBuffer,
) {
  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length,
        ),
      ),
    );
  }

  return btoa(binary);
}

async function generateSignature(
  rawBody: string,
  secretHash: string,
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        secretHash,
      ),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(rawBody),
    );

  return arrayBufferToBase64(
    signature,
  );
}

function maskAccountNumber(
  accountNumber: string,
) {
  const value =
    String(accountNumber ?? "")
      .replace(/\D/g, "");

  if (value.length < 4) {
    return value;
  }

  return `xxxxxx${value.slice(-4)}`;
}

/*
 * ============================================================
 * MAIN WEBHOOK
 * ============================================================
 */

Deno.serve(
  async (req) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          status: 200,
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed",
        },
        405,
      );
    }

    try {
      const webhookSecret =
        Deno.env.get(
          "FLW_SECRET_HASH",
        ) ?? "";

      if (!webhookSecret) {
        throw new Error(
          "FLW_SECRET_HASH is not configured",
        );
      }

      /*
       * ==========================================================
       * RAW BODY
       * ==========================================================
       */

      const rawBody =
        await req.text();

      if (!rawBody) {
        return jsonResponse(
          {
            error:
              "Empty webhook body",
          },
          400,
        );
      }

      /*
       * ==========================================================
       * SIGNATURE
       * ==========================================================
       */

      const signature =
        req.headers.get(
          "flutterwave-signature",
        );

      const legacyHash =
        req.headers.get(
          "verif-hash",
        );

      if (signature) {
        const expected =
          await generateSignature(
            rawBody,
            webhookSecret,
          );

        if (
          !safeEqual(
            expected,
            signature,
          )
        ) {
          return jsonResponse(
            {
              error:
                "Invalid webhook signature",
            },
            401,
          );
        }
      } else if (
        legacyHash
      ) {
        if (
          !safeEqual(
            legacyHash,
            webhookSecret,
          )
        ) {
          return jsonResponse(
            {
              error:
                "Invalid webhook signature",
            },
            401,
          );
        }
      } else {
        return jsonResponse(
          {
            error:
              "Missing Flutterwave webhook signature",
          },
          401,
        );
      }

      /*
       * ==========================================================
       * PARSE
       * ==========================================================
       */

      let payload: any;

      try {
        payload =
          JSON.parse(rawBody);
      } catch {
        return jsonResponse(
          {
            error:
              "Invalid webhook JSON payload",
          },
          400,
        );
      }

      const event =
        payload?.type ??
        payload?.event ??
        null;

      console.log(
        "Flutterwave webhook event:",
        event,
      );

      const supabase =
        adminClient();

      /*
       * ==========================================================
       * BANK TRANSFER WEBHOOK
       * ==========================================================
       */

      if (
        event ===
          "transfer.disburse" ||
        event ===
          "transfer.completed" ||
        event === "Transfer"
      ) {
        return await handleTransferWebhook(
          payload,
          supabase,
        );
      }

      /*
       * ==========================================================
       * DEPOSIT
       * ==========================================================
       */

      if (
        event &&
        event !==
          "charge.completed"
      ) {
        return jsonResponse({
          success: true,
          ignored: true,
          event,
        });
      }

      return await handleDepositWebhook(
        payload,
        supabase,
      );
    } catch (error) {
      console.error(
        "Flutterwave webhook error:",
        error,
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Internal server error",
        },
        500,
      );
    }
  },
);

/*
 * ============================================================
 * TRANSFER WEBHOOK
 * ============================================================
 */

async function handleTransferWebhook(
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
        error:
          "Transfer ID missing",
      },
      400,
    );
  }

  if (
    webhookStatus !==
      "SUCCESSFUL" &&
    webhookStatus !==
      "FAILED"
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
   * VERIFY WITH FLUTTERWAVE
   * ==========================================================
   */

  let verifyResponse;

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
          "Unable to verify transfer status.",
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
          "Flutterwave transfer verification failed.",
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
          "Flutterwave verification returned no transfer data.",
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
    verifiedStatus !==
      "SUCCESSFUL" &&
    verifiedStatus !==
      "FAILED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      status:
        verifiedStatus,
    });
  }

  if (
    verifiedCurrency !==
    "NGN"
  ) {
    return jsonResponse(
      {
        error:
          "Verified transfer currency is not NGN.",
      },
      409,
    );
  }

  if (
    transferReference &&
    verifiedReference &&
    String(
      transferReference,
    ) !==
      String(
        verifiedReference,
      )
  ) {
    return jsonResponse(
      {
        error:
          "Transfer reference mismatch.",
      },
      409,
    );
  }

  /*
   * ==========================================================
   * FIND TRANSACTION
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
    .select(
      `
        id,
        user_id,
        wallet_id,
        amount,
        status,
        reference_number,
        provider,
        provider_reference,
        metadata
      `,
    )
    .eq(
      "provider_reference",
      transferId,
    )
    .maybeSingle();

  if (
    providerLookupError
  ) {
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
      .select(
        `
          id,
          user_id,
          wallet_id,
          amount,
          status,
          reference_number,
          provider,
          provider_reference,
          metadata
        `,
      )
      .eq(
        "reference_number",
        String(
          transferReference,
        ),
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
          "IyanjuPay transfer transaction not found.",
        transfer_id:
          transferId,
        reference:
          transferReference,
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
        error:
          "Transaction provider mismatch.",
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
        error:
          "Provider transfer amount is missing from transaction metadata.",
      },
      409,
    );
  }

  if (
    verifiedAmount !==
    providerTransferAmount
  ) {
    return jsonResponse(
      {
        error:
          "Transfer amount mismatch.",
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
      return jsonResponse({
        success: true,
        already_processed: true,
        status:
          "successful",
        transaction_id:
          transaction.id,
        transfer_id:
          transferId,
      });
    }

    /*
     * ----------------------------------------------------------
     * COMPLETE KYC
     * ----------------------------------------------------------
     */

    const kycAlreadyCompleted =
      metadata?.kyc_limit_completed ===
      true;

    let updatedMetadata = {
      ...metadata,
    };

    if (
      !kycAlreadyCompleted
    ) {
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
        console.error(
          "KYC completion failed:",
          kycCompletionError ||
            kycCompletion,
        );

        return jsonResponse(
          {
            success: false,
            status: "pending",
            error:
              "Transfer succeeded at Flutterwave, but KYC daily-limit finalization is pending.",
            transaction_id:
              transaction.id,
            transfer_id:
              transferId,
          },
          503,
        );
      }

      updatedMetadata = {
        ...updatedMetadata,

        kyc_limit_completed:
          true,

        kyc_completed_amount:
          providerTransferAmount,

        kyc_completed_at:
          new Date().toISOString(),
      };
    }

    /*
     * ----------------------------------------------------------
     * ELECTRONIC FEE
     * ----------------------------------------------------------
     *
     * Flutterwave:
     * amount > ₦5,000 = ₦50
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
      string | null = null;

    if (
      electronicFeeDue > 0 &&
      !electronicFeeCharged
    ) {
      const feeKey =
        `ELECTRONIC_FEE_${transaction.id}`;

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
            feeKey,

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

            currency:
              "NGN",
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

    const actualElectronicFee =
      electronicFeeCharged
        ? electronicFeeDue
        : 0;

    /*
     * ----------------------------------------------------------
     * FINAL HISTORY METADATA
     * ----------------------------------------------------------
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

      history_sign:
        "-",

      history_amount_display:
        `-₦${finalTotalCharged.toLocaleString(
          "en-NG",
          {
            minimumFractionDigits:
              2,
            maximumFractionDigits:
              2,
          },
        )}`,

      status:
        "successful",

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

      refunded:
        false,

      kyc_limit_completed:
        true,

      kyc_completed_amount:
        providerTransferAmount,

      kyc_completed_at:
        updatedMetadata?.kyc_completed_at ??
        new Date().toISOString(),
    };

    const {
      error:
        updateError,
    } = await supabase
      .from("transactions")
      .update({
        status:
          "successful",

        provider:
          "flutterwave",

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
      console.error(
        "Failed to update successful transaction:",
        updateError,
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Unable to update transfer transaction.",
        },
        503,
      );
    }

    return jsonResponse({
      success: true,

      status:
        "successful",

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
    verifiedStatus ===
    "FAILED"
  ) {
    const existingMetadata =
      transaction.metadata &&
      typeof transaction.metadata ===
        "object"
        ? transaction.metadata
        : {};

    /*
     * Already refunded.
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
            status:
              "failed",
          })
          .eq(
            "id",
            transaction.id,
          );
      }

      return jsonResponse({
        success: true,
        already_processed:
          true,
        status:
          "failed",
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
     * ----------------------------------------------------------
     * RELEASE KYC RESERVATION
     * ----------------------------------------------------------
     */

    if (
      existingMetadata?.kyc_limit_completed !==
        true &&
      existingMetadata?.kyc_limit_released !==
        true
    ) {
      const {
        data: releaseResult,
        error:
          releaseError,
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
          releaseError ||
            releaseResult,
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
     * ----------------------------------------------------------
     * REFUND
     * ----------------------------------------------------------
     */

    const refundResult =
      await supabase.rpc(
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

    if (
      refundResult.error
    ) {
      await supabase
        .from("transactions")
        .update({
          status:
            "pending",

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
              refundResult.error.message,

            refund_amount:
              totalCharged,
          },
        })
        .eq(
          "id",
          transaction.id,
        );

      return jsonResponse(
        {
          success: false,
          status:
            "refund_pending",
          error:
            "Transfer failed but automatic refund could not be completed.",
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

    /*
     * ----------------------------------------------------------
     * MARK FAILED
     * ----------------------------------------------------------
     */

    const {
      error:
        failedUpdateError,
    } = await supabase
      .from("transactions")
      .update({
        status:
          "failed",

        provider:
          "flutterwave",

        provider_reference:
          transferId,

        metadata: {
          ...existingMetadata,

          history_version: 1,

          transaction_type:
            "bank_transfer",

          transaction_category:
            "transfer",

          direction:
            "DEBIT",

          status:
            "failed",

          flutterwave_status:
            verifiedStatus,

          flutterwave_transfer_id:
            transferId,

          flutterwave_reference:
            verifiedReference ??
            transferReference,

          transfer_failed:
            true,

          refund_required:
            false,

          refunded:
            true,

          refund_pending:
            false,

          refund_amount:
            totalCharged,

          refund_completed_at:
            new Date().toISOString(),

          history_amount:
            totalCharged,

          history_sign:
            "+",

          history_amount_display:
            `+₦${totalCharged.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits:
                  2,
                maximumFractionDigits:
                  2,
              },
            )}`,
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    if (
      failedUpdateError
    ) {
      return jsonResponse({
        success: true,
        warning:
          "Refund completed but transaction status requires reconciliation.",
        refunded: true,
        transaction_id:
          transaction.id,
        transfer_id:
          transferId,
        refund_amount:
          totalCharged,
      });
    }

    return jsonResponse({
      success: true,

      status:
        "failed",

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

/*
 * ============================================================
 * DEPOSIT / FUNDING WEBHOOK
 * ============================================================
 */

async function handleDepositWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ?? {};

  const transactionId =
    data?.id;

  const transactionStatus =
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

  const webhookTxRef =
    data?.tx_ref ??
    data?.txRef ??
    data?.reference ??
    null;

  if (!transactionId) {
    return jsonResponse(
      {
        error:
          "Missing Flutterwave transaction ID",
      },
      400,
    );
  }

  if (
    transactionStatus !==
      "SUCCESSFUL" &&
    transactionStatus !==
      "SUCCEEDED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      reason:
        "Transaction not successful",
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
        error:
          "Invalid transaction amount",
      },
      400,
    );
  }

  if (
    webhookCurrency &&
    webhookCurrency !==
      "NGN"
  ) {
    return jsonResponse(
      {
        error:
          "Unsupported currency",
      },
      400,
    );
  }

  /*
   * ==========================================================
   * VERIFY
   * ==========================================================
   */

  const verifyResponse =
    await flw(
      `/transactions/${encodeURIComponent(
        transactionId,
      )}/verify`,
      {
        method: "GET",
      },
    );

  if (
    !verifyResponse.ok ||
    verifyResponse.body?.status !==
      "success"
  ) {
    return jsonResponse(
      {
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
        error:
          "Missing verified transaction data",
      },
      400,
    );
  }

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
      verified?.currency ??
        "",
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

  if (
    verifiedStatus !==
      "SUCCESSFUL" &&
    verifiedStatus !==
      "SUCCEEDED"
  ) {
    return jsonResponse({
      success: true,
      ignored: true,
      reason:
        "Verified transaction is not successful",
    });
  }

  if (
    verifiedCurrency !==
    "NGN"
  ) {
    return jsonResponse(
      {
        error:
          "Verified transaction is not NGN",
      },
      400,
    );
  }

  if (
    verifiedAmount <
    webhookAmount
  ) {
    return jsonResponse(
      {
        error:
          "Verified amount mismatch",
      },
      400,
    );
  }

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

  let virtualAccount:
    any = null;

  /*
   * Primary lookup from IYJ_VA reference.
   */

  if (
    finalTxRef.startsWith(
      "IYJ_VA_",
    )
  ) {
    const parts =
      finalTxRef.split("_");

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
        .select(
          `
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
          `,
        )
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
   * Fallback account number search.
   */

  if (
    !virtualAccount
  ) {
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

    for (
      const accountNumber of
      [
        ...new Set(
          accountNumbers,
        ),
      ]
    ) {
      const {
        data: account,
        error,
      } = await supabase
        .from(
          "virtual_accounts",
        )
        .select(
          `
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
          `,
        )
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

  if (
    !virtualAccount
  ) {
    return jsonResponse(
      {
        error:
          "Virtual account not found",
      },
      404,
    );
  }

  if (
    !virtualAccount.wallet_id
  ) {
    return jsonResponse(
      {
        error:
          "Virtual account has no wallet",
      },
      400,
    );
  }

  /*
   * ==========================================================
   * WALLET
   * ==========================================================
   */

  const {
    data: wallet,
    error:
      walletError,
  } = await supabase
    .from("wallets")
    .select(
      "id, user_id, balance, currency, status",
    )
    .eq(
      "id",
      virtualAccount.wallet_id,
    )
    .maybeSingle();

  if (walletError) {
    throw walletError;
  }

  if (!wallet) {
    return jsonResponse(
      {
        error:
          "Wallet not found",
      },
      404,
    );
  }

  if (
    wallet.user_id !==
    virtualAccount.user_id
  ) {
    return jsonResponse(
      {
        error:
          "Virtual account ownership mismatch",
      },
      409,
    );
  }

  if (
    String(
      wallet.currency,
    ).toUpperCase() !==
    "NGN"
  ) {
    return jsonResponse(
      {
        error:
          "Wallet currency mismatch",
      },
      400,
    );
  }

  if (
    wallet.status !==
    "active"
  ) {
    return jsonResponse(
      {
        error:
          "Wallet is not active",
      },
      403,
    );
  }

  /*
   * ==========================================================
   * SENDER INFORMATION
   * ==========================================================
   *
   * Flutterwave bank-transfer payloads can place sender
   * information in different fields depending on the
   * collection channel.
   */

  const senderName =
    String(
      data?.customer?.name ??
        data?.customer?.full_name ??
        data?.sender_name ??
        data?.sender?.name ??
        data?.bank_transfer?.sender_name ??
        verified?.customer?.name ??
        verified?.customer?.full_name ??
        verified?.sender_name ??
        verified?.sender?.name ??
        "Bank transfer",
    ).trim();

  const senderAccount =
    String(
      data?.customer?.account_number ??
        data?.sender_account_number ??
        data?.sender?.account_number ??
        data?.bank_transfer?.account_number ??
        verified?.customer?.account_number ??
        verified?.sender_account_number ??
        verified?.sender?.account_number ??
        "",
    ).trim();

  const senderBank =
    String(
      data?.customer?.account_bank ??
        data?.sender_bank ??
        data?.sender?.bank_name ??
        data?.bank_transfer?.bank_name ??
        verified?.customer?.account_bank ??
        verified?.sender_bank ??
        verified?.sender?.bank_name ??
        "Bank transfer",
    ).trim();

  /*
   * ==========================================================
   * FUNDING REFERENCE
   * ==========================================================
   */

  const fundingReference =
    `IYJ-${String(
      transactionId,
    )
      .padStart(8, "0")
      .slice(-8)}`;

  /*
   * ==========================================================
   * IDEMPOTENCY
   * ==========================================================
   */

  const {
    data: existingFunding,
    error:
      existingFundingError,
  } = await supabase
    .from("transactions")
    .select(
      `
        id,
        wallet_id,
        amount,
        status,
        reference_number,
        provider_reference
      `,
    )
    .eq(
      "provider_reference",
      String(
        transactionId,
      ),
    )
    .maybeSingle();

  if (
    existingFundingError
  ) {
    throw existingFundingError;
  }

  if (existingFunding) {
    return jsonResponse({
      success: true,
      already_processed:
        true,

      reference:
        existingFunding.reference_number ??
        fundingReference,

      transaction_id:
        existingFunding.id,

      amount:
        existingFunding.amount,

      wallet_id:
        existingFunding.wallet_id,
    });
  }

  /*
   * ==========================================================
   * CREDIT WALLET
   * ==========================================================
   */

  const {
    data: creditResult,
    error:
      creditError,
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
        `Transfer from ${senderName}`,

      p_provider:
        "flutterwave",

      p_provider_reference:
        String(
          verifiedFlwRef ??
            transactionId,
        ),
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
   * UPDATE FUNDING HISTORY METADATA
   * ==========================================================
   *
   * This is what gives the frontend the Opay-style display:
   *
   * Transfer from
   * John Doe
   * GTBank xxxxxx5678
   *
   * +₦10,000.00
   *
   * Successful
   *
   * 24 Aug 2026, 12:34 PM
   *
   * Amount ₦10,000.00
   * Reference IYJ-XXXXXXXX
   * Transaction ID XXXXXXXX
   */

  const fundingTransactionId =
    creditResult?.transaction_id ??
    creditResult?.id ??
    null;

  if (
    fundingTransactionId
  ) {
    await supabase
      .from("transactions")
      .update({
        status:
          "successful",

        provider:
          "flutterwave",

        provider_reference:
          String(
            transactionId,
          ),

        reference_number:
          fundingReference,

        metadata: {
          history_version: 1,

          transaction_type:
            "funding",

          transaction_category:
            "wallet_funding",

          direction:
            "CREDIT",

          display_title:
            `Transfer from ${senderName}`,

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
            maskAccountNumber(
              senderAccount,
            ),

          account_bank:
            senderBank,

          account_number:
            senderAccount,

          account_number_masked:
            maskAccountNumber(
              senderAccount,
            ),

          transfer_amount:
            verifiedAmount,

          amount:
            verifiedAmount,

          total_charged:
            verifiedAmount,

          history_amount:
            verifiedAmount,

          history_sign:
            "+",

          history_amount_display:
            `+₦${verifiedAmount.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits:
                  2,
                maximumFractionDigits:
                  2,
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

          currency:
            "NGN",

          funding_source:
            "flutterwave_virtual_account",

          virtual_account_number:
            virtualAccount.account_number,

          created_for_history:
            true,
        },
      })
      .eq(
        "id",
        fundingTransactionId,
      );
  }

  return jsonResponse({
    success: true,

    event:
      payload?.type ??
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
  });
}
