import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { isBiometricEnabled, authenticateWithBiometric } from "@/lib/biometricAuth";
import { getSafeErrorMessage } from "@/lib/errorHandling";

type ExtraType = "airtime-cash" | "gift-card" | "esim";

type Props = { type: ExtraType; onBack: () => void };

const safeArray = (value: any) => Array.isArray(value) ? value : [];
const money = (value: any) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function BilalsadasubExtras({ type, onBack }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { refreshWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const invoke = async (fn: string, body: Record<string, any>, init?: RequestInit) => {
    if (init?.body instanceof FormData) {
      const { data, error } = await supabase.functions.invoke(fn, { body: init.body });
      if (error) throw error;
      if (!data?.success) throw new Error(getSafeErrorMessage(data) || "Request failed.");
      return data;
    }
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw error;
    if (!data?.success) throw new Error(getSafeErrorMessage(data) || "Request failed.");
    return data;
  };

  if (type === "airtime-cash") {
    return <AirtimeCash invoke={invoke} onBack={onBack} loading={loading} setLoading={setLoading} message={message} setMessage={setMessage} />;
  }

  if (type === "gift-card") {
    return <GiftCard invoke={invoke} onBack={onBack} loading={loading} setLoading={setLoading} message={message} setMessage={setMessage} refreshWallet={refreshWallet} user={user} />;
  }

  return <Esim invoke={invoke} onBack={onBack} loading={loading} setLoading={setLoading} message={message} setMessage={setMessage} refreshWallet={refreshWallet} />;
}

function Shell({ title, onBack, children, message }: any) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] px-4 py-3.5 text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-base font-black">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{message}</div>}
        {children}
      </main>
    </div>
  );
}

