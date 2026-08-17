import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  // ------------------------------------------------------------
  // CORS
  // ------------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    // ------------------------------------------------------------
    // ENVIRONMENT
    // ------------------------------------------------------------

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL is not configured");
    }

    if (!supabaseAnonKey) {
      throw new Error(
        "SUPABASE_ANON_KEY is not configured"
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

    // ------------------------------------------------------------
    // AUTHENTICATION
    // ------------------------------------------------------------

    const authorization =
      req.headers.get("Authorization") ?? "";

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    // ------------------------------------------------------------
    // ADMIN CLIENT
    // ------------------------------------------------------------

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // ------------------------------------------------------------
    // REQUEST BODY
    // ------------------------------------------------------------

    const body = await req.json();

    const amount = Number(body?.amount);

    const accountNumber = String(
      body?.account_number ?? ""
    ).trim();

    const accountBank = String(
      body?.account_bank ?? ""
    ).trim();

    const beneficiaryName = String(
      body?.beneficiary_name ?? ""
    ).trim();

    const narration = String(
      body?.narration ?? "IyanjuPay transfer"
    ).trim();

    const idempotencyKey = String(
      body?.idempotency_key ?? ""
    ).trim();

    // ------------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------------

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid transfer amount",
        },
        400
      );
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Account number must contain exactly 10 digits",
        },
        400
      );
    }

    if (!accountBank) {
      return jsonResponse(
        {
          success: false,
          error: "Bank code is required",
        },
        400
      );
    }

    if (!/^\d+$/.test(accountBank)) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid bank code",
        },
        400
      );
    }

    if (!beneficiaryName) {
      return jsonResponse(
        {
          success: false,
          error: "Beneficiary name is required",
        },
        400
      );
    }

    // ------------------------------------------------------------
    // IDEMPOTENCY
    // ------------------------------------------------------------

    const transferKey =
      idempotencyKey ||
      `TRANSFER_${user.id}_${crypto.randomUUID()}`;

    const reference =
      `IYANJUPAY_${crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 28)}`;

    // ------------------------------------------------------------
    // DEBIT WALLET
    //
    // We debit the wallet before sending the payout.
    // If Flutterwave rejects the transfer, we immediately
    // refund the wallet.
    // ------------------------------------------------------------

    const { data: debitTransaction, error: debitError } =
      await adminClient.rpc(
        "wallet_operation",
        {
          _user_id: user.id,
          _operation: "DEBIT",
          _amount: amount,
          _description:
            `Transfer to ${beneficiaryName}`,
          _idempotency_key: transferKey,
          _reference: reference,
          _provider: "flutterwave",
          _category: "transfer",
          _metadata: {
            account_number: accountNumber,
            account_bank: accountBank,
            beneficiary_name: beneficiaryName,
            narration,
            status: "pending",
          },
        }
      );

    if (debitError) {
      console.error(
        "Wallet debit error:",
        debitError
      );

      return jsonResponse(
        {
          success: false,
          error:
            debitError.message ||
            "Unable to debit wallet",
        },
        400
      );
    }

    if (!debitTransaction) {
      throw new Error(
        "Wallet debit did not return a transaction"
      );
    }

    const transactionId =
      debitTransaction.id;

    // ------------------------------------------------------------
    // FLUTTERWAVE TRANSFER
    // ------------------------------------------------------------

    console.log(
      `Initiating Flutterwave transfer ${reference}`
    );

    const flutterwaveResponse =
      await fetch(
        "https://api.flutterwave.com/v3/transfers",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${flutterwaveSecret}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            account_bank: accountBank,
            account_number: accountNumber,
            amount,
            currency: "NGN",
            debit_currency: "NGN",
            beneficiary_name: beneficiaryName,
            narration,
            reference,
            meta: [
              {
                key: "iyanjupay_user_id",
                value: user.id,
              },
              {
                key: "iyanjupay_transaction_id",
                value: transactionId,
              },
            ],
          }),
        }
      );

    let flutterwaveData: any;

    try {
      flutterwaveData =
        await flutterwaveResponse.json();
    } catch {
      flutterwaveData = null;
    }

    console.log(
      "Flutterwave transfer response:",
      JSON.stringify(flutterwaveData)
    );

    // ------------------------------------------------------------
    // FLUTTERWAVE REQUEST FAILED
    // ------------------------------------------------------------

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !== "success"
    ) {
      console.error(
        "Flutterwave transfer failed:",
        flutterwaveData
      );

      // Refund customer wallet.
      const refundKey =
        `REFUND_${transactionId}`;

      await adminClient.rpc(
        "wallet_operation",
        {
          _user_id: user.id,
          _operation: "REFUND",
          _amount: amount,
          _description:
            `Refund for failed transfer to ${beneficiaryName}`,
          _idempotency_key: refundKey,
          _reference:
            `REFUND_${reference}`,
          _provider: "flutterwave",
          _provider_reference:
            flutterwaveData?.data?.id
              ? String(
                  flutterwaveData.data.id
                )
              : null,
          _category: "transfer_refund",
          _metadata: {
            original_transaction_id:
              transactionId,
            original_reference:
              reference,
            reason:
              flutterwaveData?.message ||
              "Flutterwave transfer failed",
          },
        }
      );

      await adminClient
        .from("transactions")
        .update({
          status: "failed",
          metadata: {
            account_number: accountNumber,
            account_bank: accountBank,
            beneficiary_name: beneficiaryName,
            narration,
            flutterwave_response:
              flutterwaveData,
            refunded: true,
          },
        })
        .eq("id", transactionId);

      return jsonResponse(
        {
          success: false,
          error:
            flutterwaveData?.message ||
            "Flutterwave could not initiate the transfer",
          refunded: true,
          reference,
        },
        400
      );
    }

    // ------------------------------------------------------------
    // TRANSFER ACCEPTED
    // ------------------------------------------------------------

    const flutterwaveTransferId =
      flutterwaveData?.data?.id
        ? String(flutterwaveData.data.id)
        : null;

    const transferStatus =
      flutterwaveData?.data?.status ??
      "NEW";

    // The payout may still be processing.
    // Do NOT tell the customer it is finally successful yet.
    await adminClient
      .from("transactions")
      .update({
        status: "pending",
        provider: "flutterwave",
        provider_reference:
          flutterwaveTransferId,
        metadata: {
          account_number: accountNumber,
          account_bank: accountBank,
          beneficiary_name: beneficiaryName,
          narration,
          flutterwave_status:
            transferStatus,
          flutterwave_response:
            flutterwaveData,
        },
      })
      .eq("id", transactionId);

    // ------------------------------------------------------------
    // RETURN
    // ------------------------------------------------------------

    return jsonResponse({
      success: true,
      status: "pending",
      message:
        "Transfer has been initiated and is being processed.",
      reference,
      transaction_id: transactionId,
      flutterwave_transfer_id:
        flutterwaveTransferId,
      beneficiary: {
        name: beneficiaryName,
        account_number: accountNumber,
        bank_code: accountBank,
      },
      amount,
      currency: "NGN",
    });
  } catch (error) {
    console.error(
      "flutterwave-transfer error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});
