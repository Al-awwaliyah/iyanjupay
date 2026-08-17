import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // ============================================================
  // 0. CORS / METHOD
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: corsHeaders,
      }
    );
  }
  try {
    // ============================================================
    // 1. ENVIRONMENT
    // ============================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    /*
     * This must be the same secret/hash configured in
     * Flutterwave Dashboard → Webhooks.
     */
    const webhookSecret =
      Deno.env.get("FLW_SECRET_HASH") ?? "";

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

    // ============================================================
    // 2. VERIFY FLUTTERWAVE WEBHOOK SIGNATURE
    // ============================================================

    const receivedHash =
      req.headers.get("verif-hash");

    if (!receivedHash) {
      console.error(
        "Missing Flutterwave verif-hash header"
      );

      return new Response(
        JSON.stringify({
          error: "Missing webhook signature",
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    if (receivedHash !== webhookSecret) {
      console.error(
        "Invalid Flutterwave webhook signature"
      );

      return new Response(
        JSON.stringify({
          error: "Invalid signature",
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    console.log(
      "Flutterwave webhook signature verified"
    );

    // ============================================================
    // 3. ADMIN SUPABASE CLIENT
    // ============================================================

    /*
     * This function is server-to-server.
     *
     * Service role is required because the webhook must be able
     * to safely read the user's virtual account and call the
     * protected wallet credit RPC regardless of frontend RLS.
     */
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // ============================================================
    // 4. READ FLUTTERWAVE PAYLOAD
    // ============================================================

    const payload = await req.json();

    console.log(
      "Flutterwave webhook received:",
      JSON.stringify(payload)
    );

    const data = payload?.data ?? {};

    /*
     * Support both the older Flutterwave webhook format:
     *
     *   event: "charge.completed"
     *
     * and newer payloads that may expose:
     *
     *   type: "charge.completed"
     */
    const event =
      payload?.event ??
      payload?.type ??
      null;

    console.log(
      "Flutterwave webhook event:",
      event
    );

    // ============================================================
    // 5. ONLY PROCESS CHARGE COMPLETED
    // ============================================================

    if (
      event &&
      event !== "charge.completed"
    ) {
      console.log(
        `Ignoring Flutterwave event: ${event}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          event,
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 6. EXTRACT BASIC TRANSACTION DATA
    // ============================================================

    const transactionId =
      data?.id;

    const transactionStatus =
      data?.status;

    const amount =
      Number(data?.amount ?? 0);

    const currency =
      data?.currency
        ? String(data.currency).toUpperCase()
        : null;

    const txRef =
      data?.tx_ref ??
      data?.txRef ??
      null;

    console.log(
      "Webhook transaction:",
      JSON.stringify({
        transactionId,
        transactionStatus,
        amount,
        currency,
        txRef,
      })
    );

    if (!transactionId) {
      console.error(
        "Missing Flutterwave transaction ID"
      );

      return new Response(
        JSON.stringify({
          error:
            "Missing Flutterwave transaction ID",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    /*
     * Flutterwave has used both "successful" and "succeeded"
     * in different API/webhook contexts.
     */
    if (
      transactionStatus !== "successful" &&
      transactionStatus !== "succeeded"
    ) {
      console.log(
        `Ignoring unsuccessful transaction ${transactionId}: ${transactionStatus}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason:
            "Transaction not successful",
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      console.error(
        "Invalid transaction amount:",
        amount
      );

      return new Response(
        JSON.stringify({
          error:
            "Invalid transaction amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (
      currency &&
      currency !== "NGN"
    ) {
      console.error(
        `Unsupported webhook currency: ${currency}`
      );

      return new Response(
        JSON.stringify({
          error:
            "Unsupported currency",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 7. VERIFY TRANSACTION DIRECTLY WITH FLUTTERWAVE
    // ============================================================

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
      JSON.stringify(verifyData)
    );

    if (!verifyResponse.ok) {
      console.error(
        "Flutterwave verification request failed:",
        JSON.stringify(verifyData)
      );

      return new Response(
        JSON.stringify({
          error:
            "Flutterwave verification failed",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    if (
      verifyData?.status !== "success"
    ) {
      console.error(
        "Flutterwave verification returned unsuccessful status"
      );

      return new Response(
        JSON.stringify({
          error:
            "Transaction could not be verified",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const verified =
      verifyData?.data;

    if (!verified) {
      return new Response(
        JSON.stringify({
          error:
            "Missing verified transaction data",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 8. VALIDATE VERIFIED TRANSACTION
    // ============================================================

    const verifiedStatus =
      verified?.status;

    if (
      verifiedStatus !== "successful" &&
      verifiedStatus !== "succeeded"
    ) {
      console.log(
        `Verified transaction ${transactionId} is not successful: ${verifiedStatus}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason:
            "Verified transaction is not successful",
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

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
      null;

    console.log(
      "Verified transaction values:",
      JSON.stringify({
        status: verifiedStatus,
        amount: verifiedAmount,
        currency: verifiedCurrency,
        txRef: verifiedTxRef,
      })
    );

    if (
      !Number.isFinite(
        verifiedAmount
      ) ||
      verifiedAmount <= 0
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid verified amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (
      verifiedCurrency !== "NGN"
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Verified transaction is not NGN",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    /*
     * Only compare tx_ref when both sides actually provide it.
     *
     * Virtual-account transfers may not always expose a normal
     * Checkout tx_ref.
     */
    if (
      verifiedTxRef &&
      txRef &&
      verifiedTxRef !== txRef
    ) {
      console.error(
        `Reference mismatch: webhook=${txRef}, verified=${verifiedTxRef}`
      );

      return new Response(
        JSON.stringify({
          error:
            "Transaction reference mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    /*
     * Never credit more than Flutterwave actually verified.
     */
    if (
      verifiedAmount < amount
    ) {
      console.error(
        `Verified amount ${verifiedAmount} is lower than webhook amount ${amount}`
      );

      return new Response(
        JSON.stringify({
          error:
            "Verified amount mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 9. FIND DESTINATION VIRTUAL ACCOUNT
    // ============================================================

    /*
     * Virtual-account webhook payloads can expose the destination
     * account number in different locations.
     *
     * We collect all likely fields and then match them against
     * our own virtual_accounts table.
     */

    const possibleAccountNumbers = [
      // Webhook data
      data?.account_number,
      data?.accountNumber,
      data?.virtual_account_number,
      data?.virtualAccountNumber,
      data?.destination_account_number,
      data?.destinationAccountNumber,

      // Webhook metadata
      data?.meta?.account_number,
      data?.meta?.accountNumber,
      data?.meta?.virtual_account_number,
      data?.meta?.virtualAccountNumber,
      data?.meta?.destination_account_number,
      data?.meta?.destinationAccountNumber,

      // Verified transaction
      verified?.account_number,
      verified?.accountNumber,
      verified?.virtual_account_number,
      verified?.virtualAccountNumber,
      verified?.destination_account_number,
      verified?.destinationAccountNumber,

      // Verified metadata
      verified?.meta?.account_number,
      verified?.meta?.accountNumber,
      verified?.meta?.virtual_account_number,
      verified?.meta?.virtualAccountNumber,
      verified?.meta?.destination_account_number,
      verified?.meta?.destinationAccountNumber,

      // Additional common transfer structures
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

    if (
      uniqueAccountNumbers.length === 0
    ) {
      console.error(
        "Could not determine destination virtual account number"
      );

      return new Response(
        JSON.stringify({
          error:
            "Destination virtual account could not be identified",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 10. MATCH VIRTUAL ACCOUNT
    // ============================================================

    let virtualAccount:
      | {
          id: string;
          user_id: string;
          wallet_id: string;
          provider: string;
          bank_name: string;
          account_number: string;
          account_name: string;
          provider_reference: string | null;
          order_reference: string | null;
          is_permanent: boolean;
          status: string;
        }
      | null = null;

    for (
      const accountNumber
      of uniqueAccountNumbers
    ) {
      const {
        data: account,
        error: accountError,
      } = await supabase
        .from("virtual_accounts")
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
        console.error(
          "Virtual account lookup error:",
          accountError
        );

        throw accountError;
      }

      if (account) {
        virtualAccount = account;
        break;
      }
    }

    if (!virtualAccount) {
      console.error(
        "No active permanent virtual account matched this transaction"
      );

      return new Response(
        JSON.stringify({
          error:
            "Virtual account not found",
        }),
        {
          status: 404,
          headers: corsHeaders,
        }
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

    // ============================================================
    // 11. VALIDATE WALLET
    // ============================================================

    if (
      !virtualAccount.wallet_id
    ) {
      console.error(
        "Virtual account has no wallet_id"
      );

      return new Response(
        JSON.stringify({
          error:
            "Virtual account has no wallet",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 12. VERIFY WALLET BELONGS TO USER
    // ============================================================

    const {
      data: wallet,
      error: walletError,
    } = await supabase
      .from("wallets")
      .select(
        "id, user_id, currency, status"
      )
      .eq(
        "id",
        virtualAccount.wallet_id
      )
      .maybeSingle();

    if (walletError) {
      console.error(
        "Wallet lookup error:",
        walletError
      );

      throw walletError;
    }

    if (!wallet) {
      console.error(
        "Wallet not found for virtual account"
      );

      return new Response(
        JSON.stringify({
          error:
            "Wallet not found",
        }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    if (
      wallet.user_id !==
      virtualAccount.user_id
    ) {
      console.error(
        "Virtual account / wallet ownership mismatch"
      );

      return new Response(
        JSON.stringify({
          error:
            "Virtual account ownership mismatch",
        }),
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    if (
      wallet.currency !== "NGN"
    ) {
      console.error(
        `Wallet currency is ${wallet.currency}, expected NGN`
      );

      return new Response(
        JSON.stringify({
          error:
            "Wallet currency mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (
      wallet.status !== "active"
    ) {
      console.error(
        `Wallet is not active: ${wallet.status}`
      );

      return new Response(
        JSON.stringify({
          error:
            "Wallet is not active",
        }),
        {
          status: 403,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 13. CREATE IDEMPOTENT FUNDING REFERENCE
    // ============================================================

    /*
     * Flutterwave transaction IDs are used as the provider-side
     * unique identifier.
     *
     * Example:
     *
     *   FLW_123456789
     *
     * This is passed to credit_wallet(), whose reference_number
     * is UNIQUE.
     *
     * Therefore repeated webhook deliveries cannot credit the
     * wallet twice.
     */

    const fundingReference =
      `FLW_${String(
        transactionId
      )}`;

    // ============================================================
    // 14. OPTIONAL EARLY DUPLICATE CHECK
    // ============================================================

    const {
      data: existingFunding,
      error: existingFundingError,
    } = await supabase
      .from("transactions")
      .select(
        "id, wallet_id, amount, status, reference_number, provider_reference"
      )
      .eq(
        "reference_number",
        fundingReference
      )
      .maybeSingle();

    if (existingFundingError) {
      console.error(
        "Existing funding lookup error:",
        existingFundingError
      );

      throw existingFundingError;
    }

    if (
      existingFunding?.status ===
      "completed"
    ) {
      console.log(
        `Flutterwave transaction ${transactionId} has already been processed`
      );

      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 15. CREDIT WALLET
    // ============================================================

    console.log(
      "Calling credit_wallet RPC:",
      JSON.stringify({
        wallet_id:
          virtualAccount.wallet_id,
        amount:
          verifiedAmount,
        reference:
          fundingReference,
        provider:
          "flutterwave",
        provider_reference:
          String(transactionId),
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
          String(transactionId),
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

    // ============================================================
    // 16. RETURN SUCCESS
    // ============================================================

    return new Response(
      JSON.stringify({
        success: true,

        event:
          event ??
          "charge.completed",

        flutterwave_transaction_id:
          transactionId,

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
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );

  } catch (error) {
    console.error(
      "Flutterwave webhook error:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
