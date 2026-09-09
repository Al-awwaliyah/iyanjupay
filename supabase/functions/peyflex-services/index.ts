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
  roundSellingPrice,
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
 *   1. ZOEDATA_CATALOG_JSON — JSON catalogue containing product_code,
 *      price and percentage/markup_percent values from the ZOEDATA Plan ID
 *      catalogue.
 *   2. ZOEDATA_CATALOG_URL — optional authenticated JSON URL returning the
 *      same catalogue. It is used when ZOEDATA_CATALOG_JSON is absent.
 *   3. If neither exists, the function asks the ZOEDATA API with
 *      { action: "get_available_services" } and attempts to normalize a
 *      returned catalogue. This is intentionally defensive because the
 *      supplied ZOEDATA documentation does not document a dedicated public
 *      catalogue endpoint.
 *
 * Pricing:
 *   selling = provider price + catalogue percentage markup,
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
    selling_price: provider > 0 ? roundSellingPrice(provider, percentage) : 0,
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

let catalogCache: { expires: number; entries: any[] } | null = null;

function fallbackEducationCatalog(): any[] {
  return [
    {
      service: "education",
      product_code: "426",
      code: "426",
      id: "426",
      name: "WAEC PIN",
      display_name: "WAEC PIN",
      provider_price: 5100,
      price: 5100,
      providerPrice: 5100,
      provider_amount: 5100,
      markup_percent: 0,
      percentage: 0,
      selling_price: roundSellingPrice(5100, 0),
      raw: { id: 426, product_code: "426", name: "WAEC PIN", education_type: "WAEC" },
    },
    {
      service: "education",
      product_code: "454",
      code: "454",
      id: "454",
      name: "NECO PIN",
      display_name: "NECO PIN",
      provider_price: 2200,
      price: 2200,
      providerPrice: 2200,
      provider_amount: 2200,
      markup_percent: 0,
      percentage: 0,
      selling_price: roundSellingPrice(2200, 0),
      raw: { id: 454, product_code: "454", name: "NECO PIN", education_type: "NECO" },
    },
    {
      service: "education",
      product_code: "705",
      code: "705",
      id: "705",
      name: "NABTEB PIN",
      display_name: "NABTEB PIN",
      provider_price: 855,
      price: 855,
      providerPrice: 855,
      provider_amount: 855,
      markup_percent: 0,
      percentage: 0,
      selling_price: roundSellingPrice(855, 0),
      raw: { id: 705, product_code: "705", name: "NABTEB PIN", education_type: "NABTEB" },
    },
  ];
}

async function loadCatalog(): Promise<any[]> {
  if (catalogCache && catalogCache.expires > Date.now()) {
    return catalogCache.entries;
  }

  const rawJson = Deno.env.get("ZOEDATA_CATALOG_JSON")?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const entries = normalizeCatalogPayload(parsed);
      if (entries.length) {
        const merged = [...entries, ...fallbackEducationCatalog()];
        catalogCache = { expires: Date.now() + 60_000, entries: merged };
        return merged;
      }
    } catch (error) {
      console.error("Invalid ZOEDATA_CATALOG_JSON:", error);
    }
  }

  const catalogUrl = Deno.env.get("ZOEDATA_CATALOG_URL")?.trim();
  if (catalogUrl) {
    try {
      const result = await zoedataGet(catalogUrl);
      if (result.ok) {
        const entries = normalizeCatalogPayload(result.body);
        if (entries.length) {
          const merged = [...entries, ...fallbackEducationCatalog()];
          catalogCache = { expires: Date.now() + 60_000, entries: merged };
          return merged;
        }
      }
    } catch (error) {
      console.error("ZOEDATA catalog URL error:", error);
    }
  }

  try {
    const result = await zoedataPost("", { action: "get_available_services" });
    const entries = normalizeCatalogPayload(result.body);
    if (entries.length) {
      const merged = [...entries, ...fallbackEducationCatalog()];
      catalogCache = { expires: Date.now() + 60_000, entries: merged };
      return merged;
    }
  } catch (error) {
    console.error("ZOEDATA available-services error:", error);
  }

  throw new Error(
    "ZOEDATA catalogue is unavailable. Configure ZOEDATA_CATALOG_JSON or ZOEDATA_CATALOG_URL with the current Plan ID catalogue.",
  );
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

function groupedProviderCode(entry: any, service: Service): string {
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
  return clean(entry.name);
}

function billerFromEntry(entry: any, service: Service): Record<string, unknown> {
  const network = networkValue(entry.raw) || clean(entry.network);
  const code = catalogBillerCode(entry, service);
  const name = service === "airtime" || service === "data"
    ? network || itemName(entry.raw, entry.name)
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

    sellingAmount = roundSellingPrice(
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

    sellingAmount = roundSellingPrice(
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
