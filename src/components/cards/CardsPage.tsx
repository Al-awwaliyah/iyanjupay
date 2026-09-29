import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CreditCard, Lock, Unlock, Trash2, Loader2, RefreshCw, Eye, Receipt, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";

interface CardsPageProps { onBack: () => void; }
interface VirtualCard {
  id: string; provider_card_id: string; masked_pan: string | null; last4: string | null;
  currency: string; name_on_card: string | null; expiry_month: string | null; expiry_year: string | null;
  status: string; amount_funded: number; card_type?: string | null; provider?: string | null;
}

const CardsPage = ({ onBack }: CardsPageProps) => {
  const { toast } = useToast(); const { user } = useAuth(); const { refreshWallet } = useWallet(user?.id);
  const [cards,setCards]=useState<VirtualCard[]>([]); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState<string|null>(null);
  const [amountUsd,setAmountUsd]=useState("10"); const [quote,setQuote]=useState<any>(null); const [quoting,setQuoting]=useState(false);
  const [form,setForm]=useState({first_name:"",last_name:"",phone:"",email:"",dob:"",kycType:"BVN",kycNo:"",address:"",state:"",city:"",brand:"VISA"});
  const [details,setDetails]=useState<any>(null); const [cardTransactions,setCardTransactions]=useState<any[]>([]); const [showCreate,setShowCreate]=useState(false);

  const callCards=useCallback(async(body:Record<string,unknown>)=>{
    const {data,error}=await supabase.functions.invoke("topupmate-cards",{body});
    if(error) throw new Error(getSafeErrorMessage(error)||"Card request failed.");
    if(!data?.success) throw new Error(getSafeErrorMessage(data)||"Card request failed.");
    return data;
  },[]);

  const loadProfile=useCallback(async()=>{
    if(!user?.id)return;
    const {data}=await supabase.from("profiles").select("full_name,email,phone_number,date_of_birth,address,bvn,nin,bvn_verified").eq("id",user.id).maybeSingle();
    if(!data)return;
    const parts=String(data.full_name||"").trim().split(/\s+/).filter(Boolean);
    setForm(v=>({...v,first_name:v.first_name||parts[0]||"",last_name:v.last_name||parts.slice(1).join(" "),phone:v.phone||data.phone_number||"",email:v.email||data.email||user.email||"",dob:v.dob||data.date_of_birth||"",kycNo:v.kycNo||((v.kycType||"BVN")==="BVN"?data.bvn:data.nin)||"",address:v.address||data.address||""}));
  },[user?.id,user?.email]);

  const loadCards=useCallback(async()=>{setLoading(true);try{const d=await callCards({action:"list"});setCards(Array.isArray(d.cards)?d.cards:[]);}catch(e:any){toast({title:"Unable to load cards",description:getSafeErrorMessage(e)||"Failed to load your virtual cards.",variant:"destructive"});}finally{setLoading(false);}},[callCards,toast]);
  useEffect(()=>{void loadCards();void loadProfile();},[loadCards,loadProfile]);

  const getQuote=async()=>{const usd=Number(amountUsd);if(!Number.isFinite(usd)||usd<=0){toast({title:"Invalid amount",description:"Enter a valid USD amount.",variant:"destructive"});return;}setQuoting(true);try{setQuote(await callCards({action:"quote",card_action:"create",amount_usd:usd}));}catch(e:any){setQuote(null);toast({title:"Unable to calculate card price",description:getSafeErrorMessage(e)||"Please try again.",variant:"destructive"});}finally{setQuoting(false);}};

  const createCard=async()=>{if(!form.first_name||!form.last_name||!form.phone||!form.email||!form.dob||!form.kycNo||!form.address||!form.state||!form.city){toast({title:"Complete card details",description:"All required card and KYC fields must be completed.",variant:"destructive"});return;}const usd=Number(amountUsd);if(!quote||Number(quote.amount_usd)!==usd){await getQuote();return;}setBusy("create");try{await callCards({action:"create",amount_usd:usd,...form});toast({title:"Virtual card created",description:"Your IyanjuPay virtual card is now available."});setShowCreate(false);setQuote(null);await Promise.all([loadCards(),refreshWallet()]);}catch(e:any){toast({title:"Card creation failed",description:getSafeErrorMessage(e)||"Unable to create your virtual card.",variant:"destructive"});}finally{setBusy(null);}};

  const cardAction=async(card:VirtualCard,action:string,amount?:string)=>{setBusy(card.provider_card_id+action);try{const payload:any={action,card_id:card.provider_card_id};if(amount)payload.amount_usd=Number(amount);const d=await callCards(payload);if(action==="details")setDetails(d.card||d.data);if(action==="transactions")setCardTransactions(Array.isArray(d.data?.transactions)?d.data.transactions:Array.isArray(d.data)?d.data:[]);toast({title:action==="freeze"?"Card frozen":action==="unfreeze"?"Card unfrozen":action==="terminate"?"Card terminated":action==="topup"?"Card funded":action==="withdraw"?"Withdrawal completed":"Card details loaded"});if(["topup","withdraw","freeze","unfreeze","terminate"].includes(action)){await Promise.all([loadCards(),refreshWallet()]);}}catch(e:any){toast({title:`Unable to ${action} card`,description:getSafeErrorMessage(e)||"The card operation failed.",variant:"destructive"});}finally{setBusy(null);}};

  return <div className="iyanjupay-dashboard min-h-screen px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3"><Button variant="ghost" onClick={onBack} className="rounded-xl"><ArrowLeft className="mr-2 h-4 w-4"/>Back</Button><h1 className="text-2xl font-bold text-foreground">Virtual Cards</h1><Button variant="ghost" size="icon" className="ml-auto" onClick={loadCards} disabled={loading}><RefreshCw className={loading?"h-4 w-4 animate-spin":"h-4 w-4"}/></Button></div>

        <Card className="overflow-hidden"><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5"/>IyanjuPay Virtual Cards</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Create, fund, freeze, unfreeze, view details and manage your IyanjuPay virtual card directly from IyanjuPay.</p><Button onClick={()=>setShowCreate(v=>!v)} className="w-full"><Plus className="mr-2 h-4 w-4"/>{showCreate?"Close card form":"Create virtual card"}</Button>
      {showCreate&&<div className="space-y-4 rounded-2xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2">{([["first_name","First name"],["last_name","Last name"],["phone","Phone"],["email","Email"],["dob","Date of birth"],["address","Address"],["state","State"],["city","City"]] as const).map(([k,l])=><div key={k} className="space-y-1"><Label>{l}</Label><Input type={k==="dob"?"date":"text"} value={(form as any)[k]} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1"><Label>KYC type</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.kycType} onChange={e=>{const type=e.target.value;setForm(v=>({...v,kycType:type,kycNo:""}))}}><option>BVN</option><option>NIN</option></select></div><div className="space-y-1"><Label>KYC number</Label><Input value={form.kycNo} onChange={e=>setForm(v=>({...v,kycNo:e.target.value}))}/></div><div className="space-y-1"><Label>Card brand</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.brand} onChange={e=>setForm(v=>({...v,brand:e.target.value}))}><option>VISA</option><option>MASTERCARD</option></select></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Initial funding (USD)</Label><Input type="number" min="1" step="0.01" value={amountUsd} onChange={e=>{setAmountUsd(e.target.value);setQuote(null)}}/></div><div className="flex items-end"><Button variant="outline" className="w-full" onClick={getQuote} disabled={quoting}>{quoting?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Receipt className="mr-2 h-4 w-4"/>}Calculate wallet charge</Button></div></div>
        {quote&&<div className="rounded-xl bg-muted p-3 text-sm"><div className="flex justify-between"><span>Provider amount</span><b>${Number(quote.amount_usd).toFixed(2)}</b></div><div className="flex justify-between"><span>Exchange rate</span><b>₦{Number(quote.exchange_rate).toLocaleString("en-NG")}/USD</b></div><div className="flex justify-between"><span>IyanjuPay charge (3% funding markup + $2 creation markup)</span><b>₦{Number(quote.customer_amount).toLocaleString("en-NG")}</b></div></div>}
        <Button className="w-full" onClick={createCard} disabled={busy==="create"}>{busy==="create"?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Creating...</>:"Create virtual card"}</Button>
      </div>}</CardContent></Card>

      {loading?<Card><CardContent className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin"/></CardContent></Card>:cards.length===0?<Card><CardContent className="py-10 text-center text-muted-foreground"><CreditCard className="mx-auto mb-3 h-10 w-10"/>No IyanjuPay virtual cards yet.</CardContent></Card>:<div className="grid gap-5 lg:grid-cols-2">{cards.map(card=><Card key={card.id} className="overflow-hidden"><CardContent className="space-y-4 p-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#082A63] via-[#1d4ed8] to-[#6d28d9] p-5 text-white shadow-lg"><div className="flex justify-between text-xs uppercase tracking-wider"><span>{card.card_type||"Virtual"}</span><span>{card.status}</span></div><div className="mt-1 text-[10px] opacity-80">{card.provider === "topupmate" ? "Topupmate" : "Existing card"}</div><div className="mt-8 text-lg font-mono tracking-[0.22em]">{card.masked_pan||`•••• •••• •••• ${card.last4||"••••"}`}</div><div className="mt-5 flex justify-between text-xs"><span>{card.name_on_card||"IyanjuPay"}</span><span>{card.expiry_month||"--"}/{card.expiry_year||"--"}</span></div></div>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={()=>cardAction(card,"details")} disabled={!!busy || card.provider !== "topupmate"}><Eye className="mr-2 h-4 w-4"/>Details</Button><Button variant="outline" onClick={()=>cardAction(card,"transactions")} disabled={!!busy || card.provider !== "topupmate"}><Receipt className="mr-2 h-4 w-4"/>Transactions</Button></div>
        <div className="flex gap-2"><Input type="number" min="0.01" step="0.01" placeholder="USD top-up" id={`topup-${card.id}`}/><Button onClick={()=>{const el=document.getElementById(`topup-${card.id}`) as HTMLInputElement|null;if(el?.value)void cardAction(card,"topup",el.value)}} disabled={!!busy || card.provider !== "topupmate"}><Plus className="mr-1 h-4 w-4"/>Top up</Button></div>
        <div className="flex flex-wrap gap-2">{card.status==="frozen"?<Button variant="outline" size="sm" onClick={()=>cardAction(card,"unfreeze")} disabled={!!busy || card.provider !== "topupmate"}><Unlock className="mr-1 h-4 w-4"/>Unfreeze</Button>:<Button variant="outline" size="sm" onClick={()=>cardAction(card,"freeze")} disabled={!!busy || card.provider !== "topupmate"}><Lock className="mr-1 h-4 w-4"/>Freeze</Button>}<Button variant="outline" size="sm" onClick={()=>{if(confirm('Terminate this virtual card permanently?'))void cardAction(card,'terminate')}} disabled={!!busy || card.provider !== 'topupmate'}><Trash2 className="mr-1 h-4 w-4"/>Terminate</Button><div className="ml-auto flex gap-1"><Input className="h-9 w-28" type="number" min="0.01" step="0.01" placeholder="USD" id={`wd-${card.id}`}/><Button variant="outline" size="sm" onClick={()=>{const el=document.getElementById(`wd-${card.id}`) as HTMLInputElement|null;if(el?.value)void cardAction(card,'withdraw',el.value)}} disabled={!!busy || card.provider !== 'topupmate'}><Minus className="mr-1 h-4 w-4"/>Withdraw</Button></div></div>
        <div className="text-xs text-muted-foreground">IyanjuPay wallet-funded value: ₦{Number(card.amount_funded||0).toLocaleString("en-NG")}</div>
        {details&&<div className="rounded-xl border bg-muted/50 p-3 text-sm"><div className="font-semibold mb-2">Card details</div><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(details,null,2)}</pre></div>}
        {cardTransactions.length>0&&<div className="rounded-xl border p-3"><div className="mb-2 font-semibold">Card transactions</div><div className="max-h-52 space-y-2 overflow-auto text-xs">{cardTransactions.map((x,i)=><div key={i} className="flex justify-between border-b pb-2 last:border-0"><span>{x.description||x.type||x.transaction_type||"Card transaction"}</span><b>{x.amount??"—"}</b></div>)}</div></div>}
      </CardContent></Card>)}</div>}
    </div></div>;
};
export default CardsPage;
