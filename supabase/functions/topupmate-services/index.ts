import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

import {
  get,
  post,
  rows,
  id,
  name,
  provider,
  price,
  sell,
  ceil10,
  status,
  msg,
  pref,
  pick,
} from "../_shared/topupmate.ts";

type O = Record<string, any>;

const MARKUP = 3;

const NO = new Set([
  "airtime",
  "airtime-card",
  "recharge-card",
  "electricity",
]);

const s = (v: any) => String(v ?? "").trim();

const n = (v: any) =>
  Number.isFinite(Number(v)) ? Number(v) : 0;

const ref = () =>
  `TPM_${crypto.randomUUID().replace(/-/g, "")}`;

/*
 * User-facing errors. Only messages thrown through UserError are ever sent to
 * the browser. Everything else (provider text, SQL, network errors ...) is
 * logged on the server and replaced with a generic message.
 */
class UserError extends Error {}

const fail = (message: string): never => {
  throw new UserError(message);
};

const GENERIC_ERROR =
  "We could not complete this request right now. Please try again.";
const SERVICE_DOWN =
  "This service is temporarily unavailable. Please try again shortly.";

/** First non-empty value (unlike `??`, this skips empty strings). */
function first(...vals: any[]): string {
  for (const v of vals) {
    const x = s(v);
    if (x) return x;
  }
  return "";
}

/** Convert +234 / 234 / 10-digit input to the local 11-digit format. */
function localPhone(v: any): string {
  let x = s(v).replace(/[\s\-()]/g, "");
  if (x.startsWith("+")) x = x.slice(1);
  if (/^234\d{10}$/.test(x)) return `0${x.slice(3)}`;
  if (/^\d{10}$/.test(x)) return `0${x}`;
  return x;
}

/*
 * Validity handling. Providers describe validity in many ways ("30 days",
 * "30", "1 Month", "24hrs", "Weekly", or only inside the plan name), so the
 * bundle group is worked out on the server from every available field.
 */
type PlanGroup = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "OTHER";

function daysFromText(text: string, bareNumberIsDays = false): number {
  const x = s(text).toLowerCase();
  if (!x) return 0;

  let m = x.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (m) return Math.max(1, Math.ceil(Number(m[1]) / 24));

  m = x.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/);
  if (m) return Math.round(Number(m[1]) * 365);

  m = x.match(/(\d+(?:\.\d+)?)\s*(?:months?|mths?|mos?|mnths?)\b/);
  if (m) return Math.round(Number(m[1]) * 30);

  m = x.match(/(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/);
  if (m) return Math.round(Number(m[1]) * 7);

  m = x.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)\b/);
  if (m) return Math.round(Number(m[1]));

  if (/\b(?:daily|24\s*hours?)\b/.test(x)) return 1;
  if (/\bweekly\b/.test(x)) return 7;
  if (/\bmonthly\b/.test(x)) return 30;
  if (/\b(?:yearly|annual|annually)\b/.test(x)) return 365;
  if (/\bday\b/.test(x)) return 1;
  if (/\bweek\b/.test(x)) return 7;
  if (/\bmonth\b/.test(x)) return 30;
  if (/\byear\b/.test(x)) return 365;

  if (bareNumberIsDays && /^\d+$/.test(x)) return Number(x);
  return 0;
}

function planDays(r: any): number {
  const explicit = [
    pick(r, ["validity_days", "validitydays", "duration_days", "durationdays", "days", "day", "validity_day", "validityday"]),
    pick(r, ["validity", "validity_period", "validityperiod", "duration", "period", "plan_period", "planperiod", "plan_validity", "planvalidity", "expiry", "expires"]),
  ];

  const explicitDays = Number(explicit[0]);
  if (Number.isFinite(explicitDays) && explicitDays > 0 && explicitDays <= 1000) {
    return explicitDays;
  }

  const fromValidity = daysFromText(s(explicit[1]), true);
  if (fromValidity > 0) return fromValidity;

  const descriptive = [
    pick(r, ["name", "plan_name", "planname", "package_name", "packagename", "bundle_name", "bundlename", "bundle", "description", "title", "product_name", "productname", "label"]),
    pick(r, ["plan_type", "plantype", "type", "category"]),
  ].map(s).join(" ");

  return daysFromText(descriptive);
}

function planGroupFromDays(days: number): PlanGroup {
  // IyanjuPay data tabs:
  // Daily = 1–3 days
  // Weekly = 7–14 days
  // Monthly = 30–90 days
  // Yearly = 365 days
  // Everything else = Other.
  if (days >= 1 && days <= 3) return "DAILY";
  if (days >= 7 && days <= 14) return "WEEKLY";
  if (days >= 30 && days <= 90) return "MONTHLY";
  if (days === 365) return "YEARLY";
  return "OTHER";
}

