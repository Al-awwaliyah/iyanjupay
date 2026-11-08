import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CreditCard, Lock, Unlock, Trash2, Loader2, RefreshCw, Eye, Receipt, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";

interface CardsPageProps { onBack: () => void; inspectionUserId?: string; inspectionUserEmail?: string | null; inspectionMode?: boolean; }
interface VirtualCard {
  id: string; provider_card_id: string; masked_pan: string | null; last4: string | null;
  currency: string; name_on_card: string | null; expiry_month: string | null; expiry_year: string | null;
  status: string; amount_funded: number; card_type?: string | null; provider?: string | null;
}

const CardsPage = ({ onBack, inspectionUserId, inspectionUserEmail, inspectionMode = false }: CardsPageProps) => {
  const { toast } = useToast(); const { user: authenticatedUser } = useAuth(); const user = useMemo(() => inspectionUserId && authenticatedUser ? { ...authenticatedUser, id: inspectionUserId, email: inspectionUserEmail ?? null } : authenticatedUser, [inspectionUserId, inspectionUserEmail, authenticatedUser]); const { refreshWallet } = useWallet(user?.id, !inspectionMode);
  const [cards,setCards]=useState<VirtualCard[]>([]); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState<string|null>(null);
  const [amountUsd,setAmountUsd]=useState("10"); const [quote,setQuote]=useState<any>(null); const [quoting,setQuoting]=useState(false);
  const [form,setForm]=useState({first_name:"",last_name:"",phone:"",email:"",dob:"",kycType:"BVN",kycNo:"",address:"",state:"",city:"",brand:"VISA"});
  const [details,setDetails]=useState<any>(null); const [cardTransactions,setCardTransactions]=useState<any[]>([]); const [showCreate,setShowCreate]=useState(false);

  const callCards=useCallback(async(body:Record<string,unknown>)=>{
    if (inspectionMode) throw new Error("Card actions are disabled during read-only customer inspection.");
    const {data,error}=await supabase.functions.invoke("topupmate-cards",{body});
    if(error) throw new Error(getSafeErrorMessage(error)||"Card request failed.");
    if(!data?.success) throw new Error(getSafeErrorMessage(data)||"Card request failed.");
    return data;
  },[inspectionMode]);

  const loadProfile=useCallback(async()=>{
    if(!user?.id)return;
    const {data}=await supabase.from("profiles").select("full_name,email,phone_number,date_of_birth,address,bvn,nin,bvn_verified").eq("id",user.id).maybeSingle();
    if(!data)return;
    const parts=String(data.full_name||"").trim().split(/\s+/).filter(Boolean);
    setForm(v=>({...v,first_name:v.first_name||parts[0]||"",last_name:v.last_name||parts.slice(1).join(" "),phone:v.phone||data.phone_number||"",email:v.email||data.email||user.email||"",dob:v.dob||data.date_of_birth||"",kycNo:v.kycNo||((v.kycType||"BVN")==="BVN"?data.bvn:data.nin)||"",address:v.address||data.address||""}));
  },[user?.id,user?.email]);

  const loadCards=useCallback(async()=>{setLoading(true);try{const d=await callCards({action:"list"});setCards(Array.isArray(d.cards)?d.cards:[]);}catch(e:any){toast({title:"Unable to load cards",description:getSafeErrorMessage(e)||"Failed to load your virtual cards.",variant:"destructive"});}finally{setLoading(false);}},[callCards,toast]);
  useEffect(()=>{if (!inspectionMode) { void loadCards(); void loadProfile(); } else { setLoading(false); setCards([]); }},[loadCards,loadProfile,inspectionMode]);

  const getQuote=async()=>{const usd=Number(amountUsd);if(!Number.isFinite(usd)||usd<=0){toast({title:"Invalid amount",description:"Enter a valid USD amount.",variant:"destructive"});return;}setQuoting(true);try{setQuote(await callCards({action:"quote",amount_usd:usd}));}catch(e:any){setQuote(null);toast({title:"Unable to calculate card price",description:getSafeErrorMessage(e)||"Please try again.",variant:"destructive"});}finally{setQuoting(false);}};

  const createCard=async()=>{if(!form.first_name||!form.last_name||!form.phone||!form.email||!form.dob||!form.kycNo||!form.address||!form.state||!form.city){toast({title:"Complete card details",description:"All required card and KYC fields must be completed.",variant:"destructive"});return;}const usd=Number(amountUsd);if(!quote||Number(quote.amount_usd)!==usd){await getQuote();return;}setBusy("create");try{await callCards({action:"create",amount_usd:usd,...form});toast({title:"Virtual card created",description:"Your IyanjuPay virtual card is now available."});setShowCreate(false);setQuote(null);await Promise.all([loadCards(),refreshWallet()]);}catch(e:any){toast({title:"Card creation failed",description:getSafeErrorMessage(e)||"Unable to create your virtual card.",variant:"destructive"});}finally{setBusy(null);}};

  const cardAction=async(card:VirtualCard,action:string,amount?:string)=>{setBusy(card.provider_card_id+action);try{const payload:any={action,card_id:card.provider_card_id};if(amount)payload.amount_usd=Number(amount);const d=await callCards(payload);if(action==="details")setDetails(d.card||d.data);if(action==="transactions")setCardTransactions(Array.isArray(d.data?.transactions)?d.data.transactions:Array.isArray(d.data)?d.data:[]);toast({title:action==="freeze"?"Card frozen":action==="unfreeze"?"Card unfrozen":action==="terminate"?"Card terminated":action==="topup"?"Card funded":action==="withdraw"?"Withdrawal completed":"Card details loaded"});if(["topup","withdraw","freeze","unfreeze","terminate"].includes(action)){await Promise.all([loadCards(),refreshWallet()]);}}catch(e:any){toast({title:`Unable to ${action} card`,description:getSafeErrorMessage(e)||"The card operation failed.",variant:"destructive"});}finally{setBusy(null);}};

  return <div className="iyanjupay-dashboard min-h-screen bg-[#F7F5FF] px-4 py-5 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      {inspectionMode && <Card className="border-amber-300 bg-amber-50"><CardContent className="p-4 text-sm text-amber-950">Read-only inspection: card records are not loaded here because the current card provider endpoint is scoped to the signed-in administrator. No administrator card data is shown, and card operations are disabled.</CardContent></Card>}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="h-10 w-10 rounded-full p-0 text-[#17133D]"><ArrowLeft className="h-5 w-5"/></Button>
        <h1 className="text-xl font-bold tracking-tight text-[#17133D]">My Cards</h1>
        <Button variant="ghost" size="icon" className="ml-auto rounded-full text-[#4B22D8]" onClick={loadCards} disabled={inspectionMode || loading}><RefreshCw className={loading?"h-4 w-4 animate-spin":"h-4 w-4"}/></Button>
      </div>

      {!inspectionMode && (loading ? <Card className="rounded-3xl border-0 bg-white shadow-sm"><CardContent className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#5524E8]"/></CardContent></Card> : cards.length===0 ? <Card className="rounded-3xl border-0 bg-white shadow-sm"><CardContent className="py-10 text-center"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EAFE]"><CreditCard className="h-7 w-7 text-[#5422DF]"/></div><p className="font-semibold text-[#17133D]">No IyanjuPay cards yet</p><p className="mt-1 text-sm text-slate-500">Create a virtual card to start making online payments.</p></CardContent></Card> : <div className="space-y-4">{cards.map(card=><Card key={card.id} className="overflow-hidden rounded-3xl border-0 bg-transparent shadow-none"><CardContent className="space-y-4 p-0">
        <div className="relative min-h-[205px] overflow-hidden rounded-[26px] bg-gradient-to-br from-[#4010C8] via-[#3020C9] to-[#071A68] p-5 text-white shadow-[0_14px_32px_rgba(63,25,180,0.25)]">
          <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border border-white/10"/><div className="absolute -right-2 -top-8 h-36 w-36 rounded-full border border-white/10"/>
          <div className="relative flex items-start justify-between"><div><p className="text-sm font-semibold tracking-wide">IyanjuPay</p><p className="mt-0.5 text-[10px] text-white/70">Virtual Card</p></div><span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-semibold text-emerald-200">{card.status}</span></div>
          <div className="relative mt-8 font-mono text-lg tracking-[0.2em]">{card.masked_pan||`•••• •••• ${card.last4||"••••"}`}</div>
          <div className="relative mt-5 flex items-end justify-between"><div><p className="text-[9px] uppercase tracking-wider text-white/60">Cardholder</p><p className="mt-1 text-xs font-semibold">{card.name_on_card||"IyanjuPay Customer"}</p></div><div className="text-right"><p className="text-[9px] uppercase tracking-wider text-white/60">Expires</p><p className="mt-1 text-xs font-semibold">{card.expiry_month||"--"}/{card.expiry_year||"--"}</p></div><div className="flex items-center"><span className="h-6 w-6 rounded-full bg-[#EB001B] opacity-95"/><span className="-ml-3 h-6 w-6 rounded-full bg-[#F79E1B]/95"/></div></div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-3 shadow-sm">
          <Button variant="ghost" className="h-auto flex-col gap-2 rounded-xl py-3 text-[#24145F] hover:bg-[#F4F0FF]" onClick={()=>cardAction(card,card.status==="frozen"?"unfreeze":"freeze")} disabled={!!busy || card.provider!=="topupmate"}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEE8FF] text-[#5524E8]">{card.status==="frozen"?<Unlock className="h-5 w-5"/>:<Lock className="h-5 w-5"/>}</span><span className="text-[11px]">{card.status==="frozen"?"Unfreeze":"Freeze"}</span></Button>
          <Button variant="ghost" className="h-auto flex-col gap-2 rounded-xl py-3 text-[#24145F] hover:bg-[#F4F0FF]" onClick={()=>cardAction(card,"details")} disabled={!!busy || card.provider!=="topupmate"}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEE8FF] text-[#5524E8]"><Eye className="h-5 w-5"/></span><span className="text-[11px]">Details</span></Button>
          <Button variant="ghost" className="h-auto flex-col gap-2 rounded-xl py-3 text-[#24145F] hover:bg-[#F4F0FF]" onClick={()=>cardAction(card,"transactions")} disabled={!!busy || card.provider!=="topupmate"}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEE8FF] text-[#5524E8]"><Receipt className="h-5 w-5"/></span><span className="text-[11px]">Transactions</span></Button>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[#17133D]">Card balance</h3><span className="text-xs text-slate-500">Wallet-funded value</span></div><p className="text-2xl font-bold text-[#3513A7]">₦{Number(card.amount_funded||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="flex gap-2"><Input className="rounded-xl border-[#E7E1F5]" type="number" min="0.01" step="0.01" placeholder="USD top-up" id={`topup-${card.id}`}/><Button className="rounded-xl bg-[#4D19D5] hover:bg-[#3E12B7]" onClick={()=>{const el=document.getElementById(`topup-${card.id}`) as HTMLInputElement|null;if(el?.value)void cardAction(card,"topup",el.value)}} disabled={!!busy || card.provider!=="topupmate"}><Plus className="mr-1 h-4 w-4"/>Fund</Button></div><div className="flex gap-2"><Input className="rounded-xl border-[#E7E1F5]" type="number" min="0.01" step="0.01" placeholder="USD withdrawal" id={`wd-${card.id}`}/><Button variant="outline" className="rounded-xl border-[#D8CCFA] text-[#4D19D5]" onClick={()=>{const el=document.getElementById(`wd-${card.id}`) as HTMLInputElement|null;if(el?.value)void cardAction(card,"withdraw",el.value)}} disabled={!!busy || card.provider!=="topupmate"}><Minus className="mr-1 h-4 w-4"/>Withdraw</Button></div></div>
        </div>
        {details&&<div className="rounded-2xl border border-[#E9E2FA] bg-white p-4 text-sm"><div className="mb-2 font-semibold text-[#17133D]">Card details</div><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(details,null,2)}</pre></div>}
        {cardTransactions.length>0&&<div className="rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[#17133D]">Card Transactions</h3><span className="text-xs text-[#5422DF]">Recent activity</span></div><div className="space-y-3">{cardTransactions.map((x,i)=><div key={i} className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1ECFF] text-[#5422DF]"><Receipt className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#17133D]">{x.description||x.type||x.transaction_type||"Card transaction"}</p><p className="text-[11px] text-slate-500">{x.created_at?new Date(x.created_at).toLocaleString():"Card activity"}</p></div><b className="text-sm text-[#17133D]">{x.amount??"—"}</b></div>)}</div></div>}
        <div className="flex justify-end"><Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={()=>{if(confirm('Terminate this virtual card permanently?'))void cardAction(card,'terminate')}} disabled={!!busy || card.provider!=='topupmate'}><Trash2 className="mr-2 h-4 w-4"/>Terminate card</Button></div>
      </CardContent></Card>)}</div>)}

      <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg text-[#17133D]"><CreditCard className="h-5 w-5 text-[#5524E8]"/>Create a Virtual Card</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-slate-500">Create and manage your IyanjuPay virtual card securely.</p><Button onClick={()=>setShowCreate(v=>!v)} className="w-full rounded-xl bg-gradient-to-r from-[#4B16D3] to-[#6D28D9]" disabled={inspectionMode}><Plus className="mr-2 h-4 w-4"/>{showCreate?"Close card form":"Create virtual card"}</Button>
      {showCreate&&<div className="space-y-4 rounded-2xl border border-[#E8E0FA] bg-[#FBFAFF] p-4">
        <div className="grid gap-3 sm:grid-cols-2">{([["first_name","First name"],["last_name","Last name"],["phone","Phone"],["email","Email"],["dob","Date of birth"],["address","Address"],["state","State"],["city","City"]] as const).map(([k,l])=><div key={k} className="space-y-1"><Label className="text-[#30245C]">{l}</Label><Input className="rounded-xl border-[#E4DDF3] bg-white" type={k==="dob"?"date":"text"} value={(form as any)[k]} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1"><Label>KYC type</Label><select className="h-10 w-full rounded-xl border border-[#E4DDF3] bg-white px-3 text-sm" value={form.kycType} onChange={e=>{const type=e.target.value;setForm(v=>({...v,kycType:type,kycNo:""}))}}><option>BVN</option><option>NIN</option></select></div><div className="space-y-1"><Label>KYC number</Label><Input className="rounded-xl border-[#E4DDF3] bg-white" value={form.kycNo} onChange={e=>setForm(v=>({...v,kycNo:e.target.value}))}/></div><div className="space-y-1"><Label>Card brand</Label><select className="h-10 w-full rounded-xl border border-[#E4DDF3] bg-white px-3 text-sm" value={form.brand} onChange={e=>setForm(v=>({...v,brand:e.target.value}))}><option>VISA</option><option>MASTERCARD</option></select></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Initial funding (USD)</Label><Input className="rounded-xl border-[#E4DDF3] bg-white" type="number" min="1" step="0.01" value={amountUsd} onChange={e=>{setAmountUsd(e.target.value);setQuote(null)}}/></div><div className="flex items-end"><Button variant="outline" className="w-full rounded-xl border-[#D8CCFA] text-[#4D19D5]" onClick={getQuote} disabled={quoting}>{quoting?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Receipt className="mr-2 h-4 w-4"/>}Calculate wallet charge</Button></div></div>
        {quote&&<div className="space-y-1 rounded-xl bg-[#F2EDFF] p-3 text-sm text-[#24145F]">{quote.creation_fee_usd!==undefined&&<><div className="flex justify-between"><span>Card funding</span><b>${Number(quote.amount_usd).toFixed(2)}</b></div><div className="flex justify-between"><span>Card creation fee</span><b>${(Number(quote.creation_fee_usd)+Number(quote.iyanjupay_markup_usd??0)).toFixed(2)}</b></div><div className="flex justify-between"><span>Total (USD)</span><b>${Number(quote.total_usd).toFixed(2)}</b></div></>}<div className="flex justify-between"><span>Exchange rate</span><b>₦{Number(quote.exchange_rate).toLocaleString("en-NG")}/USD</b></div><div className="flex justify-between"><span>Wallet charge</span><b>₦{Number(quote.customer_amount).toLocaleString("en-NG")}</b></div></div>}
        <Button className="w-full rounded-xl bg-gradient-to-r from-[#4B16D3] to-[#6D28D9]" onClick={createCard} disabled={busy==="create"}>{busy==="create"?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Creating...</>:"Create virtual card"}</Button>
      </div>}</CardContent></Card>
      {inspectionMode&&<Card className="rounded-3xl border-0 bg-white shadow-sm"><CardContent className="py-8 text-center text-sm text-slate-500">Card actions are unavailable in read-only inspection mode.</CardContent></Card>}
    </div></div>;
};
export default CardsPage;
