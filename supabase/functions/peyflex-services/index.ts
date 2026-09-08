import {
  asObject,
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
} from "../_shared/peyflex.ts";

import {
  adminClient,
  getUser,
  json,
} from "../_shared/auth.ts";

type Service =
  | "airtime"
  | "data"
  | "cable"
  | "electricity"
  | "education"
  | "airtime-card"
  | "data-card"
  | "recharge-card";

const SUPPORTED_SERVICES = new Set<Service>([
  "airtime",
  "data",
  "cable",
  "electricity",
  "education",
  "airtime-card",
  "data-card",
  "recharge-card",
]);

/*
 * Pricing
 *
 * Airtime = 0% markup
 * Everything else = 10% markup
 */
const STANDARD_MARKUP = 0.10;
const AIRTIME_MARKUP = 0;

/*
 * Explicit CORS headers.
 *
 * The browser sends an OPTIONS preflight before the
 * authenticated POST request. These headers MUST be
 * present on the preflight response.
 *
 * "*" is intentionally used here because the function
 * does not use browser credentials/cookies. Supabase
 * authentication is supplied through the Authorization
 * header.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function pickBody(
  body: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (
      body[key] !== undefined &&
      body[key] !== null &&
      clean(body[key]) !== ""
    ) {
      return body[key];
    }
  }

  return undefined;
}

/*
 * Convert every frontend/service alias into the one
 * internal service name used by this function.
 */
function serviceOf(value: unknown): Service | null {
  const raw = clean(value).toLowerCase();

  const aliases: Record<string, Service> = {
    airtime: "airtime",

    data: "data",
    mobile_data: "data",
    "mobile-data": "data",
    mobiledata: "data",

    cable: "cable",
    cabletv: "cable",
    "cable-tv": "cable",

    electricity: "electricity",
    electric: "electricity",

    education: "education",
    waec: "education",

    "airtime-card": "airtime-card",
    airtime_card: "airtime-card",
    airtime_epin: "airtime-card",
    "airtime-epin": "airtime-card",
    airtimepin: "airtime-card",

    "data-card": "data-card",
    data_card: "data-card",
    data_epin: "data-card",
    "data-epin": "data-card",
    datapin: "data-card",

    "recharge-card": "recharge-card",
    recharge_card: "recharge-card",
    recharge: "recharge-card",
    epin: "recharge-card",
  };

  return aliases[raw] ?? null;
}

function networkCode(value: unknown): string {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    return clean(
      obj.code ??
        obj.network_code ??
        obj.networkCode ??
        obj.identifier ??
        obj.provider_code ??
        obj.providerCode ??
        obj.id ??
        obj.value,
    );
  }

  return clean(value);
}

function normalizePhone(value: unknown): string {
  let phone = clean(value).replace(/[^\d+]/g, "");

  if (phone.startsWith("+234")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("234")) {
    phone = "0" + phone.slice(3);
  }

  return phone;
}

function validPhone(phone: string): boolean {
  return /^0[789]\d{9}$/.test(phone);
}

/*
 * Extract the internal provider plan/item ID.
 *
 * This remains available to the backend but is never
 * intended to be shown as a customer-facing label.
 */
function itemId(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }

  const obj = item as Record<string, unknown>;

  return clean(
    obj.id ??
      obj.code ??
      obj.plan_code ??
      obj.planCode ??
      obj.plan_id ??
      obj.planId ??
      obj.identifier ??
      obj.value,
  );
}

function rawItemName(item: unknown): string {
  if (!item || typeof item !== "object") {
    return clean(item);
  }

  const obj = item as Record<string, unknown>;

  return clean(
    obj.name ??
      obj.plan_name ??
      obj.planName ??
      obj.title ??
      obj.description ??
      obj.package_name ??
      obj.packageName ??
      obj.label ??
      obj.product_name ??
      obj.productName ??
      itemId(item),
  );
}

/*
 * IMPORTANT:
 *
 * Peyflex may identify plans with labels such as:
 *
 * SME
 * Direct
 * Gifting
 * Awoof
 * Corporate
 *
 * Those are provider/product classifications and must
 * never become customer-facing plan labels.
 *
 * The underlying plan CODE remains untouched.
 */
