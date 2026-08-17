import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Virtual card issuing / funding.
 *
 * Same money flow as send money: authenticate -> debit wallet through
 * the ledger -> call Flutterwave -> refund automatically on failure.
 *
 * Actions:
 *   { action: "list" }
 *   { action: "create", amount }
 *   { action: "fund", card_id, amount }
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
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'create')

    if (action === 'list') {
      const { ok, body: result } = await flw('/virtual-cards')

      if (!ok || result?.status !== 'success') {
        return json({ success: false, error: 'Unable to load cards' }, 502)
      }

      // Only expose cards issued for this user.
      const cards = (result.data ?? []).filter((card: any) =>
        String(card?.name_on_card ?? '').includes(user.id.slice(0, 8)),
      )

      return json({ success: true, cards })
    }

    const amount = Number(body?.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: 'Invalid amount' }, 400)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', user.id)
      .maybeSingle()

    const fullName = (profile?.full_name ?? 'IyanjuPay User').trim()
    const [firstname, ...rest] = fullName.split(/\s+/)
    const lastname = rest.join(' ') || 'User'
    const email = profile?.email ?? user.email

    const reference = `CARD_${crypto.randomUUID().replace(/-/g, '')}`

    // 1. Debit the wallet
    const { data: debit, error: debitError } = await admin.rpc('debit_wallet', {
      _user_id: user.id,
      _amount: amount,
      _description:
        action === 'fund' ? 'Virtual card funding' : 'Virtual card issuing',
      _idempotency_key: reference,
      _reference: reference,
      _category: 'virtual_card',
      _metadata: { action, card_id: body?.card_id ?? null },
    })

    if (debitError) {
      console.error('debit_wallet failed:', debitError)
      const message = String(debitError.message ?? '')
      return json(
        {
          success: false,
          error: message.includes('Insufficient')
            ? 'Insufficient wallet balance'
            : 'Unable to debit your wallet',
        },
        400,
      )
    }

    // 2. Call Flutterwave
    let providerOk = false
    let providerBody: any = null

    try {
      const result =
        action === 'fund'
          ? await flw(
              `/virtual-cards/${String(body?.card_id ?? '')}/fund`,
              {
                method: 'POST',
                body: JSON.stringify({ debit_currency: 'NGN', amount }),
              },
            )
          : await flw('/virtual-cards', {
              method: 'POST',
              body: JSON.stringify({
                currency: 'NGN',
                debit_currency: 'NGN',
                amount,
                billing_name: `${firstname} ${lastname}`,
                first_name: firstname,
                last_name: lastname,
                email,
                phone: profile?.phone_number ?? undefined,
                title: 'Mr',
                gender: 'M',
                date_of_birth: '1990-01-01',
                callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-webhook`,
              }),
            })

      providerOk = result.ok && result.body?.status === 'success'
      providerBody = result.body
    } catch (error) {
      console.error('Flutterwave card request failed:', error)
    }

    // 3. Refund on failure
    if (!providerOk) {
      console.error('Card operation failed:', JSON.stringify(providerBody))

      const { error: refundError } = await admin.rpc('refund_wallet', {
        _user_id: user.id,
        _amount: amount,
        _description: 'Virtual card reversal',
        _idempotency_key: `REFUND_${reference}`,
        _reference: `REFUND_${reference}`,
        _metadata: { original_reference: reference, reason: 'card_failed' },
      })

      if (refundError) console.error('refund_wallet failed:', refundError)

      return json(
        {
          success: false,
          error:
            providerBody?.message ??
            'Card request failed. Your wallet has been refunded.',
          refunded: !refundError,
          reference,
        },
        400,
      )
    }

    return json({
      success: true,
      reference,
      transaction_id: debit?.id ?? null,
      amount,
      card: providerBody?.data ?? null,
    })
  } catch (error: any) {
    console.error('Virtual card error:', error)
    return json(
      { success: false, error: error?.message ?? 'Unexpected error' },
      500,
    )
  }
})
