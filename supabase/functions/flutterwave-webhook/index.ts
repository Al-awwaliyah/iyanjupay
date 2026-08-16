import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    const webhookSecret =
      Deno.env.get("FLW_SECRET_HASH") ?? "";

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL is not configured");
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
    // 2. VERIFY FLUTTERWAVE WEBHOOK SECRET
    // ============================================================

    const receivedHash = req.headers.get("verif-hash");

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

    // ============================================================
    // 3. ADMIN SUPABASE CLIENT
    // ============================================================

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

    const event = payload?.event;
    const data = payload?.data ?? {};

    // ============================================================
    // 5. ONLY PROCESS SUCCESSFUL CHARGES
    // ============================================================

    if (event && event !== "charge.completed") {
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

    const transactionId = data?.id;
    const transactionStatus = data?.status;
    const txRef = data?.tx_ref;

    const amount = Number(data?.amount ?? 0);
    const currency = data?.currency;

    if (!transactionId) {
      return new Response(
        JSON.stringify({
          error: "Missing Flutterwave transaction ID",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (transactionStatus !== "successful") {
      console.log(
        `Ignoring unsuccessful transaction ${transactionId}: ${transactionStatus}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason: "Transaction not successful",
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid transaction amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (currency && currency !== "NGN") {
      return new Response(
        JSON.stringify({
          error: "Unsupported currency",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 6. VERIFY TRANSACTION DIRECTLY WITH FLUTTERWAVE
    // ============================================================

    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${flutterwaveSecret}`,
          Accept: "application/json",
        },
      }
    );

    const verifyData = await verifyResponse.json();

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
          error: "Flutterwave verification failed",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    if (verifyData?.status !== "success") {
      return new Response(
        JSON.stringify({
          error: "Transaction could not be verified",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const verified = verifyData?.data;

    if (!verified) {
      return new Response(
        JSON.stringify({
          error: "Missing verified transaction data",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 7. VERIFY CRITICAL VALUES
    // ============================================================

    if (verified.status !== "successful") {
      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason: "Verified transaction is not successful",
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    const verifiedAmount = Number(
      verified.amount ?? 0
    );

    const verifiedCurrency = verified.currency;

    const verifiedTxRef = verified.tx_ref;

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
          error: "Transaction reference mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (verifiedCurrency !== "NGN") {
      return new Response(
        JSON.stringify({
          error: "Verified transaction is not NGN",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (
      !Number.isFinite(verifiedAmount) ||
      verifiedAmount <= 0
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid verified amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (verifiedAmount < amount) {
      console.error(
        `Verified amount ${verifiedAmount} is lower than webhook amount ${amount}`
      );

      return new Response(
        JSON.stringify({
          error: "Verified amount mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ============================================================
    // 8. FIND CUSTOMER'S PERMANENT VIRTUAL ACCOUNT
    // ============================================================

    /*
      Flutterwave bank-transfer payloads can expose the customer's
      destination/account information in different fields depending
      on the transaction type.

      We inspect the common fields and then match against the
      account_number stored in virtual_accounts.
    */

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
    ]
      .map((value) =>
        value !== null && value !== undefined
          ? String(value).trim()
          : ""
      )
      .filter(Boolean);

    const uniqueAccountNumbers = [
      ...new Set(possibleAccountNumbers),
    ];

    console.log(
      "Possible virtual account numbers:",
      JSON.stringify(uniqueAccountNumbers)
    );

    if (uniqueAccountNumbers.length === 0) {
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

    let virtualAccount = null;

    for (const accountNumber of uniqueAccountNumbers) {
      const { data: account, error: accountError } =
        await supabase
          .from("virtual_accounts")
          .select(
            "id, user_id, wallet_id, provider, bank_name, account_number, account_name, provider_reference, order_reference, is_permanent, status"
          )
          .eq("account_number", accountNumber)
          .eq("provider", "flutterwave")
          .eq("is_permanent", true)
          .eq("status", "active")
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
        id: virtualAccount.id,
        user_id: virtualAccount.user_id,
        wallet_id: virtualAccount.wallet_id,
        account_number: virtualAccount.account_number,
      })
    );

    // ============================================================
    // 9. CREATE UNIQUE FUNDING REFERENCE
    // ============================================================

    /*
      Flutterwave transaction ID is globally unique for the
      provider and is therefore suitable for webhook idempotency.

      Prefix it so it cannot collide with unrelated references.
    */

    const fundingReference =
      `FLW_${transactionId}`;

    // ============================================================
    // 10. CALL SECURE credit_wallet RPC
    // ============================================================

    const { data: creditResult, error: creditError } =
      await supabase.rpc("credit_wallet", {
        p_wallet_id: virtualAccount.wallet_id,
        p_amount: verifiedAmount,
        p_reference_number: fundingReference,
        p_description:
          "Flutterwave virtual account funding",
        p_provider: "flutterwave",
        p_provider_reference:
          String(transactionId),
      });

    if (creditError) {
      console.error(
        "credit_wallet RPC error:",
        creditError
      );

      throw creditError;
    }

    console.log(
      "Wallet credit result:",
      JSON.stringify(creditResult)
    );

    // ============================================================
    // 11. RETURN SUCCESS
    // ============================================================

    return new Response(
      JSON.stringify({
        success: true,
        event: event ?? "charge.completed",
        flutterwave_transaction_id:
          transactionId,
        reference: fundingReference,
        amount: verifiedAmount,
        currency: verifiedCurrency,
        virtual_account:
          virtualAccount.account_number,
        wallet_id:
          virtualAccount.wallet_id,
        credit: creditResult,
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
