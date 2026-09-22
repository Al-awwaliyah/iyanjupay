import { corsHeaders, json, adminClient, getUser } from "../_shared/auth.ts";
import { bilalToken, getJson, postJson, sellingPrice } from "../_shared/bilalsadasub.ts";
const s=(v:unknown)=>String(v??"").trim(); const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;

async function creditPaidExchanges(admin:any,userId:string,history:any[]){
  for(const item of history){
    const id=s(item?.id ?? item?.exchange_id ?? item?.exchangeId);
    const status=s(item?.status).toLowerCase();
    const amount=n(item?.credited ?? item?.amount ?? item?.naira_amount ?? item?.payout);
    if(!id || status!=="paid" || amount<=0)continue;
    const {error}=await admin.rpc("credit_wallet",{_user_id:userId,_amount:amount,_description:"Gift card exchange credit",_idempotency_key:`GIFT_EXCHANGE_${id}`,_reference:`GIFT_EXCHANGE_${id}`,_provider:"bilalsadasub",_provider_reference:id,_metadata:{service:"gift_card_exchange",exchange_id:id,status:"paid"}});
    if(error)console.error("Gift card paid exchange credit failed",{exchange_id:id,error});
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({success:false,error:"Method not allowed."},405);
  const user=await getUser(req);if(!user)return json({success:false,error:"Authentication required."},401);
  const admin=adminClient();
  try{
    const contentType=req.headers.get("content-type")??"";
    let action=""; let body:any={}; let form:FormData|null=null;
    if(contentType.includes("multipart/form-data")){form=await req.formData();action=s(form.get("action"));}
    else {body=await req.json();action=s(body.action);}
    action=action.toLowerCase();

    if(action==="plans"){
      const raw=await getJson<any>("/api/giftcard/plans");
      return json({success:true,plans:Array.isArray(raw)?raw:(raw?.data??raw?.plans??[])});
    }

    if(action==="buy"){
      const planId=n(body.plan_id);const amount=n(body.amount);if(!planId||amount<=0)throw new Error("Gift card plan and amount are required.");
      const rawPlans=await getJson<any>("/api/giftcard/plans");const plans=Array.isArray(rawPlans)?rawPlans:(rawPlans?.data??rawPlans?.plans??[]);
      const variants=plans.flatMap((brand:any)=>Array.isArray(brand?.variants)?brand.variants:[]);
      const plan=variants.find((x:any)=>n(x.id)===planId);if(!plan)throw new Error("Gift card plan is unavailable.");
      const isRange=Boolean(plan.is_range);const min=n(plan.local_min),max=n(plan.local_max);if((isRange&&(amount<min||amount>max))||(!isRange&&amount!==max))throw new Error("Invalid gift card amount.");
      const rate=n(plan.selling_rate);const providerAmount=amount*rate;const selling=sellingPrice(providerAmount);
      const ref=`IP_GIFT_${crypto.randomUUID().replaceAll("-","")}`;
      const {error:debitError}=await admin.rpc("debit_wallet",{_user_id:user.id,_amount:selling,_description:"Gift card purchase",_idempotency_key:ref,_reference:ref,_category:"gift_card",_metadata:{provider:"bilalsadasub",plan_id:planId,provider_amount:providerAmount}});if(debitError)throw new Error("Unable to process the payment from your wallet.");
      let raw:any;try{raw=await postJson<any>("/api/giftcard/buy",{plan_id:planId,amount,token:bilalToken()});}catch(error){await admin.rpc("refund_wallet",{_user_id:user.id,_amount:selling,_description:"Gift card purchase reversal",_idempotency_key:`REFUND_${ref}`,_reference:`REFUND_${ref}`,_metadata:{provider:"bilalsadasub",original_reference:ref}});throw new Error("Gift card purchase could not be completed.");}
      const status=s(raw?.status).toLowerCase();if(!["success","successful","completed","paid"].includes(status)){await admin.rpc("refund_wallet",{_user_id:user.id,_amount:selling,_description:"Gift card purchase reversal",_idempotency_key:`REFUND_${ref}`,_reference:`REFUND_${ref}`,_metadata:{provider:"bilalsadasub",original_reference:ref}});throw new Error("Gift card purchase failed. Your wallet has been refunded.");}
      await admin.from("transactions").update({status:"success",provider:"bilalsadasub",provider_reference:s(raw?.transid),metadata:{provider:"bilalsadasub",service:"gift_card_purchase",plan_id:planId,provider_amount:providerAmount}}).eq("user_id",user.id).eq("reference_number",ref);
      return json({success:true,status:"success",reference:ref,provider_reference:raw?.transid??null,voucher_pin:raw?.pin??raw?.voucher_pin??null,selling_price:selling});
    }

    if(action==="exchange"){
      if(!form)throw new Error("Gift card exchange requires multipart form data.");
      const brand=s(form.get("brand"));const claimedAmount=n(form.get("claimed_amount"));if(!brand||claimedAmount<=0)throw new Error("Gift card brand and claimed amount are required.");
      const outbound=new FormData();for(const key of ["brand","country_name","currency","claimed_amount","code","pin","user_note","token"]){const value=key==="token"?bilalToken():form.get(key);if(value!==null&&value!=="")outbound.append(key,String(value));}
      const files=form.getAll("images");if(!files.length)throw new Error("At least one gift card image is required.");
      for(const file of files){if(!(file instanceof File))continue;if(file.size>5*1024*1024)throw new Error("Each gift card image must be 5MB or smaller.");if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Gift card images must be JPG, PNG or WEBP.");outbound.append("images[]",file,file.name);}
      const response=await fetch("https://bilalsadasub.com/api/giftcard-exchange/submit",{method:"POST",headers:{Authorization:`Token ${bilalToken()}`},body:outbound});const text=await response.text();let raw:any;try{raw=JSON.parse(text)}catch{raw={message:text}};if(!response.ok)throw new Error("Gift card exchange submission failed.");
      return json({success:true,exchange:raw?.data??raw,status:raw?.status??"pending",message:"Gift card exchange submitted for review."});
    }

    if(action==="history"){
      const raw=await getJson<any>("/api/giftcard-exchange/history");const history=Array.isArray(raw)?raw:(raw?.data??raw?.history??[]);await creditPaidExchanges(admin,user.id,history);return json({success:true,history});
    }
    throw new Error("Unsupported gift card action.");
  }catch(error){console.error("Bilalsadasub gift card error",{action,user_id:user.id,error});return json({success:false,error:error instanceof Error?error.message:"Unable to complete gift card request."},400)}
});
