import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;

function respond(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return respond({ success: false, error: "Server configuration error." }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond({ success: false, error: "Administrator authentication is required." }, 401);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      return respond({ success: false, error: "Your administrator session is invalid or expired." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "start") {
      const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
      if (!targetUserId) return respond({ success: false, error: "A customer account ID is required." }, 400);

      const { data: sessionId, error: startError } = await client.rpc(
        "admin_customer_inspection_start",
        { p_target_user_id: targetUserId },
      );
      if (startError || typeof sessionId !== "string") {
        console.error("Inspection start failed:", startError?.message ?? "No session ID returned");
        return respond({ success: false, error: startError?.message ?? "Unable to start read-only inspection." }, 403);
      }

      const { data: dashboard, error: dashboardError } = await client.rpc(
        "admin_customer_inspection_dashboard",
        { p_session_id: sessionId },
      );
      if (dashboardError || !dashboard) {
        await client.rpc("admin_customer_inspection_end", { p_session_id: sessionId });
        console.error("Inspection dashboard load failed:", dashboardError?.message ?? "No data returned");
        return respond({ success: false, error: "Unable to load the customer's dashboard." }, 403);
      }

      return respond({ success: true, sessionId, dashboard });
    }

    if (action === "read") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) return respond({ success: false, error: "An inspection session ID is required." }, 400);
      const { data: dashboard, error } = await client.rpc(
        "admin_customer_inspection_dashboard",
        { p_session_id: sessionId },
      );
      if (error || !dashboard) {
        return respond({ success: false, error: "Inspection session is unavailable or has expired." }, 403);
      }
      return respond({ success: true, dashboard });
    }

    if (action === "end") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) return respond({ success: false, error: "An inspection session ID is required." }, 400);
      const { data: ended, error } = await client.rpc(
        "admin_customer_inspection_end",
        { p_session_id: sessionId },
      );
      if (error || ended !== true) {
        return respond({ success: false, error: "Unable to end this inspection session." }, 403);
      }
      return respond({ success: true, ended: true });
    }

    return respond({ success: false, error: "Unsupported inspection action." }, 400);
  } catch (error) {
    console.error("Admin customer inspection error:", error instanceof Error ? error.message : "Unknown error");
    return respond({ success: false, error: "The inspection request could not be completed." }, 500);
  }
});
