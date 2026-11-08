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

  return <div className="iyanjupay-dashboard min-h-screen bg-[#F7F6FC] pb-24 text-[#202033] dark:bg-[#11101A] dark:text-white">
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3 pt-1">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to dashboard" className="rounded-full text-[#5D42C5] hover:bg-[#EEE9FF] dark:hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-bold tracking-tight">Savings</h1><p className="mt-0.5 text-sm text-[#858398]">Small steps today, bigger plans tomorrow.</p></div>
        <div className="rounded-2xl bg-[#EEE9FF] p-3 text-[#6949D6] dark:bg-[#29213F]"><PiggyBank className="h-6 w-6" /></div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#6848D5] via-[#7655DE] to-[#9A78ED] p-5 text-white shadow-[0_16px_40px_rgba(105,73,211,0.22)] sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full border-[26px] border-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-white/75">Total savings balance</p><p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{money(totalBalance)}</p><p className="mt-2 text-xs text-white/70">Across all your savings plans</p></div>
          <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/20"><PiggyBank className="h-7 w-7" /></div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
          <div><p className="text-xs text-white/70">Active plans</p><p className="mt-1 text-xl font-semibold">{activeCount}</p></div>
          <div><p className="text-xs text-white/70">Wallet available</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(wallet?.balance ?? 0)}</p></div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#ECE9F5] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1B1926] sm:p-6">
        <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#F0EBFF] p-2.5 text-[#6848D5] dark:bg-[#30264B]"><Plus className="h-5 w-5" /></div><div><h2 className="font-bold">Create a savings plan</h2><p className="text-xs text-[#8A879B]">Set a target contribution and build consistently.</p></div></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={createPlan}>
          <div className="space-y-2"><Label htmlFor="savings-name" className="text-xs font-semibold text-[#5D5A70] dark:text-gray-300">Plan name</Label><Input id="savings-name" value={planName} maxLength={60} onChange={(event) => setPlanName(event.target.value)} placeholder="e.g. Rent savings" className="h-12 rounded-xl border-[#E9E5F1] bg-[#FBFAFD] dark:border-white/10 dark:bg-[#242131]" /></div>
          <div className="space-y-2"><Label className="text-xs font-semibold text-[#5D5A70] dark:text-gray-300">Saving frequency</Label><Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)}><SelectTrigger className="h-12 rounded-xl border-[#E9E5F1] bg-[#FBFAFD] dark:border-white/10 dark:bg-[#242131]"><SelectValue placeholder="Choose frequency" /></SelectTrigger><SelectContent>{frequencies.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} — {item.interval}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="savings-amount" className="text-xs font-semibold text-[#5D5A70] dark:text-gray-300">Amount per contribution (NGN)</Label><Input id="savings-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 5000" required className="h-12 rounded-xl border-[#E9E5F1] bg-[#FBFAFD] dark:border-white/10 dark:bg-[#242131]" /></div>
          <div className="flex items-end"><Button type="submit" className="h-12 w-full rounded-xl bg-[#6848D5] font-semibold text-white shadow-md shadow-[#6848D5]/20 hover:bg-[#5738C4]" disabled={saving || !amount}><span className="flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create savings plan</span></Button></div>
        </form>
        <p className="mt-4 rounded-xl bg-[#F7F4FF] p-3 text-xs leading-relaxed text-[#77718C] dark:bg-[#242131] dark:text-gray-400">Your first automatic contribution is scheduled for the next cycle. Daily starts tomorrow; weekly starts in 7 days. Quarterly is every 3 months; bi-quarterly is every 6 months. There is no interest or return promised by this savings feature.</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Your savings plans</h2><p className="text-xs text-[#8A879B]">Manage your scheduled contributions</p></div><Button variant="outline" size="sm" className="rounded-full border-[#E5DFF4] bg-white text-[#6848D5] hover:bg-[#F5F1FF] dark:border-white/10 dark:bg-[#1B1926]" onClick={async () => { await load(); await onWalletChanged?.(); }} disabled={loading}>Refresh</Button></div>
        {loading ? <div className="rounded-2xl border border-[#ECE9F5] bg-white p-10 text-center text-sm text-[#8A879B] dark:border-white/10 dark:bg-[#1B1926]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#6848D5]" />Loading savings...</div> : plans.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DCD5ED] bg-white px-6 py-10 text-center dark:border-white/15 dark:bg-[#1B1926]"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFF] text-[#6848D5] dark:bg-[#30264B]"><PiggyBank className="h-7 w-7" /></div><p className="font-semibold">No savings plans yet</p><p className="mt-1 text-sm text-[#8A879B]">Create a plan above to start saving on a schedule.</p></div> : plans.map((plan) => {
          const busy = busyPlan === plan.id;
          const freq = frequencies.find((item) => item.value === plan.frequency);
          return <div key={plan.id} className="rounded-2xl border border-[#ECE9F5] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1B1926] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{plan.name}</h3><Badge className={plan.status === "active" ? "border-0 bg-[#E8F8EF] text-[#16834A] hover:bg-[#E8F8EF]" : "border-0 bg-[#F0EDF5] text-[#77718C] hover:bg-[#F0EDF5]"}>{plan.status}</Badge></div><p className="mt-1 text-sm text-[#8A879B]">{freq?.label} · {money(plan.contribution_amount)} per contribution</p></div><div className="text-right"><p className="text-xs text-[#8A879B]">Current savings</p><p className="text-xl font-bold tabular-nums text-[#6848D5]">{money(plan.balance)}</p></div></div>
            <div className="mt-4 grid gap-3 rounded-xl bg-[#F8F6FC] p-3 text-sm dark:bg-[#242131] sm:grid-cols-3"><div><p className="text-xs text-[#8A879B]">Total contributed</p><p className="mt-1 font-semibold">{money(plan.total_saved)}</p></div><div><p className="text-xs text-[#8A879B]">Next contribution</p><p className="mt-1 flex items-center gap-1 font-semibold"><CalendarClock className="h-4 w-4 text-[#6848D5]" />{plan.status === "active" ? dateLabel(plan.next_due_at) : "Not scheduled"}</p></div><div><p className="text-xs text-[#8A879B]">Missed contributions</p><p className="mt-1 font-semibold">{plan.missed_contributions}</p></div></div>
            {plan.status !== "cancelled" && <div className="mt-4 flex flex-wrap gap-2">{plan.status === "active" ? <Button size="sm" variant="outline" className="rounded-lg border-[#E5DFF4] text-[#6848D5]" onClick={() => void updateStatus(plan, "paused")} disabled={busy}><CirclePause className="mr-1.5 h-4 w-4" />Pause</Button> : <Button size="sm" variant="outline" className="rounded-lg border-[#E5DFF4] text-[#6848D5]" onClick={() => void updateStatus(plan, "active")} disabled={busy}><Play className="mr-1.5 h-4 w-4" />Resume</Button>}<Button size="sm" variant="outline" className="rounded-lg border-[#F3DADA] text-[#C34B59] hover:bg-[#FFF4F4]" onClick={() => void updateStatus(plan, "cancelled")} disabled={busy}><XCircle className="mr-1.5 h-4 w-4" />Cancel plan</Button></div>}
            {Number(plan.balance) > 0 && <><Separator className="my-4 bg-[#EEEAF5] dark:bg-white/10" /><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><div className="space-y-1"><Label htmlFor={`withdraw-${plan.id}`} className="text-xs font-semibold text-[#5D5A70] dark:text-gray-300">Withdraw to wallet (max {money(plan.balance)})</Label><Input id={`withdraw-${plan.id}`} type="number" inputMode="decimal" min="0.01" max={Number(plan.balance)} step="0.01" placeholder={`Full balance: ${Number(plan.balance).toFixed(2)}`} value={withdrawAmounts[plan.id] ?? ""} onChange={(event) => setWithdrawAmounts((old) => ({ ...old, [plan.id]: event.target.value }))} className="h-11 rounded-xl border-[#E9E5F1] bg-[#FBFAFD] dark:border-white/10 dark:bg-[#242131]" /></div><div className="flex items-end"><Button className="h-11 w-full rounded-xl bg-[#6848D5] text-white hover:bg-[#5738C4] sm:w-auto" onClick={() => void withdraw(plan)} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Wallet className="mr-1.5 h-4 w-4" />Withdraw</Button></div></div></>}
          </div>;
        })}
      </section>

      <section className="rounded-[24px] border border-[#ECE9F5] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1B1926] sm:p-6"><div className="mb-4"><h2 className="font-bold">Recent savings activity</h2><p className="text-xs text-[#8A879B]">Your latest contributions and withdrawals</p></div><div className="space-y-4">{contributions.length === 0 ? <p className="py-4 text-sm text-[#8A879B]">Your contributions and withdrawals will appear here.</p> : contributions.map((item) => {
        const plan = plans.find((entry) => entry.id === item.plan_id);
        const isWithdrawal = item.contribution_type === "withdrawal";
        return <div key={item.id} className="flex items-center gap-3"><div className={`rounded-xl p-2.5 ${item.status === "successful" ? "bg-[#E8F8EF] text-[#16834A] dark:bg-[#163B2B] dark:text-[#70D69C]" : "bg-[#FFF0F0] text-[#C34B59] dark:bg-[#422329] dark:text-[#F39AA3]"}`}>{item.status === "successful" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{isWithdrawal ? "Withdrawal" : item.contribution_type === "scheduled" ? "Scheduled contribution" : "Contribution"} · {plan?.name || "Savings plan"}</p><p className="mt-0.5 text-xs text-[#8A879B]">{new Date(item.created_at).toLocaleString("en-NG")} · {item.status}{item.failure_reason ? ` — ${item.failure_reason}` : ""}</p></div><p className={`text-sm font-bold tabular-nums ${isWithdrawal ? "text-[#16834A]" : "text-[#343044] dark:text-white"}`}>{isWithdrawal ? "+" : "−"}{money(item.amount)}</p></div>;
      })}</div></section>
    </div>
  </div>;
}
