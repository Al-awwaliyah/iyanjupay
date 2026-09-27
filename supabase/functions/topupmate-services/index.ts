import{corsHeaders,json,adminClient,getUser}from'../_shared/auth.ts';
import{get,post,rows,id,name,provider,price,sell,ceil10,status,msg,pref}from'../_shared/topupmate.ts';
type O=Record<string,any>;const MARKUP=3;const NO=new Set(['airtime','airtime-card','recharge-card','electricity']);const s=(v:any)=>String(v??'').trim();const n=(v:any)=>Number.isFinite(Number(v))?Number(v):0;const ref=()=>`TPM_${crypto.randomUUID().replace(/-/g,'')}`;
function network(v:any){const x=s(v).toLowerCase();return({mtn:'1','1':'1',airtel:'2','2':'2',glo:'3','3':'3','9mobile':'4','9 mobile':'4','4':'4',etisalat:'4'}as any)[x]??x}
function cable(v:any){const x=s(v).toLowerCase().replace(/[^a-z0-9]+/g,'');if(x==='1'||x==='gotv'||x.includes('gotv'))return'1';if(x==='2'||x==='dstv'||x.includes('dstv'))return'2';if(x==='3'||x==='startimes'||x==='startime'||x.includes('startimes')||x.includes('startime'))return'3';return s(v)}
function disco(v:any){const x=s(v).toLowerCase().replace(/[^a-z0-9]+/g,'');const ids:any={'1':'1','ikeja':'1','ikejaelectric':'1','ikedc':'1','2':'2','eko':'2','ekoelectric':'2','ekedc':'2','3':'3','kano':'3','kanoelectric':'3','kedco':'3','4':'4','portharcourt':'4','portharcourtelectric':'4','phedc':'4','5':'5','jos':'5','joselectric':'5','jed':'5','jedc':'5','6':'6','ibadan':'6','ibadanelectric':'6','ibedc':'6','7':'7','kaduna':'7','kadunaelectric':'7','kedc':'7','knedc':'7','8':'8','abuja':'8','abujaelectric':'8','aedc':'8','9':'9','enugu':'9','enuguelectric':'9','eedc':'9','10':'10','benin':'10','beninelectric':'10','bedc':'10','11':'11','yola':'11','yolaelectric':'11','yedc':'11'};return ids[x]??s(v)}
function catService(service:string,body:O={}){
 if(service==='airtime')return'network';
 if(service==='data')return'network';
 if(service==='cable')return(body.provider||body.provider_name||body.biller_code)?'cabletv':'cable-provider';
 if(service==='electricity')return'electricity';
 if(['education','jamb','waec','neco','nabteb'].includes(service))return'exampin';
 if(['airtime-card','recharge-card'].includes(service))return'recharge-card';
 if(service==='data-card')return'datapin';
 if(['internet','smile'].includes(service))return'smile';
 if(service==='gift-card')return'giftcard';
 return service;
}

const educationProviders=[
 {id:'JAMB',code:'JAMB',name:'JAMB',provider:'JAMB',provider_service:'jamb'},
 {id:'WAEC',code:'WAEC',name:'WAEC',provider:'WAEC',provider_service:'waec'},
 {id:'NECO',code:'NECO',name:'NECO',provider:'NECO',provider_service:'neco'},
 {id:'NABTEB',code:'NABTEB',name:'NABTEB',provider:'NABTEB',provider_service:'nabteb'},
];

function publicBiller(r:any){
 const code=String(r?.networkid??r?.provider_id??r?.id??r?.provider??r?.network??'');
 const nm=name(r)||provider(r)||code;
 return {id:code,code,name:nm,display_name:nm,network_name:r?.network,provider_name:r?.providerName??r?.provider_name??r?.provider,status:r?.status??'active',successPercentage:r?.successPercentage,discount:r?.discount,raw:r};
}

function providerMatches(raw:any,wanted:string){
 const w=wanted.toLowerCase().replace(/[^a-z0-9]+/g,'');
 const vals=[raw?.provider,raw?.provider_name,raw?.providerName,raw?.exam,raw?.exam_type,raw?.examType,raw?.service,raw?.service_name,raw?.name,raw?.description];
 return vals.some(v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'')===w || String(v??'').toLowerCase().includes(wanted.toLowerCase()));
}

