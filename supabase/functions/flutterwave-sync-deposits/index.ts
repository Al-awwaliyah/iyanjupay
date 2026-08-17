import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Reconciles bank deposits made into the user's dedicated (virtual)
 * account and credits the wallet immediately, without waiting for
 * the Flutterwave webhook.
 *
 * Every credit is idempotent: the Flutterwave transaction id is used
 * as the wallet reference number (FLW_<id>), which is UNIQUE.
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
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401)

    const admin = adminClient()

    // 1. The user's active dedicated accounts
    const { data: accounts, error: accountsError } = await admin
      .from('virtual_accounts')
      .select('id, user_id, wallet_id, account_number, bank_name')
      .eq('user_id', user.id)
      .eq('provider', 'flutterwave')
      .eq('status', 'active')

    if (accountsError) throw accountsError

    if (!accounts || accounts.length === 0) {
      return json({
        success: true,
        credited: 0,
        message: 'No dedicated account found yet',
      })
    }

    const walletId = accounts.find((a) => a.wallet_id)?.wallet_id
    if (!walletId) {
      return json({ success: false, error: 'Wallet not found' }, 400)
    }

    const accountNumbers = accounts
      .map((a) => String(a.account_number ?? '').trim())
      .filter(Boolean)

    // 2. Pull recent successful Flutterwave transactions
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const { ok, body } = await flw(
      `/transactions?status=successful&from=${fmt(from)}&to=${fmt(to)}`,
    )

    if (!ok || body?.status !== 'success' || !Array.isArray(body?.data)) {
      console.error('Flutterwave transaction list failed:', JSON.stringify(body))
      return json({ success: false, error: 'Unable to reach Flutterwave' }, 502)
    }

    // 3. Keep only deposits that landed on this user's account
    const deposits = body.data.filter((txn: any) => {
      const status = String(txn?.status ?? '').toLowerCase()
      if (status !== 'successful' && status !== 'succeeded') return false
      if (String(txn?.currency ?? 'NGN').toUpperCase() !== 'NGN') return false

      const amount = Number(txn?.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) return false

      const haystack = JSON.stringify(txn)
      return accountNumbers.some((number) => haystack.includes(number))
    })

    console.log(
      `Sync deposits: ${deposits.length} candidate(s) for user ${user.id}`,
    )

    let credited = 0
    let creditedAmount = 0

    for (const txn of deposits) {
      const reference = `FLW_${String(txn.id)}`

      // Skip anything already recorded (webhook or an earlier sync)
      const { data: existing, error: existingError } = await admin
        .from('transactions')
        .select('id')
        .eq('reference_number', reference)
        .maybeSingle()

      if (existingError) throw existingError
      if (existing) continue

      // Re-verify with Flutterwave before crediting
      const verify = await flw(`/transactions/${txn.id}/verify`)
      const verified = verify.body?.data

      if (
        !verify.ok ||
        verify.body?.status !== 'success' ||
        !verified ||
        (verified.status !== 'successful' && verified.status !== 'succeeded')
      ) {
        console.error(`Verification failed for ${txn.id}`)
        continue
      }

      const amount = Number(verified.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) continue

      const { data: result, error: creditError } = await admin.rpc(
        'credit_wallet',
        {
          p_wallet_id: walletId,
          p_amount: amount,
          p_reference_number: reference,
          p_description: 'Wallet funding via bank transfer',
          p_provider: 'flutterwave',
          p_provider_reference: String(verified.tx_ref ?? txn.id),
        },
      )

      if (creditError) {
        console.error('credit_wallet failed:', creditError)
        continue
      }

      if (result?.already_processed !== true) {
        credited += 1
        creditedAmount += amount
      }
    }

    // 4. Return the authoritative wallet balance
    const { data: wallet } = await admin
      .from('wallets')
      .select('id, balance, held_balance, currency, status')
      .eq('id', walletId)
      .maybeSingle()

    return json({
      success: true,
      credited,
      credited_amount: creditedAmount,
      balance: Number(wallet?.balance ?? 0),
      wallet,
    })
  } catch (error: any) {
    console.error('Sync deposits error:', error)
    return json(
      { success: false, error: error?.message ?? 'Unexpected error' },
      500,
    )
  }
})
