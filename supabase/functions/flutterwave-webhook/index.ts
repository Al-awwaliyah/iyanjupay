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
    // 2. VERIFY WEBHOOK SIGNATURE
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

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ============================================================
    // 4. READ PAYLOAD
    // ============================================================

    const payload = await req.json();

    console.log(
      "Flutterwave webhook received:",
      JSON.stringify(payload)
    );

    const data =
      payload?.data ?? {};

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
    // 6. BASIC TRANSACTION DATA
    // ============================================================

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
      null;

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
      !Number.isFinite(
        webhookAmount
      ) ||
      webhookAmount <= 0
    ) {
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
      webhookCurrency &&
      webhookCurrency !== "NGN"
    ) {
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
    // 7. VERIFY WITH FLUTTERWAVE
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

    if (!verifyResponse.ok) {
      console.error(
        "Flutterwave verification failed:",
        JSON.stringify(
          verifyData
        )
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
      verifyData?.status !==
      "success"
    ) {
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
      String(
        verified?.status ?? ""
      ).toLowerCase();

    if (
      verifiedStatus !== "successful" &&
      verifiedStatus !== "succeeded"
    ) {
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

    const verifiedFlwRef =
      verified?.flw_ref ??
      verified?.flwRef ??
      null;

    console.log(
      "Verified transaction:",
      JSON.stringify({
        id: verified?.id,
        amount: verifiedAmount,
        currency:
          verifiedCurrency,
        status:
          verifiedStatus,
        tx_ref:
          verifiedTxRef,
        flw_ref:
          verifiedFlwRef,
        payment_type:
          verified?.payment_type,
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

    if (
      verifiedTxRef &&
      webhookTxRef &&
      verifiedTxRef !==
        webhookTxRef
    ) {
      console.error(
        `Reference mismatch: webhook=${webhookTxRef}, verified=${verifiedTxRef}`
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

    // Never credit more than Flutterwave verified.
    if (
      verifiedAmount <
      webhookAmount
    ) {
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
    // 9. DETERMINE TRANSACTION REFERENCE
    // ============================================================

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

    // ============================================================
    // 10. PRIMARY MATCH:
    //
    // IyanjuPay virtual account creation generates:
    //
    // IYJ_VA_<USER_ID>_<UUID>
    //
    // Example:
    //
    // IYJ_VA_deebe49e-..._43140dae-...
    //
    // ============================================================

    let virtualAccount: any = null;

    if (
      finalTxRef.startsWith(
        "IYJ_VA_"
      )
    ) {
      const parts =
        finalTxRef.split("_");

      /*
       * UUID itself contains hyphens but no underscores,
       * therefore:
       *
       * ["IYJ", "VA", userId, uuid]
       *
       * userId is index 2.
       */

      const possibleUserId =
        parts[2];

      if (
        possibleUserId
      ) {
        console.log(
          "Detected IyanjuPay virtual-account transaction for user:",
          possibleUserId
        );

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
            "Virtual account lookup by tx_ref failed:",
            accountError
          );

          throw accountError;
        }

        if (account) {
          virtualAccount =
            account;
        }
      }
    }

    // ============================================================
    // 11. FALLBACK MATCH:
    // ACCOUNT NUMBER
    // ============================================================

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
        "Fallback account numbers:",
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
          break;
        }
      }
    }

    // ============================================================
    // 12. FINAL ACCOUNT VALIDATION
    // ============================================================

    if (!virtualAccount) {
      console.error(
        "No matching IyanjuPay virtual account found",
        JSON.stringify({
          transactionId,
          txRef: finalTxRef,
        })
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
    // 13. VALIDATE WALLET
    // ============================================================

    if (
      !virtualAccount.wallet_id
    ) {
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
      wallet.currency !==
      "NGN"
    ) {
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
      wallet.status !==
      "active"
    ) {
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
    // 14. IDEMPOTENT REFERENCE
    // ============================================================

    const fundingReference =
      `FLW_${String(
        transactionId
      )}`;

    console.log(
      "Funding reference:",
      fundingReference
    );

    // ============================================================
    // 15. EARLY DUPLICATE CHECK
    // ============================================================

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
    // 16. CREDIT WALLET
    // ============================================================

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

    // ============================================================
    // 17. SUCCESS
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
