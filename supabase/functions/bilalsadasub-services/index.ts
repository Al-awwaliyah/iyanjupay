import { corsHeaders, json, adminClient, getUser } from "../_shared/auth.ts";
import {
  dataTab,
  getJson,
  normalizePeriod,
  postJson,
  providerFailed,
  providerSuccessful,
  safeProviderMessage,
  sellingPrice,
  bilalToken,
} from "../_shared/bilalsadasub.ts";

type Obj = Record<string, any>;
const s = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const first = (...v: unknown[]) => v.find(x => x !== undefined && x !== null && s(x) !== "");

function reference() { return `IP_BILAL_${crypto.randomUUID().replaceAll("-", "")}`; }
function requestId(ref: string) { return ref; }
function publicError() { return "Unable to complete the service request right now."; }

async function updateTransaction(admin: any, userId: string, ref: string, updates: Obj) {
  const { error } = await admin.from("transactions").update(updates).eq("user_id", userId).eq("reference_number", ref);
  if (error) console.error("Bilalsadasub transaction update failed", error);
}

async function refund(admin: any, userId: string, amount: number, ref: string, metadata: Obj) {
  return admin.rpc("refund_wallet", {
    _user_id: userId, _amount: amount,
    _description: "Bilalsadasub service payment reversal",
    _idempotency_key: `REFUND_${ref}`,
    _reference: `REFUND_${ref}`,
    _metadata: { ...metadata, original_reference: ref, provider: "bilalsadasub" },
  });
}

async function providerNetworks() {
  const raw = await getJson<any>("/api/v1/plans/networks");
  const rows = Array.isArray(raw) ? raw : (raw?.data ?? raw?.networks ?? []);
  return rows
    .map((x: any) => {
      const providerId = first(x.id, x.network_id, x.code, x.network_code, x.value);
      const name = s(first(x.name, x.network, x.network_name, x.label));
      if (providerId === undefined || providerId === null || !name) return null;
      return {
        code: String(providerId),
        id: String(providerId),
        value: String(providerId),
        name,
        label: name,
        network_code: String(providerId),
        networkCode: String(providerId),
        network_name: name,
        networkName: name,
        raw: x,
      };
    })
    .filter(Boolean);
}

async function resolveNetworkId(value: unknown): Promise<number|null> {
  const requested=s(value).toLowerCase();
  if(!requested) return null;
  const rows=await providerNetworks();
  const found=rows.find((x:any)=>{
    const id=s(x.id).toLowerCase();
    const name=s(x.name).toLowerCase();
    return requested===id || requested===name;
  });
  const id=n(found?.id);
  return id>0?id:null;
}

function selectedNetwork(body: Obj): { id: string; name: string } {
  const selected = body.biller ?? body.network_biller ?? body.selected_biller ?? body.item ?? {};
  const id = s(first(
    body.network_code, body.networkCode, body.network_id, body.networkId,
    selected.network_code, selected.networkCode, selected.network_id, selected.networkId,
    body.biller_code, body.billerCode
  ));
  const name = s(first(
    body.network_name, body.networkName, body.network,
    selected.network_name, selected.networkName, selected.network, selected.name
  ));
  return { id, name };
}

function publicDataPlan(x: any, network: string) {
  const period = normalizePeriod(first(x.period, x.validity, x.duration, x.validity_days));
  const planType = s(first(x.plan_type, x.planType, x.type));
  const providerPrice = n(first(x.amount, x.price, x.charge_amount, x.cost));
  return {
    id: String(first(x.id, x.plan_id, x.code)), code: String(first(x.id, x.plan_id, x.code)),
    name: s(first(x.name, x.plan_name, x.plan, x.description)),
    label: s(first(x.name, x.plan_name, x.plan, x.description)),
    network_name: network,
    networkCode: network,
    providerPrice,
    price: sellingPrice(providerPrice),
    period,
    validity: period,
    plan_type: planType,
    data_tab: dataTab(planType, period),
    is_hot_deal: /sme/i.test(planType),
    raw: { id: first(x.id, x.plan_id), period, plan_type: planType },
  };
}

