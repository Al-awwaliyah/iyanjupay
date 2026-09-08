import {
  asArray,
  asObject,
  firstValue,
  normalizeStatus,
  numberValue,
  peyflexGet,
  peyflexPost,
  peyflexPublicGet,
  providerLooksFailed,
  providerLooksSuccessful,
  providerMessage,
  providerReference,
  roundSellingPrice,
  text,
} from "../_shared/peyflex.ts";

import {
  adminClient,
  corsHeaders,
  getUser,
  json,
} from "../_shared/auth.ts";

/**
 * IyanjuPay — Peyflex Services
 *
 * Customer-facing services supported from the supplied Peyflex documentation:
 *   airtime
 *   data
 *   cable
 *   electricity
 *   education
 *   airtime-card / recharge-card
 *
 * Betting and OTP/virtual-number services are intentionally NOT exposed here.
 *
 * Pricing:
 *   airtime = 0%
 *   all other supported services = 10%
 *   final selling price rounds UP to the nearest ₦5.
 *
 * The frontend never selects Peyflex directly. It talks to this function.
 */

type Service =
  | "airtime"
  | "data"
  | "cable"
  | "electricity"
  | "education"
  | "airtime-card"
  | "data-card"
  | "recharge-card";

const SUPPORTED = new Set<Service>([
  "airtime",
  "data",
  "cable",
  "electricity",
  "education",
  "airtime-card",
  "data-card",
  "recharge-card",
]);

const STANDARD_MARKUP = 0.10;

function clean(value: unknown): string {
  return text(value).trim();
}

function serviceOf(value: unknown): Service | null {
  const valueText = clean(value).toLowerCase();

  const aliases: Record<string, Service> = {
    airtime: "airtime",
    data: "data",
    cable: "cable",
    cabletv: "cable",
    "cable-tv": "cable",
    electricity: "electricity",
    education: "education",
    waec: "education",
    "airtime-card": "airtime-card",
    "airtime_epin": "airtime-card",
    "airtime-epin": "airtime-card",
    "data-card": "data-card",
    "data_epin": "data-card",
    "data-epin": "data-card",
    "recharge-card": "recharge-card",
    recharge: "recharge-card",
    epin: "recharge-card",
  };

  return aliases[valueText] ?? null;
}

function bodyObject(body: any): Record<string, any> {
  return asObject(body);
}

function pickBody(body: any, ...keys: string[]): unknown {
  const obj = bodyObject(body);
  const details = asObject(obj.details);

  for (const key of keys) {
    const direct = obj[key];
    if (direct !== undefined && direct !== null && clean(direct) !== "") {
      return direct;
    }

    const detailValue = details[key];
    if (
      detailValue !== undefined &&
      detailValue !== null &&
      clean(detailValue) !== ""
    ) {
      return detailValue;
    }
  }

  return undefined;
}

function networkCode(value: unknown): string {
  const key = clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

  if (key === "mtn" || key.includes("mtn")) return "mtn";
  if (key === "glo" || key.includes("glo")) return "glo";
  if (key.includes("airtel")) return "airtel";
  if (key.includes("9mobile") || key.includes("etisalat")) return "9mobile";

  return clean(value);
}

function normalizePhone(value: unknown): string {
  const raw = clean(value).replace(/[\s()-]/g, "");

  if (/^\+234\d{10}$/.test(raw)) return raw.slice(1);
  if (/^234\d{10}$/.test(raw)) return raw;
  if (/^0\d{10}$/.test(raw)) return `234${raw.slice(1)}`;

  return raw;
}

function validPhone(value: string): boolean {
  return /^234\d{10}$/.test(value);
}

function itemId(item: any): string {
  return clean(
    firstValue(
      item.id,
      item.ID,
      item.code,
      item.Code,
      item.plan_id,
      item.planId,
      item.plan_code,
      item.planCode,
      item.identifier,
    ),
  );
}

