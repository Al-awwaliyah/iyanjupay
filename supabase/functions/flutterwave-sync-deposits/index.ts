import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Reconciles successful Flutterwave bank-transfer deposits
 * into the user's permanent virtual account.
 *
 * Virtual-account transactions created by IyanjuPay use:
 *
 *   IYJ_VA_<user_id>_<uuid>
 *
 * as their tx_ref.
 *
 * We use that tx_ref as the primary reconciliation mechanism.
 *
 * Every wallet credit is idempotent using:
 *
 *   FLW_<flutterwave_transaction_id>
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
    // 2. Get active Flutterwave virtual accounts
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
      return json(
        {
          success: false,
          error: 'Wallet not found',
        },
        400,
      )
    }

    // ==================================================
    // 4. Reconciliation identifiers
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

    // This is the reference pattern created by our
    // virtual-account creation function.
    const virtualAccountTxPrefix =
      `IYJ_VA_${user.id}_`

    console.log(
      'Flutterwave reconciliation data:',
      {
        accountNumbers,
        orderReferences,
        providerReferences,
        virtualAccountTxPrefix,
      },
    )

    // ==================================================
    // 5. Pull recent successful transactions
    // ==================================================

    const to = new Date()

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
    // 6. Identify user's deposits
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

        const paymentType = String(
          txn?.payment_type ?? '',
        ).toLowerCase()

        // We only want bank-transfer deposits here.
        if (
          paymentType &&
          paymentType !== 'bank_transfer'
        ) {
          return false
        }

        const txRef = String(
          txn?.tx_ref ?? '',
        ).trim()

        const flwRef = String(
          txn?.flw_ref ?? '',
        ).trim()

        // ==================================================
        // PRIMARY MATCH
        //
        // Our virtual-account creation function generates:
        //
        // IYJ_VA_<user.id>_<uuid>
        // ==================================================

        const matchesUserVirtualAccountTxRef =
          txRef.startsWith(
            virtualAccountTxPrefix,
          )

        // ==================================================
        // Secondary matches
        // ==================================================

        const matchesStoredOrderReference =
          !!txRef &&
          orderReferences.includes(txRef)

        const matchesStoredProviderReference =
          !!flwRef &&
          providerReferences.includes(flwRef)

        const transactionAccountNumber =
          String(
            txn?.account_number ??
              txn?.accountNumber ??
              txn?.meta?.account_number ??
              txn?.meta?.accountNumber ??
              txn?.meta_data?.account_number ??
              txn?.meta_data?.accountNumber ??
              '',
          ).trim()

        const matchesAccountNumber =
          !!transactionAccountNumber &&
          accountNumbers.includes(
            transactionAccountNumber,
          )

        const matched =
          matchesUserVirtualAccountTxRef ||
          matchesStoredOrderReference ||
          matchesStoredProviderReference ||
          matchesAccountNumber

        console.log(
          'Transaction matching analysis:',
          JSON.stringify(
            {
              id: txn?.id ?? null,
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
    // 7. Process matched deposits
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
      // 8. Idempotency check
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
      // 9. Verify transaction with Flutterwave
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
      // 10. Validate amount
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
      // 11. Validate currency
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
      // 12. Credit wallet
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
    // 13. Get authoritative wallet balance
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
    // 14. Final response
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
