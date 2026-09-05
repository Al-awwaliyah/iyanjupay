import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";

import AdminLayout from "./AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 25;
const FETCH_SIZE = PAGE_SIZE + 1;

type ReconciliationStatus =
  | "unmatched"
  | "matched"
  | "amount_mismatch"
  | "status_mismatch"
  | "missing_internal"
  | "missing_provider"
  | "pending"
  | "exception";

interface ReconciliationRow {
  id: string;
  provider: string | null;
  provider_reference: string | null;
  internal_reference: string | null;
  transaction_id: string | null;
  transaction_type: string | null;
  amount: number | string;
  currency: string;
  provider_status: string | null;
  internal_status: string | null;
  reconciliation_status: ReconciliationStatus;
  amount_difference: number | string;
  provider_created_at: string | null;
  provider_completed_at: string | null;
  internal_created_at: string | null;
  internal_completed_at: string | null;
  account_reference: string | null;
  metadata: Record<string, any>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  pending: number;
  amount_mismatch: number;
  status_mismatch: number;
  missing_internal: number;
  missing_provider: number;
  exception: number;
  total_provider_volume: number;
  difference_volume: number;
}

interface Detail {
  transaction: Record<string, any> | null;
  provider: ReconciliationRow | null;
  case: ReconciliationRow | null;
  events: Array<Record<string, any>>;
}

interface ReconcileResult {
  success: boolean;
  state?: "successful" | "failed" | "pending";
  reference?: string;
  transaction_id?: string;
  order_id?: string | null;
  request_id?: string | null;
  statuscode?: number | null;
  orderstatus?: string | null;
  orderremark?: string | null;
  refunded?: boolean;
  already_successful?: boolean;
  message?: string;
  error?: string;
}

const emptySummary: Summary = {
  total: 0,
  matched: 0,
  unmatched: 0,
  pending: 0,
  amount_mismatch: 0,
  status_mismatch: 0,
  missing_internal: 0,
  missing_provider: 0,
  exception: 0,
  total_provider_volume: 0,
  difference_volume: 0,
};

function money(value: unknown, currency = "NGN") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function label(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  switch (status) {
    case "matched":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "unmatched":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-red-50 text-red-700 border-red-200";
  }
}

function StatusBadge({ status }: { status: string }) {
  const Icon = status === "matched" ? CheckCircle2 : status === "pending" ? Clock3 : status === "unmatched" ? AlertCircle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
      <Icon className="h-3.5 w-3.5" />
      {label(status)}
    </span>
  );
}

