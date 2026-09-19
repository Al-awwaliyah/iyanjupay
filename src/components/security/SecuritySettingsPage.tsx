import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Fingerprint, LockKeyhole, Bell, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { enablePushNotifications, disableWebPush, disableNativePush, isWebPushSupported } from "@/lib/pushNotifications";

const db = supabase as any;
const APP_LOCK_KEY = "iyanjupay-app-lock-enabled";
const APP_LOCK_TIMEOUT_KEY = "iyanjupay-app-lock-timeout";
const BIOMETRIC_KEY = "iyanjupay-biometric-enabled";
const PUSH_ENABLED_KEY = "iyanjupay-push-enabled";

function webAuthnSupported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

async function platformAuthenticatorAvailable() {
  if (!webAuthnSupported()) return false;
  try {
    const checker = (window.PublicKeyCredential as typeof PublicKeyCredential & {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    }).isUserVerifyingPlatformAuthenticatorAvailable;
    return typeof checker === "function" ? await checker.call(window.PublicKeyCredential) : true;
  } catch {
    return false;
  }
}

export default function SecuritySettingsPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [biometricEnabled, setBiometricEnabled] = useState(() => localStorage.getItem(BIOMETRIC_KEY) === "true");
  const [hasBiometricCredential, setHasBiometricCredential] = useState(false);
  const [loadingBiometric, setLoadingBiometric] = useState(true);
  const [appLock, setAppLock] = useState(() => localStorage.getItem(APP_LOCK_KEY) === "true");
  const [timeout, setTimeoutValue] = useState(() => localStorage.getItem(APP_LOCK_TIMEOUT_KEY) ?? "300");
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem(PUSH_ENABLED_KEY) === "true");
  const [working, setWorking] = useState(false);

  const loadBiometricStatus = useCallback(async () => {
    if (!webAuthnSupported()) {
      setHasBiometricCredential(false);
      setLoadingBiometric(false);
      return;
    }

    try {
      const { data, error } = await db.auth.passkey.list();
      if (error) throw error;
      const credentials = Array.isArray(data) ? data : [];
      const available = credentials.length > 0;
      setHasBiometricCredential(available);

      // A credential is required for the biometric toggle to remain enabled.
      if (!available && localStorage.getItem(BIOMETRIC_KEY) === "true") {
        localStorage.setItem(BIOMETRIC_KEY, "false");
        localStorage.setItem(APP_LOCK_KEY, "false");
        setBiometricEnabled(false);
        setAppLock(false);
      }
    } catch (error) {
      console.warn("Unable to check biometric credentials:", error);
    } finally {
      setLoadingBiometric(false);
    }
  }, []);

  useEffect(() => {
    void loadBiometricStatus();
  }, [loadBiometricStatus]);

  useEffect(() => {
    const loadPushStatus = async () => {
      if (Capacitor.isNativePlatform()) return;
      if (!isWebPushSupported()) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const enabled = Boolean(subscription);
        setPushEnabled(enabled);
        localStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
      } catch (error) {
        console.warn("Unable to check push subscription:", error);
      }
    };
    void loadPushStatus();
  }, []);

  const toggleBiometric = async (enabled: boolean) => {
    if (!enabled) {
      setBiometricEnabled(false);
      localStorage.setItem(BIOMETRIC_KEY, "false");
      // App Lock depends on biometric authentication to unlock the app.
      setAppLock(false);
      localStorage.setItem(APP_LOCK_KEY, "false");
      toast({ title: "Biometric authentication disabled", description: "Your registered device credential remains available if you enable biometrics again." });
      return;
    }

    if (!webAuthnSupported()) {
      toast({ title: "Biometric authentication unavailable", description: "Use a supported HTTPS browser or device.", variant: "destructive" });
      return;
    }

    setWorking(true);
    try {
      const platformAvailable = await platformAuthenticatorAvailable();
      if (!platformAvailable) {
        throw new Error("This device does not provide a supported biometric or device-verification authenticator.");
      }

      if (!hasBiometricCredential) {
        // Do not start a passkey-registration ceremony from this toggle.
        // Supabase's browser biometric implementation is WebAuthn/passkey-based;
        // without an already enrolled credential there is no biometric-only
        // browser API that can be enabled by a toggle alone.
        throw new Error("No device biometric credential is enrolled for this account yet. IyanjuPay will not start passkey creation from this toggle.");
      }

      setBiometricEnabled(true);
      localStorage.setItem(BIOMETRIC_KEY, "true");
      toast({ title: "Biometric authentication enabled", description: "Your enrolled device biometric can now unlock IyanjuPay." });
    } catch (error: any) {
      setBiometricEnabled(false);
      localStorage.setItem(BIOMETRIC_KEY, "false");
      toast({ title: "Biometric setup failed", description: error?.message ?? "The biometric setup was cancelled or unavailable.", variant: "destructive" });
    } finally {
      setWorking(false);
      await loadBiometricStatus();
    }
  };

  const toggleAppLock = (enabled: boolean) => {
    if (enabled && !biometricEnabled) {
      toast({ title: "Enable biometric authentication first", description: "App Lock uses your device's biometric or secure device verification to unlock IyanjuPay.", variant: "destructive" });
      return;
    }
    setAppLock(enabled);
    localStorage.setItem(APP_LOCK_KEY, String(enabled));
    localStorage.setItem(APP_LOCK_TIMEOUT_KEY, timeout);
  };

  const changeTimeout = (value: string) => {
    setTimeoutValue(value);
    localStorage.setItem(APP_LOCK_TIMEOUT_KEY, value);
  };

  const enablePush = async () => {
    setWorking(true);
    try {
      const result = await enablePushNotifications();
      if (!result.enabled) throw new Error(`Push notifications could not be enabled (${result.reason}).`);
      setPushEnabled(true);
      localStorage.setItem(PUSH_ENABLED_KEY, "true");
      toast({ title: "Push notifications enabled", description: "IyanjuPay can now notify this device about new alerts." });
    } catch (error: any) {
      setPushEnabled(false);
      toast({ title: "Push setup failed", description: error?.message ?? "Please check notification permissions and try again.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const disablePush = async () => {
    setWorking(true);
    try {
      if (Capacitor.isNativePlatform()) await disableNativePush();
      else await disableWebPush();
      setPushEnabled(false);
      localStorage.setItem(PUSH_ENABLED_KEY, "false");
      toast({ title: "Push notifications disabled" });
    } catch (error: any) {
      toast({ title: "Unable to disable push", description: error?.message ?? "Please try again.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const togglePush = async (enabled: boolean) => {
    if (enabled) await enablePush();
    else await disablePush();
  };

  const lockNow = () => window.dispatchEvent(new CustomEvent("iyanjupay-lock-now"));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3"><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><h1 className="text-2xl font-bold">Security & Notifications</h1></div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Biometric Authentication</CardTitle><CardDescription>Use Face ID, fingerprint, Windows Hello, or your device's supported secure verification to protect IyanjuPay.</CardDescription></CardHeader><CardContent className="space-y-4">
          {!webAuthnSupported() && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Biometric authentication requires a supported browser/device and HTTPS in production.</p>}
          <div className="flex items-center justify-between gap-4"><div><Label htmlFor="biometric-auth">Biometric Authentication</Label><p className="text-sm text-slate-500">Enable device biometric or secure device verification for IyanjuPay.</p></div><Switch id="biometric-auth" checked={biometricEnabled} onCheckedChange={toggleBiometric} disabled={working || loadingBiometric || !webAuthnSupported()} /></div>
          {loadingBiometric ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking biometric status...</div> : biometricEnabled && hasBiometricCredential ? <p className="text-sm font-medium text-emerald-600">✓ Biometric authentication enabled</p> : hasBiometricCredential ? <p className="text-sm text-slate-500">Biometric is available but currently disabled.</p> : <p className="text-sm text-slate-500">No enrolled device biometric credential is available. The toggle will not start passkey creation.</p>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />App Lock</CardTitle><CardDescription>Lock the app after inactivity or backgrounding. Unlock with your enabled biometric authentication.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center justify-between"><div><Label htmlFor="app-lock">Require unlock</Label><p className="text-sm text-slate-500">Keep your active session while the app is locked.</p></div><Switch id="app-lock" checked={appLock} onCheckedChange={toggleAppLock} disabled={!biometricEnabled} /></div>
          <div className="flex items-center justify-between gap-4"><Label>Lock after</Label><Select value={timeout} onValueChange={changeTimeout} disabled={!appLock}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="60">1 minute</SelectItem><SelectItem value="300">5 minutes</SelectItem><SelectItem value="900">15 minutes</SelectItem><SelectItem value="1800">30 minutes</SelectItem></SelectContent></Select></div>
          <Button variant="outline" onClick={lockNow} disabled={!appLock}>Lock IyanjuPay now</Button>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Push Notifications</CardTitle><CardDescription>Receive notifications even when the app is not in the foreground where the platform supports it.</CardDescription></CardHeader><CardContent className="space-y-3">
          {!isWebPushSupported() && <p className="text-sm text-slate-500">Web push is unavailable in this browser. Capacitor builds use native push registration.</p>}
          <div className="flex items-center justify-between gap-4"><div><Label htmlFor="push-notifications">Push Notifications</Label><p className="text-sm text-slate-500">Allow IyanjuPay to send alerts to this device.</p></div><Switch id="push-notifications" checked={pushEnabled} onCheckedChange={togglePush} disabled={working} /></div>
          <p className="text-xs text-slate-500">Push delivery also requires VAPID credentials and the Supabase push function/webhook to be configured for production.</p>
        </CardContent></Card>

        <Card className="border-blue-200 bg-blue-50/50"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" /><p className="text-sm text-blue-900">Your biometric data stays with your device. IyanjuPay receives a cryptographic authentication result from the device's secure authenticator.</p></CardContent></Card>
      </div>
    </div>
  );
}
