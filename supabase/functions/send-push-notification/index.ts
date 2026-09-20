import webpush from "npm:web-push@3.6.7";
import { GoogleAuth } from "npm:google-auth-library@9.15.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

type PushPayload = {
  notification_id?: string;
  user_id?: string;
  title?: string;
  message?: string;
  url?: string;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

async function sendAndroidPush(
  serviceAccount: FirebaseServiceAccount,
  deviceToken: string,
  title: string,
  message: string,
  url: string,
  notificationId: string | null,
) {
  const auth = new GoogleAuth({
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const client = await auth.getClient();
  const accessTokenResult = await client.getAccessToken();
  const accessToken =
    typeof accessTokenResult === "string"
      ? accessTokenResult
      : accessTokenResult?.token;

  if (!accessToken) {
    throw new Error("Unable to obtain Firebase OAuth access token");
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      serviceAccount.project_id,
    )}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: {
            title,
            body: message,
          },
          data: {
            title,
            body: message,
            url,
            notificationId: notificationId ?? "",
          },
          android: {
            priority: "high",
            notification: {
              channel_id: "iyanjupay_default",
              sound: "default",
            },
          },
        },
      }),
    },
  );

  const responseText = await response.text();

  let responseBody: any = null;

  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const errorCode =
      responseBody?.error?.details?.find(
        (detail: any) =>
          detail?.["@type"] ===
          "type.googleapis.com/google.firebase.fcm.v1.FcmError",
      )?.errorCode ??
      responseBody?.error?.status ??
      null;

    const error = new Error(
      `FCM request failed (${response.status}): ${
        responseBody?.error?.message ?? responseText
      }`,
    ) as Error & {
      statusCode?: number;
      fcmErrorCode?: string | null;
    };

    error.statusCode = response.status;
    error.fcmErrorCode = errorCode;

    throw error;
  }

  return responseBody;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-push-webhook-secret");
  const authHeader = req.headers.get("authorization") ?? "";

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const isServiceRole =
    !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

  if ((webhookSecret && suppliedSecret !== webhookSecret) && !isServiceRole) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = (await req.json().catch(() => null)) as PushPayload | null;

  if (!payload) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { error: "Supabase server configuration is incomplete" },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
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
    return json({
      success: true,
      skipped: "customer_push_notifications_disabled",
    });
  }

  if (notificationId) {
    const { data, error } = await admin
      .from("notifications")
      .select(
        "id,user_id,title,message,metadata,channel,delivery_status",
      )
      .eq("id", notificationId)
      .maybeSingle();

    if (error) {
      return json({ error: error.message }, 500);
    }

    if (!data) {
      return json({ error: "Notification not found" }, 404);
    }

    userId = data.user_id;
    notificationChannel = data.channel ?? "in_app";

    if (["email", "sms", "webhook"].includes(notificationChannel)) {
      return json({
        success: true,
        skipped: `channel_${notificationChannel}`,
      });
    }

    title = data.title;
    message = data.message;

    url =
      typeof data.metadata?.url === "string"
        ? data.metadata.url
        : "/";
  }

  if (!userId) {
    return json(
      { error: "user_id or notification_id is required" },
      400,
    );
  }

  /*
   * ------------------------------------------------------------
   * Firebase Android configuration
   * ------------------------------------------------------------
   */

  let firebaseServiceAccount: FirebaseServiceAccount | null = null;

  const firebaseServiceAccountJson = Deno.env.get(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
  );

  if (firebaseServiceAccountJson) {
    try {
      firebaseServiceAccount =
        JSON.parse(firebaseServiceAccountJson) as FirebaseServiceAccount;

      if (
        !firebaseServiceAccount.project_id ||
        !firebaseServiceAccount.client_email ||
        !firebaseServiceAccount.private_key
      ) {
        return json(
          {
            error:
              "FIREBASE_SERVICE_ACCOUNT_JSON is missing required Firebase service-account fields",
          },
          500,
        );
      }
    } catch {
      return json(
        {
          error: "FIREBASE_SERVICE_ACCOUNT_JSON contains invalid JSON",
        },
        500,
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * Web Push configuration
   * ------------------------------------------------------------
   */

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject =
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@iyanjupay.com";

  const webPushConfigured =
    !!vapidPublicKey && !!vapidPrivateKey;

  if (webPushConfigured) {
    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey!,
      vapidPrivateKey!,
    );
  }

  /*
   * ------------------------------------------------------------
   * Get Web + Android subscriptions
   * ------------------------------------------------------------
   */

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("user_push_subscriptions")
    .select(
      "id,platform,endpoint,p256dh,auth,device_token",
    )
    .eq("user_id", userId);

  if (subscriptionError) {
    return json(
      { error: subscriptionError.message },
      500,
    );
  }

  let delivered = 0;
  let attempted = 0;

  const staleIds: string[] = [];

  /*
   * ------------------------------------------------------------
   * Web Push
   * ------------------------------------------------------------
   */

  const webSubscriptions =
    subscriptions?.filter(
      (subscription) =>
        subscription.platform === "web" &&
        subscription.endpoint &&
        subscription.p256dh &&
        subscription.auth,
    ) ?? [];

  if (webPushConfigured) {
    const notificationPayload = JSON.stringify({
      title,
      body: message,
      url,
      notificationId,
    });

    for (const subscription of webSubscriptions) {
      attempted += 1;

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          notificationPayload,
        );

        delivered += 1;
      } catch (error) {
        const statusCode =
          (error as { statusCode?: number })?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(subscription.id);
        }
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * Android FCM
   * ------------------------------------------------------------
   */

  const androidSubscriptions =
    subscriptions?.filter(
      (subscription) =>
        subscription.platform === "android" &&
        !!subscription.device_token,
    ) ?? [];

  if (androidSubscriptions.length > 0 && !firebaseServiceAccount) {
    return json(
      {
        error:
          "Android push subscriptions exist, but FIREBASE_SERVICE_ACCOUNT_JSON is not configured",
      },
      500,
    );
  }

  if (firebaseServiceAccount) {
    for (const subscription of androidSubscriptions) {
      if (!subscription.device_token) continue;

      attempted += 1;

      try {
        await sendAndroidPush(
          firebaseServiceAccount,
          subscription.device_token,
          title,
          message,
          url,
          notificationId,
        );

        delivered += 1;
      } catch (error) {
        const fcmErrorCode =
          (error as { fcmErrorCode?: string | null })
            ?.fcmErrorCode;

        const statusCode =
          (error as { statusCode?: number })?.statusCode;

        /*
         * FCM marks tokens that are no longer registered as
         * UNREGISTERED. Remove them so future notifications
         * don't keep retrying dead tokens.
         */
        if (
          fcmErrorCode === "UNREGISTERED" ||
          statusCode === 404
        ) {
          staleIds.push(subscription.id);
        }
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * Remove stale subscriptions
   * ------------------------------------------------------------
   */

  if (staleIds.length) {
    await admin
      .from("user_push_subscriptions")
      .delete()
      .in("id", [...new Set(staleIds)]);
  }

  /*
   * ------------------------------------------------------------
   * Update notification delivery status
   * ------------------------------------------------------------
   */

  if (notificationId) {
    await admin
      .from("notifications")
      .update({
        delivery_status:
          delivered > 0 ? "delivered" : "failed",
        delivered_at:
          delivered > 0
            ? new Date().toISOString()
            : null,
        failed_at:
          delivered > 0
            ? null
            : new Date().toISOString(),
        last_attempt_at:
          new Date().toISOString(),
        delivery_attempts: attempted,
      })
      .eq("id", notificationId);
  }

  return json({
    success: true,
    delivered,
    attempted,
    web_attempted: webSubscriptions.length,
    android_attempted: androidSubscriptions.length,
    stale_removed: [...new Set(staleIds)].length,
  });
});
