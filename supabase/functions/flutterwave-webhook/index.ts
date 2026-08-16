import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // --------------------------------------------------
    // 1. Verify Flutterwave webhook signature
    // --------------------------------------------------

    const expectedHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
    const receivedHash = req.headers.get("verif-hash");

    if (expectedHash && receivedHash !== expectedHash) {
      console.error("Invalid Flutterwave webhook signature");

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

    // --------------------------------------------------
    // 2. Create SERVICE ROLE Supabase client
    // --------------------------------------------------

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    if (!flutterwaveSecret) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is not configured");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // --------------------------------------------------
    // 3. Read webhook payload
    // --------------------------------------------------

    const payload = await req.json();

    console.log(
      "Flutterwave webhook received:",
      JSON.stringify(payload)
    );

    const data = payload?.data ?? {};

    const transactionId = data?.id;
    const txRef = data?.tx_ref;
    const status = data?.status;

    const amount = Number(data?.amount ?? 0);

    if (!txRef) {
      console.error("Missing tx_ref");

      return new Response(
        JSON.stringify({
          error: "Missing tx_ref",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (!transactionId) {
      console.error("Missing Flutterwave transaction ID");

      return new Response(
        JSON.stringify({
          error: "Missing transaction ID",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 4. Only process successful transactions
    // --------------------------------------------------

    if (status !== "successful") {
      console.log(
        `Flutterwave transaction ${txRef} is not successful: ${status}`
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
      console.error("Invalid transaction amount:", amount);

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

    // --------------------------------------------------
    // 5. Re-verify transaction directly with Flutterwave
    // --------------------------------------------------

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
        "Flutterwave verification failed:",
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

    const verified = verifyData?.status === "success";
    const verifiedData = verifyData?.data;

    if (!verified || !verifiedData) {
      console.error("Transaction verification unsuccessful");

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

    // --------------------------------------------------
    // 6. Validate important Flutterwave values
    // --------------------------------------------------

    const verifiedStatus = verifiedData?.status;
    const verifiedTxRef = verifiedData?.tx_ref;
    const verifiedAmount = Number(
      verifiedData?.amount ?? 0
    );
    const verifiedCurrency = verifiedData?.currency;

    if (verifiedStatus !== "successful") {
      console.error(
        "Verified transaction is not successful:",
        verifiedStatus
      );

      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason: "Verified transaction not successful",
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    if (verifiedTxRef !== txRef) {
      console.error(
        `Reference mismatch. Webhook: ${txRef}, Verified: ${verifiedTxRef}`
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
      console.error(
        `Unsupported currency: ${verifiedCurrency}`
      );

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

    if (verifiedAmount < amount) {
      console.error(
        `Amount mismatch. Webhook: ${amount}, Verified: ${verifiedAmount}`
      );

      return new Response(
        JSON.stringify({
          error: "Transaction amount mismatch",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 7. Find the pending transaction
    // --------------------------------------------------

    const { data: transaction, error: transactionError } =
      await supabase
        .from("transactions")
        .select(
          "id, user_id, wallet_id, amount, status, reference_number"
        )
        .eq("reference_number", txRef)
        .maybeSingle();

    if (transactionError) {
      console.error(
        "Transaction lookup error:",
        transactionError
      );

      throw transactionError;
    }

    // --------------------------------------------------
    // 8. Handle already processed webhook
    // --------------------------------------------------

    if (transaction?.status === "completed") {
      console.log(
        `Transaction ${txRef} already completed`
      );

      return new Response(
        JSON.stringify({
          success: true,
          already_processed: true,
          reference: txRef,
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 9. Transaction must exist
    // --------------------------------------------------

    if (!transaction) {
      console.error(
        `Transaction ${txRef} was not found`
      );

      return new Response(
        JSON.stringify({
          error: "Transaction not found",
        }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 10. Validate wallet
    // --------------------------------------------------

    if (!transaction.wallet_id) {
      console.error(
        `Transaction ${txRef} has no wallet_id`
      );

      return new Response(
        JSON.stringify({
          error: "Transaction has no wallet",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 11. Validate expected amount
    // --------------------------------------------------

    const expectedAmount = Number(transaction.amount);

    if (
      !Number.isFinite(expectedAmount) ||
      expectedAmount <= 0
    ) {
      console.error(
        `Invalid stored transaction amount: ${transaction.amount}`
      );

      return new Response(
        JSON.stringify({
          error: "Invalid stored transaction amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (verifiedAmount < expectedAmount) {
      console.error(
        `Verified amount ${verifiedAmount} is less than expected ${expectedAmount}`
      );

      return new Response(
        JSON.stringify({
          error: "Insufficient verified amount",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // --------------------------------------------------
    // 12. Call SECURE credit_wallet RPC
    // --------------------------------------------------

    const { data: creditResult, error: creditError } =
      await supabase.rpc("credit_wallet", {
        p_wallet_id: transaction.wallet_id,
        p_amount: expectedAmount,
        p_reference_number: txRef,
        p_description: "Flutterwave wallet funding",
        p_provider: "flutterwave",
        p_provider_reference: String(transactionId),
      });

    if (creditError) {
      console.error(
        "credit_wallet RPC error:",
        creditError
      );

      throw creditError;
    }

    console.log(
      "Wallet credited successfully:",
      JSON.stringify(creditResult)
    );

    // --------------------------------------------------
    // 13. Return success
    // --------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        reference: txRef,
        transaction_id: transaction.id,
        amount: expectedAmount,
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
