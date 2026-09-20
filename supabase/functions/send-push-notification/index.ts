import webpush from "npm:web-push@3.6.7";
import { SignJWT, importPKCS8 } from "npm:jose@5.10.0";
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

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}) {
  const key = await importPKCS8(serviceAccount.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`FCM OAuth token request failed: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

async function sendAndroidPush(token: string, title: string, message: string, url: string, notificationId: string | null) {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return { configured: false, delivered: false, stale: false };

  const serviceAccount = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body: message },
        data: { url, notificationId: notificationId ?? "" },
        android: {
          priority: "HIGH",
          notification: { sound: "default", channel_id: "iyanjupay-default" },
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  const errorCode = body?.error?.details?.find((d: any) => d?.errorCode)?.errorCode;
  const stale = response.status === 404 || response.status === 410 || errorCode === "UNREGISTERED";
  if (!response.ok && !stale) console.error("FCM delivery failed:", response.status, body);
  return { configured: true, delivered: response.ok, stale };
}

async function sendIosPush(token: string, title: string, message: string, url: string, notificationId: string | null) {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.iyanjupay.app";
  if (!keyId || !teamId || !privateKey) return { configured: false, delivered: false, stale: false };

  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .sign(key);

  const production = Deno.env.get("APNS_PRODUCTION") !== "false";
  const host = production ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title, body: message }, sound: "default" },
      url,
      notificationId: notificationId ?? "",
    }),
  });

  const body = await response.json().catch(() => ({}));
  const stale = response.status === 410 || body?.reason === "Unregistered" || body?.reason === "BadDeviceToken";
  if (!response.ok && !stale) console.error("APNs delivery failed:", response.status, body);
  return { configured: true, delivered: response.ok, stale };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-push-webhook-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if ((webhookSecret && suppliedSecret !== webhookSecret) && !isServiceRole) return json({ error: "Unauthorized" }, 401);

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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let title = payload.title ?? "IyanjuPay";
  let message = payload.message ?? "You have a new notification.";
  let url = payload.url ?? "/";
  let userId = payload.user_id ?? null;
  let notificationId = payload.notification_id ?? null;
  let notificationChannel = "in_app";

  const { data: pushSetting } = await admin.from("customer_app_settings").select("value").eq("setting_key", "customerPushNotifications").maybeSingle();
  if (pushSetting && pushSetting.value === false) return json({ success: true, skipped: "customer_push_notifications_disabled" });

  if (notificationId) {
    const { data, error } = await admin.from("notifications").select("id,user_id,title,message,metadata,channel,delivery_status").eq("id", notificationId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Notification not found" }, 404);
    userId = data.user_id;
    notificationChannel = data.channel ?? "in_app";
    if (["email", "sms", "webhook"].includes(notificationChannel)) return json({ success: true, skipped: `channel_${notificationChannel}` });
    title = data.title;
    message = data.message;
    url = typeof data.metadata?.url === "string" ? data.metadata.url : "/";
  }

  if (!userId) return json({ error: "user_id or notification_id is required" }, 400);

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("user_push_subscriptions")
    .select("id,platform,endpoint,p256dh,auth,device_token")
    .eq("user_id", userId);
  if (subscriptionError) return json({ error: subscriptionError.message }, 500);

  let delivered = 0;
  const staleIds: string[] = [];
  let webConfigured = Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
  if (webConfigured) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@iyanjupay.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  for (const subscription of subscriptions ?? []) {
    try {
      if (subscription.platform === "web") {
        if (!webConfigured || !subscription.endpoint || !subscription.p256dh || !subscription.auth) continue;
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body: message, url, notificationId }));
        delivered += 1;
      } else if (subscription.platform === "android" && subscription.device_token) {
        const result = await sendAndroidPush(subscription.device_token, title, message, url, notificationId);
        if (result.delivered) delivered += 1;
        if (result.stale) staleIds.push(subscription.id);
      } else if (subscription.platform === "ios" && subscription.device_token) {
        const result = await sendIosPush(subscription.device_token, title, message, url, notificationId);
        if (result.delivered) delivered += 1;
        if (result.stale) staleIds.push(subscription.id);
      }
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
      console.error("Push delivery error:", error);
    }
  }

  if (staleIds.length) await admin.from("user_push_subscriptions").delete().in("id", staleIds);

  if (notificationId) {
    await admin.from("notifications").update({
      delivery_status: delivered > 0 ? "delivered" : "failed",
      delivered_at: delivered > 0 ? new Date().toISOString() : null,
      failed_at: delivered > 0 ? null : new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      delivery_attempts: subscriptions?.length ?? 0,
    }).eq("id", notificationId);
  }

  return json({ success: true, delivered, stale_removed: staleIds.length });
});
