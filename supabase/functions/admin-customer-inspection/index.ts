import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ success: false, error: "Server configuration error." }, 500);

  const authorization = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ success: false, error: "Authentication required." }, 401);

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return json({ success: false, error: "Your session is invalid or expired. Sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    if (action === "start") {
      const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
      if (!targetUserId) return json({ success: false, error: "Customer ID is required." }, 400);
      rpcName = "start_admin_customer_inspection";
      rpcArgs = { p_target_user_id: targetUserId };
    } else if (action === "read") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      if (!sessionId) return json({ success: false, error: "Inspection session ID is required." }, 400);
      rpcName = "get_admin_customer_inspection";
      rpcArgs = { p_session_id: sessionId };
    } else if (action === "end") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      if (!sessionId) return json({ success: false, error: "Inspection session ID is required." }, 400);
      rpcName = "end_admin_customer_inspection";
      rpcArgs = { p_session_id: sessionId };
    } else {
      return json({ success: false, error: "Unsupported inspection action." }, 400);
    }

    // The SQL RPC independently validates admin role, session ownership and expiry.
    const { data, error } = await client.rpc(rpcName, rpcArgs);
    if (error) {
      console.error("admin-customer-inspection RPC failed", { action, code: error.code, message: error.message });
      const status = error.code === "42501" ? 403 : error.code === "28000" ? 401 : 400;
      return json({ success: false, error: error.message || "Unable to complete inspection action." }, status);
    }

    return json({ success: true, data });
  } catch (error) {
    console.error("admin-customer-inspection unexpected failure", error);
    return json({ success: false, error: "Unable to complete the customer inspection request." }, 500);
  }
});
