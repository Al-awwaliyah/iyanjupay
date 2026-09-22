import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const NATIVE_PUSH_TOKEN_KEY = "iyanjupay-native-push-token";
const PUSH_ENABLED_KEY = "iyanjupay-push-enabled";
const WEB_PUSH_VAPID_KEY_MARKER =
  "iyanjupay-web-push-vapid-key";
const WEB_PUSH_MIGRATION_KEY =
  "iyanjupay-web-push-vapid-migration-v1";
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
 * Returns the current frontend VAPID public key.
 *
 * This value is public and is safe to use in the browser.
 */
function getWebPushVapidPublicKey():
  | string
  | null {
  const key =
    import.meta.env.VITE_VAPID_PUBLIC_KEY as
      | string
      | undefined;

  return key?.trim() || null;
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

function getStoredWebPushVapidKey():
  | string
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(
    WEB_PUSH_VAPID_KEY_MARKER,
  );
}

function storeWebPushVapidKey(
  key: string,
): void {
  if (
    typeof window !== "undefined" &&
    key
  ) {
    window.localStorage.setItem(
      WEB_PUSH_VAPID_KEY_MARKER,
      key,
    );
  }
}

function getWebPushMigrationVersion():
  | string
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(
    WEB_PUSH_MIGRATION_KEY,
  );
}

function markWebPushMigrationComplete(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      WEB_PUSH_MIGRATION_KEY,
      "v1",
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
 * Removes a Web Push subscription from Supabase.
 *
 * This is intentionally endpoint-based because endpoint is
 * the unique identifier used by the existing schema.
 */
async function removeWebSubscriptionFromDatabase(
  endpoint: string,
): Promise<void> {
  if (!endpoint) {
    return;
  }

  try {
    await db
      .from("user_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
  } catch (error) {
    console.warn(
      "Unable to remove old Web Push subscription.",
      error,
    );
  }
}

/**
 * Creates a fresh browser Web Push subscription using
 * the current frontend VAPID public key.
 */
async function createFreshWebPushSubscription(
  registration: ServiceWorkerRegistration,
  vapidKey: string,
): Promise<PushSubscription | null> {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(vapidKey),
    });
  } catch (error) {
    console.warn(
      "Unable to create a fresh Web Push subscription.",
      error,
    );

    return null;
  }
}

/**
 * Replaces an existing browser subscription.
 *
 * This is used when:
 * - the VAPID public key changed;
 * - the subscription was created before the
 *   current Web Push configuration;
 * - an existing subscription must be migrated.
 */
async function replaceWebPushSubscription(
  registration: ServiceWorkerRegistration,
  currentVapidKey: string,
  existingSubscription?: PushSubscription | null,
): Promise<PushSubscription | null> {
  let oldEndpoint: string | null = null;

  try {
    const subscription =
      existingSubscription ??
      (await registration.pushManager.getSubscription());

    if (subscription) {
      oldEndpoint =
        subscription.endpoint;

      try {
        await subscription.unsubscribe();
      } catch (error) {
        console.warn(
          "Unable to unsubscribe old Web Push subscription.",
          error,
        );
      }
    }
  } catch (error) {
    console.warn(
      "Unable to inspect old Web Push subscription.",
      error,
    );
  }

  if (oldEndpoint) {
    await removeWebSubscriptionFromDatabase(
      oldEndpoint,
    );
  }

  return createFreshWebPushSubscription(
    registration,
    currentVapidKey,
  );
}

/**
 * Synchronizes an existing browser Web Push subscription
 * with Supabase.
 *
 * This function never requests permission.
 *
 * IMPORTANT:
 * It also performs the one-time migration of existing
 * subscriptions created before the current VAPID key.
 */
async function upsertWebSubscription(): Promise<boolean> {
  try {
    if (!isWebPushSupported()) {
      return false;
    }

    const vapidKey =
      getWebPushVapidPublicKey();

    if (!vapidKey) {
      console.warn(
        "VITE_VAPID_PUBLIC_KEY is not configured.",
      );

      return false;
    }

    const user =
      (await supabase.auth.getUser())
        .data.user;

    if (!user) {
      return false;
    }

    const registration =
      await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    /**
     * Existing users may have a browser subscription that
     * was created with the previous VAPID key.
     *
     * Since PushSubscription does not expose the original
     * applicationServerKey, use a local migration marker.
     *
     * If the marker is missing, migrate the existing
     * subscription once.
     */
    const storedVapidKey =
      getStoredWebPushVapidKey();

    const migrationComplete =
      getWebPushMigrationVersion() ===
      "v1";

    if (
      !migrationComplete ||
      !storedVapidKey ||
      storedVapidKey !== vapidKey
    ) {
      const oldSubscription =
        subscription;

      subscription =
        await replaceWebPushSubscription(
          registration,
          vapidKey,
          oldSubscription,
        );

      if (!subscription) {
        return false;
      }

      markWebPushMigrationComplete();
    }

    const json =
      subscription.toJSON();

    if (!json.endpoint) {
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

    storeWebPushVapidKey(
      vapidKey,
    );

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
      getWebPushVapidPublicKey();

    if (!vapidKey) {
      markPushEnabled(false);

      return {
        enabled: false,
        reason:
          "missing_vapid_key" as const,
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

    const registration =
      await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    /**
     * Existing browser subscriptions are reused only
     * when they have already been migrated to the
     * current VAPID configuration.
     */
    const storedVapidKey =
      getStoredWebPushVapidKey();

    const migrationComplete =
      getWebPushMigrationVersion() ===
      "v1";

    if (
      subscription &&
      (
        !migrationComplete ||
        !storedVapidKey ||
        storedVapidKey !== vapidKey
      )
    ) {
      subscription =
        await replaceWebPushSubscription(
          registration,
          vapidKey,
          subscription,
        );

      if (!subscription) {
        markPushEnabled(false);

        return {
          enabled: false,
          reason:
            "registration_failed" as const,
        };
      }

      markWebPushMigrationComplete();
    }

    /**
     * No existing subscription.
     *
     * Create a new one using the current VAPID public key.
     */
    if (!subscription) {
      subscription =
        await createFreshWebPushSubscription(
          registration,
          vapidKey,
        );

      if (!subscription) {
        markPushEnabled(false);

        return {
          enabled: false,
          reason:
            "registration_failed" as const,
        };
      }

      markWebPushMigrationComplete();
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

    storeWebPushVapidKey(
      vapidKey,
    );

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

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(
        WEB_PUSH_VAPID_KEY_MARKER,
      );
      window.localStorage.removeItem(
        WEB_PUSH_MIGRATION_KEY,
      );
    }

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

      await removeWebSubscriptionFromDatabase(
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

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(
        WEB_PUSH_VAPID_KEY_MARKER,
      );
      window.localStorage.removeItem(
        WEB_PUSH_MIGRATION_KEY,
      );
    }
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
