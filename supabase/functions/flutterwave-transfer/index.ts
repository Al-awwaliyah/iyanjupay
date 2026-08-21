import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  flw,
} from "../_shared/auth.ts";

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

  "Content-Type":
    "application/json",
};

/**
 * ------------------------------------------------------------
 * JSON RESPONSE
 * ------------------------------------------------------------
 */

function jsonResponse(
  body: unknown,
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

  if (
    req.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status: 204,

        headers:
          corsHeaders,
      },
    );
  }

  /**
   * ----------------------------------------------------------
   * METHOD CHECK
   * ----------------------------------------------------------
   */

  if (
    req.method !==
    "POST"
  ) {
    return jsonResponse(
      {
        success:
          false,

        error:
          "Method not allowed",
      },
      405,
    );
  }

  try {
    /**
     * --------------------------------------------------------
     * ENVIRONMENT
     * --------------------------------------------------------
     */

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      ) ?? "";

    const supabaseAnonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY",
      ) ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      ) ?? "";

    /**
     * --------------------------------------------------------
     * ENVIRONMENT VALIDATION
     * --------------------------------------------------------
     */

    if (!supabaseUrl) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "SUPABASE_URL is not configured",
        },
        500,
      );
    }

    if (!supabaseAnonKey) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "SUPABASE_ANON_KEY is not configured",
        },
        500,
      );
    }

    if (!serviceRoleKey) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured",
        },
        500,
      );
    }

    /**
     * --------------------------------------------------------
     * AUTHENTICATION
     * --------------------------------------------------------
     */

    const authorization =
      req.headers.get(
        "Authorization",
      ) ?? "";

    if (!authorization) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "Unauthorized",
        },
        401,
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },

          auth: {
            persistSession:
              false,
          },
        },
      );

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await userClient.auth.getUser();

    if (
      authError ||
      !user
    ) {
      console.error(
        "Authentication error:",
        authError,
      );

      return jsonResponse(
        {
          success:
            false,

          error:
            "Unauthorized",
        },
        401,
      );
    }

    /**
     * --------------------------------------------------------
     * ADMIN CLIENT
     * --------------------------------------------------------
     */

    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,
          },
        },
      );

    /**
     * --------------------------------------------------------
     * REQUEST BODY
     * --------------------------------------------------------
     */

    let body: any;

    try {
      body =
        await req.json();
    } catch {
      return jsonResponse(
        {
          success:
            false,

          error:
            "Invalid JSON request body",
        },
        400,
      );
    }

    /**
     * --------------------------------------------------------
     * EXTRACT REQUEST VALUES
     * --------------------------------------------------------
     */

    const amount =
      Number(
        body?.amount,
      );

    const accountNumber =
      String(
        body?.account_number ??
          "",
      ).replace(
        /\D/g,
        "",
      );

    const accountBank =
      String(
        body?.account_bank ??
          "",
      ).trim();

    const beneficiaryName =
      String(
        body?.beneficiary_name ??
          "",
      ).trim();

    const narration =
      String(
        body?.narration ??
          "IyanjuPay bank transfer",
      ).trim();

    const idempotencyKey =
      String(
        body?.idempotency_key ??
          "",
      ).trim();

    /**
     * --------------------------------------------------------
     * VALIDATION
     * --------------------------------------------------------
     */

    if (
      !Number.isFinite(
        amount,
      ) ||
      amount <= 0
    ) {
      return jsonResponse(
        {
          success:
            false,

          stage:
            "validation",

          error:
            "Invalid transfer amount",
        },
        400,
      );
    }

    if (
      !/^\d{10}$/.test(
        accountNumber,
      )
    ) {
      return jsonResponse(
        {
          success:
            false,

          stage:
            "validation",

          error:
            "Account number must contain exactly 10 digits",
        },
        400,
      );
    }

    if (!accountBank) {
      return jsonResponse(
        {
          success:
            false,

          stage:
            "validation",

          error:
            "Bank code is required",
        },
        400,
      );
    }

    if (
      !/^\d+$/.test(
        accountBank,
      )
    ) {
      return jsonResponse(
        {
          success:
            false,

          stage:
            "validation",

          error:
            "Invalid bank code",
        },
        400,
      );
    }

    if (
      !beneficiaryName
    ) {
      return jsonResponse(
        {
          success:
            false,

          stage:
            "validation",

          error:
            "Beneficiary name is required",
        },
        400,
      );
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
        .replaceAll(
          "-",
          "",
        )
        .slice(
          0,
          28,
        )}`;

    console.log(
      "Transfer request:",
      JSON.stringify(
        {
          user_id:
            user.id,

          amount,

          account_number:
            accountNumber,

          account_bank:
            accountBank,

          beneficiary_name:
            beneficiaryName,

          reference,

          routing:
            "SmartASP Flutterwave proxy",
        },
      ),
    );

    /**
     * --------------------------------------------------------
     * DEBIT WALLET
     * --------------------------------------------------------
     */

    const {
      data:
        debitTransaction,
      error:
        debitError,
    } =
      await adminClient.rpc(
        "wallet_operation",
        {
          _user_id:
            user.id,

          _operation:
            "DEBIT",

          _amount:
            amount,

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
        },
      );

    if (debitError) {
      console.error(
        "WALLET DEBIT ERROR:",
        debitError,
      );

      return jsonResponse(
        {
          success:
            false,

          stage:
            "wallet_debit",

          error:
            debitError.message ||
            "Unable to debit wallet",
        },
        400,
      );
    }

    if (
      !debitTransaction
    ) {
      console.error(
        "Wallet debit returned no transaction",
      );

      return jsonResponse(
        {
          success:
            false,

          stage:
            "wallet_debit",

          error:
            "Wallet debit did not return a transaction",
        },
        400,
      );
    }

    const transactionId =
      debitTransaction.id;

    console.log(
      "Wallet debit successful:",
      transactionId,
    );

    /**
     * --------------------------------------------------------
     * FLUTTERWAVE TRANSFER
     * --------------------------------------------------------
     *
     * IMPORTANT:
     *
     * We DO NOT call Flutterwave directly here.
     *
     * flw() from _shared/auth.ts routes the request through:
     *
     * Supabase
     *    ↓
     * SmartASP proxy
     *    ↓
     * Flutterwave
     *
     * This ensures the whitelisted SmartASP outbound IP
     * is used.
     * --------------------------------------------------------
     */

    console.log(
      "Calling Flutterwave through SmartASP proxy:",
      reference,
    );

    let flutterwaveResult:
      {
        ok: boolean;
        status: number;
        body: any;
      };

    try {
      flutterwaveResult =
        await flw(
          "/transfers",
          {
            method:
              "POST",

            body:
              JSON.stringify(
                {
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
                },
              ),
          },
        );
    } catch (
      flutterwaveRequestError
    ) {
      /**
       * ------------------------------------------------------
       * PROXY / NETWORK ERROR
       * ------------------------------------------------------
       *
       * This means the request could not successfully
       * communicate with the SmartASP proxy.
       *
       * Since Flutterwave did not provide a provider response,
       * refund the wallet.
       * ------------------------------------------------------
       */

      console.error(
        "FLUTTERWAVE PROXY NETWORK ERROR:",
        flutterwaveRequestError,
      );

      const refundKey =
        `REFUND_${transactionId}`;

      const {
        error:
          refundError,
      } =
        await adminClient.rpc(
          "wallet_operation",
          {
            _user_id:
              user.id,

            _operation:
              "REFUND",

            _amount:
              amount,

            _description:
              `Refund for failed transfer to ${beneficiaryName}`,

            _idempotency_key:
              refundKey,

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
                "Flutterwave proxy request failed",

              refunded:
                !refundError,
            },
          },
        );

      if (refundError) {
        console.error(
          "REFUND ERROR:",
          refundError,
        );
      }

      await adminClient
        .from(
          "transactions",
        )
        .update(
          {
            status:
              "failed",

            provider:
              "flutterwave",

            metadata: {
              account_number:
                accountNumber,

              account_bank:
                accountBank,

              beneficiary_name:
                beneficiaryName,

              narration,

              refunded:
                !refundError,

              error:
                "Flutterwave proxy request failed",

              refund_error:
                refundError?.message ??
                null,
            },
          },
        )
        .eq(
          "id",
          transactionId,
        );

      return jsonResponse(
        {
          success:
            false,

          stage:
            "flutterwave_proxy",

          error:
            refundError
              ? "Flutterwave proxy failed and automatic refund could not be confirmed."
              : "Unable to connect to Flutterwave through the payment proxy. Your wallet has been refunded.",

          refunded:
            !refundError,

          reference,
        },
        200,
      );
    }

    /**
     * --------------------------------------------------------
     * READ FLUTTERWAVE RESPONSE
     * --------------------------------------------------------
     */

    const flutterwaveData =
      flutterwaveResult.body;

    console.log(
      "Flutterwave HTTP status:",
      flutterwaveResult.status,
    );

    console.log(
      "Flutterwave response:",
      JSON.stringify(
        flutterwaveData,
      ),
    );

    /**
     * --------------------------------------------------------
     * FLUTTERWAVE FAILED
     * --------------------------------------------------------
     *
     * IMPORTANT:
     *
     * A 400/401/403/etc. returned by Flutterwave is NOT
     * a network failure.
     *
     * It means SmartASP successfully reached Flutterwave
     * and Flutterwave rejected the request.
     *
     * We therefore refund the wallet.
     * --------------------------------------------------------
     */

    if (
      !flutterwaveResult.ok ||
      flutterwaveData?.status !==
        "success"
    ) {
      const flutterwaveError =
        flutterwaveData?.message ||
        flutterwaveData?.error ||
        "Flutterwave could not initiate the transfer";

      console.error(
        "FLUTTERWAVE TRANSFER FAILED:",
        flutterwaveError,
      );

      /**
       * ------------------------------------------------------
       * REFUND WALLET
       * ------------------------------------------------------
       */

      const refundKey =
        `REFUND_${transactionId}`;

      const providerReference =
        flutterwaveData
          ?.data
          ?.id
          ? String(
              flutterwaveData
                .data
                .id,
            )
          : null;

      const {
        error:
          refundError,
      } =
        await adminClient.rpc(
          "wallet_operation",
          {
            _user_id:
              user.id,

            _operation:
              "REFUND",

            _amount:
              amount,

            _description:
              `Refund for failed transfer to ${beneficiaryName}`,

            _idempotency_key:
              refundKey,

            _reference:
              `REFUND_${reference}`,

            _provider:
              "flutterwave",

            _provider_reference:
              providerReference,

            _category:
              "transfer_refund",

            _metadata: {
              original_transaction_id:
                transactionId,

              original_reference:
                reference,

              reason:
                flutterwaveError,

              flutterwave_http_status:
                flutterwaveResult.status,

              flutterwave_response:
                flutterwaveData,

              refunded:
                true,
            },
          },
        );

      if (refundError) {
        console.error(
          "REFUND ERROR:",
          refundError,
        );
      }

      /**
       * ------------------------------------------------------
       * UPDATE ORIGINAL TRANSACTION
       * ------------------------------------------------------
       */

      const {
        error:
          transactionUpdateError,
      } =
        await adminClient
          .from(
            "transactions",
          )
          .update(
            {
              status:
                "failed",

              provider:
                "flutterwave",

              provider_reference:
                providerReference,

              metadata: {
                account_number:
                  accountNumber,

                account_bank:
                  accountBank,

                beneficiary_name:
                  beneficiaryName,

                narration,

                flutterwave_http_status:
                  flutterwaveResult.status,

                flutterwave_response:
                  flutterwaveData,

                refunded:
                  !refundError,

                refund_error:
                  refundError
                    ?.message ??
                  null,
              },
            },
          )
          .eq(
            "id",
            transactionId,
          );

      if (
        transactionUpdateError
      ) {
        console.error(
          "Transaction update error:",
          transactionUpdateError,
        );
      }

      /**
       * ------------------------------------------------------
       * RETURN PROVIDER ERROR
       * ------------------------------------------------------
       */

      return jsonResponse(
        {
          success:
            false,

          stage:
            "flutterwave",

          error:
            flutterwaveError,

          refunded:
            !refundError,

          reference,

          transaction_id:
            transactionId,

          flutterwave_http_status:
            flutterwaveResult.status,

          flutterwave_response:
            flutterwaveData,
        },
        200,
      );
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
              .id,
          )
        : null;

    const transferStatus =
      flutterwaveData
        ?.data
        ?.status ??
      "NEW";

    console.log(
      "Flutterwave transfer accepted:",
      flutterwaveTransferId,
    );

    /**
     * --------------------------------------------------------
     * UPDATE TRANSACTION
     * --------------------------------------------------------
     */

    const {
      error:
        transactionUpdateError,
    } =
      await adminClient
        .from(
          "transactions",
        )
        .update(
          {
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

              routed_through:
                "smartasp_proxy",
            },
          },
        )
        .eq(
          "id",
          transactionId,
        );

    if (
      transactionUpdateError
    ) {
      console.error(
        "Transaction update error:",
        transactionUpdateError,
      );
    }

    /**
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    return jsonResponse(
      {
        success:
          true,

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
      },
      200,
    );
  } catch (
    error
  ) {
    /**
     * --------------------------------------------------------
     * INTERNAL ERROR
     * --------------------------------------------------------
     */

    console.error(
      "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
      error,
    );

    return jsonResponse(
      {
        success:
          false,

        stage:
          "internal",

        error:
          error instanceof
          Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
});