async function catalog(service: string, body: Obj) {
  if (service === "airtime" || service === "data") {
    const billers = await providerNetworks();
    if (service === "airtime") return { success: true, service, billers, items: [], amount_based: true };

    const { id, name } = selectedNetwork(body);
    if (!id || !name) throw new Error("Please select a network.");
    const [giftingRaw, smeRaw, cooperateRaw] = await Promise.all([
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(name)}&plan_type=GIFTING`),
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(name)}&plan_type=SME`),
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(name)}&plan_type=COOPERATE%20GIFTING`).catch(() => null),
    ]);
    const rows = [giftingRaw, smeRaw, cooperateRaw].flatMap((raw:any) => Array.isArray(raw) ? raw : (raw?.data ?? raw?.plans ?? []));
    const seen = new Set<string>();
    const items = rows.map((x:any)=>publicDataPlan(x,name)).filter((x:any)=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; });
    return { success:true, service, billers:[{code:id,id,name,label:name}], items, plans:items, packages:items };
  }
  if (service === "cable") {
    const code = s(first(body.biller_code, body.cable_tv, body.cable));
    const map:Record<string,{id:number,name:string}> = {"1":{id:1,name:"GOtv"},"2":{id:2,name:"DStv"},"3":{id:3,name:"StarTimes"},gotv:{id:1,name:"GOtv"},dstv:{id:2,name:"DStv"},startime:{id:3,name:"StarTimes"},startimes:{id:3,name:"StarTimes"}};
    const selected = map[code.toLowerCase()];
    if (!selected) return {success:true,service,billers:[{code:"1",name:"GOtv"},{code:"2",name:"DStv"},{code:"3",name:"StarTimes"}],items:[],plans:[],requires_verification:true};
    const raw = await getJson<any>(`/api/v1/plans/cable?cable=${encodeURIComponent(selected.name === "StarTimes" ? "STARTIME" : selected.name.toUpperCase())}`);
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? raw?.plans ?? []);
    const items = rows.map((x:any)=>({id:String(first(x.id,x.plan_id,x.code)),code:String(first(x.id,x.plan_id,x.code)),name:s(first(x.name,x.plan_name,x.plan, x.description)),label:s(first(x.name,x.plan_name,x.plan,x.description)),providerPrice:n(first(x.amount,x.price,x.charge_amount,x.cost)),price:sellingPrice(n(first(x.amount,x.price,x.charge_amount,x.cost))),provider:selected.name}));
    return {success:true,service,billers:[{code:String(selected.id),id:String(selected.id),name:selected.name,label:selected.name}],items,plans:items,packages:items,requires_verification:true};
  }
  if (service === "electricity") {
    const raw = await getJson<any>("/api/v1/plans/discos");
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? raw?.discos ?? []);
    return {success:true,service,billers:rows.map((x:any)=>({code:String(first(x.id,x.disco_id,x.code)),id:String(first(x.id,x.disco_id,x.code)),name:s(first(x.name,x.disco,x.disco_name)),label:s(first(x.name,x.disco,x.disco_name)),disco:first(x.id,x.disco_id,x.code)})),items:[],amount_based:true,requires_verification:true};
  }
  if (service === "education") {
    const raw = await getJson<any>("/api/v1/plans/exams");
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? raw?.exams ?? []);
    const items = rows.map((x:any)=>({id:String(first(x.id,x.exam_id,x.code)),code:String(first(x.id,x.exam_id,x.code)),name:s(first(x.name,x.exam_name,x.title)),label:s(first(x.name,x.exam_name,x.title)),exam_type:s(first(x.type,x.exam_type,x.mode)),providerPrice:n(first(x.amount,x.price,x.charge_amount)),price:sellingPrice(n(first(x.amount,x.price,x.charge_amount))),mode:s(first(x.mode,x.type))}));
    return {success:true,service,billers:items,items,plans:items,packages:items};
  }
  if (service === "internet" || service === "smile" || service === "alpha") {
    const requested = service === "internet" ? s(first(body.provider,body.provider_type,body.biller_code)) : service;
    if (service === "internet" && !requested) {
      return {
        success:true, service,
        billers:[{code:"smile",id:"smile",name:"Smile",label:"Smile"},{code:"alpha",id:"alpha",name:"Alpha",label:"Alpha"}],
        items:[], plans:[], packages:[]
      };
    }
    const type = requested || "smile";
    const raw = await getJson<any>(`/api/sak/plans?type=${encodeURIComponent(type)}`);
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? raw?.plans ?? []);
    const items = rows.map((x:any)=>({id:String(first(x.id,x.plan_id)),code:String(first(x.id,x.plan_id)),name:s(first(x.name,x.plan_name)),label:s(first(x.name,x.plan_name)),providerPrice:n(first(x.charge_amount,x.price,x.amount)),price:sellingPrice(n(first(x.charge_amount,x.price,x.amount))),validity:s(first(x.validity,x.duration)),provider:type}));
    return {success:true,service,billers:[{code:type,id:type,name:type === "alpha" ? "Alpha" : "Smile",label:type === "alpha" ? "Alpha" : "Smile"}],items,plans:items,packages:items};
  }
  if (service === "airtime-card" || service === "data-card" || service === "recharge-card") {
    throw new Error("This card service has no documented dynamic catalogue endpoint in the supplied provider API specification.");
  }
  throw new Error("This service is not available through Bilalsadasub.");
}

async function verify(service:string, body:Obj) {
  if (service === "cable") {
    const cable = n(body.biller_code ?? body.cable_tv ?? body.cable);
    const iuc = s(first(body.iuc,body.customer,body.smartcard_number,body.smartcard_no));
    if (!cable || !/^\d{10}$/.test(iuc)) throw new Error("Enter a valid 10-digit IUC number.");
    const raw = await getJson<any>(`/api/cable/cable-validation?cable=${cable}&iuc=${encodeURIComponent(iuc)}`);
    const name = s(first(raw?.name,raw?.customer_name,raw?.customerName,raw?.data?.name));
    if (!name) throw new Error("Unable to verify this IUC number.");
    return {success:true,customer_name:name,customerName:name,message:"Customer verified successfully."};
  }
  if (service === "electricity") {
    const disco=n(body.biller_code ?? body.disco);
    const meter=s(first(body.meter,body.meter_number,body.customer));
    const meterType=s(first(body.meter_type,body.meterType,"prepaid")).toLowerCase();
    if (!disco || !meter) throw new Error("Meter details are required.");
    const raw=await getJson<any>(`/api/bill/bill-validation?disco=${disco}&meter=${encodeURIComponent(meter)}&meter_type=${encodeURIComponent(meterType)}`);
    const name=s(first(raw?.name,raw?.customer_name,raw?.customerName,raw?.data?.name));
    if (!name) throw new Error("Unable to verify this meter.");
    return {success:true,customer_name:name,customerName:name,message:"Meter verified successfully."};
  }
  if (service === "jamb") {
    const profile=s(first(body.profile_code,body.profile_id));
    const token=s(body.token);
    if (!profile || !token) throw new Error("JAMB profile code and verification token are required.");
    const raw=await postJson<any>("/api/app/verify_jamb",{profile_id:profile,token});
    return {success:true,customer_name:s(first(raw?.name,raw?.candidate_name,raw?.data?.name)),verification:raw};
  }
  throw new Error("Verification is not required for this service.");
}

async function providerPlanPrice(service:string, details:Obj, selectedId:number, network:number|null): Promise<number> {
  if (service === "data") {
    const networkNameValue = s(first(details.network_name, details.networkName, details.network, details.biller?.network_name, details.biller?.networkName, details.biller?.name));
    if (!networkNameValue) throw new Error("Network is required.");
    const [a,b,c] = await Promise.all([
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(networkNameValue)}&plan_type=GIFTING`),
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(networkNameValue)}&plan_type=SME`),
      getJson<any>(`/api/v1/plans/data?network=${encodeURIComponent(networkNameValue)}&plan_type=COOPERATE%20GIFTING`).catch(()=>null),
    ]);
    const rows=[a,b,c].flatMap((raw:any)=>Array.isArray(raw)?raw:(raw?.data??raw?.plans??[]));
    const found=rows.find((x:any)=>n(first(x.id,x.plan_id,x.code))===selectedId);
    return n(first(found?.amount,found?.price,found?.charge_amount,found?.cost));
  }
  if (service === "cable") {
    const cable=s(first(details.provider_name,details.providerName,details.biller?.name,details.cable_name,details.cable_tv,details.cable));
    if (!cable) throw new Error("Cable provider is required.");
    const raw=await getJson<any>(`/api/v1/plans/cable?cable=${encodeURIComponent(cable)}`);
    const rows=Array.isArray(raw)?raw:(raw?.data??raw?.plans??[]);
    const found=rows.find((x:any)=>n(first(x.id,x.plan_id,x.code))===selectedId);
    return n(first(found?.amount,found?.price,found?.charge_amount,found?.cost));
  }
  if (service === "education" || service === "jamb" || service === "waec") {
    const raw=await getJson<any>("/api/v1/plans/exams");
    const rows=Array.isArray(raw)?raw:(raw?.data??raw?.exams??[]);
    const found=rows.find((x:any)=>n(first(x.id,x.exam_id,x.code))===selectedId);
    return n(first(found?.amount,found?.price,found?.charge_amount,found?.cost));
  }
  if (service === "internet" || service === "smile" || service === "alpha") {
    const type=service === "alpha" ? "alpha" : "smile";
    const raw=await getJson<any>(`/api/sak/plans?type=${type}`);
    const rows=Array.isArray(raw)?raw:(raw?.data??raw?.plans??[]);
    const found=rows.find((x:any)=>n(first(x.id,x.plan_id))===selectedId);
    return n(first(found?.charge_amount,found?.price,found?.amount,found?.cost));
  }
  return 0;
}

async function purchase(admin:any,user:any,body:Obj) {
  const service=s(first(body.service,body.type)).toLowerCase();
  const details=body.details ?? body;
  const ref=s(body.idempotency_key ?? body.idempotencyKey) || reference();
  const customer=s(first(details.customer,details.phone,details.mobile_number,details.phone_no,details.account_id));
  const selected=details.item ?? {};
  const networkValue=s(first(details.network_code,details.networkCode,details.network_id,details.networkId,details.biller?.network_code,details.biller?.networkCode,details.biller_code,details.network));
  const network=await resolveNetworkId(networkValue);
  let providerAmount=0;
  let sellingAmount=n(body.amount ?? details.amount ?? details.selling_amount);
  let providerBody:Obj;
  let providerPath="";
  let transactionType=service;

  if (service === "airtime") {
    providerAmount=Math.round(sellingAmount);
    if (providerAmount<50 || providerAmount>50000) throw new Error("Airtime amount must be between ₦50 and ₦50,000.");
    if (!network || !/^\d{11}$/.test(customer)) throw new Error("Enter a valid phone number and network.");
    providerPath="/api/topup";
    providerBody={network,phone:customer,amount:providerAmount,plan_type:"VTU","request-id":requestId(ref)};
    transactionType="airtime";
  } else if (service === "data") {
    if (!network || !customer) throw new Error("Network, phone number and data plan are required.");
    const planId=n(first(details.item_code,details.plan_code,selected.id,selected.code));
    providerAmount=await providerPlanPrice("data",details,planId,network);
    if (!planId || !providerAmount) throw new Error("The selected data plan is unavailable.");
    providerPath="/api/data";
    providerBody={network,phone:customer,data_plan:planId,bypass:false,"request-id":requestId(ref)};
    transactionType="data";
  } else if (service === "cable") {
    const cable=n(first(details.biller_code,details.cable_tv,details.cable));
    const iuc=s(first(details.smartcard_number,details.smartcard_no,details.customer));
    const planId=n(first(details.item_code,details.plan_code,selected.id,selected.code));
    providerAmount=await providerPlanPrice("cable",details,planId,null);
    if (!cable || !/^\d{10}$/.test(iuc) || !planId || !providerAmount) throw new Error("Cable TV details are incomplete.");
    providerPath="/api/cable";
    providerBody={cable,iuc,plan_id:planId,phone:customer || undefined,"request-id":requestId(ref)};
    transactionType="cable";
  } else if (service === "electricity") {
    const disco=n(first(details.biller_code,details.disco));
    const meter=s(first(details.meter_number,details.meter,details.customer));
    const meterType=s(first(details.meter_type,details.meterType,"prepaid")).toLowerCase();
    providerAmount=n(details.provider_amount ?? details.amount);
    if (!disco || !meter || !["prepaid","postpaid"].includes(meterType) || providerAmount<500) throw new Error("Electricity payment details are incomplete.");
    providerPath="/api/bill";
    providerBody={disco,meter_type:meterType,meter,amount:providerAmount,phone:customer || undefined,"request-id":requestId(ref)};
    transactionType="electricity";
  } else if (service === "education" || service === "jamb" || service === "waec") {
    const examId=n(first(details.item_code,details.exam_type,details.exam_id,selected.id,selected.code));
    providerAmount=await providerPlanPrice(service,details,examId,null);
    if (!examId || !providerAmount) throw new Error("Education plan is unavailable.");
    providerPath="/api/exam";
    providerBody={exam_id:examId,quantity:service === "education" ? n(details.quantity || 1) : 1,phone:customer || undefined,"request-id":requestId(ref)};
    if (details.profile_code) providerBody.profile_code=s(details.profile_code);
    if (details.jamb_type) providerBody.jamb_type=s(details.jamb_type);
    transactionType="education";
  } else if (service === "internet" || service === "smile" || service === "alpha") {
    const planId=n(first(details.item_code,details.plan_code,selected.id,selected.code));
    const account=s(first(details.account_id,details.account,details.customer));
    providerAmount=await providerPlanPrice(service,details,planId,null);
    const type=service === "alpha" ? "alpha" : "smile";
    if (!planId || !account || !providerAmount) throw new Error("Internet service details are incomplete.");
    providerPath="/api/sak";
    providerBody={plan_id:planId,account,token:bilalToken()};
    transactionType="internet";
    // The provider's SAK endpoint requires the user's provider PIN in applicable Tier 2 flows.
    // IyanjuPay payment PIN/biometric authorization is separate and is never sent as provider PIN.
    if (details.provider_pin) providerBody.pin=s(details.provider_pin);
    if (type === "smile" && details.account_type) providerBody.account_type=s(details.account_type);
  } else if (service === "data-card" || service === "airtime-card" || service === "recharge-card") {
    throw new Error("This card service has no documented dynamic catalogue endpoint in the supplied provider API specification.");
  } else throw new Error("This service is not available through Bilalsadasub.");

  // Never trust a customer-supplied selling amount. Recalculate it server-side.
  if (service === "airtime") {
    sellingAmount = providerAmount;
  } else if (service === "education" || service === "jamb" || service === "waec") {
    sellingAmount = sellingPrice(providerAmount) * Math.max(1, n(details.quantity || 1));
  } else if (service === "airtime-card" || service === "data-card" || service === "recharge-card") {
    sellingAmount = sellingPrice(providerAmount) * Math.max(1, n(details.quantity || 1));
  } else {
    sellingAmount = sellingPrice(providerAmount);
  }

  const metadata={provider:"bilalsadasub",provider_path:providerPath,provider_amount:providerAmount,service,request_id:ref};
  const {data:debit,error:debitError}=await admin.rpc("debit_wallet",{_user_id:user.id,_amount:sellingAmount,_description:`${service} purchase`,_idempotency_key:ref,_reference:ref,_category:"bill_payment",_metadata:metadata});
  if (debitError) throw new Error("Unable to process the payment from your wallet.");
  const txId=debit?.id ?? null;
  await updateTransaction(admin,user.id,ref,{status:"pending",provider:"bilalsadasub",provider_reference:ref,transaction_type:transactionType,metadata});

  let provider:any;
  try {
    if (providerPath === "/api/sak") {
      // SAK token is provider API token; account purchase authentication is separate from API authentication.
      providerBody.token = bilalToken();
    }
    provider=await postJson<any>(providerPath,providerBody);
  } catch (error) {
    console.error("Bilalsadasub purchase transport failure",{service,ref,error});
    await updateTransaction(admin,user.id,ref,{
      status:"pending",
      metadata:{...metadata,reconciliation_required:true,pending_reason:"provider_transport_failure",pending_since:new Date().toISOString()}
    });
    return {success:true,status:"pending",reference:ref,transaction_reference:ref,transaction_id:txId,message:"Your payment is being verified. Please wait while we confirm the provider result."};
  }

  const failed=providerFailed(provider);
  const success=providerSuccessful(provider);
  const safe={status:provider?.status ?? null,message:provider?.message ?? null,transid:provider?.transid ?? null,request_id:provider?.["request-id"] ?? provider?.request_id ?? null};
  if (failed) {
    const refundResult=await refund(admin,user.id,sellingAmount,ref,{...metadata,provider_response:safe});
    await updateTransaction(admin,user.id,ref,{status:"failed",provider:"bilalsadasub",provider_reference:provider?.transid ?? ref,metadata:{...metadata,provider_response:safe,refunded:!refundResult.error}});
    throw new Error("Purchase failed.");
  }

  if (!success) {
    await updateTransaction(admin,user.id,ref,{status:"pending",provider:"bilalsadasub",provider_reference:provider?.transid ?? ref,metadata:{...metadata,provider_response:safe,reconciliation_required:true,pending_reason:"provider_status_uncertain"}});
    return {success:true,status:"pending",reference:ref,transaction_reference:ref,transaction_id:txId,message:"Your payment is being verified. Please wait while we confirm the provider result."};
  }

  await updateTransaction(admin,user.id,ref,{status:"success",provider:"bilalsadasub",provider_reference:provider?.transid ?? ref,metadata:{...metadata,provider_response:safe,provider_amount:providerAmount}});
  return {success:true,status:"success",reference:ref,transaction_reference:ref,transaction_id:txId,message:"Purchase completed successfully.",provider_reference:provider?.transid ?? null,provider_data:provider?.pins ? {pins:provider.pins} : undefined};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  if (req.method !== "POST") return json({success:false,error:"Method not allowed."},405);
  const user=await getUser(req);
  if (!user) return json({success:false,error:"Authentication required."},401);
  const admin=adminClient();
  let body:Obj={};
  try { body=await req.json(); } catch { return json({success:false,error:"Invalid request body."},400); }
  const action=s(body.action).toLowerCase();
  try {
    if (action === "billers") {
      const service = s(body.service).toLowerCase();
      if (service === "airtime" || service === "data") {
        const billers = await providerNetworks();
        return json({success:true,service,billers,items:[],amount_based:service === "airtime"});
      }
      return json(await catalog(service,body));
    }
    if (action === "catalog" || action === "get_catalog") return json(await catalog(s(body.service).toLowerCase(),body));
    if (action === "verify_customer" || action === "verify") return json(await verify(s(body.service).toLowerCase(),body));
    if (action === "purchase") return json(await purchase(admin,user,body));
    return json({success:false,error:"Unsupported service request."},400);
  } catch (error) {
    console.error("Bilalsadasub service error",{action,service:body.service,user_id:user.id,error});
    return json({success:false,error:publicError()},400);
  }
});
