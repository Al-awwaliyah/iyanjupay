import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const expectedHash = Deno.env.get('FLUTTERWAVE_WEBHOOK_HASH')
    if (expectedHash && req.headers.get('verif-hash') !== expectedHash) {
      return new Response('Invalid signature', { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    const data = payload?.data ?? {}
    const txRef: string | undefined = data.tx_ref
    const status: string | undefined = data.status
    const amount = Number(data.amount ?? 0)

    if (!txRef) return new Response('Missing tx_ref', { status: 400, headers: corsHeaders })

    // Re-verify with Flutterwave before crediting anything
    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
    let verified = false
    if (secretKey && data.id) {
      const vres = await fetch(`https://api.flutterwave.com/v3/transactions/${data.id}/verify`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      })
      const vjson = await vres.json()
      verified = vjson?.status === 'success' &&
        vjson?.data?.status === 'successful' &&
        vjson?.data?.tx_ref === txRef &&
        Number(vjson?.data?.amount) >= amount
    }

    if (status !== 'successful' || !verified) {
      await supabase.from('transactions')
        .update({ status: 'failed' })
        .eq('reference_number', txRef)
        .eq('status', 'pending')
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*, wallets(*)')
      .eq('reference_number', txRef)
      .single()

    if (error || !transaction) {
      console.error('Transaction not found:', txRef)
      return new Response('Transaction not found', { status: 404, headers: corsHeaders })
    }

    // Idempotency: only credit a pending transaction once
    if (transaction.status === 'completed') {
      return new Response('Already processed', { status: 200, headers: corsHeaders })
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'completed', description: `${transaction.description ?? 'Wallet funding'} - Flutterwave` })
      .eq('id', transaction.id)
      .eq('status', 'pending')
    if (updateError) {
      console.error('Failed to update transaction:', updateError)
      return new Response('Failed to update transaction', { status: 500, headers: corsHeaders })
    }

    const newBalance = Number(transaction.wallets?.balance ?? 0) + amount
    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', transaction.wallet_id)
    if (walletError) {
      console.error('Failed to update wallet:', walletError)
      return new Response('Failed to update wallet', { status: 500, headers: corsHeaders })
    }

    console.log(`Credited ${amount} for ${txRef}. New balance: ${newBalance}`)
    return new Response('OK', { status: 200, headers: corsHeaders })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders })
  }
})
