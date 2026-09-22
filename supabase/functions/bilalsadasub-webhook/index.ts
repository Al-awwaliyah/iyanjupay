import { corsHeaders, json, adminClient } from "../_shared/auth.ts";
import { bilalToken } from "../_shared/bilalsadasub.ts";

async function hmacSha256Hex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function safeEqual(a:string,b:string){ if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,error:"Method not allowed."},405);
  const raw=await req.text();
  const signature=req.headers.get("X-Bilalsada-Signature") ?? "";
  const supplied=signature.replace(/^sha256=/i,"").trim().toLowerCase();
  try {
    const expected=(await hmacSha256Hex(raw,bilalToken())).toLowerCase();
    if(!supplied || !safeEqual(supplied,expected)) return json({success:false,error:"Invalid signature."},401);
  } catch(error){ console.error("Bilalsadasub webhook signature failure",error); return json({success:false,error:"Webhook authentication failed."},401); }
  let event:any; try{event=JSON.parse(raw)}catch{return json({success:false,error:"Invalid JSON."},400)}
  const admin=adminClient();
  const transid=String(event?.transid ?? event?.transaction_id ?? "").trim();
  const requestId=String(event?.["request-id"] ?? event?.request_id ?? event?.details?.request_id ?? "").trim();
  try{
    if(transid || requestId){
      const ors=[]; if(transid) ors.push(`provider_reference.eq.${transid}`); if(requestId) ors.push(`reference_number.eq.${requestId}`);
      const {data:txs,error}=await admin.from("transactions").select("id,user_id,amount,status,reference_number,provider_reference,metadata").or(ors.join(",")).limit(5);
      if(error) console.error("Bilalsadasub webhook lookup failed",error);
      for(const tx of txs ?? []){
        if(["success","failed","refunded"].includes(String(tx.status).toLowerCase())) continue;
        const status=String(event?.status ?? "").toLowerCase();
        if(["success","completed","paid"].includes(status)){
          await admin.from("transactions").update({status:"success",provider:"bilalsadasub",provider_reference:transid||tx.provider_reference,metadata:{...(tx.metadata??{}),webhook_event:event.event??null,webhook_status:status}}).eq("id",tx.id);
        } else if(["failed","failure","rejected","cancelled"].includes(status)){
          const {error:refundError}=await admin.rpc("refund_wallet",{_user_id:tx.user_id,_amount:Number(tx.amount),_description:"Bilalsadasub webhook reversal",_idempotency_key:`REFUND_WEBHOOK_${transid||tx.reference_number}`,_reference:`REFUND_WEBHOOK_${transid||tx.reference_number}`,_metadata:{provider:"bilalsadasub",transid,event:event.event??null}});
          await admin.from("transactions").update({status:"failed",metadata:{...(tx.metadata??{}),webhook_event:event.event??null,refunded:!refundError}}).eq("id",tx.id);
        }
      }
    }
    return json({success:true});
  }catch(error){ console.error("Bilalsadasub webhook processing failure",error); return json({success:false,error:"Webhook processing failed."},500); }
});
