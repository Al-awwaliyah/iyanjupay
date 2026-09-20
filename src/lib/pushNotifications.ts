import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const NATIVE_PUSH_TOKEN_KEY = "iyanjupay-native-push-token";
const PUSH_ENABLED_KEY = "iyanjupay-push-enabled";
const ANDROID_CHANNEL_ID = "iyanjupay-default";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) => char.charCodeAt(0)),
  );
}

/**
 * Returns whether the user previously enabled push notifications.
 *
 * This does not request permission.
 */
export function isPushEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(PUSH_ENABLED_KEY) === "true"
  );
}

function markPushEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PUSH_ENABLED_KEY,
      String(enabled),
    );
  }
}

/**
 * Returns whether browser Web Push is available.
 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Synchronizes an existing browser push subscription with Supabase.
 *
 * This function never requests notification permission.
 */
async function upsertWebSubscription(): Promise<boolean> {
  try {
    const registration =
      await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    const json = subscription.toJSON();

    const user =
      (await supabase.auth.getUser()).data.user;

    if (!user) {
      return false;
    }

    const { error } =
      await db
        .from("user_push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            platform: "web",
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh ?? null,
            auth: json.keys?.auth ?? null,
            user_agent: navigator.userAgent,
            last_seen_at: new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          },
        );

    if (error) {
      console.warn(
        "Web push subscription synchronization failed.",
      );

      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      "Unable to synchronize web push subscription.",
      error,
    );

    return false;
  }
}

/**
 * Requests browser notification permission and creates
 * the Web Push subscription.
 */
export async function requestWebPushPermission() {
  if (!isWebPushSupported()) {
    return {
      enabled: false,
      reason: "unsupported" as const,
    };
  }

  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") {
      return {
        enabled: false,
        reason: permission as string,
      };
    }

    const vapidKey =
      import.meta.env.VITE_VAPID_PUBLIC_KEY as
        | string
        | undefined;

    if (!vapidKey) {
      return {
        enabled: false,
        reason: "missing_vapid_key" as const,
      };
    }

    const registration =
      await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(vapidKey),
        });
    }

    const json = subscription.toJSON();

    const user =
      (await supabase.auth.getUser()).data.user;

    if (!user) {
      return {
        enabled: false,
        reason: "not_signed_in" as const,
      };
    }

    const { error } =
      await db
        .from("user_push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            platform: "web",
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh ?? null,
            auth: json.keys?.auth ?? null,
            user_agent: navigator.userAgent,
            last_seen_at: new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          },
        );

    if (error) {
      console.warn(
        "Web push registration could not be synchronized.",
      );

      return {
        enabled: false,
        reason: "registration_failed" as const,
      };
    }

    markPushEnabled(true);

    return {
      enabled: true,
      reason: "granted" as const,
    };
  } catch (error) {
    console.warn(
      "Web push setup failed.",
      error,
    );

    return {
      enabled: false,
      reason: "error" as const,
    };
  }
}

/**
 * Synchronizes an already-authorized Web Push subscription.
 *
 * No permission prompt is shown.
 */
export async function syncWebPushSubscription(): Promise<boolean> {
  if (
    !isWebPushSupported() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    return await upsertWebSubscription();
  } catch (error) {
    console.warn(
      "Web push subscription synchronization failed.",
      error,
    );

    return false;
  }
}

/**
 * Disables browser push notifications and removes
 * the stored subscription from Supabase.
 */
export async function disableWebPush(): Promise<void> {
  if (!isWebPushSupported()) {
    markPushEnabled(false);
    return;
  }

  try {
    const registration =
      await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;

      await subscription.unsubscribe();

      await db
        .from("user_push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);
    }
  } catch (error) {
    console.warn(
      "Unable to disable web push.",
      error,
    );
  } finally {
    markPushEnabled(false);
  }
}

/**
 * Registers native Android/iOS push notifications.
 *
 * Android uses FCM through Capacitor Push Notifications.
 * Foreground notifications are mirrored through Local Notifications.
 * Background/closed-app delivery is handled by the native push
 * notification payload delivered by FCM/APNs.
 */