function customerNetworkName(value: unknown): string {
  const raw = clean(value);
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (key.includes("mtn")) return "MTN";
  if (key.includes("glo")) return "GLO";
  if (key.includes("airtel")) return "AIRTEL";
  if (key.includes("9mobile") || key.includes("etisalat")) return "9MOBILE";

  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(sme|awoof|direct|direct\s+data|gifting|gift|corporate|business|promo|promotion|bonus)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanDataPlanLabel(value: unknown): string {
  let label = clean(value)
    .replace(/\s+/g, " ")
    .trim();

  // Peyflex plan IDs sometimes arrive as values such as M23mbs or M1GBS.
  // Those are identifiers, not customer-facing plan names.
  const compact = label.replace(/\s+/g, "");
  const codeSize = compact.match(
    /^m?(\d+(?:\.\d+)?)(kb|kbs|mb|mbs|gb|gbs|tb|tbs)$/i,
  );
  if (codeSize) {
    return `${codeSize[1]} ${codeSize[2].replace(/s$/i, "").toUpperCase()}`;
  }

  const embeddedSize = label.match(
    /(\d+(?:\.\d+)?)\s*(KB|KBS|MB|MBS|GB|GBS|TB|TBS)\b/i,
  );
  if (embeddedSize) {
    return `${embeddedSize[1]} ${embeddedSize[2].replace(/s$/i, "").toUpperCase()}`;
  }

  return label
    .replace(/\b(sme|awoof|direct|direct\s+data|gifting|gift|corporate|business|promo|promotion|bonus|hot\s*deal|hot)\b/gi, "")
    .replace(/\s*[-|–—]\s*/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function itemName(item: any): string {
  return clean(
    firstValue(
      item.name,
      item.Name,
      item.title,
      item.Title,
      item.plan_name,
      item.planName,
      item.product_name,
      item.productName,
      item.description,
      item.Description,
      itemId(item),
    ),
  );
}

function itemPrice(item: any): number {
  return numberValue(
    firstValue(
      item.price,
      item.Price,
      item.amount,
      item.Amount,
      item.cost,
      item.Cost,
      item.selling_price,
      item.sellingPrice,
      item.provider_amount,
      item.providerAmount,
      item.plan_amount,
      item.planAmount,
    ),
  );
}

function itemProviderPrice(item: any): number {
  const direct = numberValue(
    firstValue(
      item.provider_price,
      item.providerPrice,
      item.provider_amount,
      item.providerAmount,
      item.cost_price,
      item.costPrice,
      item.cost,
      item.buy_price,
      item.buyPrice,
    ),
  );
  return direct > 0 ? direct : itemPrice(item);
}

function catalogueArray(body: any, ...preferredKeys: string[]): any[] {
  const root = bodyObject(body);

  const collect = (value: any, depth = 0, seen = new Set<any>()): any[] => {
    if (depth > 5 || value === null || value === undefined) return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== "object") return [];
    if (seen.has(value)) return [];
    seen.add(value);

    const obj = bodyObject(value);
    const directKeys = [
      "results",
      "data",
      "items",
      "plans",
      "providers",
      "networks",
      "billers",
      "options",
      "packages",
      "products",
      "available_plans",
      "daily",
      "weekly",
      "monthly",
      "hot_deals",
      "hotDeals",
      "extra_night",
      "extraNight",
      "night",
      "other",
    ];

    const combined: any[] = [];
    const add = (values: any[]) => {
      for (const value of values) {
        if (!combined.includes(value)) combined.push(value);
      }
    };

    for (const key of directKeys) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        add(candidate);
        continue;
      }
      if (candidate && typeof candidate === "object") {
        add(collect(candidate, depth + 1, seen));
      }
    }

    return combined;
  };

  for (const key of preferredKeys) {
    const candidate = root[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = collect(candidate);
      if (nested.length) return nested;
    }
  }

  return collect(root);
}

