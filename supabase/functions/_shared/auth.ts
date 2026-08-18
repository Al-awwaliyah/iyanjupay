import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export const adminClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

/** Validates the caller's JWT in-code and returns the authenticated user. */
export async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data, error } = await client.auth.getUser()
  if (error) return null
  return data.user
}

export const FLW_BASE = 'https://api.flutterwave.com/v3'

/**
 * Calls the Flutterwave v3 API.
 *
 * When FLUTTERWAVE_PROXY_URL is configured the request is tunnelled through
 * the fixed-IP proxy so that IP-whitelisted endpoints (transfers, BVN,
 * card issuing, bills) are accepted by Flutterwave.
 */
export async function flw(path: string, init: RequestInit = {}) {
  const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
  if (!secretKey) throw new Error('Flutterwave is not configured')

  const proxyUrl = Deno.env.get('FLUTTERWAVE_PROXY_URL')
  const proxySecret = Deno.env.get('FLUTTERWAVE_PROXY_SECRET')

  if (proxyUrl) {
    try {
      const res = await fetch(proxyUrl.replace(/\/$/, ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(proxySecret ? { 'x-proxy-secret': proxySecret } : {}),
        },
        body: JSON.stringify({
          path,
          method: init.method ?? 'GET',
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) return { ok: res.ok, status: res.status, body }
      console.error('Flutterwave proxy failed, falling back to direct call', res.status)
    } catch (error) {
      console.error('Flutterwave proxy error, falling back to direct call', error)
    }
  }

  const res = await fetch(`${FLW_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}
