import { corsHeaders, json, adminClient, getUser } from "../_shared/auth.ts";
import { bilalToken, getJson, networkId, postJson } from "../_shared/bilalsadasub.ts";
const s=(v:unknown)=>String(v??"").trim(); const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({success:false,error:"Method not allowed."},405);
  const user=await getUser(req); if(!user)return json({success:false,error:"Authentication required."},401);
  const admin=adminClient(); let b:any; try{b=await req.json()}catch{return json({success:false,error:"Invalid request body."},400)}
  const action=s(b.action).toLowerCase(); const phone=s(b.phone); const network=networkId(b.network);
  try{
    if(action==="rates"){const raw=await getJson<any>("/api/v1/plans/networks?service=cash");return json({success:true,networks:Array.isArray(raw)?raw:(raw?.data??raw?.networks??[])});}
    if(!network||!/^[0-9]{11}$/.test(phone))throw new Error("Enter a valid phone number and network.");
    if(action==="start"){
      const raw=await postJson<any>("/api/cash",{step:1,phone,network,token:bilalToken()});
      const session=s(raw?.data); if(!session)throw new Error("Unable to start airtime-to-cash verification.");
      const {data,error}=await admin.from("bilalsadasub_cash_sessions").insert({user_id:user.id,session_data:session,phone,network,step:1}).select("id").single();
      if(error)throw new Error("Unable to start airtime-to-cash verification.");
      return json({success:true,session_id:data.id,message:raw?.message??"OTP sent successfully."});
    }
    const sessionId=s(b.session_id); if(!sessionId)throw new Error("Airtime-to-cash session is required.");
    const {data:session,error:sessionError}=await admin.from("bilalsadasub_cash_sessions").select("*").eq("id",sessionId).eq("user_id",user.id).eq("used",false).maybeSingle();
    if(sessionError||!session||new Date(session.expires_at).getTime()<Date.now())throw new Error("This verification session has expired. Start again.");
    if(action==="verify"){
      const otp=s(b.otp); if(!/^[0-9]{4,6}$/.test(otp))throw new Error("Enter the OTP sent to the airtime line.");
      const raw=await postJson<any>("/api/cash",{step:2,phone:session.phone,network:session.network,otp,data:session.session_data,token:bilalToken()});
      const next=s(raw?.data); if(!next)throw new Error("Unable to verify the OTP.");
      await admin.from("bilalsadasub_cash_sessions").update({session_data:next,step:2}).eq("id",session.id);
      return json({success:true,session_id:session.id,balance:raw?.balance??raw?.airtime_balance??null,message:raw?.message??"OTP verified successfully."});
    }
    if(action==="complete"){
      const amount=n(b.amount); const sharePin=s(b.share_pin); if(amount<=0||!/^\d{4}$/.test(sharePin))throw new Error("Enter a valid amount and 4-digit share PIN.");
      const raw=await postJson<any>("/api/cash",{step:3,phone:session.phone,network:session.network,amount,share_pin:sharePin,data:session.session_data,token:bilalToken(),...(b.pin?{pin:s(b.pin)}:{})});
      const credited=n(raw?.credited); if(credited<=0)throw new Error("Airtime-to-cash conversion was not confirmed.");
      await admin.from("bilalsadasub_cash_sessions").update({used:true,step:3}).eq("id",session.id);
      const ref=`IP_CASH_${crypto.randomUUID().replaceAll("-","")}`;
      const {error}=await admin.rpc("credit_wallet",{_user_id:user.id,_amount:credited,_description:"Airtime to Cash credit",_idempotency_key:ref,_reference:ref,_provider:"bilalsadasub",_provider_reference:s(raw?.transid),_metadata:{service:"airtime_cash",transid:raw?.transid??null,source_amount:amount,credited}});
      if(error)throw new Error("The conversion completed but wallet credit could not be finalized.");
      return json({success:true,credited,reference:ref,provider_reference:raw?.transid??null,message:"Airtime converted successfully."});
    }
    throw new Error("Unsupported airtime-to-cash action.");
  }catch(error){console.error("Bilalsadasub airtime cash error",{action,user_id:user.id,error});return json({success:false,error:error instanceof Error?error.message:"Unable to complete airtime-to-cash request."},400)}
});
