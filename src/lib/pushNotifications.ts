import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const NATIVE_PUSH_TOKEN_KEY = "iyanjupay-native-push-token";
const PUSH_ENABLED_KEY = "iyanjupay-push-enabled";
const ANDROID_CHANNEL_ID = "iyanjupay-default";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushEnabled(): boolean {
  return typeof window !== "undefined" &&
    window.localStorage.getItem(PUSH_ENABLED_KEY) === "true";
}

function markPushEnabled(enabled: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
  }
}

export function isWebPushSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

async function upsertWebSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const json = subscription.toJSON();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return false;

  const { error } = await db.from("user_push_subscriptions").upsert({
    user_id: user.id,
    platform: "web",
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh ?? null,
    auth: json.keys?.auth ?? null,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) {
    console.error("Web push subscription sync failed:", error);
    return false;
  }

  return true;
}

export async function requestWebPushPermission() {
  if (!isWebPushSupported()) {
    return { enabled: false, reason: "unsupported" as const };
  }

  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") {
      return { enabled: false, reason: permission as string };
    }

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey) {
      return { enabled: false, reason: "missing_vapid_key" as const };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const json = subscription.toJSON();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      return { enabled: false, reason: "not_signed_in" as const };
    }

    const { error } = await db.from("user_push_subscriptions").upsert({
      user_id: user.id,
      platform: "web",
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? null,
      auth: json.keys?.auth ?? null,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

    if (error) {
      console.error("Web push registration failed:", error);
      return { enabled: false, reason: "registration_failed" as const };
    }

    markPushEnabled(true);
    return { enabled: true, reason: "granted" as const };
  } catch (error) {
    console.error("Web push setup failed:", error);
    return { enabled: false, reason: "error" as const };
  }
}

export async function syncWebPushSubscription() {
  if (!isWebPushSupported() || Notification.permission !== "granted") {
    return false;
  }

  try {
    return await upsertWebSubscription();
  } catch (error) {
    console.error("Web push subscription synchronization failed:", error);
    return false;
  }
}

export async function disableWebPush() {
  if (!isWebPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await db.from("user_push_subscriptions").delete().eq("endpoint", endpoint);
    }
  } finally {
    markPushEnabled(false);
  }
}

export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) {
    return { enabled: false, reason: "web" as const };
  }

  try {
    const { PushNotifications } =
      await import("@capacitor/push-notifications");
    const { LocalNotifications } =
      await import("@capacitor/local-notifications");

    let permission = await PushNotifications.checkPermissions();

    if (permission.receive !== "granted") {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== "granted") {
      markPushEnabled(false);
      return { enabled: false, reason: "denied" as const };
    }

    // Foreground presentation uses the local-notification plugin. Its
    // authorization follows the same system notification permission, but
    // we explicitly synchronize it so foreground alerts are visible.
    try {
      let localPermission = await LocalNotifications.checkPermissions();
      if (localPermission.display !== "granted") {
        localPermission = await LocalNotifications.requestPermissions();
      }
    } catch (error) {
      console.error("Local notification permission setup failed:", error);
    }

    if (Capacitor.getPlatform() === "android") {
      await PushNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: "IyanjuPay Notifications",
        description: "IyanjuPay account and transaction notifications",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });

      // Local notifications are used only for foreground presentation.
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: "IyanjuPay Notifications",
        description: "IyanjuPay account and transaction notifications",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
    }

    // Avoid duplicate listeners after hot reload/re-authentication.
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener("registration", async (token) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value);

      const platform =
        Capacitor.getPlatform() === "ios" ? "ios" : "android";

      const { error } = await db.from("user_push_subscriptions").upsert({
        user_id: user.id,
        platform,
        device_token: token.value,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "device_token" });

      if (error) {
        console.error("Native push token sync failed:", error);
      }
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Native push registration error:", error);
    });

    // Capacitor does not automatically display notification payloads
    // while the app is foregrounded. Show a local notification so the
    // user receives the same visible alert in foreground/background.
    await PushNotifications.addListener(
      "pushNotificationReceived",
      async (event) => {
        try {
          const data = (event.notification?.data ?? {}) as Record<string, unknown>;
          const id =
            Number(
              String(
                data.notificationId ??
                  event.notification?.id ??
                  Date.now(),
              ).replace(/\D/g, "").slice(-8),
            ) || Date.now();

          await LocalNotifications.schedule({
            notifications: [{
              id,
              title:
                event.notification?.title ??
                String(data.title ?? "IyanjuPay"),
              body:
                event.notification?.body ??
                String(data.body ?? "You have a new notification."),
              channelId: ANDROID_CHANNEL_ID,
              sound: "default",
              extra: {
                url: String(data.url ?? "/"),
                notificationId: String(data.notificationId ?? ""),
              },
            }],
          });
        } catch (error) {
          console.error("Foreground native notification failed:", error);
        }
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event) => {
        const data =
          (event.notification?.data ?? {}) as Record<string, unknown>;
        const url = data.url;

        if (url) {
          window.location.assign(String(url));
        }
      },
    );

    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        const extra =
          (event.notification?.extra ?? {}) as Record<string, unknown>;
        if (extra.url) {
          window.location.assign(String(extra.url));
        }
      },
    );

    await PushNotifications.register();
    markPushEnabled(true);

    return { enabled: true, reason: "granted" as const };
  } catch (error) {
    console.error("Native push registration failed:", error);
    return { enabled: false, reason: "error" as const };
  }
}

export async function disableNativePush() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } =
      await import("@capacitor/push-notifications");
    const { LocalNotifications } =
      await import("@capacitor/local-notifications");

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)
        : null;

    if (token) {
      await db.from("user_push_subscriptions")
        .delete()
        .eq("device_token", token);
      localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
    }

    await PushNotifications.unregister();
    await PushNotifications.removeAllListeners();
    await LocalNotifications.removeAllListeners();
  } catch (error) {
    console.error("Native push disable failed:", error);
  } finally {
    markPushEnabled(false);
  }
}

/**
 * Called on application startup. It never asks for permission unless
 * the user previously enabled push notifications.
 */
export async function initializePushNotifications() {
  if (!isPushEnabled()) return;

  try {
    if (Capacitor.isNativePlatform()) {
      const permission =
        await (await import("@capacitor/push-notifications"))
          .PushNotifications.checkPermissions();

      if (permission.receive === "granted") {
        await registerNativePush();
      }
      return;
    }

    if (isWebPushSupported() && Notification.permission === "granted") {
      await syncWebPushSubscription();
    }
  } catch (error) {
    console.error("Push notification initialization failed:", error);
  }
}

export async function enablePushNotifications() {
  if (Capacitor.isNativePlatform()) {
    return registerNativePush();
  }

  return requestWebPushPermission();
}