function electricityProvider(item: any): Record<string, unknown> {
  const raw = bodyObject(item);
  const code = clean(firstValue(
    raw.identifier,
    raw.plan,
    raw.plan_id,
    raw.planId,
    raw.code,
    raw.id,
    raw.provider_code,
    raw.providerCode,
    raw.biller_code,
    raw.billerCode,
  ));
  const name = clean(firstValue(
    raw.name,
    raw.Name,
    raw.provider_name,
    raw.providerName,
    raw.biller_name,
    raw.billerName,
    raw.title,
    raw.description,
    code,
  ));
  const meterTypes = asArray(firstValue(
    raw.meter_types,
    raw.meterTypes,
    raw.serviceProviders,
    raw.service_providers,
  ));

  return {
    id: code,
    code,
    identifier: code,
    name,
    meter_types: meterTypes.length ? meterTypes : [
      { id: "prepaid", code: "prepaid", name: "Prepaid" },
      { id: "postpaid", code: "postpaid", name: "Postpaid" },
    ],
    meterTypes: meterTypes.length ? meterTypes : [
      { id: "prepaid", code: "prepaid", name: "Prepaid" },
      { id: "postpaid", code: "postpaid", name: "Postpaid" },
    ],
    logo: clean(firstValue(raw.logo, raw.logo_url, raw.logoUrl, raw.image, raw.image_url)) || null,
    raw,
  };
}

function itemValidity(item: any): number | null {
  const candidates = [
    item.validity_days,
    item.validityDays,
    item.duration_days,
    item.durationDays,
    item.duration,
    item.validity,
    item.validity_period,
    item.validityPeriod,
    item.period,
    item.plan_period,
    item.planPeriod,
    item.plan_type,
    item.planType,
    itemName(item),
    itemId(item),
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;

    const match = clean(candidate).match(
      /(?:^|\s)(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)(?:\s|$)/i,
    );
    if (!match) continue;

    const count = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("week")) return count * 7;
    if (unit.startsWith("month")) return count * 30;
    return count;
  }

  return null;
}

function publicItem(
  item: any,
  service: Service,
  fallbackNetwork = "",
): Record<string, unknown> {
  const raw = bodyObject(item);
  const code = itemId(raw);
  const providerPrice = itemProviderPrice(raw);
  const markupRate = service === "airtime" ? 0 : STANDARD_MARKUP;
  const price = providerPrice > 0
    ? roundSellingPrice(providerPrice, markupRate)
    : 0;

  const network = clean(
    firstValue(
      raw.network,
      raw.network_id,
      raw.networkId,
      raw.network_code,
      raw.networkCode,
      fallbackNetwork,
    ),
  );

  const validity = itemValidity(raw);

  return {
    id: code,
    code,
    name: itemName(raw),
    display_name: cleanDataPlanLabel(firstValue(
      raw.display_name,
      raw.displayName,
      raw.plan_name,
      raw.planName,
      raw.name,
      raw.title,
      raw.description,
      code,
    )),
    price,
    providerPrice,
    amount: price,
    provider_amount: providerPrice,
    networkCode: networkCode(network),
    networkName: network || null,
    validityDays: validity,
    validity_days: validity,
    duration: validity,
    validity: validity ? `${validity} days` : null,
    plan_type: clean(
      firstValue(
        raw.plan_type,
        raw.planType,
        raw.type,
        raw.category,
      ),
    ) || null,
    period: clean(
      firstValue(
        raw.period,
        raw.validity_period,
      ),
    ) || null,
    raw,
  };
}

function publicProvider(item: any, service?: Service): Record<string, unknown> {
  const raw = bodyObject(item);
  const code = clean(
    firstValue(
      raw.identifier,
      raw.code,
      raw.Code,
      raw.id,
      raw.ID,
      raw.provider_code,
      raw.providerCode,
    ),
  );

  return {
    id: code,
    code,
    name: service === "data" || service === "airtime"
      ? customerNetworkName(firstValue(
          raw.name,
          raw.Name,
          raw.title,
          raw.Title,
          raw.provider_name,
          raw.providerName,
          code,
        ))
      : clean(
          firstValue(
            raw.name,
            raw.Name,
            raw.title,
            raw.Title,
            raw.provider_name,
            raw.providerName,
            code,
          ),
        ),
    logo: clean(
      firstValue(
        raw.logo,
        raw.logo_url,
        raw.logoUrl,
        raw.image,
        raw.image_url,
      ),
    ) || null,
    raw,
  };
}

