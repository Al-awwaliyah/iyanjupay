import webpush from "npm:web-push@3.6.7";
import { GoogleAuth } from "npm:google-auth-library@9.15.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import {
  importPKCS8,
  SignJWT,
} from "npm:jose@6.0.10";
import {
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

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

/**
 * Decodes a Base64URL string into bytes.
 *
 * Used for VAPID key diagnostics only.
 */
function decodeBase64Url(
  value: string,
): Uint8Array {
  const padding = "=".repeat(
    (4 - (value.length % 4)) % 4,
  );

  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary =
    atob(base64);

  return Uint8Array.from(
    binary,
    (character) =>
      character.charCodeAt(0),
  );
}

/**
 * Verifies that the configured VAPID private key
 * mathematically corresponds to the configured
 * VAPID public key.
 *
 * IMPORTANT:
 * No private-key material is ever logged.
 */
function verifyVapidKeyPair(
  vapidPublicKey: string | undefined,
  vapidPrivateKey: string | undefined,
): boolean {
  if (
    !vapidPublicKey ||
    !vapidPrivateKey
  ) {
    return false;
  }

  try {
    const privateKeyBytes =
      decodeBase64Url(
        vapidPrivateKey,
      );

    const configuredPublicKeyBytes =
      decodeBase64Url(
        vapidPublicKey,
      );

    if (
      privateKeyBytes.length !== 32 ||
      configuredPublicKeyBytes.length !== 65
    ) {
      return false;
    }

    /*
     * Build a SEC1 EC private-key structure
     * around the raw 32-byte P-256 private key.
     *
     * Structure:
     *
     * SEQUENCE
     *   INTEGER 1
     *   OCTET STRING <32-byte private key>
     *   [0]
     *     OID prime256v1
     */
    const sec1Prefix = new Uint8Array([
      0x30,
      0x31,
      0x02,
      0x01,
      0x01,
      0x04,
      0x20,
    ]);

    const sec1Parameters = new Uint8Array([
      0xa0,
      0x0a,
      0x06,
      0x08,
      0x2a,
      0x86,
      0x48,
      0xce,
      0x3d,
      0x03,
      0x01,
      0x07,
    ]);

    const sec1Der = new Uint8Array(
      sec1Prefix.length +
        privateKeyBytes.length +
        sec1Parameters.length,
    );

    sec1Der.set(
      sec1Prefix,
      0,
    );

    sec1Der.set(
      privateKeyBytes,
      sec1Prefix.length,
    );

    sec1Der.set(
      sec1Parameters,
      sec1Prefix.length +
        privateKeyBytes.length,
    );

    const privateKeyObject =
      createPrivateKey({
        key: sec1Der,
        format: "der",
        type: "sec1",
      });

    const derivedPublicKeyObject =
      createPublicKey(
        privateKeyObject,
      );

    const derivedPublicKeyDer =
      derivedPublicKeyObject.export({
        format: "der",
        type: "spki",
      });

    /*
     * For a P-256 SPKI public key, the final
     * 65 bytes contain:
     *
     * 04 || X || Y
     *
     * which is the raw uncompressed VAPID
     * public key format.
     */
    const derivedPublicKeyBytes =
      new Uint8Array(
        derivedPublicKeyDer,
      ).slice(-65);

    if (
      derivedPublicKeyBytes.length !== 65
    ) {
      return false;
    }

    for (
      let index = 0;
      index < 65;
      index += 1
    ) {
      if (
        derivedPublicKeyBytes[index] !==
        configuredPublicKeyBytes[index]
      ) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(
      "VAPID key-pair verification failed:",
      error instanceof Error
        ? error.message
        : "Unknown error",
    );

    return false;
  }
}

type NotificationRecord = {
  id?: string;
  user_id?: string | null;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  transaction_id?: string | null;
  metadata?: Record<string, unknown> | null;
  channel?: string | null;
};

type PushPayload = {
  notification_id?: string;
  user_id?: string;
  title?: string;
  message?: string;
  url?: string;
  type?: string;
  transaction_id?: string;
  record?: NotificationRecord | null;
  old_record?: NotificationRecord | null;
  table?: string;
  schema?: string;
  event?: string;
  [key: string]: unknown;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type ApnsError = Error & {
  statusCode?: number;
  apnsReason?: string | null;
};

async function sendAndroidPush(
  serviceAccount: FirebaseServiceAccount,
  deviceToken: string,
  title: string,
  message: string,
  url: string,
  notificationId: string | null,
  type: string | null,
  transactionId: string | null,
) {
  const auth = new GoogleAuth({
    credentials: {
      client_email:
        serviceAccount.client_email,
      private_key:
        serviceAccount.private_key,
    },
    scopes: [
      "https://www.googleapis.com/auth/firebase.messaging",
    ],
  });

  const client =
    await auth.getClient();

  const accessTokenResult =
    await client.getAccessToken();

  const accessToken =
    typeof accessTokenResult === "string"
      ? accessTokenResult
      : accessTokenResult?.token;

  if (!accessToken) {
    throw new Error(
      "Unable to obtain Firebase OAuth access token",
    );
  }

  const response =
    await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        serviceAccount.project_id,
      )}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
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
              notificationId:
                notificationId ?? "",
              type:
                type ?? "",
              transactionId:
                transactionId ?? "",
            },

            android: {
              priority: "high",
              notification: {
                channel_id:
                  "iyanjupay-default",
                sound: "default",
              },
            },
          },
        }),
      },
    );

  const responseText =
    await response.text();

  let responseBody: any = null;

  try {
    responseBody = responseText
      ? JSON.parse(responseText)
      : null;
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

    const error =
      new Error(
        `FCM request failed (${response.status}): ${
          responseBody?.error?.message ??
          responseText
        }`,
      ) as Error & {
        statusCode?: number;
        fcmErrorCode?: string | null;
      };

    error.statusCode =
      response.status;

    error.fcmErrorCode =
      errorCode;

    throw error;
  }

  return responseBody;
}

