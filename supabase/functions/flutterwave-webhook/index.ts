import {
  adminClient,
  flw,
} from "../_shared/auth.ts";


/**
 * ============================================================
 * IYANJUPAY - FLUTTERWAVE WEBHOOK
 * ============================================================
 *
 * HANDLES:
 *
 * 1. Virtual-account deposits
 *
 *    charge.completed
 *       ↓
 *    verify payment
 *       ↓
 *    find virtual account
 *       ↓
 *    credit wallet
 *
 *
 * 2. Bank transfers
 *
 *    transfer.disburse
 *       ↓
 *    identify IyanjuPay transaction
 *       ↓
 *    verify transfer
 *       ↓
 *
 *    SUCCESSFUL
 *       ↓
 *    mark transaction successful
 *
 *    FAILED
 *       ↓
 *    automatic wallet refund
 *       ↓
 *    mark transaction failed
 *
 * ============================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, flutterwave-signature, verif-hash",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",

  "Content-Type":
    "application/json",
};

/*
 * ============================================================
 * JSON RESPONSE
 * ============================================================
 */

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        corsHeaders,
    },
  );
}

/*
 * ============================================================
 * ARRAY BUFFER → BASE64
 * ============================================================
 */

function arrayBufferToBase64(
  buffer: ArrayBuffer,
): string {
  const bytes =
    new Uint8Array(
      buffer,
    );

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          Math.min(
            i +
              chunkSize,
            bytes.length,
          ),
        ),
      );
  }

  return btoa(binary);
}

/*
 * ============================================================
 * HMAC-SHA256
 * ============================================================
 */

async function generateFlutterwaveSignature(
  rawBody: string,
  secretHash: string,
): Promise<string> {
  const encoder =
    new TextEncoder();

  const keyData =
    encoder.encode(
      secretHash,
    );

  const bodyData =
    encoder.encode(
      rawBody,
    );

  const cryptoKey =
    await crypto.subtle.importKey(
      "raw",
      keyData,
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
      cryptoKey,
      bodyData,
    );

  return arrayBufferToBase64(
    signature,
  );
}

/*
 * ============================================================
 * TIMING-SAFE STRING COMPARISON
 * ============================================================
 */