function cleanCustomerPlanName(value: unknown): string {
  let name = clean(value);

  /*
   * Remove common provider classifications regardless
   * of capitalization.
   */
  name = name
    .replace(/\bSME\b/gi, "")
    .replace(/\bDIRECT\b/gi, "")
    .replace(/\bGIFTING\b/gi, "")
    .replace(/\bGIFT\b/gi, "")
    .replace(/\bAWOOF\b/gi, "")
    .replace(/\bCORPORATE\s+DATA\b/gi, "")
    .replace(/\bCORPORATE\b/gi, "")
    .replace(/\bBUSINESS\s+DATA\b/gi, "");

  /*
   * Remove empty separators left after classification
   * removal.
   */
  name = name
    .replace(/\s*[-–—|:/]\s*/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\{\s*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return name;
}

function itemPrice(item: unknown): number {
  if (!item || typeof item !== "object") {
    return numberValue(item);
  }

  const obj = item as Record<string, unknown>;

  return numberValue(
    obj.price ??
      obj.amount ??
      obj.selling_price ??
      obj.sellingPrice ??
      obj.cost ??
      obj.face_value ??
      obj.faceValue ??
      obj.value,
  );
}

function itemValidity(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }

  const obj = item as Record<string, unknown>;

  return clean(
    obj.validity ??
      obj.validity_period ??
      obj.validityPeriod ??
      obj.duration ??
      obj.period ??
      obj.days,
  );
}

function itemNetwork(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }

  const obj = item as Record<string, unknown>;

  return clean(
    obj.network ??
      obj.network_code ??
      obj.networkCode ??
      obj.provider ??
      obj.provider_code ??
      obj.providerCode ??
      obj.identifier,
  );
}

function calculateSellingPrice(
  providerPrice: number,
  service: Service,
): number {
  const markup =
    service === "airtime"
      ? AIRTIME_MARKUP
      : STANDARD_MARKUP;

  return roundSellingPrice(
    providerPrice * (1 + markup),
  );
}

function publicItem(
  item: unknown,
  service: Service,
) {
  const providerPrice = itemPrice(item);

  /*
   * Only clean customer-facing fields are exposed.
   *
   * The raw Peyflex object is deliberately NOT returned.
   * This prevents fields such as:
   * plan_type, category, product_type, SME, Direct,
   * Gifting, etc. from leaking into the frontend.
   */
  return {
    id: itemId(item),
    code: itemId(item),
    name: cleanCustomerPlanName(
      rawItemName(item),
    ),
    price: calculateSellingPrice(
      providerPrice,
      service,
    ),
    provider_price: providerPrice,
    validity: itemValidity(item),
    network: itemNetwork(item),
  };
}

function publicProvider(item: unknown) {
  if (typeof item === "string") {
    return {
      id: item,
      code: item,
      name: clean(item),
    };
  }

  const obj = asObject(item);

  return {
    id: clean(
      obj.id ??
        obj.code ??
        obj.identifier ??
        obj.network_code ??
        obj.networkCode ??
        obj.provider_code ??
        obj.providerCode,
    ),

    code: clean(
      obj.code ??
        obj.identifier ??
        obj.network_code ??
        obj.networkCode ??
        obj.provider_code ??
        obj.providerCode ??
        obj.id,
    ),

    name: clean(
      obj.name ??
        obj.network_name ??
        obj.networkName ??
        obj.provider_name ??
        obj.providerName ??
        obj.title ??
        obj.label ??
        obj.description,
    ),
  };
}

/*
 * Convert common Peyflex response structures into an
 * array without exposing provider response structure
 * to the frontend.
 */
function extractList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = asObject(value);

  for (const key of [
    "data",
    "results",
    "items",
    "plans",
    "providers",
    "networks",
    "billers",
    "options",
    "products",
    "available_plans",
  ]) {
    if (Array.isArray(obj[key])) {
      return obj[key] as unknown[];
    }
  }

  return [];
}

function responseList(value: unknown): unknown[] {
 
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const wrapper =
      value as Record<string, unknown>;

    if (
      "body" in wrapper &&
      "httpStatus" in wrapper &&
      "ok" in wrapper
    ) {
      return responseList(
        wrapper.body,
      );
    }
  }

  const direct =
    extractList(value);

  if (direct.length > 0) {
    return direct;
  }

  const obj =
    asObject(value);

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return extractList(
      obj.data,
    );
  }

  return [];
}
function flattenEducationPlans(
  value: unknown,
): unknown[] {
  const result: unknown[] = [];

  const providers = responseList(value);

  for (const provider of providers) {
    const providerObj = asObject(provider);

    const providerCode = clean(
      providerObj.code ??
        providerObj.identifier ??
        providerObj.id,
    );

    let plans: unknown[] = [];

    const directPlans =
      extractList(providerObj.plans);

    if (directPlans.length > 0) {
      plans = directPlans;
    } else {
      const items =
        extractList(providerObj.items);

      if (items.length > 0) {
        plans = items;
      } else {
        const products =
          extractList(providerObj.products);

        if (products.length > 0) {
          plans = products;
        } else {
          plans = extractList(
            providerObj.available_plans,
          );
        }
      }
    }

    if (plans.length === 0) {
      /*
       * Some provider responses may already represent
       * an individual purchasable plan.
       */
      result.push(provider);
      continue;
    }

    for (const plan of plans) {
      if (
        plan &&
        typeof plan === "object"
      ) {
        result.push({
          ...(plan as Record<string, unknown>),
          provider: providerCode,
          provider_code: providerCode,
        });
      } else {
        result.push({
          value: plan,
          provider: providerCode,
          provider_code: providerCode,
        });
      }
    }
  }

  return result;
}

