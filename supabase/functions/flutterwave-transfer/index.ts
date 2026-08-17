import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ------------------------------------------------------------
 * CORS
 * ------------------------------------------------------------
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

/**
 * ------------------------------------------------------------
 * JSON RESPONSE
 *
 * IMPORTANT:
 * Default must NOT be 204 because 204 responses cannot contain
 * a response body.
 * ------------------------------------------------------------
 */

function jsonResponse(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    }
  );
}

/**
 * ------------------------------------------------------------
 * EDGE FUNCTION
 * ------------------------------------------------------------
 */

Deno.serve(async (req) => {
  /**
   * ----------------------------------------------------------
   * CORS PREFLIGHT
   * ----------------------------------------------------------
   */

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  /**
   * ----------------------------------------------------------
   * METHOD CHECK
   * ----------------------------------------------------------
   */

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    /**
     * --------------------------------------------------------
     * ENVIRONMENT
     * --------------------------------------------------------
     */

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      ) ?? "";

    const flutterwaveSecret =
      Deno.env.get(
        "FLUTTERWAVE_SECRET_KEY"
      ) ?? "";

    if (!supabaseUrl) {
      return jsonResponse({
        success: false,
        error:
          "SUPABASE_URL is not configured",
      });
    }

    if (!supabaseAnonKey) {
      return jsonResponse({
        success: false,
        error:
          "SUPABASE_ANON_KEY is not configured",
      });
    }

    if (!serviceRoleKey) {
      return jsonResponse({
        success: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured",
      });
    }

    if (!flutterwaveSecret) {
      return jsonResponse({
        success: false,
        error:
          "FLUTTERWAVE_SECRET_KEY is not configured",
      });
    }

    /**
     * --------------------------------------------------------
     * AUTHENTICATION
     * --------------------------------------------------------
     */

    const authorization =
      req.headers.get("Authorization") ?? "";

    if (!authorization) {
      return jsonResponse({
        success: false,
        error: "Unauthorized",
      });
    }

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization:
              authorization,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } =
      await userClient.auth.getUser();

    if (authError || !user) {
      console.error(
        "Authentication error:",
        authError
      );

      return jsonResponse({
        success: false,
        error: "Unauthorized",
      });
    }

    /**
     * --------------------------------------------------------
     * ADMIN CLIENT
     * --------------------------------------------------------
     */

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    /**
     * --------------------------------------------------------
     * REQUEST BODY
     * --------------------------------------------------------
     */

    let body: any;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({
        success: false,
        error: "Invalid JSON request body",
      });
    }

    const amount = Number(
      body?.amount
    );

    const accountNumber = String(
      body?.account_number ?? ""
    ).replace(/\D/g, "");

    const accountBank = String(
      body?.account_bank ?? ""
    ).trim();

    const beneficiaryName = String(
      body?.beneficiary_name ?? ""
    ).trim();

    const narration = String(
      body?.narration ??
        "IyanjuPay bank transfer"
    ).trim();

    const idempotencyKey = String(
      body?.idempotency_key ?? ""
    ).trim();

    /**
     * --------------------------------------------------------
     * VALIDATION
     * --------------------------------------------------------
     */

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return jsonResponse({
        success: false,
        error:
          "Invalid transfer amount",
      });
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return jsonResponse({
        success: false,
        error:
          "Account number must contain exactly 10 digits",
      });
    }

    if (!accountBank) {
      return jsonResponse({
        success: false,
        error:
          "Bank code is required",
      });
    }

    /**
     * Flutterwave Nigerian bank codes are normally
     * numeric. Keep this validation.
     */

    if (!/^\d+$/.test(accountBank)) {
      return jsonResponse({
        success: false,
        error:
          "Invalid bank code",
      });
    }

    if (!beneficiaryName) {
      return jsonResponse({
        success: false,
        error:
          "Beneficiary name is required",
      });
    }

    /**
     * --------------------------------------------------------
     * IDEMPOTENCY + REFERENCE
     * --------------------------------------------------------
     */

    const transferKey =
      idempotencyKey ||
      `TRANSFER_${user.id}_${crypto.randomUUID()}`;

    const reference =
      `IYANJUPAY_${crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 28)}`;

    console.log(
      "Transfer request:",
      JSON.stringify({
        user_id: user.id,
        amount,
        account_number:
          accountNumber,
        account_bank:
          accountBank,
        beneficiary_name:
          beneficiaryName,
        reference,
      })
    );

    /**
     * --------------------------------------------------------
     * DEBIT WALLET
     * --------------------------------------------------------
     */

    const {
      data: debitTransaction,
      error: debitError,
    } =
      await adminClient.rpc(
        "wallet_operation",
        {
          _user_id: user.id,
          _operation: "DEBIT",
          _amount: amount,
          _description:
            `Transfer to ${beneficiaryName}`,
          _idempotency_key:
            transferKey,
          _reference:
            reference,
          _provider:
            "flutterwave",
          _category:
            "transfer",
          _metadata: {
            account_number:
              accountNumber,
            account_bank:
              accountBank,
            beneficiary_name:
              beneficiaryName,
            narration,
            status:
              "pending",
          },
        }
      );

    if (debitError) {
      console.error(
        "WALLET DEBIT ERROR:",
        debitError
      );

      return jsonResponse({
        success: false,
        stage: "wallet_debit",
        error:
          debitError.message ||
          "Unable to debit wallet",
      });
    }

    if (!debitTransaction) {
      console.error(
        "Wallet debit returned no transaction"
      );

      return jsonResponse({
        success: false,
        stage: "wallet_debit",
        error:
          "Wallet debit did not return a transaction",
      });
    }

    const transactionId =
      debitTransaction.id;

    console.log(
      "Wallet debit successful:",
      transactionId
    );

    /**
     * --------------------------------------------------------
     * FLUTTERWAVE TRANSFER
     * --------------------------------------------------------
     */

    console.log(
      "Calling Flutterwave:",
      reference
    );

    let flutterwaveResponse: Response;

    try {
      flutterwaveResponse =
        await fetch(
          "https://api.flutterwave.com/v3/transfers",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${flutterwaveSecret}`,

              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body: JSON.stringify({
              account_bank:
                accountBank,

              account_number:
                accountNumber,

              amount,

              currency:
                "NGN",

              debit_currency:
                "NGN",

              beneficiary_name:
                beneficiaryName,

              narration,

              reference,

              meta: [
                {
                  key:
                    "iyanjupay_user_id",

                  value:
                    user.id,
                },

                {
                  key:
                    "iyanjupay_transaction_id",

                  value:
                    transactionId,
                },
              ],
            }),
          }
        );
    } catch (flutterwaveRequestError) {
      console.error(
        "FLUTTERWAVE NETWORK ERROR:",
        flutterwaveRequestError
      );

      /**
       * ------------------------------------------------------
       * REFUND WALLET
       * ------------------------------------------------------
       */

      await adminClient.rpc(
        "wallet_operation",
        {
          _user_id: user.id,
          _operation: "REFUND",
          _amount: amount,
          _description:
            `Refund for failed transfer to ${beneficiaryName}`,
          _idempotency_key:
            `REFUND_${transactionId}`,
          _reference:
            `REFUND_${reference}`,
          _provider:
            "flutterwave",
          _category:
            "transfer_refund",
          _metadata: {
            original_transaction_id:
              transactionId,

            original_reference:
              reference,

            reason:
              "Unable to connect to Flutterwave",

            refunded:
              true,
          },
        }
      );

      await adminClient
        .from("transactions")
        .update({
          status:
            "failed",

          metadata: {
            account_number:
              accountNumber,

            account_bank:
              accountBank,

            beneficiary_name:
              beneficiaryName,

            narration,

            refunded:
              true,

            error:
              "Flutterwave network request failed",
          },
        })
        .eq(
          "id",
          transactionId
        );

      return jsonResponse({
        success: false,
        stage:
          "flutterwave_request",

        error:
          "Unable to connect to Flutterwave. Your wallet has been refunded.",

        refunded:
          true,

        reference,
      });
    }

    /**
     * --------------------------------------------------------
     * READ FLUTTERWAVE RESPONSE
     * --------------------------------------------------------
     */

    let flutterwaveData: any =
      null;

    const responseText =
      await flutterwaveResponse.text();

    try {
      flutterwaveData =
        responseText
          ? JSON.parse(responseText)
          : null;
    } catch {
      flutterwaveData = {
        raw_response:
          responseText,
      };
    }

    console.log(
      "Flutterwave HTTP status:",
      flutterwaveResponse.status
    );

    console.log(
      "Flutterwave response:",
      JSON.stringify(
        flutterwaveData
      )
    );

    /**
     * --------------------------------------------------------
     * FLUTTERWAVE FAILED
     * --------------------------------------------------------
     */

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !==
        "success"
    ) {
      const flutterwaveError =
        flutterwaveData?.message ||
        flutterwaveData?.error ||
        "Flutterwave could not initiate the transfer";

      console.error(
        "FLUTTERWAVE TRANSFER FAILED:",
        flutterwaveError
      );

      /**
       * ------------------------------------------------------
       * REFUND WALLET
       * ------------------------------------------------------
       */

      const refundKey =
        `REFUND_${transactionId}`;

      const {
        error: refundError,
      } =
        await adminClient.rpc(
          "wallet_operation",
          {
            _user_id: user.id,
            _operation: "REFUND",
            _amount: amount,
            _description:
              `Refund for failed transfer to ${beneficiaryName}`,
            _idempotency_key:
              refundKey,
            _reference:
              `REFUND_${reference}`,
            _provider:
              "flutterwave",

            _provider_reference:
              flutterwaveData
                ?.data
                ?.id
                ? String(
                    flutterwaveData
                      .data
                      .id
                  )
                : null,

            _category:
              "transfer_refund",

            _metadata: {
              original_transaction_id:
                transactionId,

              original_reference:
                reference,

              reason:
                flutterwaveError,

              flutterwave_response:
                flutterwaveData,

              refunded:
                true,
            },
          }
        );

      if (refundError) {
        console.error(
          "REFUND ERROR:",
          refundError
        );
      }

      /**
       * ------------------------------------------------------
       * UPDATE TRANSACTION
       * ------------------------------------------------------
       */

      await adminClient
        .from("transactions")
        .update({
          status:
            "failed",

          provider:
            "flutterwave",

          provider_reference:
            flutterwaveData
              ?.data
              ?.id
              ? String(
                  flutterwaveData
                    .data
                    .id
                )
              : null,

          metadata: {
            account_number:
              accountNumber,

            account_bank:
              accountBank,

            beneficiary_name:
              beneficiaryName,

            narration,

            flutterwave_response:
              flutterwaveData,

            refunded:
              !refundError,

            refund_error:
              refundError
                ?.message ??
              null,
          },
        })
        .eq(
          "id",
          transactionId
        );

      /**
       * Return HTTP 200 so the frontend can
       * receive the actual error message.
       */

      return jsonResponse({
        success: false,

        stage:
          "flutterwave",

        error:
          flutterwaveError,

        refunded:
          !refundError,

        reference,

        flutterwave_response:
          flutterwaveData,
      });
    }

    /**
     * --------------------------------------------------------
     * TRANSFER ACCEPTED
     * --------------------------------------------------------
     */

    const flutterwaveTransferId =
      flutterwaveData
        ?.data
        ?.id
        ? String(
            flutterwaveData
              .data
              .id
          )
        : null;

    const transferStatus =
      flutterwaveData
        ?.data
        ?.status ??
      "NEW";

    console.log(
      "Flutterwave transfer accepted:",
      flutterwaveTransferId
    );

    /**
     * --------------------------------------------------------
     * UPDATE TRANSACTION
     * --------------------------------------------------------
     */

    const {
      error: transactionUpdateError,
    } =
      await adminClient
        .from("transactions")
        .update({
          status:
            "pending",

          provider:
            "flutterwave",

          provider_reference:
            flutterwaveTransferId,

          metadata: {
            account_number:
              accountNumber,

            account_bank:
              accountBank,

            beneficiary_name:
              beneficiaryName,

            narration,

            flutterwave_status:
              transferStatus,

            flutterwave_response:
              flutterwaveData,
          },
        })
        .eq(
          "id",
          transactionId
        );

    if (transactionUpdateError) {
      console.error(
        "Transaction update error:",
        transactionUpdateError
      );
    }

    /**
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    return jsonResponse({
      success: true,

      status:
        "pending",

      message:
        "Transfer has been initiated and is being processed.",

      reference,

      transaction_id:
        transactionId,

      flutterwave_transfer_id:
        flutterwaveTransferId,

      beneficiary: {
        name:
          beneficiaryName,

        account_number:
          accountNumber,

        bank_code:
          accountBank,
      },

      amount,

      currency:
        "NGN",
    });
  } catch (error) {
    console.error(
      "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
      error
    );

    return jsonResponse({
      success: false,

      stage:
        "internal",

      error:
        error instanceof Error
          ? error.message
          : "Internal server error",
    });
  }
});
