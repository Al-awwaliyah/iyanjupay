import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Fingerprint, LockKeyhole, Bell, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { enablePushNotifications, disableWebPush, isWebPushSupported } from "@/lib/pushNotifications";

const db = supabase as any;
const APP_LOCK_KEY = "iyanjupay-app-lock-enabled";
const APP_LOCK_TIMEOUT_KEY = "iyanjupay-app-lock-timeout";

function passkeySupported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

export default function SecuritySettingsPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [appLock, setAppLock] = useState(() => localStorage.getItem(APP_LOCK_KEY) === "true");
  const [timeout, setTimeoutValue] = useState(() => localStorage.getItem(APP_LOCK_TIMEOUT_KEY) ?? "300");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [working, setWorking] = useState(false);

  const loadPasskeys = useCallback(async () => {
    if (!passkeySupported()) { setLoadingPasskeys(false); return; }
    try {
      const { data, error } = await (supabase.auth as any).passkey.list();
      if (error) throw error;
      setPasskeys(data ?? []);
    } catch (error) {
      console.warn("Unable to list passkeys:", error);
    } finally { setLoadingPasskeys(false); }
  }, []);

  useEffect(() => { void loadPasskeys(); }, [loadPasskeys]);

  const registerPasskey = async () => {
    if (!passkeySupported()) {
      toast({ title: "Passkeys unavailable", description: "Use a modern HTTPS browser or supported device.", variant: "destructive" });
      return;
    }
    setWorking(true);
    try {
      const { error } = await (supabase.auth as any).registerPasskey();
      if (error) throw error;
      await loadPasskeys();
      toast({ title: "Biometric security enabled", description: "Your device passkey can now be used for sign-in and app unlock." });
    } catch (error: any) {
      toast({ title: "Passkey registration failed", description: error?.message ?? "The passkey ceremony was cancelled or unavailable.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const removePasskey = async (id: string) => {
    setWorking(true);
    try {
      const { error } = await (supabase.auth as any).passkey.delete({ passkeyId: id });
      if (error) throw error;
      await loadPasskeys();
      if (passkeys.length <= 1) {
        setAppLock(false);
        localStorage.setItem(APP_LOCK_KEY, "false");
      }
    } catch (error: any) {
      toast({ title: "Unable to remove passkey", description: error?.message ?? "Please try again.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const toggleAppLock = (enabled: boolean) => {
    if (enabled && passkeys.length === 0) {
      toast({ title: "Register a passkey first", description: "App Lock uses your device's biometric/passkey authentication to unlock IyanjuPay.", variant: "destructive" });
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
      toast({ title: "Push notifications enabled", description: "IyanjuPay can now notify this device about new alerts." });
    } catch (error: any) {
      toast({ title: "Push setup failed", description: error?.message ?? "Please check notification permissions and try again.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const disablePush = async () => {
    setWorking(true);
    try {
      await disableWebPush();
      setPushEnabled(false);
      toast({ title: "Push notifications disabled" });
    } catch (error: any) {
      toast({ title: "Unable to disable push", description: error?.message ?? "Please try again.", variant: "destructive" });
    } finally { setWorking(false); }
  };

  const lockNow = () => window.dispatchEvent(new CustomEvent("iyanjupay-lock-now"));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3"><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><h1 className="text-2xl font-bold">Security & Notifications</h1></div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Biometric / Face / Passkey</CardTitle><CardDescription>Use your device's biometrics, device PIN, or security key through WebAuthn.</CardDescription></CardHeader><CardContent className="space-y-4">
          {!passkeySupported() && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Passkeys require a supported browser/device and HTTPS in production.</p>}
          <Button onClick={registerPasskey} disabled={working || !passkeySupported()}><Fingerprint className="mr-2 h-4 w-4" />Register this device</Button>
          {loadingPasskeys ? <Loader2 className="h-4 w-4 animate-spin" /> : passkeys.length === 0 ? <p className="text-sm text-slate-500">No passkeys registered.</p> : <div className="space-y-2">{passkeys.map((key) => <div key={key.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{key.friendly_name || "Device passkey"}</p><p className="text-xs text-slate-500">Added {new Date(key.created_at).toLocaleString("en-NG")}</p></div><Button variant="ghost" size="icon" onClick={() => removePasskey(key.id)} disabled={working}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>)}</div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />App Lock</CardTitle><CardDescription>Lock the app after inactivity/backgrounding. Unlock with a registered passkey.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center justify-between"><div><Label htmlFor="app-lock">Require unlock</Label><p className="text-sm text-slate-500">Keep your active session while the app is locked.</p></div><Switch id="app-lock" checked={appLock} onCheckedChange={toggleAppLock} /></div>
          <div className="flex items-center justify-between gap-4"><Label>Lock after</Label><Select value={timeout} onValueChange={changeTimeout}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="60">1 minute</SelectItem><SelectItem value="300">5 minutes</SelectItem><SelectItem value="900">15 minutes</SelectItem><SelectItem value="1800">30 minutes</SelectItem></SelectContent></Select></div>
          <Button variant="outline" onClick={lockNow} disabled={!appLock}>Lock IyanjuPay now</Button>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Push Notifications</CardTitle><CardDescription>Receive notifications even when the app is not in the foreground where the platform supports it.</CardDescription></CardHeader><CardContent className="space-y-3">
          {!isWebPushSupported() && <p className="text-sm text-slate-500">Web push is unavailable in this browser. Capacitor builds use native push registration.</p>}
          <div className="flex gap-2"><Button onClick={enablePush} disabled={working}><Bell className="mr-2 h-4 w-4" />Enable push</Button><Button variant="outline" onClick={disablePush} disabled={working}>Disable web push</Button></div>
          <p className="text-xs text-slate-500">Push delivery also requires VAPID credentials and the Supabase push function/webhook to be configured for production.</p>
        </CardContent></Card>

        <Card className="border-blue-200 bg-blue-50/50"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" /><p className="text-sm text-blue-900">Passkeys never expose your biometric data to IyanjuPay. The device authenticator performs the biometric check and signs a WebAuthn challenge.</p></CardContent></Card>
      </div>
    </div>
  );
}