async function catalog(service: Service, code?: string) {
  if (service === "airtime") {
    const result = await peyflexPublicGet("/api/airtime/networks/");
    const networks = catalogueArray(result.body, "networks", "providers", "billers").map((item) => publicProvider(item, service));

    return {
      success: result.ok,
      service,
      networks,
      billers: networks,
      providers: networks,
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
      requires_verification: false,
      provider_http_status: result.httpStatus,
    };
  }

  if (service === "data") {
    const networksResult = await peyflexPublicGet("/api/data/networks/");
    const networks = catalogueArray(networksResult.body, "networks", "providers", "billers").map((item) => publicProvider(item, service));

    let items: Record<string, unknown>[] = [];

    if (code) {
      const plansResult = await peyflexPublicGet("/api/data/plans/", {
        network: code,
      });

      items = catalogueArray(plansResult.body, "plans", "items", "products", "results").map((item) =>
        publicItem(item, service, code)
      );

      return {
        success: plansResult.ok,
        service,
        networks,
        billers: networks,
        providers: networks,
        items,
        plans: items,
        packages: items,
        amount_based: false,
        requires_verification: false,
        provider_http_status: plansResult.httpStatus,
      };
    }

    return {
      success: networksResult.ok,
      service,
      networks,
      billers: networks,
      providers: networks,
      items,
      plans: items,
      packages: items,
      amount_based: false,
      requires_verification: false,
      provider_http_status: networksResult.httpStatus,
    };
  }

  if (service === "cable") {
    const providersResult = await peyflexPublicGet("/api/cable/providers/");
    const providers = catalogueArray(providersResult.body, "providers", "billers", "networks").map(publicProvider);

    if (!code) {
      return {
        success: providersResult.ok,
        service,
        billers: providers,
        networks: providers,
        providers,
        cableProviders: providers,
        items: [],
        plans: [],
        packages: [],
        amount_based: false,
        requires_verification: true,
        provider_http_status: providersResult.httpStatus,
      };
    }

    const plansResult = await peyflexPublicGet(
      `/api/cable/plans/${encodeURIComponent(code)}/`,
    );

    const items = catalogueArray(plansResult.body, "plans", "items", "packages", "products", "results").map((item) =>
      publicItem(item, service, code)
    );

    return {
      success: plansResult.ok,
      service,
      billers: providers,
      networks: providers,
      providers,
      cableProviders: providers,
      selected_provider: code,
      items,
      plans: items,
      packages: items,
      amount_based: false,
      requires_verification: true,
      provider_http_status: plansResult.httpStatus,
    };
  }

  if (service === "electricity") {
    const result = await peyflexPublicGet("/api/electricity/plans/", {
      identifier: "electricity",
    });

    const companies = catalogueArray(
      result.body,
      "billers",
      "providers",
      "networks",
      "plans",
      "items",
    ).map(electricityProvider).filter((item) => clean(item.code) && clean(item.name));

    return {
      success: result.ok,
      service,
      billers: companies,
      networks: companies,
      providers: companies,
      electricityCompanies: companies,
      serviceProviders: companies,
      meterTypes: [
        { id: "prepaid", code: "prepaid", name: "Prepaid" },
        { id: "postpaid", code: "postpaid", name: "Postpaid" },
      ],
      items: [],
      plans: [],
      packages: [],
      amount_based: true,
      requires_verification: true,
      provider_http_status: result.httpStatus,
    };
  }

  if (service === "education") {
    const result = await peyflexPublicGet("/api/education/providers/");
    const body = bodyObject(result.body);
    const providerRows = catalogueArray(body, "providers", "billers", "networks");
    const topPlans = catalogueArray(body, "items", "plans", "products", "available_plans");

    const providers = providerRows.map((item) => {
      const raw = bodyObject(item);
      const provider = publicProvider(raw);
      const plans = catalogueArray(
        raw,
        "plans",
        "items",
        "products",
        "available_plans",
      ).map((plan) => publicItem(plan, service, clean(provider.code)))
        .filter((plan: any) => /waec/i.test(`${plan.name} ${plan.code}`));

      return { ...provider, plans };
    });

    let allPlans = providers.flatMap((provider: any) =>
      (provider.plans ?? []).map((plan: any) => ({
        ...plan,
        providerCode: provider.code,
        providerName: provider.name,
      }))
    );

    if (!allPlans.length) {
      allPlans = topPlans
        .map((plan) => publicItem(plan, service, "education"))
        .filter((plan: any) => /waec/i.test(`${plan.name} ${plan.code}`))
        .map((plan: any) => ({ ...plan, providerCode: "education", providerName: "Education" }));
    }

    const normalizedProviders = providers.length
      ? providers
      : [{
          id: "education",
          code: "education",
          name: "Education",
          logo: null,
          raw: {},
        }];

    return {
      success: result.ok,
      service,
      billers: normalizedProviders,
      providers: normalizedProviders,
      networks: normalizedProviders,
      educationProviders: normalizedProviders,
      items: allPlans,
      plans: allPlans,
      packages: allPlans,
      amount_based: false,
      requires_verification: false,
      provider_http_status: result.httpStatus,
    };
  }

  if (service === "airtime-card" || service === "data-card" || service === "recharge-card") {
    const result = await peyflexGet("/api/rc/options/");
    const items = catalogueArray(result.body, "items", "options", "plans", "products", "results").map((item) =>
      publicItem(item, service)
    );

    const networks = catalogueArray(result.body, "items", "options", "plans", "products", "results")
      .map((item: any) => {
        const raw = bodyObject(item);
        return firstValue(
          raw.network,
          raw.network_name,
          raw.networkName,
          raw.provider,
        );
      })
      .filter((value, index, array) =>
        clean(value) && array.findIndex((x) => clean(x).toLowerCase() === clean(value).toLowerCase()) === index
      )
      .map((value) => ({
        id: clean(value),
        code: clean(value),
        name: clean(value),
      }));

    return {
      success: result.ok,
      service,
      networks,
      billers: networks,
      providers: networks,
      items,
      plans: items,
      packages: items,
      amount_based: false,
      requires_verification: false,
      provider_http_status: result.httpStatus,
    };
  }

  throw new Error("Unsupported service.");
}

