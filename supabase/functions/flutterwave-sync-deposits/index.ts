import {
  corsHeaders,
  json,
  adminClient,
  getUser,
  flw,
} from "../_shared/auth.ts";

/**
 * ============================================================
 * IYANJUPAY
 * FLUTTERWAVE DEPOSIT SYNC
 * ============================================================
 *
 * PURPOSE
 *
 * Reconcile successful Flutterwave virtual-account deposits
 * into the user's wallet.
 *
 * IMPORTANT IDEMPOTENCY RULE
 *
 * Flutterwave transaction ID is the canonical identity.
 *
 * Example:
 *
 *   Flutterwave transaction ID:
 *   2085722023
 *
 *   transaction reference:
 *   FLW_2085722023
 *
 *   provider:
 *   flutterwave
 *
 *   provider_reference:
 *   2085722023
 *
 * The virtual-account tx_ref is ONLY used to identify the
 * user's virtual account. It is NOT used as the provider
 * transaction identity.
 *
 * Existing legacy records using:
 *
 *   IYJ-FUND-2085722023
 *
 * are recognized by credit_wallet().
 * ============================================================
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

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
    // ==========================================================
    // 1. AUTHENTICATE USER
    // ==========================================================

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

    const admin = adminClient();

    console.log(
      `Starting Flutterwave deposit sync for user ${user.id}`,
    );

    // ==========================================================
    // 2. GET ACTIVE VIRTUAL ACCOUNTS
    // ==========================================================

    const {
      data: accounts,
      error: accountsError,
    } = await admin
      .from("virtual_accounts")
      .select(`
        id,
        user_id,
        wallet_id,
        account_number,
        bank_name,
        provider_reference,
        order_reference,
        is_permanent,
        status
      `)
      .eq("user_id", user.id)
      .eq("provider", "flutterwave")
      .eq("status", "active");

    if (accountsError) {
      console.error(
        "Virtual account lookup failed:",
        accountsError,
      );

      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return json({
        success: true,
        credited: 0,
        credited_amount: 0,
        balance: 0,
        message: "No dedicated account found yet",
      });
    }

    // ==========================================================
    // 3. FIND WALLET
    // ==========================================================

    const walletId =
      accounts.find(
        (account) => account.wallet_id,
      )?.wallet_id ?? null;

    if (!walletId) {
      return json(
        {
          success: false,
          error: "Wallet not found",
        },
        400,
      );
    }

    // ==========================================================
    // 4. RECONCILIATION DATA
    // ==========================================================

    const accountNumbers = [
      ...new Set(
        accounts
          .map((account) =>
            String(
              account.account_number ?? "",
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];

    const orderReferences = [
      ...new Set(
        accounts
          .map((account) =>
            String(
              account.order_reference ?? "",
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];

    const providerReferences = [
      ...new Set(
        accounts
          .map((account) =>
            String(
              account.provider_reference ?? "",
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];

    /*
     * Virtual-account creation tx_ref prefix.
     *
     * This is ONLY an account ownership matching mechanism.
     *
     * It must NOT become provider_reference.
     */
    const virtualAccountTxPrefix =
      `IYJ_VA_${user.id}_`;

    console.log(
      "Flutterwave reconciliation data:",
      {
        accountNumbers,
        orderReferences,
        providerReferences,
        virtualAccountTxPrefix,
      },
    );

    // ==========================================================
    // 5. DATE RANGE
    // ==========================================================

    const to = new Date();

    const from = new Date(
      to.getTime() -
        14 * 24 * 60 * 60 * 1000,
    );

    const fmt = (date: Date) =>
      date.toISOString().slice(0, 10);

    console.log(
      `Searching Flutterwave transactions from ${fmt(from)} to ${fmt(to)}`,
    );

    // ==========================================================
    // 6. GET SUCCESSFUL FLUTTERWAVE TRANSACTIONS
    // ==========================================================

    const {
      ok,
      body,
    } = await flw(
      `/transactions?status=successful&from=${fmt(from)}&to=${fmt(to)}&page=1`,
    );

    if (
      !ok ||
      body?.status !== "success" ||
      !Array.isArray(body?.data)
    ) {
      console.error(
        "Flutterwave transaction list failed:",
        JSON.stringify(body),
      );

      return json(
        {
          success: false,
          error: "Unable to reach Flutterwave",
        },
        502,
      );
    }

    console.log(
      `Flutterwave returned ${body.data.length} transaction(s)`,
    );

    // ==========================================================
    // 7. IDENTIFY USER DEPOSITS
    // ==========================================================

    const deposits = body.data.filter(
      (txn: any) => {
        const status = String(
          txn?.status ?? "",
        ).toLowerCase();

        if (
          status !== "successful" &&
          status !== "succeeded"
        ) {
          return false;
        }

        const currency = String(
          txn?.currency ?? "",
        ).toUpperCase();

        if (currency !== "NGN") {
          return false;
        }

        const amount = Number(
          txn?.amount ?? 0,
        );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return false;
        }

        const paymentType = String(
          txn?.payment_type ?? "",
        ).toLowerCase();

        /*
         * If Flutterwave supplies payment_type, require
         * bank transfer.
         */
        if (
          paymentType &&
          paymentType !== "bank_transfer"
        ) {
          return false;
        }

        /*
         * ======================================================
         * FLUTTERWAVE TRANSACTION ID
         * ======================================================
         */

        const transactionId = String(
          txn?.id ?? "",
        ).trim();

        if (!transactionId) {
          return false;
        }

        /*
         * ======================================================
         * VIRTUAL ACCOUNT TX REF
         * ======================================================
         */

        const txRef = String(
          txn?.tx_ref ??
            txn?.txRef ??
            txn?.reference ??
            "",
        ).trim();

        const flwRef = String(
          txn?.flw_ref ??
            txn?.flwRef ??
            "",
        ).trim();

        /*
         * ======================================================
         * ACCOUNT NUMBER MATCH
         * ======================================================
         */

        const transactionAccountNumber =
          String(
            txn?.account_number ??
              txn?.accountNumber ??
              txn?.meta?.account_number ??
              txn?.meta?.accountNumber ??
              txn?.meta_data?.account_number ??
              txn?.meta_data?.accountNumber ??
              txn?.bank_transfer?.account_number ??
              txn?.bank_transfer?.accountNumber ??
              "",
          ).trim();

        const matchesAccountNumber =
          !!transactionAccountNumber &&
          accountNumbers.includes(
            transactionAccountNumber,
          );

        /*
         * ======================================================
         * VIRTUAL ACCOUNT TX REF MATCH
         * ======================================================
         */

        const matchesUserVirtualAccountTxRef =
          txRef.startsWith(
            virtualAccountTxPrefix,
          );

        /*
         * ======================================================
         * STORED REFERENCES
         * ======================================================
         */

        const matchesStoredOrderReference =
          !!txRef &&
          orderReferences.includes(txRef);

        const matchesStoredProviderReference =
          !!flwRef &&
          providerReferences.includes(flwRef);

        const matched =
          matchesUserVirtualAccountTxRef ||
          matchesStoredOrderReference ||
          matchesStoredProviderReference ||
          matchesAccountNumber;

        console.log(
          "Transaction matching analysis:",
          JSON.stringify(
            {
              id: transactionId,
              amount: txn?.amount ?? null,
              currency: txn?.currency ?? null,
              status: txn?.status ?? null,
              payment_type:
                txn?.payment_type ?? null,
              tx_ref: txRef || null,
              flw_ref: flwRef || null,
              account_number:
                transactionAccountNumber ||
                null,

              matchedBy: {
                userVirtualAccountTxRef:
                  matchesUserVirtualAccountTxRef,

                storedOrderReference:
                  matchesStoredOrderReference,

                storedProviderReference:
                  matchesStoredProviderReference,

                accountNumber:
                  matchesAccountNumber,
              },

              finalMatch: matched,

              canonicalIdentity: {
                transactionId,
                reference:
                  `FLW_${transactionId}`,
                provider:
                  "flutterwave",
                providerReference:
                  transactionId,
              },
            },
            null,
            2,
          ),
        );

        return matched;
      },
    );

    console.log(
      `Sync deposits: ${deposits.length} candidate(s) for user ${user.id}`,
    );

    // ==========================================================
    // 8. PROCESS DEPOSITS
    // ==========================================================

    let credited = 0;
    let creditedAmount = 0;

    for (const txn of deposits) {
      /*
       * ========================================================
       * CANONICAL FLUTTERWAVE TRANSACTION ID
       * ========================================================
       */

      const transactionId = String(
        txn?.id ?? "",
      ).trim();

      if (!transactionId) {
        console.error(
          "Skipping transaction without Flutterwave ID:",
          JSON.stringify(txn),
        );

        continue;
      }

      /*
       * ========================================================
       * CANONICAL IDEMPOTENCY VALUES
       * ========================================================
       *
       * NEVER use tx_ref or flw_ref here.
       */

      const reference =
        `FLW_${transactionId}`;

      const providerReference =
        transactionId;

      console.log(
        "Processing canonical Flutterwave deposit:",
        JSON.stringify({
          transactionId,
          reference,
          providerReference,
        }),
      );

      // ========================================================
      // 9. CHECK CANONICAL REFERENCE
      // ========================================================

      const {
        data: existingByReference,
        error: referenceError,
      } = await admin
        .from("transactions")
        .select(`
          id,
          wallet_id,
          amount,
          status,
          reference_number,
          provider,
          provider_reference
        `)
        .eq(
          "reference_number",
          reference,
        )
        .maybeSingle();

      if (referenceError) {
        throw referenceError;
      }

      if (existingByReference) {
        console.log(
          `Flutterwave transaction ${transactionId} already processed by canonical reference`,
        );

        continue;
      }

      // ========================================================
      // 10. CHECK PROVIDER TRANSACTION ID
      //
      // This also catches historical records such as:
      //
      // IYJ-FUND-2085722023
      // provider_reference = 2085722023
      // ========================================================

      const {
        data: existingByProvider,
        error: providerError,
      } = await admin
        .from("transactions")
        .select(`
          id,
          wallet_id,
          amount,
          status,
          reference_number,
          provider,
          provider_reference
        `)
        .eq(
          "provider",
          "flutterwave",
        )
        .eq(
          "transaction_type",
          "wallet_funding",
        )
        .eq(
          "provider_reference",
          providerReference,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .limit(1)
        .maybeSingle();

      if (providerError) {
        throw providerError;
      }

      if (existingByProvider) {
        console.log(
          `Flutterwave transaction ${transactionId} already processed by provider reference`,
        );

        continue;
      }

      // ========================================================
      // 11. VERIFY WITH FLUTTERWAVE
      // ========================================================

      console.log(
        `Verifying Flutterwave transaction ${transactionId}`,
      );

      const verify = await flw(
        `/transactions/${encodeURIComponent(
          transactionId,
        )}/verify`,
        {
          method: "GET",
        },
      );

      const verified =
        verify.body?.data;

      if (
        !verify.ok ||
        verify.body?.status !== "success" ||
        !verified
      ) {
        console.error(
          `Verification failed for ${transactionId}:`,
          JSON.stringify(
            verify.body,
          ),
        );

        continue;
      }

      const verifiedStatus =
        String(
          verified?.status ?? "",
        ).toLowerCase();

      if (
        verifiedStatus !== "successful" &&
        verifiedStatus !== "succeeded"
      ) {
        console.log(
          `Verified Flutterwave transaction ${transactionId} is not successful`,
        );

        continue;
      }

      // ========================================================
      // 12. VALIDATE AMOUNT
      // ========================================================

      const amount = Number(
        verified?.amount ?? 0,
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        console.error(
          `Invalid verified amount for ${transactionId}:`,
          verified?.amount,
        );

        continue;
      }

      // ========================================================
      // 13. VALIDATE CURRENCY
      // ========================================================

      const verifiedCurrency =
        String(
          verified?.currency ??
            txn?.currency ??
            "",
        ).toUpperCase();

      if (
        verifiedCurrency !== "NGN"
      ) {
        console.error(
          `Skipping non-NGN transaction ${transactionId}`,
        );

        continue;
      }

      // ========================================================
      // 14. FINAL PRE-CREDIT PROVIDER CHECK
      //
      // This second check is intentionally performed immediately
      // before credit_wallet().
      //
      // It protects against a webhook having completed while
      // this sync was verifying the transaction.
      // ========================================================

      const {
        data: finalExisting,
        error: finalExistingError,
      } = await admin
        .from("transactions")
        .select(`
          id,
          wallet_id,
          amount,
          status,
          reference_number,
          provider_reference
        `)
        .eq(
          "provider",
          "flutterwave",
        )
        .eq(
          "transaction_type",
          "wallet_funding",
        )
        .eq(
          "provider_reference",
          transactionId,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .limit(1)
        .maybeSingle();

      if (finalExistingError) {
        throw finalExistingError;
      }

      if (finalExisting) {
        console.log(
          `Transaction ${transactionId} was processed while sync was verifying it`,
        );

        continue;
      }

      // ========================================================
      // 15. CREDIT WALLET
      //
      // CANONICAL VALUES ONLY
      // ========================================================

      console.log(
        `Crediting wallet ${walletId} with ${amount} NGN for Flutterwave transaction ${transactionId}`,
      );

      const {
        data: result,
        error: creditError,
      } = await admin.rpc(
        "credit_wallet",
        {
          p_wallet_id:
            walletId,

          p_amount:
            amount,

          p_reference_number:
            reference,

          p_description:
            "Wallet funding via Flutterwave virtual account",

          p_provider:
            "flutterwave",

          p_provider_reference:
            providerReference,
        },
      );

      if (creditError) {
        console.error(
          "credit_wallet failed:",
          creditError,
        );

        continue;
      }

      console.log(
        "credit_wallet result:",
        JSON.stringify(result),
      );

      if (
        result?.already_processed === true
      ) {
        console.log(
          `Flutterwave transaction ${transactionId} was already processed`,
        );

        continue;
      }

      if (
        result?.success === true
      ) {
        credited += 1;
        creditedAmount += amount;

        console.log(
          `Wallet credited successfully: ${amount} NGN`,
        );
      }
    }

    // ==========================================================
    // 16. AUTHORITATIVE WALLET BALANCE
    // ==========================================================

    const {
      data: wallet,
      error: walletError,
    } = await admin
      .from("wallets")
      .select(`
        id,
        balance,
        held_balance,
        currency,
        status
      `)
      .eq(
        "id",
        walletId,
      )
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    // ==========================================================
    // 17. FINAL RESPONSE
    // ==========================================================

    console.log(
      "Final sync result:",
      JSON.stringify({
        credited,
        creditedAmount,
        balance:
          Number(
            wallet?.balance ?? 0,
          ),
      }),
    );

    return json({
      success: true,
      credited,
      credited_amount:
        creditedAmount,
      balance:
        Number(
          wallet?.balance ?? 0,
        ),
      wallet,
    });

  } catch (error: any) {
    console.error(
      "Sync deposits error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          "Unable to synchronize deposits",
      },
      500,
    );
  }
});