/*
 * ---------------------------------------------------------
 * CATALOGUE
 * ---------------------------------------------------------
 */
async function catalog(
  service: Service,
  code?: string,
) {
  switch (service) {
    /*
     * AIRTIME
     *
     * Amount based.
     * No plan cards are required.
     */
    case "airtime": {
      const response =
        await peyflexPublicGet(
          "/api/airtime/networks/",
        );

      const providers =
        responseList(response).map(
          publicProvider,
        );

      return {
        success: true,
        service,
        amount_based: true,
        billers: providers,
        networks: providers,
        items: [],
        plans: [],
      };
    }

    /*
     * DATA
     */
    case "data": {
      const networksResponse =
        await peyflexPublicGet(
          "/api/data/networks/",
        );

      const networks =
        responseList(
          networksResponse,
        ).map(publicProvider);

      /*
       * Initial request:
       * action = billers
       *
       * No selected network yet.
       */
      if (!code) {
        return {
          success: true,
          service,
          amount_based: false,
          billers: networks,
          networks,
          items: [],
          plans: [],
        };
      }

      /*
       * Second request:
       * action = items
       *
       * Current ServicePayment sends the selected
       * network as biller_code.
       */
      const plansResponse =
        await peyflexPublicGet(
          "/api/data/plans/",
          {
            network: code,
          },
        );

      const rawPlans =
        responseList(plansResponse);

      const items =
        rawPlans.map((item) =>
          publicItem(item, service),
        );

      return {
        success: true,
        service,
        amount_based: false,
        billers: networks,
        networks,
        items,
        plans: items,
      };
    }

    /*
     * CABLE TV
     */
    case "cable": {
      const providersResponse =
        await peyflexPublicGet(
          "/api/cable/providers/",
        );

      const providers =
        responseList(
          providersResponse,
        ).map(publicProvider);

      if (!code) {
        return {
          success: true,
          service,
          amount_based: false,
          billers: providers,
          providers,
          items: [],
          plans: [],
        };
      }

      const plansResponse =
        await peyflexPublicGet(
          `/api/cable/plans/${encodeURIComponent(code)}/`,
        );

      const rawPlans =
        responseList(plansResponse);

      const items =
        rawPlans.map((item) =>
          publicItem(item, service),
        );

      return {
        success: true,
        service,
        amount_based: false,
        billers: providers,
        providers,
        items,
        plans: items,
      };
    }

    /*
     * ELECTRICITY
     *
     * Amount based.
     */
    case "electricity": {
      const response =
        await peyflexPublicGet(
          "/api/electricity/plans/",
          {
            identifier: "electricity",
          },
        );

      const companies =
        responseList(response).map(
          publicProvider,
        );

      return {
        success: true,
        service,
        amount_based: true,
        billers: companies,
        providers: companies,
        items: [],
        plans: [],
      };
    }

    /*
     * EDUCATION / WAEC
     */
    case "education": {
      const response =
        await peyflexPublicGet(
          "/api/education/providers/",
        );

      const providers =
        responseList(response).map(
          publicProvider,
        );

      let items: unknown[] = [];

      const flattened =
        flattenEducationPlans(response);

      if (flattened.length > 0) {
        items = flattened.map(
          (item) =>
            publicItem(item, service),
        );
      }

      /*
       * If a specific education provider was selected,
       * filter plans belonging to that provider.
       */
      if (code) {
        items = items.filter((item) => {
          const itemObj =
            asObject(item);

          const rawProvider =
            clean(
              itemObj.network ??
                itemObj.provider ??
                itemObj.provider_code ??
                itemObj.providerCode,
            );

          return (
            !rawProvider ||
            rawProvider === code
          );
        });
      }

      return {
        success: true,
        service,
        amount_based: false,
        billers: providers,
        providers,
        items,
        plans: items,
      };
    }

    /*
     * AIRTIME CARD / DATA CARD / RECHARGE CARD
     */
    case "airtime-card":
    case "data-card":
    case "recharge-card": {
      const response =
        await peyflexPublicGet(
          "/api/rc/options/",
        );

      const options =
        responseList(response);

      const items =
        options.map((item) =>
          publicItem(item, service),
        );

      return {
        success: true,
        service,
        amount_based: false,
        billers: [],
        providers: [],
        items,
        plans: items,
      };
    }

    default:
      throw new Error(
        "Unsupported service.",
      );
  }
}

/*
 * ---------------------------------------------------------
 * CUSTOMER VERIFICATION
 * ---------------------------------------------------------
 */