async function verifyCustomer(
  service: Service,
  body: any,
): Promise<Record<string, unknown>> {
  if (service === "cable") {
    const iuc = clean(pickBody(body, "customer", "iuc", "smartcard", "smartcard_number"));
    const identifier = clean(
      pickBody(body, "biller_code", "billerCode", "provider", "identifier"),
    );

    if (!iuc || !identifier) {
      throw new Error("Cable provider and IUC number are required.");
    }

    const result = await peyflexPost("/api/cable/verify/", {
      iuc,
      identifier,
    });

    return {
      success: result.ok && !providerLooksFailed(result.body, result.ok),
      status: normalizeStatus(result.body),
      message: providerMessage(result.body) || "Cable customer verification completed.",
      data: asObject(result.body),
      raw: result.body,
    };
  }

  if (service === "electricity") {
    const meter = clean(pickBody(body, "customer", "meter", "meter_number", "meterNumber"));
    const plan = clean(
      pickBody(body, "biller_code", "billerCode", "provider", "plan"),
    );
    const type = clean(
      pickBody(body, "meter_type", "meterType", "type"),
    ) || "prepaid";

    if (!meter || !plan) {
      throw new Error("Electricity plan and meter number are required.");
    }

    const result = await peyflexPublicGet("/api/electricity/verify/", {
      identifier: "electricity",
      meter,
      plan,
      type,
    });

    return {
      success: result.ok && !providerLooksFailed(result.body, result.ok),
      status: normalizeStatus(result.body),
      message: providerMessage(result.body) || "Meter verification completed.",
      data: asObject(result.body),
      raw: result.body,
    };
  }

  throw new Error("Verification is not supported for this service.");
}

function findCatalogItem(
  items: any[],
  requestedCode: string,
): any | null {
  const requested = clean(requestedCode).toLowerCase();
  if (!requested) return null;

  return items.find((item) =>
    clean(
      firstValue(
        item.id,
        item.code,
        item.plan_id,
        item.planId,
        item.plan_code,
        item.planCode,
      ),
    ).toLowerCase() === requested
  ) ?? null;
}

