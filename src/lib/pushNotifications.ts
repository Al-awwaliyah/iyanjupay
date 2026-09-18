import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const NATIVE_PUSH_TOKEN_KEY = "iyanjupay-native-push-token";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isWebPushSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export async function requestWebPushPermission() {
  if (!isWebPushSupported()) return { enabled: false, reason: "unsupported" as const };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { enabled: false, reason: permission as string };

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) return { enabled: false, reason: "missing_vapid_key" as const };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = subscription.toJSON();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("You must be signed in to enable push notifications.");

  const { error } = await db.from("user_push_subscriptions").upsert({
    user_id: user.id,
    platform: "web",
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh ?? null,
    auth: json.keys?.auth ?? null,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) throw error;
  return { enabled: true, reason: "granted" as const };
}

export async function disableWebPush() {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await db.from("user_push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) return { enabled: false, reason: "web" as const };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return { enabled: false, reason: "denied" as const };

    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener("registration", async (token) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value);
      await db.from("user_push_subscriptions").upsert({
        user_id: user.id,
        platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
        device_token: token.value,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "device_token" });
    });
    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Native push registration error:", error);
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const url = (event.notification?.data as any)?.url;
      if (url) window.location.assign(String(url));
    });
    await PushNotifications.register();
    return { enabled: true, reason: "granted" as const };
  } catch (error) {
    console.error("Native push registration failed:", error);
    return { enabled: false, reason: "error" as const };
  }
}

export async function disableNativePush() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const token = typeof window !== "undefined" ? localStorage.getItem(NATIVE_PUSH_TOKEN_KEY) : null;
    if (token) {
      await db.from("user_push_subscriptions").delete().eq("device_token", token);
      localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
    }
    await PushNotifications.unregister();
    await PushNotifications.removeAllListeners();
  } catch (error) {
    console.error("Native push disable failed:", error);
    throw error;
  }
}

export async function enablePushNotifications() {
  if (Capacitor.isNativePlatform()) return registerNativePush();
  return requestWebPushPermission();
}
