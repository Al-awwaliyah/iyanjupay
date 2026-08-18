import { corsHeaders, json, adminClient, getUser, flw } from '../_shared/auth.ts'

/**
 * BVN verification (KYC tier 1).
 *
 * Same money flow as every other paid operation:
 *   authenticate -> charge the verification fee through the ledger
 *   -> call Flutterwave -> refund automatically when it fails.
 *
 * Actions:
 *   { action: "status" }
 *   { action: "verify", bvn, first_name?, last_name?, date_of_birth? }
 */
const VERIFICATION_FEE = 50

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
    const action = String(body?.action ?? 'verify')

    const { data: profile } = await admin
      .from('profiles')
      .select(
        'id, full_name, phone_number, email, bvn, bvn_verified, bvn_verified_at, kyc_level, kyc_status',
      )
      .eq('id', user.id)
      .maybeSingle()

    if (action === 'status') {
      return json({
        success: true,
        verified: Boolean(profile?.bvn_verified),
        kyc_level: profile?.kyc_level ?? 1,
        kyc_status: profile?.kyc_status ?? 'unverified',
        bvn_masked: profile?.bvn
          ? `*******${String(profile.bvn).slice(-4)}`
          : null,
        fee: VERIFICATION_FEE,
      })
    }

    if (profile?.bvn_verified) {
      return json({
        success: true,
        already_verified: true,
        verified: true,
        kyc_level: profile?.kyc_level ?? 2,
      })
    }

    const bvn = String(body?.bvn ?? '').replace(/\D/g, '')
    if (bvn.length !== 11) {
      return json({ success: false, error: 'BVN must be 11 digits' }, 400)
    }

    const fullName = String(
      body?.full_name ?? profile?.full_name ?? '',
    ).trim()
    const firstName =
      String(body?.first_name ?? '').trim() || fullName.split(/\s+/)[0] || ''
    const lastName =
      String(body?.last_name ?? '').trim() ||
      fullName.split(/\s+/).slice(1).join(' ')

    if (!firstName || !lastName) {
      return json(
        { success: false, error: 'First name and last name are required' },
        400,
      )
    }

    const reference = `BVN_${crypto.randomUUID().replace(/-/g, '')}`

    // 1. Charge the verification fee through the ledger (server-side only).
    let feeCharged = false
    const { error: feeError } = await admin.rpc('charge_fee', {
      _user_id: user.id,
      _amount: VERIFICATION_FEE,
      _description: 'BVN verification fee',
      _idempotency_key: reference,
      _reference: reference,
    })

    if (feeError) {
      const message = String(feeError.message ?? '')
      // A brand-new user usually has a zero balance: allow the first
      // verification for free so KYC never blocks onboarding.
      if (!message.includes('Insufficient')) {
        console.error('charge_fee failed:', feeError)
        return json(
          { success: false, error: 'Unable to charge the verification fee' },
          400,
        )
      }
      console.log('Wallet balance too low for BVN fee, waiving it')
    } else {
      feeCharged = true
    }

    // 2. Verify with Flutterwave.
    let providerOk = false
    let providerBody: any = null

    try {
      const result = await flw('/bvn/verifications', {
        method: 'POST',
        body: JSON.stringify({
          bvn,
          firstname: firstName,
          lastname: lastName,
          redirect_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-webhook`,
        }),
      })

      providerOk = result.ok && result.body?.status === 'success'
      providerBody = result.body
    } catch (error) {
      console.error('Flutterwave BVN request failed:', error)
    }

    // 3. Refund the fee when the provider rejects the verification.
    if (!providerOk) {
      console.error('BVN verification failed:', JSON.stringify(providerBody))

      if (feeCharged) {
        const { error: refundError } = await admin.rpc('refund_wallet', {
          _user_id: user.id,
          _amount: VERIFICATION_FEE,
          _description: 'BVN verification fee reversal',
          _idempotency_key: `REFUND_${reference}`,
          _reference: `REFUND_${reference}`,
          _metadata: { original_reference: reference, reason: 'bvn_failed' },
        })
        if (refundError) console.error('refund_wallet failed:', refundError)
      }

      await admin
        .from('profiles')
        .upsert({
          id: user.id,
          bvn,
          kyc_status: 'failed',
          updated_at: new Date().toISOString(),
        })

      return json(
        {
          success: false,
          error:
            providerBody?.message ??
            'We could not verify this BVN. Please check the details and try again.',
          refunded: feeCharged,
        },
        400,
      )
    }

    // 4. Persist the verification result.
    const { error: profileError } = await admin.from('profiles').upsert({
      id: user.id,
      bvn,
      bvn_first_name: firstName,
      bvn_last_name: lastName,
      bvn_verified: true,
      bvn_verified_at: new Date().toISOString(),
      kyc_status: 'verified',
      kyc_level: Math.max(2, Number(profile?.kyc_level ?? 1)),
      full_name: profile?.full_name || `${firstName} ${lastName}`,
      email: profile?.email || user.email,
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      console.error('Failed to save BVN verification:', profileError)
      return json(
        { success: false, error: 'Unable to save your verification' },
        500,
      )
    }

    return json({
      success: true,
      verified: true,
      kyc_level: Math.max(2, Number(profile?.kyc_level ?? 1)),
      fee_charged: feeCharged ? VERIFICATION_FEE : 0,
      reference,
      data: providerBody?.data ?? null,
    })
  } catch (error: any) {
    console.error('BVN verification error:', error)
    return json(
      { success: false, error: error?.message ?? 'Unexpected error' },
      500,
    )
  }
})
