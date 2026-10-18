import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, CirclePause, Loader2, PiggyBank, Play, Plus, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "bi_quarterly" | "yearly";
type SavingsPlan = {
  id: string; name: string; frequency: Frequency; contribution_amount: number | string;
  balance: number | string; total_saved: number | string; status: "active" | "paused" | "cancelled";
  next_due_at: string; last_contribution_at: string | null; missed_contributions: number; created_at: string;
};
type Contribution = { id: string; plan_id: string; amount: number | string; status: "successful" | "failed"; contribution_type: string; failure_reason: string | null; created_at: string };

const frequencies: { value: Frequency; label: string; interval: string }[] = [
  { value: "daily", label: "Daily", interval: "Every day" },
  { value: "weekly", label: "Weekly", interval: "Every 7 days" },
  { value: "monthly", label: "Monthly", interval: "Every month" },
  { value: "quarterly", label: "Quarterly", interval: "Every 3 months" },
  { value: "bi_quarterly", label: "Bi-quarterly", interval: "Every 6 months" },
  { value: "yearly", label: "Yearly", interval: "Every year" },
];
const money = (value: number | string) => `₦${Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Not yet";

export default function SavingsPage({ onBack, onWalletChanged }: { onBack: () => void; onWalletChanged?: () => Promise<unknown> | void }) {
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { toast } = useToast();
  const [plans, setPlans] = useState<SavingsPlan[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [planName, setPlanName] = useState("My Savings");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [amount, setAmount] = useState("");
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user?.id) { setPlans([]); setContributions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [planResult, contributionResult] = await Promise.all([
        (supabase.from("savings_plans" as any) as any).select("*").order("created_at", { ascending: false }),
        (supabase.from("savings_contributions" as any) as any).select("id,plan_id,amount,status,contribution_type,failure_reason,created_at").order("created_at", { ascending: false }).limit(12),
      ]);
      if (planResult.error) throw planResult.error;
      if (contributionResult.error) throw contributionResult.error;
      setPlans((planResult.data ?? []) as SavingsPlan[]);
      setContributions((contributionResult.data ?? []) as Contribution[]);
    } catch (error: any) {
      toast({ title: "Unable to load Savings", description: error?.message || "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [user?.id, toast]);

  useEffect(() => { void load(); }, [load]);

  const totalBalance = useMemo(() => plans.reduce((sum, plan) => sum + Number(plan.balance || 0), 0), [plans]);
  const activeCount = useMemo(() => plans.filter((plan) => plan.status === "active").length, [plans]);

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Enter a valid amount", description: "Your recurring savings amount must be greater than ₦0.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("create_savings_plan", { _name: planName.trim() || "My Savings", _frequency: frequency, _amount: parsedAmount });
      if (error) throw error;
      setAmount("");
      setPlanName("My Savings");
      toast({ title: "Savings plan created", description: `Your ${frequencies.find((item) => item.value === frequency)?.label.toLowerCase()} plan is active. Your first scheduled contribution will be on the next due date shown.` });
      await load();
    } catch (error: any) {
      toast({ title: "Could not create savings plan", description: error?.message || "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateStatus = async (plan: SavingsPlan, status: "active" | "paused" | "cancelled") => {
    if (status === "cancelled" && !window.confirm("Cancel this savings plan? No future automatic contributions will be taken. The saved balance remains available to withdraw.")) return;
    setBusyPlan(plan.id);
    try {
      const { error } = await (supabase as any).rpc("set_savings_plan_status", { _plan_id: plan.id, _status: status });
      if (error) throw error;
      toast({ title: status === "paused" ? "Savings paused" : status === "cancelled" ? "Savings plan cancelled" : "Savings resumed" });
      await load();
    } catch (error: any) {
      toast({ title: "Unable to update savings", description: error?.message || "Please try again.", variant: "destructive" });
    } finally { setBusyPlan(null); }
  };

  const withdraw = async (plan: SavingsPlan) => {
    const requested = Number(withdrawAmounts[plan.id] || plan.balance);
    if (!Number.isFinite(requested) || requested <= 0 || requested > Number(plan.balance)) {
      toast({ title: "Check withdrawal amount", description: `Enter an amount greater than ₦0 and no more than ${money(plan.balance)}.`, variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in again before withdrawing savings.", variant: "destructive" });
      return;
    }

    // Keep the same key for this user/plan/amount until the server confirms success.
    // This also lets a retry after a timeout recover the original transaction.
    const normalizedAmount = requested.toFixed(2);
    const storageKey = `iyanjupay:savings-withdrawal:${user.id}:${plan.id}:${normalizedAmount}`;
    let idempotencyKey: string;
    try {
      idempotencyKey = window.localStorage.getItem(storageKey) || crypto.randomUUID();
      window.localStorage.setItem(storageKey, idempotencyKey);
    } catch {
      toast({ title: "Withdrawal not started", description: "Secure request protection is unavailable in this browser. Please enable site storage and try again.", variant: "destructive" });
      return;
    }

    setBusyPlan(plan.id);
    try {
      const { error } = await (supabase as any).rpc("withdraw_savings", {
        _plan_id: plan.id,
        _amount: requested,
        _idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      window.localStorage.removeItem(storageKey);
      toast({ title: "Savings withdrawn", description: `${money(requested)} has been returned to your IyanjuPay wallet.` });
      setWithdrawAmounts((old) => ({ ...old, [plan.id]: "" }));
      await load();
      await onWalletChanged?.();
    } catch (error: any) {
      // Deliberately retain the key: a network timeout may have happened after commit.
      toast({ title: "Withdrawal failed", description: error?.message || "Please try again. Retrying the same amount will safely reuse this request.", variant: "destructive" });
    } finally { setBusyPlan(null); }
  };

  return <div className="min-h-screen bg-background pb-24">
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to dashboard"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1"><h1 className="text-2xl font-bold">Savings</h1><p className="text-sm text-muted-foreground">Build your savings automatically from your IyanjuPay wallet.</p></div>
        <div className="rounded-xl bg-pink-100 p-3 text-pink-700 dark:bg-pink-950 dark:text-pink-300"><PiggyBank className="h-6 w-6" /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total saved</p><p className="mt-1 text-2xl font-bold tabular-nums">{money(totalBalance)}</p><p className="mt-1 text-xs text-muted-foreground">Across all your savings plans</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active plans</p><p className="mt-1 text-2xl font-bold">{activeCount}</p><p className="mt-1 text-xs text-muted-foreground">Plans with scheduled contributions</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Wallet available</p><p className="mt-1 text-2xl font-bold tabular-nums">{money(wallet?.balance ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Contributions are checked against your available balance</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Create a savings plan</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={createPlan}>
            <div className="space-y-2"><Label htmlFor="savings-name">Plan name</Label><Input id="savings-name" value={planName} maxLength={60} onChange={(event) => setPlanName(event.target.value)} placeholder="e.g. Rent savings" /></div>
            <div className="space-y-2"><Label>Saving frequency</Label><Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)}><SelectTrigger><SelectValue placeholder="Choose frequency" /></SelectTrigger><SelectContent>{frequencies.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} — {item.interval}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="savings-amount">Amount per contribution (NGN)</Label><Input id="savings-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 5000" required /></div>
            <div className="flex items-end"><Button type="submit" className="w-full" disabled={saving || !amount}><span className="flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create savings plan</span></Button></div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Your first automatic contribution is scheduled for the next cycle. Daily starts tomorrow; weekly starts in 7 days. Quarterly is every 3 months; bi-quarterly is every 6 months. There is no interest or return promised by this savings feature.</p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Your savings plans</h2><Button variant="outline" size="sm" onClick={async () => { await load(); await onWalletChanged?.(); }} disabled={loading}>Refresh</Button></div>
        {loading ? <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading savings...</CardContent></Card> : plans.length === 0 ? <Card><CardContent className="flex flex-col items-center p-8 text-center"><PiggyBank className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">No savings plans yet</p><p className="mt-1 text-sm text-muted-foreground">Create a plan above to start saving on a schedule.</p></CardContent></Card> : plans.map((plan) => {
          const busy = busyPlan === plan.id;
          const freq = frequencies.find((item) => item.value === plan.frequency);
          return <Card key={plan.id}><CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{plan.name}</h3><Badge variant={plan.status === "active" ? "default" : "secondary"}>{plan.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{freq?.label} · {money(plan.contribution_amount)} per contribution</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Current savings</p><p className="text-xl font-bold tabular-nums">{money(plan.balance)}</p></div></div>
            <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3"><div><p className="text-muted-foreground">Total contributed</p><p className="font-medium">{money(plan.total_saved)}</p></div><div><p className="text-muted-foreground">Next contribution</p><p className="flex items-center gap-1 font-medium"><CalendarClock className="h-4 w-4" />{plan.status === "active" ? dateLabel(plan.next_due_at) : "Not scheduled"}</p></div><div><p className="text-muted-foreground">Missed contributions</p><p className="font-medium">{plan.missed_contributions}</p></div></div>
            {plan.status !== "cancelled" && <div className="flex flex-wrap gap-2">{plan.status === "active" ? <Button size="sm" variant="outline" onClick={() => void updateStatus(plan, "paused")} disabled={busy}><CirclePause className="mr-1.5 h-4 w-4" />Pause</Button> : <Button size="sm" variant="outline" onClick={() => void updateStatus(plan, "active")} disabled={busy}><Play className="mr-1.5 h-4 w-4" />Resume</Button>}<Button size="sm" variant="outline" onClick={() => void updateStatus(plan, "cancelled")} disabled={busy}><XCircle className="mr-1.5 h-4 w-4" />Cancel plan</Button></div>}
            {Number(plan.balance) > 0 && <><Separator /><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><div className="space-y-1"><Label htmlFor={`withdraw-${plan.id}`}>Withdraw to wallet (max {money(plan.balance)})</Label><Input id={`withdraw-${plan.id}`} type="number" inputMode="decimal" min="0.01" max={Number(plan.balance)} step="0.01" placeholder={`Full balance: ${Number(plan.balance).toFixed(2)}`} value={withdrawAmounts[plan.id] ?? ""} onChange={(event) => setWithdrawAmounts((old) => ({ ...old, [plan.id]: event.target.value }))} /></div><div className="flex items-end"><Button className="w-full sm:w-auto" onClick={() => void withdraw(plan)} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Wallet className="mr-1.5 h-4 w-4" />Withdraw</Button></div></div></>}
          </CardContent></Card>;
        })}
      </section>

      <Card><CardHeader><CardTitle>Recent savings activity</CardTitle></CardHeader><CardContent className="space-y-3">{contributions.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Your contributions and withdrawals will appear here.</p> : contributions.map((item) => {
        const plan = plans.find((entry) => entry.id === item.plan_id);
        const isWithdrawal = item.contribution_type === "withdrawal";
        return <div key={item.id} className="flex items-center gap-3"><div className={`rounded-full p-2 ${item.status === "successful" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{item.status === "successful" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{isWithdrawal ? "Withdrawal" : item.contribution_type === "scheduled" ? "Scheduled contribution" : "Contribution"} · {plan?.name || "Savings plan"}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("en-NG")} · {item.status}{item.failure_reason ? ` — ${item.failure_reason}` : ""}</p></div><p className={`text-sm font-semibold tabular-nums ${isWithdrawal ? "text-emerald-600" : ""}`}>{isWithdrawal ? "+" : "−"}{money(item.amount)}</p></div>;
      })}</CardContent></Card>
    </div>
  </div>;
}
