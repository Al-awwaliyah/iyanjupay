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

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getFirebaseAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(signature)}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    throw new Error(`Firebase OAuth token request failed (${tokenResponse.status}): ${details}`);
  }

  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Firebase OAuth response did not contain an access token.");
  return token.access_token;
}

function readFirebaseServiceAccount() {
  const encoded = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!encoded && !raw) return null;

  try {
    const jsonText = encoded
      ? new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)))
      : raw!;
    const parsed = JSON.parse(jsonText);
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      throw new Error("Firebase service account is missing client_email, private_key, or project_id.");
    }
    return parsed as { client_email: string; private_key: string; project_id: string };
  } catch (error) {
    throw new Error(`Invalid Firebase service-account configuration: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function sendFirebaseNotification(params: {
  token: string;
  title: string;
  message: string;
  url: string;
  notificationId: string | null;
  type: string | null;
  transactionId: string | null;
}) {
  const serviceAccount = readFirebaseServiceAccount();
  if (!serviceAccount) return { delivered: false, skipped: "firebase_not_configured" };

  const accessToken = await getFirebaseAccessToken(serviceAccount);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: params.token,
          notification: {
            title: params.title,
            body: params.message,
          },
          data: {
            url: params.url,
            notificationId: params.notificationId ?? "",
            type: params.type ?? "",
            transactionId: params.transactionId ?? "",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "iyanjupay_notifications",
              sound: "default",
            },
          },
        },
      }),
    },
  );

  if (response.ok) return { delivered: true };

  const details = await response.text();
  const error = new Error(`Firebase notification failed (${response.status}): ${details}`) as Error & { statusCode?: number };
  error.statusCode = response.status;
  throw error;
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
  let notificationType: string | null = null;
  let transactionId: string | null = null;
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
      .select("id,user_id,title,message,metadata,channel,delivery_status,type,transaction_id")
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
    notificationType = data.type ?? null;
    transactionId = data.transaction_id ?? null;
    url = typeof data.metadata?.url === "string"
      ? data.metadata.url
      : `/notifications/${data.id}`;
  }

  if (!userId) return json({ error: "user_id or notification_id is required" }, 400);

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("user_push_subscriptions")
    .select("id,platform,endpoint,p256dh,auth,device_token")
    .eq("user_id", userId);

  if (subscriptionError) return json({ error: subscriptionError.message }, 500);

  let webDelivered = 0;
  let nativeDelivered = 0;
  let attempts = 0;
  const staleIds: string[] = [];
  const errors: string[] = [];
  const webSubscriptions = (subscriptions ?? []).filter((item) => item.platform === "web");
  const nativeSubscriptions = (subscriptions ?? []).filter((item) => item.platform === "android");

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (vapidPublicKey && vapidPrivateKey && webSubscriptions.length) {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@iyanjupay.com",
      vapidPublicKey,
      vapidPrivateKey,
    );

    const notificationPayload = JSON.stringify({
      title,
      body: message,
      url,
      notificationId,
      type: notificationType,
      transactionId,
    });

    for (const subscription of webSubscriptions) {
      if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) continue;
      attempts += 1;
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, notificationPayload);
        webDelivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
        errors.push(`web:${statusCode ?? "unknown"}`);
      }
    }
  }

  for (const subscription of nativeSubscriptions) {
    if (!subscription.device_token) continue;
    attempts += 1;
    try {
      const result = await sendFirebaseNotification({
        token: subscription.device_token,
        title,
        message,
        url,
        notificationId,
        type: notificationType,
        transactionId,
      });
      if (result.delivered) nativeDelivered += 1;
      else if (result.skipped) errors.push(`android:${result.skipped}`);
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 400) staleIds.push(subscription.id);
      errors.push(`android:${statusCode ?? "unknown"}`);
    }
  }

  if (staleIds.length) {
    await admin.from("user_push_subscriptions").delete().in("id", [...new Set(staleIds)]);
  }

  const delivered = webDelivered + nativeDelivered;
  if (notificationId) {
    await admin.from("notifications").update({
      delivery_status: delivered > 0 ? "delivered" : "failed",
      delivered_at: delivered > 0 ? new Date().toISOString() : null,
      failed_at: delivered > 0 ? null : new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      delivery_attempts: attempts,
      last_error: errors.length ? errors.join(", ") : null,
    }).eq("id", notificationId);
  }

  return json({
    success: true,
    delivered,
    web_delivered: webDelivered,
    android_delivered: nativeDelivered,
    attempts,
    stale_removed: [...new Set(staleIds)].length,
    errors,
  });
});
