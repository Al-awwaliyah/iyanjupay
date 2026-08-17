import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * Bill payments (airtime, data, electricity, cable, etc.)
 *
 * Uses the exact same money flow as send money:
 *   authenticate -> debit wallet through the ledger -> call Flutterwave
 *   -> refund the wallet automatically when the provider fails.
 *
 * Actions:
 *   { action: "categories" }
 *   { action: "pay", biller_code, item_code, customer, amount, country? }
 *   { action: "status", reference }
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

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'pay')

    // ----------------------------------------------------------
    // Catalogue
    // ----------------------------------------------------------
    if (action === 'categories') {
      const { ok, body: result } = await flw('/bill-categories?country=NG')

      if (!ok || result?.status !== 'success') {
        return json({ success: false, error: 'Unable to load billers' }, 502)
      }

      return json({ success: true, categories: result.data ?? [] })
    }

    const admin = adminClient()
    

    // ----------------------------------------------------------
    // Status lookup
    // ----------------------------------------------------------
    if (action === 'status') {
      const reference = String(body?.reference ?? '').trim()
      if (!reference) {
        return json({ success: false, error: 'reference is required' }, 400)
      }

      const { data: txn } = await admin
        .from('transactions')
        .select('id, status, amount, description, reference_number, metadata')
        .eq('user_id', user.id)
        .eq('reference_number', reference)
        .maybeSingle()

      return json({ success: true, transaction: txn ?? null })
    }

    // ----------------------------------------------------------
    // Pay a bill
    // ----------------------------------------------------------
    const billerCode = String(body?.biller_code ?? '').trim()
    const itemCode = String(body?.item_code ?? '').trim()
    const customer = String(body?.customer ?? '').trim()
    const amount = Number(body?.amount ?? 0)
    const country = String(body?.country ?? 'NG').trim()

    if (!billerCode || !itemCode) {
      return json(
        { success: false, error: 'biller_code and item_code are required' },
        400,
      )
    }

    if (!customer) {
      return json({ success: false, error: 'customer is required' }, 400)
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: 'Invalid amount' }, 400)
    }

    const reference = `BILL_${crypto.randomUUID().replace(/-/g, '')}`

    // 1. Debit the wallet first (ledger is the source of truth)
    const { data: debit, error: debitError } = await admin.rpc('debit_wallet', {
      _user_id: user.id,
      _amount: amount,
      _description: `Bill payment (${itemCode})`,
      _idempotency_key: reference,
      _reference: reference,
      _category: 'bill_payment',
      _metadata: { biller_code: billerCode, item_code: itemCode, customer },
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

    // 2. Send the bill to Flutterwave
    let providerOk = false
    let providerBody: any = null

    try {
      const result = await flw('/bills', {
        method: 'POST',
        body: JSON.stringify({
          country,
          customer,
          amount,
          type: itemCode,
          reference,
          biller_code: billerCode,
        }),
      })

      providerOk = result.ok && result.body?.status === 'success'
      providerBody = result.body
    } catch (error) {
      console.error('Flutterwave bill request failed:', error)
    }

    // 3. Refund automatically when the provider did not accept it
    if (!providerOk) {
      console.error('Bill payment failed:', JSON.stringify(providerBody))

      const { error: refundError } = await admin.rpc('refund_wallet', {
        _user_id: user.id,
        _amount: amount,
        _description: 'Bill payment reversal',
        _idempotency_key: `REFUND_${reference}`,
        _reference: `REFUND_${reference}`,
        _metadata: { original_reference: reference, reason: 'bill_failed' },
      })

      if (refundError) console.error('refund_wallet failed:', refundError)

      return json(
        {
          success: false,
          error:
            providerBody?.message ??
            'Bill payment failed. Your wallet has been refunded.',
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
      data: providerBody?.data ?? null,
    })
  } catch (error: any) {
    console.error('Bill payment error:', error)
    return json(
      { success: false, error: error?.message ?? 'Unexpected error' },
      500,
    )
  }
})
