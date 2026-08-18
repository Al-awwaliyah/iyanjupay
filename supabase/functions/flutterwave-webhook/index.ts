import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, flutterwave-signature, verif-hash",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ============================================================
// HELPERS
// ============================================================

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(i + chunkSize, bytes.length)
      )
    );
  }

  return btoa(binary);
}

// Generate Flutterwave HMAC-SHA256 signature
async function generateFlutterwaveSignature(
  rawBody: string,
  secretHash: string
): Promise<string> {
  const encoder = new TextEncoder();

  const keyData = encoder.encode(secretHash);

  const bodyData = encoder.encode(rawBody);

  const cryptoKey =
    await crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      bodyData
    );

  return arrayBufferToBase64(signature);
}

// Timing-safe comparison
function safeEqual(
  a: string,
  b: string
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const encoder = new TextEncoder();

  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  let result = 0;

  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

// ============================================================
// WEBHOOK
// ============================================================

Deno.serve(async (req) => {
  // ============================================================
  // 0. CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // ============================================================
  // 1. METHOD
  // ============================================================

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    // ==========================================================
    // 2. ENVIRONMENT
    // ==========================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      ) ?? "";

    const flutterwaveSecret =
      Deno.env.get(
        "FLUTTERWAVE_SECRET_KEY"
      ) ?? "";

    const webhookSecret =
      Deno.env.get(
        "FLW_SECRET_HASH"
      ) ?? "";

    if (!supabaseUrl) {
      throw new Error(
        "SUPABASE_URL is not configured"
      );
    }

    if (!serviceRoleKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not configured"
      );
    }

    if (!flutterwaveSecret) {
      throw new Error(
        "FLUTTERWAVE_SECRET_KEY is not configured"
      );
    }

    if (!webhookSecret) {
      throw new Error(
        "FLW_SECRET_HASH is not configured"
      );
    }

    // ==========================================================
    // 3. READ RAW BODY
    //
    // IMPORTANT:
    //
    // Flutterwave's current webhook signature is calculated
    // from the RAW request body.
    //
    // Therefore we MUST read req.text() BEFORE JSON.parse().
    // ==========================================================

    const rawBody = await req.text();

    if (!rawBody) {
      console.error(
        "Flutterwave webhook received empty body"
      );

      return jsonResponse(
        {
          error: "Empty webhook body",
        },
        400
      );
    }

    console.log(
      "Flutterwave webhook request received"
    );

    // ==========================================================
    // 4. VERIFY FLUTTERWAVE SIGNATURE
    //
    // Current Flutterwave:
    //
    // flutterwave-signature =
    // Base64(HMAC-SHA256(rawBody, FLW_SECRET_HASH))
    // ==========================================================

    const flutterwaveSignature =
      req.headers.get(
        "flutterwave-signature"
      );

    // Keep support for the older Flutterwave
    // verif-hash header, but DO NOT treat the absence
    // of flutterwave-signature as an error if the legacy
    // header is correctly configured.
    const legacyVerifHash =
      req.headers.get("verif-hash");

    console.log(
      "Webhook signature headers:",
      JSON.stringify({
        has_flutterwave_signature:
          !!flutterwaveSignature,
        has_verif_hash:
          !!legacyVerifHash,
      })
    );

    // ----------------------------------------------------------
    // CURRENT SIGNATURE
    // ----------------------------------------------------------

    if (flutterwaveSignature) {
      const expectedSignature =
        await generateFlutterwaveSignature(
          rawBody,
          webhookSecret
        );

      if (
        !safeEqual(
          expectedSignature,
          flutterwaveSignature
        )
      ) {
        console.error(
          "Invalid Flutterwave webhook signature"
        );

        return jsonResponse(
          {
            error: "Invalid webhook signature",
          },
          401
        );
      }

      console.log(
        "Flutterwave webhook signature verified"
      );
    }

    // ----------------------------------------------------------
    // LEGACY SIGNATURE
    //
    // Flutterwave's older webhook system sends the secret
    // directly in verif-hash.
    // ----------------------------------------------------------

    else if (legacyVerifHash) {
      if (
        !safeEqual(
          legacyVerifHash,
          webhookSecret
        )
      ) {
        console.error(
          "Invalid Flutterwave verif-hash"
        );

        return jsonResponse(
          {
            error: "Invalid webhook signature",
          },
          401
        );
      }

      console.log(
        "Flutterwave legacy verif-hash verified"
      );
    }

    // ----------------------------------------------------------
    // NO SIGNATURE
    // ----------------------------------------------------------

    else {
      console.error(
        "Missing Flutterwave webhook signature"
      );

      return jsonResponse(
        {
          error:
            "Missing Flutterwave webhook signature",
        },
        401
      );
    }

    // ==========================================================
    // 5. PARSE PAYLOAD
    // ==========================================================

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error(
        "Invalid JSON webhook payload:",
        error
      );

      return jsonResponse(
        {
          error:
            "Invalid webhook JSON payload",
        },
        400
      );
    }

    console.log(
      "Flutterwave webhook received:",
      JSON.stringify(payload)
    );

    // ==========================================================
    // 6. EVENT
    // ==========================================================

    const event =
      payload?.type ??
      payload?.event ??
      null;

    console.log(
      "Flutterwave webhook event:",
      event
    );

    // ==========================================================
    // 7. ONLY PROCESS CHARGE COMPLETED
    // ==========================================================

    if (
      event &&
      event !== "charge.completed"
    ) {
      console.log(
        `Ignoring Flutterwave event: ${event}`
      );

      return jsonResponse({
        success: true,
        ignored: true,
        event,
      });
    }

    // ==========================================================
    // 8. PAYLOAD DATA
    // ==========================================================

    const data =
      payload?.data ?? {};

    const transactionId =
      data?.id;

    const transactionStatus =
      String(
        data?.status ?? ""
      ).toLowerCase();

    const webhookAmount =
      Number(
        data?.amount ?? 0
      );

    const webhookCurrency =
      data?.currency
        ? String(
            data.currency
          ).toUpperCase()
        : null;

    const webhookTxRef =
      data?.tx_ref ??
      data?.txRef ??
      data?.reference ??
      null;

    console.log(
      "Webhook transaction:",
      JSON.stringify({
        transactionId,
        transactionStatus,
        webhookAmount,
        webhookCurrency,
        webhookTxRef,
      })
    );

    // ==========================================================
    // 9. VALIDATE TRANSACTION ID
    // ==========================================================

    if (!transactionId) {
      console.error(
        "Missing Flutterwave transaction ID"
      );

      return jsonResponse(
        {
          error:
            "Missing Flutterwave transaction ID",
        },
        400
      );
    }

    // ==========================================================
    // 10. VALIDATE WEBHOOK STATUS
    // ==========================================================

    if (
      transactionStatus !== "successful" &&
      transactionStatus !== "succeeded"
    ) {
      console.log(
        `Ignoring unsuccessful transaction ${transactionId}: ${transactionStatus}`
      );

      return jsonResponse({
        success: true,
        ignored: true,
        reason:
          "Transaction not successful",
      });
    }

    // ==========================================================
    // 11. VALIDATE WEBHOOK AMOUNT
    // ==========================================================

    if (
      !Number.isFinite(
        webhookAmount
      ) ||
      webhookAmount <= 0
    ) {
      return jsonResponse(
        {
          error:
            "Invalid transaction amount",
        },
        400
      );
    }

    // ==========================================================
    // 12. VALIDATE WEBHOOK CURRENCY
    // ==========================================================

    if (
      webhookCurrency &&
      webhookCurrency !== "NGN"
    ) {
      return jsonResponse(
        {
          error:
            "Unsupported currency",
        },
        400
      );
    }

    // ==========================================================
    // 13. CREATE ADMIN SUPABASE CLIENT
    // ==========================================================

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    // ==========================================================
    // 14. VERIFY TRANSACTION DIRECTLY WITH FLUTTERWAVE
    // ==========================================================

    console.log(
      `Verifying Flutterwave transaction ${transactionId}`
    );

    const verifyResponse =
      await fetch(
        `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${flutterwaveSecret}`,
            Accept:
              "application/json",
          },
        }
      );

    const verifyData =
      await verifyResponse.json();

    console.log(
      "Flutterwave verification response:",
      JSON.stringify(
        verifyData
      )
    );

    if (!verifyResponse.ok) {
      console.error(
        "Flutterwave verification failed:",
        JSON.stringify(
          verifyData
        )
      );

      return jsonResponse(
        {
          error:
            "Flutterwave verification failed",
        },
        502
      );
    }

    if (
      verifyData?.status !==
      "success"
    ) {
      return jsonResponse(
        {
          error:
            "Transaction could not be verified",
        },
        400
      );
    }

    const verified =
      verifyData?.data;

    if (!verified) {
      return jsonResponse(
        {
          error:
            "Missing verified transaction data",
        },
        400
      );
    }

    // ==========================================================
    // 15. VERIFIED TRANSACTION VALUES
    // ==========================================================

    const verifiedStatus =
      String(
        verified?.status ?? ""
      ).toLowerCase();

    const verifiedAmount =
      Number(
        verified?.amount ?? 0
      );

    const verifiedCurrency =
      verified?.currency
        ? String(
            verified.currency
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

    console.log(
      "Verified transaction values:",
      JSON.stringify({
        status:
          verifiedStatus,
        amount:
          verifiedAmount,
        currency:
          verifiedCurrency,
        txRef:
          verifiedTxRef,
        flwRef:
          verifiedFlwRef,
      })
    );

    // ==========================================================
    // 16. VERIFIED STATUS
    // ==========================================================

    if (
      verifiedStatus !== "successful" &&
      verifiedStatus !== "succeeded"
    ) {
      return jsonResponse({
        success: true,
        ignored: true,
        reason:
          "Verified transaction is not successful",
      });
    }

    // ==========================================================
    // 17. VERIFIED AMOUNT
    // ==========================================================

    if (
      !Number.isFinite(
        verifiedAmount
      ) ||
      verifiedAmount <= 0
    ) {
      return jsonResponse(
        {
          error:
            "Invalid verified amount",
        },
        400
      );
    }

    // ==========================================================
    // 18. VERIFIED CURRENCY
    // ==========================================================

    if (
      verifiedCurrency !== "NGN"
    ) {
      return jsonResponse(
        {
          error:
            "Verified transaction is not NGN",
        },
        400
      );
    }

    // ==========================================================
    // 19. VERIFY REFERENCE MATCH
    // ==========================================================

    if (
      verifiedTxRef &&
      webhookTxRef &&
      String(verifiedTxRef) !==
        String(webhookTxRef)
    ) {
      console.error(
        `Reference mismatch: webhook=${webhookTxRef}, verified=${verifiedTxRef}`
      );

      return jsonResponse(
        {
          error:
            "Transaction reference mismatch",
        },
        400
      );
    }

    // ==========================================================
    // 20. NEVER CREDIT MORE THAN VERIFIED AMOUNT
    // ==========================================================

    if (
      verifiedAmount <
      webhookAmount
    ) {
      console.error(
        `Verified amount ${verifiedAmount} is lower than webhook amount ${webhookAmount}`
      );

      return jsonResponse(
        {
          error:
            "Verified amount mismatch",
        },
        400
      );
    }

    // ==========================================================
    // 21. FINAL TX REF
    // ==========================================================

    const finalTxRef =
      String(
        verifiedTxRef ??
          webhookTxRef ??
          ""
      ).trim();

    console.log(
      "Final transaction reference:",
      finalTxRef
    );

    if (!finalTxRef) {
      return jsonResponse(
        {
          error:
            "Transaction reference missing",
        },
        400
      );
    }

    // ==========================================================
    // 22. FIND VIRTUAL ACCOUNT
    //
    // PRIMARY METHOD:
    //
    // IYJ_VA_<USER_ID>_<UUID>
    //
    // Example:
    //
    // IYJ_VA_deebe49e-00d2-4609-9cc6-3ccf0eb0fa19_43140...
    // ==========================================================

    let virtualAccount: any =
      null;

    if (
      finalTxRef.startsWith(
        "IYJ_VA_"
      )
    ) {
      const parts =
        finalTxRef.split("_");

      const possibleUserId =
        parts[2];

      console.log(
        "IyanjuPay VA reference detected:",
        JSON.stringify({
          parts,
          possibleUserId,
        })
      );

      if (
        possibleUserId
      ) {
        const {
          data: account,
          error: accountError,
        } = await supabase
          .from(
            "virtual_accounts"
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
            `
          )
          .eq(
            "user_id",
            possibleUserId
          )
          .eq(
            "provider",
            "flutterwave"
          )
          .eq(
            "is_permanent",
            true
          )
          .eq(
            "status",
            "active"
          )
          .maybeSingle();

        if (accountError) {
          console.error(
            "Virtual account lookup by user_id failed:",
            accountError
          );

          throw accountError;
        }

        if (account) {
          virtualAccount =
            account;

          console.log(
            "Virtual account matched by tx_ref user_id:",
            JSON.stringify({
              id:
                account.id,
              user_id:
                account.user_id,
              wallet_id:
                account.wallet_id,
              account_number:
                account.account_number,
            })
          );
        }
      }
    }

    // ==========================================================
    // 23. FALLBACK:
    // SEARCH ACCOUNT NUMBER
    // ==========================================================

    if (!virtualAccount) {
      const possibleAccountNumbers = [
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
        data?.meta?.destination_account_number,
        data?.meta?.destinationAccountNumber,

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
        verified?.meta?.destination_account_number,
        verified?.meta?.destinationAccountNumber,

        data?.bank_transfer?.account_number,
        data?.bank_transfer?.accountNumber,
        data?.bank_transfer?.destination_account_number,
        data?.bank_transfer?.destinationAccountNumber,

        verified?.bank_transfer?.account_number,
        verified?.bank_transfer?.accountNumber,
        verified?.bank_transfer?.destination_account_number,
        verified?.bank_transfer?.destinationAccountNumber,
      ]
        .map((value) =>
          value !== null &&
          value !== undefined
            ? String(value).trim()
            : ""
        )
        .filter(Boolean);

      const uniqueAccountNumbers = [
        ...new Set(
          possibleAccountNumbers
        ),
      ];

      console.log(
        "Possible virtual account numbers:",
        JSON.stringify(
          uniqueAccountNumbers
        )
      );

      for (
        const accountNumber of
        uniqueAccountNumbers
      ) {
        const {
          data: account,
          error: accountError,
        } = await supabase
          .from(
            "virtual_accounts"
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
            `
          )
          .eq(
            "account_number",
            accountNumber
          )
          .eq(
            "provider",
            "flutterwave"
          )
          .eq(
            "is_permanent",
            true
          )
          .eq(
            "status",
            "active"
          )
          .maybeSingle();

        if (accountError) {
          throw accountError;
        }

        if (account) {
          virtualAccount =
            account;

          console.log(
            "Virtual account matched by account number:",
            JSON.stringify({
              id:
                account.id,
              user_id:
                account.user_id,
              wallet_id:
                account.wallet_id,
              account_number:
                account.account_number,
            })
          );

          break;
        }
      }
    }

    // ==========================================================
    // 24. FINAL VIRTUAL ACCOUNT VALIDATION
    // ==========================================================

    if (!virtualAccount) {
      console.error(
        "Could not determine destination virtual account number",
        JSON.stringify({
          transactionId,
          txRef:
            finalTxRef,
          amount:
            verifiedAmount,
          currency:
            verifiedCurrency,
        })
      );

      return jsonResponse(
        {
          error:
            "Virtual account not found",
        },
        404
      );
    }

    console.log(
      "Matched virtual account:",
      JSON.stringify({
        id:
          virtualAccount.id,
        user_id:
          virtualAccount.user_id,
        wallet_id:
          virtualAccount.wallet_id,
        account_number:
          virtualAccount.account_number,
      })
    );

    // ==========================================================
    // 25. VALIDATE WALLET ID
    // ==========================================================

    if (
      !virtualAccount.wallet_id
    ) {
      return jsonResponse(
        {
          error:
            "Virtual account has no wallet",
        },
        400
      );
    }

    // ==========================================================
    // 26. GET WALLET
    // ==========================================================

    const {
      data: wallet,
      error: walletError,
    } = await supabase
      .from("wallets")
      .select(
        "id, user_id, balance, currency, status"
      )
      .eq(
        "id",
        virtualAccount.wallet_id
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
        404
      );
    }

    // ==========================================================
    // 27. WALLET OWNERSHIP
    // ==========================================================

    if (
      wallet.user_id !==
      virtualAccount.user_id
    ) {
      console.error(
        "Wallet ownership mismatch:",
        JSON.stringify({
          wallet_user_id:
            wallet.user_id,
          account_user_id:
            virtualAccount.user_id,
        })
      );

      return jsonResponse(
        {
          error:
            "Virtual account ownership mismatch",
        },
        409
      );
    }

    // ==========================================================
    // 28. WALLET CURRENCY
    // ==========================================================

    if (
      String(wallet.currency).toUpperCase() !==
      "NGN"
    ) {
      return jsonResponse(
        {
          error:
            "Wallet currency mismatch",
        },
        400
      );
    }

    // ==========================================================
    // 29. WALLET STATUS
    // ==========================================================

    if (
      wallet.status !==
      "active"
    ) {
      return jsonResponse(
        {
          error:
            "Wallet is not active",
        },
        403
      );
    }

    // ==========================================================
    // 30. IDEMPOTENCY REFERENCE
    // ==========================================================

    const fundingReference =
      `FLW_${String(
        transactionId
      )}`;

    console.log(
      "Funding reference:",
      fundingReference
    );

    // ==========================================================
    // 31. DUPLICATE CHECK
    // ==========================================================

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
        `
      )
      .eq(
        "reference_number",
        fundingReference
      )
      .maybeSingle();

    if (existingFundingError) {
      throw existingFundingError;
    }

    if (
      existingFunding
    ) {
      console.log(
        `Flutterwave transaction ${transactionId} already processed`
      );

      return jsonResponse({
        success: true,
        already_processed: true,
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

    // ==========================================================
    // 32. CREDIT WALLET
    // ==========================================================

    console.log(
      "Calling credit_wallet:",
      JSON.stringify({
        wallet_id:
          virtualAccount.wallet_id,
        amount:
          verifiedAmount,
        reference:
          fundingReference,
      })
    );

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
          "Flutterwave virtual account funding",

        p_provider:
          "flutterwave",

        p_provider_reference:
          String(
            verifiedFlwRef ??
              transactionId
          ),
      }
    );

    if (creditError) {
      console.error(
        "credit_wallet RPC error:",
        creditError
      );

      throw creditError;
    }

    console.log(
      "Wallet credit result:",
      JSON.stringify(
        creditResult
      )
    );

    // ==========================================================
    // 33. SUCCESS
    // ==========================================================

    console.log(
      "Flutterwave virtual account funding completed successfully:",
      JSON.stringify({
        transactionId,
        fundingReference,
        amount:
          verifiedAmount,
        walletId:
          virtualAccount.wallet_id,
        userId:
          virtualAccount.user_id,
        accountNumber:
          virtualAccount.account_number,
      })
    );

    return jsonResponse({
      success: true,

      event:
        event ??
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
  } catch (error) {
    console.error(
      "Flutterwave webhook error:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});