function DetailItem({ name, value, mono = false }: { name: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{name}</p>
      <p className={`mt-1 break-all text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
    </div>
  );
}

export default function ReconciliationPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [selected, setSelected] = useState<ReconciliationRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingCase, setSavingCase] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

  const providerOptions = useMemo(() => {
    const providers = new Set(rows.map((row) => row.provider).filter(Boolean) as string[]);
    return Array.from(providers).sort();
  }, [rows]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Creates missing reconciliation records for ClubKonnect transactions before reading the page.
      const sync = await supabase.rpc("admin_reconciliation_sync");
      if (sync.error) throw sync.error;

      const [summaryResponse, listResponse] = await Promise.all([
        supabase.rpc("admin_reconciliation_summary"),
        supabase.rpc("admin_reconciliation_list", {
          _status: status === "all" ? null : status,
          _provider: provider === "all" ? null : provider,
          _search: search.trim() || null,
          _limit: FETCH_SIZE,
          _offset: (page - 1) * PAGE_SIZE,
        }),
      ]);

      if (summaryResponse.error) throw summaryResponse.error;
      if (listResponse.error) throw listResponse.error;

      setSummary({ ...emptySummary, ...(summaryResponse.data ?? {}) });

      const received = (listResponse.data ?? []) as ReconciliationRow[];
      setHasNext(received.length > PAGE_SIZE);
      setRows(received.slice(0, PAGE_SIZE));
    } catch (err: any) {
      console.error("Reconciliation load failed:", err);
      const message = err?.message || "Unable to load reconciliation records.";
      setError(message);
      setRows([]);
      toast({ title: "Reconciliation unavailable", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, provider, search, status, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openDetail = async (row: ReconciliationRow) => {
    setSelected(row);
    setDetail(null);
    setReconcileResult(null);
    setNotes(row.notes ?? "");
    setDetailLoading(true);

    try {
      if (!row.transaction_id) throw new Error("This reconciliation record has no internal transaction ID.");
      const { data, error: rpcError } = await supabase.rpc("admin_reconciliation_detail", {
        p_transaction_id: row.transaction_id,
      });
      if (rpcError) throw rpcError;
      setDetail(data as Detail);
      setNotes((data as Detail)?.case?.notes ?? row.notes ?? "");
    } catch (err: any) {
      toast({ title: "Unable to open case", description: err?.message || "The reconciliation detail could not be loaded.", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    if (savingCase || reconciling) return;
    setSelected(null);
    setDetail(null);
    setReconcileResult(null);
  };

  const saveStatus = async (nextStatus: ReconciliationStatus) => {
    if (!selected?.transaction_id) return;
    setSavingCase(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_reconciliation_update_case", {
        p_transaction_id: selected.transaction_id,
        p_status: nextStatus,
        p_notes: notes.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error("No reconciliation record was updated.");

      toast({ title: "Reconciliation case updated", description: `Status changed to ${label(nextStatus)}.` });
      await load(true);
      const refreshed = rows.find((row) => row.transaction_id === selected.transaction_id);
      if (refreshed) setSelected({ ...refreshed, reconciliation_status: nextStatus, notes: notes.trim() || null });
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message || "Unable to update the case.", variant: "destructive" });
    } finally {
      setSavingCase(false);
    }
  };

  const reconcile = async () => {
    if (!selected?.transaction_id) return;
    setReconciling(true);
    setReconcileResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");

      const { data, error: invokeError } = await supabase.functions.invoke("clubkonnect-reconcile", {
        body: {
          transaction_id: selected.transaction_id,
          reference: selected.internal_reference,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (invokeError) throw invokeError;
      const result = data as ReconcileResult;
      setReconcileResult(result);

      toast({
        title: result.state === "successful" ? "Reconciliation successful" : result.state === "failed" ? "Provider failure confirmed" : "Still pending",
        description: result.message || "ClubKonnect reconciliation completed.",
        variant: result.state === "failed" && !result.refunded ? "destructive" : "default",
      });

      await load(true);
    } catch (err: any) {
      console.error("Manual ClubKonnect reconciliation failed:", err);
      const result: ReconcileResult = { success: false, error: err?.message || "Unable to reconcile the transaction." };
      setReconcileResult(result);
      toast({ title: "Reconciliation failed", description: result.error, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setProvider("all");
    setPage(1);
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-muted/20 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Reconciliation</h1>
              <p className="mt-1 text-sm text-muted-foreground">Compare IyanjuPay transactions with provider results and resolve exceptions securely.</p>
            </div>
            <Button variant="outline" onClick={() => void load(true)} disabled={loading || refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="flex items-start gap-3 p-4 text-red-800">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Unable to load reconciliation</p>
                  <p className="mt-1 text-sm">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void load(true)}>Try again</Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total cases</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{summary.total}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Matched</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-emerald-600">{summary.matched}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-amber-600">{summary.pending}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Exceptions</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-red-600">{summary.amount_mismatch + summary.status_mismatch + summary.missing_internal + summary.missing_provider + summary.exception}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Difference volume</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{money(summary.difference_volume)}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search reference or account..." className="pl-9" />
                </div>
                <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="all">All statuses</option>
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="pending">Pending</option>
                  <option value="amount_mismatch">Amount mismatch</option>
                  <option value="status_mismatch">Status mismatch</option>
                  <option value="missing_internal">Missing internal</option>
                  <option value="missing_provider">Missing provider</option>
                  <option value="exception">Exception</option>
                </select>
                <select value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="all">All providers</option>
                  {providerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <Button variant="ghost" onClick={resetFilters}>Reset</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-5 w-5" /> Reconciliation cases</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading reconciliation records...</div>
              ) : rows.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                  <FileSearch className="h-10 w-10 text-muted-foreground/50" />
                  <h3 className="mt-4 font-semibold">No reconciliation records</h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">No records match the current filters. ClubKonnect transactions are synchronized automatically before this list loads.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Provider status</th>
                        <th className="px-4 py-3">Internal status</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3"><StatusBadge status={row.reconciliation_status} /></td>
                          <td className="px-4 py-3"><div className="max-w-[220px] truncate font-mono text-xs font-semibold">{row.internal_reference || row.provider_reference || "—"}</div><div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{row.provider_reference || "No provider reference"}</div></td>
                          <td className="px-4 py-3 font-medium">{row.provider || "—"}</td>
                          <td className="px-4 py-3">{label(row.transaction_type)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(row.amount, row.currency)}</td>
                          <td className="px-4 py-3"><span className="text-xs">{row.provider_status || "—"}</span></td>
                          <td className="px-4 py-3"><span className="text-xs">{row.internal_status || "—"}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{dateTime(row.created_at)}</td>
                          <td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => void openDetail(row)}><Eye className="mr-2 h-4 w-4" />Investigate</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between border-t p-4">
                <p className="text-sm text-muted-foreground">Page {page}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
                  <Button variant="outline" size="sm" disabled={!hasNext || loading} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-bold">Reconciliation investigation</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{selected.internal_reference || selected.provider_reference}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeDetail} disabled={savingCase || reconciling}><X className="h-5 w-5" /></Button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              {detailLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading transaction detail...</div>
              ) : detail ? (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailItem name="Reconciliation status" value={<StatusBadge status={selected.reconciliation_status} />} />
                    <DetailItem name="Internal amount" value={money(detail.transaction?.amount ?? selected.amount, detail.transaction?.currency ?? selected.currency)} />
                    <DetailItem name="Provider" value={selected.provider ?? "—"} />
                    <DetailItem name="Transaction type" value={label(detail.transaction?.transaction_type ?? selected.transaction_type)} />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Reference comparison</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <DetailItem name="Internal reference" value={selected.internal_reference} mono />
                      <DetailItem name="Provider reference" value={selected.provider_reference} mono />
                      <DetailItem name="Internal status" value={selected.internal_status} />
                      <DetailItem name="Provider status" value={selected.provider_status} />
                      <DetailItem name="Amount difference" value={money(selected.amount_difference, selected.currency)} />
                      <DetailItem name="Account / recipient" value={selected.account_reference} />
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold">Manual ClubKonnect reconciliation</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Query ClubKonnect directly using the stored OrderID/RequestID. Credentials stay inside the Edge Function.</p>
                      </div>
                      <Button onClick={() => void reconcile()} disabled={reconciling || !selected.transaction_id}>
                        {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Reconcile now
                      </Button>
                    </div>

                    {reconcileResult && (
                      <div className={`mt-4 rounded-xl border p-4 ${reconcileResult.state === "successful" ? "border-emerald-200 bg-emerald-50" : reconcileResult.state === "pending" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                        <div className="flex items-start gap-3">
                          {reconcileResult.state === "successful" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : reconcileResult.state === "pending" ? <Clock3 className="mt-0.5 h-5 w-5 text-amber-600" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-600" />}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{label(reconcileResult.state ?? "failed")}</p>
                            <p className="mt-1 text-sm">{reconcileResult.message || reconcileResult.error}</p>
                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                              <span>Code: <strong>{reconcileResult.statuscode ?? "—"}</strong></span>
                              <span>OrderID: <strong className="font-mono">{reconcileResult.order_id ?? "—"}</strong></span>
                              <span>Refunded: <strong>{reconcileResult.refunded ? "Yes" : "No"}</strong></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Investigation notes</h3>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="w-full rounded-xl border bg-background p-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring" placeholder="Record what was checked and why the case was resolved..." />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["matched", "pending", "amount_mismatch", "status_mismatch", "missing_internal", "missing_provider", "exception"] as ReconciliationStatus[]).map((item) => (
                        <Button key={item} size="sm" variant={selected.reconciliation_status === item ? "default" : "outline"} disabled={savingCase} onClick={() => void saveStatus(item)}>
                          {savingCase && selected.reconciliation_status !== item ? null : null}
                          {label(item)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Transaction information</h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <DetailItem name="Transaction ID" value={detail.transaction?.id} mono />
                      <DetailItem name="User ID" value={detail.transaction?.user_id} mono />
                      <DetailItem name="Wallet ID" value={detail.transaction?.wallet_id} mono />
                      <DetailItem name="Created" value={dateTime(detail.transaction?.created_at)} />
                      <DetailItem name="Completed" value={dateTime(detail.transaction?.completed_at)} />
                      <DetailItem name="Description" value={detail.transaction?.description} />
                    </div>
                  </div>

                  <details className="rounded-xl border p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Metadata</summary>
                    <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(detail.transaction?.metadata ?? selected.metadata ?? {}, null, 2)}</pre>
                  </details>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Transaction events</h3>
                    {detail.events.length === 0 ? (
                      <p className="rounded-xl border p-4 text-sm text-muted-foreground">No transaction events were recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.events.map((event) => (
                          <div key={String(event.id)} className="rounded-xl border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{label(event.event_type)}</span>
                              <span className="text-xs text-muted-foreground">{dateTime(event.created_at)}</span>
                            </div>
                            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-2 text-xs">{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