async function getDataPlans(networkId:string){
 const candidates=[
  {service:'data',network:networkId},
  {service:'data',networkid:networkId},
  {service:'data',network_id:networkId},
  {service:'data',provider:networkId},
  {service:'data',provider_id:networkId},
 ];
 for(const params of candidates){
  const r=await get('/services/',params);
  if(!r.ok)continue;
  const a=rows(r.body);
  if(a.some((x:any)=>price(x)>0 || !!x?.plan_id || !!x?.planid || !!x?.data_plan || !!x?.bundle))return a;
 }
 return [];
}

async function getInternetPlans(){
 const candidates=['smile','smile-data','internet','broadband'];
 for(const serviceName of candidates){
  const r=await get('/services/',{service:serviceName});
  if(!r.ok)continue;
  const a=rows(r.body);
  if(a.some((x:any)=>price(x)>0 || !!x?.plan_id || !!x?.planid || !!x?.bundle))return a;
 }
 return [];
}

async function giftCatalog(productId?:string){
 const r=await get('/giftcard/available/',productId?{productId}:{});
 if(!r.ok||String(r.body?.status).toLowerCase()==='fail')throw new Error(msg(r.body));
 return rows(r.body?.msg??r.body?.data??r.body);
}

function giftProduct(r:any){
 const productId=String(r?.productId??r?.product_id??r?.id??'');
 const nm=s(r?.productName??r?.product_name??r?.name??'Gift Card');
 const denoms=Array.isArray(r?.fixedRecipientDenominations)?r.fixedRecipientDenominations.map(Number).filter((x:number)=>x>0):[];
 const senderDenoms=Array.isArray(r?.fixedSenderDenominations)?r.fixedSenderDenominations.map(Number).filter((x:number)=>x>0):[];
 const mapRows=Array.isArray(r?.fixedRecipientToSenderDenominationsMap)?r.fixedRecipientToSenderDenominationsMap:[];
 const mappedSender=mapRows.map((x:any)=>{const v=Object.values(x||{})[0];return Number(v)}).filter((x:number)=>x>0);
 const effectiveSender=senderDenoms.length?senderDenoms:mappedSender;
 const firstPrice=effectiveSender[0]||0;
 return {id:productId,code:productId,name:nm,display_name:nm,provider:'Topupmate',provider_name:'Topupmate',product_id:productId,productId,countryCode:r?.countryCode,denominationType:r?.denominationType,fixedRecipientDenominations:denoms,minRecipientDenomination:r?.minRecipientDenomination,maxRecipientDenomination:r?.maxRecipientDenomination,fixedSenderDenominations:effectiveSender,fixedRecipientToSenderDenominationsMap:mapRows,senderFee:r?.senderFee,senderFeePercentage:r?.senderFeePercentage,logoUrls:r?.logoUrls||[],redeemInstruction:r?.redeemInstruction||{},providerPrice:firstPrice,price:firstPrice,selling_price:firstPrice?ceil10(firstPrice*1.03):0,raw:r};
}

async function billers(service:string){
 if(service==='education')return{success:true,service,billers:educationProviders,items:[],plans:[],packages:[]};
 if(service==='gift-card'){
  const a=await giftCatalog();
  const products=a.filter((x:any)=>String(x?.status??'ACTIVE').toLowerCase()!=='inactive').map(giftProduct).filter((x:any)=>x.id);
  return{success:true,service,billers:products,items:[],plans:[],packages:[]};
 }
 const c=await get('/services/',{service:catService(service)});
 if(!c.ok||String(c.body?.status).toLowerCase()==='fail')throw new Error(msg(c.body));
 const st=await get('/status/');const sb=st.body||{};let a=rows(c.body);
 if(['cable','electricity'].includes(service)){const z=service==='cable'?sb.cable:sb.electricity;if(Array.isArray(z)&&z.length)a=z;}
 a=a.filter((r:any)=>{const x=s(r?.status).toLowerCase();return !['inactive','off','disabled','unavailable'].includes(x)});
 return{success:true,service,billers:a.map(publicBiller),items:[],plans:[],packages:[]};
}

