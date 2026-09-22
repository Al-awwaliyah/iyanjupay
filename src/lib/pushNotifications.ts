import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const NATIVE_PUSH_TOKEN_KEY = "iyanjupay-native-push-token";
const PUSH_ENABLED_KEY = "iyanjupay-push-enabled";
const ANDROID_CHANNEL_ID = "iyanjupay-default";

let nativeRegistrationInProgress = false;

function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4,
  );

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) =>
      char.charCodeAt(0),
    ),
  );
}

/**
 * Returns whether the user previously enabled push notifications.
 *
 * This does not request notification permission.
 */
export function isPushEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(
      PUSH_ENABLED_KEY,
    ) === "true"
  );
}

function markPushEnabled(
  enabled: boolean,
): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PUSH_ENABLED_KEY,
      String(enabled),
    );
  }
}

function getStoredNativeToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(
    NATIVE_PUSH_TOKEN_KEY,
  );
}

function storeNativeToken(
  token: string,
): void {
  if (
    typeof window !== "undefined" &&
    token
  ) {
    window.localStorage.setItem(
      NATIVE_PUSH_TOKEN_KEY,
      token,
    );
  }
}

function removeStoredNativeToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(
      NATIVE_PUSH_TOKEN_KEY,
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
 * Synchronizes an existing browser Web Push subscription
 * with Supabase.
 *
 * This function never requests permission.
 */
async function upsertWebSubscription(): Promise<boolean> {
  try {
    if (!isWebPushSupported()) {
      return false;
    }

    const registration =
      await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    const json =
      subscription.toJSON();

    if (!json.endpoint) {
      return false;
    }

    const user =
      (await supabase.auth.getUser())
        .data.user;

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
            p256dh:
              json.keys?.p256dh ?? null,
            auth:
              json.keys?.auth ?? null,
            user_agent:
              navigator.userAgent,
            last_seen_at:
              new Date().toISOString(),
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
      markPushEnabled(false);

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
      markPushEnabled(false);

      return {
        enabled: false,
        reason:
          "missing_vapid_key" as const,
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
            urlBase64ToUint8Array(
              vapidKey,
            ),
        });
    }

    const json =
      subscription.toJSON();

    if (!json.endpoint) {
      markPushEnabled(false);

      return {
        enabled: false,
        reason:
          "registration_failed" as const,
      };
    }

    const user =
      (await supabase.auth.getUser())
        .data.user;

    if (!user) {
      markPushEnabled(false);

      return {
        enabled: false,
        reason:
          "not_signed_in" as const,
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
            p256dh:
              json.keys?.p256dh ?? null,
            auth:
              json.keys?.auth ?? null,
            user_agent:
              navigator.userAgent,
            last_seen_at:
              new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          },
        );

    if (error) {
      console.warn(
        "Web push registration could not be synchronized.",
      );

      markPushEnabled(false);

      return {
        enabled: false,
        reason:
          "registration_failed" as const,
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

    markPushEnabled(false);

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

  return upsertWebSubscription();
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
      const endpoint =
        subscription.endpoint;

      try {
        await subscription.unsubscribe();
      } catch (error) {
        console.warn(
          "Browser push unsubscribe failed.",
          error,
        );
      }

      await db
        .from("user_push_subscriptions")
        .delete()
        .eq(
          "endpoint",
          endpoint,
        );
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
 * Synchronizes an FCM/APNs native device token
 * with Supabase.
 *
 * Uses the existing user_push_subscriptions schema.
 */
async function syncNativeToken(
  token: string,
): Promise<boolean> {
  try {
    if (!token.trim()) {
      return false;
    }

    const user =
      (await supabase.auth.getUser())
        .data.user;

    if (!user) {
      return false;
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
            device_token: token,
            user_agent:
              typeof navigator !== "undefined"
                ? navigator.userAgent
                : "IyanjuPay Native",
            last_seen_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "device_token",
          },
        );

    if (error) {
      console.warn(
        "Native push token synchronization failed.",
      );

      return false;
    }

    storeNativeToken(token);

    return true;
  } catch (error) {
    console.warn(
      "Unable to synchronize native push token.",
      error,
    );

    return false;
  }
}

/**
 * Creates the Android notification channels.
 */
async function createNativeChannels(
  PushNotifications: any,
  LocalNotifications: any,
): Promise<void> {
  if (
    Capacitor.getPlatform() !==
    "android"
  ) {
    return;
  }

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
 * Creates a stable positive numeric ID for
 * Capacitor Local Notifications.
 */
function createLocalNotificationId(
  value: string,
): number {
  let hash = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash =
      (hash << 5) -
      hash +
      value.charCodeAt(index);

    hash |= 0;
  }

  return (
    Math.abs(hash) % 2_000_000_000
  ) + 1;
}

/**
 * Displays a foreground native notification.
 *
 * Background/closed-app notification delivery is handled
 * by FCM/APNs.
 */
async function showForegroundNotification(
  LocalNotifications: any,
  event: any,
): Promise<void> {
  try {
    const data =
      (event?.notification?.data ??
        {}) as Record<
        string,
        unknown
      >;

    const notificationId = String(
      data.notificationId ??
        data.notification_id ??
        event?.notification?.id ??
        Date.now(),
    );

    const title =
      event?.notification?.title ??
      data.title ??
      "IyanjuPay";

    const body =
      event?.notification?.body ??
      data.body ??
      "You have a new notification.";

    const url =
      data.url
        ? String(data.url)
        : "/";

    const id =
      createLocalNotificationId(
        notificationId,
      );

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: String(title),
          body: String(body),
          channelId:
            ANDROID_CHANNEL_ID,
          sound: "default",
          extra: {
            url,
            notificationId,
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
}

/**
 * Safely handles a notification URL.
 *
 * Only internal application routes are accepted.
 */
function navigateFromNotification(
  url: unknown,
): void {
  try {
    if (
      typeof window === "undefined" ||
      !url
    ) {
      return;
    }

    const value = String(url);

    if (
      value.startsWith("/") &&
      !value.startsWith("//")
    ) {
      window.location.assign(value);
    }
  } catch (error) {
    console.warn(
      "Unable to navigate from notification.",
      error,
    );
  }
}

/**
 * Registers native Android/iOS push notifications.
 *
 * Android uses FCM.
 * iOS uses APNs.
 *
 * Foreground:
 *   Local Notifications
 *
 * Background/closed:
 *   Native FCM/APNs handling.
 */
export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) {
    return {
      enabled: false,
      reason: "web" as const,
    };
  }

  if (nativeRegistrationInProgress) {
    return {
      enabled: isPushEnabled(),
      reason: isPushEnabled()
        ? ("granted" as const)
        : ("error" as const),
    };
  }

  nativeRegistrationInProgress = true;

  try {
    const {
      PushNotifications,
    } = await import(
      "@capacitor/push-notifications"
    );

    const {
      LocalNotifications,
    } = await import(
      "@capacitor/local-notifications"
    );

    let permission =
      await PushNotifications.checkPermissions();

    if (
      permission.receive !==
      "granted"
    ) {
      permission =
        await PushNotifications.requestPermissions();
    }

    if (
      permission.receive !==
      "granted"
    ) {
      markPushEnabled(false);

      return {
        enabled: false,
        reason: "denied" as const,
      };
    }

    /**
     * Local notification permission is required
     * for foreground presentation.
     */
    try {
      let localPermission =
        await LocalNotifications.checkPermissions();

      if (
        localPermission.display !==
        "granted"
      ) {
        localPermission =
          await LocalNotifications.requestPermissions();
      }
    } catch (error) {
      console.warn(
        "Local notification permission setup failed.",
        error,
      );
    }

    await createNativeChannels(
      PushNotifications,
      LocalNotifications,
    );

    /**
     * Remove previous listeners before rebuilding them.
     *
     * This protects against:
     * - authentication restoration
     * - SIGNED_IN events
     * - application startup
     * - repeated push restoration
     * - development hot reload
     */
    try {
      await PushNotifications.removeAllListeners();
    } catch (error) {
      console.warn(
        "Unable to reset native push listeners.",
        error,
      );
    }

    try {
      await LocalNotifications.removeAllListeners();
    } catch (error) {
      console.warn(
        "Unable to reset local notification listeners.",
        error,
      );
    }

    /**
     * If we already have a native token stored locally,
     * synchronize it immediately with the currently
     * authenticated user.
     *
     * This is especially important after authentication
     * restoration.
     */
    const storedToken =
      getStoredNativeToken();

    if (storedToken) {
      const synchronized =
        await syncNativeToken(
          storedToken,
        );

      if (synchronized) {
        markPushEnabled(true);
      }
    }

    /**
     * FCM/APNs token registration.
     *
     * Push is not considered fully enabled until the
     * received token has successfully synchronized
     * with Supabase.
     */
    let tokenSynchronized = false;

    await PushNotifications.addListener(
      "registration",
      async (token) => {
        try {
          if (
            !token?.value
          ) {
            markPushEnabled(false);
            return;
          }

          tokenSynchronized =
            await syncNativeToken(
              token.value,
            );

          if (
            tokenSynchronized
          ) {
            markPushEnabled(true);
          } else {
            markPushEnabled(false);
          }
        } catch (error) {
          console.warn(
            "Native push token registration handling failed.",
            error,
          );

          markPushEnabled(false);
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

        markPushEnabled(false);
      },
    );

    /**
     * Foreground push handling.
     *
     * Background and closed-app notifications are handled
     * directly by FCM/APNs.
     */
    await PushNotifications.addListener(
      "pushNotificationReceived",
      async (event) => {
        await showForegroundNotification(
          LocalNotifications,
          event,
        );
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
            (event?.notification
              ?.data ??
              {}) as Record<
              string,
              unknown
            >;

          navigateFromNotification(
            data.url,
          );
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
            (event?.notification
              ?.extra ??
              {}) as Record<
              string,
              unknown
            >;

          navigateFromNotification(
            extra.url,
          );
        } catch (error) {
          console.warn(
            "Unable to handle local notification action.",
            error,
          );
        }
      },
    );

    /**
     * Start native FCM/APNs registration.
     */
    await PushNotifications.register();

    /**
     * Do not automatically mark push as enabled here.
     *
     * The registration callback is responsible for setting
     * PUSH_ENABLED_KEY after successful token synchronization.
     *
     * If an existing stored token was already synchronized,
     * retain the enabled state.
     */
    if (
      !tokenSynchronized &&
      !storedToken
    ) {
      markPushEnabled(false);
    }

    return {
      enabled:
        tokenSynchronized ||
        (Boolean(storedToken) &&
          isPushEnabled()),
      reason:
        tokenSynchronized ||
        (Boolean(storedToken) &&
          isPushEnabled())
          ? ("granted" as const)
          : ("registration_failed" as const),
    };
  } catch (error) {
    console.warn(
      "Native push registration failed.",
      error,
    );

    markPushEnabled(false);

    return {
      enabled: false,
      reason: "error" as const,
    };
  } finally {
    nativeRegistrationInProgress = false;
  }
}

/**
 * Disables native push notifications and removes
 * the device token from Supabase.
 */
export async function disableNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    markPushEnabled(false);
    return;
  }

  try {
    const {
      PushNotifications,
    } = await import(
      "@capacitor/push-notifications"
    );

    const {
      LocalNotifications,
    } = await import(
      "@capacitor/local-notifications"
    );

    const token =
      getStoredNativeToken();

    if (token) {
      try {
        await db
          .from(
            "user_push_subscriptions",
          )
          .delete()
          .eq(
            "device_token",
            token,
          );
      } catch (error) {
        console.warn(
          "Unable to remove native push subscription.",
          error,
        );
      }
    }

    removeStoredNativeToken();

    try {
      await PushNotifications.unregister();
    } catch (error) {
      console.warn(
        "Native push unregister failed.",
        error,
      );
    }

    try {
      await PushNotifications.removeAllListeners();
    } catch (error) {
      console.warn(
        "Unable to remove native push listeners.",
        error,
      );
    }

    try {
      await LocalNotifications.removeAllListeners();
    } catch (error) {
      console.warn(
        "Unable to remove local notification listeners.",
        error,
      );
    }
  } catch (error) {
    console.warn(
      "Native push disable failed.",
      error,
    );
  } finally {
    markPushEnabled(false);
    nativeRegistrationInProgress = false;
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
      (await supabase.auth.getUser())
        .data.user;

    if (!user) {
      return;
    }

    if (
      Capacitor.isNativePlatform()
    ) {
      const {
        PushNotifications,
      } = await import(
        "@capacitor/push-notifications"
      );

      const permission =
        await PushNotifications.checkPermissions();

      if (
        permission.receive ===
        "granted"
      ) {
        await registerNativePush();
      }

      return;
    }

    if (
      isWebPushSupported() &&
      Notification.permission ===
        "granted"
    ) {
      const synchronized =
        await syncWebPushSubscription();

      if (!synchronized) {
        console.warn(
          "Existing Web Push subscription could not be synchronized.",
        );
      }
    }
  } catch (error) {
    console.warn(
      "Push notification initialization failed.",
      error,
    );
  }
}

/**
 * Restores an existing push registration after
 * authentication has been restored.
 *
 * This function NEVER requests notification permission.
 *
 * App.tsx uses this after:
 * - Supabase session restoration
 * - SIGNED_IN/authentication changes
 *
 * This prevents push registration from running before
 * the authenticated user's ID is available.
 */
export async function restorePushRegistration(): Promise<void> {
  try {
    const user =
      (await supabase.auth.getUser())
        .data.user;

    if (!user) {
      return;
    }

    if (!isPushEnabled()) {
      return;
    }

    /**
     * Native Android/iOS.
     */
    if (
      Capacitor.isNativePlatform()
    ) {
      const {
        PushNotifications,
      } = await import(
        "@capacitor/push-notifications"
      );

      const permission =
        await PushNotifications.checkPermissions();

      if (
        permission.receive !==
        "granted"
      ) {
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
      Notification.permission ===
        "granted"
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
  if (
    Capacitor.isNativePlatform()
  ) {
    return registerNativePush();
  }

  return requestWebPushPermission();
}