export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) {
    return {
      enabled: false,
      reason: "web" as const,
    };
  }

  try {
    const { PushNotifications } =
      await import("@capacitor/push-notifications");

    const { LocalNotifications } =
      await import("@capacitor/local-notifications");

    let permission =
      await PushNotifications.checkPermissions();

    if (permission.receive !== "granted") {
      permission =
        await PushNotifications.requestPermissions();
    }

    if (permission.receive !== "granted") {
      markPushEnabled(false);

      return {
        enabled: false,
        reason: "denied" as const,
      };
    }

    /**
     * Synchronize Local Notifications permission.
     *
     * Local notifications are used for foreground presentation
     * so the user still receives a visible notification while
     * actively using the native application.
     */
    try {
      let localPermission =
        await LocalNotifications.checkPermissions();

      if (localPermission.display !== "granted") {
        localPermission =
          await LocalNotifications.requestPermissions();
      }
    } catch (error) {
      console.warn(
        "Local notification permission setup failed.",
        error,
      );
    }

    /**
     * Android notification channels.
     */
    if (Capacitor.getPlatform() === "android") {
      try {
        await PushNotifications.createChannel({
          id: ANDROID_CHANNEL_ID,
          name: "IyanjuPay Notifications",
          description:
            "IyanjuPay account and transaction notifications",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch (error) {
        console.warn(
          "Unable to create native push notification channel.",
          error,
        );
      }

      try {
        await LocalNotifications.createChannel({
          id: ANDROID_CHANNEL_ID,
          name: "IyanjuPay Notifications",
          description:
            "IyanjuPay account and transaction notifications",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch (error) {
        console.warn(
          "Unable to create local notification channel.",
          error,
        );
      }
    }

    /**
     * Prevent duplicate listeners after:
     * - hot reload
     * - authentication changes
     * - push restoration
     */
    await PushNotifications.removeAllListeners();

    /**
     * FCM/APNs token registration.
     */
    await PushNotifications.addListener(
      "registration",
      async (token) => {
        try {
          const user =
            (await supabase.auth.getUser()).data.user;

          if (!user) {
            return;
          }

          if (
            typeof window !== "undefined"
          ) {
            window.localStorage.setItem(
              NATIVE_PUSH_TOKEN_KEY,
              token.value,
            );
          }

          const platform =
            Capacitor.getPlatform() === "ios"
              ? "ios"
              : "android";

          const { error } =
            await db
              .from("user_push_subscriptions")
              .upsert(
                {
                  user_id: user.id,
                  platform,
                  device_token: token.value,
                  user_agent:
                    typeof navigator !== "undefined"
                      ? navigator.userAgent
                      : "IyanjuPay Native",
                  last_seen_at:
                    new Date().toISOString(),
                },
                {
                  onConflict: "device_token",
                },
              );

          if (error) {
            console.warn(
              "Native push token synchronization failed.",
            );
          }
        } catch (error) {
          console.warn(
            "Native push token registration handling failed.",
            error,
          );
        }
      },
    );

    /**
     * Native registration error.
     */
    await PushNotifications.addListener(
      "registrationError",
      (error) => {
        console.warn(
          "Native push registration failed.",
          error,
        );
      },
    );

    /**
     * Foreground push handling.
     *
     * FCM notification payloads delivered while the app is
     * foregrounded are handled here and displayed using a
     * local notification.
     */
    await PushNotifications.addListener(
      "pushNotificationReceived",
      async (event) => {
        try {
          const data =
            (event.notification?.data ??
              {}) as Record<string, unknown>;

          const rawNotificationId = String(
            data.notificationId ??
              event.notification?.id ??
              Date.now(),
          );

          const numericId =
            Number(
              rawNotificationId
                .replace(/\D/g, "")
                .slice(-8),
            ) || Date.now();

          await LocalNotifications.schedule({
            notifications: [
              {
                id: numericId,
                title:
                  event.notification?.title ??
                  String(
                    data.title ??
                      "IyanjuPay",
                  ),
                body:
                  event.notification?.body ??
                  String(
                    data.body ??
                      "You have a new notification.",
                  ),
                channelId:
                  ANDROID_CHANNEL_ID,
                sound: "default",
                extra: {
                  url: String(
                    data.url ?? "/",
                  ),
                  notificationId: String(
                    data.notificationId ??
                      "",
                  ),
                },
              },
            ],
          });
        } catch (error) {
          console.warn(
            "Foreground native notification failed.",
            error,
          );
        }
      },
    );

    /**
     * Handles a user tapping a native push notification.
     */
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event) => {
        try {
          const data =
            (event.notification?.data ??
              {}) as Record<string, unknown>;

          const url = data.url;

          if (url) {
            window.location.assign(
              String(url),
            );
          }
        } catch (error) {
          console.warn(
            "Unable to handle push notification action.",
            error,
          );
        }
      },
    );

    /**
     * Handles a user tapping a foreground local notification.
     */
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        try {
          const extra =
            (event.notification?.extra ??
              {}) as Record<string, unknown>;

          if (extra.url) {
            window.location.assign(
              String(extra.url),
            );
          }
        } catch (error) {
          console.warn(
            "Unable to handle local notification action.",
            error,
          );
        }
      },
    );

    /**
     * Start native registration.
     */
    await PushNotifications.register();

    markPushEnabled(true);

    return {
      enabled: true,
      reason: "granted" as const,
    };
  } catch (error) {
    console.warn(
      "Native push registration failed.",
      error,
    );

    return {
      enabled: false,
      reason: "error" as const,
    };
  }
}

/**
 * Disables native push notifications and removes the
 * device token from Supabase.
 */
export async function disableNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    markPushEnabled(false);
    return;
  }

  try {
    const { PushNotifications } =
      await import("@capacitor/push-notifications");

    const { LocalNotifications } =
      await import("@capacitor/local-notifications");

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem(
            NATIVE_PUSH_TOKEN_KEY,
          )
        : null;

    if (token) {
      await db
        .from("user_push_subscriptions")
        .delete()
        .eq("device_token", token);

      if (
        typeof window !== "undefined"
      ) {
        window.localStorage.removeItem(
          NATIVE_PUSH_TOKEN_KEY,
        );
      }
    }

    await PushNotifications.unregister();

    await PushNotifications.removeAllListeners();

    await LocalNotifications.removeAllListeners();
  } catch (error) {
    console.warn(
      "Native push disable failed.",
      error,
    );
  } finally {
    markPushEnabled(false);
  }
}