function periodLabel(days: number): string {
  if (days <= 0) return "";
  if (days >= 360 && days <= 400) return "1 year";
  if (days === 1) return "1 day";
  if (days % 30 === 0 && days >= 30) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (days % 7 === 0 && days <= 28) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

function network(v: any) {
  const x = s(v).toLowerCase();

  return (
    {
      mtn: "1",
      "1": "1",
      "01": "1",
      airtel: "2",
      "2": "2",
      "02": "2",
      glo: "3",
      "3": "3",
      "03": "3",
      "9mobile": "4",
      "9 mobile": "4",
      "4": "4",
      "04": "4",
      etisalat: "4",
    } as Record<string, string>
  )[x] ?? x;
}

function networkName(v: any) {
  const x = s(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (x === "1" || x === "01" || x.includes("mtn")) return "mtn";
  if (x === "2" || x === "02" || x.includes("airtel")) return "airtel";
  if (x === "3" || x === "03" || x.includes("glo")) return "glo";
  if (
    x === "4" ||
    x === "04" ||
    x.includes("9mobile") ||
    x.includes("etisalat")
  ) return "9mobile";

  return "";
}

function cable(v: any) {
  const x = s(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (x === "1" || x === "gotv" || x.includes("gotv")) {
    return "1";
  }

  if (x === "2" || x === "dstv" || x.includes("dstv")) {
    return "2";
  }

  if (
    x === "3" ||
    x === "startimes" ||
    x === "startime" ||
    x.includes("startimes") ||
    x.includes("startime")
  ) {
    return "3";
  }

  return s(v);
}

function disco(v: any) {
  const x = s(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const ids: Record<string, string> = {
    "1": "1",
    ikeja: "1",
    ikejaelectric: "1",
    ikedc: "1",

    "2": "2",
    eko: "2",
    ekoelectric: "2",
    ekedc: "2",

    "3": "3",
    kano: "3",
    kanoelectric: "3",
    kedco: "3",

    "4": "4",
    portharcourt: "4",
    portharcourtelectric: "4",
    phedc: "4",

    "5": "5",
    jos: "5",
    joselectric: "5",
    jed: "5",
    jedc: "5",

    "6": "6",
    ibadan: "6",
    ibadanelectric: "6",
    ibedc: "6",

    "7": "7",
    kaduna: "7",
    kadunaelectric: "7",
    kaedco: "7",
    kedc: "7",
    knedc: "7",

    "8": "8",
    abuja: "8",
    abujaelectric: "8",
    aedc: "8",

    "9": "9",
    enugu: "9",
    enuguelectric: "9",
    eedc: "9",

    "10": "10",
    benin: "10",
    beninelectric: "10",
    bedc: "10",

    "11": "11",
    yola: "11",
    yolaelectric: "11",
    yedc: "11",
  };

  return ids[x] ?? s(v);
}

function catService(service: string, body: O = {}) {
  if (service === "airtime") return "network";
  if (service === "data") return "network";

  if (service === "cable") {
    return body.provider || body.provider_name || body.biller_code
      ? "cabletv"
      : "cable-provider";
  }

  if (service === "electricity") return "electricity";

  if (
    ["education", "jamb", "waec", "neco", "nabteb"].includes(service)
  ) {
    return "exampin";
  }

  if (["airtime-card", "recharge-card"].includes(service)) {
    return "recharge-card";
  }

  if (service === "data-card") return "datapin";
  if (["internet", "smile"].includes(service)) return "smile";
  if (service === "gift-card") return "giftcard";

  return service;
}

const MOBILE_NETWORKS = [
  { id: "1", name: "MTN" },
  { id: "2", name: "Airtel" },
  { id: "3", name: "Glo" },
  { id: "4", name: "9mobile" },
];

const PIN_SERVICE_KEYS: Record<string, string[]> = {
  "recharge-card": ["rechargepin", "recharge-pin", "recharge-card", "airtimepin", "airtime-pin"],
  "airtime-card": ["rechargepin", "recharge-pin", "recharge-card", "airtimepin", "airtime-pin"],
  "data-card": ["datapin", "data-pin", "data-card"],
};

const isPinService = (service: string) => service in PIN_SERVICE_KEYS;

/** Try each catalogue key in turn and return the first non-empty result. */
async function catalogueRows(keys: string[], extra: O = {}) {
  for (const key of keys) {
    const r = await get("/services/", { service: key, ...extra });
    if (!r.ok || String(r.body?.status).toLowerCase() === "fail") continue;

    const a = rows(r.body);
    if (a.length) return a;
  }

  return [];
}

async function getEducationProviders() {
  const r = await get("/services/", { service: "exampin" });
  if (!r.ok || String(r.body?.status).toLowerCase() === "fail") {
    throw new UserError(SERVICE_DOWN);
  }

  return rows(r.body)
    .filter((x: any) => {
      const st = s(x?.status).toLowerCase();
      return !["off", "inactive", "disabled", "unavailable"].includes(st);
    })
    .map((x: any) => {
      const code = s(x?.id ?? x?.provider_id ?? x?.provider);
      const nm = first(x?.provider, x?.name, code).toUpperCase();
      const providerPrice = price(x);
      return {
        id: code,
        code,
        biller_code: code,
        name: nm,
        display_name: nm,
        provider: nm,
        provider_name: nm,
        provider_service: nm.toLowerCase(),
        providerPrice,
        price: providerPrice,
        selling_price: sell(providerPrice, MARKUP),
        status: x?.status ?? "active",
        raw: x,
      };
    })
    .filter((x: any) => x.id && x.providerPrice > 0);
}


function publicBiller(r: any) {
  const code = String(
    r?.networkid ??
      r?.provider_id ??
      r?.id ??
      r?.provider ??
      r?.network ??
      "",
  );

  const nm = name(r) || provider(r) || code;

  return {
    id: code,
    code,
    name: nm,
    display_name: nm,
    network_name: r?.network,
    provider_name:
      r?.providerName ??
      r?.provider_name ??
      r?.provider,
    status: r?.status ?? "active",
    successPercentage: r?.successPercentage,
    discount: r?.discount,
    raw: r,
  };
}

function providerMatches(raw: any, wanted: string) {
  const w = wanted
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const vals = [
    raw?.provider,
    raw?.provider_name,
    raw?.providerName,
    raw?.network,
    raw?.network_name,
    raw?.networkName,
    raw?.networkid,
    raw?.network_id,
    raw?.networkId,
    raw?.network_code,
    raw?.networkCode,
    raw?.exam,
    raw?.exam_type,
    raw?.examType,
    raw?.service,
    raw?.service_name,
    raw?.name,
    raw?.description,
  ];

  return vals.some((v) => {
    const value = String(v ?? "").toLowerCase();
    const normalized = value.replace(/[^a-z0-9]+/g, "");

    return (
      normalized === w ||
      normalized === network(wanted) ||
      networkName(normalized) === networkName(wanted) ||
      value.includes(wanted.toLowerCase())
    );
  });
}

function dataPlanMatchesNetwork(raw: any, requestedNetwork: string) {
  const wantedId = network(requestedNetwork);
  const wantedName = networkName(wantedId);

  const values = [
    raw?.networkid,
    raw?.network_id,
    raw?.networkId,
    raw?.network_code,
    raw?.networkCode,
    raw?.network,
    raw?.network_name,
    raw?.networkName,
    raw?.provider,
    raw?.provider_name,
    raw?.providerName,
    raw?.operator,
    raw?.operator_name,
    raw?.telco,
    raw?.telco_name,
    raw?.plan_network,
    raw?.planNetwork,
  ];

  for (const value of values) {
    const rawValue = s(value);
    if (!rawValue) continue;

    if (network(rawValue) === wantedId) return true;
    if (networkName(rawValue) === wantedName) return true;
  }

  return providerMatches(raw, wantedId) ||
    (wantedName ? providerMatches(raw, wantedName) : false);
}

function providerPriceValue(r: any) {
  return price(r);
}

function getProviderPeriod(r: any) {
  const value = pick(r, [
    "validity", "validity_period", "validityperiod", "duration", "period",
    "plan_period", "planperiod",
  ]);

  return s(value).replace(/\s+/g, " ");
}

function norm(service: string, r: any) {
  const providerName =
    provider(r) ||
    r?.provider_name ||
    r?.providerName ||
    r?.network_name ||
    r?.network ||
    "";

  const itemId =
    id(r) ||
    r?.plan_id ||
    r?.planid ||
    r?.planId ||
    r?.data_plan ||
    r?.bundle ||
    r?.code ||
    "";

  const itemName =
    name(r) ||
    r?.plan_name ||
    r?.planName ||
    r?.package_name ||
    r?.packageName ||
    r?.bundle_name ||
    r?.bundleName ||
    r?.description ||
    r?.product_name ||
    itemId;

  const providerPrice = providerPriceValue(r);
  const sellingPrice = NO.has(service)
    ? providerPrice
    : sell(providerPrice, MARKUP);

  const days = planDays(r);
  const group = planGroupFromDays(days);
  const explicitPeriod = getProviderPeriod(r);
  const period =
    periodLabel(days) ||
    (/[a-z]/i.test(explicitPeriod) ? explicitPeriod : "");

  const validityDays = days > 0 ? days : "";

  /*
   * Face value used by PIN products (recharge / data PINs). It is taken from
   * an explicit field when present, otherwise from the provider price.
   */
  const faceValue = n(
    pick(r, ["denomination", "face_value", "facevalue", "value", "pin_value", "pinvalue"]) ??
      providerPrice,
  );

  const networkId =
    r?.networkid ??
    r?.network_id ??
    r?.networkId ??
    r?.network_code ??
    r?.networkCode ??
    "";

  const networkNameValue =
    r?.network ??
    r?.network_name ??
    r?.networkName ??
    providerName;

  return {
    id: String(itemId),
    code: String(itemId),
    plan_id: String(itemId),

    name: itemName,
    display_name: itemName,

    provider: providerName,
    provider_name: providerName,

    network: networkNameValue,
    network_name: networkNameValue,
    network_id: networkId,
    networkId,

    plan_type: r?.plan_type ?? r?.planType ?? r?.type ?? "",
    planType: r?.planType ?? r?.plan_type ?? r?.type ?? "",

    period,
    plan_group: group,
    plan_period: period,
    planPeriod: period,

    validity: period,
    validity_period: period,
    validityPeriod: period,

    duration: period,

    validity_days: validityDays,
    validityDays,
    duration_days: validityDays,
    durationDays: validityDays,

    denomination: faceValue,
    value: faceValue,

    providerPrice,
    provider_price: providerPrice,

    price: sellingPrice,
    selling_price: sellingPrice,
    amount: sellingPrice,

    service,
    raw: r,
  };
}

async function getDataPlans(networkId: string) {
  const candidates = [
    { service: "data", network: networkId },
    { service: "data", networkid: networkId },
    { service: "data", network_id: networkId },
    { service: "data", provider: networkId },
    { service: "data", provider_id: networkId },
  ];

  let fallback: any[] = [];

  for (const params of candidates) {
    const r = await get("/services/", params);
    if (!r.ok) continue;

    const a = rows(r.body);
    if (!a.length) continue;

    if (!fallback.length) fallback = a;

    const matching = a.filter((item: any) =>
      dataPlanMatchesNetwork(item, networkId),
    );

    if (matching.length) return matching;
  }

  return fallback.filter((item: any) =>
    dataPlanMatchesNetwork(item, networkId),
  );
}

const INTERNET_PROVIDERS = [
  { key: "smile", name: "Smile", service: "smile" },
  { key: "alpha", name: "Alpha Caller", service: "alpha" },
  { key: "kirani", name: "Kirani Caller", service: "kirani" },
  { key: "ratel", name: "Ratel", service: "ratel" },
];

const SMILE_PLANS = [
  { id: "828", name: "Smile Midi 1.5GB + 3GB Stream", price: 1250, day: 30 },
  { id: "848", name: "Smile Mini 3.5GB", price: 1500, day: 7 },
  { id: "845", name: "Smile Mini 3GB", price: 1500, day: 2 },
  { id: "829", name: "Smile Midi 2GB + 4GB Stream", price: 1500, day: 30 },
  { id: "804", name: "SmileVoice ONLY 135", price: 1850, day: 30 },
  { id: "830", name: "Smile Midi 3GB + 5GB Stream", price: 2000, day: 30 },
  { id: "846", name: "Smile Mini 5GB", price: 2200, day: 2 },
  { id: "849", name: "Smile Mini 6GB", price: 2300, day: 7 },
  { id: "831", name: "Smile Midi 6GB + 5GB Stream", price: 3000, day: 30 },
  { id: "832", name: "Smile Midi 8GB + 5GB Stream", price: 3500, day: 30 },
  { id: "808", name: "SmileVoice ONLY 175", price: 3600, day: 90 },
  { id: "833", name: "Smile Midi 10GB + 5GB Stream", price: 4000, day: 30 },
  { id: "843", name: "Smile Mini 1GB", price: 450, day: 1 },
  { id: "805", name: "SmileVoice ONLY 430", price: 5700, day: 30 },
  { id: "807", name: "SmileVoice ONLY 450", price: 7200, day: 60 },
  { id: "847", name: "Smile Mini 1GB", price: 750, day: 7 },
  { id: "844", name: "Smile Mini 2.5GB", price: 750, day: 1 },
  { id: "803", name: "SmileVoice ONLY 65", price: 900, day: 30 },
  { id: "809", name: "SmileVoice ONLY 500", price: 9000, day: 90 },
];

function internetProvider(v: any) {
  const x = s(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (x.includes("smile")) return "smile";
  if (x.includes("alpha")) return "alpha";
  if (x.includes("kirani")) return "kirani";
  if (x.includes("ratel")) return "ratel";
  return "";
}

function internetProviderName(v: any) {
  const key = internetProvider(v);
  return INTERNET_PROVIDERS.find((x) => x.key === key)?.name ?? s(v);
}

function smilePlans() {
  return SMILE_PLANS.map((x) => ({
    id: x.id,
    code: x.id,
    planid: x.id,
    name: x.name,
    display_name: x.name,
    provider: "Smile",
    provider_name: "Smile",
    internet_provider: "smile",
    providerPrice: x.price,
    provider_price: x.price,
    price: x.price,
    selling_price: sell(x.price, MARKUP),
    amount: x.price,
    day: x.day,
    validity_days: x.day,
    validity: `${x.day} day${x.day === 1 ? "" : "s"}`,
    period: `${x.day} day${x.day === 1 ? "" : "s"}`,
    plan_group: planGroupFromDays(x.day),
    raw: x,
  }));
}

async function getInternetPlans(providerKey = "") {
  const wanted = internetProvider(providerKey);
  return wanted === "smile" || !wanted ? smilePlans() : [];
}

/*
 * Gift cards (Topupmate GET /giftcard/available/, optional query params
 * countryCode and productId). Different deployments wrap the product list in
 * different envelopes (response / data / content ...), so the list is located
 * generically.
 */
const GIFT_COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
  { code: "KE", name: "Kenya" },
  { code: "AE", name: "UAE" },
];

function giftRows(body: any): any[] {
  const found = rows(body);
  return found.filter((x: any) => x && typeof x === "object");
}

function giftKey(r: any): string {
  return s(
    pick(r, ["productid", "product_id", "id"]) ??
      pick(r, ["productname", "product_name", "name"]),
  );
}

async function giftCatalog(productId?: string, countryCode?: string) {
  const base: O = productId ? { productId } : {};
  const country = s(countryCode).toUpperCase();

  const attempts: O[] = country
    ? [{ ...base, countryCode: country }]
    : [base, ...["NG", "US", "GB"].map((c) => ({ ...base, countryCode: c }))];

  const seen = new Map<string, any>();
  let reachable = false;

  for (const params of attempts) {
    const r = await get("/giftcard/available/", params);

    if (!r.ok || String(r.body?.status).toLowerCase() === "fail") {
      console.error("Topupmate gift catalogue request failed", {
        params,
        http_status: r.httpStatus,
        body: r.body,
      });
      continue;
    }

    reachable = true;

    for (const row of giftRows(r.body)) {
      const key = giftKey(row);
      if (key && !seen.has(key)) seen.set(key, row);
    }

    // A country-less request that already returned products is the full catalogue.
    if (!country && seen.size > 0 && params === base) break;
  }

  if (!reachable) throw new UserError(SERVICE_DOWN);

  return Array.from(seen.values());
}

function numList(v: any): number[] {
  return Array.isArray(v)
    ? v.map(Number).filter((x: number) => Number.isFinite(x) && x > 0)
    : [];
}

function giftProduct(r: any) {
  const productId = s(pick(r, ["productid", "product_id", "id"]));

  const nm = s(
    pick(r, ["productname", "product_name", "name"]) ?? "Gift Card",
  );

  const fixedRecipient = numList(pick(r, ["fixedrecipientdenominations"]));
  const fixedSender = numList(pick(r, ["fixedsenderdenominations"]));

  const mapRows = Array.isArray(pick(r, ["fixedrecipienttosenderdenominationsmap"]))
    ? (pick(r, ["fixedrecipienttosenderdenominationsmap"]) as any[])
    : [];

  // Map entries look like { "10": 16500 } (recipient amount -> sender price).
  const mapped: Array<{ recipient: number; sender: number }> = [];
  for (const entry of mapRows) {
    for (const [k, v] of Object.entries(entry ?? {})) {
      const recipient = Number(k);
      const sender = Number(v);
      if (recipient > 0 && sender > 0) mapped.push({ recipient, sender });
    }
  }

  const recipientDenoms = fixedRecipient.length
    ? fixedRecipient
    : mapped.map((x) => x.recipient);

  const senderFor = (recipient: number, index: number): number => {
    const viaMap = mapped.find((x) => x.recipient === recipient)?.sender;
    if (viaMap) return viaMap;
    return Number(fixedSender[index] ?? 0) || 0;
  };

  const logos = pick(r, ["logourls", "logo_urls", "logourl", "logo_url", "logo", "image"]);
  const logoUrls = Array.isArray(logos) ? logos.map(s).filter(Boolean) : logos ? [s(logos)] : [];

  const redeem = pick(r, ["redeeminstruction", "redeem_instruction"]);
  const country = pick(r, ["country"]);
  const countryCode = s(
    pick(r, ["countrycode", "country_code"]) ??
      (country && typeof country === "object" ? pick(country, ["isoname", "code"]) : country),
  ).toUpperCase();

  const denomType = s(pick(r, ["denominationtype", "denomination_type"])).toUpperCase();

  const minRecipient = n(pick(r, ["minrecipientdenomination", "min_recipient_denomination"]));
  const maxRecipient = n(pick(r, ["maxrecipientdenomination", "max_recipient_denomination"]));
  const minSender = n(pick(r, ["minsenderdenomination", "min_sender_denomination"]));
  const maxSender = n(pick(r, ["maxsenderdenomination", "max_sender_denomination"]));

  const firstPrice = recipientDenoms.length
    ? senderFor(recipientDenoms[0], 0)
    : minSender;

  return {
    id: productId,
    code: productId,
    biller_code: productId,
    name: nm,
    display_name: nm,
    provider: "Gift Card",
    provider_name: "Gift Card",
    product_id: productId,
    productId,
    countryCode,
    denominationType: denomType || (recipientDenoms.length ? "FIXED" : "RANGE"),
    recipientCurrencyCode: s(pick(r, ["recipientcurrencycode", "recipient_currency_code"])) || "USD",
    senderCurrencyCode: s(pick(r, ["sendercurrencycode", "sender_currency_code"])) || "NGN",
    fixedRecipientDenominations: recipientDenoms,
    fixedSenderDenominations: recipientDenoms.map((d, i) => senderFor(d, i)),
    minRecipientDenomination: minRecipient,
    maxRecipientDenomination: maxRecipient,
    minSenderDenomination: minSender,
    maxSenderDenomination: maxSender,
    senderFee: pick(r, ["senderfee", "sender_fee"]),
    senderFeePercentage: pick(r, ["senderfeepercentage", "sender_fee_percentage"]),
    discountPercentage: pick(r, ["discountpercentage", "discount_percentage"]),
    logoUrls,
    logo_url: logoUrls[0] ?? "",
    redeemInstruction: redeem && typeof redeem === "object"
      ? {
          concise: s(pick(redeem, ["concise"])),
          verbose: s(pick(redeem, ["verbose"])),
        }
      : { concise: s(redeem), verbose: "" },
    providerPrice: firstPrice,
    price: firstPrice,
    selling_price: firstPrice ? sell(firstPrice, MARKUP) : 0,
    status: s(pick(r, ["status"]) ?? "ACTIVE"),
  };
}

async function billers(service: string, b: O = {}) {
  if (service === "education") {
    const providers = await getEducationProviders();
    return {
      success: true,
      service,
      billers: providers,
      items: [],
      plans: [],
      packages: [],
    };
  }

  if (service === "internet" || service === "smile") {
    const providers = INTERNET_PROVIDERS.map((x) => ({
      id: x.key,
      code: x.key,
      name: x.name,
      display_name: x.name,
      provider: x.key,
      provider_name: x.name,
      biller_code: x.key,
      status: "active",
    }));

    return {
      success: true,
      service: "internet",
      billers: providers,
      items: [],
      plans: [],
      packages: [],
    };
  }

  // Recharge / data PINs are bought per mobile network.
  if (isPinService(service)) {
    return {
      success: true,
      service,
      billers: MOBILE_NETWORKS.map((x) => ({
        id: x.id,
        code: x.id,
        biller_code: x.id,
        name: x.name,
        display_name: x.name,
        network_name: x.name,
        provider_name: x.name,
        status: "active",
      })),
      items: [],
      plans: [],
      packages: [],
    };
  }

  if (service === "gift-card") {
    const country = s(b.country_code ?? b.countryCode).toUpperCase();
    const a = await giftCatalog(undefined, country || undefined);

    const products = a
      .filter(
        (x: any) =>
          s(pick(x, ["status"]) ?? "ACTIVE").toLowerCase() !== "inactive",
      )
      .map(giftProduct)
      .filter((x: any) => x.id);

    return {
      success: true,
      service,
      country_code: country || null,
      countries: GIFT_COUNTRIES,
      billers: products,
      items: [],
      plans: [],
      packages: [],
    };
  }

  const c = await get("/services/", {
    service: catService(service),
  });

  if (
    !c.ok ||
    String(c.body?.status).toLowerCase() === "fail"
  ) {
    console.error("Topupmate billers request failed", {
      service,
      http_status: c.httpStatus,
      body: c.body,
    });
    throw new UserError(SERVICE_DOWN);
  }

  const st = await get("/status/");
  const sb = st.body || {};
  let a = rows(c.body);

  if (["cable", "electricity"].includes(service)) {
    const z = service === "cable" ? sb.cable : sb.electricity;
    if (Array.isArray(z) && z.length) a = z;
  }

  a = a.filter((r: any) => {
    const x = s(r?.status).toLowerCase();
    return ![
      "inactive",
      "off",
      "disabled",
      "unavailable",
    ].includes(x);
  });

  return {
    success: true,
    service,
    billers: a.map(publicBiller),
    items: [],
    plans: [],
    packages: [],
  };
}

async function catalog(service: string, b: O) {
  if (service === "data") {
    const requestedNetwork = network(
      b.provider_name ||
        b.provider ||
        b.network_name ||
        b.network ||
        b.biller_code,
    );

    if (!requestedNetwork) {
      throw new UserError("Please select a mobile network.");
    }

    const a = await getDataPlans(requestedNetwork);

    const items = a
      .filter((r: any) =>
        dataPlanMatchesNetwork(r, requestedNetwork),
      )
      .map((r: any) => norm(service, r))
      .filter((x: any) => x.providerPrice > 0);

    return {
      success: true,
      service,
      selected_network: requestedNetwork,
      billers: [],
      items,
      plans: items,
      packages: items,
      hot_deals: [],
    };
  }

  if (service === "internet" || service === "smile") {
    const requestedProvider = internetProvider(
      b.provider_name ?? b.provider ?? b.biller_code ?? b.internet_provider,
    );

    if (requestedProvider === "smile" || !requestedProvider) {
      const items = smilePlans();
      return {
        success: true,
        service: "internet",
        selected_provider: requestedProvider || "smile",
        billers: INTERNET_PROVIDERS.map((x) => ({
          id: x.key, code: x.key, name: x.name, display_name: x.name,
          provider: x.key, provider_name: x.name, biller_code: x.key, status: "active",
        })),
        items,
        plans: items,
        packages: items,
        amount_based: false,
      };
    }

    return {
      success: true,
      service: "internet",
      selected_provider: requestedProvider,
      billers: INTERNET_PROVIDERS.map((x) => ({
        id: x.key, code: x.key, name: x.name, display_name: x.name,
        provider: x.key, provider_name: x.name, biller_code: x.key, status: "active",
      })),
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
    };
  }

  if (["education", "jamb", "waec", "neco", "nabteb"].includes(service)) {
    const wanted = first(
      b.provider_service,
      b.provider,
      b.provider_name,
      b.biller_code,
      service,
    ).toLowerCase();
    const wantedNorm = wanted.replace(/[^a-z0-9]+/g, "");
    const providers = await getEducationProviders();
    const selected = providers.find((x: any) => {
      const code = s(x.id).toLowerCase();
      const name = s(x.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
      return code === wanted || name === wantedNorm || name.includes(wantedNorm);
    });

    if (!selected) fail("The selected examination body is unavailable.");

    const catalogue = await get("/services/", { service: "exampin" });
    const raw = rows(catalogue.body);
    const selectedId = s(selected.id);
    const matching = raw.filter((x: any) =>
      s(x?.id ?? x?.provider_id ?? x?.provider) === selectedId ||
      s(x?.provider ?? x?.name).toLowerCase().replace(/[^a-z0-9]+/g, "") ===
        s(selected.name).toLowerCase().replace(/[^a-z0-9]+/g, ""),
    );
    const source = matching.length ? matching : [selected.raw];
    const items = source
      .map((r: any) => {
        const providerPrice = price(r) || selected.providerPrice;
        return {
          ...norm("education", r),
          id: selectedId,
          code: selectedId,
          plan_id: selectedId,
          provider: selected.name,
          provider_name: selected.name,
          providerPrice,
          price: providerPrice,
          selling_price: sell(providerPrice, MARKUP),
        };
      })
      .filter((x: any) => x.providerPrice > 0);

    return {
      success: true,
      service: "education",
      selected_provider: selectedId,
      billers: providers,
      items,
      plans: items,
      packages: items,
    };
  }

  if (service === "gift-card") {
    const productId = s(
      b.product_id ?? b.productId ?? b.biller_code ?? b.provider,
    );

    const country = s(b.country_code ?? b.countryCode).toUpperCase();

    const products = await giftCatalog(productId || undefined, country || undefined);

    const product =
      products.find((x: any) => giftKey(x) === productId) ?? products[0];

    if (!product) {
      throw new UserError("This gift card is not available right now.");
    }

    const gp = giftProduct(product);
    const cur = gp.recipientCurrencyCode;

    const items: any[] = [];

    const pushItem = (recipient: number, senderPrice: number) => {
      if (!(recipient > 0) || !(senderPrice > 0)) return;
      const customerPrice = sell(senderPrice, MARKUP);

      items.push({
        id: `${gp.id}:${recipient}`,
        code: `${gp.id}:${recipient}`,
        plan_id: `${gp.id}:${recipient}`,
        name: `${gp.name} ${recipient} ${cur}`,
        display_name: `${recipient} ${cur}`,
        provider: "Gift Card",
        provider_name: "Gift Card",
        providerPrice: senderPrice,
        provider_price: senderPrice,
        selling_price: customerPrice,
        price: customerPrice,
        amount: customerPrice,
        recipient_amount: recipient,
        recipient_currency: cur,
        product_id: gp.id,
        productId: gp.id,
        denomination: recipient,
      });
    };

    if (gp.fixedRecipientDenominations.length) {
      gp.fixedRecipientDenominations.forEach((d: number, i: number) =>
        pushItem(d, Number(gp.fixedSenderDenominations[i] ?? 0)),
      );
    } else {
      // Range products: offer the bounds when the provider prices them.
      pushItem(gp.minRecipientDenomination, gp.minSenderDenomination);
      if (gp.maxRecipientDenomination !== gp.minRecipientDenomination) {
        pushItem(gp.maxRecipientDenomination, gp.maxSenderDenomination);
      }
    }

    return {
      success: true,
      service: "gift-card",
      country_code: country || null,
      billers: [gp],
      product: gp,
      items,
      plans: items,
      packages: items,
    };
  }

  // Recharge / data PINs: try each known catalogue key, then match the network.
  if (isPinService(service)) {
    const requestedNetwork = network(
      b.provider_name ?? b.provider ?? b.network_name ?? b.network ?? b.biller_code,
    );

    const all = await catalogueRows(PIN_SERVICE_KEYS[service]);

    const withNetwork = all.filter((r: any) =>
      dataPlanMatchesNetwork(r, requestedNetwork),
    );

    // Some catalogues are not tagged per network; then every row applies.
    const source = withNetwork.length ? withNetwork : all;

    const seen = new Set<string>();
    const items = source
      .map((r: any) => norm(service, r))
      .filter((x: any) => {
        if (!x.id || x.providerPrice <= 0 || seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });

    return {
      success: true,
      service,
      selected_network: requestedNetwork,
      billers: [],
      items,
      plans: items,
      packages: items,
    };
  }

  const c = await get("/services/", {
    service: catService(service, b),
  });

  if (
    !c.ok ||
    String(c.body?.status).toLowerCase() === "fail"
  ) {
    console.error("Topupmate catalogue request failed", {
      service,
      http_status: c.httpStatus,
      body: c.body,
    });
    throw new UserError(SERVICE_DOWN);
  }

  const a = rows(c.body);

  if (
    service === "cable" &&
    !b.provider_name &&
    !b.biller_code
  ) {
    return {
      success: true,
      service,
      billers: a.map((r: any) => ({
        id: id(r),
        code: id(r),
        name: name(r) || provider(r),
        display_name: name(r) || provider(r),
        provider: provider(r),
        raw: r,
      })),
      items: [],
      plans: [],
      packages: [],
    };
  }

  const rawWanted = s(
    b.provider_name ||
      b.provider ||
      b.network_name ||
      b.network ||
      b.biller_code,
  );

  const wanted = rawWanted.toLowerCase();

  const wantedName =
    service === "cable"
      ? ({
          1: "gotv",
          2: "dstv",
          3: "startimes",
          gotv: "gotv",
          gotvprovider: "gotv",
          dstv: "dstv",
          dstvprovider: "dstv",
          startimes: "startimes",
          startime: "startimes",
        } as Record<string, string>)[
          wanted.replace(/[^a-z0-9]+/g, "")
        ] ?? wanted
      : wanted;

  const items = a
    .map((r) => norm(service, r))
    .filter((r: any) => {
      if (!wantedName) return true;

      const rp = s(r.provider)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

      const rawp = s(
        r.raw?.provider ??
          r.raw?.provider_name,
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

      const rn = s(r.name).toLowerCase();
      const w = wantedName.replace(/[^a-z0-9]+/g, "");

      return (
        rp === w ||
        rawp === w ||
        rn.startsWith(`${w} `) ||
        rn.includes(`${w} `) ||
        providerMatches(r.raw, wantedName)
      );
    });

  return {
    success: true,
    service,
    billers: [],
    items,
    plans: items,
    packages: items,
  };
}

async function verify(service: string, b: O) {
  if (service === "cable") {
    const p = cable(
      first(b.provider_name, b.provider, b.biller_code, b.cable_tv),
    );

    const i = first(b.iuc, b.smartcard_number, b.smartcard_no, b.customer).replace(/\s+/g, "");

    if (!p || !/^[0-9]{8,20}$/.test(i)) {
      throw new UserError("Enter a valid IUC / SmartCard number (8–20 digits).");
    }

    let r = await post("/cable/verify/", { provider: p, iucnumber: i });

    if (r.httpStatus === 404) {
      r = await post("/cable/verify", { provider: p, iucnumber: i });
    }

    if (!r.ok || status(r.body) === "fail") {
      console.error("Topupmate cable verification failed", {
        http_status: r.httpStatus,
        provider: p,
        body: r.body,
      });

      throw new UserError(
        "We could not verify this SmartCard / IUC number. Check the number and provider, then try again.",
      );
    }

    // Verification fields come back at the top level, e.g. Customer_Name.
    const d = r.body ?? {};

    const nm = first(
      pick(d, ["name", "customer_name", "customername", "subscriber_name", "subscribername"]),
      pick(d?.response, ["name", "customer_name", "customername"]),
      pick(d?.data, ["name", "customer_name", "customername"]),
      status(d) === "success" ? d?.msg : "",
    );

    if (!nm) {
      throw new UserError("We could not verify this SmartCard / IUC number.");
    }

    return {
      success: true,
      customer_name: nm,
      customerName: nm,
      message: "Customer verified successfully.",
    };
  }

  if (service === "electricity") {
    const p = disco(first(b.biller_code, b.provider, b.disco));

    const m = first(b.meter, b.meter_number, b.customer).replace(/\s+/g, "");

    const tp = first(b.meter_type, b.meterType, "prepaid").toLowerCase();

    if (!p || !m || !["prepaid", "postpaid"].includes(tp)) {
      throw new UserError("Select a provider, meter type and enter your meter number.");
    }

    const r = await post("/electricity/verify/", {
      provider: p,
      meternumber: m,
      metertype: tp,
    });

    if (!r.ok || status(r.body) === "fail") {
      console.error("Topupmate meter verification failed", {
        http_status: r.httpStatus,
        provider: p,
        body: r.body,
      });

      throw new UserError(
        "We could not verify this meter number. Check the number, provider and meter type, then try again.",
      );
    }

    const d = r.body?.response ?? r.body?.data ?? r.body;

    const nm = first(
      pick(d, ["name", "customer_name", "customername", "customer_name_on_meter"]),
      pick(r.body, ["name", "customer_name", "customername"]),
    );

    return {
      success: true,
      customer_name: nm,
      customerName: nm,
      message: "Meter verified successfully.",
    };
  }

  throw new UserError("Verification is not required for this service.");
}

async function update(
  a: any,
  u: string,
  r: string,
  x: O,
) {
  const { error } = await a
    .from("transactions")
    .update(x)
    .eq("user_id", u)
    .eq("reference_number", r);

  if (error) {
    console.error(
      "Topupmate transaction update failed",
      error,
    );
  }
}

async function refund(
  a: any,
  u: string,
  amt: number,
  r: string,
  m: O,
) {
  return a.rpc("refund_wallet", {
    _user_id: u,
    _amount: amt,
    _description: "Topupmate service reversal",
    _idempotency_key: `REFUND_${r}`,
    _reference: `REFUND_${r}`,
    _metadata: m,
  });
}

/**
 * Phone number sent to the provider for services that need a contact number
 * (cable, electricity). Uses an explicit phone when the client sent one,
 * otherwise the customer's profile phone. Never the meter / smartcard number.
 */
async function contactPhone(a: any, u: any, d: O): Promise<string> {
  const explicit = localPhone(
    first(d.contact_phone, d.contactPhone, d.phone, d.phoneNumber, d.mobile_number),
  );

  if (/^0\d{10}$/.test(explicit)) return explicit;

  try {
    const { data } = await a
      .from("profiles")
      .select("phone_number")
      .eq("id", u.id)
      .maybeSingle();

    const fromProfile = localPhone(data?.phone_number);
    return /^0\d{10}$/.test(fromProfile) ? fromProfile : "";
  } catch {
    return "";
  }
}

async function purchase(
  a: any,
  u: any,
  b: O,
) {
  const service = s(
    b.service ?? b.type,
  ).toLowerCase();

  const d = b.details ?? b;
  const r =
    s(
      b.idempotency_key ??
        b.idempotencyKey,
    ) || ref();

  const item = d.item ?? {};

  const isMobileService = ["airtime", "data"].includes(service);

  // Mobile numbers are always normalised to the local 11-digit format
  // (the app may send +234XXXXXXXXXX). Other services keep their identifier.
  const customer = isMobileService
    ? localPhone(
        first(d.phone, d.mobile_number, d.phoneNumber, d.customer, d.account_id),
      )
    : first(d.customer, d.phone, d.mobile_number, d.phoneNumber, d.account_id);

  let pAmt = 0;
  let sAmt = 0;
  let path = "";
  let body: O = {};

  if (service === "airtime") {
    const net = network(
      first(d.network_code, d.networkId, d.biller_code, d.network),
    );

    pAmt = n(d.amount ?? b.amount);

    if (!net) fail("Please select a mobile network.");
    if (!/^[0-9]{11}$/.test(customer)) {
      fail("Enter a valid 11-digit Nigerian phone number.");
    }
    if (pAmt < 50) fail("The minimum airtime amount is ₦50.");

    path = "/airtime/";
    body = {
      network: net,
      phone: customer,
      amount: pAmt,
      airtime_type: "VTU",
      ref: r,
    };
    sAmt = pAmt;
  } else if (service === "data") {
    const net = network(
      first(d.network_code, d.networkId, d.biller_code, d.network),
    );

    const plan = first(d.item_code, d.plan_code, item.id, item.code);

    if (!net) fail("Please select a mobile network.");
    if (!/^[0-9]{11}$/.test(customer)) {
      fail("Enter a valid 11-digit Nigerian phone number.");
    }
    if (!plan) fail("Please select a data plan.");

    path = "/data/";
    body = {
      network: net,
      phone: customer,
      plan,
      ref: r,
    };

    // Provider prices are always resolved server-side; a price sent by the
    // client is never trusted.
    pAmt = 0;

    if (!pAmt) {
      const c = await get("/services/", {
        service: "data",
        network: net,
      });

      const f = rows(c.body).find(
        (x: any) => id(x) === plan,
      );

      pAmt = price(f);
    }

    if (!pAmt) fail("The selected data plan is unavailable.");

    sAmt = sell(pAmt, MARKUP);
  } else if (service === "cable") {
    const pr = cable(
      first(
        d.provider_name,
        d.providerName,
        d.biller_code,
        d.cable_tv,
        item.provider_name,
        item.provider,
        item.raw?.provider,
      ),
    );

    // DStv / GOtv use 10 digits, Startimes 11; verification already accepts 8-20.
    const i = first(
      d.smartcard_number,
      d.smartcardNumber,
      d.smartCardNumber,
      d.smartcard_no,
      d.iuc,
      d.customer,
    ).replace(/\s+/g, "");

    const plan = first(d.item_code, d.plan_code, item.id, item.code);

    if (!pr) fail("Please select a cable provider.");
    if (!/^[0-9]{8,20}$/.test(i)) fail("Enter a valid SmartCard / IUC number.");
    if (!plan) fail("Please select a package.");

    path = "/cabletv/";
    body = {
      provider: pr,
      iucnumber: i,
      plan,
      ref: r,
      subtype: first(d.subtype) || "renew",
      phone: (await contactPhone(a, u, d)) || undefined,
    };

    // Provider prices are always resolved server-side; a price sent by the
    // client is never trusted.
    pAmt = 0;

    if (!pAmt) {
      const c = await get("/services/", {
        service: "cabletv",
      });

      pAmt = price(
        rows(c.body).find(
          (x: any) => id(x) === plan,
        ),
      );
    }

    if (!pAmt) fail("The selected cable package is unavailable.");

    sAmt = sell(pAmt, MARKUP);
  } else if (service === "electricity") {
    const pr = disco(first(d.biller_code, d.provider, d.disco));

    const m = first(d.meter_number, d.meterNumber, d.meter, d.customer).replace(/\s+/g, "");

    const tp = first(d.meter_type, d.meterType, "prepaid").toLowerCase();

    pAmt = n(d.provider_amount ?? d.amount ?? b.amount);

    if (!pr) fail("Please select an electricity provider.");
    if (!m) fail("Enter a valid meter number.");
    if (!["prepaid", "postpaid"].includes(tp)) fail("Please select a meter type.");
    if (pAmt <= 0) fail("Enter a valid amount.");

    path = "/electricity/";
    body = {
      provider: pr,
      meternumber: m,
      amount: pAmt,
      metertype: tp,
      phone: (await contactPhone(a, u, d)) || undefined,
      ref: r,
    };
    sAmt = pAmt;
  } else if (
    ["education", "jamb", "waec", "neco", "nabteb"].includes(service)
  ) {
    const providerId = first(
      d.biller_code,
      d.billerCode,
      item.provider_id,
      item.providerId,
      item.id,
      item.code,
    );
    if (!providerId) fail("Please select an examination body.");

    const q = Math.max(1, Math.floor(n(d.quantity ?? 1)));
    path = "/exampin/";
    body = { provider: providerId, quantity: q, ref: r };

    const c = await get("/services/", { service: "exampin" });
    const found = rows(c.body).find((x: any) =>
      s(x?.id ?? x?.provider_id ?? x?.provider) === providerId,
    );
    pAmt = price(found) || n(item.providerPrice ?? item.provider_price ?? item.price);
    if (!pAmt) fail("The selected education PIN is unavailable.");
    sAmt = sell(pAmt, MARKUP) * q;
  } else if (isPinService(service) && service !== "data-card") {
    const net = network(
      first(d.network_code, d.networkId, d.biller_code, d.network),
    );

    const plan = first(d.item_code, item.id, item.code);

    const q = Math.max(1, Math.floor(n(d.quantity ?? 1)));

    if (!net) fail("Please select a mobile network.");
    if (!plan) fail("Please select the PIN value.");

    path = "/rechargepin/";
    body = {
      network: net,
      quantity: q,
      plan,
      businessname: first(d.businessname) || "IyanjuPay",
      ref: r,
    };

    const catalogue = await catalogueRows(PIN_SERVICE_KEYS[service]);
    pAmt = price(catalogue.find((x: any) => id(x) === plan));

    if (!pAmt) fail("The selected recharge PIN is unavailable.");

    sAmt = pAmt * q;
  } else if (service === "data-card") {
    const net = network(
      first(d.network_code, d.networkId, d.biller_code, d.network),
    );

    const plan = first(d.item_code, item.id, item.code);

    const q = Math.max(1, Math.floor(n(d.quantity ?? 1)));

    if (!net) fail("Please select a mobile network.");
    if (!plan) fail("Please select a data PIN plan.");

    path = "/datapin/";
    body = {
      network: net,
      quantity: q,
      data_plan: plan,
      businessname: first(d.businessname) || "IyanjuPay",
      ref: r,
    };

    const catalogue = await catalogueRows(PIN_SERVICE_KEYS[service]);
    pAmt = price(catalogue.find((x: any) => id(x) === plan));

    if (!pAmt) fail("The selected data PIN is unavailable.");

    sAmt = sell(pAmt, MARKUP) * q;
  } else if (service === "gift-card") {
    const productId = first(
      d.product_id,
      d.productId,
      item.product_id,
      item.productId,
      d.biller_code,
    );

    const recipientEmail = first(
      d.email,
      d.recipient_email,
      d.account_number,
      d.customer,
    );

    const amount = n(
      d.recipient_amount ??
        item.recipient_amount ??
        item.denomination ??
        d.amount,
    );

    const sender = first(d.sender) || "IyanjuPay Customer";

    const units = Math.max(
      1,
      Math.floor(n(d.units ?? d.quantity ?? 1)),
    );

    if (!productId) fail("Please select a gift card.");
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      fail("Enter a valid email address for delivery.");
    }
    if (amount <= 0) fail("Please select a gift card amount.");

    path = "/giftcard/";
    body = {
      // Topupmate documents product as a string Product ID.
      product: productId,
      amount,
      email: recipientEmail,
      sender,
      units,
      ref: r,
    };

    const products = await giftCatalog(
      productId,
      first(d.country_code, d.countryCode) || undefined,
    );

    const found = products.find((x: any) => giftKey(x) === productId);
    const gp = found ? giftProduct(found) : null;

    const idx = gp
      ? gp.fixedRecipientDenominations.findIndex((x: number) => x === amount)
      : -1;

    pAmt = gp
      ? idx >= 0
        ? Number(gp.fixedSenderDenominations[idx] ?? 0)
        : amount === gp.minRecipientDenomination
          ? gp.minSenderDenomination
          : amount === gp.maxRecipientDenomination
            ? gp.maxSenderDenomination
            : 0
      : 0;

    if (!pAmt) fail("The selected gift card amount is unavailable.");

    sAmt = sell(pAmt, MARKUP) * units;
  } else if (
    service === "internet" ||
    service === "smile"
  ) {
    const providerKey = internetProvider(
      first(
        d.provider_name,
        d.provider,
        d.biller_code,
        d.internet_provider,
        item.provider_name,
        item.provider,
      ),
    ) || "smile";

    const acct = first(
      d.account_number,
      d.accountNumber,
      d.account_id,
      d.phoneNumber,
      d.phone,
      d.customer,
    );
    if (!acct) fail(`Enter your ${internetProviderName(providerKey)} account or phone number.`);

    if (providerKey === "smile") {
      const compact = acct.replace(/[\s+()-]/g, "");
      let smileIdentifier = compact;
      let actype = first(d.account_type, d.accountType).trim();

      if (/^234\d{10}$/.test(compact)) {
        smileIdentifier = compact;
        actype = "PhoneNumber";
      } else if (/^0\d{10}$/.test(compact)) {
        smileIdentifier = `234${compact.slice(1)}`;
        actype = "PhoneNumber";
      } else if (/^\d{10}$/.test(compact)) {
        smileIdentifier = compact;
        actype = "AccountNumber";
      }

      if (!actype || !["PhoneNumber", "AccountNumber"].includes(actype)) {
        fail("Enter a valid Smile phone number or 10-digit account number.");
      }

      const plan = first(d.item_code, d.plan_code, item.id, item.code);
      if (!plan) fail("Please select a Smile bundle.");
      const selectedPlan = smilePlans().find((x: any) => s(x.id) === plan);
      if (!selectedPlan) fail("The selected Smile bundle is unavailable.");

      path = "/smile-data/";
      body = {
        PhoneNumber: smileIdentifier,
        BundleTypeCode: Number(plan),
        actype,
        ref: r,
      };
      pAmt = selectedPlan.providerPrice;
      sAmt = sell(pAmt, MARKUP);
    } else {
      const amount = n(d.provider_amount ?? d.providerAmount ?? d.amount ?? b.amount);
      if (amount <= 0) fail("Enter a valid amount.");
      path = providerKey === "alpha" ? "/alphatopup/" : providerKey === "kirani" ? "/kirani/" : "/ratel/";
      body = { phone: acct, amount, ref: r };
      pAmt = amount;
      sAmt = sell(pAmt, MARKUP);
    }

  } else {
    fail("This service is not available right now.");
  }

  const meta = {
    provider: "topupmate",
    provider_path: path,
    provider_amount: pAmt,
    selling_amount: sAmt,
    service,
    request_id: r,
    customer: customer || null,
    provider_catalog_id:
      s(item.id ?? d.item_code) || null,
  };

  const debit = await a.rpc("debit_wallet", {
    _user_id: u.id,
    _amount: sAmt,
    _description: `${service} purchase`,
    _idempotency_key: r,
    _reference: r,
    _category: "bill_payment",
    _metadata: meta,
  });

  if (debit.error) {
    console.error("Topupmate wallet debit failed", {
      user_id: u.id,
      service,
      error: debit.error,
    });

    const debitMessage = s(debit.error?.message).toLowerCase();

    throw new UserError(
      /insufficient|balance|funds/.test(debitMessage)
        ? "Insufficient wallet balance. Please fund your wallet and try again."
        : /limit/.test(debitMessage)
          ? "This payment is above your transaction limit."
          : /pin|lock|disabled|suspend|restrict/.test(debitMessage)
            ? "Payments are currently unavailable on your account."
            : "We could not take the payment from your wallet. Please try again.",
    );
  }

  const tx = debit.data?.id ?? null;

  await update(a, u.id, r, {
    status: "pending",
    provider: "topupmate",
    provider_reference: r,
    transaction_type: service,
    metadata: meta,
  });

  let pr;

  try {
    const q = await post(path, body);
    pr = q.body;

    if (!q.ok || status(pr) === "fail") {
      console.error("Topupmate purchase rejected", {
        service,
        path,
        http_status: q.httpStatus,
        provider_response: pr,
        request: { ...body, ref: r },
      });

      const rr = await refund(
        a,
        u.id,
        sAmt,
        r,
        {
          ...meta,
          provider_response: pr,
        },
      );

      await update(a, u.id, r, {
        status: "failed",
        provider: "topupmate",
        provider_reference: pref(pr) ?? r,
        metadata: {
          ...meta,
          provider_response: pr,
          refunded: !rr.error,
        },
      });

      const providerMessage = msg(pr);
      throw new UserError(
        rr.error
          ? `Purchase failed: ${providerMessage}. Please contact support if your wallet was debited.`
          : `Purchase failed: ${providerMessage}. Your wallet has been refunded.`,
      );
    }
  } catch (e) {
    if (e instanceof UserError) {
      throw e;
    }

    console.error("Topupmate transport error", { service, path, error: e });

    await update(a, u.id, r, {
      status: "pending",
      provider: "topupmate",
      provider_reference: r,
      metadata: {
        ...meta,
        reconciliation_required: true,
        pending_reason:
          "provider_transport_failure",
      },
    });

    return {
      success: true,
      status: "pending",
      reference: r,
      transaction_reference: r,
      transaction_id: tx,
      message:
        "Your payment is being verified. Please wait while we confirm the provider result.",
    };
  }

  const st = status(pr);
  const pRef = pref(pr) ?? r;

  if (st === "fail") {
    console.error("Topupmate purchase failed", {
      service,
      path,
      provider_response: pr,
      request: { ...body, ref: r },
    });

    const rr = await refund(
      a,
      u.id,
      sAmt,
      r,
      {
        ...meta,
        provider_response: pr,
      },
    );

    await update(a, u.id, r, {
      status: "failed",
      provider: "topupmate",
      provider_reference: pRef,
      metadata: {
        ...meta,
        provider_response: pr,
        refunded: !rr.error,
      },
    });

    throw new UserError(
      rr.error
        ? "Purchase failed. Please contact support if your wallet was debited."
        : "Purchase failed. Your wallet has been refunded.",
    );
  }

  if (st === "processing") {
    await update(a, u.id, r, {
      status: "pending",
      provider: "topupmate",
      provider_reference: pRef,
      metadata: {
        ...meta,
        provider_response: pr,
        reconciliation_required: true,
        pending_reason: "provider_processing",
      },
    });

    return {
      success: true,
      status: "pending",
      reference: r,
      transaction_reference: r,
      transaction_id: tx,
      provider_reference: pRef,
      message: "Your payment is being processed.",
    };
  }

  await update(a, u.id, r, {
    status: "success",
    provider: "topupmate",
    provider_reference: pRef,
    metadata: {
      ...meta,
      provider_response: pr,
    },
  });

  let fulfillment: any = null;

  // Topupmate requires a separate GET /giftcard/redeem/ call to retrieve
  // the voucher/code after a successful gift-card purchase.
  if (service === "gift-card") {
    try {
      const voucher = await get("/giftcard/redeem/", { ref: r });
      if (voucher.ok && status(voucher.body) !== "fail") {
        fulfillment =
          voucher.body?.response ??
          voucher.body?.data ??
          voucher.body ??
          null;
      } else {
        console.error("Topupmate gift-card redemption lookup failed", {
          reference: r,
          http_status: voucher.httpStatus,
          body: voucher.body,
        });
      }
    } catch (voucherError) {
      console.error("Topupmate gift-card redemption lookup error", {
        reference: r,
        error: voucherError,
      });
    }
  }

  return {
    success: true,
    status: "success",
    reference: r,
    transaction_reference: r,
    transaction_id: tx,
    provider_reference: pRef,
    provider_data:
      pr?.response ??
      pr?.data ??
      null,
    fulfillment,
    message: "Purchase completed successfully.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  const u = await getUser(req);

  if (!u) {
    return json(
      {
        success: false,
        error: "Authentication required.",
      },
      401,
    );
  }

  const a = adminClient();
  let b: O = {};

  try {
    b = await req.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid request body.",
      },
      400,
    );
  }

  const ac = s(b.action).toLowerCase();

  try {
    if (ac === "billers") {
      return json(
        await billers(
          s(b.service).toLowerCase(),
          b,
        ),
      );
    }

    if (ac === "catalog" || ac === "get_catalog") {
      return json(
        await catalog(
          s(b.service).toLowerCase(),
          b,
        ),
      );
    }

    if (ac === "verify_customer" || ac === "verify") {
      return json(
        await verify(
          s(b.service).toLowerCase(),
          b,
        ),
      );
    }

    if (ac === "purchase") {
      return json(
        await purchase(a, u, b),
      );
    }

    if (
      ac === "transaction_status" ||
      ac === "status"
    ) {
      const r = s(
        b.reference ??
          b.transaction_reference ??
          b.transref,
      );

      if (!r) {
        throw new UserError("Transaction reference is required.");
      }

      const q = await get(
        "/transaction/status/",
        { reference: r },
      );

      if (!q.ok) {
        console.error("Topupmate request failed", { http_status: q.httpStatus, body: q.body });
        throw new UserError(SERVICE_DOWN);
      }

      return json({
        success: true,
        status: status(q.body),
        reference: r,
        transaction: q.body,
      });
    }

    if (ac === "wallet") {
      const q = await get("/user/");

      if (!q.ok) {
        console.error("Topupmate request failed", { http_status: q.httpStatus, body: q.body });
        throw new UserError(SERVICE_DOWN);
      }

      return json({
        success: true,
        wallet: q.body,
      });
    }

    if (ac === "notifications") {
      const q = await get("/notification/");

      if (!q.ok) {
        console.error("Topupmate request failed", { http_status: q.httpStatus, body: q.body });
        throw new UserError(SERVICE_DOWN);
      }

      return json({
        success: true,
        notifications:
          q.body?.notifications ?? [],
      });
    }

    if (ac === "transactions") {
      const q = await get(
        "/transaction/",
        b.params ?? {},
      );

      if (!q.ok) {
        console.error("Topupmate request failed", { http_status: q.httpStatus, body: q.body });
        throw new UserError(SERVICE_DOWN);
      }

      return json({
        success: true,
        ...q.body,
      });
    }

    throw new UserError("Unsupported service request.");
  } catch (e: any) {
    console.error("Topupmate service error", {
      action: ac,
      service: b.service,
      user_id: u.id,
      error: e,
    });

    // Only deliberately written messages reach the browser. Provider text,
    // database errors and exceptions are replaced with a generic message.
    return json(
      {
        success: false,
        error: e instanceof UserError ? e.message : GENERIC_ERROR,
      },
      400,
    );
  }
});
