import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, Loader2, ShieldAlert, ShieldCheck, StopCircle, Wallet } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type InspectionSession = {
  session_id: string;
  target_user_id: string;
  started_at: string;
  expires_at: string;
  read_only: true;
};
type InspectionCustomer = {
  profile: {
    id: string;
    full_name: string | null;
    nickname: string | null;
    email: string | null;
    phone_number: string | null;
    gender: string | null;
    kyc_level: number | null;
    kyc_status: string | null;
    bvn_verified: boolean;
    phone_verified: boolean;
    created_at: string | null;
  };
  wallet: null | {
    id: string;
    balance: number;
    held_balance: number;
    currency: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
  };
  transactions: Array<{
    id: string;
    transaction_type: string;
    amount: number;
    currency: string;
    description: string | null;
    status: string;
    reference_number: string;
    category: string | null;
    provider: string | null;
    created_at: string | null;
    completed_at: string | null;
  }>;
};

const money = (amount: number, currency = "NGN") => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: currency || "NGN", maximumFractionDigits: 2,
}).format(Number(amount) || 0);
const dateTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function AdminCustomerInspectionPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [customer, setCustomer] = useState<InspectionCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!customerId) {
        setError("A customer ID is required.");
        setLoading(false);
        return;
      }
      try {
        const { data: startResult, error: startError } = await supabase.functions.invoke("admin-customer-inspection", {
          body: { action: "start", targetUserId: customerId },
        });
        if (startError) throw startError;
        if (!startResult?.success || !startResult?.data?.session_id) {
          throw new Error(startResult?.error || "Could not start a customer inspection session.");
        }
        const nextSession = startResult.data as InspectionSession;
        if (cancelled) {
          await supabase.functions.invoke("admin-customer-inspection", { body: { action: "end", sessionId: nextSession.session_id } });
          return;
        }
        setSession(nextSession);

        const { data: readResult, error: readError } = await supabase.functions.invoke("admin-customer-inspection", {
          body: { action: "read", sessionId: nextSession.session_id },
        });
        if (readError) throw readError;
        if (!readResult?.success || !readResult?.data?.customer) {
          throw new Error(readResult?.error || "Could not load the read-only customer view.");
        }
        if (!cancelled) setCustomer(readResult.data.customer as InspectionCustomer);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unable to open customer inspection.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [customerId]);

  const endInspection = async () => {
    if (!session) {
      navigate("/admin/customers", { replace: true });
      return;
    }
    setEnding(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-customer-inspection", {
        body: { action: "end", sessionId: session.session_id },
      });
      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.error || "Could not end the inspection session.");
      setSession(null);
      navigate("/admin/customers", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the inspection session.");
    } finally {
      setEnding(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/admin/customers")}><ArrowLeft className="mr-2 h-4 w-4" />Customers</Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Read-only customer inspection</h1>
              <p className="text-sm text-slate-500">View the customer’s support context without signing in as them.</p>
            </div>
          </div>
          <Button variant="destructive" onClick={endInspection} disabled={ending || loading}>
            {ending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
            End inspection
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Read-only mode is enforced by the database.</p>
            <p className="mt-1 text-sm">This screen cannot change balances, initiate transactions, update KYC, reveal BVN/NIN, access payment PINs, or alter the customer’s authentication session. Access is audited and expires after 30 minutes.</p>
          </div>
        </div>

        {loading && <div className="flex min-h-56 items-center justify-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Starting secure inspection…</div>}
        {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><p className="font-semibold">Inspection could not be completed</p><p className="mt-1 text-sm">{error}</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => navigate("/admin/customers")}>Back to customers</Button><Button onClick={() => window.location.reload()}>Retry</Button></div></div>}

        {!loading && !error && customer && session && <>
          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-2xl border bg-white p-5 md:col-span-2">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-800">{(customer.profile.full_name || customer.profile.nickname || "U").slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900">{customer.profile.full_name || customer.profile.nickname || "Unnamed customer"}</h2>
                  <p className="break-all text-sm text-slate-600">{customer.profile.email || "No email on file"}</p>
                  <p className="text-sm text-slate-600">{customer.profile.phone_number || "No phone number on file"}</p>
                  <p className="mt-2 text-xs text-slate-500">Customer since {dateTime(customer.profile.created_at)}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800"><ShieldCheck className="h-3.5 w-3.5" />Read only</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">KYC status</p><p className="mt-1 font-semibold capitalize text-slate-900">{(customer.profile.kyc_status || "unverified").replaceAll("_", " ")}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">KYC level</p><p className="mt-1 font-semibold text-slate-900">Level {customer.profile.kyc_level ?? 0}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">BVN verification</p><p className="mt-1 font-semibold text-slate-900">{customer.profile.bvn_verified ? "Verified" : "Not verified"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Phone verification</p><p className="mt-1 font-semibold text-slate-900">{customer.profile.phone_verified ? "Verified" : "Not verified"}</p></div>
              </div>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-blue-700" /><h2 className="font-bold text-slate-900">Wallet summary</h2></div>
              {customer.wallet ? <>
                <p className="mt-4 text-xs text-slate-500">Available balance</p><p className="mt-1 text-2xl font-bold text-slate-900">{money(customer.wallet.balance, customer.wallet.currency)}</p>
                <div className="mt-4 flex justify-between gap-3 text-sm"><span className="text-slate-500">Held balance</span><span className="font-medium text-slate-900">{money(customer.wallet.held_balance, customer.wallet.currency)}</span></div>
                <div className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-500">Wallet status</span><span className="font-medium capitalize text-slate-900">{customer.wallet.status}</span></div>
                <p className="mt-3 text-xs text-slate-400">Balances are displayed for support review only.</p>
              </> : <p className="mt-4 text-sm text-slate-500">No wallet record was found for this account.</p>}
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5"><div><h2 className="font-bold text-slate-900">Recent transactions</h2><p className="mt-1 text-sm text-slate-500">Latest 50 records · no transaction actions are available here.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{customer.transactions.length} records</span></div>
            {customer.transactions.length === 0 ? <p className="p-6 text-sm text-slate-500">No transactions found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th></tr></thead><tbody className="divide-y">{customer.transactions.map((t) => <tr key={t.id} className="align-top"><td className="px-5 py-4"><p className="font-medium capitalize text-slate-900">{(t.transaction_type || "transaction").replaceAll("_", " ")}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{t.description || t.category || t.provider || "—"}</p></td><td className="px-5 py-4 font-mono text-xs text-slate-600">{t.reference_number}</td><td className="px-5 py-4 font-semibold text-slate-900">{money(t.amount, t.currency)}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-700">{(t.status || "unknown").replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-slate-600">{dateTime(t.created_at)}</td></tr>)}</tbody></table></div>}
          </section>
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" />Session expires {dateTime(session.expires_at)} <CheckCircle2 className="ml-2 h-4 w-4 text-green-600" />Inspection access logged</div>
        </>}
      </div>
    </AdminLayout>
  );
}
