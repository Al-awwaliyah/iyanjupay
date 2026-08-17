import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Reconciles bank deposits made into the user's permanent Flutterwave
 * virtual account and credits the wallet immediately.
 *
 * Reconciliation order:
 * 1. Flutterwave tx_ref / order_reference
 * 2. Flutterwave account number
 *
 * Every credit is idempotent through FLW_<transaction_id>.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    const user = await getUser(req)

    if (!user) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const admin = adminClient()

    // --------------------------------------------------
    // 1. Get the user's active Flutterwave virtual accounts
    // --------------------------------------------------

    const { data: accounts, error: accountsError } = await admin
      .from('virtual_accounts')
      .select(
        'id, user_id, wallet_id, account_number, bank_name, provider_reference, order_reference, is_permanent',
      )
      .eq('user_id', user.id)
      .eq('provider', 'flutterwave')
      .eq('status', 'active')

    if (accountsError) {
      throw accountsError
    }

    if (!accounts || accounts.length === 0) {
      return json({
        success: true,
        credited: 0,
        credited_amount: 0,
        message: 'No dedicated account found yet',
      })
    }

    // --------------------------------------------------
    // 2. Find wallet
    // --------------------------------------------------

    const walletId = accounts.find((a) => a.wallet_id)?.wallet_id

    if (!walletId) {
      return json(
        {
          success: false,
          error: 'Wallet not found',
        },
        400,
      )
    }

    // --------------------------------------------------
    // 3. Build reconciliation identifiers
    // --------------------------------------------------

    const accountNumbers = accounts
      .map((a) => String(a.account_number ?? '').trim())
      .filter(Boolean)

    const orderReferences = accounts
      .map((a) => String(a.order_reference ?? '').trim())
      .filter(Boolean)

    const providerReferences = accounts
      .map((a) => String(a.provider_reference ?? '').trim())
      .filter(Boolean)

    console.log('Flutterwave reconciliation data:', {
      accountNumbers,
      orderReferences,
      providerReferences,
    })

    // --------------------------------------------------
    // 4. Pull recent successful transactions
    // --------------------------------------------------

    const to = new Date()
    const from = new Date(
      to.getTime() - 14 * 24 * 60 * 60 * 1000,
    )

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const { ok, body } = await flw(
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

    // --------------------------------------------------
    // 5. Identify deposits belonging to this user
    // --------------------------------------------------

    const deposits = body.data.filter((txn: any) => {
      const status = String(txn?.status ?? '').toLowerCase()

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

      const amount = Number(txn?.amount ?? 0)

      if (!Number.isFinite(amount) || amount <= 0) {
        return false
      }

      const txRef = String(
        txn?.tx_ref ?? '',
      ).trim()

      const flwRef = String(
        txn?.flw_ref ?? '',
      ).trim()

      const transactionAccountNumber = String(
        txn?.account_number ??
          txn?.meta_data?.account_number ??
          '',
      ).trim()

      // Primary match: virtual-account tx_ref
      const matchesOrderReference =
        !!txRef &&
        orderReferences.includes(txRef)

      // Secondary match: provider/flw reference
      const matchesProviderReference =
        !!flwRef &&
        providerReferences.includes(flwRef)

      // Fallback: account number
      const matchesAccountNumber =
        !!transactionAccountNumber &&
        accountNumbers.includes(
          transactionAccountNumber,
        )

      // Last-resort compatibility check against the
      // complete transaction object.
      const haystack = JSON.stringify(txn)

      const containsAccountNumber =
        accountNumbers.length > 0 &&
        accountNumbers.some((number) =>
          haystack.includes(number),
        )

      const matched =
        matchesOrderReference ||
        matchesProviderReference ||
        matchesAccountNumber ||
        containsAccountNumber

      if (matched) {
        console.log(
          'Matched Flutterwave deposit:',
          JSON.stringify({
            id: txn?.id,
            tx_ref: txn?.tx_ref,
            flw_ref: txn?.flw_ref,
            amount: txn?.amount,
            currency: txn?.currency,
            account_number:
              transactionAccountNumber || null,
            matchedBy: {
              orderReference: matchesOrderReference,
              providerReference:
                matchesProviderReference,
              accountNumber:
                matchesAccountNumber,
              containsAccountNumber,
            },
          }),
        )
      }

      return matched
    })

    console.log(
      `Sync deposits: ${deposits.length} candidate(s) for user ${user.id}`,
    )

    let credited = 0
    let creditedAmount = 0

    // --------------------------------------------------
    // 6. Process each candidate
    // --------------------------------------------------

    for (const txn of deposits) {
      const transactionId = String(txn?.id ?? '').trim()

      if (!transactionId) {
        console.error(
          'Skipping transaction without ID:',
          JSON.stringify(txn),
        )
        continue
      }

      const reference = `FLW_${transactionId}`

      // ------------------------------------------------
      // Idempotency check
      // ------------------------------------------------

      const {
        data: existing,
        error: existingError,
      } = await admin
        .from('transactions')
        .select('id')
        .eq('reference_number', reference)
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

      // ------------------------------------------------
      // Re-verify with Flutterwave
      // ------------------------------------------------

      const verify = await flw(
        `/transactions/${transactionId}/verify`,
      )

      const verified = verify.body?.data

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
          JSON.stringify(verify.body),
        )

        continue
      }

      const amount = Number(
        verified.amount ?? 0,
      )

      if (!Number.isFinite(amount) || amount <= 0) {
        console.error(
          `Invalid verified amount for ${transactionId}:`,
          verified.amount,
        )

        continue
      }

      // ------------------------------------------------
      // Final verification of currency
      // ------------------------------------------------

      const verifiedCurrency = String(
        verified.currency ?? txn.currency ?? '',
      ).toUpperCase()

      if (verifiedCurrency !== 'NGN') {
        console.error(
          `Skipping non-NGN transaction ${transactionId}`,
        )

        continue
      }

      // ------------------------------------------------
      // Credit wallet
      // ------------------------------------------------

      const {
        data: result,
        error: creditError,
      } = await admin.rpc(
        'credit_wallet',
        {
          p_wallet_id: walletId,
          p_amount: amount,
          p_reference_number: reference,
          p_description:
            'Wallet funding via bank transfer',
          p_provider: 'flutterwave',
          p_provider_reference:
            String(
              verified.tx_ref ??
                verified.flw_ref ??
                txn.tx_ref ??
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

      if (result?.already_processed !== true) {
        credited += 1
        creditedAmount += amount

        console.log(
          `Wallet credited successfully: ${amount} NGN`,
        )
      }
    }

    // --------------------------------------------------
    // 7. Return authoritative wallet balance
    // --------------------------------------------------

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

    return json({
      success: true,
      credited,
      credited_amount: creditedAmount,
      balance: Number(wallet?.balance ?? 0),
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