function safeEqual(
  a: string,
  b: string,
): boolean {
  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  const encoder =
    new TextEncoder();

  const aBytes =
    encoder.encode(a);

  const bBytes =
    encoder.encode(b);

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

/*
 * ============================================================
 * NORMALIZE STATUS
 * ============================================================
 */

function normalizeStatus(
  value: unknown,
): string {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

/*
 * ============================================================
 * WEBHOOK
 * ============================================================
 */

Deno.serve(
  async (req) => {
    /*
     * ========================================================
     * 0. CORS
     * ========================================================
     */

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

    /*
     * ========================================================
     * 1. METHOD
     * ========================================================
     */

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
      /*
       * ======================================================
       * 2. ENVIRONMENT
       * ======================================================
       */

      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL",
        ) ?? "";

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY",
        ) ?? "";

      const webhookSecret =
        Deno.env.get(
          "FLW_SECRET_HASH",
        ) ?? "";

      if (!supabaseUrl) {
        throw new Error(
          "SUPABASE_URL is not configured",
        );
      }

      if (
        !serviceRoleKey
      ) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY is not configured",
        );
      }

      if (
        !webhookSecret
      ) {
        throw new Error(
          "FLW_SECRET_HASH is not configured",
        );
      }

      /*
       * ======================================================
       * 3. RAW BODY
       * ======================================================
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
       * ======================================================
       * 4. VERIFY SIGNATURE
       * ======================================================
       */

      const flutterwaveSignature =
        req.headers.get(
          "flutterwave-signature",
        );

      const legacyVerifHash =
        req.headers.get(
          "verif-hash",
        );

      /*
       * Current signature
       */

      if (
        flutterwaveSignature
      ) {
        const expectedSignature =
          await generateFlutterwaveSignature(
            rawBody,
            webhookSecret,
          );

        if (
          !safeEqual(
            expectedSignature,
            flutterwaveSignature,
          )
        ) {
          console.error(
            "Invalid Flutterwave webhook signature",
          );

          return jsonResponse(
            {
              error:
                "Invalid webhook signature",
            },
            401,
          );
        }

        console.log(
          "Flutterwave webhook signature verified",
        );
      }

      /*
       * Legacy signature
       */

      else if (
        legacyVerifHash
      ) {
        if (
          !safeEqual(
            legacyVerifHash,
            webhookSecret,
          )
        ) {
          console.error(
            "Invalid Flutterwave verif-hash",
          );

          return jsonResponse(
            {
              error:
                "Invalid webhook signature",
            },
            401,
          );
        }

        console.log(
          "Flutterwave legacy webhook signature verified",
        );
      }

      /*
       * No signature
       */

      else {
        console.error(
          "Missing Flutterwave webhook signature",
        );

        return jsonResponse(
          {
            error:
              "Missing Flutterwave webhook signature",
          },
          401,
        );
      }

      /*
       * ======================================================
       * 5. PARSE PAYLOAD
       * ======================================================
       */

      let payload: any;

      try {
        payload =
          JSON.parse(
            rawBody,
          );
      } catch {
        return jsonResponse(
          {
            error:
              "Invalid webhook JSON payload",
          },
          400,
        );
      }

      console.log(
        "Flutterwave webhook:",
        JSON.stringify(
          payload,
        ),
      );

      /*
       * ======================================================
       * 6. EVENT
       * ======================================================
       */

      const event =
        payload?.type ??
        payload?.event ??
        null;

      console.log(
        "Flutterwave webhook event:",
        event,
      );

      /*
       * ======================================================
       * 7. ADMIN CLIENT
       * ======================================================
       */

      const supabase =
        adminClient();

      /*
       * ======================================================
       * 8. TRANSFER WEBHOOK
       * ======================================================
       *
       * Flutterwave currently sends transfer.disburse for
       * completed/failed transfers.
       *
       * Older integrations may use transfer.completed.
       */

      if (
        event ===
          "transfer.disburse" ||
        event ===
          "transfer.completed" ||
        event ===
          "Transfer"
      ) {
        return await handleTransferWebhook(
          payload,
          supabase,
        );
      }

      /*
       * ======================================================
       * 9. DEPOSIT / CHARGE WEBHOOK
       * ======================================================
       */

      if (
        event &&
        event !==
          "charge.completed"
      ) {
        console.log(
          `Ignoring unsupported Flutterwave event: ${event}`,
        );

        return jsonResponse({
          success:
            true,

          ignored:
            true,

          event,
        });
      }

      return await handleDepositWebhook(
        payload,
        supabase,
      );
    } catch (
      error
    ) {
      console.error(
        "Flutterwave webhook error:",
        error,
      );

      return jsonResponse(
        {
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
 * TRANSFER WEBHOOK HANDLER
 * ============================================================
 */

async function handleTransferWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ??
    {};

  /*
   * ==========================================================
   * TRANSFER IDENTIFIERS
   * ==========================================================
   */

  const transferId =
    data?.id
      ? String(
          data.id,
        )
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

  const webhookAmount =
    Number(
      data?.amount ??
        data?.amount?.value ??
        0,
    );

  const webhookCurrency =
    String(
      data?.destination_currency ??
        data?.currency ??
        "NGN",
    ).toUpperCase();

  console.log(
    "Transfer webhook received:",
    JSON.stringify({
      transferId,
      transferReference,
      webhookStatus,
      webhookAmount,
      webhookCurrency,
    }),
  );

  /*
   * ==========================================================
   * VALIDATION
   * ==========================================================
   */

  if (!transferId) {
    return jsonResponse(
      {
        error:
          "Transfer ID missing",
      },
      400,
    );
  }

  /*
   * We only process final statuses.
   *
   * NEW/PENDING are not final.
   */

  if (
    webhookStatus !==
      "SUCCESSFUL" &&
    webhookStatus !==
      "FAILED"
  ) {
    console.log(
      `Transfer ${transferId} is not final: ${webhookStatus}`,
    );

    return jsonResponse({
      success:
        true,

      ignored:
        true,

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
   * VERIFY TRANSFER WITH FLUTTERWAVE
   * ==========================================================
   *
   * This uses flw(), so when the proxy is configured:
   *
   * Webhook
   *   ↓
   * SmartASP
   *   ↓
   * Flutterwave
   */

  console.log(
    `Verifying transfer ${transferId} with Flutterwave...`,
  );

  let verifyResponse;

  try {
    verifyResponse =
      await flw(
        `/transfers/${encodeURIComponent(
          transferId,
        )}`,
        {
          method:
            "GET",
        },
      );
  } catch (
    error
  ) {
    console.error(
      "Transfer verification request failed:",
      error,
    );

    /*
     * Return non-2xx so Flutterwave can retry the webhook.
     */

    return jsonResponse(
      {
        success:
          false,

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
    console.error(
      "Transfer verification failed:",
      JSON.stringify(
        verifyResponse.body,
      ),
    );

    return jsonResponse(
      {
        success:
          false,

        error:
          "Flutterwave transfer verification failed",

        provider_error:
          verifyResponse.body?.message ??
          null,
      },
      503,
    );
  }

  const verified =
    verifyResponse.body?.data;

  if (!verified) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "Flutterwave transfer verification returned no data",
      },
      503,
    );
  }

  /*
   * ==========================================================
   * VERIFIED VALUES
   * ==========================================================
   */

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

  console.log(
    "Verified transfer:",
    JSON.stringify({
      transfer_id:
        transferId,

      status:
        verifiedStatus,

      reference:
        verifiedReference,

      amount:
        verifiedAmount,

      currency:
        verifiedCurrency,
    }),
  );

  /*
   * ==========================================================
   * VERIFIED FINAL STATUS
   * ==========================================================
   */

  if (
    verifiedStatus !==
      "SUCCESSFUL" &&
    verifiedStatus !==
      "FAILED"
  ) {
    return jsonResponse({
      success:
        true,

      ignored:
        true,

      reason:
        "Verified transfer is not final",

      transfer_id:
        transferId,

      status:
        verifiedStatus,
    });
  }

  /*
   * ==========================================================
   * VERIFY REFERENCE
   * ==========================================================
   */

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
    console.error(
      "Transfer reference mismatch:",
      JSON.stringify({
        webhook:
          transferReference,

        verified:
          verifiedReference,
      }),
    );

    return jsonResponse(
      {
        error:
          "Transfer reference mismatch",
      },
      400,
    );
  }

  /*
   * ==========================================================
   * FIND IYANJUPAY TRANSACTION
   * ==========================================================
   *
   * PRIMARY:
   * provider_reference = Flutterwave transfer ID
   *
   * FALLBACK:
   * reference_number = our transfer reference
   */

  let transaction: any =
    null;

  /*
   * PRIMARY LOOKUP
   */

  const {
    data: transactionByProvider,
    error:
      providerLookupError,
  } = await supabase
    .from(
      "transactions",
    )
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
    console.error(
      "Transaction provider lookup error:",
      providerLookupError,
    );

    throw providerLookupError;
  }

  transaction =
    transactionByProvider;

  /*
   * FALLBACK LOOKUP BY OUR REFERENCE
   */

  if (
    !transaction &&
    transferReference
  ) {
    const {
      data:
        transactionByReference,
      error:
        referenceLookupError,
    } = await supabase
      .from(
        "transactions",
      )
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

    if (
      referenceLookupError
    ) {
      throw referenceLookupError;
    }

    transaction =
      transactionByReference;
  }

  /*
   * ==========================================================
   * TRANSACTION NOT FOUND
   * ==========================================================
   */

  if (!transaction) {
    console.error(
      "IyanjuPay transfer transaction not found:",
      JSON.stringify({
        transferId,
        transferReference,
      }),
    );

    /*
     * Returning 404 would cause repeated webhook attempts without
     * giving us anything useful if the transaction genuinely
     * does not exist.
     *
     * This is logged for reconciliation.
     */

    return jsonResponse(
      {
        success:
          false,

        error:
          "IyanjuPay transfer transaction not found",

        transfer_id:
          transferId,

        reference:
          transferReference,
      },
      404,
    );
  }

  /*
   * ==========================================================
   * SECURITY CHECK
   * ==========================================================
   *
   * Only process our own Flutterwave transfer transactions.
   */

  if (
    transaction.provider &&
    String(
      transaction.provider,
    ).toLowerCase() !==
      "flutterwave"
  ) {
    console.error(
      "Transaction provider mismatch:",
      transaction.provider,
    );

    return jsonResponse(
      {
        error:
          "Transaction provider mismatch",
      },
      409,
    );
  }

  /*
   * ==========================================================
   * VERIFY AMOUNT
   * ==========================================================
   */

  const transactionAmount =
    Number(
      transaction.amount,
    );

  if (
    !Number.isFinite(
      transactionAmount,
    ) ||
    transactionAmount <= 0
  ) {
    return jsonResponse(
      {
        error:
          "Invalid IyanjuPay transaction amount",
      },
      409,
    );
  }

  /*
   * Do not process a provider response that says a different
   * amount from what we debited.
   */

  if (
    Number.isFinite(
      verifiedAmount,
    ) &&
    verifiedAmount > 0 &&
    verifiedAmount !==
      transactionAmount
  ) {
    console.error(
      "Transfer amount mismatch:",
      JSON.stringify({
        transaction:
          transactionAmount,

        flutterwave:
          verifiedAmount,
      }),
    );

    return jsonResponse(
      {
        error:
          "Transfer amount mismatch",
      },
      409,
    );
  }

  /*
   * ==========================================================
   * SUCCESSFUL TRANSFER
   * ==========================================================
   */

  if (
    verifiedStatus ===
    "SUCCESSFUL"
  ) {
    /*
     * Idempotency:
     *
     * If webhook is delivered again after we already marked
     * it successful, do nothing.
     */

    if (
      String(
        transaction.status,
      ).toLowerCase() ===
      "successful"
    ) {
      console.log(
        `Transfer ${transferId} already marked successful.`,
      );

      return jsonResponse({
        success:
          true,

        already_processed:
          true,

        status:
          "successful",

        transaction_id:
          transaction.id,

        transfer_id:
          transferId,
      });
    }

    const currentMetadata =
      transaction.metadata &&
      typeof transaction.metadata ===
        "object"
        ? transaction.metadata
        : {};

    const {
      error:
        successUpdateError,
    } = await supabase
      .from(
        "transactions",
      )
      .update({
        status:
          "successful",

        provider:
          "flutterwave",

        provider_reference:
          transferId,

        metadata: {
          ...currentMetadata,

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
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    if (
      successUpdateError
    ) {
      console.error(
        "Failed to mark transfer successful:",
        successUpdateError,
      );

      return jsonResponse(
        {
          success:
            false,

          error:
            "Unable to update transaction",
        },
        503,
      );
    }

    console.log(
      "IyanjuPay transfer marked successful:",
      JSON.stringify({
        transaction_id:
          transaction.id,

        transfer_id:
          transferId,
      }),
    );

    return jsonResponse({
      success:
        true,

      status:
        "successful",

      transaction_id:
        transaction.id,

      transfer_id:
        transferId,

      refunded:
        false,
    });
  }

  /*
   * ==========================================================
   * FAILED TRANSFER
   * ==========================================================
   *
   * THIS IS THE AUTOMATIC REFUND SECTION.
   * ==========================================================
   */

  if (
    verifiedStatus ===
    "FAILED"
  ) {
    /*
     * ========================================================
     * ALREADY REFUNDED?
     * ========================================================
     *
     * Check metadata first.
     */

    const existingMetadata =
      transaction.metadata &&
      typeof transaction.metadata ===
        "object"
        ? transaction.metadata
        : {};

    if (
      existingMetadata?.refunded ===
      true
    ) {
      console.log(
        `Transfer ${transferId} has already been refunded.`,
      );

      /*
       * Make sure final status is failed.
       */

      if (
        String(
          transaction.status,
        ).toLowerCase() !==
        "failed"
      ) {
        await supabase
          .from(
            "transactions",
          )
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
        success:
          true,

        already_processed:
          true,

        status:
          "failed",

        refunded:
          true,

        transaction_id:
          transaction.id,

        transfer_id:
          transferId,
      });
    }

    /*
     * ========================================================
     * IMPORTANT IDEMPOTENCY KEY
     * ========================================================
     *
     * Even if Flutterwave sends the webhook multiple times,
     * wallet_operation should process this REFUND key only once.
     */

    const refundIdempotencyKey =
      `REFUND_${transaction.id}`;

    console.log(
      "Starting automatic transfer refund:",
      JSON.stringify({
        transaction_id:
          transaction.id,

        amount:
          transactionAmount,

        refund_key:
          refundIdempotencyKey,

        transfer_id:
          transferId,
      }),
    );

    /*
     * ========================================================
     * REFUND WALLET
     * ========================================================
     */

    const {
      data: refundResult,
      error:
        refundError,
    } = await supabase.rpc(
      "wallet_operation",
      {
        _user_id:
          transaction.user_id,

        _operation:
          "REFUND",

        _amount:
          transactionAmount,

        _description:
          "Refund for failed Flutterwave bank transfer",

        _idempotency_key:
          refundIdempotencyKey,

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

          flutterwave_response:
            verified,

          reason:
            "Flutterwave transfer failed",

          refunded:
            true,
        },
      },
    );

    /*
     * ========================================================
     * REFUND FAILED
     * ========================================================
     */

    if (
      refundError
    ) {
      console.error(
        "AUTOMATIC TRANSFER REFUND FAILED:",
        refundError,
      );

      /*
       * DO NOT mark transaction simply "failed" while refund
       * has failed, because the user's money would remain
       * debited.
       *
       * Leave the transaction pending and record that refund
       * requires retry/reconciliation.
       */

      await supabase
        .from(
          "transactions",
        )
        .update({
          status:
            "pending",

          provider:
            "flutterwave",

          provider_reference:
            transferId,

          metadata: {
            ...existingMetadata,

            flutterwave_status:
              verifiedStatus,

            flutterwave_transfer_id:
              transferId,

            flutterwave_reference:
              verifiedReference ??
              transferReference,

            flutterwave_response:
              verified,

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

            refund_attempted_at:
              new Date().toISOString(),
          },
        })
        .eq(
          "id",
          transaction.id,
        );

      /*
       * Non-2xx response is intentional.
       *
       * Flutterwave can retry the webhook.
       */

      return jsonResponse(
        {
          success:
            false,

          status:
            "refund_pending",

          error:
            "Transfer failed but automatic refund could not be completed.",

          transaction_id:
            transaction.id,

          transfer_id:
            transferId,

          refund_required:
            true,
        },
        503,
      );
    }

    /*
     * ========================================================
     * REFUND SUCCESSFUL
     * ========================================================
     */

    console.log(
      "Automatic transfer refund successful:",
      JSON.stringify({
        transaction_id:
          transaction.id,

        amount:
          transactionAmount,

        transfer_id:
          transferId,

        refund_result:
          refundResult,
      }),
    );

    /*
     * ========================================================
     * MARK ORIGINAL TRANSACTION FAILED
     * ========================================================
     */

    const {
      error:
        failedUpdateError,
    } = await supabase
      .from(
        "transactions",
      )
      .update({
        status:
          "failed",

        provider:
          "flutterwave",

        provider_reference:
          transferId,

        metadata: {
          ...existingMetadata,

          flutterwave_status:
            verifiedStatus,

          flutterwave_transfer_id:
            transferId,

          flutterwave_reference:
            verifiedReference ??
            transferReference,

          flutterwave_response:
            verified,

          transfer_failed:
            true,

          refund_required:
            false,

          refunded:
            true,

          refund_pending:
            false,

          refund_completed_at:
            new Date().toISOString(),
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    if (
      failedUpdateError
    ) {
      /*
       * The wallet was already refunded.
       *
       * We must NOT issue another refund.
       *
       * The transaction update can safely be retried later.
       */

      console.error(
        "Refund succeeded but failed to update original transaction:",
        failedUpdateError,
      );

      return jsonResponse(
        {
          success:
            true,

          warning:
            "Refund completed but transaction status update requires reconciliation.",

          refunded:
            true,

          transaction_id:
            transaction.id,

          transfer_id:
            transferId,
        },
        200,
      );
    }

    /*
     * ========================================================
     * FINAL FAILED RESPONSE
     * ========================================================
     */

    return jsonResponse({
      success:
        true,

      status:
        "failed",

      refunded:
        true,

      transaction_id:
        transaction.id,

      transfer_id:
        transferId,

      amount:
        transactionAmount,
    });
  }

  /*
   * ==========================================================
   * SHOULD NEVER REACH HERE
   * ==========================================================
   */

  return jsonResponse({
    success:
      true,

    ignored:
      true,

    reason:
      "Unhandled transfer state",
  });
}

/*
 * ============================================================
 * DEPOSIT WEBHOOK HANDLER
 * ============================================================
 *
 * This is your existing virtual-account deposit logic,
 * preserved and cleaned up.
 * ============================================================
 */

async function handleDepositWebhook(
  payload: any,
  supabase: any,
): Promise<Response> {
  const data =
    payload?.data ??
    {};

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

  /*
   * ==========================================================
   * VALIDATE
   * ==========================================================
   */

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
      success:
        true,

      ignored:
        true,

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
   * VERIFY CHARGE
   * ==========================================================
   *
   * Deposit verification remains a transaction verification
   * endpoint because this is a charge/payment transaction,
   * not a bank payout transfer.
   */

  console.log(
    `Verifying Flutterwave deposit transaction ${transactionId}`,
  );

  let verifyResponse;

  try {
    verifyResponse =
      await flw(
        `/transactions/${encodeURIComponent(
          transactionId,
        )}/verify`,
        {
          method:
            "GET",
        },
      );
  } catch (
    error
  ) {
    console.error(
      "Flutterwave deposit verification request failed:",
      error,
    );

    return jsonResponse(
      {
        error:
          "Flutterwave verification failed",
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
      "Flutterwave deposit verification failed:",
      JSON.stringify(
        verifyResponse.body,
      ),
    );

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

  /*
   * ==========================================================
   * VERIFIED VALUES
   * ==========================================================
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
    verified?.currency
      ? String(
          verified.currency,
        ).toUpperCase()
      : null;

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
      success:
        true,

      ignored:
        true,

      reason:
        "Verified transaction is not successful",
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
        error:
          "Invalid verified amount",
      },
      400,
    );
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

  /*
   * ==========================================================
   * REFERENCE MATCH
   * ==========================================================
   */

  if (
    verifiedTxRef &&
    webhookTxRef &&
    String(
      verifiedTxRef,
    ) !==
      String(
        webhookTxRef,
      )
  ) {
    return jsonResponse(
      {
        error:
          "Transaction reference mismatch",
      },
      400,
    );
  }

  /*
   * Never credit more than verified amount.
   */

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

  if (!finalTxRef) {
    return jsonResponse(
      {
        error:
          "Transaction reference missing",
      },
      400,
    );
  }

  /*
   * ==========================================================
   * FIND VIRTUAL ACCOUNT
   * ==========================================================
   */

  let virtualAccount:
    any = null;

  /*
   * PRIMARY:
   *
   * IYJ_VA_<USER_ID>_<UUID>
   */

  if (
    finalTxRef.startsWith(
      "IYJ_VA_",
    )
  ) {
    const parts =
      finalTxRef.split(
        "_",
      );

    const possibleUserId =
      parts[2];

    if (
      possibleUserId
    ) {
      const {
        data:
          account,
        error:
          accountError,
      } =
        await supabase
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

      if (
        accountError
      ) {
        throw accountError;
      }

      if (
        account
      ) {
        virtualAccount =
          account;
      }
    }
  }

  /*
   * ==========================================================
   * FALLBACK ACCOUNT NUMBER SEARCH
   * ==========================================================
   */

  if (
    !virtualAccount
  ) {
    const possibleAccountNumbers =
      [
        data?.account_number,
        data?.accountNumber,
        data?.virtual_account_number,
        data?.virtualAccountNumber,
        data?.destination_account_number,
        data?.destinationAccountNumber,

        data?.meta?.account_number,
        data?.meta?.accountNumber,
        data?.meta?.virtual_account_number,
        data?.meta?.virtualAccountNumber,

        verified?.account_number,
        verified?.accountNumber,
        verified?.virtual_account_number,
        verified?.virtualAccountNumber,
        verified?.destination_account_number,
        verified?.destinationAccountNumber,

        verified?.meta?.account_number,
        verified?.meta?.accountNumber,
        verified?.meta?.virtual_account_number,
        verified?.meta?.virtualAccountNumber,

        data?.bank_transfer?.account_number,
        data?.bank_transfer?.accountNumber,

        verified?.bank_transfer?.account_number,
        verified?.bank_transfer?.accountNumber,
      ]
        .map(
          (
            value,
          ) =>
            value !==
              null &&
            value !==
              undefined
              ? String(
                  value,
                ).trim()
              : "",
        )
        .filter(
          Boolean,
        );

    const uniqueAccountNumbers =
      [
        ...new Set(
          possibleAccountNumbers,
        ),
      ];

    for (
      const accountNumber of
      uniqueAccountNumbers
    ) {
      const {
        data:
          account,
        error:
          accountError,
      } =
        await supabase
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

      if (
        accountError
      ) {
        throw accountError;
      }

      if (
        account
      ) {
        virtualAccount =
          account;

        break;
      }
    }
  }

  /*
   * ==========================================================
   * VIRTUAL ACCOUNT NOT FOUND
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * WALLET VALIDATION
   * ==========================================================
   */

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

  const {
    data: wallet,
    error:
      walletError,
  } = await supabase
    .from(
      "wallets",
    )
    .select(
      "id, user_id, balance, currency, status",
    )
    .eq(
      "id",
      virtualAccount.wallet_id,
    )
    .maybeSingle();

  if (
    walletError
  ) {
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
   * IDEMPOTENCY
   * ==========================================================
   */

  const fundingReference =
    `FLW_${String(
      transactionId,
    )}`;

  const {
    data:
      existingFunding,
    error:
      existingFundingError,
  } =
    await supabase
      .from(
        "transactions",
      )
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
        "reference_number",
        fundingReference,
      )
      .maybeSingle();

  if (
    existingFundingError
  ) {
    throw existingFundingError;
  }

  if (
    existingFunding
  ) {
    return jsonResponse({
      success:
        true,

      already_processed:
        true,

      reference:
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
    data:
      creditResult,
    error:
      creditError,
  } =
    await supabase.rpc(
      "credit_wallet",
      {
        p_wallet_id:
          virtualAccount.wallet_id,

        p_amount:
          verifiedAmount,

        p_reference_number:
          fundingReference,

        p_description:
          "Flutterwave virtual account funding",

        p_provider:
          "flutterwave",

        p_provider_reference:
          String(
            verifiedFlwRef ??
              transactionId,
          ),
      },
    );

  if (
    creditError
  ) {
    console.error(
      "credit_wallet error:",
      creditError,
    );

    throw creditError;
  }

  /*
   * ==========================================================
   * SUCCESS
   * ==========================================================
   */

  return jsonResponse({
    success:
      true,

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

    virtual_account:
      virtualAccount.account_number,

    wallet_id:
      virtualAccount.wallet_id,

    user_id:
      virtualAccount.user_id,

    credit:
      creditResult,
  });
}
