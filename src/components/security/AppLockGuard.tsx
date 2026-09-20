import { useEffect, useState } from "react";
import { Fingerprint, LockKeyhole, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ENABLED_KEY = "iyanjupay-app-lock-enabled";
const TIMEOUT_KEY = "iyanjupay-app-lock-timeout";

function readEnabled() { return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "true"; }
function readTimeout() {
  const raw = localStorage.getItem(TIMEOUT_KEY);
  if (raw === "0") return 0;
  const value = Number(raw || 300);
  return Number.isFinite(value) ? Math.max(30, value) : 300;
}

export default function AppLockGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let hiddenAt: number | null = null;

    const lock = () => { if (readEnabled()) setLocked(true); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (readTimeout() === 0 && readEnabled()) setLocked(true);
        return;
      }
      if (document.visibilityState === "visible" && readEnabled() && hiddenAt !== null) {
        if ((Date.now() - hiddenAt) / 1000 >= readTimeout()) setLocked(true);
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
      if (!readEnabled()) setLocked(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const unlock = async () => {
    setUnlocking(true);
    setError("");
    try {
      if (!("PublicKeyCredential" in window)) throw new Error("This device does not support biometric or secure device authentication.");
      const { error: authError } = await (supabase.auth as any).signInWithPasskey();
      if (authError) throw authError;
      setLocked(false);
    } catch (error: any) {
      setError(error?.message || "Biometric verification failed.");
    } finally { setUnlocking(false); }
  };

  if (!user || !locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20"><LockKeyhole className="h-8 w-8 text-blue-400" /></div>
        <h1 className="text-2xl font-black">IyanjuPay is locked</h1>
        <p className="mt-2 text-sm text-slate-400">Unlock with your enabled biometric or secure device authentication, such as Face ID, fingerprint, Windows Hello, or device PIN.</p>
        <Button className="mt-6 w-full" onClick={unlock} disabled={unlocking}><Fingerprint className="mr-2 h-4 w-4" />{unlocking ? "Verifying..." : "Unlock securely"}</Button>
        {error && <p className="mt-3 rounded-lg bg-red-950/50 p-3 text-xs text-red-300">{error}</p>}
        <Button variant="ghost" className="mt-3 w-full text-slate-300 hover:text-white" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
      </div>
    </div>
  );
}
