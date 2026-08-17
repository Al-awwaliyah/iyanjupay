import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Reconciles bank deposits made into the user's permanent Flutterwave
 * virtual account and credits the wallet immediately.
 *
 * Reconciliation:
 * 1. Virtual-account order_reference / tx_ref
 * 2. Flutterwave provider_reference / flw_ref
 * 3. Virtual account number
 * 4. Full transaction JSON fallback
 *
 * Every credit is idempotent through FLW_<transaction_id>.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(
      {
        success: false,
        error: 'Method not allowed',
      },
      405,
    )
  }

  try {
    // ==================================================
    // 1. Authenticate user
    // ==================================================

    const user = await getUser(req)

    if (!user) {
      return json(
        {
          success: false,
          error: 'Unauthorized',
        },
        401,
      )
    }

    const admin = adminClient()

    console.log(
      `Starting Flutterwave deposit sync for user ${user.id}`,
    )

    // ==================================================
    // 2. Get user's active Flutterwave virtual accounts
    // ==================================================

    const {
      data: accounts,
      error: accountsError,
    } = await admin
      .from('virtual_accounts')
      .select(
        `
          id,
          user_id,
          wallet_id,
          account_number,
          bank_name,
          provider_reference,
          order_reference,
          is_permanent,
          status
        `,
      )
      .eq('user_id', user.id)
      .eq('provider', 'flutterwave')
      .eq('status', 'active')

    if (accountsError) {
      console.error(
        'Virtual account lookup failed:',
        accountsError,
      )

      throw accountsError
    }

    if (!accounts || accounts.length === 0) {
      console.log(
        `No active Flutterwave virtual account found for ${user.id}`,
      )

      return json({
        success: true,
        credited: 0,
        credited_amount: 0,
        balance: 0,
        message: 'No dedicated account found yet',
      })
    }

    // ==================================================
    // 3. Find wallet
    // ==================================================

    const walletId = accounts.find(
      (account) => account.wallet_id,
    )?.wallet_id

    if (!walletId) {
      console.error(
        `No wallet_id found for user ${user.id}`,
      )

      return json(
        {
          success: false,
          error: 'Wallet not found',
        },
        400,
      )
    }

    // ==================================================
    // 4. Prepare reconciliation identifiers
    // ==================================================

    const accountNumbers = accounts
      .map((account) =>
        String(account.account_number ?? '').trim(),
      )
      .filter(Boolean)

    const orderReferences = accounts
      .map((account) =>
        String(account.order_reference ?? '').trim(),
      )
      .filter(Boolean)

    const providerReferences = accounts
      .map((account) =>
        String(account.provider_reference ?? '').trim(),
      )
      .filter(Boolean)

    console.log(
      'Flutterwave reconciliation data:',
      {
        accountNumbers,
        orderReferences,
        providerReferences,
      },
    )

    // ==================================================
    // 5. Pull recent successful Flutterwave transactions
    // ==================================================

    const to = new Date()

    // Search the last 14 days so the existing test transfer
    // is definitely included.
    const from = new Date(
      to.getTime() -
        14 * 24 * 60 * 60 * 1000,
    )

    const fmt = (date: Date) =>
      date.toISOString().slice(0, 10)

    console.log(
      `Searching Flutterwave transactions from ${fmt(from)} to ${fmt(to)}`,
    )

    const {
      ok,
      body,
    } = await flw(
      `/transactions?status=successful&from=${fmt(from)}&to=${fmt(to)}&page=1`,
    )

    if (
      !ok ||
      body?.status !== 'success' ||
      !Array.isArray(body?.data)
    ) {
      console.error(
        'Flutterwave transaction list failed:',
        JSON.stringify(body),
      )

      return json(
        {
          success: false,
          error: 'Unable to reach Flutterwave',
        },
        502,
      )
    }

    console.log(
      `Flutterwave returned ${body.data.length} transaction(s)`,
    )

    // ==================================================
    // 6. DEBUG: print raw transactions
    // ==================================================
    //
    // This is intentionally included for debugging.
    // It lets us see exactly where Flutterwave places
    // the virtual-account information.
    //
    // IMPORTANT:
    // Remove or reduce this logging after the issue
    // has been resolved.
    // ==================================================

    console.log(
      'FLUTTERWAVE TRANSACTIONS RAW:',
      JSON.stringify(body.data, null, 2),
    )

    // ==================================================
    // 7. Identify deposits belonging to this user
    // ==================================================

    const deposits = body.data.filter(
      (txn: any) => {
        const status = String(
          txn?.status ?? '',
        ).toLowerCase()

        if (
          status !== 'successful' &&
          status !== 'succeeded'
        ) {
          return false
        }

        const currency = String(
          txn?.currency ?? '',
        ).toUpperCase()

        if (currency !== 'NGN') {
          return false
        }

        const amount = Number(
          txn?.amount ?? 0,
        )

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return false
        }

        // ----------------------------------------------
        // Possible Flutterwave identifiers
        // ----------------------------------------------

        const txRef = String(
          txn?.tx_ref ??
            txn?.txRef ??
            txn?.reference ??
            '',
        ).trim()

        const flwRef = String(
          txn?.flw_ref ??
            txn?.flwRef ??
            '',
        ).trim()

        const accountNumber = String(
          txn?.account_number ??
            txn?.accountNumber ??
            txn?.meta_data?.account_number ??
            txn?.meta_data?.accountNumber ??
            txn?.meta?.account_number ??
            txn?.meta?.accountNumber ??
            '',
        ).trim()

        // ----------------------------------------------
        // Primary reference matching
        // ----------------------------------------------

        const matchesOrderReference =
          !!txRef &&
          orderReferences.includes(txRef)

        const matchesProviderReference =
          !!flwRef &&
          providerReferences.includes(flwRef)

        // ----------------------------------------------
        // Account number matching
        // ----------------------------------------------

        const matchesAccountNumber =
          !!accountNumber &&
          accountNumbers.includes(
            accountNumber,
          )

        // ----------------------------------------------
        // Fallback: search complete transaction JSON
        // ----------------------------------------------

        const haystack =
          JSON.stringify(txn)

        const containsAccountNumber =
          accountNumbers.length > 0 &&
          accountNumbers.some(
            (number) =>
              haystack.includes(number),
          )

        const containsOrderReference =
          orderReferences.length > 0 &&
          orderReferences.some(
            (reference) =>
              haystack.includes(reference),
          )

        const containsProviderReference =
          providerReferences.length > 0 &&
          providerReferences.some(
            (reference) =>
              haystack.includes(reference),
          )

        const matched =
          matchesOrderReference ||
          matchesProviderReference ||
          matchesAccountNumber ||
          containsAccountNumber ||
          containsOrderReference ||
          containsProviderReference

        // ----------------------------------------------
        // Detailed matching debug
        // ----------------------------------------------

        console.log(
          'Transaction matching analysis:',
          JSON.stringify(
            {
              id: txn?.id ?? null,
              amount: txn?.amount ?? null,
              currency: txn?.currency ?? null,
              status: txn?.status ?? null,
              tx_ref: txRef || null,
              flw_ref: flwRef || null,
              account_number:
                accountNumber || null,

              matchedBy: {
                orderReference:
                  matchesOrderReference,

                providerReference:
                  matchesProviderReference,

                accountNumber:
                  matchesAccountNumber,

                containsAccountNumber,

                containsOrderReference,

                containsProviderReference,
              },

              finalMatch: matched,
            },
            null,
            2,
          ),
        )

        return matched
      },
    )

    console.log(
      `Sync deposits: ${deposits.length} candidate(s) for user ${user.id}`,
    )

    // ==================================================
    // 8. Process deposits
    // ==================================================

    let credited = 0
    let creditedAmount = 0

    for (const txn of deposits) {
      const transactionId = String(
        txn?.id ?? '',
      ).trim()

      if (!transactionId) {
        console.error(
          'Skipping transaction without ID:',
          JSON.stringify(txn),
        )

        continue
      }

      const reference =
        `FLW_${transactionId}`

      // ==================================================
      // 9. Idempotency check
      // ==================================================

      const {
        data: existing,
        error: existingError,
      } = await admin
        .from('transactions')
        .select('id')
        .eq(
          'reference_number',
          reference,
        )
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      if (existing) {
        console.log(
          `Transaction ${transactionId} already processed`,
        )

        continue
      }

      // ==================================================
      // 10. Re-verify transaction with Flutterwave
      // ==================================================

      console.log(
        `Verifying Flutterwave transaction ${transactionId}`,
      )

      const verify = await flw(
        `/transactions/${transactionId}/verify`,
      )

      const verified =
        verify.body?.data

      if (
        !verify.ok ||
        verify.body?.status !== 'success' ||
        !verified ||
        (
          verified.status !== 'successful' &&
          verified.status !== 'succeeded'
        )
      ) {
        console.error(
          `Verification failed for ${transactionId}:`,
          JSON.stringify(
            verify.body,
          ),
        )

        continue
      }

      // ==================================================
      // 11. Validate verified amount
      // ==================================================

      const amount = Number(
        verified.amount ?? 0,
      )

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        console.error(
          `Invalid verified amount for ${transactionId}:`,
          verified.amount,
        )

        continue
      }

      // ==================================================
      // 12. Validate verified currency
      // ==================================================

      const verifiedCurrency =
        String(
          verified.currency ??
            txn.currency ??
            '',
        ).toUpperCase()

      if (
        verifiedCurrency !== 'NGN'
      ) {
        console.error(
          `Skipping non-NGN transaction ${transactionId}`,
        )

        continue
      }

      // ==================================================
      // 13. Credit wallet
      // ==================================================

      console.log(
        `Crediting wallet ${walletId} with ${amount} NGN`,
      )

      const {
        data: result,
        error: creditError,
      } = await admin.rpc(
        'credit_wallet',
        {
          p_wallet_id: walletId,
          p_amount: amount,
          p_reference_number:
            reference,
          p_description:
            'Wallet funding via bank transfer',
          p_provider:
            'flutterwave',
          p_provider_reference:
            String(
              verified.tx_ref ??
                verified.flw_ref ??
                txn.tx_ref ??
                txn.flw_ref ??
                txn.id,
            ),
        },
      )

      if (creditError) {
        console.error(
          'credit_wallet failed:',
          creditError,
        )

        continue
      }

      console.log(
        'credit_wallet result:',
        JSON.stringify(result),
      )

      if (
        result?.already_processed !== true
      ) {
        credited += 1
        creditedAmount += amount

        console.log(
          `Wallet credited successfully: ${amount} NGN`,
        )
      }
    }

    // ==================================================
    // 14. Get authoritative wallet balance
    // ==================================================

    const {
      data: wallet,
      error: walletError,
    } = await admin
      .from('wallets')
      .select(
        'id, balance, held_balance, currency, status',
      )
      .eq('id', walletId)
      .maybeSingle()

    if (walletError) {
      throw walletError
    }

    // ==================================================
    // 15. Return result
    // ==================================================

    console.log(
      'Final sync result:',
      JSON.stringify({
        credited,
        creditedAmount,
        balance:
          Number(
            wallet?.balance ?? 0,
          ),
      }),
    )

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
    })
  } catch (error: any) {
    console.error(
      'Sync deposits error:',
      error,
    )

    return json(
      {
        success: false,
        error:
          error?.message ??
          'Unexpected error',
      },
      500,
    )
  }
})
