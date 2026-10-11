import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Eye, Loader2, Mail, Phone, RefreshCw, Search, ShieldCheck, UserRound } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type AuthUserCustomer = {
  id: string;
  email: string | null;
  phone_number: string | null;
  full_name: string | null;
  nickname: string | null;
  created_at: string | null;
  wallet_row_id: string | null;
  wallet_balance: number | string | null;
  wallet_currency: string | null;
  wallet_status: string | null;
};

type CustomerListResult = { customers?: AuthUserCustomer[]; total?: number };
const PAGE_SIZE = 25;

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

function moneyLabel(value: number | string | null, currency: string | null) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `₦${Number.isFinite(amount) ? amount.toLocaleString("en-NG") : "0"}`;
  }
}

export default function AdminReadOnlyImpersonationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [customers, setCustomers] = useState<AuthUserCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (refresh = false) => {
    setLoadError(null);
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      // This secured RPC queries auth.users directly and does not require a profiles row.
      const { data, error } = await supabase.rpc("get_admin_auth_user_customers", {
        p_search: appliedSearch.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const result = data as CustomerListResult | null;
      setCustomers(Array.isArray(result?.customers) ? result!.customers! : []);
      setTotal(Number(result?.total || 0));
    } catch (error) {
      console.error("Failed to load auth.users for read-only inspection:", error);
      const message = "Unable to load accounts from auth.users. Verify your admin permissions and that the inspection migration has been applied.";
      setLoadError(message);
      toast({ title: "Unable to load accounts", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedSearch, page, toast]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setAppliedSearch(search.trim());
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
              <ShieldCheck className="h-4 w-4" /> Read-only inspection
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Customer dashboard inspection</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Select an account from Supabase auth.users to open the customer’s actual IyanjuPay dashboard. This directory does not depend on profiles.</p>
          </div>
          <Button variant="outline" onClick={() => void loadCustomers(true)} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh
          </Button>
        </header>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Strictly read-only</p><p className="mt-1 text-amber-900">Inspection keeps your administrator session intact. Customer transfers, payments, purchases, account changes, PIN changes, and notification mutations must remain unavailable while viewing.</p></div></div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, name, phone, or auth user ID" className="pl-9" /></div>
              <Button type="submit"><Search className="mr-2 h-4 w-4" /> Search accounts</Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{total.toLocaleString("en-NG")} auth.users account{total === 1 ? "" : "s"}</span><span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span></div>
          </div>

          {loadError && <div className="m-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</div>}

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading accounts from auth.users…</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center"><UserRound className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">No accounts found</h2><p className="mt-1 text-sm text-slate-500">Try another search, or refresh the account list.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {customers.map((customer) => {
                const name = customer.full_name || customer.nickname || customer.email || customer.id;
                return <article key={customer.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-800"><UserRound className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{name}</h3>
                      <div className="mt-1 flex flex-col gap-x-4 gap-y-1 text-sm text-slate-500 sm:flex-row sm:flex-wrap">
                        {customer.email && <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{customer.email}</span></span>}
                        {customer.phone_number && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{customer.phone_number}</span>}
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />Joined {dateLabel(customer.created_at)}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-400">Auth ID: {customer.id}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{customer.wallet_row_id ? `Wallet ${moneyLabel(customer.wallet_balance, customer.wallet_currency)}` : "No wallet record"}</span>
                        <span className={`rounded-full px-2.5 py-1 ${customer.wallet_row_id ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{customer.wallet_row_id ? `Wallet ${customer.wallet_status || "available"}` : "Account exists without wallet"}</span>
                      </div>
                    </div>
                  </div>
                  <Button className="shrink-0" onClick={() => navigate(`/admin/impersonation/${encodeURIComponent(customer.id)}`)}><Eye className="mr-2 h-4 w-4" /> Inspect dashboard</Button>
                </article>;
              })}
            </div>
          )}

          <footer className="flex items-center justify-between border-t border-slate-200 p-4">
            <p className="text-xs text-slate-500">Showing {customers.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + customers.length} of {total}</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || loading}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount || loading}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button></div>
          </footer>
        </section>
      </div>
    </AdminLayout>
  );
}