async function verifyCustomer(
  service: Service,
  body: Record<string, unknown>,
) {
  /*
   * CABLE CUSTOMER VERIFICATION
   */
  if (service === "cable") {
    const iuc = clean(
      pickBody(
        body,
        "iuc",
        "smartcard",
        "smartcard_number",
        "smartcardNumber",
      ),
    );

    const identifier = clean(
      pickBody(
        body,
        "identifier",
        "provider",
        "provider_code",
        "providerCode",
        "cable_tv",
        "cableTv",
        "biller_code",
        "billerCode",
      ),
    );

    if (!iuc) {
      return {
        success: false,
        error:
          "IUC/Smartcard number is required.",
      };
    }

    if (!identifier) {
      return {
        success: false,
        error:
          "Cable provider is required.",
      };
    }

    const response =
      await peyflexPost(
        "/api/cable/verify/",
        {
          iuc,
          identifier,
        },
      );

    return {
      success:
        !providerLooksFailed(
          response,
        ),
      verified:
        providerLooksSuccessful(
          response,
        ),
      customer: extractObjectData(
        response,
      ),
      data: response,
      message:
        providerMessage(response),
    };
  }

  /*
   * ELECTRICITY METER VERIFICATION
   */
  if (service === "electricity") {
    const meter = clean(
      pickBody(
        body,
        "meter",
        "meter_number",
        "meterNumber",
      ),
    );

    const identifier = clean(
      pickBody(
        body,
        "identifier",
        "provider",
        "provider_code",
        "providerCode",
        "biller_code",
        "billerCode",
      ),
    );

    const plan = clean(
      pickBody(
        body,
        "plan",
        "plan_code",
        "planCode",
      ),
    );

    const type = clean(
      pickBody(
        body,
        "type",
        "meter_type",
        "meterType",
      ),
    );

    if (!meter) {
      return {
        success: false,
        error:
          "Meter number is required.",
      };
    }

    if (!identifier) {
      return {
        success: false,
        error:
          "Electricity provider is required.",
      };
    }

    const response =
      await peyflexGet(
        "/api/electricity/verify/",
        {
          identifier:
            identifier || "electricity",
          meter,
          plan,
          type,
        },
      );

    return {
      success:
        !providerLooksFailed(
          response,
        ),
      verified:
        providerLooksSuccessful(
          response,
        ),
      customer: extractObjectData(
        response,
      ),
      data: response,
      message:
        providerMessage(response),
    };
  }

  /*
   * Airtime/Data/Education/Card services do not require
   * customer verification before purchase.
   */
  return {
    success: true,
    verified: true,
    message:
      "Verification is not required for this service.",
  };
}

/*
 * Extract the selected plan from the authoritative
 * Peyflex catalogue.
 */
async function findCatalogItem(
  service: Service,
  body: Record<string, unknown>,
) {
  const requestedCode = clean(
    pickBody(
      body,
      "plan_code",
      "planCode",
      "plan_id",
      "planId",
      "item_id",
      "itemId",
      "item_code",
      "itemCode",
      "code",
      "plan",
    ),
  );

  const requestedNetwork = clean(
    pickBody(
      body,
      "network",
      "network_code",
      "networkCode",
      "provider",
      "provider_code",
      "providerCode",
      "identifier",
      "biller_code",
      "billerCode",
    ),
  );

  const catalogue =
    await catalog(
      service,
      requestedNetwork ||
        undefined,
    );

  const items =
    Array.isArray(catalogue.items)
      ? catalogue.items
      : [];

  if (!requestedCode) {
    return null;
  }

  const found = items.find(
    (item) => {
      const obj =
        asObject(item);

      return (
        clean(obj.id) ===
          requestedCode ||
        clean(obj.code) ===
          requestedCode ||
        clean(obj.plan_code) ===
          requestedCode ||
        clean(obj.plan_id) ===
          requestedCode
      );
    },
  );

  return found ?? null;
}

/*
 * ---------------------------------------------------------
 * AUTHORITATIVE PRICE
 * ---------------------------------------------------------
 *
 * Never trust a frontend-supplied selling price.
 *
 * The backend obtains the provider price and calculates
 * the actual IyanjuPay selling price itself.
 */
