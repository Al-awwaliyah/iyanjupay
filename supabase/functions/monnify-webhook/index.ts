
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const webhookData = await req.json()
    console.log('Monnify webhook received:', webhookData)

    const { 
      transactionReference, 
      paymentReference, 
      amountPaid, 
      totalPayable,
      settlementAmount,
      paidOn,
      paymentStatus,
      paymentDescription,
      transactionHash,
      currency,
      paymentMethod,
      customer
    } = webhookData

    if (paymentStatus === 'PAID') {
      // Find the transaction by reference
      const { data: transaction, error: fetchError } = await supabaseClient
        .from('transactions')
        .select('*, wallets(*)')
        .eq('reference_number', paymentReference)
        .single()

      if (fetchError || !transaction) {
        console.error('Transaction not found:', paymentReference)
        return new Response('Transaction not found', { status: 404 })
      }

      // Update transaction status
      const { error: updateError } = await supabaseClient
        .from('transactions')
        .update({
          status: 'completed',
          description: `${paymentDescription} - Paid via ${paymentMethod}`
        })
        .eq('reference_number', paymentReference)

      if (updateError) {
        console.error('Failed to update transaction:', updateError)
        return new Response('Failed to update transaction', { status: 500 })
      }

      // Update wallet balance
      const newBalance = Number(transaction.wallets.balance) + Number(amountPaid)
      const { error: walletError } = await supabaseClient
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', transaction.wallet_id)

      if (walletError) {
        console.error('Failed to update wallet:', walletError)
        return new Response('Failed to update wallet', { status: 500 })
      }

      console.log(`Payment successful: ${paymentReference}, Amount: ${amountPaid}, New Balance: ${newBalance}`)
    }

    return new Response('OK', { status: 200 })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
