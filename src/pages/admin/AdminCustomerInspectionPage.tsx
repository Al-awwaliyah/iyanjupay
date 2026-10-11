import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import Dashboard, { type DashboardInspectionPayload } from "@/components/Dashboard";

type InspectionStartResponse = {
  success?: boolean;
  error?: string;
  sessionId?: string;
  dashboard?: DashboardInspectionPayload;
};

export default function AdminCustomerInspectionPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<DashboardInspectionPayload | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const endInspection = useCallback(async (id: string) => {
    const { data, error } = await supabase.functions.invoke("admin-customer-inspection", {
      body: { action: "end", sessionId: id },
    });
    if (error || !data?.success) {
      throw new Error(data?.error || "Unable to end the inspection session.");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      if (!customerId) {
        setErrorMessage("A customer account ID is required.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      const { data, error } = await supabase.functions.invoke("admin-customer-inspection", {
        body: { action: "start", targetUserId: customerId },
      });

      const result = data as InspectionStartResponse | null;
      if (error || !result?.success || !result.sessionId || !result.dashboard) {
        if (!cancelled && mountedRef.current) {
          setErrorMessage(result?.error || "Unable to open this customer's dashboard. Confirm your admin permissions and try again.");
          setLoading(false);
        }
        return;
      }

      if (cancelled || !mountedRef.current) {
        try { await endInspection(result.sessionId); } catch { /* session expires automatically */ }
        return;
      }

      sessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setInspection(result.dashboard);
      setLoading(false);
    };

    void start().catch(() => {
      if (!cancelled && mountedRef.current) {
        setErrorMessage("The read-only inspection request failed. Please try again.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      const activeId = sessionRef.current;
      sessionRef.current = null;
      if (activeId) void endInspection(activeId).catch(() => undefined);
    };
  }, [customerId, endInspection]);

  const handleExit = async () => {
    if (ending) return;
    setEnding(true);
    const activeId = sessionRef.current ?? sessionId;
    try {
      if (activeId) await endInspection(activeId);
      sessionRef.current = null;
      navigate("/admin/customers", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to end inspection.");
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-800" />
          <p className="mt-4 text-sm font-semibold text-slate-700">Opening the customer's IyanjuPay dashboard…</p>
          <p className="mt-1 text-xs text-slate-500">Read-only inspection. Your administrator session remains unchanged.</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-center text-lg font-bold text-slate-900">Unable to inspect customer</h1>
          <p className="mt-2 text-center text-sm text-slate-600">{errorMessage || "Inspection data is unavailable."}</p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => navigate("/admin/customers")} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to customers
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = String(
    inspection.user.user_metadata?.full_name ||
    inspection.user.user_metadata?.name ||
    inspection.user.email ||
    inspection.user.id,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-[100] border-b border-amber-200 bg-amber-50/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-amber-950">READ-ONLY CUSTOMER INSPECTION</p>
              <p className="truncate text-xs text-amber-900">Viewing {displayName} · No customer authentication session has been changed</p>
            </div>
          </div>
          <Button onClick={handleExit} disabled={ending} className="shrink-0 bg-slate-900 text-white hover:bg-slate-800">
            {ending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
            End inspection
          </Button>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2 text-[11px] text-amber-900 sm:px-6 lg:px-8">
          Dashboard actions are disabled. Session expires {new Date(inspection.session.expires_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}.
        </div>
      </div>
      <Dashboard inspectionData={inspection} />
    </div>
  );
}
