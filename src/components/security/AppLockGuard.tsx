import { useEffect, useState } from "react";
import { Fingerprint, LockKeyhole, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authenticateWithBiometric, isBiometricEnabled } from "@/lib/biometricAuth";

const ENABLED_KEY = "iyanjupay-app-lock-enabled";
const TIMEOUT_KEY = "iyanjupay-app-lock-timeout";

function readEnabled() {
  return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "true";
}

function readTimeout() {
  return Math.max(30, Number(localStorage.getItem(TIMEOUT_KEY) || 300));
}

export default function AppLockGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    let hiddenAt: number | null = null;

    const lock = () => {
      if (readEnabled() && isBiometricEnabled()) setLocked(true);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (
        document.visibilityState === "visible" &&
        readEnabled() &&
        isBiometricEnabled() &&
        hiddenAt !== null
      ) {
        if ((Date.now() - hiddenAt) / 1000 >= readTimeout()) {
          setLocked(true);
        }
        hiddenAt = null;
      }
    };

    const onManualLock = () => lock();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("iyanjupay-lock-now", onManualLock);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("iyanjupay-lock-now", onManualLock);
    };
  }, [user]);

  useEffect(() => {
    const onStorage = () => {
      if (!readEnabled() || !isBiometricEnabled()) setLocked(false);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const unlock = async () => {
    setUnlocking(true);
    setError("");

    try {
      await authenticateWithBiometric("Unlock IyanjuPay");
      setLocked(false);
    } catch (error: any) {
      setError(error?.message || "Biometric verification failed.");
    } finally {
      setUnlocking(false);
    }
  };

  if (!user || !locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20">
          <LockKeyhole className="h-8 w-8 text-blue-400" />
        </div>

        <h1 className="text-2xl font-black">IyanjuPay is locked</h1>

        <p className="mt-2 text-sm text-slate-400">
          Unlock with your device fingerprint, Face ID, or another supported biometric method.
        </p>

        <Button className="mt-6 w-full" onClick={unlock} disabled={unlocking}>
          {unlocking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Fingerprint className="mr-2 h-4 w-4" />
          )}
          {unlocking ? "Verifying..." : "Unlock with biometrics"}
        </Button>

        {error && (
          <p className="mt-3 rounded-lg bg-red-950/50 p-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <Button
          variant="ghost"
          className="mt-3 w-full text-slate-300 hover:text-white"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