/**
 * Called during application startup.
 *
 * IMPORTANT:
 * This function does not request notification permission.
 * It only restores an already-enabled push registration.
 */
export async function initializePushNotifications(): Promise<void> {
  if (!isPushEnabled()) {
    return;
  }

  try {
    const user =
      (await supabase.auth.getUser()).data.user;

    if (!user) {
      return;
    }

    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } =
        await import("@capacitor/push-notifications");

      const permission =
        await PushNotifications.checkPermissions();

      if (permission.receive === "granted") {
        await registerNativePush();
      }

      return;
    }

    if (
      isWebPushSupported() &&
      Notification.permission === "granted"
    ) {
      await syncWebPushSubscription();
    }
  } catch (error) {
    console.warn(
      "Push notification initialization failed.",
      error,
    );
  }
}

/**
 * Restores an existing push registration after authentication
 * has been restored.
 *
 * This function NEVER requests notification permission.
 *
 * App.tsx uses this after:
 * - Supabase session restoration
 * - SIGNED_IN/authentication changes
 *
 * This prevents push registration from running before the
 * authenticated user's ID is available.
 */
export async function restorePushRegistration(): Promise<void> {
  try {
    const user =
      (await supabase.auth.getUser()).data.user;

    if (!user) {
      return;
    }

    if (!isPushEnabled()) {
      return;
    }

    /**
     * Native Android/iOS.
     */
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } =
        await import("@capacitor/push-notifications");

      const permission =
        await PushNotifications.checkPermissions();

      if (permission.receive !== "granted") {
        return;
      }

      await registerNativePush();

      return;
    }

    /**
     * PWA / Web.
     */
    if (
      isWebPushSupported() &&
      Notification.permission === "granted"
    ) {
      await syncWebPushSubscription();
    }
  } catch (error) {
   
    console.warn(
      "Unable to restore push registration.",
      error,
    );
  }
}


export async function enablePushNotifications() {
  if (Capacitor.isNativePlatform()) {
    return registerNativePush();
  }

  return requestWebPushPermission();
}
