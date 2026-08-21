import {
  adminClient,
  getUser,
  json,
  flw,
} from "../_shared/auth.ts";

/**
 * ============================================================
 * FLUTTERWAVE TRANSFER
 * ============================================================
 *
 * Architecture:
 *
 * Frontend
 *    ↓
 * Supabase Edge Function
 *    ↓
 * _shared/auth.ts
 *    ↓
 * FLUTTERWAVE_PROXY_URL
 *    ↓
 * SmartASP app.js
 *    ↓
 * Flutterwave
 *
 * IMPORTANT:
 *
 * 1. Flutterwave balance is checked BEFORE user's wallet is
 *    debited.
 *
 * 2. The transfer itself also goes through SmartASP.
 *
 * 3. If Flutterwave has insufficient funds, the user's wallet
 *    is NOT debited.
 *
 * 4. If Flutterwave accepts the transfer but later returns a
 *    provider failure, the user's wallet is refunded.
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
      "Transfer request:",
      JSON.stringify({
        user_id: user.id,
        amount,
        account_number: accountNumber,
        account_bank: accountBank,
        beneficiary_name: beneficiaryName,
        reference,
      }),
    );

    /*
     * ========================================================
     * STEP 1
     *
     * CHECK FLUTTERWAVE NGN AVAILABLE BALANCE
     *
     * IMPORTANT:
     *
     * This uses flw() from _shared/auth.ts.
     *
     * Therefore:
     *
     * Supabase
     *    ↓
     * SmartASP
     *    ↓
     * Flutterwave
     *
     * There is NO direct Flutterwave request here.
     * ========================================================
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
    } catch (balanceRequestError) {
      console.error(
        "FLUTTERWAVE BALANCE REQUEST FAILED:",
        balanceRequestError,
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

    console.log(
      "Flutterwave balance response:",
      JSON.stringify({
        status: balanceResponse.status,
        ok: balanceResponse.ok,
        body: balanceResponse.body,
      }),
    );

    /*
     * ========================================================
     * BALANCE API FAILURE
     *
     * DO NOT call it insufficient balance if Flutterwave
     * itself returned 401/403/etc.
     * ========================================================
     */

    if (
      !balanceResponse.ok ||
      balanceResponse.body?.status !==
        "success"
    ) {
      const providerMessage =
        balanceResponse.body?.message ||
        "Unable to retrieve Flutterwave balance";

      console.error(
        "FLUTTERWAVE BALANCE CHECK FAILED:",
        providerMessage,
      );

      return json(
        {
          success: false,
          stage: "flutterwave_balance",
          error:
            "Unable to verify Flutterwave balance. Please try again later.",
          provider_error:
            providerMessage,
        },
        503,
      );
    }

    /*
     * ========================================================
     * EXTRACT NGN BALANCE
     * ========================================================
     *
     * Flutterwave's balance response normally contains:
     *
     * data: [
     *   {
     *     currency: "NGN",
     *     available_balance: 0,
     *     ledger_balance: 0
     *   }
     * ]
     *
     * available_balance is what can be used for transfers.
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
      /*
       * Some response formats may return an object instead
       * of an array.
       */

      if (
        String(
          balanceData?.currency ?? "",
        ).toUpperCase() === "NGN"
      ) {
        ngnBalance = balanceData;
      }
    }

    /*
     * If there is no NGN wallet entry, treat the available
     * NGN balance as zero.
     */

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

    /*
     * ========================================================
     * STEP 2
     *
     * CHECK AVAILABLE FLUTTERWAVE BALANCE
     * ========================================================
     */

    if (
      !Number.isFinite(
        flutterwaveAvailableBalance,
      )
    ) {
      console.error(
        "Invalid Flutterwave available balance:",
        flutterwaveAvailableBalance,
      );

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
     * INSUFFICIENT FLUTTERWAVE BALANCE
     *
     * IMPORTANT:
     *
     * DO NOT debit user's IyanjuPay wallet.
     * ========================================================
     */

    if (
      flutterwaveAvailableBalance <
      amount
    ) {
      console.warn(
        "INSUFFICIENT FLUTTERWAVE BALANCE:",
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
     * DEBIT USER'S IYANJUPAY WALLET
     * ========================================================
     *
     * We only reach this point if Flutterwave has enough
     * available balance for the requested amount.
     * ========================================================
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

          currency:
            "NGN",
        },
      },
    );

    if (debitError) {
      console.error(
        "WALLET DEBIT ERROR:",
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
      console.error(
        "Wallet debit returned no transaction",
      );

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
     * CALL FLUTTERWAVE TRANSFER THROUGH SMARTASP
     * ========================================================
     */

    console.log(
      "Calling Flutterwave transfer through SmartASP:",
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
                ],
              }),
          },
        );
    } catch (
      flutterwaveRequestError
    ) {
      console.error(
        "FLUTTERWAVE NETWORK/PROXY ERROR:",
        flutterwaveRequestError,
      );

      /*
       * ======================================================
       * REFUND USER
       * ======================================================
       */

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
              "Flutterwave proxy/network request failed",

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
              !refundError,

            error:
              "Flutterwave proxy/network request failed",

            refund_error:
              refundError?.message ??
              null,
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
            !refundError,

          reference,
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
      "Flutterwave transfer response:",
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
     * FLUTTERWAVE TRANSFER FAILED
     * ========================================================
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
        flutterwaveError,
      );

      /*
       * ======================================================
       * DETECT PROVIDER INSUFFICIENT BALANCE
       * ======================================================
       *
       * Even after our balance check, Flutterwave can reject
       * the transfer because the balance changed between the
       * balance check and the transfer request, or because
       * fees/other provider requirements consume additional
       * funds.
       *
       * Therefore this second protection is necessary.
       * ======================================================
       */

      const lowerError =
        String(
          flutterwaveError,
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

      /*
       * ======================================================
       * REFUND USER
       * ======================================================
       */

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

          _provider_reference:
            flutterwaveData
              ?.data
              ?.id
              ? String(
                  flutterwaveData
                    .data
                    .id,
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

            insufficient_flutterwave_balance:
              isInsufficientBalance,

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

      /*
       * ======================================================
       * UPDATE TRANSACTION
       * ======================================================
       */

      await supabase
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
                    .id,
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

            insufficient_flutterwave_balance:
              isInsufficientBalance,

            refunded:
              !refundError,

            refund_error:
              refundError?.message ??
              null,
          },
        })
        .eq(
          "id",
          transactionId,
        );

      /*
       * ======================================================
       * USER-FRIENDLY ERROR
       * ======================================================
       */

      if (
        isInsufficientBalance
      ) {
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

            refunded:
              !refundError,

            reference,
          },
          200,
        );
      }

      /*
       * Other Flutterwave provider errors should remain
       * visible instead of incorrectly saying insufficient
       * balance.
       */

      return json(
        {
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
        },
        200,
      );
    }

    /*
     * ========================================================
     * STEP 5
     *
     * TRANSFER ACCEPTED BY FLUTTERWAVE
     * ========================================================
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
      JSON.stringify({
        transfer_id:
          flutterwaveTransferId,

        status:
          transferStatus,

        reference,
      }),
    );

    /*
     * ========================================================
     * UPDATE TRANSACTION
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
        "Transaction update error:",
        transactionUpdateError,
      );
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