async function catalog(service:string,b:O){
 if(service==='data'){
  const networkId=network(b.provider_name||b.provider||b.network_name||b.network||b.biller_code);
  const a=await getDataPlans(networkId);
  const items=a.map((r:any)=>norm(service,r)).filter((x:any)=>x.providerPrice>0);
  const wanted=String(b.provider_name||b.provider||b.network_name||b.network||b.biller_code||'').toLowerCase();
  const filtered=items.filter((x:any)=>!wanted || providerMatches(x.raw,wanted) || String(x.provider).toLowerCase().includes(wanted.replace(/^\d+$/,'')) || String(x.raw?.networkid??x.raw?.network_id??'')===networkId);
  return{success:true,service,billers:[],items:filtered,plans:filtered,packages:filtered,hot_deals:[]};
 }
 if(service==='internet'||service==='smile'){
  const a=await getInternetPlans();
  const items=a.map((r:any)=>norm('internet',r)).filter((x:any)=>x.providerPrice>0);
  return{success:true,service:'internet',billers:[],items,plans:items,packages:items};
 }
 if(service==='gift-card'){
  const productId=s(b.product_id??b.productId??b.biller_code??b.provider);
  const products=await giftCatalog(productId||undefined);
  const product=products.find((x:any)=>String(x?.productId??x?.product_id??x?.id??'')===productId)??products[0];
  if(!product)throw new Error('Gift card product not found.');
  const gp=giftProduct(product);
  const denoms=gp.fixedRecipientDenominations.length?gp.fixedRecipientDenominations:[gp.minRecipientDenomination,gp.maxRecipientDenomination].filter((x:any)=>Number(x)>0);
  const sender=gp.fixedSenderDenominations;
  const items=denoms.map((d:number,i:number)=>{const providerAmount=Number(sender[i]??0);return{id:`${gp.id}:${d}`,code:`${gp.id}:${d}`,plan_id:`${gp.id}:${d}`,name:`${gp.name} $${d}`,display_name:`${gp.name} $${d}`,provider:'Topupmate',provider_name:'Topupmate',providerPrice:providerAmount,provider_price:providerAmount,selling_price:providerAmount?sell(providerAmount,3):0,price:providerAmount?sell(providerAmount,3):0,amount:providerAmount?sell(providerAmount,3):0,recipient_amount:d,product_id:gp.id,productId:gp.id,denomination:d,raw:{...product,fixedRecipientDenominations:gp.fixedRecipientDenominations,fixedSenderDenominations:sender}}});
  return{success:true,service:'gift-card',billers:[gp],items,plans:items,packages:items};
 }
 const c=await get('/services/',{service:catService(service,b)});
 if(!c.ok||String(c.body?.status).toLowerCase()==='fail')throw new Error(msg(c.body));
 const a=rows(c.body);
 if(service==='cable'&&!b.provider_name&&!b.biller_code)return{success:true,service,billers:a.map((r:any)=>({id:id(r),code:id(r),name:name(r)||provider(r),display_name:name(r)||provider(r),provider:provider(r),raw:r})),items:[],plans:[],packages:[]};
 const rawWanted=s(b.provider_name||b.provider||b.network_name||b.network||b.biller_code);const wanted=rawWanted.toLowerCase();const wantedName=service==='cable'?({1:'gotv',2:'dstv',3:'startimes',gotv:'gotv','gotvprovider':'gotv',dstv:'dstv','dstvprovider':'dstv',startimes:'startimes',startime:'startimes'} as any)[wanted.replace(/[^a-z0-9]+/g,'')]??wanted:wanted;
 const items=a.map(r=>norm(service,r)).filter((r:any)=>{if(!wantedName)return true;const rp=s(r.provider).toLowerCase().replace(/[^a-z0-9]+/g,'');const rawp=s(r.raw?.provider??r.raw?.provider_name).toLowerCase().replace(/[^a-z0-9]+/g,'');const rn=s(r.name).toLowerCase();const w=wantedName.replace(/[^a-z0-9]+/g,'');return rp===w||rawp===w||rn.startsWith(w+' ')||rn.includes(w+' ')||providerMatches(r.raw,wantedName);});
 return{success:true,service,billers:[],items,plans:items,packages:items};
}