async function authoritativePrice(
  service: Service,
  body: Record<string, unknown>,
): Promise<{
  providerPrice: number;
  sellingPrice: number;
  item: unknown;
}> {
  /*
   * AIRTIME
   *
   * Airtime is amount based and has 0% markup.
   */
  if (service === "airtime") {
    const amount =
      numberValue(
        pickBody(
          body,
          "amount",
          "value",
          "price",
        ),
      );

    if (!amount || amount <= 0) {
      throw new Error(
        "A valid airtime amount is required.",
      );
    }

    return {
      providerPrice: amount,
      sellingPrice: amount,
      item: null,
    };
  }

  /*
   * ELECTRICITY
   */
  if (service === "electricity") {
    const amount =
      numberValue(
        pickBody(
          body,
          "amount",
          "value",
          "price",
        ),
      );

    if (!amount || amount <= 0) {
      throw new Error(
        "A valid electricity amount is required.",
      );
    }

    return {
      providerPrice: amount,
      sellingPrice:
        calculateSellingPrice(
          amount,
          service,
        ),
      item: null,
    };
  }

  /*
   * All plan-based services must match an authoritative
   * Peyflex catalogue item.
   */
  const item =
    await findCatalogItem(
      service,
      body,
    );

  if (!item) {
    throw new Error(
      "The selected service plan could not be found in the Peyflex catalogue.",
    );
  }

  const providerPrice =
    numberValue(
      asObject(item).provider_price ??
        asObject(item).price,
    );

  if (!providerPrice || providerPrice <= 0) {
    throw new Error(
      "The selected Peyflex plan has an invalid price.",
    );
  }

  return {
    providerPrice,
    sellingPrice:
      calculateSellingPrice(
        providerPrice,
        service,
      ),
    item,
  };
}

/*
 * ---------------------------------------------------------
 * PEYFLEX PURCHASE
 * ---------------------------------------------------------
 */
async function callProviderPurchase(
  service: Service,
  body: Record<string, unknown>,
  providerPrice: number,
  quantity: number,
) {
  const phone =
    normalizePhone(
      pickBody(
        body,
        "phone",
        "mobile_number",
        "mobileNumber",
        "phone_number",
        "phoneNumber",
      ),
    );

  /*
   * AIRTIME
   */
  if (service === "airtime") {
    const network =
      networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
          "biller_code",
          "billerCode",
        ),
      );

    return await peyflexPost(
      "/api/airtime/topup/",
      {
        network,
        amount: providerPrice,
        mobile_number: phone,
      },
    );
  }

  /*
   * DATA
   *
   * The actual Peyflex plan code is sent to Peyflex.
   * The classification is never sent to the customer.
   */
  if (service === "data") {
    const network =
      networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
          "biller_code",
          "billerCode",
        ),
      );

    const planCode =
      clean(
        pickBody(
          body,
          "plan_code",
          "planCode",
          "plan",
          "code",
        ),
      );

    if (!network) {
      throw new Error(
        "Data network is required.",
      );
    }

    if (!planCode) {
      throw new Error(
        "Data plan is required.",
      );
    }

    return await peyflexPost(
      "/api/data/purchase/",
      {
        network,
        mobile_number: phone,
        plan_code: planCode,
      },
    );
  }

  /*
   * CABLE
   */
  if (service === "cable") {
    const identifier =
      clean(
        pickBody(
          body,
          "identifier",
          "provider",
          "provider_code",
          "providerCode",
          "cable_tv",
          "cableTv",
          "biller_code",
          "billerCode",
        ),
      );

    const plan =
      clean(
        pickBody(
          body,
          "plan",
          "plan_code",
          "planCode",
          "package",
          "package_code",
        ),
      );

    const iuc =
      clean(
        pickBody(
          body,
          "iuc",
          "smartcard",
          "smartcard_number",
          "smartcardNumber",
        ),
      );

    if (!identifier) {
      throw new Error(
        "Cable provider is required.",
      );
    }

    if (!plan) {
      throw new Error(
        "Cable package is required.",
      );
    }

    if (!iuc) {
      throw new Error(
        "IUC/Smartcard number is required.",
      );
    }

    return await peyflexPost(
      "/api/cable/subscribe/",
      {
        identifier,
        plan,
        iuc,
        phone,
      },
    );
  }

  /*
   * ELECTRICITY
   */
  if (service === "electricity") {
    const identifier =
      clean(
        pickBody(
          body,
          "identifier",
          "provider",
          "provider_code",
          "providerCode",
          "biller_code",
          "billerCode",
        ),
      );

    const meter =
      clean(
        pickBody(
          body,
          "meter",
          "meter_number",
          "meterNumber",
        ),
      );

    const plan =
      clean(
        pickBody(
          body,
          "plan",
          "plan_code",
          "planCode",
        ),
      );

    const type =
      clean(
        pickBody(
          body,
          "type",
          "meter_type",
          "meterType",
        ),
      );

    return await peyflexPost(
      "/api/electricity/subscribe/",
      {
        identifier:
          identifier ||
          "electricity",
        meter,
        plan,
        amount:
          String(providerPrice),
        type,
        phone,
      },
    );
  }

  /*
   * EDUCATION / WAEC
   */
  if (service === "education") {
    const planId =
      clean(
        pickBody(
          body,
          "plan_id",
          "planId",
          "plan",
          "code",
        ),
      );

    if (!planId) {
      throw new Error(
        "Education plan is required.",
      );
    }

    return await peyflexPost(
      "/api/education/purchase/",
      {
        identifier: "education",
        plan_id: planId,
        quantity:
          String(quantity),
        phone,
      },
    );
  }

  /*
   * RECHARGE / EPIN
   */
  if (
    service === "airtime-card" ||
    service === "data-card" ||
    service === "recharge-card"
  ) {
    const network =
      networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
          "biller_code",
          "billerCode",
        ),
      );

    const pin =
      clean(
        pickBody(
          body,
          "pin",
          "pin_type",
          "pinType",
        ),
      );

    return await peyflexPost(
      "/api/rc/purchase/",
      {
        network,
        amount: providerPrice,
        quantity,
        pin,
        brand_name: "IyanjuPay",
      },
    );
  }

  throw new Error(
    "Unsupported service.",
  );
}

