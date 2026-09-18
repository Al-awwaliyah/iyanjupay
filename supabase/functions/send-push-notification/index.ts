import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-push-webhook-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  if ((webhookSecret && suppliedSecret !== webhookSecret) && !isServiceRole) {
    return json({ error: "Unauthorized" }, 401);
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@iyanjupay.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Web push VAPID keys are not configured" }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payload = await req.json().catch(() => null) as {
    notification_id?: string;
    user_id?: string;
    title?: string;
    message?: string;
    url?: string;
  } | null;

  if (!payload) return json({ error: "Invalid JSON body" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase server configuration is incomplete" }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let title = payload.title ?? "IyanjuPay";
  let message = payload.message ?? "You have a new notification.";
  let url = payload.url ?? "/";
  let userId = payload.user_id ?? null;
  let notificationId = payload.notification_id ?? null;
  let notificationChannel = "in_app";

  const { data: pushSetting } = await admin
    .from("customer_app_settings")
    .select("value")
    .eq("setting_key", "customerPushNotifications")
    .maybeSingle();
  if (pushSetting && pushSetting.value === false) {
    return json({ success: true, skipped: "customer_push_notifications_disabled" });
  }

  if (notificationId) {
    const { data, error } = await admin
      .from("notifications")
      .select("id,user_id,title,message,metadata,channel,delivery_status")
      .eq("id", notificationId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Notification not found" }, 404);
    userId = data.user_id;
    notificationChannel = data.channel ?? "in_app";
    if (["email", "sms", "webhook"].includes(notificationChannel)) {
      return json({ success: true, skipped: `channel_${notificationChannel}` });
    }
    title = data.title;
    message = data.message;
    url = typeof data.metadata?.url === "string" ? data.metadata.url : "/";
  }

  if (!userId) return json({ error: "user_id or notification_id is required" }, 400);

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("user_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId)
    .eq("platform", "web");

  if (subscriptionError) return json({ error: subscriptionError.message }, 500);

  let delivered = 0;
  const staleIds: string[] = [];
  const notificationPayload = JSON.stringify({ title, body: message, url, notificationId });

  for (const subscription of subscriptions ?? []) {
    if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) continue;
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, notificationPayload);
      delivered += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
    }
  }

  if (staleIds.length) {
    await admin.from("user_push_subscriptions").delete().in("id", staleIds);
  }

  if (notificationId) {
    await admin.from("notifications").update({
      delivery_status: delivered > 0 ? "delivered" : "failed",
      delivered_at: delivered > 0 ? new Date().toISOString() : null,
      failed_at: delivered > 0 ? null : new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      delivery_attempts: (subscriptions?.length ?? 0),
    }).eq("id", notificationId);
  }

  return json({ success: true, delivered, stale_removed: staleIds.length });
});