async function verify(service:string,b:O){if(service==='cable'){const p=cable(b.provider_name??b.provider??b.biller_code??b.cable_tv),i=s(b.iuc??b.smartcard_number??b.smartcard_no??b.customer);if(!p||!/^[0-9]{10}$/.test(i))throw new Error('Enter a valid 10-digit IUC / SmartCard number.');const r=await post('/cable/verify/',{provider:p,iucnumber:i});if(!r.ok||status(r.body)==='fail')throw new Error(msg(r.body));const d=r.body?.response??r.body?.data??r.body,nm=s(d?.name??d?.customer_name??d?.customerName??d?.subscriber_name);if(!nm)throw new Error('Unable to verify this SmartCard number.');return{success:true,customer_name:nm,customerName:nm,message:'Customer verified successfully.'};}if(service==='electricity'){const p=disco(b.biller_code??b.provider??b.disco),m=s(b.meter??b.meter_number??b.customer),t=s(b.meter_type??b.meterType??'prepaid').toLowerCase();if(!p||!m||!['prepaid','postpaid'].includes(t))throw new Error('Meter details are required.');const r=await post('/electricity/verify/',{provider:p,meternumber:m,metertype:t});if(!r.ok||status(r.body)==='fail')throw new Error(msg(r.body));const d=r.body?.response??r.body?.data??r.body,nm=s(d?.name??d?.customer_name??d?.customerName??d?.customer_name_on_meter);return{success:true,customer_name:nm,customerName:nm,message:'Meter verified successfully.'};}throw new Error('Verification is not required for this service.');}
async function update(a:any,u:string,r:string,x:O){const{error}=await a.from('transactions').update(x).eq('user_id',u).eq('reference_number',r);if(error)console.error('Topupmate transaction update failed',error);}
async function refund(a:any,u:string,amt:number,r:string,m:O){return a.rpc('refund_wallet',{_user_id:u,_amount:amt,_description:'Topupmate service reversal',_idempotency_key:`REFUND_${r}`,_reference:`REFUND_${r}`,_metadata:m});}
async function purchase(a:any,u:any,b:O){const service=s(b.service??b.type).toLowerCase(),d=b.details??b,r=s(b.idempotency_key??b.idempotencyKey)||ref(),item=d.item??{},customer=s(d.customer??d.phone??d.mobile_number??d.phoneNumber??d.account_id);let pAmt=0,sAmt=0,path='',body:O={};
if(service==='airtime'){const net=network(d.network_code??d.networkId??d.biller_code??d.network);pAmt=n(d.amount??b.amount);if(!net||!/^[0-9]{11}$/.test(customer)||pAmt<50)throw new Error('Enter a valid phone number, network and airtime amount.');path='/airtime/';body={network:net,phone:customer,amount:pAmt,airtime_type:'VTU',ref:r};sAmt=pAmt;}
else if(service==='data'){const net=network(d.network_code??d.networkId??d.biller_code??d.network),plan=s(d.item_code??d.plan_code??item.id??item.code);if(!net||!/^[0-9]{11}$/.test(customer)||!plan)throw new Error('Network, phone number and data plan are required.');path='/data/';body={network:net,phone:customer,plan,ref:r};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'data'});const f=rows(c.body).find((x:any)=>id(x)===plan);pAmt=price(f);}if(!pAmt)throw new Error('The selected data plan is unavailable.');sAmt=sell(pAmt,3);}
else if(service==='cable'){const pr=cable(d.provider_name??d.providerName??d.biller_code??d.cable_tv),i=s(d.smartcard_number??d.smartcardNumber??d.smartcard_no??d.customer),plan=s(d.item_code??d.plan_code??item.id??item.code);if(!pr||!/^[0-9]{10}$/.test(i)||!plan)throw new Error('Cable provider, SmartCard number and package are required.');path='/cabletv/';body={provider:pr,iucnumber:i,plan,ref:r,subtype:s(d.subtype??'renew')||'renew',phone:customer||undefined};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'cabletv'});pAmt=price(rows(c.body).find((x:any)=>id(x)===plan));}if(!pAmt)throw new Error('The selected cable package is unavailable.');sAmt=sell(pAmt,3);}
else if(service==='electricity'){const pr=disco(d.biller_code??d.provider??d.disco),m=s(d.meter_number??d.meter??d.customer),t=s(d.meter_type??d.meterType??'prepaid').toLowerCase();pAmt=n(d.provider_amount??d.amount??b.amount);if(!pr||!m||!['prepaid','postpaid'].includes(t)||pAmt<=0)throw new Error('Electricity provider, meter type, meter number and amount are required.');path='/electricity/';body={provider:pr,meternumber:m,amount:pAmt,metertype:t,phone:customer||undefined,ref:r};sAmt=pAmt;}
else if(['education','jamb','waec','neco','nabteb'].includes(service)){const pr=s(d.provider??d.provider_name??d.biller_code??'WAEC').toUpperCase(),q=Math.max(1,Math.floor(n(d.quantity??1)));path='/exampin/';body={provider:pr,quantity:q,ref:r};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'exampin'});pAmt=price(rows(c.body).find((x:any)=>id(x)===s(d.item_code??item.id)));}if(!pAmt)throw new Error('The selected education PIN is unavailable.');sAmt=sell(pAmt,3)*q;}
else if(service==='airtime-card'||service==='recharge-card'){const net=network(d.network_code??d.networkId??d.biller_code??d.network),plan=s(d.item_code??item.id??item.code),q=Math.max(1,Math.floor(n(d.quantity??1)));if(!net||!plan)throw new Error('Network and airtime PIN denomination are required.');path='/rechargepin/';body={network:net,quantity:q,plan,businessname:s(d.businessname??'IyanjuPay'),ref:r};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'recharge-card'});pAmt=price(rows(c.body).find((x:any)=>id(x)===plan));}if(!pAmt)throw new Error('The selected recharge PIN is unavailable.');sAmt=pAmt*q;}
else if(service==='data-card'){const net=network(d.network_code??d.networkId??d.biller_code??d.network),plan=s(d.item_code??item.id??item.code),q=Math.max(1,Math.floor(n(d.quantity??1)));if(!net||!plan)throw new Error('Network and data PIN plan are required.');path='/datapin/';body={network:net,quantity:q,data_plan:plan,businessname:s(d.businessname??'IyanjuPay'),ref:r};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'datapin'});pAmt=price(rows(c.body).find((x:any)=>id(x)===plan));}if(!pAmt)throw new Error('The selected data PIN is unavailable.');sAmt=sell(pAmt,3)*q;}
else if(service==='gift-card'){
 const productId=s(d.product_id??d.productId??item.product_id??item.productId??d.biller_code);
 const recipientEmail=s(d.email??d.recipient_email??d.account_number??d.customer??customer);
 const amount=n(d.recipient_amount??d.amount??item.recipient_amount??item.denomination);
 const sender=s(d.sender??'IyanjuPay Customer');
 const units=Math.max(1,Math.floor(n(d.units??d.quantity??1)));
 if(!productId||!recipientEmail||!/^\S+@\S+\.\S+$/.test(recipientEmail)||amount<=0)throw new Error('Gift card product, amount and a valid email address are required.');
 path='/giftcard/';body={product:Number(productId),amount,email:recipientEmail,sender,units,ref:r};
 pAmt=n(item.providerPrice??item.provider_price??item.price);
 if(!pAmt){const products=await giftCatalog(productId);const gp=products.find((x:any)=>String(x?.productId??x?.product_id??x?.id??'')===productId);const den=Array.isArray(gp?.fixedRecipientDenominations)?gp.fixedRecipientDenominations.map(Number):[];const snd=Array.isArray(gp?.fixedSenderDenominations)?gp.fixedSenderDenominations.map(Number):[];const mapped=Array.isArray(gp?.fixedRecipientToSenderDenominationsMap)?gp.fixedRecipientToSenderDenominationsMap.map((x:any)=>Number(Object.values(x||{})[0])).filter((x:number)=>x>0):[];const effectiveSender=snd.length?snd:mapped;const idx=den.findIndex((x:number)=>x===amount);pAmt=idx>=0?n(effectiveSender[idx]):0;}
 if(!pAmt)throw new Error('The selected gift card denomination is unavailable.');sAmt=sell(pAmt,3)*units;
}
else if(service==='internet'||service==='smile'){const plan=s(d.item_code??d.plan_code??item.id??item.code),acct=s(d.account_number??d.accountNumber??d.account_id??d.customer);if(!plan||!acct)throw new Error('Internet account and Smile plan are required.');path='/smile-data/';body={PhoneNumber:acct,BundleTypeCode:plan,actype:s(d.account_type??'prepaid')};pAmt=n(item.providerPrice??item.provider_price??item.price);if(!pAmt){const c=await get('/services/',{service:'smile'});pAmt=price(rows(c.body).find((x:any)=>id(x)===plan));}if(!pAmt)throw new Error('The selected internet plan is unavailable.');sAmt=sell(pAmt,3);}
else throw new Error('This service is not available through Topupmate.');
const meta={provider:'topupmate',provider_path:path,provider_amount:pAmt,selling_amount:sAmt,service,request_id:r,customer:customer||null,provider_catalog_id:s(item.id??d.item_code)||null};const debit=await a.rpc('debit_wallet',{_user_id:u.id,_amount:sAmt,_description:`${service} purchase`,_idempotency_key:r,_reference:r,_category:'bill_payment',_metadata:meta});if(debit.error)throw new Error('Unable to process the payment from your wallet.');const tx=debit.data?.id??null;await update(a,u.id,r,{status:'pending',provider:'topupmate',provider_reference:r,transaction_type:service,metadata:meta});let pr;try{const q=await post(path,body);pr=q.body;if(!q.ok&&status(pr)!=='processing'){const rr=await refund(a,u.id,sAmt,r,{...meta,provider_response:pr});await update(a,u.id,r,{status:'failed',provider:'topupmate',provider_reference:pref(pr)??r,metadata:{...meta,provider_response:pr,refunded:!rr.error}});throw new Error('Purchase failed. Your wallet has been refunded.');}}catch(e){if(e instanceof Error&&e.message.includes('refunded'))throw e;await update(a,u.id,r,{status:'pending',provider:'topupmate',provider_reference:r,metadata:{...meta,reconciliation_required:true,pending_reason:'provider_transport_failure'}});return{success:true,status:'pending',reference:r,transaction_reference:r,transaction_id:tx,message:'Your payment is being verified. Please wait while we confirm the provider result.'};}const st=status(pr),pRef=pref(pr)??r;if(st==='fail'){const rr=await refund(a,u.id,sAmt,r,{...meta,provider_response:pr});await update(a,u.id,r,{status:'failed',provider:'topupmate',provider_reference:pRef,metadata:{...meta,provider_response:pr,refunded:!rr.error}});throw new Error('Purchase failed. Your wallet has been refunded.');}if(st==='processing'){await update(a,u.id,r,{status:'pending',provider:'topupmate',provider_reference:pRef,metadata:{...meta,provider_response:pr,reconciliation_required:true,pending_reason:'provider_processing'}});return{success:true,status:'pending',reference:r,transaction_reference:r,transaction_id:tx,provider_reference:pRef,message:'Your payment is being processed.'};}await update(a,u.id,r,{status:'success',provider:'topupmate',provider_reference:pRef,metadata:{...meta,provider_response:pr}});return{success:true,status:'success',reference:r,transaction_reference:r,transaction_id:tx,provider_reference:pRef,provider_data:pr?.response??pr?.data??null,message:'Purchase completed successfully.'};}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405);const u=await getUser(req);if(!u)return json({success:false,error:'Authentication required.'},401);const a=adminClient();let b:O={};try{b=await req.json()}catch{return json({success:false,error:'Invalid request body.'},400)}const ac=s(b.action).toLowerCase();try{if(ac==='billers')return json(await billers(s(b.service).toLowerCase()));if(ac==='catalog'||ac==='get_catalog')return json(await catalog(s(b.service).toLowerCase(),b));if(ac==='verify_customer'||ac==='verify')return json(await verify(s(b.service).toLowerCase(),b));if(ac==='purchase')return json(await purchase(a,u,b));if(ac==='transaction_status'||ac==='status'){const r=s(b.reference??b.transaction_reference??b.transref);if(!r)throw new Error('Transaction reference is required.');const q=await get('/transaction/status/',{reference:r});if(!q.ok)throw new Error(msg(q.body));return json({success:true,status:status(q.body),reference:r,transaction:q.body});}if(ac==='wallet'){const q=await get('/user/');if(!q.ok)throw new Error(msg(q.body));return json({success:true,wallet:q.body});}if(ac==='notifications'){const q=await get('/notification/');if(!q.ok)throw new Error(msg(q.body));return json({success:true,notifications:q.body?.notifications??[]});}if(ac==='transactions'){const q=await get('/transaction/',b.params??{});if(!q.ok)throw new Error(msg(q.body));return json({success:true,...q.body});}throw new Error('Unsupported service request.');}catch(e:any){console.error('Topupmate service error',{action:ac,service:b.service,user_id:u.id,error:e});return json({success:false,error:String(e?.message??'Service request failed.')},400)}});
