import {
  asArray,
  asObject,
  firstValue,
  normalizeStatus,
  numberValue,
  providerLooksFailed,
  providerLooksSuccessful,
  providerMessage,
  providerReference,
  text,
  zoedataGet,
  zoedataPost,
} from "../_shared/peyflex.ts";

import { adminClient, corsHeaders, getUser, json } from "../_shared/auth.ts";

/**
 * IyanjuPay — ZOEDATA service gateway.
 *
 * IMPORTANT:
 * - The Supabase Edge Function remains named `peyflex-services` so the
 *   existing frontend route does not need to change.
 * - No Peyflex or VTUGATE API calls remain in this file.
 * - Provider credentials remain server-side.
 * - Customer-facing responses never expose the provider name.
 *
 * Required secrets:
 *   ZOEDATA_BASE_URL
 *   ZOEDATA_API_TOKEN (or ZOEDATA_API_KEY)
 *
 * Catalogue options:
 *   The 268-row Plan ID catalogue is embedded directly in this function.
 *   No catalogue secret, remote catalogue URL, or provider catalogue call is
 *   required. The supplied Plan ID, default price, and percentage are the
 *   authoritative values used for customer catalogue and server-side pricing.
 *
 * Pricing:
 *   selling = provider price + the supplied catalogue percentage markup,
 *   then rounded UP to the next ₦50.
 *
 * For variable Airtime/Electricity amounts, the amount entered by the user
 * is treated as the provider amount. The customer selling amount is calculated
 * server-side with the same markup + ₦50 rule.
 */

type Service = "airtime" | "data" | "cable" | "electricity" | "education" | "internet";

const SUPPORTED = new Set<Service>([
  "airtime",
  "data",
  "cable",
  "electricity",
  "education",
  "internet",
]);

const DATA_HOT_TYPES = new Set([
  "sme",
  "awoof",
  "gifting",
  "sme2",
  "gift",
]);

const CALLBACK_ACTIONS = new Set([
  "callback",
  "webhook",
  "zoedata_callback",
]);

function roundUp50(amount: number, percentage = 0): number {
  const base = Math.max(0, Number(amount) || 0);
  const rate = Math.max(0, Number(percentage) || 0) / 100;
  const withMarkup = base * (1 + rate);
  if (withMarkup <= 0) return 0;
  return Math.ceil((withMarkup - 1e-9) / 50) * 50;
}

function clean(value: unknown): string {
  return text(value).trim();
}

function bodyObject(body: any): Record<string, any> {
  return asObject(body);
}

function pickBody(body: any, ...keys: string[]): unknown {
  const obj = bodyObject(body);
  const details = asObject(obj.details);

  for (const key of keys) {
    const direct = obj[key];
    if (
      direct !== undefined &&
      direct !== null &&
      clean(direct) !== ""
    ) {
      return direct;
    }

    const nested = details[key];
    if (
      nested !== undefined &&
      nested !== null &&
      clean(nested) !== ""
    ) {
      return nested;
    }
  }

  return undefined;
}

function serviceOf(value: unknown): Service | null {
  const v = clean(value).toLowerCase();

  if (v === "airtime") return "airtime";
  if (v === "data") return "data";
  if (["cable", "cabletv", "cable-tv", "tv"].includes(v)) return "cable";
  if (v === "electricity") return "electricity";
  if (["education", "waec", "neco", "nabteb", "jamb", "exam", "examination"].includes(v)) return "education";
  if (["internet", "internetservice", "internet-service", "broadband", "broadbandservice", "isp"].includes(v)) return "internet";

  return null;
}

function normalizePhone(value: unknown): string {
  const raw = clean(value).replace(/[\s()\-]/g, "");

  if (/^\+234\d{10}$/.test(raw)) return raw.slice(1);
  if (/^234\d{10}$/.test(raw)) return raw;
  if (/^0\d{10}$/.test(raw)) return `234${raw.slice(1)}`;

  return raw;
}

function validPhone(value: string): boolean {
  return /^234\d{10}$/.test(value);
}

function canonicalNetwork(value: unknown): string {
  const raw = clean(value);
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (key.includes("mtn")) return "MTN";
  if (key.includes("glo")) return "GLO";
  if (key.includes("airtel")) return "Airtel";
  if (key.includes("9mobile") || key.includes("etisalat") || key === "9") {
    return "9mobile";
  }

  return raw;
}

function logoForNetwork(name: string): string | null {
  const key = name.toLowerCase();
  if (key.includes("mtn")) return "https://www.google.com/s2/favicons?domain=mtn.ng&sz=128";
  if (key.includes("glo")) return "https://www.google.com/s2/favicons?domain=gloworld.com&sz=128";
  if (key.includes("airtel")) return "https://www.google.com/s2/favicons?domain=airtel.com.ng&sz=128";
  if (key.includes("9mobile") || key.includes("etisalat")) {
    return "https://www.google.com/s2/favicons?domain=9mobile.com.ng&sz=128";
  }
  return null;
}

function parseValidity(value: unknown, name = ""): number {
  const numeric = numberValue(value);
  if (numeric > 0 && numeric <= 5000) return numeric;

  const label = `${clean(value)} ${name}`;

  const day = label.match(/(\d+(?:\.\d+)?)\s*days?/i);
  if (day) return Number(day[1]);

  const week = label.match(/(\d+(?:\.\d+)?)\s*weeks?/i);
  if (week) return Number(week[1]) * 7;

  const month = label.match(/(\d+(?:\.\d+)?)\s*months?/i);
  if (month) return Number(month[1]) * 30;

  return 0;
}

function dataCategory(raw: any): "HOT" | "EXTRA_NIGHT" | "DAILY" | "WEEKLY" | "MONTHLY" {
  const type = clean(firstValue(
    raw.data_type,
    raw.dataType,
    raw.plan_type,
    raw.planType,
    raw.category,
    raw.type,
  )).toLowerCase();

  const label = [
    raw.name,
    raw.plan_name,
    raw.planName,
    raw.description,
    raw.validity,
    raw.period,
    raw.plan_period,
    raw.planPeriod,
  ].map(clean).join(" ").toLowerCase();

  if (DATA_HOT_TYPES.has(type) || /\b(sme|awoof|gifting|gift)\b/i.test(label)) {
    return "HOT";
  }

  if (/extra\s*night|night\s*(plan|data)|midnight/i.test(label)) {
    return "EXTRA_NIGHT";
  }

  const days = parseValidity(
    firstValue(
      raw.validity_days,
      raw.validityDays,
      raw.duration_days,
      raw.durationDays,
      raw.duration,
      raw.validity,
      raw.period,
    ),
    label,
  );

  if (days >= 28) return "MONTHLY";
  if (days >= 7) return "WEEKLY";
  return "DAILY";
}

function markupFromRaw(
  service: Service,
  raw: any,
): number {
  const explicit = numberValue(firstValue(
    raw.markup_percent,
    raw.markupPercentage,
    raw.percentage,
    raw.markup,
  ));

  if (
    raw.markup_percent !== undefined ||
    raw.markupPercentage !== undefined ||
    raw.percentage !== undefined ||
    raw.markup !== undefined
  ) {
    return Math.max(0, explicit);
  }

  const name = `${clean(raw.network)} ${clean(raw.network_name)} ${clean(raw.provider)} ${clean(raw.name)} ${clean(raw.plan_name)} ${clean(raw.product_name)}`.toLowerCase();

  if (service === "airtime") {
    if (name.includes("mtn")) return 3.5;
    if (name.includes("glo")) return 7;
    if (name.includes("airtel")) return 3;
    if (name.includes("9mobile") || name.includes("etisalat")) return 3;
    return 0;
  }

  if (service === "data") {
    if (name.includes("glo")) return 10;
    if (name.includes("airtel")) return 6;
    if (name.includes("gifting") || name.includes("gift")) return 3;
    return 0;
  }

  if (service === "cable") return 1;

  if (service === "electricity" && name.includes("phed")) return 0.5;

  return 0;
}

function itemCode(raw: any): string {
  return clean(firstValue(
    raw.product_code,
    raw.productCode,
    raw.PRODUCT_CODE,
    raw.plan_code,
    raw.planCode,
    raw.variation_code,
    raw.variationCode,
    raw.code,
    raw.Code,
    raw.plan_id,
    raw.planId,
    raw.id,
    raw.ID,
  ));
}

function itemName(raw: any, fallback = "Service option"): string {
  return clean(firstValue(
    raw.display_name,
    raw.displayName,
    raw.product_name,
    raw.productName,
    raw.PRODUCT_NAME,
    raw.plan_name,
    raw.planName,
    raw.name,
    raw.Name,
    raw.title,
    raw.description,
    fallback,
  ));
}

function providerPrice(raw: any): number {
  return numberValue(firstValue(
    raw.provider_price,
    raw.providerPrice,
    raw.provider_amount,
    raw.providerAmount,
    raw.cost,
    raw.default_price,
    raw.defaultPrice,
    raw.PRODUCT_AMOUNT,
    raw.product_amount,
    raw.productAmount,
    raw.price,
    raw.Price,
    raw.amount,
    raw.Amount,
  ));
}

function networkValue(raw: any): string {
  return canonicalNetwork(firstValue(
    raw.network,
    raw.network_name,
    raw.networkName,
    raw.mobile_network,
    raw.mobileNetwork,
    raw.MOBILENETWORK,
    raw.provider,
  ));
}

function normalizeCatalogEntry(raw: any, forcedService?: Service): any | null {
  const service = serviceOf(firstValue(
    forcedService,
    raw.service,
    raw.service_type,
    raw.serviceType,
    raw.category_service,
  ));

  if (!service || !SUPPORTED.has(service)) return null;

  const code = itemCode(raw);
  if (!code) return null;

  const name = itemName(raw, code);
  const provider = providerPrice(raw);
  const percentage = markupFromRaw(service, raw);
  const network = networkValue(raw);
  const validityDays = parseValidity(
    firstValue(
      raw.validity_days,
      raw.validityDays,
      raw.duration_days,
      raw.durationDays,
      raw.duration,
      raw.validity,
      raw.period,
    ),
    name,
  );

  return {
    service,
    product_code: code,
    code,
    id: clean(firstValue(raw.id, raw.ID, raw.plan_id, raw.planId, code)),
    name,
    display_name: name,
    provider_price: provider,
    price: provider,
    providerPrice: provider,
    provider_amount: provider,
    markup_percent: percentage,
    percentage,
    selling_price: provider > 0 ? roundUp50(provider, percentage) : 0,
    network,
    network_code: clean(firstValue(raw.network_code, raw.networkCode)) || network.toLowerCase(),
    data_type: clean(firstValue(raw.data_type, raw.dataType, raw.plan_type, raw.planType, raw.type, raw.category)) || null,
    dataCategory: service === "data" ? dataCategory(raw) : null,
    validity_days: validityDays,
    validityDays,
    period: clean(firstValue(raw.period, raw.validity_period, raw.plan_period, raw.planPeriod)) || null,
    quantity: numberValue(raw.quantity) || 1,
    raw,
  };
}

function normalizeCatalogPayload(payload: any): any[] {
  const root = asObject(payload);
  const candidates: any[] = [];

  const pushArray = (value: unknown) => {
    if (Array.isArray(value)) candidates.push(...value);
  };

  pushArray(root.catalog);
  pushArray(root.catalogue);
  pushArray(root.products);
  pushArray(root.plans);
  pushArray(root.items);
  pushArray(root.services);
  pushArray(root.data);
  pushArray(root.results);

  for (const service of ["airtime", "data", "cable", "electricity", "education", "internet"]) {
    pushArray(root[service]);
    pushArray(asObject(root.catalog)[service]);
    pushArray(asObject(root.catalogue)[service]);
    pushArray(asObject(root.data)[service]);
  }

  const output: any[] = [];
  const seen = new Set<string>();

  const visit = (value: any, forcedService?: Service) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, forcedService);
      return;
    }

    if (!value || typeof value !== "object") return;

    const normalized = normalizeCatalogEntry(value, forcedService);
    if (normalized) {
      const key = `${normalized.service}:${normalized.product_code}`;
      if (!seen.has(key)) {
        seen.add(key);
        output.push(normalized);
      }
    }

    for (const service of ["airtime", "data", "cable", "electricity", "education", "internet"] as Service[]) {
      if (value[service]) visit(value[service], service);
    }

    for (const childKey of ["plans", "items", "products", "variations", "packages", "available_plans"]) {
      if (value[childKey]) visit(value[childKey], forcedService);
    }
  };

  for (const item of candidates) visit(item);

  return output;
}

