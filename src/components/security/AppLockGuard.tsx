import { useCallback, useEffect, useState } from "react";
import { Fingerprint, LockKeyhole, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authenticateWithBiometric } from "@/lib/biometricAuth";

const ENABLED_KEY = "iyanjupay-app-lock-enabled";
const BIOMETRIC_KEY = "iyanjupay-biometric-enabled";
const TIMEOUT_KEY = "iyanjupay-app-lock-timeout";
const LOCKED_KEY = "iyanjupay-app-lock-is-locked";
const HIDDEN_AT_KEY = "iyanjupay-app-lock-hidden-at";
const MANUAL_LOCK_EVENT = "iyanjupay-lock-now";

function readEnabled(): boolean {
  return typeof window !== "undefined" &&
    localStorage.getItem(ENABLED_KEY) === "true" &&
    localStorage.getItem(BIOMETRIC_KEY) === "true";
}

function readTimeout(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(TIMEOUT_KEY);
  if (raw === "0") return 0;
  const value = Number(raw ?? 300);
  return Number.isFinite(value) ? Math.max(0, value) : 300;
}

function setPersistedLock(locked: boolean) {
  try {
    if (locked) localStorage.setItem(LOCKED_KEY, "true");
    else {
      localStorage.removeItem(LOCKED_KEY);
      localStorage.removeItem(HIDDEN_AT_KEY);
    }
  } catch {
    // The in-memory lock still protects the current page if storage is unavailable.
  }
}

function shouldLockOnReturn(): boolean {
  if (!readEnabled()) return false;

  // A refresh/reload must not silently bypass an enabled app lock.
  if (localStorage.getItem(LOCKED_KEY) === "true") return true;

  const hiddenAt = Number(localStorage.getItem(HIDDEN_AT_KEY) ?? 0);
  if (!hiddenAt) return false;

  const timeoutSeconds = readTimeout();
  return timeoutSeconds === 0 ||
    Date.now() - hiddenAt >= timeoutSeconds * 1000;
}

export default function AppLockGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [locked, setLocked] = useState(() => shouldLockOnReturn());
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  const lock = useCallback(() => {
    if (!readEnabled()) return;
    setPersistedLock(true);
    setLocked(true);
  }, []);

  useEffect(() => {
    // Do not clear the persisted lock while Supabase is still restoring
    // the session; doing so would let a hard refresh bypass the lock.
    if (authLoading) return;

    if (!user) {
      setLocked(false);
      setPersistedLock(false);
      return;
    }

    // Re-evaluate after auth restoration, including a hard refresh.
    if (shouldLockOnReturn()) setLocked(true);

    const recordBackgroundTime = () => {
      if (!readEnabled()) return;
      try {
        localStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
      } catch {
        // Continue with the in-memory lifecycle handling.
      }
      if (readTimeout() === 0) lock();
    };

    const handleForeground = () => {
      if (!readEnabled()) {
        setLocked(false);
        setPersistedLock(false);
        return;
      }
      if (shouldLockOnReturn()) lock();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordBackgroundTime();
      } else {
        handleForeground();
      }
    };

    const onPageHide = () => {
      recordBackgroundTime();
    };

    const onPageShow = () => handleForeground();
    const onBeforeUnload = () => {
      if (readEnabled()) setPersistedLock(true);
    };
    const onManualLock = () => lock();
    const onStorage = (event: StorageEvent) => {
      if (event.key === ENABLED_KEY || event.key === BIOMETRIC_KEY) {
        if (!readEnabled()) {
          setLocked(false);
          setPersistedLock(false);
        }
      }
      if (event.key === LOCKED_KEY && event.newValue === "true") {
        setLocked(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener(MANUAL_LOCK_EVENT, onManualLock);
    window.addEventListener("storage", onStorage);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener(MANUAL_LOCK_EVENT, onManualLock);
      window.removeEventListener("storage", onStorage);
    };
  }, [user, authLoading, lock]);

  const unlock = async () => {
    setUnlocking(true);
    setError("");
    try {
      await authenticateWithBiometric("Unlock IyanjuPay");

      setPersistedLock(false);
      setLocked(false);
    } catch (unlockError: any) {
      setError(
        unlockError?.message ||
          "Biometric verification failed. Please try again.",
      );
    } finally {
      setUnlocking(false);
    }
  };

  if (!user || !locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20">
          <LockKeyhole className="h-8 w-8 text-blue-400" />
        </div>
        <h1 className="text-2xl font-black">IyanjuPay is locked</h1>
        <p className="mt-2 text-sm text-slate-400">
          Unlock with your enabled biometric or secure device authentication,
          such as fingerprint, Face ID, Windows Hello, or device PIN.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={unlock}
          disabled={unlocking}
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          {unlocking ? "Verifying..." : "Unlock securely"}
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