function AirtimeCash({ invoke, onBack, loading, setLoading, message, setMessage }: any) {
  const { toast } = useToast();
  const [networks, setNetworks] = useState<any[]>([]);
  const [network, setNetwork] = useState("");
  const [phone, setPhone] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState("");
  const [balance, setBalance] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [sharePin, setSharePin] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => { void (async () => { try { const data = await invoke("bilalsadasub-airtime-cash", { action: "rates" }); setNetworks(safeArray(data.networks)); } catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to load airtime-to-cash networks."); } })(); }, []);

  const selectedRate = useMemo(() => networks.find((x) => String(x.id ?? x.network_id ?? x.code ?? x.name).toLowerCase() === network.toLowerCase()), [networks, network]);

  const start = async () => {
    if (!/^\d{11}$/.test(phone) || !network) return toast({ title: "Check details", description: "Select a network and enter an 11-digit phone number.", variant: "destructive" });
    setLoading(true); setMessage("");
    try { const data = await invoke("bilalsadasub-airtime-cash", { action: "start", network, phone }); setSessionId(data.session_id); setStep(2); setMessage(data.message || "OTP sent successfully."); }
    catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to start verification."); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    if (!sessionId || !/^\d{4,6}$/.test(otp)) return toast({ title: "OTP required", description: "Enter the OTP sent to the airtime line.", variant: "destructive" });
    setLoading(true);
    try { const data = await invoke("bilalsadasub-airtime-cash", { action: "verify", session_id: sessionId, otp, network, phone }); setBalance(data.balance); setStep(3); setMessage(data.message || "OTP verified successfully."); }
    catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to verify OTP."); }
    finally { setLoading(false); }
  };

  const complete = async () => {
    if (Number(amount) <= 0 || !/^\d{4}$/.test(sharePin)) return toast({ title: "Check details", description: "Enter the amount and your 4-digit airtime share PIN.", variant: "destructive" });
    setLoading(true);
    try { const data = await invoke("bilalsadasub-airtime-cash", { action: "complete", session_id: sessionId, amount: Number(amount), share_pin: sharePin, network, phone }); setMessage(`₦${Number(data.credited || 0).toLocaleString("en-NG")} has been credited to your wallet.`); setStep(1); setSessionId(""); setOtp(""); setAmount(""); setSharePin(""); setBalance(null); }
    catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to complete conversion."); }
    finally { setLoading(false); }
  };

  return <Shell title="Airtime to Cash" onBack={onBack} message={message}>
    <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
      <div><h2 className="font-black">Convert airtime to wallet balance</h2><p className="mt-1 text-xs text-gray-500">Verify the airtime line with the provider OTP, then submit the conversion.</p></div>
      {selectedRate && <div className="rounded-xl bg-gray-50 p-3 text-xs font-semibold">Current provider rate: {selectedRate.buyback_pct ?? selectedRate.buyback_percentage ?? "—"}%</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Network</Label><select value={network} onChange={(e) => setNetwork(e.target.value)} disabled={step !== 1 || loading} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Select network</option>{networks.map((x,i)=><option key={i} value={String(x.id ?? x.network_id ?? x.code ?? x.name)}>{x.name ?? x.network ?? x.network_name}</option>)}</select></div>
        <div><Label>Phone number</Label><Input className="mt-1" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} disabled={step !== 1 || loading} inputMode="numeric" placeholder="08012345678" /></div>
      </div>
      {step === 1 && <Button onClick={start} disabled={loading} className="w-full">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Send OTP</Button>}
      {step === 2 && <><div><Label>OTP</Label><Input className="mt-1" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} inputMode="numeric" /></div><Button onClick={verify} disabled={loading} className="w-full">Verify OTP</Button></>}
      {step === 3 && <><div className="rounded-xl border bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Airtime balance: {balance ?? "—"}</div><div><Label>Amount</Label><Input className="mt-1" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Amount to convert" /></div><div><Label>4-digit share PIN</Label><Input className="mt-1" value={sharePin} onChange={e=>setSharePin(e.target.value.replace(/\D/g,"").slice(0,4))} inputMode="numeric" type="password" /></div><Button onClick={complete} disabled={loading} className="w-full">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Convert to Wallet</Button></>}
    </section>
  </Shell>;
}

function GiftCard({ invoke, onBack, loading, setLoading, message, setMessage, refreshWallet, user }: any) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [providerPin, setProviderPin] = useState("");
  const [brand, setBrand] = useState("");
  const [claimed, setClaimed] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<"buy"|"sell">("buy");

  const refreshHistory = async () => {
    try { const data = await invoke("bilalsadasub-giftcard", { action: "history" }); setHistory(safeArray(data.history)); }
    catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to refresh gift card exchange status."); }
  };

  useEffect(() => { void (async () => { try { const data = await invoke("bilalsadasub-giftcard", { action: "plans" }); setPlans(data.plans || []); await refreshHistory(); } catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to load gift card services."); } })(); }, []);

  const variants = useMemo(
    () => plans.flatMap((b: any) =>
      safeArray(b.variants).map((v: any) => ({ ...v, brand: b.name ?? b.brand }))
    ),
    [plans]
  );
  const selected = variants.find((v:any)=>String(v.id)===planId);
  const buy = async () => {
    if (!user || !selected || Number(amount)<=0) return toast({title:"Check details",description:"Select a gift card and enter a valid amount.",variant:"destructive"});
    setLoading(true); setMessage("");
    try {
      if (isBiometricEnabled()) await authenticateWithBiometric("Authorize gift card purchase");
      else {
        const pin=window.prompt("Enter your 4-digit IyanjuPay payment PIN");
        if (!/^\d{4}$/.test(pin || "")) throw new Error("Payment authorization was cancelled.");
        const {data,error}=await supabase.rpc("verify_payment_pin",{_pin:pin}); if(error || !data?.success) throw new Error("Invalid payment PIN.");
      }
      const data=await invoke("bilalsadasub-giftcard",{action:"buy",plan_id:Number(planId),amount:Number(amount),provider_pin:providerPin || undefined});
      await refreshWallet(); setMessage(data.status === "pending" ? "Your gift card purchase is still being processed." : "Gift card purchase completed successfully.");
    } catch(e){setMessage(getSafeErrorMessage(e)||"Unable to complete gift card purchase.");} finally{setLoading(false);}
  };
  const sell = async () => {
    if(!brand || Number(claimed)<=0 || !files.length) return toast({title:"Check details",description:"Brand, claimed amount and at least one image are required.",variant:"destructive"});
    const form=new FormData(); form.append("action","exchange"); form.append("brand",brand); form.append("claimed_amount",claimed); files.forEach(f=>form.append("images",f));
    setLoading(true); setMessage("");
    try{const data=await invoke("bilalsadasub-giftcard",{}, {body:form}); setMessage(data.message || "Gift card submitted for review."); setFiles([]); await refreshHistory();}catch(e){setMessage(getSafeErrorMessage(e)||"Unable to submit gift card.");}finally{setLoading(false);}
  };

  return <Shell title="Gift Cards" onBack={onBack} message={message}>
    <div className="grid grid-cols-2 gap-2"><Button variant={tab === "buy" ? "default" : "outline"} onClick={()=>setTab("buy")}>Buy Gift Card</Button><Button variant={tab === "sell" ? "default" : "outline"} onClick={()=>setTab("sell")}>Sell Gift Card</Button></div>
    {tab === "buy" ? <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4"><div><Label>Gift card variant</Label><select value={planId} onChange={e=>setPlanId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Select gift card</option>{variants.map((v:any)=><option key={v.id} value={v.id}>{v.brand} — {v.country} — {v.currency}</option>)}</select></div><div><Label>Amount</Label><Input className="mt-1" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" placeholder={selected?.is_range ? `${selected.local_min} - ${selected.local_max}` : String(selected?.local_max ?? "Amount")} /></div><div><Label>Provider PIN (if required)</Label><Input className="mt-1" type="password" value={providerPin} onChange={e=>setProviderPin(e.target.value)} /></div><Button onClick={buy} disabled={loading} className="w-full">{loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Purchase Gift Card</Button><p className="flex items-center justify-center gap-1 text-[11px] text-gray-500"><ShieldCheck className="h-3.5 w-3.5"/>Payment authorization is required.</p></section> : <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4"><div><Label>Brand</Label><Input className="mt-1" value={brand} onChange={e=>setBrand(e.target.value)} placeholder="e.g. Apple" /></div><div><Label>Claimed amount</Label><Input className="mt-1" value={claimed} onChange={e=>setClaimed(e.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" /></div><div><Label>Gift card images (up to 4, max 5MB each)</Label><Input className="mt-1" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files || []).slice(0,4))} /></div><Button onClick={sell} disabled={loading} className="w-full">Submit for Review</Button><p className="text-xs text-gray-500">Your wallet is credited only after Bilalsadasub marks the exchange as paid.</p></section>}

    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="font-black">Exchange status</h2><p className="text-xs text-gray-500">Wallet credit is applied only when the provider status is paid.</p></div>
        <Button variant="outline" size="sm" onClick={() => void refreshHistory()}>Refresh</Button>
      </div>
      {history.length ? <div className="space-y-2">{history.slice(0,5).map((item:any,i:number)=><div key={item.id ?? i} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs"><span className="font-semibold">{item.brand ?? item.name ?? "Gift card"}</span><span className="font-bold uppercase">{item.status ?? "pending"}</span></div>)}</div> : <p className="text-xs text-gray-500">No exchange submissions found.</p>}
    </section>
  </Shell>;
}

function Esim({ invoke, onBack, loading, setLoading, message, setMessage, refreshWallet }: any) {
  const { toast } = useToast();
  const [provider, setProvider] = useState("smile");
  const [stock, setStock] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [providerPin, setProviderPin] = useState("");

  const load = async (nextProvider = provider) => {
    setLoading(true);
    try { const data = await invoke("bilalsadasub-services", { action: "esim_stock", type: nextProvider }); setStock(data.stock); }
    catch (e) { setMessage(getSafeErrorMessage(e) || "Unable to load eSIM stock."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(provider); }, [provider]);

  const buy = async () => {
    if (quantity < 1) return;
    setLoading(true); setMessage("");
    try {
      if (isBiometricEnabled()) await authenticateWithBiometric("Authorize eSIM purchase");
      else {
        const pin=window.prompt("Enter your 4-digit IyanjuPay payment PIN");
        if (!/^\d{4}$/.test(pin || "")) throw new Error("Payment authorization was cancelled.");
        const {data,error}=await supabase.rpc("verify_payment_pin",{_pin:pin}); if(error || !data?.success) throw new Error("Invalid payment PIN.");
      }
      const data=await invoke("bilalsadasub-services",{action:"esim_buy",type:provider,quantity,provider_pin:providerPin || undefined});
      await refreshWallet();
      setMessage(data.status === "pending" ? "Your eSIM order is still being processed." : `eSIM purchase completed. ${safeArray(data.msisdns).length || quantity} number(s) issued.`);
      setQuantity(1); await load(provider);
    } catch(e) { setMessage(getSafeErrorMessage(e) || "Unable to purchase eSIM."); }
    finally { setLoading(false); }
  };

  const unitPrice=Number(stock?.price ?? stock?.data?.price ?? stock?.amount ?? stock?.data?.amount ?? 0);
  const available=Number(stock?.available_count ?? stock?.data?.available_count ?? 0);
  const maxOrder=Number(stock?.max_per_order ?? stock?.data?.max_per_order ?? 1);
  const selling=unitPrice ? Math.ceil(unitPrice*1.05/10)*10*quantity : 0;

  return <Shell title="Internet eSIM" onBack={onBack} message={message}>
    <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
      <div><h2 className="font-black">Buy eSIM numbers</h2><p className="mt-1 text-xs text-gray-500">Choose a supported provider and quantity. Provider stock and pricing are checked before payment.</p></div>
      <div><Label>Provider</Label><select value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm" disabled={loading}><option value="smile">Smile</option><option value="alpha">Alpha</option></select></div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3 text-xs"><div className="text-gray-500">Available</div><div className="mt-1 font-black">{available || "—"}</div></div><div className="rounded-xl bg-gray-50 p-3 text-xs"><div className="text-gray-500">Selling price</div><div className="mt-1 font-black">{selling ? money(selling) : "—"}</div></div></div>
      <div><Label>Quantity</Label><Input className="mt-1" type="number" min={1} max={Math.max(1,Math.min(available || maxOrder,maxOrder))} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(Number(e.target.value)||1,Math.max(1,Math.min(available || maxOrder,maxOrder)))))} /></div>
      <div><Label>Provider PIN (if required)</Label><Input className="mt-1" type="password" value={providerPin} onChange={e=>setProviderPin(e.target.value)} /></div>
      <Button onClick={buy} disabled={loading || !unitPrice || (available > 0 && quantity > available)} className="w-full">{loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Purchase eSIM</Button>
    </section>
  </Shell>;
}