const EMBEDDED_CATALOG: any[] = [
  {"service":"airtime","product_code":"6","code":"6","id":"6","name":"MTN Custom","display_name":"MTN Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":3.5,"percentage":3.5,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"6","name":"MTN Custom","PRODUCT_AMOUNT":0,"percentage":3.5,"network":"MTN"}},
  {"service":"airtime","product_code":"84","code":"84","id":"84","name":"Glo Custom","display_name":"Glo Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":7,"percentage":7,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"84","name":"Glo Custom","PRODUCT_AMOUNT":0,"percentage":7,"network":"GLO"}},
  {"service":"airtime","product_code":"85","code":"85","id":"85","name":"Airtel Custom","display_name":"Airtel Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":3,"percentage":3,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"85","name":"Airtel Custom","PRODUCT_AMOUNT":0,"percentage":3,"network":"Airtel"}},
  {"service":"airtime","product_code":"86","code":"86","id":"86","name":"etisalat Custom","display_name":"etisalat Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":3,"percentage":3,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"86","name":"etisalat Custom","PRODUCT_AMOUNT":0,"percentage":3,"network":"9mobile"}},
  {"service":"data","product_code":"424","code":"424","id":"424","name":"GLO 29.5GB/30Days","display_name":"GLO 29.5GB/30Days","provider_price":7200,"price":7200,"providerPrice":7200,"provider_amount":7200,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"424","name":"GLO 29.5GB/30Days","PRODUCT_AMOUNT":7200,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"428","code":"428","id":"428","name":"GLO 1.05GB/14Days","display_name":"GLO 1.05GB/14Days","provider_price":450,"price":450,"providerPrice":450,"provider_amount":450,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"428","name":"GLO 1.05GB/14Days","PRODUCT_AMOUNT":450,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"481","code":"481","id":"481","name":"GLO 1024GB/365Days","display_name":"GLO 1024GB/365Days","provider_price":135000,"price":135000,"providerPrice":135000,"provider_amount":135000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"481","name":"GLO 1024GB/365Days","PRODUCT_AMOUNT":135000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"948","code":"948","id":"948","name":"Glo 750MB/1DAY","display_name":"Glo 750MB/1DAY","provider_price":180,"price":180,"providerPrice":180,"provider_amount":180,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"948","name":"Glo 750MB/1DAY","PRODUCT_AMOUNT":180,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"949","code":"949","id":"949","name":"Glo 1.5GB/1DAY","display_name":"Glo 1.5GB/1DAY","provider_price":270,"price":270,"providerPrice":270,"provider_amount":270,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"949","name":"Glo 1.5GB/1DAY","PRODUCT_AMOUNT":270,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"952","code":"952","id":"952","name":"GLO 10GB/7days","display_name":"GLO 10GB/7days","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"952","name":"GLO 10GB/7days","PRODUCT_AMOUNT":1800,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"966","code":"966","id":"966","name":"Glo 875MB Sunday Daily","display_name":"Glo 875MB Sunday Daily","provider_price":180,"price":180,"providerPrice":180,"provider_amount":180,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"966","name":"Glo 875MB Sunday Daily","PRODUCT_AMOUNT":180,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"967","code":"967","id":"967","name":"Glo 1GB Special Daily","display_name":"Glo 1GB Special Daily","provider_price":315,"price":315,"providerPrice":315,"provider_amount":315,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"967","name":"Glo 1GB Special Daily","PRODUCT_AMOUNT":315,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"970","code":"970","id":"970","name":"GLO 500MB + 1GB* Night/7DAYS","display_name":"GLO 500MB + 1GB* Night/7DAYS","provider_price":450,"price":450,"providerPrice":450,"provider_amount":450,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"970","name":"GLO 500MB + 1GB* Night/7DAYS","PRODUCT_AMOUNT":450,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"971","code":"971","id":"971","name":"GLO 1.1GB/14 days","display_name":"GLO 1.1GB/14 days","provider_price":675,"price":675,"providerPrice":675,"provider_amount":675,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"971","name":"GLO 1.1GB/14 days","PRODUCT_AMOUNT":675,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"972","code":"972","id":"972","name":"GLO 6GB 2.5GB Night/7DAYS","display_name":"GLO 6GB 2.5GB Night/7DAYS","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"972","name":"GLO 6GB 2.5GB Night/7DAYS","PRODUCT_AMOUNT":1800,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"974","code":"974","id":"974","name":"GLO 1.1GB+1.5GB Night/30 DAYS","display_name":"GLO 1.1GB+1.5GB Night/30 DAYS","provider_price":900,"price":900,"providerPrice":900,"provider_amount":900,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"974","name":"GLO 1.1GB+1.5GB Night/30 DAYS","PRODUCT_AMOUNT":900,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"975","code":"975","id":"975","name":"GLO 3.9GB+2GB Night/7DAYS","display_name":"GLO 3.9GB+2GB Night/7DAYS","provider_price":1350,"price":1350,"providerPrice":1350,"provider_amount":1350,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"975","name":"GLO 3.9GB+2GB Night/7DAYS","PRODUCT_AMOUNT":1350,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"976","code":"976","id":"976","name":"GLO 2GB+3GB Night/30DAYS","display_name":"GLO 2GB+3GB Night/30DAYS","provider_price":1350,"price":1350,"providerPrice":1350,"provider_amount":1350,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"976","name":"GLO 2GB+3GB Night/30DAYS","PRODUCT_AMOUNT":1350,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"979","code":"979","id":"979","name":"G LO 3.15GB + 3GB Night/30DAYS","display_name":"G LO 3.15GB + 3GB Night/30DAYS","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":10,"percentage":10,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"979","name":"G LO 3.15GB + 3GB Night/30DAYS","PRODUCT_AMOUNT":1800,"percentage":10}},
  {"service":"data","product_code":"980","code":"980","id":"980","name":"GLO 4.25GB+3GB Night/30DAYS","display_name":"GLO 4.25GB+3GB Night/30DAYS","provider_price":2250,"price":2250,"providerPrice":2250,"provider_amount":2250,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"980","name":"GLO 4.25GB+3GB Night/30DAYS","PRODUCT_AMOUNT":2250,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"981","code":"981","id":"981","name":"GLO 8GB+2GB Night/30DAYS","display_name":"GLO 8GB+2GB Night/30DAYS","provider_price":2700,"price":2700,"providerPrice":2700,"provider_amount":2700,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"981","name":"GLO 8GB+2GB Night/30DAYS","PRODUCT_AMOUNT":2700,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"983","code":"983","id":"983","name":"GLO 10.5GB+2GB Night/30DAYS","display_name":"GLO 10.5GB+2GB Night/30DAYS","provider_price":3600,"price":3600,"providerPrice":3600,"provider_amount":3600,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"983","name":"GLO 10.5GB+2GB Night/30DAYS","PRODUCT_AMOUNT":3600,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"984","code":"984","id":"984","name":"GLO 13.5GB+2.5GB Night/30DAYS","display_name":"GLO 13.5GB+2.5GB Night/30DAYS","provider_price":4500,"price":4500,"providerPrice":4500,"provider_amount":4500,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"984","name":"GLO 13.5GB+2.5GB Night/30DAYS","PRODUCT_AMOUNT":4500,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"986","code":"986","id":"986","name":"GLO 18.5GB+2GB Night/30DAYS","display_name":"GLO 18.5GB+2GB Night/30DAYS","provider_price":5400,"price":5400,"providerPrice":5400,"provider_amount":5400,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"986","name":"GLO 18.5GB+2GB Night/30DAYS","PRODUCT_AMOUNT":5400,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"988","code":"988","id":"988","name":"GLO 26GB+2GB Night/30DAYS","display_name":"GLO 26GB+2GB Night/30DAYS","provider_price":7200,"price":7200,"providerPrice":7200,"provider_amount":7200,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"988","name":"GLO 26GB+2GB Night/30DAYS","PRODUCT_AMOUNT":7200,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"989","code":"989","id":"989","name":"GLO 36GB+2GB Night/30DAYS","display_name":"GLO 36GB+2GB Night/30DAYS","provider_price":9000,"price":9000,"providerPrice":9000,"provider_amount":9000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"989","name":"GLO 36GB+2GB Night/30DAYS","PRODUCT_AMOUNT":9000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"990","code":"990","id":"990","name":"GLO 62GB+2GB Night/30DAYS","display_name":"GLO 62GB+2GB Night/30DAYS","provider_price":13500,"price":13500,"providerPrice":13500,"provider_amount":13500,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"990","name":"GLO 62GB+2GB Night/30DAYS","PRODUCT_AMOUNT":13500,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"991","code":"991","id":"991","name":"GLO 105GB+2GB Night/30DAYS","display_name":"GLO 105GB+2GB Night/30DAYS","provider_price":18000,"price":18000,"providerPrice":18000,"provider_amount":18000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"991","name":"GLO 105GB+2GB Night/30DAYS","PRODUCT_AMOUNT":18000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"992","code":"992","id":"992","name":"GLO 135GB GLOMEGA/30DAYS","display_name":"GLO 135GB GLOMEGA/30DAYS","provider_price":22500,"price":22500,"providerPrice":22500,"provider_amount":22500,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"992","name":"GLO 135GB GLOMEGA/30DAYS","PRODUCT_AMOUNT":22500,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"993","code":"993","id":"993","name":"GLO 165GB GLOMEGA/30DAYS","display_name":"GLO 165GB GLOMEGA/30DAYS","provider_price":27000,"price":27000,"providerPrice":27000,"provider_amount":27000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"993","name":"GLO 165GB GLOMEGA/30DAYS","PRODUCT_AMOUNT":27000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"994","code":"994","id":"994","name":"GLO 220GB GLOMEGA/30DAYS","display_name":"GLO 220GB GLOMEGA/30DAYS","provider_price":32400,"price":32400,"providerPrice":32400,"provider_amount":32400,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"994","name":"GLO 220GB GLOMEGA/30DAYS","PRODUCT_AMOUNT":32400,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"995","code":"995","id":"995","name":"GLO 310GB GLOMEGA/60DAYS","display_name":"GLO 310GB GLOMEGA/60DAYS","provider_price":45000,"price":45000,"providerPrice":45000,"provider_amount":45000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"995","name":"GLO 310GB GLOMEGA/60DAYS","PRODUCT_AMOUNT":45000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"996","code":"996","id":"996","name":"GLO 380GB GLOMEGA/90DAYS","display_name":"GLO 380GB GLOMEGA/90DAYS","provider_price":54000,"price":54000,"providerPrice":54000,"provider_amount":54000,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"996","name":"GLO 380GB GLOMEGA/90DAYS","PRODUCT_AMOUNT":54000,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"997","code":"997","id":"997","name":"GLO 475GB GLOMEGA/90DAYS","display_name":"GLO 475GB GLOMEGA/90DAYS","provider_price":67500,"price":67500,"providerPrice":67500,"provider_amount":67500,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"997","name":"GLO 475GB GLOMEGA/90DAYS","PRODUCT_AMOUNT":67500,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"998","code":"998","id":"998","name":"Glo 2.5GB/2DAYS","display_name":"Glo 2.5GB/2DAYS","provider_price":450,"price":450,"providerPrice":450,"provider_amount":450,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"998","name":"Glo 2.5GB/2DAYS","PRODUCT_AMOUNT":450,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"1126","code":"1126","id":"1126","name":"GLO 9GB+2.5GB 7days","display_name":"GLO 9GB+2.5GB 7days","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":10,"percentage":10,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1126","name":"GLO 9GB+2.5GB 7days","PRODUCT_AMOUNT":1800,"percentage":10,"network":"GLO"}},
  {"service":"data","product_code":"396","code":"396","id":"396","name":"Airtel 6GB/30days","display_name":"Airtel 6GB/30days","provider_price":2350,"price":2350,"providerPrice":2350,"provider_amount":2350,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"396","name":"Airtel 6GB/30days","PRODUCT_AMOUNT":2350,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"406","code":"406","id":"406","name":"Airtel 1GB/7days","display_name":"Airtel 1GB/7days","provider_price":752,"price":752,"providerPrice":752,"provider_amount":752,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"406","name":"Airtel 1GB/7days","PRODUCT_AMOUNT":752,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"409","code":"409","id":"409","name":"Airtel 2GB/30days","display_name":"Airtel 2GB/30days","provider_price":1410,"price":1410,"providerPrice":1410,"provider_amount":1410,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"409","name":"Airtel 2GB/30days","PRODUCT_AMOUNT":1410,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"410","code":"410","id":"410","name":"Airtel 3GB/30days","display_name":"Airtel 3GB/30days","provider_price":1880,"price":1880,"providerPrice":1880,"provider_amount":1880,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"410","name":"Airtel 3GB/30days","PRODUCT_AMOUNT":1880,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"521","code":"521","id":"521","name":"Airtel 10GB/30DAYS","display_name":"Airtel 10GB/30DAYS","provider_price":3760,"price":3760,"providerPrice":3760,"provider_amount":3760,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"521","name":"Airtel 10GB/30DAYS","PRODUCT_AMOUNT":3760,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"783","code":"783","id":"783","name":"Airtel 400GB/90DAYS","display_name":"Airtel 400GB/90DAYS","provider_price":47000,"price":47000,"providerPrice":47000,"provider_amount":47000,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"783","name":"Airtel 400GB/90DAYS","PRODUCT_AMOUNT":47000,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"788","code":"788","id":"788","name":"AIRTEL UNLIMITED 40/30DAYS","display_name":"AIRTEL UNLIMITED 40/30DAYS","provider_price":32900,"price":32900,"providerPrice":32900,"provider_amount":32900,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"788","name":"AIRTEL UNLIMITED 40/30DAYS","PRODUCT_AMOUNT":32900,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"893","code":"893","id":"893","name":"Airtel 2GB/2DAYS","display_name":"Airtel 2GB/2DAYS","provider_price":705,"price":705,"providerPrice":705,"provider_amount":705,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"893","name":"Airtel 2GB/2DAYS","PRODUCT_AMOUNT":705,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"894","code":"894","id":"894","name":"Airtel 3GB/2DAYS","display_name":"Airtel 3GB/2DAYS","provider_price":940,"price":940,"providerPrice":940,"provider_amount":940,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"894","name":"Airtel 3GB/2DAYS","PRODUCT_AMOUNT":940,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"895","code":"895","id":"895","name":"Airtel 1.5GB/7DAYS","display_name":"Airtel 1.5GB/7DAYS","provider_price":940,"price":940,"providerPrice":940,"provider_amount":940,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"895","name":"Airtel 1.5GB/7DAYS","PRODUCT_AMOUNT":940,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"896","code":"896","id":"896","name":"Airtel 10GB/7DAYS","display_name":"Airtel 10GB/7DAYS","provider_price":2820,"price":2820,"providerPrice":2820,"provider_amount":2820,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"896","name":"Airtel 10GB/7DAYS","PRODUCT_AMOUNT":2820,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"897","code":"897","id":"897","name":"Airtel 18GB/7DAYS","display_name":"Airtel 18GB/7DAYS","provider_price":4700,"price":4700,"providerPrice":4700,"provider_amount":4700,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"897","name":"Airtel 18GB/7DAYS","PRODUCT_AMOUNT":4700,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"898","code":"898","id":"898","name":"Airtel 5GB/2DAYS","display_name":"Airtel 5GB/2DAYS","provider_price":1377.1,"price":1377.1,"providerPrice":1377.1,"provider_amount":1377.1,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"898","name":"Airtel 5GB/2DAYS","PRODUCT_AMOUNT":1377.1,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"901","code":"901","id":"901","name":"Airtel 4GB/30DAYS","display_name":"Airtel 4GB/30DAYS","provider_price":2350,"price":2350,"providerPrice":2350,"provider_amount":2350,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"901","name":"Airtel 4GB/30DAYS","PRODUCT_AMOUNT":2350,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"902","code":"902","id":"902","name":"Airtel 8GB/30DAYS","display_name":"Airtel 8GB/30DAYS","provider_price":2820,"price":2820,"providerPrice":2820,"provider_amount":2820,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"902","name":"Airtel 8GB/30DAYS","PRODUCT_AMOUNT":2820,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"903","code":"903","id":"903","name":"Airtel 13GB/30DAYS","display_name":"Airtel 13GB/30DAYS","provider_price":4700,"price":4700,"providerPrice":4700,"provider_amount":4700,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"903","name":"Airtel 13GB/30DAYS","PRODUCT_AMOUNT":4700,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"904","code":"904","id":"904","name":"Airtel 18GB/30DAYS","display_name":"Airtel 18GB/30DAYS","provider_price":5640,"price":5640,"providerPrice":5640,"provider_amount":5640,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"904","name":"Airtel 18GB/30DAYS","PRODUCT_AMOUNT":5640,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"905","code":"905","id":"905","name":"Airtel 25GB/30DAYS","display_name":"Airtel 25GB/30DAYS","provider_price":7520,"price":7520,"providerPrice":7520,"provider_amount":7520,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"905","name":"Airtel 25GB/30DAYS","PRODUCT_AMOUNT":7520,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"906","code":"906","id":"906","name":"Airtel 35GB/30DAYS","display_name":"Airtel 35GB/30DAYS","provider_price":9400,"price":9400,"providerPrice":9400,"provider_amount":9400,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"906","name":"Airtel 35GB/30DAYS","PRODUCT_AMOUNT":9400,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"909","code":"909","id":"909","name":"Airtel 60GB/30DAYS","display_name":"Airtel 60GB/30DAYS","provider_price":14100,"price":14100,"providerPrice":14100,"provider_amount":14100,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"909","name":"Airtel 60GB/30DAYS","PRODUCT_AMOUNT":14100,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"910","code":"910","id":"910","name":"Airtel 160GB/30DAYS","display_name":"Airtel 160GB/30DAYS","provider_price":28200,"price":28200,"providerPrice":28200,"provider_amount":28200,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"910","name":"Airtel 160GB/30DAYS","PRODUCT_AMOUNT":28200,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"911","code":"911","id":"911","name":"Airtel 210GB/30DAYS","display_name":"Airtel 210GB/30DAYS","provider_price":37600,"price":37600,"providerPrice":37600,"provider_amount":37600,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"911","name":"Airtel 210GB/30DAYS","PRODUCT_AMOUNT":37600,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"912","code":"912","id":"912","name":"Airtel 300GB/90DAYS","display_name":"Airtel 300GB/90DAYS","provider_price":47000,"price":47000,"providerPrice":47000,"provider_amount":47000,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"912","name":"Airtel 300GB/90DAYS","PRODUCT_AMOUNT":47000,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"913","code":"913","id":"913","name":"Airtel 350GB/120DAYS","display_name":"Airtel 350GB/120DAYS","provider_price":56400,"price":56400,"providerPrice":56400,"provider_amount":56400,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"913","name":"Airtel 350GB/120DAYS","PRODUCT_AMOUNT":56400,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"914","code":"914","id":"914","name":"Airtel 650GB/365DAYS","display_name":"Airtel 650GB/365DAYS","provider_price":94000,"price":94000,"providerPrice":94000,"provider_amount":94000,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"914","name":"Airtel 650GB/365DAYS","PRODUCT_AMOUNT":94000,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"935","code":"935","id":"935","name":"Airtel 100GB/30DAYS","display_name":"Airtel 100GB/30DAYS","provider_price":18800,"price":18800,"providerPrice":18800,"provider_amount":18800,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"935","name":"Airtel 100GB/30DAYS","PRODUCT_AMOUNT":18800,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"1066","code":"1066","id":"1066","name":"Airtel 5GB/7DAYS","display_name":"Airtel 5GB/7DAYS","provider_price":1410,"price":1410,"providerPrice":1410,"provider_amount":1410,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1066","name":"Airtel 5GB/7DAYS","PRODUCT_AMOUNT":1410,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"1084","code":"1084","id":"1084","name":"Airtel 5GB+ Weekly Plan","display_name":"Airtel 5GB+ Weekly Plan","provider_price":1410,"price":1410,"providerPrice":1410,"provider_amount":1410,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1084","name":"Airtel 5GB+ Weekly Plan","PRODUCT_AMOUNT":1410,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"1085","code":"1085","id":"1085","name":"Airtel 13GB (MiFi) Monthly Plan","display_name":"Airtel 13GB (MiFi) Monthly Plan","provider_price":4700,"price":4700,"providerPrice":4700,"provider_amount":4700,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1085","name":"Airtel 13GB (MiFi) Monthly Plan","PRODUCT_AMOUNT":4700,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"1086","code":"1086","id":"1086","name":"Airtel 35GB (MiFi) Monthly Plan","display_name":"Airtel 35GB (MiFi) Monthly Plan","provider_price":9400,"price":9400,"providerPrice":9400,"provider_amount":9400,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1086","name":"Airtel 35GB (MiFi) Monthly Plan","PRODUCT_AMOUNT":9400,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"1087","code":"1087","id":"1087","name":"Airtel 60GB (MiFi) Monthly Plan","display_name":"Airtel 60GB (MiFi) Monthly Plan","provider_price":14100,"price":14100,"providerPrice":14100,"provider_amount":14100,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1087","name":"Airtel 60GB (MiFi) Monthly Plan","PRODUCT_AMOUNT":14100,"percentage":6,"network":"Airtel"}},
  {"service":"internet","product_code":"1096","code":"1096","id":"1096","name":"Unlimited 50 90 Days - Data - 50.0 Mbps (90 Days)","display_name":"Unlimited 50 90 Days - Data - 50.0 Mbps (90 Days)","provider_price":63450,"price":63450,"providerPrice":63450,"provider_amount":63450,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1096","name":"Unlimited 50 90 Days - Data - 50.0 Mbps (90 Days)","PRODUCT_AMOUNT":63450,"percentage":6}},
  {"service":"data","product_code":"1108","code":"1108","id":"1108","name":"Airtel 500mb 7days","display_name":"Airtel 500mb 7days","provider_price":470,"price":470,"providerPrice":470,"provider_amount":470,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1108","name":"Airtel 500mb 7days","PRODUCT_AMOUNT":470,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"7","code":"7","id":"7","name":"MTN SME 1GB","display_name":"MTN SME 1GB","provider_price":475,"price":475,"providerPrice":475,"provider_amount":475,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"7","name":"MTN SME 1GB","PRODUCT_AMOUNT":475,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"8","code":"8","id":"8","name":"MTN SME 2GB","display_name":"MTN SME 2GB","provider_price":750,"price":750,"providerPrice":750,"provider_amount":750,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"8","name":"MTN SME 2GB","PRODUCT_AMOUNT":750,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"9","code":"9","id":"9","name":"MTN SME 5GB","display_name":"MTN SME 5GB","provider_price":1370,"price":1370,"providerPrice":1370,"provider_amount":1370,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"9","name":"MTN SME 5GB","PRODUCT_AMOUNT":1370,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"279","code":"279","id":"279","name":"MTN SME 500MB","display_name":"MTN SME 500MB","provider_price":270,"price":270,"providerPrice":270,"provider_amount":270,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"279","name":"MTN SME 500MB","PRODUCT_AMOUNT":270,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"496","code":"496","id":"496","name":"MTN SME 3GB","display_name":"MTN SME 3GB","provider_price":1050,"price":1050,"providerPrice":1050,"provider_amount":1050,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"496","name":"MTN SME 3GB","PRODUCT_AMOUNT":1050,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"509","code":"509","id":"509","name":"MTN SME 10GB","display_name":"MTN SME 10GB","provider_price":2740,"price":2740,"providerPrice":2740,"provider_amount":2740,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"509","name":"MTN SME 10GB","PRODUCT_AMOUNT":2740,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1114","code":"1114","id":"1114","name":"MTN SME 15GB","display_name":"MTN SME 15GB","provider_price":4110,"price":4110,"providerPrice":4110,"provider_amount":4110,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1114","name":"MTN SME 15GB","PRODUCT_AMOUNT":4110,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1117","code":"1117","id":"1117","name":"MTN SME 20GB","display_name":"MTN SME 20GB","provider_price":5480,"price":5480,"providerPrice":5480,"provider_amount":5480,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1117","name":"MTN SME 20GB","PRODUCT_AMOUNT":5480,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1120","code":"1120","id":"1120","name":"MTN SME 7GB","display_name":"MTN SME 7GB","provider_price":2100,"price":2100,"providerPrice":2100,"provider_amount":2100,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1120","name":"MTN SME 7GB","PRODUCT_AMOUNT":2100,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"686","code":"686","id":"686","name":"Glo CG 200MB 14Days","display_name":"Glo CG 200MB 14Days","provider_price":100,"price":100,"providerPrice":100,"provider_amount":100,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"686","name":"Glo CG 200MB 14Days","PRODUCT_AMOUNT":100,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"687","code":"687","id":"687","name":"Glo CG 500MB 14days","display_name":"Glo CG 500MB 14days","provider_price":198.5,"price":198.5,"providerPrice":198.5,"provider_amount":198.5,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"687","name":"Glo CG 500MB 14days","PRODUCT_AMOUNT":198.5,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"688","code":"688","id":"688","name":"Glo CG 500MB 30days","display_name":"Glo CG 500MB 30days","provider_price":198.5,"price":198.5,"providerPrice":198.5,"provider_amount":198.5,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"688","name":"Glo CG 500MB 30days","PRODUCT_AMOUNT":198.5,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"689","code":"689","id":"689","name":"Glo CG 1GB 30days","display_name":"Glo CG 1GB 30days","provider_price":397,"price":397,"providerPrice":397,"provider_amount":397,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"689","name":"Glo CG 1GB 30days","PRODUCT_AMOUNT":397,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"690","code":"690","id":"690","name":"Glo CG 2GB 30days","display_name":"Glo CG 2GB 30days","provider_price":794,"price":794,"providerPrice":794,"provider_amount":794,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"690","name":"Glo CG 2GB 30days","PRODUCT_AMOUNT":794,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"691","code":"691","id":"691","name":"Glo CG 3GB 30days","display_name":"Glo CG 3GB 30days","provider_price":1191,"price":1191,"providerPrice":1191,"provider_amount":1191,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"691","name":"Glo CG 3GB 30days","PRODUCT_AMOUNT":1191,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"692","code":"692","id":"692","name":"Glo CG 5GB 30days","display_name":"Glo CG 5GB 30days","provider_price":1985,"price":1985,"providerPrice":1985,"provider_amount":1985,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"692","name":"Glo CG 5GB 30days","PRODUCT_AMOUNT":1985,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"693","code":"693","id":"693","name":"Glo CG 10GB 30days","display_name":"Glo CG 10GB 30days","provider_price":3970,"price":3970,"providerPrice":3970,"provider_amount":3970,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"693","name":"Glo CG 10GB 30days","PRODUCT_AMOUNT":3970,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"694","code":"694","id":"694","name":"etisalat SME 1GB","display_name":"etisalat SME 1GB","provider_price":500,"price":500,"providerPrice":500,"provider_amount":500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"694","name":"etisalat SME 1GB","PRODUCT_AMOUNT":500,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"695","code":"695","id":"695","name":"etisalat SME 1.5GB","display_name":"etisalat SME 1.5GB","provider_price":750,"price":750,"providerPrice":750,"provider_amount":750,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"695","name":"etisalat SME 1.5GB","PRODUCT_AMOUNT":750,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"696","code":"696","id":"696","name":"etisalat SME 2GB","display_name":"etisalat SME 2GB","provider_price":1000,"price":1000,"providerPrice":1000,"provider_amount":1000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"696","name":"etisalat SME 2GB","PRODUCT_AMOUNT":1000,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"698","code":"698","id":"698","name":"etisalat SME 3GB","display_name":"etisalat SME 3GB","provider_price":1500,"price":1500,"providerPrice":1500,"provider_amount":1500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"698","name":"etisalat SME 3GB","PRODUCT_AMOUNT":1500,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"700","code":"700","id":"700","name":"etisalat SME 5GB","display_name":"etisalat SME 5GB","provider_price":2500,"price":2500,"providerPrice":2500,"provider_amount":2500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"700","name":"etisalat SME 5GB","PRODUCT_AMOUNT":2500,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"702","code":"702","id":"702","name":"etisalat SME 10GB","display_name":"etisalat SME 10GB","provider_price":5000,"price":5000,"providerPrice":5000,"provider_amount":5000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"702","name":"etisalat SME 10GB","PRODUCT_AMOUNT":5000,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"703","code":"703","id":"703","name":"etisalat SME 15GB","display_name":"etisalat SME 15GB","provider_price":7500,"price":7500,"providerPrice":7500,"provider_amount":7500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"703","name":"etisalat SME 15GB","PRODUCT_AMOUNT":7500,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"704","code":"704","id":"704","name":"etisalat SME 20GB","display_name":"etisalat SME 20GB","provider_price":10000,"price":10000,"providerPrice":10000,"provider_amount":10000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"704","name":"etisalat SME 20GB","PRODUCT_AMOUNT":10000,"percentage":0,"network":"9mobile"}},
  {"service":"data","product_code":"774","code":"774","id":"774","name":"etisalat SME 500MB","display_name":"etisalat SME 500MB","provider_price":250,"price":250,"providerPrice":250,"provider_amount":250,"markup_percent":0,"percentage":0,"selling_price":0,"network":"9mobile","network_code":"9mobile","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"774","name":"etisalat SME 500MB","PRODUCT_AMOUNT":250,"percentage":0,"network":"9mobile"}},
  {"service":"cable","product_code":"52","code":"52","id":"52","name":"GOTv Max","display_name":"GOTv Max","provider_price":8415,"price":8415,"providerPrice":8415,"provider_amount":8415,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"52","name":"GOTv Max","PRODUCT_AMOUNT":8415,"percentage":1}},
  {"service":"cable","product_code":"53","code":"53","id":"53","name":"GOTv Smallie Monthly","display_name":"GOTv Smallie Monthly","provider_price":1881,"price":1881,"providerPrice":1881,"provider_amount":1881,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"53","name":"GOTv Smallie Monthly","PRODUCT_AMOUNT":1881,"percentage":1}},
  {"service":"cable","product_code":"347","code":"347","id":"347","name":"GOTV Custom","display_name":"GOTV Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"347","name":"GOTV Custom","PRODUCT_AMOUNT":0,"percentage":1}},
  {"service":"cable","product_code":"469","code":"469","id":"469","name":"GOTV Jinja","display_name":"GOTV Jinja","provider_price":3861,"price":3861,"providerPrice":3861,"provider_amount":3861,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"469","name":"GOTV Jinja","PRODUCT_AMOUNT":3861,"percentage":1}},
  {"service":"cable","product_code":"470","code":"470","id":"470","name":"GOTV Jolli","display_name":"GOTV Jolli","provider_price":5742,"price":5742,"providerPrice":5742,"provider_amount":5742,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"470","name":"GOTV Jolli","PRODUCT_AMOUNT":5742,"percentage":1}},
  {"service":"cable","product_code":"474","code":"474","id":"474","name":"GOTv Smallie Quaterly","display_name":"GOTv Smallie Quaterly","provider_price":4133.25,"price":4133.25,"providerPrice":4133.25,"provider_amount":4133.25,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"474","name":"GOTv Smallie Quaterly","PRODUCT_AMOUNT":4133.25,"percentage":1}},
  {"service":"cable","product_code":"475","code":"475","id":"475","name":"GOTv Smallie Yearly","display_name":"GOTv Smallie Yearly","provider_price":12177,"price":12177,"providerPrice":12177,"provider_amount":12177,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"475","name":"GOTv Smallie Yearly","PRODUCT_AMOUNT":12177,"percentage":1}},
  {"service":"cable","product_code":"532","code":"532","id":"532","name":"Gotv Supa","display_name":"Gotv Supa","provider_price":11286,"price":11286,"providerPrice":11286,"provider_amount":11286,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"532","name":"Gotv Supa","PRODUCT_AMOUNT":11286,"percentage":1}},
  {"service":"cable","product_code":"775","code":"775","id":"775","name":"GOTV SUPA PLUS","display_name":"GOTV SUPA PLUS","provider_price":16632,"price":16632,"providerPrice":16632,"provider_amount":16632,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"775","name":"GOTV SUPA PLUS","PRODUCT_AMOUNT":16632,"percentage":1}},
  {"service":"cable","product_code":"47","code":"47","id":"47","name":"DSTv Compact","display_name":"DSTv Compact","provider_price":18810,"price":18810,"providerPrice":18810,"provider_amount":18810,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"47","name":"DSTv Compact","PRODUCT_AMOUNT":18810,"percentage":1}},
  {"service":"cable","product_code":"48","code":"48","id":"48","name":"DSTv Compact Plus","display_name":"DSTv Compact Plus","provider_price":29700,"price":29700,"providerPrice":29700,"provider_amount":29700,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"48","name":"DSTv Compact Plus","PRODUCT_AMOUNT":29700,"percentage":1}},
  {"service":"cable","product_code":"49","code":"49","id":"49","name":"DSTv Premium","display_name":"DSTv Premium","provider_price":44055,"price":44055,"providerPrice":44055,"provider_amount":44055,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"49","name":"DSTv Premium","PRODUCT_AMOUNT":44055,"percentage":1}},
  {"service":"cable","product_code":"50","code":"50","id":"50","name":"DSTv Premium + HD/Extra View","display_name":"DSTv Premium + HD/Extra View","provider_price":41580,"price":41580,"providerPrice":41580,"provider_amount":41580,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"50","name":"DSTv Premium + HD/Extra View","PRODUCT_AMOUNT":41580,"percentage":1}},
  {"service":"cable","product_code":"348","code":"348","id":"348","name":"DSTV Custom","display_name":"DSTV Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"348","name":"DSTV Custom","PRODUCT_AMOUNT":0,"percentage":1}},
  {"service":"cable","product_code":"467","code":"467","id":"467","name":"DSTV Yanga","display_name":"DSTV Yanga","provider_price":5940,"price":5940,"providerPrice":5940,"provider_amount":5940,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"467","name":"DSTV Yanga","PRODUCT_AMOUNT":5940,"percentage":1}},
  {"service":"cable","product_code":"468","code":"468","id":"468","name":"DSTV Confam","display_name":"DSTV Confam","provider_price":10890,"price":10890,"providerPrice":10890,"provider_amount":10890,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"468","name":"DSTV Confam","PRODUCT_AMOUNT":10890,"percentage":1}},
  {"service":"cable","product_code":"473","code":"473","id":"473","name":"DSTV Padi","display_name":"DSTV Padi","provider_price":4356,"price":4356,"providerPrice":4356,"provider_amount":4356,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"473","name":"DSTV Padi","PRODUCT_AMOUNT":4356,"percentage":1}},
  {"service":"cable","product_code":"708","code":"708","id":"708","name":"DSTV HDPVR/XtraView_addon","display_name":"DSTV HDPVR/XtraView_addon","provider_price":5940,"price":5940,"providerPrice":5940,"provider_amount":5940,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"708","name":"DSTV HDPVR/XtraView_addon","PRODUCT_AMOUNT":5940,"percentage":1}},
  {"service":"cable","product_code":"55","code":"55","id":"55","name":"StarTimes Nova","display_name":"StarTimes Nova","provider_price":1881,"price":1881,"providerPrice":1881,"provider_amount":1881,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"55","name":"StarTimes Nova","PRODUCT_AMOUNT":1881,"percentage":1}},
  {"service":"cable","product_code":"56","code":"56","id":"56","name":"StarTimes Basic","display_name":"StarTimes Basic","provider_price":3663,"price":3663,"providerPrice":3663,"provider_amount":3663,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"56","name":"StarTimes Basic","PRODUCT_AMOUNT":3663,"percentage":1}},
  {"service":"cable","product_code":"57","code":"57","id":"57","name":"StarTimes Smart","display_name":"StarTimes Smart","provider_price":4653,"price":4653,"providerPrice":4653,"provider_amount":4653,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"57","name":"StarTimes Smart","PRODUCT_AMOUNT":4653,"percentage":1}},
  {"service":"cable","product_code":"58","code":"58","id":"58","name":"StarTimes Classic","display_name":"StarTimes Classic","provider_price":6732,"price":6732,"providerPrice":6732,"provider_amount":6732,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"58","name":"StarTimes Classic","PRODUCT_AMOUNT":6732,"percentage":1}},
  {"service":"cable","product_code":"60","code":"60","id":"60","name":"StarTimes Super","display_name":"StarTimes Super","provider_price":8910,"price":8910,"providerPrice":8910,"provider_amount":8910,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"60","name":"StarTimes Super","PRODUCT_AMOUNT":8910,"percentage":1}},
  {"service":"cable","product_code":"349","code":"349","id":"349","name":"STARTIMES Custom","display_name":"STARTIMES Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"349","name":"STARTIMES Custom","PRODUCT_AMOUNT":0,"percentage":1}},
  {"service":"cable","product_code":"828","code":"828","id":"828","name":"Startimes Nova weekly","display_name":"Startimes Nova weekly","provider_price":643.5,"price":643.5,"providerPrice":643.5,"provider_amount":643.5,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"828","name":"Startimes Nova weekly","PRODUCT_AMOUNT":643.5,"percentage":1}},
  {"service":"cable","product_code":"830","code":"830","id":"830","name":"Startimes Basic weekly","display_name":"Startimes Basic weekly","provider_price":1237.5,"price":1237.5,"providerPrice":1237.5,"provider_amount":1237.5,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"830","name":"Startimes Basic weekly","PRODUCT_AMOUNT":1237.5,"percentage":1}},
  {"service":"cable","product_code":"831","code":"831","id":"831","name":"Startimes Smart weekly","display_name":"Startimes Smart weekly","provider_price":1534.5,"price":1534.5,"providerPrice":1534.5,"provider_amount":1534.5,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"831","name":"Startimes Smart weekly","PRODUCT_AMOUNT":1534.5,"percentage":1}},
  {"service":"cable","product_code":"832","code":"832","id":"832","name":"Startimes classic weekly","display_name":"Startimes classic weekly","provider_price":2277,"price":2277,"providerPrice":2277,"provider_amount":2277,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"832","name":"Startimes classic weekly","PRODUCT_AMOUNT":2277,"percentage":1}},
  {"service":"cable","product_code":"833","code":"833","id":"833","name":"Startimes super weekly","display_name":"Startimes super weekly","provider_price":2970,"price":2970,"providerPrice":2970,"provider_amount":2970,"markup_percent":1,"percentage":1,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"833","name":"Startimes super weekly","PRODUCT_AMOUNT":2970,"percentage":1}},
  {"service":"internet","product_code":"449","code":"449","id":"449","name":"N1000 Spectranet Pin","display_name":"N1000 Spectranet Pin","provider_price":1000,"price":1000,"providerPrice":1000,"provider_amount":1000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"449","name":"N1000 Spectranet Pin","PRODUCT_AMOUNT":1000,"percentage":0}},
  {"service":"internet","product_code":"450","code":"450","id":"450","name":"N2000 Spectranet Pin","display_name":"N2000 Spectranet Pin","provider_price":2000,"price":2000,"providerPrice":2000,"provider_amount":2000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"450","name":"N2000 Spectranet Pin","PRODUCT_AMOUNT":2000,"percentage":0}},
  {"service":"internet","product_code":"451","code":"451","id":"451","name":"N5000 Spectranet Pin","display_name":"N5000 Spectranet Pin","provider_price":5000,"price":5000,"providerPrice":5000,"provider_amount":5000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"451","name":"N5000 Spectranet Pin","PRODUCT_AMOUNT":5000,"percentage":0}},
  {"service":"internet","product_code":"452","code":"452","id":"452","name":"N7000 Spectranet Pin","display_name":"N7000 Spectranet Pin","provider_price":7000,"price":7000,"providerPrice":7000,"provider_amount":7000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"452","name":"N7000 Spectranet Pin","PRODUCT_AMOUNT":7000,"percentage":0}},
  {"service":"internet","product_code":"453","code":"453","id":"453","name":"N10000 Spectranet Pin","display_name":"N10000 Spectranet Pin","provider_price":10000,"price":10000,"providerPrice":10000,"provider_amount":10000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"453","name":"N10000 Spectranet Pin","PRODUCT_AMOUNT":10000,"percentage":0}},
  {"service":"education","product_code":"426","code":"426","id":"426","name":"WAEC PIN","display_name":"WAEC PIN","provider_price":5100,"price":5100,"providerPrice":5100,"provider_amount":5100,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"426","name":"WAEC PIN","PRODUCT_AMOUNT":5100,"percentage":0,"education_type":"WAEC"}},
  {"service":"electricity","product_code":"95","code":"95","id":"95","name":"KNEDC PostPaid Custom","display_name":"KNEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"95","name":"KNEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"KNEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"98","code":"98","id":"98","name":"YEDC PostPaid Custom","display_name":"YEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"98","name":"YEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"YEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"100","code":"100","id":"100","name":"JEDC PostPaid Custom","display_name":"JEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"100","name":"JEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"JEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"93","code":"93","id":"93","name":"AEDC PostPaid Custom","display_name":"AEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"93","name":"AEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"AEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"301","code":"301","id":"301","name":"IBEDC PostPaid Custom","display_name":"IBEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"301","name":"IBEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"IBEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"120","code":"120","id":"120","name":"IKEDC PostPaid Custom","display_name":"IKEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"120","name":"IKEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"IKEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"123","code":"123","id":"123","name":"EKEDC PostPaid Custom","display_name":"EKEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"123","name":"EKEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"EKEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"125","code":"125","id":"125","name":"BEDC PostPaid Custom","display_name":"BEDC PostPaid Custom","provider_price":100,"price":100,"providerPrice":100,"provider_amount":100,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"125","name":"BEDC PostPaid Custom","PRODUCT_AMOUNT":100,"percentage":0,"disco_name":"BEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"90","code":"90","id":"90","name":"PHED PostPaid Custom","display_name":"PHED PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0.5,"percentage":0.5,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"90","name":"PHED PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0.5,"disco_name":"PHED","type":"postpaid"}},
  {"service":"electricity","product_code":"130","code":"130","id":"130","name":"EEDC PostPaid Custom","display_name":"EEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"130","name":"EEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"EEDC","type":"postpaid"}},
  {"service":"electricity","product_code":"94","code":"94","id":"94","name":"KNEDC PrePaid Custom","display_name":"KNEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"94","name":"KNEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"KNEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"96","code":"96","id":"96","name":"YEDC PrePaid Custom","display_name":"YEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"96","name":"YEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"YEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"97","code":"97","id":"97","name":"JEDC PrePaid Custom","display_name":"JEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"97","name":"JEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"JEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"92","code":"92","id":"92","name":"AEDC PrePaid Custom","display_name":"AEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"92","name":"AEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"AEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"302","code":"302","id":"302","name":"IBEDC PrePaid Custom","display_name":"IBEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"302","name":"IBEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"IBEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"99","code":"99","id":"99","name":"IKEDC PrePaid Custom","display_name":"IKEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"99","name":"IKEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"IKEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"101","code":"101","id":"101","name":"EKEDC PrePaid Custom","display_name":"EKEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"101","name":"EKEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"EKEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"103","code":"103","id":"103","name":"BEDC PrePaid Custom","display_name":"BEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"103","name":"BEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"BEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"89","code":"89","id":"89","name":"PHED PrePaid Custom","display_name":"PHED PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0.5,"percentage":0.5,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"89","name":"PHED PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0.5,"disco_name":"PHED","type":"prepaid"}},
  {"service":"electricity","product_code":"104","code":"104","id":"104","name":"EEDC PrePaid Custom","display_name":"EEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"104","name":"EEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"EEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"309","code":"309","id":"309","name":"KEDC PrePaid Custom","display_name":"KEDC PrePaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"309","name":"KEDC PrePaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"KEDC","type":"prepaid"}},
  {"service":"electricity","product_code":"310","code":"310","id":"310","name":"KEDC PostPaid Custom","display_name":"KEDC PostPaid Custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"310","name":"KEDC PostPaid Custom","PRODUCT_AMOUNT":0,"percentage":0,"disco_name":"KEDC","type":"postpaid"}},
  {"service":"education","product_code":"454","code":"454","id":"454","name":"NECO PIN","display_name":"NECO PIN","provider_price":2200,"price":2200,"providerPrice":2200,"provider_amount":2200,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"454","name":"NECO PIN","PRODUCT_AMOUNT":2200,"percentage":0,"education_type":"NECO"}},
  {"service":"data","product_code":"537","code":"537","id":"537","name":"MTN GIFTING 2.5GB/2DAYS","display_name":"MTN GIFTING 2.5GB/2DAYS","provider_price":873,"price":873,"providerPrice":873,"provider_amount":873,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"537","name":"MTN GIFTING 2.5GB/2DAYS","PRODUCT_AMOUNT":873,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"543","code":"543","id":"543","name":"MTN GIFTING 1GB /7DAYS","display_name":"MTN GIFTING 1GB /7DAYS","provider_price":776,"price":776,"providerPrice":776,"provider_amount":776,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"543","name":"MTN GIFTING 1GB /7DAYS","PRODUCT_AMOUNT":776,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"547","code":"547","id":"547","name":"MTN GIFTING 2GB/30DAYS","display_name":"MTN GIFTING 2GB/30DAYS","provider_price":1455,"price":1455,"providerPrice":1455,"provider_amount":1455,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"547","name":"MTN GIFTING 2GB/30DAYS","PRODUCT_AMOUNT":1455,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"551","code":"551","id":"551","name":"MTN GIFTING 10GB /30DAYS","display_name":"MTN GIFTING 10GB /30DAYS","provider_price":4365,"price":4365,"providerPrice":4365,"provider_amount":4365,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"551","name":"MTN GIFTING 10GB /30DAYS","PRODUCT_AMOUNT":4365,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"554","code":"554","id":"554","name":"MTN GIFTING 20GB/30DAYS","display_name":"MTN GIFTING 20GB/30DAYS","provider_price":7275,"price":7275,"providerPrice":7275,"provider_amount":7275,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"554","name":"MTN GIFTING 20GB/30DAYS","PRODUCT_AMOUNT":7275,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"555","code":"555","id":"555","name":"MTN GIFTING 25GB/30DAYS","display_name":"MTN GIFTING 25GB/30DAYS","provider_price":8730,"price":8730,"providerPrice":8730,"provider_amount":8730,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"555","name":"MTN GIFTING 25GB/30DAYS","PRODUCT_AMOUNT":8730,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"567","code":"567","id":"567","name":"MTN GIFTING 2.5TB/365DAYS","display_name":"MTN GIFTING 2.5TB/365DAYS","provider_price":242500,"price":242500,"providerPrice":242500,"provider_amount":242500,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"567","name":"MTN GIFTING 2.5TB/365DAYS","PRODUCT_AMOUNT":242500,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"568","code":"568","id":"568","name":"MTN GIFTING 4.5TB/365DAYS","display_name":"MTN GIFTING 4.5TB/365DAYS","provider_price":436500,"price":436500,"providerPrice":436500,"provider_amount":436500,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"568","name":"MTN GIFTING 4.5TB/365DAYS","PRODUCT_AMOUNT":436500,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"600","code":"600","id":"600","name":"MTN GIFTING 75gb/30days","display_name":"MTN GIFTING 75gb/30days","provider_price":17460,"price":17460,"providerPrice":17460,"provider_amount":17460,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"600","name":"MTN GIFTING 75gb/30days","PRODUCT_AMOUNT":17460,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"871","code":"871","id":"871","name":"MTN GIFTING 2.5GB/1DAY","display_name":"MTN GIFTING 2.5GB/1DAY","provider_price":727.5,"price":727.5,"providerPrice":727.5,"provider_amount":727.5,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"871","name":"MTN GIFTING 2.5GB/1DAY","PRODUCT_AMOUNT":727.5,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"872","code":"872","id":"872","name":"MTN GIFTING 3.2GB/2DAYS","display_name":"MTN GIFTING 3.2GB/2DAYS","provider_price":970,"price":970,"providerPrice":970,"provider_amount":970,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"872","name":"MTN GIFTING 3.2GB/2DAYS","PRODUCT_AMOUNT":970,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"878","code":"878","id":"878","name":"MTN GIFTING 2.7GB/30DAYS","display_name":"MTN GIFTING 2.7GB/30DAYS","provider_price":1940,"price":1940,"providerPrice":1940,"provider_amount":1940,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"878","name":"MTN GIFTING 2.7GB/30DAYS","PRODUCT_AMOUNT":1940,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"888","code":"888","id":"888","name":"MTN GIFTING 250GB/30DAYS","display_name":"MTN GIFTING 250GB/30DAYS","provider_price":53350,"price":53350,"providerPrice":53350,"provider_amount":53350,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"888","name":"MTN GIFTING 250GB/30DAYS","PRODUCT_AMOUNT":53350,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"889","code":"889","id":"889","name":"MTN GIFTING 90GB/60DAYS","display_name":"MTN GIFTING 90GB/60DAYS","provider_price":24250,"price":24250,"providerPrice":24250,"provider_amount":24250,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"889","name":"MTN GIFTING 90GB/60DAYS","PRODUCT_AMOUNT":24250,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"890","code":"890","id":"890","name":"MTN GIFTING 150GB/60DAYS","display_name":"MTN GIFTING 150GB/60DAYS","provider_price":38800,"price":38800,"providerPrice":38800,"provider_amount":38800,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"890","name":"MTN GIFTING 150GB/60DAYS","PRODUCT_AMOUNT":38800,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"891","code":"891","id":"891","name":"MTN GIFTING 200GB/60DAYS","display_name":"MTN GIFTING 200GB/60DAYS","provider_price":48500,"price":48500,"providerPrice":48500,"provider_amount":48500,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"891","name":"MTN GIFTING 200GB/60DAYS","PRODUCT_AMOUNT":48500,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"953","code":"953","id":"953","name":"MTN GIFTING 6GB/7DAYS","display_name":"MTN GIFTING 6GB/7DAYS","provider_price":2425,"price":2425,"providerPrice":2425,"provider_amount":2425,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"953","name":"MTN GIFTING 6GB/7DAYS","PRODUCT_AMOUNT":2425,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"954","code":"954","id":"954","name":"MTN GIFTING 11GB/7DAYS","display_name":"MTN GIFTING 11GB/7DAYS","provider_price":3395,"price":3395,"providerPrice":3395,"provider_amount":3395,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"954","name":"MTN GIFTING 11GB/7DAYS","PRODUCT_AMOUNT":3395,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"957","code":"957","id":"957","name":"MTN GIFTING 12.5GB/30DAYS","display_name":"MTN GIFTING 12.5GB/30DAYS","provider_price":5335,"price":5335,"providerPrice":5335,"provider_amount":5335,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"957","name":"MTN GIFTING 12.5GB/30DAYS","PRODUCT_AMOUNT":5335,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"958","code":"958","id":"958","name":"MTN GIFTING 16.5GB/30DAYS","display_name":"MTN GIFTING 16.5GB/30DAYS","provider_price":6305,"price":6305,"providerPrice":6305,"provider_amount":6305,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"958","name":"MTN GIFTING 16.5GB/30DAYS","PRODUCT_AMOUNT":6305,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"959","code":"959","id":"959","name":"MTN GIFTING 36GB/30DAYS","display_name":"MTN GIFTING 36GB/30DAYS","provider_price":10670,"price":10670,"providerPrice":10670,"provider_amount":10670,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"959","name":"MTN GIFTING 36GB/30DAYS","PRODUCT_AMOUNT":10670,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"960","code":"960","id":"960","name":"MTN GIFTING 165GB/30DAYS","display_name":"MTN GIFTING 165GB/30DAYS","provider_price":33950,"price":33950,"providerPrice":33950,"provider_amount":33950,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"960","name":"MTN GIFTING 165GB/30DAYS","PRODUCT_AMOUNT":33950,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"963","code":"963","id":"963","name":"MTN GIFTING 1.5GB/2DAYS","display_name":"MTN GIFTING 1.5GB/2DAYS","provider_price":582,"price":582,"providerPrice":582,"provider_amount":582,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"963","name":"MTN GIFTING 1.5GB/2DAYS","PRODUCT_AMOUNT":582,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"964","code":"964","id":"964","name":"MTN GIFTING 1.2GB PULSE/7DAYS","display_name":"MTN GIFTING 1.2GB PULSE/7DAYS","provider_price":727.5,"price":727.5,"providerPrice":727.5,"provider_amount":727.5,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"964","name":"MTN GIFTING 1.2GB PULSE/7DAYS","PRODUCT_AMOUNT":727.5,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1000","code":"1000","id":"1000","name":"MTN GIFTING 1.5GB/7DAYS","display_name":"MTN GIFTING 1.5GB/7DAYS","provider_price":970,"price":970,"providerPrice":970,"provider_amount":970,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1000","name":"MTN GIFTING 1.5GB/7DAYS","PRODUCT_AMOUNT":970,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1001","code":"1001","id":"1001","name":"MTN GIFTING 65GB/30DAYS","display_name":"MTN GIFTING 65GB/30DAYS","provider_price":15520,"price":15520,"providerPrice":15520,"provider_amount":15520,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1001","name":"MTN GIFTING 65GB/30DAYS","PRODUCT_AMOUNT":15520,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1002","code":"1002","id":"1002","name":"MTN GIFTING 7GB/30DAYS","display_name":"MTN GIFTING 7GB/30DAYS","provider_price":3395,"price":3395,"providerPrice":3395,"provider_amount":3395,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1002","name":"MTN GIFTING 7GB/30DAYS","PRODUCT_AMOUNT":3395,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1003","code":"1003","id":"1003","name":"MTN GIFTING 3.5GB/30DAYS","display_name":"MTN GIFTING 3.5GB/30DAYS","provider_price":2425,"price":2425,"providerPrice":2425,"provider_amount":2425,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1003","name":"MTN GIFTING 3.5GB/30DAYS","PRODUCT_AMOUNT":2425,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1008","code":"1008","id":"1008","name":"MTN GIFTING 480GB/90DAYS","display_name":"MTN GIFTING 480GB/90DAYS","provider_price":87300,"price":87300,"providerPrice":87300,"provider_amount":87300,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1008","name":"MTN GIFTING 480GB/90DAYS","PRODUCT_AMOUNT":87300,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1009","code":"1009","id":"1009","name":"MTN BROADBAND 30GB/30DAYS","display_name":"MTN BROADBAND 30GB/30DAYS","provider_price":8730,"price":8730,"providerPrice":8730,"provider_amount":8730,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1009","name":"MTN BROADBAND 30GB/30DAYS","PRODUCT_AMOUNT":8730,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1010","code":"1010","id":"1010","name":"MTN BROADBAND 60GB/30DAYS","display_name":"MTN BROADBAND 60GB/30DAYS","provider_price":14065,"price":14065,"providerPrice":14065,"provider_amount":14065,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1010","name":"MTN BROADBAND 60GB/30DAYS","PRODUCT_AMOUNT":14065,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1011","code":"1011","id":"1011","name":"MTN BROADBAND 120GB/30DAYS","display_name":"MTN BROADBAND 120GB/30DAYS","provider_price":23280,"price":23280,"providerPrice":23280,"provider_amount":23280,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1011","name":"MTN BROADBAND 120GB/30DAYS","PRODUCT_AMOUNT":23280,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1013","code":"1013","id":"1013","name":"MTN BROADBAND 450GB/90DAYS","display_name":"MTN BROADBAND 450GB/90DAYS","provider_price":72750,"price":72750,"providerPrice":72750,"provider_amount":72750,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1013","name":"MTN BROADBAND 450GB/90DAYS","PRODUCT_AMOUNT":72750,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1015","code":"1015","id":"1015","name":"MTN BROADBAND 1.5TB/YEARLY","display_name":"MTN BROADBAND 1.5TB/YEARLY","provider_price":218250,"price":218250,"providerPrice":218250,"provider_amount":218250,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1015","name":"MTN BROADBAND 1.5TB/YEARLY","PRODUCT_AMOUNT":218250,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1018","code":"1018","id":"1018","name":"MTN GIFTING 800GB/YEARLY","display_name":"MTN GIFTING 800GB/YEARLY","provider_price":121250,"price":121250,"providerPrice":121250,"provider_amount":121250,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1018","name":"MTN GIFTING 800GB/YEARLY","PRODUCT_AMOUNT":121250,"percentage":3,"network":"MTN"}},
  {"service":"data","product_code":"1067","code":"1067","id":"1067","name":"MTN GIFTING 20GB Weekly Plan","display_name":"MTN GIFTING 20GB Weekly Plan","provider_price":4850,"price":4850,"providerPrice":4850,"provider_amount":4850,"markup_percent":3,"percentage":3,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1067","name":"MTN GIFTING 20GB Weekly Plan","PRODUCT_AMOUNT":4850,"percentage":3,"network":"MTN"}},
  {"service":"internet","product_code":"1070","code":"1070","id":"1070","name":"Silver (150GB FUP Monthly Unlimited)","display_name":"Silver (150GB FUP Monthly Unlimited)","provider_price":29100,"price":29100,"providerPrice":29100,"provider_amount":29100,"markup_percent":3,"percentage":3,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1070","name":"Silver (150GB FUP Monthly Unlimited)","PRODUCT_AMOUNT":29100,"percentage":3}},
  {"service":"internet","product_code":"1071","code":"1071","id":"1071","name":"Ruby (260GB FUP Monthly Unlimited)","display_name":"Ruby (260GB FUP Monthly Unlimited)","provider_price":43650,"price":43650,"providerPrice":43650,"provider_amount":43650,"markup_percent":3,"percentage":3,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1071","name":"Ruby (260GB FUP Monthly Unlimited)","PRODUCT_AMOUNT":43650,"percentage":3}},
  {"service":"education","product_code":"705","code":"705","id":"705","name":"NABTEB PIN","display_name":"NABTEB PIN","provider_price":855,"price":855,"providerPrice":855,"provider_amount":855,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"705","name":"NABTEB PIN","PRODUCT_AMOUNT":855,"percentage":0,"education_type":"NABTEB"}},
  {"service":"data","product_code":"759","code":"759","id":"759","name":"MTN SME2 500MB","display_name":"MTN SME2 500MB","provider_price":240,"price":240,"providerPrice":240,"provider_amount":240,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"759","name":"MTN SME2 500MB","PRODUCT_AMOUNT":240,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"761","code":"761","id":"761","name":"MTN SME2 2GB","display_name":"MTN SME2 2GB","provider_price":740,"price":740,"providerPrice":740,"provider_amount":740,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"761","name":"MTN SME2 2GB","PRODUCT_AMOUNT":740,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"762","code":"762","id":"762","name":"MTN SME2 3GB","display_name":"MTN SME2 3GB","provider_price":950,"price":950,"providerPrice":950,"provider_amount":950,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"762","name":"MTN SME2 3GB","PRODUCT_AMOUNT":950,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"763","code":"763","id":"763","name":"MTN SME2 5GB","display_name":"MTN SME2 5GB","provider_price":1370,"price":1370,"providerPrice":1370,"provider_amount":1370,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"763","name":"MTN SME2 5GB","PRODUCT_AMOUNT":1370,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"764","code":"764","id":"764","name":"MTN SME2 10GB","display_name":"MTN SME2 10GB","provider_price":2740,"price":2740,"providerPrice":2740,"provider_amount":2740,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"764","name":"MTN SME2 10GB","PRODUCT_AMOUNT":2740,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1061","code":"1061","id":"1061","name":"MTN SME2 1GB","display_name":"MTN SME2 1GB","provider_price":470,"price":470,"providerPrice":470,"provider_amount":470,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1061","name":"MTN SME2 1GB","PRODUCT_AMOUNT":470,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1115","code":"1115","id":"1115","name":"SME2 15GB","display_name":"SME2 15GB","provider_price":4110,"price":4110,"providerPrice":4110,"provider_amount":4110,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1115","name":"SME2 15GB","PRODUCT_AMOUNT":4110,"percentage":0}},
  {"service":"data","product_code":"1118","code":"1118","id":"1118","name":"SME2 20GB","display_name":"SME2 20GB","provider_price":5480,"price":5480,"providerPrice":5480,"provider_amount":5480,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1118","name":"SME2 20GB","PRODUCT_AMOUNT":5480,"percentage":0}},
  {"service":"data","product_code":"787","code":"787","id":"787","name":"AIRTEL UNLIMITED 20/30DAYS","display_name":"AIRTEL UNLIMITED 20/30DAYS","provider_price":28200,"price":28200,"providerPrice":28200,"provider_amount":28200,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"787","name":"AIRTEL UNLIMITED 20/30DAYS","PRODUCT_AMOUNT":28200,"percentage":6,"network":"Airtel"}},
  {"service":"data","product_code":"789","code":"789","id":"789","name":"AIRTEL UNLIMITED 60/30DAYS","display_name":"AIRTEL UNLIMITED 60/30DAYS","provider_price":47000,"price":47000,"providerPrice":47000,"provider_amount":47000,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"789","name":"AIRTEL UNLIMITED 60/30DAYS","PRODUCT_AMOUNT":47000,"percentage":6,"network":"Airtel"}},
  {"service":"internet","product_code":"899","code":"899","id":"899","name":"Airtel ROUTER 30GB/7DAYS","display_name":"Airtel ROUTER 30GB/7DAYS","provider_price":4700,"price":4700,"providerPrice":4700,"provider_amount":4700,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"899","name":"Airtel ROUTER 30GB/7DAYS","PRODUCT_AMOUNT":4700,"percentage":6,"network":"Airtel"}},
  {"service":"internet","product_code":"907","code":"907","id":"907","name":"Airtel ROUTER 40GB/30DAYS","display_name":"Airtel ROUTER 40GB/30DAYS","provider_price":9400,"price":9400,"providerPrice":9400,"provider_amount":9400,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"907","name":"Airtel ROUTER 40GB/30DAYS","PRODUCT_AMOUNT":9400,"percentage":6,"network":"Airtel"}},
  {"service":"internet","product_code":"908","code":"908","id":"908","name":"Airtel ROUTER ULTRA 40GB/30DAYS","display_name":"Airtel ROUTER ULTRA 40GB/30DAYS","provider_price":9400,"price":9400,"providerPrice":9400,"provider_amount":9400,"markup_percent":6,"percentage":6,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"908","name":"Airtel ROUTER ULTRA 40GB/30DAYS","PRODUCT_AMOUNT":9400,"percentage":6,"network":"Airtel"}},
  {"service":"internet","product_code":"1088","code":"1088","id":"1088","name":"Ultra Plans Router only 75GB + 250MB daily 30 Days","display_name":"Ultra Plans Router only 75GB + 250MB daily 30 Days","provider_price":14100,"price":14100,"providerPrice":14100,"provider_amount":14100,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1088","name":"Ultra Plans Router only 75GB + 250MB daily 30 Days","PRODUCT_AMOUNT":14100,"percentage":6}},
  {"service":"internet","product_code":"1089","code":"1089","id":"1089","name":"ROUTER ULTRA 20k - Data - 100.0 GB (30 Days)","display_name":"ROUTER ULTRA 20k - Data - 100.0 GB (30 Days)","provider_price":18800,"price":18800,"providerPrice":18800,"provider_amount":18800,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1089","name":"ROUTER ULTRA 20k - Data - 100.0 GB (30 Days)","PRODUCT_AMOUNT":18800,"percentage":6}},
  {"service":"internet","product_code":"1092","code":"1092","id":"1092","name":"Router Unlimited 20 90Days - Data - 20.0 MBPS (90 Days)","display_name":"Router Unlimited 20 90Days - Data - 20.0 MBPS (90 Days)","provider_price":75200,"price":75200,"providerPrice":75200,"provider_amount":75200,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1092","name":"Router Unlimited 20 90Days - Data - 20.0 MBPS (90 Days)","PRODUCT_AMOUNT":75200,"percentage":6}},
  {"service":"internet","product_code":"1094","code":"1094","id":"1094","name":"ODU ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 Mbps (30 Days)","display_name":"ODU ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 Mbps (30 Days)","provider_price":23500,"price":23500,"providerPrice":23500,"provider_amount":23500,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1094","name":"ODU ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 Mbps (30 Days)","PRODUCT_AMOUNT":23500,"percentage":6}},
  {"service":"internet","product_code":"1095","code":"1095","id":"1095","name":"ODU ROUTER UNLIMITED 100MBPS 30days - Data - 100.0 Mbps (30 Days)","display_name":"ODU ROUTER UNLIMITED 100MBPS 30days - Data - 100.0 Mbps (30 Days)","provider_price":42300,"price":42300,"providerPrice":42300,"provider_amount":42300,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1095","name":"ODU ROUTER UNLIMITED 100MBPS 30days - Data - 100.0 Mbps (30 Days)","PRODUCT_AMOUNT":42300,"percentage":6}},
  {"service":"internet","product_code":"1100","code":"1100","id":"1100","name":"ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 MBPS (30 Days)","display_name":"ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 MBPS (30 Days)","provider_price":23500,"price":23500,"providerPrice":23500,"provider_amount":23500,"markup_percent":6,"percentage":6,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1100","name":"ROUTER UNLIMITED 50MBPS 30days - Data - 50.0 MBPS (30 Days)","PRODUCT_AMOUNT":23500,"percentage":6}},
  {"service":"electricity","product_code":"791","code":"791","id":"791","name":"Aba prepaid custom","display_name":"Aba prepaid custom","provider_price":0,"price":0,"providerPrice":0,"provider_amount":0,"markup_percent":0.5,"percentage":0.5,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"791","name":"Aba prepaid custom","PRODUCT_AMOUNT":0,"percentage":0.5,"disco_name":"Aba","type":"prepaid"}},
  {"service":"data","product_code":"862","code":"862","id":"862","name":"Airtel 10gb monthly","display_name":"Airtel 10gb monthly","provider_price":3050,"price":3050,"providerPrice":3050,"provider_amount":3050,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"862","name":"Airtel 10gb monthly","PRODUCT_AMOUNT":3050,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"927","code":"927","id":"927","name":"Airtel 300MB 2days","display_name":"Airtel 300MB 2days","provider_price":130,"price":130,"providerPrice":130,"provider_amount":130,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"927","name":"Airtel 300MB 2days","PRODUCT_AMOUNT":130,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"929","code":"929","id":"929","name":"Airtel 150MB 1day","display_name":"Airtel 150MB 1day","provider_price":70,"price":70,"providerPrice":70,"provider_amount":70,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"929","name":"Airtel 150MB 1day","PRODUCT_AMOUNT":70,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"930","code":"930","id":"930","name":"Airtel 600MB 2days","display_name":"Airtel 600MB 2days","provider_price":245,"price":245,"providerPrice":245,"provider_amount":245,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"930","name":"Airtel 600MB 2days","PRODUCT_AMOUNT":245,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"1080","code":"1080","id":"1080","name":"Airtel 1.5GB 1-Days Plan","display_name":"Airtel 1.5GB 1-Days Plan","provider_price":570,"price":570,"providerPrice":570,"provider_amount":570,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1080","name":"Airtel 1.5GB 1-Days Plan","PRODUCT_AMOUNT":570,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"1081","code":"1081","id":"1081","name":"Airtel 2GB 2 Days Plan","display_name":"Airtel 2GB 2 Days Plan","provider_price":670,"price":670,"providerPrice":670,"provider_amount":670,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1081","name":"Airtel 2GB 2 Days Plan","PRODUCT_AMOUNT":670,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"1082","code":"1082","id":"1082","name":"Airtel 3GB 2 Days Plan","display_name":"Airtel 3GB 2 Days Plan","provider_price":840,"price":840,"providerPrice":840,"provider_amount":840,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1082","name":"Airtel 3GB 2 Days Plan","PRODUCT_AMOUNT":840,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"1083","code":"1083","id":"1083","name":"Airtel (Social) 1GB 3-Days Plan","display_name":"Airtel (Social) 1GB 3-Days Plan","provider_price":370,"price":370,"providerPrice":370,"provider_amount":370,"markup_percent":0,"percentage":0,"selling_price":0,"network":"Airtel","network_code":"airtel","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1083","name":"Airtel (Social) 1GB 3-Days Plan","PRODUCT_AMOUNT":370,"percentage":0,"network":"Airtel"}},
  {"service":"data","product_code":"1037","code":"1037","id":"1037","name":"Glo 1GB/3DAYS","display_name":"Glo 1GB/3DAYS","provider_price":320,"price":320,"providerPrice":320,"provider_amount":320,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1037","name":"Glo 1GB/3DAYS","PRODUCT_AMOUNT":320,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"1038","code":"1038","id":"1038","name":"Glo 1GB/7DAYS","display_name":"Glo 1GB/7DAYS","provider_price":330,"price":330,"providerPrice":330,"provider_amount":330,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1038","name":"Glo 1GB/7DAYS","PRODUCT_AMOUNT":330,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"1105","code":"1105","id":"1105","name":"GLO 10GB 7days","display_name":"GLO 10GB 7days","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1105","name":"GLO 10GB 7days","PRODUCT_AMOUNT":1800,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"1132","code":"1132","id":"1132","name":"GLO 9GB+2.5GB 1 week","display_name":"GLO 9GB+2.5GB 1 week","provider_price":1800,"price":1800,"providerPrice":1800,"provider_amount":1800,"markup_percent":0,"percentage":0,"selling_price":0,"network":"GLO","network_code":"glo","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1132","name":"GLO 9GB+2.5GB 1 week","PRODUCT_AMOUNT":1800,"percentage":0,"network":"GLO"}},
  {"service":"data","product_code":"851","code":"851","id":"851","name":"data_share_500mb","display_name":"data_share_500mb","provider_price":270,"price":270,"providerPrice":270,"provider_amount":270,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"851","name":"data_share_500mb","PRODUCT_AMOUNT":270,"percentage":0}},
  {"service":"data","product_code":"1065","code":"1065","id":"1065","name":"MTN 1GB WEEKLY","display_name":"MTN 1GB WEEKLY","provider_price":375,"price":375,"providerPrice":375,"provider_amount":375,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1065","name":"MTN 1GB WEEKLY","PRODUCT_AMOUNT":375,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1075","code":"1075","id":"1075","name":"DATA SHARE 1GB","display_name":"DATA SHARE 1GB","provider_price":475,"price":475,"providerPrice":475,"provider_amount":475,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1075","name":"DATA SHARE 1GB","PRODUCT_AMOUNT":475,"percentage":0}},
  {"service":"data","product_code":"1076","code":"1076","id":"1076","name":"DATA SHARE 2GB","display_name":"DATA SHARE 2GB","provider_price":750,"price":750,"providerPrice":750,"provider_amount":750,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1076","name":"DATA SHARE 2GB","PRODUCT_AMOUNT":750,"percentage":0}},
  {"service":"data","product_code":"1077","code":"1077","id":"1077","name":"DATA SHARE 3GB","display_name":"DATA SHARE 3GB","provider_price":1050,"price":1050,"providerPrice":1050,"provider_amount":1050,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1077","name":"DATA SHARE 3GB","PRODUCT_AMOUNT":1050,"percentage":0}},
  {"service":"data","product_code":"1078","code":"1078","id":"1078","name":"DATA SHARE 5GB","display_name":"DATA SHARE 5GB","provider_price":1370,"price":1370,"providerPrice":1370,"provider_amount":1370,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1078","name":"DATA SHARE 5GB","PRODUCT_AMOUNT":1370,"percentage":0}},
  {"service":"data","product_code":"1079","code":"1079","id":"1079","name":"MTN 2GB WEEKLY","display_name":"MTN 2GB WEEKLY","provider_price":700,"price":700,"providerPrice":700,"provider_amount":700,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1079","name":"MTN 2GB WEEKLY","PRODUCT_AMOUNT":700,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1110","code":"1110","id":"1110","name":"MTN 1GB DAILY","display_name":"MTN 1GB DAILY","provider_price":280,"price":280,"providerPrice":280,"provider_amount":280,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1110","name":"MTN 1GB DAILY","PRODUCT_AMOUNT":280,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1111","code":"1111","id":"1111","name":"MTN 2.5GB DAILY","display_name":"MTN 2.5GB DAILY","provider_price":580,"price":580,"providerPrice":580,"provider_amount":580,"markup_percent":0,"percentage":0,"selling_price":0,"network":"MTN","network_code":"mtn","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1111","name":"MTN 2.5GB DAILY","PRODUCT_AMOUNT":580,"percentage":0,"network":"MTN"}},
  {"service":"data","product_code":"1113","code":"1113","id":"1113","name":"DATA SHARE 10GB","display_name":"DATA SHARE 10GB","provider_price":2740,"price":2740,"providerPrice":2740,"provider_amount":2740,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1113","name":"DATA SHARE 10GB","PRODUCT_AMOUNT":2740,"percentage":0}},
  {"service":"data","product_code":"1116","code":"1116","id":"1116","name":"DATA SHARE 15GB","display_name":"DATA SHARE 15GB","provider_price":4110,"price":4110,"providerPrice":4110,"provider_amount":4110,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1116","name":"DATA SHARE 15GB","PRODUCT_AMOUNT":4110,"percentage":0}},
  {"service":"data","product_code":"1119","code":"1119","id":"1119","name":"DATA SHARE 20GB","display_name":"DATA SHARE 20GB","provider_price":5480,"price":5480,"providerPrice":5480,"provider_amount":5480,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1119","name":"DATA SHARE 20GB","PRODUCT_AMOUNT":5480,"percentage":0}},
  {"service":"internet","product_code":"1090","code":"1090","id":"1090","name":"Router Unlimited 60 90Days - Data - 60.0 MBPS (90 Day)","display_name":"Router Unlimited 60 90Days - Data - 60.0 MBPS (90 Day)","provider_price":135000,"price":135000,"providerPrice":135000,"provider_amount":135000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1090","name":"Router Unlimited 60 90Days - Data - 60.0 MBPS (90 Day)","PRODUCT_AMOUNT":135000,"percentage":0}},
  {"service":"internet","product_code":"1091","code":"1091","id":"1091","name":"Unlimited 60 180Days - Data - 60.0 MBPS (180 Day)","display_name":"Unlimited 60 180Days - Data - 60.0 MBPS (180 Day)","provider_price":300000,"price":300000,"providerPrice":300000,"provider_amount":300000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1091","name":"Unlimited 60 180Days - Data - 60.0 MBPS (180 Day)","PRODUCT_AMOUNT":300000,"percentage":0}},
  {"service":"internet","product_code":"1093","code":"1093","id":"1093","name":"Router Unlimited 20 180Days - Data - 20.0 MBPS (180 Day)","display_name":"Router Unlimited 20 180Days - Data - 20.0 MBPS (180 Day)","provider_price":150000,"price":150000,"providerPrice":150000,"provider_amount":150000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1093","name":"Router Unlimited 20 180Days - Data - 20.0 MBPS (180 Day)","PRODUCT_AMOUNT":150000,"percentage":0}},
  {"service":"internet","product_code":"1097","code":"1097","id":"1097","name":"Unlimited 100 90 Days - Data - 100.0 Mbps (90 Days)","display_name":"Unlimited 100 90 Days - Data - 100.0 Mbps (90 Days)","provider_price":121500,"price":121500,"providerPrice":121500,"provider_amount":121500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1097","name":"Unlimited 100 90 Days - Data - 100.0 Mbps (90 Days)","PRODUCT_AMOUNT":121500,"percentage":0}},
  {"service":"internet","product_code":"1098","code":"1098","id":"1098","name":"Unlimited 50 180 Days - Data - 50.0 Mbps (180 Days)","display_name":"Unlimited 50 180 Days - Data - 50.0 Mbps (180 Days)","provider_price":125000,"price":125000,"providerPrice":125000,"provider_amount":125000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1098","name":"Unlimited 50 180 Days - Data - 50.0 Mbps (180 Days)","PRODUCT_AMOUNT":125000,"percentage":0}},
  {"service":"internet","product_code":"1099","code":"1099","id":"1099","name":"Unlimited 100 180 Days - Data - 100.0 Mbps (180 Days)","display_name":"Unlimited 100 180 Days - Data - 100.0 Mbps (180 Days)","provider_price":225000,"price":225000,"providerPrice":225000,"provider_amount":225000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"1099","name":"Unlimited 100 180 Days - Data - 100.0 Mbps (180 Days)","PRODUCT_AMOUNT":225000,"percentage":0}},
  {"service":"internet","product_code":"365","code":"365","id":"365","name":"Smile 1GB FlexiDaily (1 day)","display_name":"Smile 1GB FlexiDaily (1 day)","provider_price":500,"price":500,"providerPrice":500,"provider_amount":500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"365","name":"Smile 1GB FlexiDaily (1 day)","PRODUCT_AMOUNT":500,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"366","code":"366","id":"366","name":"Smile 2GB FlexiWeekly (7 days)","display_name":"Smile 2GB FlexiWeekly (7 days)","provider_price":1200,"price":1200,"providerPrice":1200,"provider_amount":1200,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"366","name":"Smile 2GB FlexiWeekly (7 days)","PRODUCT_AMOUNT":1200,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"367","code":"367","id":"367","name":"Smile 1GB SmileLite (30 days)","display_name":"Smile 1GB SmileLite (30 days)","provider_price":1000,"price":1000,"providerPrice":1000,"provider_amount":1000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"367","name":"Smile 1GB SmileLite (30 days)","PRODUCT_AMOUNT":1000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"368","code":"368","id":"368","name":"Smile 2GB SmileLite (30 days)","display_name":"Smile 2GB SmileLite (30 days)","provider_price":2000,"price":2000,"providerPrice":2000,"provider_amount":2000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"368","name":"Smile 2GB SmileLite (30 days)","PRODUCT_AMOUNT":2000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"369","code":"369","id":"369","name":"Smile 2GB MidNite (7 days)","display_name":"Smile 2GB MidNite (7 days)","provider_price":1000,"price":1000,"providerPrice":1000,"provider_amount":1000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"369","name":"Smile 2GB MidNite (7 days)","PRODUCT_AMOUNT":1000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"370","code":"370","id":"370","name":"Smile 3GB MidNite (7 days)","display_name":"Smile 3GB MidNite (7 days)","provider_price":1500,"price":1500,"providerPrice":1500,"provider_amount":1500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"370","name":"Smile 3GB MidNite (7 days)","PRODUCT_AMOUNT":1500,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"371","code":"371","id":"371","name":"Smile 3GB Weekend Only (3 days)","display_name":"Smile 3GB Weekend Only (3 days)","provider_price":1500,"price":1500,"providerPrice":1500,"provider_amount":1500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"371","name":"Smile 3GB Weekend Only (3 days)","PRODUCT_AMOUNT":1500,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"372","code":"372","id":"372","name":"Smile 3GB Anytime (30 days)","display_name":"Smile 3GB Anytime (30 days)","provider_price":3000,"price":3000,"providerPrice":3000,"provider_amount":3000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"372","name":"Smile 3GB Anytime (30 days)","PRODUCT_AMOUNT":3000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"373","code":"373","id":"373","name":"Smile 5GB Anytime (30 days)","display_name":"Smile 5GB Anytime (30 days)","provider_price":4000,"price":4000,"providerPrice":4000,"provider_amount":4000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"373","name":"Smile 5GB Anytime (30 days)","PRODUCT_AMOUNT":4000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"374","code":"374","id":"374","name":"Smile 7GB Anytime (30 days)","display_name":"Smile 7GB Anytime (30 days)","provider_price":5000,"price":5000,"providerPrice":5000,"provider_amount":5000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"374","name":"Smile 7GB Anytime (30 days)","PRODUCT_AMOUNT":5000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"375","code":"375","id":"375","name":"Smile 10GB Anytime (30 days)","display_name":"Smile 10GB Anytime (30 days)","provider_price":7500,"price":7500,"providerPrice":7500,"provider_amount":7500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"375","name":"Smile 10GB Anytime (30 days)","PRODUCT_AMOUNT":7500,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"376","code":"376","id":"376","name":"Smile 15GB Anytime (30 days)","display_name":"Smile 15GB Anytime (30 days)","provider_price":10000,"price":10000,"providerPrice":10000,"provider_amount":10000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"376","name":"Smile 15GB Anytime (30 days)","PRODUCT_AMOUNT":10000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"377","code":"377","id":"377","name":"Smile Unlimited Lite (30 days)","display_name":"Smile Unlimited Lite (30 days)","provider_price":10000,"price":10000,"providerPrice":10000,"provider_amount":10000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"377","name":"Smile Unlimited Lite (30 days)","PRODUCT_AMOUNT":10000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"378","code":"378","id":"378","name":"Smile Unlimited Premium (30 days)","display_name":"Smile Unlimited Premium (30 days)","provider_price":19800,"price":19800,"providerPrice":19800,"provider_amount":19800,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"378","name":"Smile Unlimited Premium (30 days)","PRODUCT_AMOUNT":19800,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"379","code":"379","id":"379","name":"Smile 30GB BumpaValue (60 days)","display_name":"Smile 30GB BumpaValue (60 days)","provider_price":15000,"price":15000,"providerPrice":15000,"provider_amount":15000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"379","name":"Smile 30GB BumpaValue (60 days)","PRODUCT_AMOUNT":15000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"380","code":"380","id":"380","name":"Smile 60GB BumpaValue (90 days)","display_name":"Smile 60GB BumpaValue (90 days)","provider_price":30000,"price":30000,"providerPrice":30000,"provider_amount":30000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"380","name":"Smile 60GB BumpaValue (90 days)","PRODUCT_AMOUNT":30000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"381","code":"381","id":"381","name":"Smile 80GB BumpaValue (120 days)","display_name":"Smile 80GB BumpaValue (120 days)","provider_price":50000,"price":50000,"providerPrice":50000,"provider_amount":50000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"381","name":"Smile 80GB BumpaValue (120 days)","PRODUCT_AMOUNT":50000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"382","code":"382","id":"382","name":"Smile 10GB Anytime (365 days)","display_name":"Smile 10GB Anytime (365 days)","provider_price":9000,"price":9000,"providerPrice":9000,"provider_amount":9000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"382","name":"Smile 10GB Anytime (365 days)","PRODUCT_AMOUNT":9000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"383","code":"383","id":"383","name":"Smile 20GB Anytime (365 days)","display_name":"Smile 20GB Anytime (365 days)","provider_price":17000,"price":17000,"providerPrice":17000,"provider_amount":17000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"383","name":"Smile 20GB Anytime (365 days)","PRODUCT_AMOUNT":17000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"384","code":"384","id":"384","name":"Smile 200GB Anytime (365 days)","display_name":"Smile 200GB Anytime (365 days)","provider_price":135000,"price":135000,"providerPrice":135000,"provider_amount":135000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"384","name":"Smile 200GB Anytime (365 days)","PRODUCT_AMOUNT":135000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"385","code":"385","id":"385","name":"Smile 50GB Anytime (365 days)","display_name":"Smile 50GB Anytime (365 days)","provider_price":36000,"price":36000,"providerPrice":36000,"provider_amount":36000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"385","name":"Smile 50GB Anytime (365 days)","PRODUCT_AMOUNT":36000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"386","code":"386","id":"386","name":"Smile 100GB Anytime (365 days)","display_name":"Smile 100GB Anytime (365 days)","provider_price":70000,"price":70000,"providerPrice":70000,"provider_amount":70000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"386","name":"Smile 100GB Anytime (365 days)","PRODUCT_AMOUNT":70000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"446","code":"446","id":"446","name":"SmileVoice ONLY 75","display_name":"SmileVoice ONLY 75","provider_price":500,"price":500,"providerPrice":500,"provider_amount":500,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"446","name":"SmileVoice ONLY 75","PRODUCT_AMOUNT":500,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"447","code":"447","id":"447","name":"SmileVoice ONLY 500","display_name":"SmileVoice ONLY 500","provider_price":3000,"price":3000,"providerPrice":3000,"provider_amount":3000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"447","name":"SmileVoice ONLY 500","PRODUCT_AMOUNT":3000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"448","code":"448","id":"448","name":"SmileVoice ONLY 165","display_name":"SmileVoice ONLY 165","provider_price":1000,"price":1000,"providerPrice":1000,"provider_amount":1000,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"448","name":"SmileVoice ONLY 165","PRODUCT_AMOUNT":1000,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
  {"service":"internet","product_code":"445","code":"445","id":"445","name":"Smile Recharge","display_name":"Smile Recharge","provider_price":100,"price":100,"providerPrice":100,"provider_amount":100,"markup_percent":0,"percentage":0,"selling_price":0,"network":"","network_code":"","data_type":null,"dataCategory":null,"validityDays":0,"validity_days":0,"duration":0,"period":null,"raw":{"product_code":"445","name":"Smile Recharge","PRODUCT_AMOUNT":100,"percentage":0,"provider":"Smile","provider_name":"Smile"}},
];

let catalogCache: { expires: number; entries: any[] } | null = null;

function buildEmbeddedCatalog(): any[] {
  return EMBEDDED_CATALOG.map((entry) => {
    // A zero/missing percentage means no percentage was supplied for the
    // service catalogue entry. Apply the platform default of 5%.
    // Airtime keeps its explicitly configured percentage rules.
    const configuredMarkup = numberValue(entry.markup_percent);
    const markupPercent = configuredMarkup > 0 || entry.service === "airtime"
      ? configuredMarkup
      : 5;

    return {
      ...entry,
      markup_percent: markupPercent,
      percentage: markupPercent,
      selling_price: entry.provider_price > 0
        ? roundUp50(entry.provider_price, markupPercent)
        : 0,
    };
  });
}

async function loadCatalog(): Promise<any[]> {
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.entries;
  const entries = buildEmbeddedCatalog();
  if (entries.length !== 268) throw new Error("Service catalogue integrity check failed.");
  catalogCache = { expires: Date.now() + 300_000, entries };
  return entries;
}

function uniqueByCode(entries: any[]): any[] {
  const map = new Map<string, any>();
  for (const entry of entries) {
    const key = `${clean(entry.product_code).toLowerCase()}:${clean(entry.name).toLowerCase()}`;
    if (!map.has(key)) map.set(key, entry);
  }
  return [...map.values()];
}

function catalogBillerCode(entry: any, service: Service): string {
  if (service === "data" || service === "airtime") {
    return clean(entry.network_code) || entry.network || entry.product_code;
  }

  return clean(firstValue(
    entry.raw.provider_code,
    entry.raw.providerCode,
    entry.raw.biller_code,
    entry.raw.billerCode,
    entry.raw.service_id,
    entry.raw.serviceId,
    entry.product_code,
  ));
}

function cableProviderCode(entry: any): string {
  const value = `${clean(entry.name)} ${clean(entry.raw?.provider_name)} ${clean(entry.raw?.providerName)} ${clean(entry.raw?.tv_name)} ${clean(entry.raw?.tvName)}`.toLowerCase();

  if (/gotv|gotv/i.test(value)) return "gotv";
  if (/dstv|dstv/i.test(value)) return "dstv";
  if (/startimes|startime/i.test(value)) return "startimes";

  return clean(firstValue(
    entry.raw?.provider_code,
    entry.raw?.providerCode,
    entry.raw?.biller_code,
    entry.raw?.billerCode,
    entry.raw?.provider_id,
    entry.raw?.providerId,
  )) || clean(entry.product_code);
}

function cableProviderName(entry: any): string {
  const value = `${clean(entry.name)} ${clean(entry.raw?.provider_name)} ${clean(entry.raw?.providerName)} ${clean(entry.raw?.tv_name)} ${clean(entry.raw?.tvName)}`.toLowerCase();

  if (/gotv/i.test(value)) return "GOtv";
  if (/dstv/i.test(value)) return "DSTV";
  if (/startimes/i.test(value)) return "StarTimes";

  return clean(firstValue(
    entry.raw?.provider_name,
    entry.raw?.providerName,
    entry.raw?.tv_name,
    entry.raw?.tvName,
  )) || "Cable TV";
}

function electricityProviderCode(entry: any): string {
  const raw = entry.raw ?? {};
  const value = clean(firstValue(
    raw.disco_name, raw.discoName, raw.disco, raw.network_name, raw.networkName,
    raw.provider_name, raw.providerName, entry.name,
  )).toLowerCase();

  if (/knedc/.test(value)) return "knedc";
  if (/yedc/.test(value)) return "yedc";
  if (/jedc/.test(value)) return "jedc";
  if (/aedc/.test(value)) return "aedc";
  if (/ibedc/.test(value)) return "ibedc";
  if (/bedc/.test(value)) return "bedc";
  if (/ikedc|ikeja/.test(value)) return "ikedc";
  if (/ekedc|eko/.test(value)) return "ekedc";
  if (/phedc|port harcourt/.test(value)) return "phedc";
  if (/eedc|enugu/.test(value)) return "eedc";
  return clean(firstValue(
    raw.disco_code, raw.discoCode, raw.provider_code, raw.providerCode,
    raw.biller_code, raw.billerCode, entry.product_code,
  )).toLowerCase();
}

function electricityProviderName(entry: any): string {
  const raw = entry.raw ?? {};
  const value = clean(firstValue(
    raw.disco_name, raw.discoName, raw.disco, raw.network_name, raw.networkName,
    raw.provider_name, raw.providerName, entry.name,
  )).toLowerCase();

  if (/knedc/.test(value)) return "Kaduna Electric";
  if (/yedc/.test(value)) return "Yola Electric";
  if (/jedc/.test(value)) return "Jos Electric";
  if (/aedc/.test(value)) return "Abuja Electric";
  if (/ibedc/.test(value)) return "Ibadan Electric";
  if (/bedc/.test(value)) return "Benin Electric";
  if (/ikedc|ikeja/.test(value)) return "Ikeja Electric";
  if (/ekedc|eko/.test(value)) return "Eko Electric";
  if (/phedc|port harcourt/.test(value)) return "Port Harcourt Electric";
  if (/eedc|enugu/.test(value)) return "Enugu Electric";
  return clean(firstValue(
    raw.disco_name, raw.discoName, raw.disco, raw.provider_name, raw.providerName, entry.name,
  )) || "Electricity";
}

function groupedProviderCode(entry: any, service: Service): string {
  if (service === "cable") return cableProviderCode(entry);
  if (service === "electricity") return electricityProviderCode(entry);

  if (service === "education") {
    const raw = entry.raw ?? {};
    const name = `${clean(firstValue(
      raw.provider_name, raw.providerName, raw.education_type, raw.educationType,
      raw.exam_type, raw.examType, raw.exam, raw.type, entry.name,
    ))}`.toLowerCase();
    if (name.includes("waec")) return "waec";
    if (name.includes("neco")) return "neco";
    if (name.includes("nabteb")) return "nabteb";
    return clean(firstValue(
      raw.provider_code, raw.providerCode, raw.education_code, raw.educationCode,
      raw.biller_code, raw.billerCode, raw.provider_id, raw.providerId,
    )) || entry.product_code;
  }

  if (service === "internet") {
    const raw = entry.raw ?? {};
    return clean(firstValue(
      raw.provider_code, raw.providerCode, raw.biller_code, raw.billerCode,
      raw.service_id, raw.serviceId, raw.provider_id, raw.providerId,
      raw.isp_code, raw.ispCode, raw.network_code, raw.networkCode,
      raw.provider_name, raw.providerName, raw.isp, raw.isp_name,
    )) || entry.product_code;
  }

  return catalogBillerCode(entry, service);
}

function groupedProviderName(entry: any, service: Service): string {
  const raw = entry.raw ?? {};
  if (service === "electricity") return electricityProviderName(entry);
  if (service === "education") {
    const value = clean(firstValue(
      raw.provider_name, raw.providerName, raw.education_type, raw.educationType,
      raw.exam_type, raw.examType, raw.exam, raw.type, entry.name,
    ));
    if (/waec/i.test(value)) return "WAEC";
    if (/neco/i.test(value)) return "NECO";
    if (/nabteb/i.test(value)) return "NABTEB";
    return value || "Education";
  }
  if (service === "internet") {
    return clean(firstValue(
      raw.provider_name, raw.providerName, raw.isp_name, raw.ispName,
      raw.isp, raw.provider, raw.network_name, raw.networkName, entry.name,
    )) || "Internet Service";
  }
  if (service === "cable") return cableProviderName(entry);
  return clean(entry.name);
}

function billerFromEntry(entry: any, service: Service): Record<string, unknown> {
  const network = networkValue(entry.raw) || clean(entry.network);
  const code = catalogBillerCode(entry, service);
  const name = service === "airtime" || service === "data"
    ? network || itemName(entry.raw, entry.name)
    : service === "electricity"
      ? electricityProviderName(entry)
      : clean(firstValue(
          entry.raw.provider_name,
          entry.raw.providerName,
          entry.raw.disco_name,
          entry.raw.discoName,
          entry.raw.tv_name,
          entry.raw.tvName,
          entry.raw.edu_type,
          entry.raw.education_type,
          entry.name,
        ));

  return {
    id: code,
    code,
    biller_code: code,
    product_code: entry.product_code,
    name,
    display_name: name,
    network_name: network || null,
    network_code: clean(entry.network_code) || null,
    markup_percent: entry.markup_percent,
    percentage: entry.percentage,
    logo: service === "airtime" || service === "data" ? logoForNetwork(name) : null,
    disco: service === "electricity"
      ? clean(firstValue(entry.raw.disco, entry.raw.disco_name, entry.raw.network_name, entry.name)).toLowerCase()
      : undefined,
    meterTypes: service === "electricity"
      ? [
          { id: "prepaid", code: "prepaid", name: "Prepaid" },
          { id: "postpaid", code: "postpaid", name: "Postpaid" },
        ]
      : undefined,
    raw: entry.raw,
  };
}

function publicItem(entry: any, service: Service): Record<string, unknown> {
  return {
    id: entry.product_code,
    code: entry.product_code,
    item_code: entry.product_code,
    product_code: entry.product_code,
    plan_code: entry.product_code,
    name: entry.name,
    display_name: service === "data"
      ? clean(firstValue(entry.raw.display_name, entry.raw.displayName, entry.raw.size, entry.raw.data, entry.name)) || entry.name
      : entry.name,
    price: entry.selling_price,
    selling_price: entry.selling_price,
    amount: entry.selling_price,
    providerPrice: entry.provider_price,
    provider_amount: entry.provider_price,
    provider_price: entry.provider_price,
    markup_percent: entry.markup_percent,
    percentage: entry.percentage,
    networkName: entry.network || null,
    networkCode: entry.network_code || null,
    data_type: entry.data_type,
    dataCategory: entry.dataCategory,
    validityDays: entry.validityDays,
    validity_days: entry.validity_days,
    duration: entry.validityDays,
    validity: entry.validityDays ? `${entry.validityDays} days` : null,
    period: entry.period,
    minimum: entry.raw.minimum,
    maximum: entry.raw.maximum,
    min_amount: entry.raw.min_amount,
    max_amount: entry.raw.max_amount,
    raw: entry.raw,
  };
}

async function catalog(service: Service, code?: string): Promise<Record<string, unknown>> {
  const all = await loadCatalog();
  const entries = uniqueByCode(all.filter((entry) => entry.service === service));

  if (!entries.length) {
    throw new Error("No products are currently available for this service.");
  }

  if (service === "airtime") {
    const billers = entries.map((entry) => billerFromEntry(entry, service));
    return {
      success: true,
      service,
      billers,
      networks: billers,
      providers: billers,
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
      requires_verification: false,
    };
  }

  if (service === "data") {
    const networkEntries = entries.filter((entry) => {
      if (!code) return true;
      return (
        entry.product_code.toLowerCase() === code.toLowerCase() ||
        entry.network_code.toLowerCase() === code.toLowerCase() ||
        entry.network.toLowerCase() === code.toLowerCase()
      );
    });

    const networks = uniqueByCode(networkEntries.map((entry) => ({
      ...entry,
      product_code: entry.network_code || entry.network || entry.product_code,
      name: entry.network || entry.name,
    }))).map((entry) => billerFromEntry(entry, service));

    if (!code) {
      return {
        success: true,
        service,
        billers: networks,
        networks,
        providers: networks,
        items: [],
        plans: [],
        packages: [],
        amount_based: false,
        requires_verification: false,
      };
    }

    const items = networkEntries
      .filter((entry) => entry.provider_price > 0)
      .map((entry) => publicItem(entry, service));

    return {
      success: true,
      service,
      billers: networks,
      networks,
      providers: networks,
      items,
      plans: items,
      packages: items,
      amount_based: false,
      requires_verification: false,
    };
  }

  if (service === "electricity") {
    const discoGroups = new Map<string, any[]>();

    for (const entry of entries) {
      const discoCode = electricityProviderCode(entry);
      const group = discoGroups.get(discoCode) ?? [];
      group.push(entry);
      discoGroups.set(discoCode, group);
    }

    const billers = [...discoGroups.entries()].map(([discoCode, group]) => {
      const representative = group[0];
      const percentageEntry = group.find((entry) => numberValue(entry.markup_percent) > 0) ?? representative;
      const providerName = electricityProviderName(representative);

      return {
        ...billerFromEntry(representative, service),
        id: discoCode,
        code: discoCode,
        biller_code: discoCode,
        product_code: representative.product_code,
        name: providerName,
        display_name: providerName,
        markup_percent: percentageEntry.markup_percent,
        percentage: percentageEntry.percentage,
        plans_count: group.length,
        meterTypes: [
          { id: "prepaid", code: "prepaid", name: "Prepaid" },
          { id: "postpaid", code: "postpaid", name: "Postpaid" },
        ],
      };
    });

    if (!code) {
      return {
        success: true,
        service,
        billers,
        networks: billers,
        providers: billers,
        items: [],
        plans: [],
        packages: [],
        amount_based: true,
        requires_verification: true,
        meterTypes: [
          { id: "prepaid", code: "prepaid", name: "Prepaid" },
          { id: "postpaid", code: "postpaid", name: "Postpaid" },
        ],
      };
    }

    const normalizedCode = code.toLowerCase().trim();
    const selectedGroup = discoGroups.get(normalizedCode) ?? null;
    if (!selectedGroup?.length) {
      throw new Error("The selected electricity provider is no longer available.");
    }

    const selectedBiller = billers.find((biller) =>
      String(biller.code).toLowerCase() === normalizedCode
    ) ?? null;

    return {
      success: true,
      service,
      billers,
      networks: billers,
      providers: billers,
      selected_biller: selectedBiller,
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
      requires_verification: true,
      meterTypes: [
        { id: "prepaid", code: "prepaid", name: "Prepaid" },
        { id: "postpaid", code: "postpaid", name: "Postpaid" },
      ],
    };
  }

  if (service === "cable") {
    const providerGroups = new Map<string, any[]>();

    for (const entry of entries) {
      const providerCode = cableProviderCode(entry);
      const group = providerGroups.get(providerCode) ?? [];
      group.push(entry);
      providerGroups.set(providerCode, group);
    }

    const billers = [...providerGroups.entries()].map(([providerCode, group]) => {
      const representative = group[0];
      const providerName = cableProviderName(representative);
      const firstPrice = group.find((entry) => numberValue(entry.provider_price) > 0) ?? representative;

      return {
        ...billerFromEntry(representative, service),
        id: providerCode,
        code: providerCode,
        biller_code: providerCode,
        product_code: representative.product_code,
        name: providerName,
        display_name: providerName,
        markup_percent: firstPrice.markup_percent,
        percentage: firstPrice.percentage,
        plans_count: group.length,
      };
    });

    if (!code) {
      return {
        success: true,
        service,
        billers,
        networks: billers,
        providers: billers,
        items: [],
        plans: [],
        packages: [],
        amount_based: false,
        requires_verification: true,
      };
    }

    const normalizedCode = code.toLowerCase().trim();
    const selectedGroup = providerGroups.get(normalizedCode) ??
      [...providerGroups.entries()].find(([providerCode, group]) =>
        providerCode === normalizedCode ||
        group.some((entry) => entry.product_code.toLowerCase() === normalizedCode)
      )?.[1] ?? null;

    if (!selectedGroup?.length) {
      throw new Error("The selected cable provider is no longer available.");
    }

    const items = selectedGroup.map((entry) => publicItem(entry, service));
    const selectedProvider = billers.find((biller) =>
      String(biller.code).toLowerCase() === normalizedCode
    ) ?? billers.find((biller) =>
      selectedGroup.some((entry) => entry.product_code === biller.product_code)
    );

    return {
      success: true,
      service,
      billers,
      networks: billers,
      providers: billers,
      selected_biller: selectedProvider ?? null,
      items,
      plans: items,
      packages: items,
      amount_based: false,
      requires_verification: true,
    };
  }

  const filteredEntries = service === "education"
    ? entries.filter((entry) => {
        const label = `${entry.name} ${clean(firstValue(
          entry.raw?.provider_name, entry.raw?.providerName, entry.raw?.education_type,
          entry.raw?.educationType, entry.raw?.exam_type, entry.raw?.examType,
        ))}`.toLowerCase();
        return /waec|neco|nabteb/.test(label);
      })
    : entries;

  const billerMap = new Map<string, any>();
  for (const entry of filteredEntries) {
    const key = groupedProviderCode(entry, service).toLowerCase();
    if (!billerMap.has(key)) billerMap.set(key, entry);
  }
  const billerEntries = [...billerMap.values()];
  const billers = billerEntries.map((entry) => ({
    ...billerFromEntry(entry, service),
    code: groupedProviderCode(entry, service),
    id: groupedProviderCode(entry, service),
    biller_code: groupedProviderCode(entry, service),
    name: groupedProviderName(entry, service),
    display_name: groupedProviderName(entry, service),
  }));

  if (!code) {
    return {
      success: true,
      service,
      billers,
      networks: billers,
      providers: billers,
      items: [],
      plans: [],
      packages: [],
      amount_based: service === "electricity",
      requires_verification: service === "cable" || service === "electricity",
      meterTypes: service === "electricity"
        ? [
            { id: "prepaid", code: "prepaid", name: "Prepaid" },
            { id: "postpaid", code: "postpaid", name: "Postpaid" },
          ]
        : undefined,
    };
  }

  const selected = filteredEntries.filter((entry) => {
    const normalizedCode = code.toLowerCase();
    return (
      entry.product_code.toLowerCase() === normalizedCode ||
      groupedProviderCode(entry, service).toLowerCase() === normalizedCode ||
      catalogBillerCode(entry, service).toLowerCase() === normalizedCode ||
      clean(entry.raw.service_id).toLowerCase() === normalizedCode ||
      clean(entry.raw.provider_code).toLowerCase() === normalizedCode ||
      clean(entry.raw.biller_code).toLowerCase() === normalizedCode
    );
  });

  if (!selected.length) {
    throw new Error("The selected service option is no longer available.");
  }

  if (service === "electricity") {
    const first = selected[0];
    const selectedBiller = billerFromEntry(first, service);
    return {
      success: true,
      service,
      billers,
      networks: billers,
      providers: billers,
      selected_biller: selectedBiller,
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
      requires_verification: true,
      meterTypes: [
        { id: "prepaid", code: "prepaid", name: "Prepaid" },
        { id: "postpaid", code: "postpaid", name: "Postpaid" },
      ],
    };
  }

  const items = selected
    .filter((entry) => entry.provider_price > 0)
    .map((entry) => publicItem(entry, service));

  return {
    success: true,
    service,
    billers,
    networks: billers,
    providers: billers,
    items,
    plans: items,
    packages: items,
    amount_based: false,
    requires_verification: service === "cable",
  };
}

function findEntry(
  entries: any[],
  service: Service,
  code: string,
): any | null {
  const normalizedCode = code.toLowerCase();

  return entries.find((entry) =>
    entry.service === service &&
    (
      entry.product_code.toLowerCase() === normalizedCode ||
      clean(entry.raw.plan_id).toLowerCase() === normalizedCode ||
      clean(entry.raw.id).toLowerCase() === normalizedCode ||
      clean(entry.raw.code).toLowerCase() === normalizedCode
    )
  ) ?? null;
}

function findElectricityEntry(
  entries: any[],
  code: string,
  meterType: string,
): any | null {
  const normalizedCode = code.toLowerCase();
  const normalizedType = meterType.toLowerCase();
  const candidates = entries.filter((entry) => {
    if (entry.service !== "electricity") return false;
    const biller = catalogBillerCode(entry, "electricity").toLowerCase();
    return (
      entry.product_code.toLowerCase() === normalizedCode ||
      biller === normalizedCode ||
      clean(entry.raw.service_id).toLowerCase() === normalizedCode ||
      clean(entry.raw.provider_code).toLowerCase() === normalizedCode ||
      clean(entry.raw.biller_code).toLowerCase() === normalizedCode
    );
  });

  if (!candidates.length) return null;
  if (!normalizedType) return candidates[0];

  return candidates.find((entry) => {
    const label = `${entry.product_code} ${entry.name} ${clean(entry.raw.meter_type)} ${clean(entry.raw.type)}`.toLowerCase();
    return label.includes(normalizedType);
  }) || candidates[0];
}

async function verifyCustomer(
  service: Service,
  body: any,
): Promise<Record<string, unknown>> {
  const entries = await loadCatalog();
  const productCode = clean(pickBody(
    body,
    "product_code",
    "plan_code",
    "item_code",
    "biller_code",
    "billerCode",
  ));

  if (!productCode) {
    throw new Error("Please select the service option first.");
  }

  const meterType = clean(pickBody(body, "meter_type", "meterType")) || "prepaid";
  const selected = service === "electricity"
    ? findElectricityEntry(entries, productCode, meterType)
    : findEntry(entries, service, productCode);
  if (!selected) throw new Error("The selected service option is no longer available.");

  if (service === "cable") {
    const smartcard = clean(pickBody(
      body,
      "smartcard_number",
      "smartcardNumber",
      "smartcard",
      "iuc",
      "customer",
    ));

    if (!smartcard) throw new Error("SmartCard / IUC number is required.");

    const result = await zoedataPost("", {
      product_code: selected.product_code,
      smartcard_number: smartcard,
      action: "verify",
    });

    const data = asObject(result.body?.data);
    const success = result.ok && result.body?.status === true && !providerLooksFailed(result.body, result.ok);

    if (!success) {
      throw new Error(providerMessage(result.body) || "Cable customer verification failed.");
    }

    return {
      success: true,
      status: "success",
      message: "Customer verified successfully.",
      customer_name: clean(firstValue(data.name, data.customer_name, data.smartcard_name)),
      data,
      raw: result.body,
    };
  }

  if (service === "electricity") {
    const meter = clean(pickBody(
      body,
      "meter_number",
      "meterNumber",
      "meter_no",
      "meter",
      "customer",
    ));

    const amount = Math.max(50, numberValue(pickBody(body, "provider_amount", "amount")) || 50);
    const userReference = clean(pickBody(body, "user_reference", "userReference")) || `VERIFY_${crypto.randomUUID()}`;

    if (!meter) throw new Error("Meter number is required.");

    const result = await zoedataPost("", {
      product_code: selected.product_code,
      meter_number: meter,
      amount: String(amount),
      user_reference: userReference,
      action: "verify",
    });

    const data = asObject(result.body?.data);
    const success = result.ok && result.body?.status === true && !providerLooksFailed(result.body, result.ok);

    if (!success) {
      throw new Error(providerMessage(result.body) || "Meter verification failed.");
    }

    return {
      success: true,
      status: "success",
      message: "Meter verified successfully.",
      customer_name: clean(firstValue(data.name, data.customer_name, data.meter_name)),
      data,
      raw: result.body,
    };
  }

  throw new Error("Verification is not supported for this service.");
}

function callbackUrl(): string | null {
  const explicit = Deno.env.get("ZOEDATA_CALLBACK_URL")?.trim();
  if (explicit) return explicit;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) return null;

  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/peyflex-services?action=callback`;
}

function processingMode(): string {
  const value = Deno.env.get("ZOEDATA_PROCESSING_MODE")?.trim();
  return ["async", "async_wait", "async_wait_20"].includes(value || "")
    ? value!
    : "async_wait";
}

function providerAmountForFixed(entry: any): number {
  return numberValue(entry.provider_price);
}

async function purchase(
  admin: any,
  user: any,
  service: Service,
  body: any,
): Promise<Record<string, unknown>> {
  const entries = await loadCatalog();

  const phone = normalizePhone(pickBody(
    body,
    "phone_number",
    "phoneNumber",
    "phone",
    "customer",
  ));

  if (["airtime", "data", "education"].includes(service) && !validPhone(phone)) {
    throw new Error("Please provide a valid Nigerian phone number.");
  }

  const selectedCode = clean(pickBody(
    body,
    "product_code",
    "plan_code",
    "item_code",
    "itemCode",
  ));

  let selected: any | null = null;
  let providerAmount = 0;
  let sellingAmount = 0;
  let providerRequest: Record<string, unknown>;

  if (service === "airtime" || service === "electricity") {
    const billerCode = clean(pickBody(
      body,
      "biller_code",
      "billerCode",
      "product_code",
      "plan_code",
    ));

    selected = service === "electricity"
      ? findElectricityEntry(
          entries,
          billerCode,
          clean(pickBody(body, "meter_type", "meterType")) || "prepaid",
        )
      : findEntry(entries, service, billerCode);
    if (!selected) throw new Error("The selected service option is no longer available.");

    providerAmount = numberValue(pickBody(
      body,
      "provider_amount",
      "providerAmount",
      "amount",
    ));

    if (providerAmount <= 0) throw new Error("Please enter a valid amount.");

    sellingAmount = roundUp50(
      providerAmount,
      numberValue(selected.markup_percent),
    );
  } else {
    if (!selectedCode) throw new Error("Please select a valid product.");

    selected = findEntry(entries, service, selectedCode);
    if (!selected) throw new Error("The selected product is no longer available.");

    const quantity = service === "education"
      ? Math.max(1, Math.floor(numberValue(pickBody(body, "quantity")) || 1))
      : 1;

    providerAmount = providerAmountForFixed(selected) * quantity;
    if (providerAmount <= 0) throw new Error("The selected product does not have a valid provider price.");

    sellingAmount = roundUp50(
      providerAmount,
      numberValue(selected.markup_percent),
    );

    const clientSellingAmount = numberValue(pickBody(body, "selling_amount", "amount"));
    if (
      clientSellingAmount <= 0 ||
      Math.abs(clientSellingAmount - sellingAmount) > 0.01
    ) {
      throw new Error("The selected product price has changed. Please reload the service and try again.");
    }
  }

  if (service === "airtime") {
    providerRequest = {
      product_code: selected.product_code,
      phone_number: phone,
      amount: String(providerAmount),
      action: "vend",
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  } else if (service === "data") {
    providerRequest = {
      product_code: selected.product_code,
      phone_number: phone,
      action: "vend",
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  } else if (service === "cable") {
    const smartcard = clean(pickBody(
      body,
      "smartcard_number",
      "smartcardNumber",
      "smartcard",
      "iuc",
      "customer",
    ));

    const cablePhone = normalizePhone(pickBody(body, "phone", "phone_number") || user.phone);
    if (!smartcard) throw new Error("SmartCard / IUC number is required.");
    if (!validPhone(cablePhone)) throw new Error("A valid Nigerian phone number is required.");

    providerRequest = {
      product_code: selected.product_code,
      phone_number: cablePhone,
      smartcard_number: smartcard,
      amount: String(providerAmount),
      action: "vend",
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  } else if (service === "electricity") {
    const meter = clean(pickBody(
      body,
      "meter_number",
      "meterNumber",
      "meter_no",
      "meter",
      "customer",
    ));

    if (!meter) throw new Error("Meter number is required.");

    providerRequest = {
      product_code: selected.product_code,
      meter_number: meter,
      amount: String(providerAmount),
      action: "vend",
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  } else if (service === "internet") {
    const customerIdentifier = clean(pickBody(
      body,
      "customer",
      "account_number",
      "accountNumber",
      "customer_id",
      "customerId",
      "subscriber_number",
      "subscriberNumber",
    ));
    if (customerIdentifier.length < 3) {
      throw new Error("Please provide a valid internet account number.");
    }

    const quantity = Math.max(
      1,
      Math.floor(numberValue(pickBody(body, "quantity")) || 1),
    );

    providerRequest = {
      product_code: selected.product_code,
      customer: customerIdentifier,
      account_number: customerIdentifier,
      phone_number: validPhone(phone) ? phone : undefined,
      action: "vend",
      quantity,
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  } else {
    const quantity = Math.max(
      1,
      Math.floor(numberValue(pickBody(body, "quantity")) || 1),
    );

    providerRequest = {
      product_code: selected.product_code,
      phone_number: phone,
      action: "vend",
      quantity,
      user_reference: "PENDING_REFERENCE",
      processing_mode: processingMode(),
      ...(callbackUrl() ? { callback: callbackUrl() } : {}),
    };
  }

  if (sellingAmount <= 0) throw new Error("A valid payment amount is required.");

  const suppliedIdempotencyKey = clean(
    pickBody(body, "idempotency_key", "idempotencyKey"),
  );
  const reference = suppliedIdempotencyKey
    ? `VTU_${suppliedIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 70)}`
    : `VTU_${crypto.randomUUID()}`;
  const idempotencyKey = suppliedIdempotencyKey || reference;

  const metadata: Record<string, unknown> = {
    service,
    provider: "zoedata",
    provider_id: "zoedata",
    customer: phone || null,
    selling_amount: sellingAmount,
    provider_amount: providerAmount,
    markup_percent: numberValue(selected?.markup_percent),
    selected_item: selected,
    provider_request: { ...providerRequest, user_reference: reference },
    request_id: reference,
    user_reference: reference,
    reconciliation_required: true,
  };

  const { data: debitResult, error: debitError } = await admin.rpc("debit_wallet", {
    _user_id: user.id,
    _amount: sellingAmount,
    _description: `${service} purchase`,
    _idempotency_key: idempotencyKey,
    _reference: reference,
    _category: "bill_payment",
    _metadata: metadata,
  });

  if (debitError) {
    console.error("ZOEDATA wallet debit error:", debitError);
    throw new Error("Unable to process the payment from your wallet.");
  }

  const localTransactionId = debitResult?.id ?? null;
  if (!localTransactionId) {
    throw new Error("Wallet debit did not return a transaction.");
  }

  const finalProviderRequest = {
    ...providerRequest,
    user_reference: reference,
  };

  await updateTransaction(admin, user.id, reference, {
    provider: "zoedata",
    provider_reference: reference,
    metadata: {
      ...metadata,
      provider_request: finalProviderRequest,
    },
  });

  let result: any;
  try {
    result = await zoedataPost("", finalProviderRequest);
  } catch (error) {
    console.error("ZOEDATA request exception:", error);

    await updateTransaction(admin, user.id, reference, {
      status: "pending",
      provider: "zoedata",
      provider_reference: reference,
      metadata: {
        ...metadata,
        provider_request: finalProviderRequest,
        provider_request_exception: true,
        reconciliation_required: true,
      },
    });

    return {
      success: true,
      status: "pending",
      reference,
      transaction_id: localTransactionId,
      message: "Your payment was sent for processing and is being verified.",
    };
  }

  const data = asObject(result.body?.data);
  const rechargeId = clean(firstValue(
    data.recharge_id,
    result.body?.recharge_id,
    data.order_id,
    result.body?.order_id,
  ));
  const providerRef = rechargeId || providerReference(result.body) || reference;
  const status = normalizeStatus(result.body);
  const safeResponse = result.body;

  if (providerLooksSuccessful(result.body, result.ok)) {
    await updateTransaction(admin, user.id, reference, {
      status: "completed",
      provider: "zoedata",
      provider_reference: providerRef,
      completed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        zoedata_status: status,
        zoedata_response: safeResponse,
        recharge_id: rechargeId || null,
        reconciliation_required: false,
      },
    });

    return {
      success: true,
      status: "successful",
      reference,
      transaction_id: localTransactionId,
      provider_reference: providerRef,
      recharge_id: rechargeId || null,
      message: providerMessage(result.body) || "Purchase completed successfully.",
      fulfillment: safeResponse,
    };
  }

  if (providerLooksFailed(result.body, result.ok)) {
    const reason = providerMessage(result.body) || "The service purchase failed.";
    const refund = await refundTransaction(
      admin,
      user.id,
      reference,
      sellingAmount,
      reason,
      {
        ...metadata,
        zoedata_status: status,
        zoedata_response: safeResponse,
        recharge_id: rechargeId || null,
      },
    );

    await updateTransaction(admin, user.id, reference, {
      status: "failed",
      provider: "zoedata",
      provider_reference: providerRef,
      metadata: {
        ...metadata,
        zoedata_status: status,
        zoedata_response: safeResponse,
        recharge_id: rechargeId || null,
        refunded: refund.success,
        refund_pending: !refund.success,
        reconciliation_required: !refund.success,
      },
    });

    if (!refund.success) {
      return {
        success: false,
        status: "failed",
        reference,
        transaction_id: localTransactionId,
        error: "The purchase failed, but the automatic refund requires retry.",
        refund_pending: true,
      };
    }

    return {
      success: false,
      status: "failed",
      reference,
      transaction_id: localTransactionId,
      error: reason,
      refunded: true,
    };
  }

  await updateTransaction(admin, user.id, reference, {
    status: "pending",
    provider: "zoedata",
    provider_reference: providerRef,
    metadata: {
      ...metadata,
      zoedata_status: status,
      zoedata_response: safeResponse,
      recharge_id: rechargeId || null,
      reconciliation_required: true,
    },
  });

  return {
    success: true,
    status: "pending",
    reference,
    transaction_id: localTransactionId,
    provider_reference: providerRef,
    recharge_id: rechargeId || null,
    message: providerMessage(result.body) || "Your payment is being processed and will be verified.",
  };
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
) {
  const { error } = await admin
    .from("transactions")
    .update(updates)
    .eq("user_id", userId)
    .eq("reference_number", reference);

  if (error) console.error("ZOEDATA transaction update failed:", error);
  return !error;
}

async function updateTransactionByReference(
  admin: any,
  reference: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from("transactions")
    .select("id,user_id,status,amount,metadata,provider_reference")
    .eq("reference_number", reference)
    .maybeSingle();

  if (error || !data) {
    console.error("ZOEDATA callback transaction lookup failed:", error);
    return null;
  }

  const { error: updateError } = await admin
    .from("transactions")
    .update(updates)
    .eq("id", data.id);

  if (updateError) {
    console.error("ZOEDATA callback transaction update failed:", updateError);
    return null;
  }

  return data;
}

async function refundTransaction(
  admin: any,
  userId: string,
  reference: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown>,
) {
  const refundReference = `REFUND_${reference}`;

  const { data, error } = await admin.rpc("refund_wallet", {
    _user_id: userId,
    _amount: amount,
    _description: "ZOEDATA service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: {
      ...metadata,
      original_reference: reference,
      refund_reference: refundReference,
      provider: "zoedata",
      reason,
    },
  });

  return {
    success: !error,
    data,
    error: error?.message ?? null,
  };
}

async function callbackHandler(req: Request): Promise<Response> {
  let payload: any = {};

  const contentType = req.headers.get("content-type")?.toLowerCase() || "";

  try {
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      payload = Object.fromEntries((form as any).entries());
    } else {
      const raw = await req.text();
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = Object.fromEntries((new URLSearchParams(raw) as any).entries());
      }
    }
  } catch (error) {
    console.error("ZOEDATA callback parse error:", error);
    return json({ success: false, error: "Invalid callback payload." }, 400);
  }

  const reference = clean(firstValue(
    payload.user_reference,
    payload.userReference,
    payload.reference,
  ));

  if (!reference) {
    return json({ success: false, error: "user_reference is required." }, 400);
  }

  const admin = adminClient();
  const existing = await admin
    .from("transactions")
    .select("id,user_id,status,amount,metadata,provider_reference")
    .eq("reference_number", reference)
    .maybeSingle();

  if (existing.error || !existing.data) {
    console.error("ZOEDATA callback transaction not found:", existing.error);
    return json({ success: false, error: "Transaction not found." }, 404);
  }

  const transaction = existing.data;
  const status = clean(firstValue(
    payload.status,
    payload.pay_status,
    payload.off_status,
  )).toUpperCase();

  const rechargeId = clean(firstValue(
    payload.recharge_id,
    payload.order_id,
  ));

  const callbackMetadata = {
    ...(asObject(transaction.metadata)),
    zoedata_callback: payload,
    recharge_id: rechargeId || null,
    callback_received_at: new Date().toISOString(),
  };

  if (["DONE", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(status)) {
    if (transaction.status === "completed") {
      return json({ success: true, duplicate: true, status: "completed" });
    }

    await admin
      .from("transactions")
      .update({
        status: "completed",
        provider: "zoedata",
        provider_reference: rechargeId || transaction.provider_reference || reference,
        completed_at: new Date().toISOString(),
        metadata: {
          ...callbackMetadata,
          reconciliation_required: false,
        },
      })
      .eq("id", transaction.id);

    return json({ success: true, status: "completed", reference });
  }

  if (["FAILED", "FAILURE", "DECLINED", "REJECTED", "CANCELLED", "CANCELED"].includes(status)) {
    if (transaction.status === "failed") {
      return json({ success: true, duplicate: true, status: "failed" });
    }

    const refund = await refundTransaction(
      admin,
      transaction.user_id,
      reference,
      numberValue(transaction.amount),
      providerMessage(payload) || "ZOEDATA transaction failed.",
      callbackMetadata,
    );

    await admin
      .from("transactions")
      .update({
        status: "failed",
        provider: "zoedata",
        provider_reference: rechargeId || transaction.provider_reference || reference,
        metadata: {
          ...callbackMetadata,
          refunded: refund.success,
          refund_pending: !refund.success,
          reconciliation_required: !refund.success,
        },
      })
      .eq("id", transaction.id);

    return json({
      success: true,
      status: "failed",
      reference,
      refunded: refund.success,
    });
  }

  await admin
    .from("transactions")
    .update({
      status: "pending",
      provider: "zoedata",
      provider_reference: rechargeId || transaction.provider_reference || reference,
      metadata: {
        ...callbackMetadata,
        reconciliation_required: true,
      },
    })
    .eq("id", transaction.id);

  return json({ success: true, status: "pending", reference });
}

async function transactionStatus(body: any) {
  const orderId = clean(pickBody(
    body,
    "order_id",
    "recharge_id",
    "provider_reference",
  ));

  if (!orderId) throw new Error("order_id or recharge_id is required.");

  const result = await zoedataPost("", {
    order_id: numberValue(orderId) || orderId,
    action: "status",
  });

  if (!result.ok || result.body?.status !== true) {
    throw new Error(providerMessage(result.body) || "Unable to fetch ZOEDATA transaction status.");
  }

  const data = asObject(result.body?.data);
  return {
    success: true,
    status: clean(firstValue(data.status, data.text_status)).toLowerCase() || "pending",
    data,
    raw: result.body,
  };
}

async function accountBalance() {
  const result = await zoedataPost("", { action: "balance" });

  if (!result.ok || result.body?.status !== true) {
    throw new Error(providerMessage(result.body) || "Unable to fetch provider balance.");
  }

  return {
    success: true,
    data: result.body?.data ?? result.body,
  };
}

async function processCallbackRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = Deno.env.get("ZOEDATA_CALLBACK_SECRET")?.trim();
  if (token) {
    const supplied = url.searchParams.get("token") || req.headers.get("x-zoedata-callback-secret") || "";
    if (supplied !== token) {
      return json({ success: false, error: "Unauthorized callback." }, 401);
    }
  }

  return callbackHandler(req);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const queryAction = clean(url.searchParams.get("action")).toLowerCase();

  // ZOEDATA calls the callback without a Supabase user session.
  if (CALLBACK_ACTIONS.has(queryAction)) {
    return processCallbackRequest(req);
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const user = await getUser(req);
    if (!user) {
      return json({ success: false, error: "Authentication required." }, 401);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Invalid JSON request body." }, 400);
    }

    const action = clean(body?.action || "catalog").toLowerCase();

    if (action === "transaction_status" || action === "requery") {
      return json(await transactionStatus(body));
    }

    if (action === "balance" || action === "account_balance") {
      return json(await accountBalance());
    }

    const service = serviceOf(body?.service);
    if (!service || !SUPPORTED.has(service)) {
      return json({ success: false, error: "This service is not available." }, 400);
    }

    if ([
      "catalog",
      "get_catalog",
      "billers",
      "networks",
      "providers",
      "plans",
      "items",
      "get_billers",
    ].includes(action)) {
      const code = clean(pickBody(
        body,
        "biller_code",
        "billerCode",
        "product_code",
        "service_id",
        "serviceId",
        "network",
      ));

      return json(await catalog(service, code || undefined));
    }

    if (["verify", "validate", "verify_customer"].includes(action)) {
      return json(await verifyCustomer(service, body));
    }

    if (["pay", "purchase", "service", "vend"].includes(action)) {
      return json(await purchase(adminClient(), user, service, body));
    }

    return json({ success: false, error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("ZOEDATA services error:", error);
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Unable to process service request.",
    }, 400);
  }
});
