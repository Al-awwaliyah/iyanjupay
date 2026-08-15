import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const amount = Number(body?.amount)
    const paymentReference: string = body?.paymentReference ?? `IYJ_${Date.now()}_${user.id.slice(0, 8)}`
    const paymentDescription: string = body?.paymentDescription ?? 'Wallet funding'
    const redirectUrl: string = body?.redirectUrl ?? `${req.headers.get('origin') ?? ''}/`
    const customerName: string = body?.customerName ?? 'Customer'

    if (!Number.isFinite(amount) || amount < 100) {
      return new Response(JSON.stringify({ error: 'Amount must be at least ₦100' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'Flutterwave not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref: paymentReference,
        amount,
        currency: 'NGN',
        redirect_url: redirectUrl,
        payment_options: 'card,banktransfer,ussd,account',
        customer: {
          email: user.email ?? 'customer@example.com',
          name: customerName,
        },
        customizations: {
          title: 'IyanjuPay',
          description: paymentDescription,
          logo: `${req.headers.get('origin') ?? ''}/icon-192.png`,
        },
      }),
    })

    const flwData = await flwRes.json()
    if (!flwRes.ok || flwData?.status !== 'success') {
      console.error('Flutterwave init error:', JSON.stringify(flwData))
      return new Response(JSON.stringify({ error: flwData?.message ?? 'Failed to initialize payment' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: wallet } = await supabaseClient
      .from('wallets').select('id').eq('user_id', user.id).single()

    const { error: dbError } = await supabaseClient.from('transactions').insert({
      user_id: user.id,
      wallet_id: wallet?.id,
      transaction_type: 'wallet_funding',
      amount,
      description: paymentDescription,
      reference_number: paymentReference,
      status: 'pending',
    })
    if (dbError) console.error('Database error:', dbError)

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: flwData.data.link,
      reference: paymentReference,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