async function authoritativePrice(
  service: Service,
  body: any,
): Promise<{
  providerPrice: number;
  sellingAmount: number;
  selected: any;
  providerNetwork?: string;
}> {
  if (service === "airtime" || service === "electricity") {
    const amount = numberValue(
      pickBody(body, "amount", "selling_amount", "sellingAmount"),
    );

    if (amount <= 0) {
      throw new Error("A valid amount is required.");
    }

    // Airtime has 0% markup. Electricity is amount-based; the user pays the
    // amount entered plus the configured service markup.
    const markup = service === "airtime" ? 0 : STANDARD_MARKUP;
    const sellingAmount = roundSellingPrice(amount, markup);

    return {
      providerPrice: amount,
      sellingAmount,
      selected: null,
    };
  }

  const code = clean(
    pickBody(
      body,
      "item_code",
      "itemCode",
      "plan_code",
      "planCode",
      "package_code",
      "packageCode",
    ),
  );

  if (!code) {
    throw new Error("A valid service package is required.");
  }

  let rawItems: any[] = [];

  if (service === "data") {
    const network = clean(
      pickBody(body, "biller_code", "billerCode", "network", "network_code", "networkCode"),
    );

    if (!network) throw new Error("Please select a network.");

    const result = await peyflexPublicGet("/api/data/plans/", {
      network,
    });

    rawItems = catalogueArray(result.body, "plans", "items", "packages", "products", "results", "daily", "weekly", "monthly", "hot_deals");
  } else if (service === "cable") {
    const identifier = clean(
      pickBody(body, "biller_code", "billerCode", "provider", "identifier"),
    );

    if (!identifier) throw new Error("Please select a cable provider.");

    const result = await peyflexPublicGet(
      `/api/cable/plans/${encodeURIComponent(identifier)}/`,
    );

    rawItems = catalogueArray(result.body, "plans", "items", "packages", "products", "results", "daily", "weekly", "monthly", "hot_deals");
  } else if (service === "education") {
    const result = await peyflexPublicGet("/api/education/providers/");
    const body = bodyObject(result.body);
    const providers = catalogueArray(body, "providers", "billers", "networks");
    const topPlans = catalogueArray(body, "items", "plans", "products", "available_plans");

    rawItems = providers.flatMap((provider: any) =>
      catalogueArray(
        provider,
        "plans",
        "items",
        "products",
        "available_plans",
      )
    );
    if (!rawItems.length) rawItems = topPlans;
  } else {
    const result = await peyflexGet("/api/rc/options/");
    rawItems = catalogueArray(result.body, "plans", "items", "packages", "products", "results", "daily", "weekly", "monthly", "hot_deals");
  }

  const selected = findCatalogItem(rawItems, code);

  if (!selected) {
    throw new Error("The selected package is no longer available.");
  }

  const providerPrice = itemProviderPrice(selected);
  if (providerPrice <= 0) {
    throw new Error("Unable to determine the package price from the catalogue.");
  }

  const markup = service === "airtime" ? 0 : STANDARD_MARKUP;
  const sellingAmount = roundSellingPrice(providerPrice, markup);

  return {
    providerPrice,
    sellingAmount,
    selected,
    providerNetwork: clean(
      firstValue(
        selected.network,
        selected.network_id,
        selected.networkId,
        selected.network_code,
        selected.networkCode,
        pickBody(body, "biller_code", "billerCode", "network"),
      ),
    ),
  };
}

function safeProviderResponse(body: any): any {
  // Provider responses are stored in transaction metadata for reconciliation,
  // but secrets are never included here.
  return body;
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

  if (error) {
    console.error("Peyflex transaction update failed:", error);
  }

  return !error;
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
    _description: "Peyflex service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: {
      ...metadata,
      original_reference: reference,
      refund_reference: refundReference,
      provider: "peyflex",
      reason,
    },
  });

  return {
    success: !error,
    data,
    error: error?.message ?? null,
  };
}