async function createApnsJwt(
  key: string,
  keyId: string,
  teamId: string,
) {
  const normalizedKey =
    key.replace(/\\n/g, "\n");

  const privateKey =
    await importPKCS8(
      normalizedKey,
      "ES256",
    );

  return await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: keyId,
    })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("55m")
    .sign(privateKey);
}

async function sendIosPush(
  key: string,
  keyId: string,
  teamId: string,
  bundleId: string,
  production: boolean,
  deviceToken: string,
  title: string,
  message: string,
  url: string,
  notificationId: string | null,
  type: string | null,
  transactionId: string | null,
) {
  const jwt =
    await createApnsJwt(
      key,
      keyId,
      teamId,
    );

  const host =
    production
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";

  const response =
    await fetch(
      `${host}/3/device/${encodeURIComponent(
        deviceToken,
      )}`,
      {
        method: "POST",

        headers: {
          authorization:
            `bearer ${jwt}`,
          "apns-topic":
            bundleId,
          "apns-push-type":
            "alert",
          "apns-priority":
            "10",
          "content-type":
            "application/json",
        },

        body: JSON.stringify({
          aps: {
            alert: {
              title,
              body: message,
            },
            sound: "default",
          },

          url,
          notificationId:
            notificationId ?? "",
          type:
            type ?? "",
          transactionId:
            transactionId ?? "",
        }),
      },
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    let parsed: any = null;

    try {
      parsed = responseText
        ? JSON.parse(responseText)
        : null;
    } catch {
      parsed = null;
    }

    const error =
      new Error(
        `APNs request failed (${response.status})`,
      ) as ApnsError;

    error.statusCode =
      response.status;

    error.apnsReason =
      parsed?.reason ?? null;

    throw error;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        error:
          "Method not allowed",
      },
      405,
    );
  }

  /*
   * ------------------------------------------------------------
   * Authentication
   * ------------------------------------------------------------
   */

  const webhookSecret =
    Deno.env.get(
      "PUSH_WEBHOOK_SECRET",
    );

  const suppliedSecret =
    req.headers.get(
      "x-push-webhook-secret",
    );

  const authHeader =
    req.headers.get(
      "authorization",
    ) ?? "";

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  const isServiceRole =
    !!serviceRoleKey &&
    authHeader ===
      `Bearer ${serviceRoleKey}`;

  if (
    !isServiceRole &&
    (
      !webhookSecret ||
      suppliedSecret !==
        webhookSecret
    )
  ) {
    return json(
      {
        error:
          "Unauthorized",
      },
      401,
    );
  }

  /*
   * ------------------------------------------------------------
   * Parse request
   * ------------------------------------------------------------
   */

  const payload =
    (await req.json().catch(
      () => null,
    )) as
      | PushPayload
      | null;

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return json(
      {
        error:
          "Invalid JSON body",
      },
      400,
    );
  }

  /*
   * Supabase Database Webhook:
   *
   * {
   *   type,
   *   table,
   *   schema,
   *   record,
   *   old_record
   * }
   */

  if (
    payload.type === "INSERT" ||
    payload.event === "INSERT"
  ) {
    if (
      payload.table &&
      payload.table !==
        "notifications"
    ) {
      return json({
        success: true,
        skipped:
          "unsupported_table",
      });
    }

    if (
      payload.schema &&
      payload.schema !==
        "public"
    ) {
      return json({
        success: true,
        skipped:
          "unsupported_schema",
      });
    }
  }

  /*
   * ------------------------------------------------------------
   * Resolve notification
   * ------------------------------------------------------------
   */

  const record =
    payload.record ?? null;

  const directNotificationId =
    typeof payload.notification_id ===
      "string"
      ? payload.notification_id
      : null;

  const webhookNotificationId =
    typeof record?.id === "string"
      ? record.id
      : null;

  const notificationId =
    directNotificationId ??
    webhookNotificationId;

  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    );

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return json(
      {
        error:
          "Supabase server configuration is incomplete",
      },
      500,
    );
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession:
            false,
          autoRefreshToken:
            false,
        },
      },
    );

  /*
   * ------------------------------------------------------------
   * Initial payload values
   * ------------------------------------------------------------
   */

  let title =
    record?.title ??
    payload.title ??
    "IyanjuPay";

  let message =
    record?.message ??
    payload.message ??
    "You have a new notification.";

  let url =
    typeof record?.metadata?.url ===
      "string"
      ? record.metadata.url
      : payload.url ??
        (
          notificationId
            ? `/notifications/${notificationId}`
            : "/"
        );

  let userId =
    record?.user_id ??
    payload.user_id ??
    null;

  let notificationChannel =
    record?.channel ??
    "in_app";

  let notificationType =
    typeof record?.type ===
      "string"
      ? record.type
      : null;

  let transactionId =
    typeof record?.transaction_id ===
      "string"
      ? record.transaction_id
      : null;

  /*
   * ------------------------------------------------------------
   * Load notification and separate in-app/push lifecycle
   * ------------------------------------------------------------
   */

  if (notificationId) {
    const {
      data,
      error,
    } = await admin
      .from("notifications")
      .select(
        [
          "id",
          "user_id",
          "title",
          "message",
          "metadata",
          "channel",
          "type",
          "transaction_id",
          "in_app_status",
          "in_app_delivered_at",
          "push_status",
          "push_attempts",
        ].join(","),
      )
      .eq(
        "id",
        notificationId,
      )
      .maybeSingle();

    if (error) {
      console.error(
        "Failed to load notification:",
        error,
      );

      return json(
        {
          error:
            "Unable to process notification",
        },
        500,
      );
    }

    if (!data) {
      return json(
        {
          error:
            "Notification not found",
        },
        404,
      );
    }

    userId =
      data.user_id;

    notificationChannel =
      data.channel ??
      "in_app";

    title =
      data.title;

    message =
      data.message;

    notificationType =
      data.type ??
      notificationType;

    transactionId =
      data.transaction_id ??
      transactionId;

    url =
      typeof data.metadata?.url ===
        "string"
        ? data.metadata.url
        : `/notifications/${data.id}`;

    /*
     * ----------------------------------------------------------
     * In-app delivery is independent from push delivery.
     * ----------------------------------------------------------
     */

    const inAppDeliveredAt =
      typeof data.in_app_delivered_at ===
        "string"
        ? data.in_app_delivered_at
        : new Date().toISOString();

    await admin
      .from("notifications")
      .update({
        in_app_status:
          "delivered",
        in_app_delivered_at:
          data.in_app_delivered_at ??
          inAppDeliveredAt,
      })
      .eq(
        "id",
        notificationId,
      );

    /*
     * These channels are not push channels.
     */

    if (
      [
        "email",
        "sms",
        "webhook",
      ].includes(
        notificationChannel,
      )
    ) {
      return json({
        success: true,
        skipped:
          `channel_${notificationChannel}`,
        in_app_status:
          "delivered",
        push_status:
          "skipped",
      });
    }

    /*
     * Mark the push attempt as processing.
     */

    const currentPushAttempts =
      Number(
        data.push_attempts ??
          0,
      );

    const nextPushAttempt =
      currentPushAttempts +
      1;

    await admin
      .from("notifications")
      .update({
        push_status:
          "processing",
        push_attempts:
          nextPushAttempt,
        push_last_attempt_at:
          new Date().toISOString(),
        push_last_error:
          null,
        push_failed_at:
          null,
        push_next_retry_at:
          null,
      })
      .eq(
        "id",
        notificationId,
      );
  }

  /*
   * A user is required for push delivery.
   */

  if (!userId) {
    if (notificationId) {
      await admin
        .from("notifications")
        .update({
          push_status:
            "failed",
          push_failed_at:
            new Date().toISOString(),
          push_last_error:
            "Notification does not have a user.",
          push_next_retry_at:
            null,
        })
        .eq(
          "id",
          notificationId,
        );
    }

    return json(
      {
        error:
          "user_id or notification_id is required",
      },
      400,
    );
  }

  /*
   * ------------------------------------------------------------
   * Global customer push setting
   * ------------------------------------------------------------
   */

  const {
    data: pushSetting,
  } = await admin
    .from(
      "customer_app_settings",
    )
    .select("value")
    .eq(
      "setting_key",
      "customerPushNotifications",
    )
    .maybeSingle();

  const pushSettingDisabled =
    pushSetting?.value ===
      false ||
    pushSetting?.value ===
      "false" ||
    (
      typeof pushSetting?.value ===
        "object" &&
      pushSetting?.value !==
        null &&
      (
        pushSetting.value as Record<
          string,
          unknown
        >
      ).enabled === false
    );

  if (pushSettingDisabled) {
    if (notificationId) {
      await admin
        .from("notifications")
        .update({
          push_status:
            "skipped",
          push_failed_at:
            null,
          push_delivered_at:
            null,
          push_last_error:
            null,
          push_next_retry_at:
            null,
        })
        .eq(
          "id",
          notificationId,
        );
    }

    return json({
      success: true,
      skipped:
        "customer_push_notifications_disabled",
      in_app_status:
        "delivered",
      push_status:
        "skipped",
    });
  }

  /*
   * ------------------------------------------------------------
   * Firebase Android configuration
   * ------------------------------------------------------------
   */

  let firebaseServiceAccount:
    | FirebaseServiceAccount
    | null = null;

  const firebaseServiceAccountJson =
    Deno.env.get(
      "FIREBASE_SERVICE_ACCOUNT_JSON",
    );

  if (firebaseServiceAccountJson) {
    try {
      firebaseServiceAccount =
        JSON.parse(
          firebaseServiceAccountJson,
        ) as FirebaseServiceAccount;

      if (
        !firebaseServiceAccount.project_id ||
        !firebaseServiceAccount.client_email ||
        !firebaseServiceAccount.private_key
      ) {
        return json(
          {
            error:
              "Firebase configuration is incomplete",
          },
          500,
        );
      }
    } catch {
      return json(
        {
          error:
            "Firebase configuration is invalid",
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

  const vapidPublicKey =
    Deno.env.get(
      "VAPID_PUBLIC_KEY",
    )?.trim();

  const vapidPrivateKey =
    Deno.env.get(
      "VAPID_PRIVATE_KEY",
    )?.trim();

  const vapidSubject =
    Deno.env.get(
      "VAPID_SUBJECT",
    )?.trim() ??
    "mailto:lawalaremu53@gmail.com";

  const webPushConfigured =
    !!vapidPublicKey &&
    !!vapidPrivateKey;

  /*
   * ------------------------------------------------------------
   * VAPID configuration diagnostics
   * ------------------------------------------------------------
   */

  let decodedPublicKeyLength =
    0;

  let decodedPrivateKeyLength =
    0;

  let publicKeyLooksValid =
    false;

  let privateKeyLooksValid =
    false;

  let vapidKeysMatch =
    false;

  if (
    vapidPublicKey
  ) {
    try {
      const decodedPublicKey =
        decodeBase64Url(
          vapidPublicKey,
        );

      decodedPublicKeyLength =
        decodedPublicKey.length;

      publicKeyLooksValid =
        decodedPublicKey.length ===
          65 &&
        decodedPublicKey[0] ===
          4;
    } catch {
      decodedPublicKeyLength =
        0;
      publicKeyLooksValid =
        false;
    }
  }

  if (
    vapidPrivateKey
  ) {
    try {
      const decodedPrivateKey =
        decodeBase64Url(
          vapidPrivateKey,
        );

      decodedPrivateKeyLength =
        decodedPrivateKey.length;

      privateKeyLooksValid =
        decodedPrivateKey.length ===
        32;
    } catch {
      decodedPrivateKeyLength =
        0;
      privateKeyLooksValid =
        false;
    }
  }

  if (
    webPushConfigured
  ) {
    vapidKeysMatch =
      verifyVapidKeyPair(
        vapidPublicKey,
        vapidPrivateKey,
      );

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey!,
      vapidPrivateKey!,
    );
  }

  /*
   * ------------------------------------------------------------
   * Apple Push Notification Service
   * ------------------------------------------------------------
   */

  const apnsKey =
    Deno.env.get(
      "APNS_PRIVATE_KEY",
    );

  const apnsKeyId =
    Deno.env.get(
      "APNS_KEY_ID",
    );

  const apnsTeamId =
    Deno.env.get(
      "APNS_TEAM_ID",
    );

  const apnsBundleId =
    Deno.env.get(
      "APNS_BUNDLE_ID",
    ) ??
    "com.iyanjupay.app";

  const apnsProduction =
    (
      Deno.env.get(
        "APNS_PRODUCTION",
      ) ??
      "true"
    ).toLowerCase() ===
    "true";

  const apnsConfigured =
    !!apnsKey &&
    !!apnsKeyId &&
    !!apnsTeamId &&
    !!apnsBundleId;

  /*
   * ------------------------------------------------------------
   * Get all subscriptions
   * ------------------------------------------------------------
   */

  const {
    data: subscriptions,
    error: subscriptionError,
  } = await admin
    .from(
      "user_push_subscriptions",
    )
    .select(
      "id,platform,endpoint,p256dh,auth,device_token",
    )
    .eq(
      "user_id",
      userId,
    );

  if (subscriptionError) {
    console.error(
      "Failed to load push subscriptions:",
      subscriptionError,
    );

    if (notificationId) {
      await admin
        .from("notifications")
        .update({
          push_status:
            "failed",
          push_failed_at:
            new Date().toISOString(),
          push_last_error:
            "Unable to load push subscriptions.",
          push_next_retry_at:
            null,
        })
        .eq(
          "id",
          notificationId,
        );
    }

    return json(
      {
        error:
          "Unable to process push notification",
      },
      500,
    );
  }

  /*
   * ------------------------------------------------------------
   * Counters
   * ------------------------------------------------------------
   */

  let delivered = 0;
  let attempted = 0;
  let failedAttempts = 0;

  const staleIds: string[] =
    [];

  /*
   * ------------------------------------------------------------
   * Web Push
   * ------------------------------------------------------------
   */

  const webSubscriptions =
    subscriptions?.filter(
      (subscription) =>
        subscription.platform ===
          "web" &&
        subscription.endpoint &&
        subscription.p256dh &&
        subscription.auth,
    ) ?? [];

  /*
   * VAPID diagnostics.
   *
   * This deliberately exposes only safe metadata.
   */

  console.log(
    "VAPID configuration diagnostics:",
    {
      publicKeyPresent:
        !!vapidPublicKey,
      privateKeyPresent:
        !!vapidPrivateKey,
      subjectPresent:
        !!vapidSubject,
      subjectIsMailto:
        vapidSubject.startsWith(
          "mailto:",
        ),
      publicKeyDecodedLength:
        decodedPublicKeyLength,
      privateKeyDecodedLength:
        decodedPrivateKeyLength,
      publicKeyLooksValid,
      privateKeyLooksValid,
      vapidKeysMatch,
      webSubscriptionsFound:
        webSubscriptions.length,
    },
  );

  /*
   * ------------------------------------------------------------
   * Web Push request-generation diagnostic
   * ------------------------------------------------------------
   *
   * This verifies that web-push can construct the VAPID
   * authorization request without logging credentials.
   */

  if (
    webPushConfigured &&
    webSubscriptions.length >
      0
  ) {
    try {
      const diagnosticSubscription =
        {
          endpoint:
            webSubscriptions[0]
              .endpoint,
          keys: {
            p256dh:
              webSubscriptions[0]
                .p256dh,
            auth:
              webSubscriptions[0]
                .auth,
          },
        };

      const requestDetails =
        webpush.generateRequestDetails(
          diagnosticSubscription,
          JSON.stringify({
            title:
              "IyanjuPay VAPID diagnostic",
            body:
              "Diagnostic request only",
          }),
        );

      const requestHeaders =
        requestDetails.headers ??
        {};

      const authorizationHeader =
        requestHeaders.Authorization ??
        requestHeaders.authorization ??
        "";

      const cryptoKeyHeader =
        requestHeaders[
          "Crypto-Key"
        ] ??
        requestHeaders[
          "crypto-key"
        ] ??
        "";

      console.log(
        "VAPID request generation diagnostics:",
        {
          requestGenerated:
            true,
          endpointHost:
            new URL(
              diagnosticSubscription.endpoint,
            ).hostname,
          method:
            requestDetails.method,
          authorizationGenerated:
            typeof authorizationHeader ===
              "string" &&
            authorizationHeader.length >
              0,
          cryptoKeyGenerated:
            typeof cryptoKeyHeader ===
              "string" &&
            cryptoKeyHeader.length >
              0,
          authorizationLength:
            typeof authorizationHeader ===
              "string"
              ? authorizationHeader.length
              : 0,
          cryptoKeyLength:
            typeof cryptoKeyHeader ===
              "string"
              ? cryptoKeyHeader.length
              : 0,
        },
      );
    } catch (error) {
      console.error(
        "VAPID request generation diagnostic failed:",
        error instanceof Error
          ? error.message
          : "Unknown error",
      );
    }
  }

  /*
   * Web subscriptions exist but Web Push credentials
   * are not configured.
   */

  if (
    webSubscriptions.length >
      0 &&
    !webPushConfigured
  ) {
    failedAttempts +=
      webSubscriptions.length;
  }

  if (
    webPushConfigured
  ) {
    const notificationPayload =
      JSON.stringify({
        title,
        body: message,
        url,
        notificationId,
        type: notificationType,
        transactionId,
      });

    for (
      const subscription of
        webSubscriptions
    ) {
      attempted += 1;

      try {
        await webpush.sendNotification(
          {
            endpoint:
              subscription.endpoint,
            keys: {
              p256dh:
                subscription.p256dh,
              auth:
                subscription.auth,
            },
          },
          notificationPayload,
        );

        delivered += 1;
      } catch (error) {
        failedAttempts +=
          1;

        const pushError =
          error as {
            statusCode?: number;
            body?: unknown;
          };

        const statusCode =
          pushError.statusCode;

        if (
          statusCode ===
            404 ||
          statusCode ===
            410
        ) {
          staleIds.push(
            subscription.id,
          );
        }

        /*
         * Diagnostic logging only.
         *
         * Never log:
         * - VAPID private key
         * - p256dh
         * - auth
         * - full JWT
         */

        let providerReason =
          "";

        if (
          typeof pushError.body ===
          "string"
        ) {
          providerReason =
            pushError.body.slice(
              0,
              500,
            );
        } else if (
          pushError.body !==
          undefined
        ) {
          try {
            providerReason =
              JSON.stringify(
                pushError.body,
              ).slice(
                0,
                500,
              );
          } catch {
            providerReason =
              "";
          }
        }

        console.error(
          "Web Push delivery failed:",
          {
            statusCode,
            providerReason,
          },
        );
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
        subscription.platform ===
          "android" &&
        !!subscription.device_token,
    ) ?? [];

  if (
    androidSubscriptions.length >
      0 &&
    !firebaseServiceAccount
  ) {
    failedAttempts +=
      androidSubscriptions.length;

    console.error(
      "Android push subscriptions exist, but Firebase service-account configuration is missing.",
    );
  }

  if (
    firebaseServiceAccount
  ) {
    for (
      const subscription of
        androidSubscriptions
    ) {
      if (
        !subscription.device_token
      ) {
        continue;
      }

      attempted += 1;

      try {
        await sendAndroidPush(
          firebaseServiceAccount,
          subscription.device_token,
          title,
          message,
          url,
          notificationId,
          notificationType,
          transactionId,
        );

        delivered += 1;
      } catch (error) {
        failedAttempts +=
          1;

        const fcmErrorCode =
          (
            error as {
              fcmErrorCode?:
                | string
                | null;
            }
          )?.fcmErrorCode;

        const statusCode =
          (
            error as {
              statusCode?: number;
            }
          )?.statusCode;

        if (
          fcmErrorCode ===
            "UNREGISTERED" ||
          statusCode ===
            404
        ) {
          staleIds.push(
            subscription.id,
          );
        }

        console.error(
          "FCM delivery failed:",
          statusCode,
          fcmErrorCode,
        );
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * iOS APNs
   * ------------------------------------------------------------
   */

  const iosSubscriptions =
    subscriptions?.filter(
      (subscription) =>
        subscription.platform ===
          "ios" &&
        !!subscription.device_token,
    ) ?? [];

  if (
    iosSubscriptions.length >
      0 &&
    !apnsConfigured
  ) {
    failedAttempts +=
      iosSubscriptions.length;

    console.error(
      "iOS push subscriptions exist, but APNs credentials are not configured.",
    );
  }

  if (apnsConfigured) {
    for (
      const subscription of
        iosSubscriptions
    ) {
      if (
        !subscription.device_token
      ) {
        continue;
      }

      attempted += 1;

      try {
        await sendIosPush(
          apnsKey!,
          apnsKeyId!,
          apnsTeamId!,
          apnsBundleId,
          apnsProduction,
          subscription.device_token,
          title,
          message,
          url,
          notificationId,
          notificationType,
          transactionId,
        );

        delivered += 1;
      } catch (error) {
        failedAttempts +=
          1;

        const statusCode =
          (
            error as ApnsError
          )?.statusCode;

        const reason =
          (
            error as ApnsError
          )?.apnsReason;

        if (
          statusCode ===
            400 &&
          (
            reason ===
              "BadDeviceToken" ||
            reason ===
              "DeviceTokenNotForTopic"
          )
        ) {
          staleIds.push(
            subscription.id,
          );
        }

        if (
          statusCode ===
            410
        ) {
          staleIds.push(
            subscription.id,
          );
        }

        console.error(
          "APNs delivery failed:",
          statusCode,
          reason,
        );
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * Remove stale subscriptions
   * ------------------------------------------------------------
   */

  if (
    staleIds.length >
    0
  ) {
    await admin
      .from(
        "user_push_subscriptions",
      )
      .delete()
      .in(
        "id",
        [
          ...new Set(
            staleIds,
          ),
        ],
      );
  }

  /*
   * ------------------------------------------------------------
   * Determine final PUSH status
   * ------------------------------------------------------------
   */

  const availableSubscriptions =
    webSubscriptions.length +
    androidSubscriptions.length +
    iosSubscriptions.length;

  let finalPushStatus:
    | "delivered"
    | "failed"
    | "skipped";

  let pushLastError:
    | string
    | null = null;

  if (
    delivered >
    0
  ) {
    finalPushStatus =
      "delivered";
  } else if (
    availableSubscriptions ===
    0
  ) {
    finalPushStatus =
      "skipped";

    pushLastError =
      null;
  } else {
    finalPushStatus =
      "failed";

    pushLastError =
      failedAttempts >
      0
        ? "Push delivery failed for all available subscriptions."
        : "No push destination could be delivered.";
  }

  /*
   * ------------------------------------------------------------
   * Persist PUSH lifecycle only
   * ------------------------------------------------------------
   */

  if (notificationId) {
    const now =
      new Date().toISOString();

    const pushUpdate:
      Record<
        string,
        unknown
      > = {
      push_status:
        finalPushStatus,

      push_last_attempt_at:
        now,

      push_last_error:
        pushLastError,

      push_failed_at:
        finalPushStatus ===
        "failed"
          ? now
          : null,

      push_delivered_at:
        finalPushStatus ===
        "delivered"
          ? now
          : null,

      push_next_retry_at:
        null,
    };

    await admin
      .from("notifications")
      .update(
        pushUpdate,
      )
      .eq(
        "id",
        notificationId,
      );
  }

  /*
   * ------------------------------------------------------------
   * Final response
   * ------------------------------------------------------------
   */

  return json({
    success: true,

    notification_id:
      notificationId,

    in_app_status:
      notificationId
        ? "delivered"
        : null,

    push_status:
      finalPushStatus,

    delivered,
    attempted,

    web_attempted:
      webSubscriptions.length,

    android_attempted:
      androidSubscriptions.length,

    ios_attempted:
      iosSubscriptions.length,

    failed_attempts:
      failedAttempts,

    stale_removed:
      [
        ...new Set(
          staleIds,
        ),
      ].length,
  });
});
