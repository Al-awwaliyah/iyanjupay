import { useEffect, useState } from "react";
import { ArrowLeft, Fingerprint, LockKeyhole, Bell, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  enablePushNotifications,
  disablePushNotifications,
  isPushEnabledForCurrentDevice,
  isWebPushSupported,
} from "@/lib/pushNotifications";
import {
  authenticateWithBiometric,
  checkBiometricAvailability,
  isBiometricEnabled,
  setBiometricEnabled,
} from "@/lib/biometricAuth";

const APP_LOCK_KEY = "iyanjupay-app-lock-enabled";
const APP_LOCK_TIMEOUT_KEY = "iyanjupay-app-lock-timeout";

export default function SecuritySettingsPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();

  const [appLock, setAppLock] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(APP_LOCK_KEY) === "true",
  );
  const [timeout, setTimeoutValue] = useState(
    () => typeof window !== "undefined" ? localStorage.getItem(APP_LOCK_TIMEOUT_KEY) ?? "300" : "300",
  );
  const [biometricEnabled, setBiometricEnabledState] = useState(() => isBiometricEnabled());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Checking device security...");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void isPushEnabledForCurrentDevice().then((enabled) => {
      if (!cancelled) setPushEnabled(enabled);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void checkBiometricAvailability().then((result) => {
      if (cancelled) return;
      setBiometricAvailable(result.available);
      setBiometricLabel(result.label);

      if (!result.available && isBiometricEnabled()) {
        setBiometricEnabled(false);
        setBiometricEnabledState(false);
        setAppLock(false);
        localStorage.setItem(APP_LOCK_KEY, "false");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBiometric = async (enabled: boolean) => {
    if (working) return;

    if (!enabled) {
      setBiometricEnabled(false);
      setBiometricEnabledState(false);

      // App Lock depends on biometric authentication. Disabling the
      // biometric method therefore also disables automatic app locking.
      if (appLock) {
        setAppLock(false);
        localStorage.setItem(APP_LOCK_KEY, "false");
      }

      toast({
        title: "Biometric authentication disabled",
        description: "IyanjuPay will no longer use device biometrics to unlock the app.",
      });
      return;
    }

    setWorking(true);

    try {
      const availability = await checkBiometricAvailability();

      if (!availability.available) {
        throw new Error(
          availability.label ||
            "No supported biometric is enrolled on this device.",
        );
      }

      // Ask for a real biometric confirmation before enabling the setting.
      await authenticateWithBiometric("Enable biometric authentication for IyanjuPay");

      setBiometricEnabled(true);
      setBiometricEnabledState(true);

      toast({
        title: "Biometric authentication enabled",
        description: `${availability.label} is now enabled for IyanjuPay.`,
      });
    } catch (error: any) {
      setBiometricEnabled(false);
      setBiometricEnabledState(false);

      toast({
        title: "Biometric setup cancelled",
        description: error?.message ?? "Biometric authentication could not be enabled.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const toggleAppLock = (enabled: boolean) => {
    if (enabled && !biometricEnabled) {
      toast({
        title: "Enable biometric authentication first",
        description: "App Lock uses your device's biometric authentication to unlock IyanjuPay.",
        variant: "destructive",
      });
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
    if (working) return;
    setWorking(true);

    try {
      const result = await enablePushNotifications();
      if (!result.enabled) {
        throw new Error(`Push notifications could not be enabled (${result.reason}).`);
      }

      setPushEnabled(true);

      toast({
        title: "Push notifications enabled",
        description: "IyanjuPay can now notify this device about new alerts.",
      });
    } catch (error: any) {
      setPushEnabled(false);

      toast({
        title: "Push setup failed",
        description: error?.message ?? "Please check notification permissions and try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const disablePush = async () => {
    if (working) return;
    setWorking(true);

    try {
      await disablePushNotifications();
      setPushEnabled(false);

      toast({
        title: "Push notifications disabled",
      });
    } catch (error: any) {
      toast({
        title: "Unable to disable push",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const lockNow = () => window.dispatchEvent(new CustomEvent("iyanjupay-lock-now"));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Security & Notifications</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Biometric Authentication
            </CardTitle>
            <CardDescription>
              Use your device fingerprint, Face ID, or another supported biometric method to unlock IyanjuPay.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="biometric-authentication">Biometric authentication</Label>
                <p className="mt-1 text-sm text-slate-500">
                  {biometricAvailable
                    ? biometricLabel
                    : "Available in the IyanjuPay mobile app when a supported biometric is enrolled."}
                </p>
              </div>

              <Switch
                id="biometric-authentication"
                checked={biometricEnabled}
                onCheckedChange={toggleBiometric}
                disabled={working || !biometricAvailable}
              />
            </div>

            {working && biometricEnabled === false && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying biometric security...
              </div>
            )}

            <p className={`rounded-lg p-3 text-sm ${
              biometricEnabled
                ? "bg-emerald-50 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}>
              {biometricEnabled
                ? "✓ Biometric authentication enabled."
                : "Biometric authentication disabled."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5" />
              App Lock
            </CardTitle>
            <CardDescription>
              Lock the app after inactivity or when it has been in the background. Unlock with biometric authentication.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="app-lock">Require unlock</Label>
                <p className="text-sm text-slate-500">
                  Keep your active session while the app is locked.
                </p>
              </div>

              <Switch
                id="app-lock"
                checked={appLock}
                onCheckedChange={toggleAppLock}
                disabled={!biometricEnabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label>Lock after</Label>
              <Select value={timeout} onValueChange={changeTimeout}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="900">15 minutes</SelectItem>
                  <SelectItem value="1800">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={lockNow} disabled={!appLock}>
              Lock IyanjuPay now
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Push Notifications
            </CardTitle>
            <CardDescription>
              Receive notifications even when the app is not in the foreground where the platform supports it.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!isWebPushSupported() && (
              <p className="text-sm text-slate-500">
                Web push is unavailable in this browser. Capacitor builds use native push registration.
              </p>
            )}

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="push-notifications">Push notifications</Label>
                <p className="text-sm text-slate-500">
                  {pushEnabled
                    ? "Push notifications enabled for this device."
                    : "Push notifications disabled for this device."}
                </p>
              </div>

              <Switch
                id="push-notifications"
                checked={pushEnabled}
                onCheckedChange={(enabled) => {
                  if (enabled) {
                    void enablePush();
                  } else {
                    void disablePush();
                  }
                }}
                disabled={working}
              />
            </div>

            <p className="text-xs text-slate-500">
              Push delivery also requires VAPID credentials and the Supabase push function/webhook to be configured for production.
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="flex gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" />
            <p className="text-sm text-blue-900">
              IyanjuPay does not receive or store your biometric data. The device's native biometric security screen performs the verification.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
