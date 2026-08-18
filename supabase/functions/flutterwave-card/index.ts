import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Real virtual card issuing / funding / lifecycle through Flutterwave.
 *
 * Same money flow as send money: authenticate -> debit wallet through
 * the ledger -> call Flutterwave -> refund automatically on failure.
 *
 * Actions:
 *   { action: "list" }
 *   { action: "create", amount }
 *   { action: "fund", card_id, amount }
 *   { action: "details", card_id }
 *   { action: "freeze" | "unfreeze" | "terminate", card_id }
 *   { action: "transactions", card_id }
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

    // ----------------------------------------------------------
    // Cards owned by this user (source of truth is our database)
    // ----------------------------------------------------------
    if (action === 'list') {
      const { data: cards, error } = await admin
        .from('virtual_cards')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'terminated')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to list cards:', error)
        return json({ success: false, error: 'Unable to load cards' }, 500)
      }

      return json({ success: true, cards: cards ?? [] })
    }

    // ----------------------------------------------------------
    // Card-scoped actions
    // ----------------------------------------------------------
    const cardId = String(body?.card_id ?? '').trim()

    const ownedCard = async () => {
      if (!cardId) return null
      const { data } = await admin
        .from('virtual_cards')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider_card_id', cardId)
        .maybeSingle()
      return data
    }

    if (['details', 'freeze', 'unfreeze', 'terminate', 'transactions'].includes(action)) {
      const card = await ownedCard()
      if (!card) return json({ success: false, error: 'Card not found' }, 404)

      const endpoint =
        action === 'details'
          ? { path: `/virtual-cards/${cardId}`, method: 'GET' }
          : action === 'transactions'
            ? { path: `/virtual-cards/${cardId}/transactions`, method: 'GET' }
            : { path: `/virtual-cards/${cardId}/status/${action === 'unfreeze' ? 'unblock' : action === 'freeze' ? 'block' : 'terminate'}`, method: 'PUT' }

      const result = await flw(endpoint.path, { method: endpoint.method })

      if (!result.ok || result.body?.status !== 'success') {
        console.error(`Card ${action} failed:`, JSON.stringify(result.body))
        return json(
          { success: false, error: result.body?.message ?? `Unable to ${action} card` },
          502,
        )
      }

      if (action === 'freeze' || action === 'unfreeze' || action === 'terminate') {
        await admin
          .from('virtual_cards')
          .update({
            status:
              action === 'freeze'
                ? 'frozen'
                : action === 'unfreeze'
                  ? 'active'
                  : 'terminated',
          })
          .eq('id', card.id)
      }

      return json({ success: true, data: result.body?.data ?? null })
    }

    // ----------------------------------------------------------
    // Create / fund (money movement)
    // ----------------------------------------------------------
    const amount = Number(body?.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: 'Invalid amount' }, 400)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email, phone_number, date_of_birth, gender, bvn_verified')
      .eq('id', user.id)
      .maybeSingle()

    if (action === 'create' && !profile?.bvn_verified) {
      return json(
        {
          success: false,
          error: 'Please complete your BVN verification before issuing a card.',
          kyc_required: true,
        },
        403,
      )
    }

    if (action === 'fund') {
      const card = await ownedCard()
      if (!card) return json({ success: false, error: 'Card not found' }, 404)
    }

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
      _metadata: { action, card_id: cardId || null },
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
          ? await flw(`/virtual-cards/${cardId}/fund`, {
              method: 'POST',
              body: JSON.stringify({ debit_currency: 'NGN', amount }),
            })
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
                gender: profile?.gender === 'female' ? 'F' : 'M',
                date_of_birth: profile?.date_of_birth ?? '1990-01-01',
                callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-webhook`,
              }),
            })

      providerOk = result.ok && result.body?.status === 'success'
      providerBody = result.body
    } catch (error) {
      console.error('Flutterwave card request failed:', error)
    }

    // 3. Refund automatically when the provider fails
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

    const card = providerBody?.data ?? {}

    // 4. Persist the card / funding
    if (action === 'fund') {
      const existing = await ownedCard()
      if (existing) {
        await admin
          .from('virtual_cards')
          .update({
            amount_funded: Number(existing.amount_funded ?? 0) + amount,
          })
          .eq('id', existing.id)
      }
    } else {
      const maskedPan =
        card?.masked_pan ??
        (card?.card_pan
          ? `${String(card.card_pan).slice(0, 6)}******${String(card.card_pan).slice(-4)}`
          : null)

      const { error: insertError } = await admin.from('virtual_cards').upsert(
        {
          user_id: user.id,
          provider: 'flutterwave',
          provider_card_id: String(card?.id ?? reference),
          masked_pan: maskedPan,
          last4: card?.card_pan ? String(card.card_pan).slice(-4) : null,
          card_type: card?.card_type ?? 'virtual',
          currency: card?.currency ?? 'NGN',
          name_on_card: card?.name_on_card ?? `${firstname} ${lastname}`,
          expiry_month: card?.expiration
            ? String(card.expiration).slice(5, 7)
            : (card?.expiry_month ?? null),
          expiry_year: card?.expiration
            ? String(card.expiration).slice(0, 4)
            : (card?.expiry_year ?? null),
          status: 'active',
          amount_funded: amount,
          metadata: { reference },
        },
        { onConflict: 'provider,provider_card_id' },
      )

      if (insertError) console.error('Failed to save card:', insertError)
    }

    return json({
      success: true,
      reference,
      transaction_id: debit?.id ?? null,
      amount,
      card,
    })
  } catch (error: any) {
    console.error('Virtual card error:', error)
    return json(
      { success: false, error: error?.message ?? 'Unexpected error' },
      500,
    )
  }
})
