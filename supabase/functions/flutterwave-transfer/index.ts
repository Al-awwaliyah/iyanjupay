import {
  adminClient,
  getUser,
  json,
  flw,
} from "../_shared/auth.ts";

/**
 * ============================================================
 * IYANJUPAY - FLUTTERWAVE BANK TRANSFER
 * ============================================================
 *
 * FLOW:
 *
 * Frontend
 *    ↓
 * Supabase Edge Function
 *    ↓
 * Check Flutterwave NGN available balance
 *    ↓
 * Debit IyanjuPay wallet
 *    ↓
 * SmartASP fixed-IP proxy
 *    ↓
 * Flutterwave
 *    ↓
 * Transfer status = NEW / PENDING
 *    ↓
 * flutterwave-webhook
 *    ↓
 * SUCCESSFUL → transaction successful
 * FAILED     → automatic wallet refund
 *
 * IMPORTANT:
 *
 * A successful response from POST /transfers does NOT mean
 * the beneficiary has received the money.
 *
 * Flutterwave's transfer lifecycle can be:
 *
 * NEW
 * PENDING
 * SUCCESSFUL
 * FAILED
 *
 * The final status is handled by the webhook.
 * ============================================================
 */

Deno.serve(async (req) => {
  /*
   * ==========================================================
   * CORS
   * ==========================================================
   */

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,

      headers: {
        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
      },
    });
  }

  /*
   * ==========================================================
   * METHOD
   * ==========================================================
   */

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    /*
     * ========================================================
     * AUTHENTICATED USER
     * ========================================================
     */

    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    /*
     * ========================================================
     * ADMIN CLIENT
     * ========================================================
     */

    const supabase = adminClient();

    /*
     * ========================================================
     * REQUEST BODY
     * ========================================================
     */

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body",
        },
        400,
      );
    }

    /*
     * ========================================================
     * INPUTS
     * ========================================================
     */

    const amount = Number(body?.amount);

    const accountNumber = String(
      body?.account_number ?? "",
    ).replace(/\D/g, "");

    const accountBank = String(
      body?.account_bank ?? "",
    ).trim();

    const beneficiaryName = String(
      body?.beneficiary_name ?? "",
    ).trim();

    const narration = String(
      body?.narration ??
        "IyanjuPay bank transfer",
    ).trim();

    const idempotencyKey = String(
      body?.idempotency_key ?? "",
    ).trim();

    /*
     * ========================================================
     * VALIDATION
     * ========================================================
     */

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return json(
        {
          success: false,
          error: "Invalid transfer amount",
        },
        400,
      );
    }

    /*
     * Prevent floating-point monetary values.
     *
     * NGN transfer amounts should be represented as naira
     * amounts with at most two decimal places.
     */

    if (
      Math.round(amount * 100) !==
      amount * 100
    ) {
      return json(
        {
          success: false,
          error:
            "Transfer amount cannot contain more than 2 decimal places",
        },
        400,
      );
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return json(
        {
          success: false,
          error:
            "Account number must contain exactly 10 digits",
        },
        400,
      );
    }

    if (!accountBank) {
      return json(
        {
          success: false,
          error: "Bank code is required",
        },
        400,
      );
    }

    if (!/^\d+$/.test(accountBank)) {
      return json(
        {
          success: false,
          error: "Invalid bank code",
        },
        400,
      );
    }

    if (!beneficiaryName) {
      return json(
        {
          success: false,
          error: "Beneficiary name is required",
        },
        400,
      );
    }

    /*
     * ========================================================
     * REFERENCE
     * ========================================================
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
      "IyanjuPay transfer request:",
      JSON.stringify({
        user_id: user.id,
        amount,
        account_number: accountNumber,
        account_bank: accountBank,
        beneficiary_name: beneficiaryName,
        reference,
        idempotency_key: transferKey,
      }),
    );

    /*
     * ========================================================
     * STEP 1
     *
     * CHECK FLUTTERWAVE AVAILABLE NGN BALANCE
     * ========================================================
     *
     * This goes through:
     *
     * Supabase
     *   ↓
     * SmartASP
     *   ↓
     * Flutterwave
     *
     * when FLUTTERWAVE_PROXY_URL is configured.
     */

    console.log(
      "Checking Flutterwave NGN available balance...",
    );

    let balanceResponse;

    try {
      balanceResponse = await flw(
        "/balances",
        {
          method: "GET",
        },
      );
    } catch (error) {
      console.error(
        "Flutterwave balance request failed:",
        error,
      );

      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to verify Flutterwave balance. Please try again later.",
        },
        503,
      );
    }

    /*
     * ========================================================
     * VALIDATE BALANCE RESPONSE
     * ========================================================
     */

    if (
      !balanceResponse.ok ||
      balanceResponse.body?.status !==
        "success"
    ) {
      console.error(
        "Flutterwave balance API failure:",
        JSON.stringify({
          http_status:
            balanceResponse.status,

          body:
            balanceResponse.body,
        }),
      );

      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to verify Flutterwave balance. Please try again later.",
          provider_error:
            balanceResponse.body?.message ??
            null,
        },
        503,
      );
    }

    /*
     * ========================================================
     * EXTRACT NGN BALANCE
     * ========================================================
     */

    const balanceData =
      balanceResponse.body?.data;

    let ngnBalance: any = null;

    if (Array.isArray(balanceData)) {
      ngnBalance =
        balanceData.find(
          (item: any) =>
            String(
              item?.currency ?? "",
            ).toUpperCase() === "NGN",
        );
    } else if (
      balanceData &&
      typeof balanceData === "object"
    ) {
      if (
        String(
          balanceData?.currency ?? "",
        ).toUpperCase() === "NGN"
      ) {
        ngnBalance = balanceData;
      }
    }

    const flutterwaveAvailableBalance =
      Number(
        ngnBalance?.available_balance ?? 0,
      );

    const flutterwaveLedgerBalance =
      Number(
        ngnBalance?.ledger_balance ?? 0,
      );

    console.log(
      "Flutterwave NGN balance:",
      JSON.stringify({
        available_balance:
          flutterwaveAvailableBalance,

        ledger_balance:
          flutterwaveLedgerBalance,
      }),
    );

    if (
      !Number.isFinite(
        flutterwaveAvailableBalance,
      )
    ) {
      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to determine Flutterwave available balance.",
        },
        503,
      );
    }

    /*
     * ========================================================
     * STEP 2
     *
     * INSUFFICIENT FLUTTERWAVE BALANCE
     * ========================================================
     *
     * IMPORTANT:
     *
     * User wallet is NOT debited.
     */

    if (
      flutterwaveAvailableBalance <
      amount
    ) {
      console.warn(
        "Insufficient Flutterwave balance:",
        JSON.stringify({
          required: amount,
          available:
            flutterwaveAvailableBalance,
          currency: "NGN",
        }),
      );

      return json(
        {
          success: false,

          stage:
            "flutterwave_balance",

          error:
            "Insufficient Flutterwave balance. Please fund your Flutterwave account.",

          required:
            amount,

          available:
            flutterwaveAvailableBalance,

          currency:
            "NGN",
        },
        200,
      );
    }

    /*
     * ========================================================
     * STEP 3
     *
     * DEBIT USER WALLET
     * ========================================================
     *
     * wallet_operation must perform this atomically.
     */

    console.log(
      "Flutterwave balance sufficient. Debiting user wallet...",
    );

    const {
      data: debitTransaction,
      error: debitError,
    } = await supabase.rpc(
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

          flutterwave_available_balance:
            flutterwaveAvailableBalance,

          flutterwave_ledger_balance:
            flutterwaveLedgerBalance,

          currency:
            "NGN",
        },
      },
    );

    if (debitError) {
      console.error(
        "Wallet debit error:",
        debitError,
      );

      return json(
        {
          success: false,
          stage: "wallet_debit",
          error:
            debitError.message ||
            "Unable to debit wallet",
        },
        400,
      );
    }

    if (!debitTransaction) {
      return json(
        {
          success: false,
          stage: "wallet_debit",
          error:
            "Wallet debit did not return a transaction",
        },
        500,
      );
    }

    const transactionId =
      debitTransaction.id;

    console.log(
      "Wallet debit successful:",
      transactionId,
    );

    /*
     * ========================================================
     * STEP 4
     *
     * INITIATE FLUTTERWAVE TRANSFER
     * ========================================================
     */

    console.log(
      "Initiating Flutterwave transfer:",
      reference,
    );

    let flutterwaveResponse;

    try {
      flutterwaveResponse =
        await flw(
          "/transfers",
          {
            method: "POST",

            body:
              JSON.stringify({
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

                  {
                    key:
                      "iyanjupay_reference",

                    value:
                      reference,
                  },
                ],
              }),
          },
        );
    } catch (error) {
      /*
       * ======================================================
       * NETWORK / PROXY FAILURE
       *
       * Flutterwave was NOT confirmed to have received the
       * request, so refund the user.
       * ======================================================
       */

      console.error(
        "Flutterwave transfer network/proxy error:",
        error,
      );

      const refundKey =
        `REFUND_${transactionId}`;

      const {
        error: refundError,
      } = await supabase.rpc(
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
              "Flutterwave proxy/network request failed",

            refunded:
              true,
          },
        },
      );

      if (refundError) {
        console.error(
          "Automatic refund failed:",
          refundError,
        );

        await supabase
          .from("transactions")
          .update({
            metadata: {
              account_number:
                accountNumber,

              account_bank:
                accountBank,

              beneficiary_name:
                beneficiaryName,

              narration,

              refund_pending:
                true,

              refund_error:
                refundError.message,

              original_error:
                "Flutterwave proxy/network request failed",
            },
          })
          .eq(
            "id",
            transactionId,
          );

        return json(
          {
            success: false,
            stage:
              "refund_pending",
            error:
              "Transfer could not be completed and automatic refund requires retry.",
            reference,
            transaction_id:
              transactionId,
          },
          503,
        );
      }

      await supabase
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

            refund_reason:
              "Flutterwave proxy/network request failed",
          },
        })
        .eq(
          "id",
          transactionId,
        );

      return json(
        {
          success: false,

          stage:
            "flutterwave_request",

          error:
            "Unable to connect to Flutterwave. Your wallet has been refunded.",

          refunded:
            true,

          reference,

          transaction_id:
            transactionId,
        },
        200,
      );
    }

    /*
     * ========================================================
     * READ FLUTTERWAVE RESPONSE
     * ========================================================
     */

    const flutterwaveData =
      flutterwaveResponse.body;

    console.log(
      "Flutterwave transfer initiation response:",
      JSON.stringify({
        http_status:
          flutterwaveResponse.status,

        ok:
          flutterwaveResponse.ok,

        body:
          flutterwaveData,
      }),
    );

    /*
     * ========================================================
     * TRANSFER REQUEST REJECTED
     * ========================================================
     */

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !==
        "success"
    ) {
      const providerError =
        flutterwaveData?.message ||
        flutterwaveData?.error?.message ||
        flutterwaveData?.error ||
        "Flutterwave could not initiate the transfer";

      console.error(
        "Flutterwave transfer rejected:",
        providerError,
      );

      /*
       * IMPORTANT:
       *
       * Since Flutterwave returned an actual provider response
       * saying the transfer was rejected, refund immediately.
       */

      const lowerError =
        String(
          providerError,
        ).toLowerCase();

      const isInsufficientBalance =
        lowerError.includes(
          "insufficient",
        ) &&
        (
          lowerError.includes(
            "balance",
          ) ||
          lowerError.includes(
            "fund",
          ) ||
          lowerError.includes(
            "wallet",
          )
        );

      const refundKey =
        `REFUND_${transactionId}`;

      const {
        error: refundError,
      } = await supabase.rpc(
        "wallet_operation",
        {
          _user_id:
            user.id,

          _operation:
            "REFUND",

          _amount:
            amount,

          _description:
            `Refund for rejected transfer to ${beneficiaryName}`,

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
              providerError,

            flutterwave_response:
              flutterwaveData,

            insufficient_flutterwave_balance:
              isInsufficientBalance,

            refunded:
              true,
          },
        },
      );

      if (refundError) {
        console.error(
          "Refund failed:",
          refundError,
        );

        await supabase
          .from("transactions")
          .update({
            metadata: {
              account_number:
                accountNumber,

              account_bank:
                accountBank,

              beneficiary_name:
                beneficiaryName,

              narration,

              refund_pending:
                true,

              refund_error:
                refundError.message,

              flutterwave_response:
                flutterwaveData,
            },
          })
          .eq(
            "id",
            transactionId,
          );

        return json(
          {
            success: false,

            stage:
              "refund_pending",

            error:
              "Flutterwave rejected the transfer, but the automatic refund requires retry.",

            reference,

            transaction_id:
              transactionId,
          },
          503,
        );
      }

      await supabase
        .from("transactions")
        .update({
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

            flutterwave_response:
              flutterwaveData,

            insufficient_flutterwave_balance:
              isInsufficientBalance,

            refunded:
              true,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      return json(
        {
          success: false,

          stage:
            isInsufficientBalance
              ? "flutterwave_balance"
              : "flutterwave",

          error:
            isInsufficientBalance
              ? "Insufficient Flutterwave balance. Your wallet has been refunded."
              : providerError,

          refunded:
            true,

          reference,

          transaction_id:
            transactionId,
        },
        200,
      );
    }

    /*
     * ========================================================
     * TRANSFER ACCEPTED
     * ========================================================
     *
     * Flutterwave documentation says a newly initiated
     * transfer can have status NEW.
     *
     * DO NOT mark it successful here.
     *
     * Wait for transfer.disburse webhook.
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
      String(
        flutterwaveData
          ?.data
          ?.status ??
          "NEW",
      ).toUpperCase();

    /*
     * If Flutterwave somehow returns no transfer ID, we cannot
     * safely track the transfer.
     */

    if (!flutterwaveTransferId) {
      console.error(
        "Flutterwave accepted transfer but returned no transfer ID.",
      );

      /*
       * We cannot safely assume the provider did not receive
       * the transfer. Therefore DO NOT automatically refund.
       *
       * The transaction remains pending for manual/reconciliation
       * handling.
       */

      await supabase
        .from("transactions")
        .update({
          status:
            "pending",

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

            flutterwave_status:
              transferStatus,

            flutterwave_response:
              flutterwaveData,

            reconciliation_required:
              true,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      return json(
        {
          success: false,

          status:
            "pending",

          stage:
            "reconciliation",

          error:
            "Transfer was accepted but Flutterwave did not return a transfer ID. Manual reconciliation is required.",

          reference,

          transaction_id:
            transactionId,
        },
        503,
      );
    }

    /*
     * ========================================================
     * SAVE PENDING TRANSFER
     * ========================================================
     */

    const {
      error:
        transactionUpdateError,
    } = await supabase
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

          flutterwave_transfer_id:
            flutterwaveTransferId,

          flutterwave_available_balance:
            flutterwaveAvailableBalance,

          flutterwave_response:
            flutterwaveData,
        },
      })
      .eq(
        "id",
        transactionId,
      );

    if (
      transactionUpdateError
    ) {
      console.error(
        "Transaction pending update failed:",
        transactionUpdateError,
      );

      /*
       * DO NOT refund here.
       *
       * Flutterwave may already have accepted the transfer.
       * Reconciliation/webhook can still update it.
       */
    }

    /*
     * ========================================================
     * SUCCESS
     * ========================================================
     */

    return json(
      {
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

        flutterwave_status:
          transferStatus,

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
  } catch (error) {
    console.error(
      "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
      error,
    );

    return json(
      {
        success: false,

        stage:
          "internal",

        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
});