/*
 * ---------------------------------------------------------
 * PURCHASE FLOW
 * ---------------------------------------------------------
 */
async function purchase(
  userId: string,
  service: Service,
  body: Record<string, unknown>,
) {
  const phone =
    normalizePhone(
      pickBody(
        body,
        "phone",
        "mobile_number",
        "mobileNumber",
        "phone_number",
        "phoneNumber",
      ),
    );

  /*
   * Cable and electricity may use different customer
   * identifiers, so phone is not mandatory for those
   * two services.
   */
  if (
    service !== "cable" &&
    service !== "electricity" &&
    !validPhone(phone)
  ) {
    throw new Error(
      "A valid Nigerian phone number is required.",
    );
  }

  const quantityRaw =
    numberValue(
      pickBody(
        body,
        "quantity",
        "qty",
      ),
    );

  const quantity =
    quantityRaw > 0
      ? Math.floor(quantityRaw)
      : 1;

  /*
   * NEVER use frontend selling price.
   *
   * Get authoritative Peyflex pricing.
   */
  const pricing =
    await authoritativePrice(
      service,
      body,
    );

  const providerPrice =
    pricing.providerPrice *
    quantity;

  const sellingPrice =
    pricing.sellingPrice *
    quantity;

  /*
   * Unique internal transaction reference.
   */
  const reference =
    `PEY_${crypto.randomUUID()}`;

  const supabase =
    adminClient();

  /*
   * -------------------------------------------------------
   * WALLET DEBIT
   * -------------------------------------------------------
   */
  const {
    data: debitData,
    error: debitError,
  } =
    await supabase.rpc(
      "debit_wallet",
      {
        p_user_id: userId,
        p_amount: sellingPrice,
        p_reference: reference,
        p_description:
          `${service} purchase`,
      },
    );

  if (debitError) {
    throw new Error(
      debitError.message ||
        "Unable to debit wallet.",
    );
  }

  const debitResult =
    Array.isArray(debitData)
      ? debitData[0]
      : debitData;

  if (
    debitResult &&
    typeof debitResult === "object" &&
    "success" in debitResult &&
    !Boolean(
      (
        debitResult as Record<
          string,
          unknown
        >
      ).success,
    )
  ) {
    throw new Error(
      clean(
        (
          debitResult as Record<
            string,
            unknown
          >
        ).message,
      ) ||
        "Unable to debit wallet.",
    );
  }

  /*
   * IMPORTANT:
   *
   * We intentionally do not store the provider's raw
   * catalogue object here because it can contain labels
   * such as SME / Direct / Gifting.
   *
   * Store only the safe selected-item fields.
   */
  const selectedItem =
    pricing.item
      ? {
          id: itemId(
            pricing.item,
          ),
          code: itemId(
            pricing.item,
          ),
          name:
            cleanCustomerPlanName(
              rawItemName(
                pricing.item,
              ),
            ),
          price:
            numberValue(
              asObject(
                pricing.item,
              ).price,
            ),
          validity:
            itemValidity(
              pricing.item,
            ),
        }
      : null;

  const metadata = {
    service,
    provider: "peyflex",

    customer_phone: phone,
    phone,

    biller_code: clean(
      pickBody(
        body,
        "biller_code",
        "billerCode",
        "provider_code",
        "providerCode",
        "identifier",
      ),
    ),

    item_code: clean(
      pickBody(
        body,
        "plan_code",
        "planCode",
        "plan_id",
        "planId",
        "item_code",
        "itemCode",
        "code",
      ),
    ),

    provider_price: providerPrice,
    selling_price: sellingPrice,

    markup:
      sellingPrice -
      providerPrice,

    markup_rate:
      service === "airtime"
        ? AIRTIME_MARKUP
        : STANDARD_MARKUP,

    quantity,

    selected_item:
      selectedItem,

    reconciliation_required:
      false,
  };

  /*
   * -------------------------------------------------------
   * CREATE TRANSACTION
   * -------------------------------------------------------
   */
  const {
    data: transaction,
    error: transactionError,
  } =
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        reference_number:
          reference,
        transaction_type:
          "service_purchase",
        amount: sellingPrice,
        status: "pending",
        provider: "peyflex",
        provider_reference:
          null,
        metadata,
        description:
          `${service} purchase`,
      })
      .select()
      .single();

  if (transactionError) {
    /*
     * If the transaction itself could not be created,
     * attempt to undo the wallet debit.
     */
    await supabase.rpc(
      "refund_wallet",
      {
        p_user_id: userId,
        p_amount: sellingPrice,
        p_reference:
          `${reference}_ROLLBACK`,
        p_description:
          "Rollback for failed service transaction creation",
      },
    );

    throw new Error(
      transactionError.message ||
        "Unable to create transaction.",
    );
  }

  /*
   * -------------------------------------------------------
   * CALL PEYFLEX
   * -------------------------------------------------------
   */
  try {
    const providerResponse =
      await callProviderPurchase(
        service,
        body,
        pricing.providerPrice,
        quantity,
      );

    const providerRef =
      providerReference(
        providerResponse,
      );

    const status =
      normalizeStatus(
        providerResponse,
      );

    const message =
      providerMessage(
        providerResponse,
      );

    /*
     * -----------------------------------------------------
     * PROVIDER SUCCESS
     * -----------------------------------------------------
     */
    if (
      providerLooksSuccessful(
        providerResponse,
      )
    ) {
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          provider_reference:
            providerRef || null,

          metadata: {
            ...metadata,
            provider_status:
              status,
            provider_message:
              message || null,
            reconciliation_required:
              false,
          },
        })
        .eq(
          "id",
          transaction.id,
        );

      return {
        success: true,
        status: "completed",
        reference,
        provider_reference:
          providerRef || null,
        amount: sellingPrice,
        message:
          message ||
          "Transaction completed successfully.",
      };
    }

    /*
     * -----------------------------------------------------
     * PROVIDER DEFINITIVE FAILURE
     * -----------------------------------------------------
     */
    if (
      providerLooksFailed(
        providerResponse,
      )
    ) {
      /*
       * The provider definitively rejected the request,
       * therefore it is safe to refund.
       */
      const {
        error: refundError,
      } =
        await supabase.rpc(
          "refund_wallet",
          {
            p_user_id: userId,
            p_amount:
              sellingPrice,
            p_reference:
              `${reference}_REFUND`,
            p_description:
              `Refund for failed ${service} purchase`,
          },
        );

      /*
       * Refund failed.
       *
       * Keep transaction flagged for reconciliation.
       */
      if (refundError) {
        await supabase
          .from("transactions")
          .update({
            status: "failed",
            provider_reference:
              providerRef || null,

            metadata: {
              ...metadata,
              provider_status:
                status,
              provider_message:
                message || null,
              reconciliation_required:
                true,
              refund_pending:
                true,
            },
          })
          .eq(
            "id",
            transaction.id,
          );

        return {
          success: false,
          status:
            "refund_pending",
          reference,
          provider_reference:
            providerRef || null,
          amount: sellingPrice,
          error:
            "The provider rejected the transaction, but the automatic refund could not be completed. The transaction has been flagged for reconciliation.",
        };
      }

      /*
       * Refund succeeded.
       */
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          provider_reference:
            providerRef || null,

          metadata: {
            ...metadata,
            provider_status:
              status,
            provider_message:
              message || null,
            reconciliation_required:
              false,
            refunded: true,
          },
        })
        .eq(
          "id",
          transaction.id,
        );

      return {
        success: false,
        status: "failed",
        reference,
        provider_reference:
          providerRef || null,
        amount: sellingPrice,
        refunded: true,
        error:
          message ||
          "The service provider rejected the transaction.",
      };
    }

    /*
     * -----------------------------------------------------
     * AMBIGUOUS PROVIDER RESPONSE
     * -----------------------------------------------------
     *
     * Do NOT refund automatically.
     *
     * The provider may have processed the transaction
     * even if the response was incomplete/ambiguous.
     */
    await supabase
      .from("transactions")
      .update({
        status: "pending",
        provider_reference:
          providerRef || null,

        metadata: {
          ...metadata,
          provider_status:
            status,
          provider_message:
            message || null,
          reconciliation_required:
            true,
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    return {
      success: true,
      status: "pending",
      reference,
      provider_reference:
        providerRef || null,
      amount: sellingPrice,
      message:
        message ||
        "Your transaction is being processed.",
      reconciliation_required:
        true,
    };
  } catch (error) {
    /*
     * -------------------------------------------------------
     * NETWORK / TIMEOUT / UNKNOWN ERROR
     * -------------------------------------------------------
     *
     * NEVER automatically refund here.
     *
     * The request could have reached Peyflex and completed
     * even though IyanjuPay did not receive a response.
     */
    const message =
      error instanceof Error
        ? error.message
        : "Provider request could not be completed.";

    await supabase
      .from("transactions")
      .update({
        status: "pending",

        metadata: {
          ...metadata,
          provider_error:
            message,
          reconciliation_required:
            true,
        },
      })
      .eq(
        "id",
        transaction.id,
      );

    return {
      success: true,
      status: "pending",
      reference,
      amount: sellingPrice,
      message:
        "Your transaction is being processed. Please check your transaction history for the final status.",
      reconciliation_required:
        true,
    };
  }
}

/*
 * ---------------------------------------------------------
 * ACTION NORMALIZATION
 * ---------------------------------------------------------
 *
 * This explicitly supports the action names used by the
 * current ServicePayment.tsx.
 */
function normalizedAction(
  value: unknown,
): string {
  const action =
    clean(value).toLowerCase();

  const aliases: Record<
    string,
    string
  > = {
    catalogue: "catalog",
    get_catalogue: "catalog",
    get_catalog: "catalog",

    get_billers: "billers",
    get_networks: "networks",

    get_items: "items",
    get_plans: "plans",

    verify_customer: "verify",
    verifycustomer: "verify",

    validate_customer:
      "verify",
    validate: "verify",

    pay: "purchase",
    service: "purchase",
  };

  return (
    aliases[action] ??
    action
  );
}

/*
 * ---------------------------------------------------------
 * HTTP HANDLER
 * ---------------------------------------------------------
 */
Deno.serve(async (req) => {
  /*
   * -------------------------------------------------------
   * CORS PREFLIGHT
   * -------------------------------------------------------
   *
   * This MUST happen before authentication.
   *
   * The browser sends OPTIONS without the user's normal
   * authenticated POST request. If getUser() were called
   * before this block, the browser could receive an
   * unauthorized response without CORS headers.
   */
  if (req.method === "OPTIONS") {
    return new Response(
      null,
      {
        status: 204,
        headers:
          CORS_HEADERS,
      },
    );
  }

  /*
   * Only POST is supported.
   */
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Method not allowed.",
      }),
      {
        status: 405,
        headers: {
          ...CORS_HEADERS,
          "Content-Type":
            "application/json",
        },
      },
    );
  }

  try {
    /*
     * -----------------------------------------------------
     * AUTHENTICATION
     * -----------------------------------------------------
     */
    const user =
      await getUser(req);

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unauthorized.",
        }),
        {
          status: 401,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * -----------------------------------------------------
     * PARSE REQUEST
     * -----------------------------------------------------
     */
    let body:
      Record<
        string,
        unknown
      >;

    try {
      body =
        await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Invalid JSON request body.",
        }),
        {
          status: 400,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    const action =
      normalizedAction(
        body?.action ??
          "catalog",
      );

    const service =
      serviceOf(
        body?.service,
      );

    /*
     * Validate service before processing any action.
     */
    if (
      !service ||
      !SUPPORTED_SERVICES.has(
        service,
      )
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unsupported or missing service.",
        }),
        {
          status: 400,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * -----------------------------------------------------
     * BILLERS / NETWORKS / CATALOG
     * -----------------------------------------------------
     *
     * Current ServicePayment:
     *
     * action: "billers"
     *
     * is supported.
     */
    if (
      action === "catalog" ||
      action === "billers" ||
      action === "networks"
    ) {
      const code =
        clean(
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
            "identifier",
            "cable_tv",
            "cableTv",
          ),
        );

      const result =
        await catalog(
          service,
          code ||
            undefined,
        );

      return new Response(
        JSON.stringify(
          result,
        ),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * -----------------------------------------------------
     * ITEMS / PLANS
     * -----------------------------------------------------
     *
     * THIS IS THE IMPORTANT FIX.
     *
     * Your current ServicePayment sends:
     *
     * action: "items"
     *
     * The previous backend did not support this action,
     * which caused:
     *
     * "Unsupported action."
     *
     * It is now explicitly supported.
     */
    if (
      action === "items" ||
      action === "plans"
    ) {
      const code =
        clean(
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
            "identifier",
            "cable_tv",
            "cableTv",
          ),
        );

      const result =
        await catalog(
          service,
          code ||
            undefined,
        );

      return new Response(
        JSON.stringify({
          ...result,

          items:
            Array.isArray(
              result.items,
            )
              ? result.items
              : [],

          plans:
            Array.isArray(
              result.plans,
            )
              ? result.plans
              : Array.isArray(
                  result.items,
                )
              ? result.items
              : [],
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * -----------------------------------------------------
     * CUSTOMER VERIFICATION
     * -----------------------------------------------------
     */
    if (action === "verify") {
      const result =
        await verifyCustomer(
          service,
          body,
        );

      return new Response(
        JSON.stringify(
          result,
        ),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * -----------------------------------------------------
     * PURCHASE
     * -----------------------------------------------------
     */
    if (action === "purchase") {
      const result =
        await purchase(
          user.id,
          service,
          body,
        );

      return new Response(
        JSON.stringify(
          result,
        ),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /*
     * Unknown action.
     */
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Unsupported action.",
        action,
      }),
      {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "peyflex-services error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});
