
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MonnifyPaymentRequest {
  amount: number
  customerName: string
  customerEmail: string
  paymentReference: string
  paymentDescription: string
  redirectUrl?: string
  webhookUrl?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from token
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { amount, customerName, customerEmail, paymentReference, paymentDescription, redirectUrl, webhookUrl }: MonnifyPaymentRequest = await req.json()

    // Get Monnify credentials from secrets
    const monnifyApiKey = Deno.env.get('MONNIFY_API_KEY')
    const monnifySecretKey = Deno.env.get('MONNIFY_SECRET_KEY')
    const contractCode = '0370219953'
    
    if (!monnifyApiKey || !monnifySecretKey) {
      return new Response(
        JSON.stringify({ error: 'Monnify credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Basic Auth header
    const credentials = btoa(`${monnifyApiKey}:${monnifySecretKey}`)
    
    // First, get access token
    const tokenResponse = await fetch('https://sandbox.monnify.com/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to authenticate with Monnify')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.responseBody.accessToken

    // Create payment transaction
    const paymentPayload = {
      amount,
      customerName,
      customerEmail,
      paymentReference,
      paymentDescription,
      currencyCode: 'NGN',
      contractCode,
      redirectUrl: redirectUrl || `${req.headers.get('origin')}/payment/success`,
      paymentMethods: ['CARD', 'ACCOUNT_TRANSFER', 'USSD', 'PHONE_NUMBER'],
      incomeSplitConfig: []
    }

    const paymentResponse = await fetch('https://sandbox.monnify.com/api/v1/merchant/transactions/init-transaction', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentPayload)
    })

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text()
      console.error('Monnify payment error:', errorText)
      throw new Error('Failed to initialize payment')
    }

    const paymentData = await paymentResponse.json()
    
    // Fetch the user's wallet so the webhook can credit it later
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (walletError) {
      console.error('Wallet fetch error:', walletError)
    }

    // Store transaction in database
    const { error: dbError } = await supabaseClient
      .from('transactions')
      .insert({
        user_id: user.id,
        wallet_id: wallet?.id,
        transaction_type: 'wallet_funding',
        amount: amount,
        description: paymentDescription,
        reference_number: paymentReference,
        status: 'pending'
      })

    if (dbError) {
      console.error('Database error:', dbError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: paymentData.responseBody,
        checkoutUrl: paymentData.responseBody.checkoutUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
