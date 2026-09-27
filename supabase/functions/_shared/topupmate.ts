const LIVE='https://connect.topupmate.com/api/';
const SANDBOX='https://connect.topupmate.com/sandbox/';
export type TM={ok:boolean;httpStatus:number;body:any};
export function base(){const x=(Deno.env.get('TOPUPMATE_BASE_URL')||'').trim();if(x)return x.endsWith('/')?x:x+'/';return (Deno.env.get('TOPUPMATE_ENV')||'live').toLowerCase()==='sandbox'?SANDBOX:LIVE;}
function key(){const x=(Deno.env.get('TOPUPMATE_API_KEY')||'').trim();if(!x)throw new Error('Topupmate is not configured.');return x;}
export async function tm(path:string,init:RequestInit={}):Promise<TM>{const h=new Headers(init.headers);h.set('Authorization',`Token ${key()}`);h.set('Accept','application/json');if(init.body)h.set('Content-Type','application/json');const r=await fetch(`${base()}${path.replace(/^\//,'')}`,{...init,headers:h});const t=await r.text();let b:any;try{b=t?JSON.parse(t):null}catch{b={status:r.ok?'success':'fail',msg:t}}return{ok:r.ok,httpStatus:r.status,body:b};}
export async function get(path:string,p?:Record<string,any>){const q=new URLSearchParams();for(const[k,v]of Object.entries(p||{}))if(v!==undefined&&v!==null&&String(v)!=='')q.set(k,String(v));return tm(path+(q.size?'?'+q.toString():''),{method:'GET'});}
export async function post(path:string,b:Record<string,any>){return tm(path,{method:'POST',body:JSON.stringify(b)});}
export function status(b:any){const s=String(b?.status??b?.data?.status??'').toLowerCase();if(['success','successful','completed','complete','succeeded'].includes(s))return'success';if(['processing','pending','queued','initiated','in_progress','in-progress'].includes(s))return'processing';return'fail';}
export function msg(b:any){return String(b?.msg??b?.message??b?.error??b?.data?.msg??b?.data?.message??b?.data?.error??'Topupmate request failed.').trim();}
export function pref(b:any){const x=b?.transref??b?.transaction_reference??b?.reference??b?.ref??b?.data?.transref??b?.data?.reference;return String(x??'').trim()||null;}
export function rows(b:any){if(Array.isArray(b))return b;for(const x of [b?.response,b?.plans,b?.packages,b?.services,b?.data,b?.results])if(Array.isArray(x))return x;return[];}
export function id(x:any){return String(x?.id??x?.plan_id??x?.planId??x?.service_id??x?.serviceId??x?.code??x?.product_id??x?.productId??'').trim();}
export function name(x:any){return String(x?.name??x?.plan_name??x?.planName??x?.package_name??x?.packageName??x?.description??x?.title??x?.label??x?.network??x?.providerName??x?.provider_name??'').trim();}
export function provider(x:any){return String(x?.provider??x?.provider_name??x?.providerName??x?.network??x?.network_name??x?.networkName??'').trim();}
export function price(x:any){const n=Number(x?.price??x?.amount??x?.charge_amount??x?.selling_price??x?.cost??x?.value??x?.denomination);return Number.isFinite(n)?n:0;}
export function ceil10(n:number){return Math.ceil(Math.max(0,n)/10)*10;}
export function sell(n:number,markup=3){return n>0?ceil10(n*(1+markup/100)):0;}