async function purchase(
  admin: any,
  user: any,
  service: Service,
  body: any,
) {
  const rawCustomer = clean(
    pickBody(body, "customer", "mobile_number", "mobileNumber", "phone"),
  );
  const customer = ["airtime", "data", "education", "airtime-card", "data-card", "recharge-card"].includes(service)
    ? normalizePhone(rawCustomer)
    : rawCustomer;

  if (
    ["airtime", "data", "education", "airtime-card", "data-card", "recharge-card"].includes(service) &&
    !validPhone(customer)
  ) {
    throw new Error("Please provide a valid Nigerian phone number.");
  }

  const { providerPrice, sellingAmount, selected, providerNetwork } =
    await authoritativePrice(service, body);

  const quantity = Math.max(
    1,
    Math.floor(
      numberValue(pickBody(body, "quantity", "qty")) || 1,
    ),
  );

  const reference = `PEY_${crypto.randomUUID()}`;

  const metadata: Record<string, unknown> = {
    service,
    provider: "peyflex",
    provider_id: "peyflex",
    customer: customer || null,
    biller_code: clean(
      pickBody(body, "biller_code", "billerCode", "provider", "identifier"),
    ) || null,
    item_code: clean(
      pickBody(body, "item_code", "itemCode", "plan_code", "planCode"),
    ) || null,
    provider_amount: providerPrice,
    selling_amount: sellingAmount,
    markup_rate: service === "airtime" ? 0 : STANDARD_MARKUP,
    markup_amount: sellingAmount - providerPrice,
    quantity,
    selected_item: selected,
    request_id: reference,
    reconciliation_required: true,
  };

  const { data: debitResult, error: debitError } = await admin.rpc(
    "debit_wallet",
    {
      _user_id: user.id,
      _amount: sellingAmount,
      _description: `${service} purchase`,
      _idempotency_key: reference,
      _reference: reference,
      _category: "bill_payment",
      _metadata: metadata,
    },
  );

  if (debitError) {
    console.error("Peyflex wallet debit failed:", debitError);
    throw new Error("Unable to process the payment from your wallet.");
  }

  const transactionId = debitResult?.id ?? null;

  if (!transactionId) {
    throw new Error("Wallet debit did not return a transaction.");
  }

  let result: any;

  try {
    if (service === "airtime") {
      result = await peyflexPost("/api/airtime/topup/", {
        network: networkCode(
          pickBody(body, "biller_code", "billerCode", "network", "network_code"),
        ),
        amount: providerPrice,
        mobile_number: customer,
      });
    } else if (service === "data") {
      result = await peyflexPost("/api/data/purchase/", {
        network: networkCode(providerNetwork),
        mobile_number: customer,
        plan_code: clean(
          pickBody(body, "item_code", "itemCode", "plan_code", "planCode"),
        ),
      });
    } else if (service === "cable") {
      const identifier = clean(
        pickBody(body, "biller_code", "billerCode", "provider", "identifier"),
      );

      result = await peyflexPost("/api/cable/subscribe/", {
        identifier,
        plan: clean(
          pickBody(body, "item_code", "itemCode", "plan_code", "planCode"),
        ),
        iuc: clean(
          pickBody(body, "customer", "iuc", "smartcard", "smartcard_number"),
        ),
        phone: customer,
      });
    } else if (service === "electricity") {
      result = await peyflexPost("/api/electricity/subscribe/", {
        identifier: "electricity",
        meter: clean(
          pickBody(body, "customer", "meter", "meter_number", "meterNumber"),
        ),
        plan: clean(
          pickBody(body, "biller_code", "billerCode", "provider", "plan"),
        ),
        amount: String(providerPrice),
        type: clean(
          pickBody(body, "meter_type", "meterType", "type"),
        ) || "prepaid",
        phone: customer,
      });
    } else if (service === "education") {
      result = await peyflexPost("/api/education/purchase/", {
        identifier: clean(
          pickBody(body, "identifier", "biller_code", "billerCode", "provider"),
        ) || "education",
        plan_id: clean(
          pickBody(body, "item_code", "itemCode", "plan_code", "planCode"),
        ),
        quantity: String(quantity),
        phone: customer,
      });
    } else {
      const network = clean(
        pickBody(body, "biller_code", "billerCode", "network", "network_code"),
      );

      result = await peyflexPost("/api/rc/purchase/", {
        network: network || undefined,
        amount: providerPrice,
        quantity,
        pin: clean(pickBody(body, "pin", "card_pin")) || undefined,
        brand_name: clean(
          pickBody(body, "brand_name", "brandName"),
        ) || "IyanjuPay",
        identifier: service === "recharge-card" ? "recharge-card" : undefined,
        plan_id: service === "education"
          ? clean(pickBody(body, "item_code", "itemCode", "plan_code", "planCode"))
          : undefined,
        phone: customer || undefined,
      });
    }
  } catch (error) {
    console.error("Peyflex provider request exception:", error);

    await updateTransaction(admin, user.id, reference, {
      status: "pending",
      provider: "peyflex",
      provider_reference: reference,
      metadata: {
        ...metadata,
        provider_request_exception: true,
        reconciliation_required: true,
      },
    });

    return {
      success: true,
      status: "pending",
      reference,
      transaction_id: transactionId,
      message:
        "Your payment was sent for processing and is being verified.",
    };
  }

  const providerRef = providerReference(result.body);
  const status = normalizeStatus(result.body);

  const safeResponse = safeProviderResponse(result.body);

  if (providerLooksSuccessful(result.body, result.ok)) {
    await updateTransaction(admin, user.id, reference, {
      status: "completed",
      provider: "peyflex",
      provider_reference: providerRef ?? reference,
      completed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        peyflex_status: status,
        peyflex_response: safeResponse,
        reconciliation_required: false,
      },
    });

    return {
      success: true,
      status: "successful",
      reference,
      transaction_id: transactionId,
      provider_reference: providerRef,
      message: providerMessage(result.body) || "Purchase completed successfully.",
      fulfillment: safeResponse,
    };
  }

  if (providerLooksFailed(result.body, result.ok)) {
    const reason =
      providerMessage(result.body) ||
      "Peyflex rejected the purchase.";

    const refund = await refundTransaction(
      admin,
      user.id,
      reference,
      sellingAmount,
      reason,
      {
        ...metadata,
        peyflex_status: status,
        peyflex_response: safeResponse,
      },
    );

    await updateTransaction(admin, user.id, reference, {
      status: "failed",
      provider: "peyflex",
      provider_reference: providerRef ?? reference,
      metadata: {
        ...metadata,
        peyflex_status: status,
        peyflex_response: safeResponse,
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
        transaction_id: transactionId,
        error:
          "The purchase failed, but the automatic refund requires retry.",
        refund_pending: true,
      };
    }

    return {
      success: false,
      status: "failed",
      reference,
      transaction_id: transactionId,
      error: reason,
      refunded: true,
    };
  }

  /*
   * The supplied Peyflex documentation does not document a universal
   * service-payment requery endpoint for airtime/data/cable/electricity/
   * education. Therefore an ambiguous provider response MUST remain pending.
   * We never turn an unknown result into a false success or an automatic
   * refund that could cause double spending.
   */
  await updateTransaction(admin, user.id, reference, {
    status: "pending",
    provider: "peyflex",
    provider_reference: providerRef ?? reference,
    metadata: {
      ...metadata,
      peyflex_status: status,
      peyflex_response: safeResponse,
      reconciliation_required: true,
    },
  });

  return {
    success: true,
    status: "pending",
    reference,
    transaction_id: transactionId,
    provider_reference: providerRef,
    message:
      providerMessage(result.body) ||
      "Your payment is being processed and will be verified.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
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

  try {
    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    const action = clean(body?.action ?? "catalog").toLowerCase();
    const service = serviceOf(body?.service);

    if (
      !service ||
      !SUPPORTED.has(service)
    ) {
      return json(
        {
          success: false,
          error:
            "This service is not available through the current Peyflex integration.",
        },
        400,
      );
    }

    const admin = adminClient();

    if (
      action === "catalog" ||
      action === "get_catalog" ||
      action === "billers" ||
      action === "networks" ||
      action === "plans" ||
      action === "items" ||
      action === "get_billers"
    ) {
      const code = clean(
        pickBody(
          body,
          "biller_code",
          "billerCode",
          "provider_code",
          "providerCode",
          "network_code",
          "networkCode",
          "network",
          "provider",
          "cable_tv",
          "cableTv",
        ),
      );

      const result = await catalog(service, code || undefined);

      return json(result);
    }

    if (
      action === "verify" ||
      action === "validate" ||
      action === "verify_customer"
    ) {
      const result = await verifyCustomer(service, body);
      return json(result);
    }

    if (
      action === "pay" ||
      action === "purchase" ||
      action === "service"
    ) {
      const result = await purchase(admin, user, service, body);
      return json(result);
    }

    return json(
      {
        success: false,
        error: "Unsupported action.",
      },
      400,
    );
  } catch (error) {
    console.error("Peyflex services error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Unable to process Peyflex service request.";

    return json(
      {
        success: false,
        error: message,
      },
      400,
    );
  }
});
