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

const STANDARD_MARKUP = 0.10;
const AIRTIME_MARKUP = 0;

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

function serviceOf(value: unknown): Service | null {
  const raw = clean(value).toLowerCase();

  const aliases: Record<string, Service> = {
    airtime: "airtime",

    data: "data",
    mobile_data: "data",
    "mobile-data": "data",

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

function itemId(item: unknown): string {
  if (!item || typeof item !== "object") return "";

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

function itemName(item: unknown): string {
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
  if (!item || typeof item !== "object") return "";

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
  if (!item || typeof item !== "object") return "";

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

function publicItem(item: unknown, service: Service) {
  const price = itemPrice(item);

  return {
    id: itemId(item),
    code: itemId(item),
    name: itemName(item),
    price: roundSellingPrice(
      price * (service === "airtime" ? 1 + AIRTIME_MARKUP : 1 + STANDARD_MARKUP),
    ),
    provider_price: price,
    validity: itemValidity(item),
    network: itemNetwork(item),
    raw: item,
  };
}

function publicProvider(item: unknown) {
  if (typeof item === "string") {
    return {
      id: item,
      code: item,
      name: item,
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

function calculateSellingPrice(
  providerPrice: number,
  service: Service,
): number {
  const markup =
    service === "airtime"
      ? AIRTIME_MARKUP
      : STANDARD_MARKUP;

  return roundSellingPrice(providerPrice * (1 + markup));
}

function extractList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

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

function extractObjectData(value: unknown): Record<string, unknown> {
  const obj = asObject(value);

  if (obj.data && typeof obj.data === "object") {
    return asObject(obj.data);
  }

  return obj;
}

function responseList(value: unknown): unknown[] {
  const direct = extractList(value);

  if (direct.length > 0) {
    return direct;
  }

  const data = extractObjectData(value);

  return extractList(data);
}

function flattenEducationPlans(
  value: unknown,
  providerCode = "",
): unknown[] {
  const result: unknown[] = [];

  const providers = responseList(value);

  for (const provider of providers) {
    const providerObj = asObject(provider);

    const currentProviderCode = clean(
      providerObj.code ??
        providerObj.identifier ??
        providerObj.id ??
        providerCode,
    );

    const plans =
      extractList(providerObj.plans).length > 0
        ? extractList(providerObj.plans)
        : extractList(providerObj.items).length > 0
        ? extractList(providerObj.items)
        : extractList(providerObj.products).length > 0
        ? extractList(providerObj.products)
        : extractList(providerObj.available_plans);

    if (plans.length > 0) {
      for (const plan of plans) {
        if (
          plan &&
          typeof plan === "object" &&
          !("provider" in (plan as Record<string, unknown>))
        ) {
          result.push({
            ...(plan as Record<string, unknown>),
            provider: currentProviderCode,
            provider_code: currentProviderCode,
          });
        } else {
          result.push(plan);
        }
      }
    } else {
      result.push(provider);
    }
  }

  return result;
}

async function catalog(
  service: Service,
  code?: string,
) {
  switch (service) {
    case "airtime": {
      const response = await peyflexPublicGet(
        "/api/airtime/networks/",
      );

      const providers = responseList(response).map(publicProvider);

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

    case "data": {
      const networksResponse = await peyflexPublicGet(
        "/api/data/networks/",
      );

      const networks = responseList(networksResponse).map(
        publicProvider,
      );

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

      const plansResponse = await peyflexPublicGet(
        "/api/data/plans/",
        {
          network: code,
        },
      );

      const rawPlans = responseList(plansResponse);

      const items = rawPlans.map((item) =>
        publicItem(item, service)
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

    case "cable": {
      const providersResponse = await peyflexPublicGet(
        "/api/cable/providers/",
      );

      const providers = responseList(providersResponse).map(
        publicProvider,
      );

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

      const plansResponse = await peyflexPublicGet(
        `/api/cable/plans/${encodeURIComponent(code)}/`,
      );

      const rawPlans = responseList(plansResponse);

      const items = rawPlans.map((item) =>
        publicItem(item, service)
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

    case "electricity": {
      const response = await peyflexPublicGet(
        "/api/electricity/plans/",
        {
          identifier: "electricity",
        },
      );

      const companies = responseList(response).map(
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

    case "education": {
      const response = await peyflexPublicGet(
        "/api/education/providers/",
      );

      const providers = responseList(response).map(
        publicProvider,
      );

      let items: unknown[] = [];

      const flattened = flattenEducationPlans(response);

      if (flattened.length > 0) {
        items = flattened.map((item) =>
          publicItem(item, service)
        );
      }

      if (code) {
        items = items.filter((item) => {
          const raw = asObject(item.raw);

          const provider = clean(
            raw.provider ??
              raw.provider_code ??
              raw.providerCode ??
              raw.identifier,
          );

          return (
            !provider ||
            provider === code
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

    case "airtime-card":
    case "data-card":
    case "recharge-card": {
      const response = await peyflexPublicGet(
        "/api/rc/options/",
      );

      const options = responseList(response);

      const items = options.map((item) =>
        publicItem(item, service)
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
      throw new Error("Unsupported service.");
  }
}

async function verifyCustomer(
  service: Service,
  body: Record<string, unknown>,
) {
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
      ),
    );

    if (!iuc) {
      return {
        success: false,
        error: "IUC/Smartcard number is required.",
      };
    }

    if (!identifier) {
      return {
        success: false,
        error: "Cable provider is required.",
      };
    }

    const response = await peyflexPost(
      "/api/cable/verify/",
      {
        iuc,
        identifier,
      },
    );

    return {
      success: !providerLooksFailed(response),
      verified: providerLooksSuccessful(response),
      customer: extractObjectData(response),
      data: response,
      message: providerMessage(response),
    };
  }

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
        error: "Meter number is required.",
      };
    }

    if (!identifier) {
      return {
        success: false,
        error: "Electricity provider is required.",
      };
    }

    const response = await peyflexGet(
      "/api/electricity/verify/",
      {
        identifier: identifier || "electricity",
        meter,
        plan,
        type,
      },
    );

    return {
      success: !providerLooksFailed(response),
      verified: providerLooksSuccessful(response),
      customer: extractObjectData(response),
      data: response,
      message: providerMessage(response),
    };
  }

  return {
    success: true,
    verified: true,
    message: "Verification is not required for this service.",
  };
}

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
    ),
  );

  const catalogue = await catalog(
    service,
    requestedNetwork || undefined,
  );

  const items = Array.isArray(catalogue.items)
    ? catalogue.items
    : [];

  if (!requestedCode) {
    return null;
  }

  const found = items.find((item) => {
    const obj = asObject(item);

    return (
      clean(obj.id) === requestedCode ||
      clean(obj.code) === requestedCode ||
      clean(obj.plan_code) === requestedCode ||
      clean(obj.plan_id) === requestedCode
    );
  });

  return found ?? null;
}

async function authoritativePrice(
  service: Service,
  body: Record<string, unknown>,
): Promise<{
  providerPrice: number;
  sellingPrice: number;
  item: unknown;
}> {
  if (service === "airtime") {
    const amount = numberValue(
      pickBody(
        body,
        "amount",
        "value",
        "price",
      ),
    );

    if (!amount || amount <= 0) {
      throw new Error("A valid airtime amount is required.");
    }

    return {
      providerPrice: amount,
      sellingPrice: amount,
      item: null,
    };
  }

  if (service === "electricity") {
    const amount = numberValue(
      pickBody(
        body,
        "amount",
        "value",
        "price",
      ),
    );

    if (!amount || amount <= 0) {
      throw new Error("A valid electricity amount is required.");
    }

    return {
      providerPrice: amount,
      sellingPrice: calculateSellingPrice(
        amount,
        service,
      ),
      item: null,
    };
  }

  const item = await findCatalogItem(
    service,
    body,
  );

  if (!item) {
    throw new Error(
      "The selected service plan could not be found in the Peyflex catalogue.",
    );
  }

  const providerPrice = itemPrice(item);

  if (!providerPrice || providerPrice <= 0) {
    throw new Error(
      "The selected Peyflex plan has an invalid price.",
    );
  }

  return {
    providerPrice,
    sellingPrice: calculateSellingPrice(
      providerPrice,
      service,
    ),
    item,
  };
}

async function callProviderPurchase(
  service: Service,
  body: Record<string, unknown>,
  providerPrice: number,
  quantity: number,
) {
  const phone = normalizePhone(
    pickBody(
      body,
      "phone",
      "mobile_number",
      "mobileNumber",
      "phone_number",
      "phoneNumber",
    ),
  );

  switch (service) {
    case "airtime": {
      const network = networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
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

    case "data": {
      const network = networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
        ),
      );

      const planCode = clean(
        pickBody(
          body,
          "plan_code",
          "planCode",
          "plan",
          "code",
        ),
      );

      return await peyflexPost(
        "/api/data/purchase/",
        {
          network,
          mobile_number: phone,
          plan_code: planCode,
        },
      );
    }

    case "cable": {
      const identifier = clean(
        pickBody(
          body,
          "identifier",
          "provider",
          "provider_code",
          "providerCode",
          "cable_tv",
          "cableTv",
        ),
      );

      const plan = clean(
        pickBody(
          body,
          "plan",
          "plan_code",
          "planCode",
          "package",
          "package_code",
        ),
      );

      const iuc = clean(
        pickBody(
          body,
          "iuc",
          "smartcard",
          "smartcard_number",
          "smartcardNumber",
        ),
      );

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

    case "electricity": {
      const identifier = clean(
        pickBody(
          body,
          "identifier",
          "provider",
          "provider_code",
          "providerCode",
        ),
      );

      const meter = clean(
        pickBody(
          body,
          "meter",
          "meter_number",
          "meterNumber",
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

      return await peyflexPost(
        "/api/electricity/subscribe/",
        {
          identifier: identifier || "electricity",
          meter,
          plan,
          amount: String(providerPrice),
          type,
          phone,
        },
      );
    }

    case "education": {
      const planId = clean(
        pickBody(
          body,
          "plan_id",
          "planId",
          "plan",
          "code",
        ),
      );

      return await peyflexPost(
        "/api/education/purchase/",
        {
          identifier: "education",
          plan_id: planId,
          quantity: String(quantity),
          phone,
        },
      );
    }

    case "airtime-card":
    case "data-card":
    case "recharge-card": {
      const network = networkCode(
        pickBody(
          body,
          "network",
          "network_code",
          "networkCode",
          "provider",
          "provider_code",
          "providerCode",
        ),
      );

      const pin = clean(
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

    default:
      throw new Error("Unsupported service.");
  }
}

async function purchase(
  userId: string,
  service: Service,
  body: Record<string, unknown>,
) {
  const phone = normalizePhone(
    pickBody(
      body,
      "phone",
      "mobile_number",
      "mobileNumber",
      "phone_number",
      "phoneNumber",
    ),
  );

  if (
    service !== "cable" &&
    service !== "electricity" &&
    !validPhone(phone)
  ) {
    throw new Error(
      "A valid Nigerian phone number is required.",
    );
  }

  const quantityRaw = numberValue(
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

  const pricing = await authoritativePrice(
    service,
    body,
  );

  const providerPrice =
    pricing.providerPrice * quantity;

  const sellingPrice =
    pricing.sellingPrice * quantity;

  const reference =
    `PEY_${crypto.randomUUID()}`;

  const supabase = adminClient();

  const { data: debitData, error: debitError } =
    await supabase.rpc(
      "debit_wallet",
      {
        p_user_id: userId,
        p_amount: sellingPrice,
        p_reference: reference,
        p_description: `${service} purchase`,
      },
    );

  if (debitError) {
    throw new Error(
      debitError.message ||
        "Unable to debit wallet.",
    );
  }

  const debitResult = Array.isArray(debitData)
    ? debitData[0]
    : debitData;

  if (
    debitResult &&
    typeof debitResult === "object" &&
    "success" in debitResult &&
    !Boolean(
      (debitResult as Record<string, unknown>).success,
    )
  ) {
    throw new Error(
      clean(
        (debitResult as Record<string, unknown>).message,
      ) || "Unable to debit wallet.",
    );
  }

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
      sellingPrice - providerPrice,
    markup_rate:
      service === "airtime"
        ? AIRTIME_MARKUP
        : STANDARD_MARKUP,
    quantity,
    selected_item: pricing.item,
    reconciliation_required: false,
  };

  const { data: transaction, error: transactionError } =
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        reference_number: reference,
        transaction_type: "service_purchase",
        amount: sellingPrice,
        status: "pending",
        provider: "peyflex",
        provider_reference: null,
        metadata,
        description: `${service} purchase`,
      })
      .select()
      .single();

  if (transactionError) {
    await supabase.rpc(
      "refund_wallet",
      {
        p_user_id: userId,
        p_amount: sellingPrice,
        p_reference: `${reference}_ROLLBACK`,
        p_description:
          "Rollback for failed service transaction creation",
      },
    );

    throw new Error(
      transactionError.message ||
        "Unable to create transaction.",
    );
  }

  try {
    const providerResponse =
      await callProviderPurchase(
        service,
        body,
        pricing.providerPrice,
        quantity,
      );

    const providerRef =
      providerReference(providerResponse);

    const status =
      normalizeStatus(providerResponse);

    const message =
      providerMessage(providerResponse);

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
            provider_response:
              providerResponse,
            provider_status:
              status,
            reconciliation_required:
              false,
          },
        })
        .eq("id", transaction.id);

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

    if (
      providerLooksFailed(
        providerResponse,
      )
    ) {
      const { error: refundError } =
        await supabase.rpc(
          "refund_wallet",
          {
            p_user_id: userId,
            p_amount: sellingPrice,
            p_reference: `${reference}_REFUND`,
            p_description:
              `Refund for failed ${service} purchase`,
          },
        );

      if (refundError) {
        await supabase
          .from("transactions")
          .update({
            status: "failed",
            provider_reference:
              providerRef || null,
            metadata: {
              ...metadata,
              provider_response:
                providerResponse,
              provider_status:
                status,
              reconciliation_required:
                true,
              refund_pending: true,
            },
          })
          .eq("id", transaction.id);

        return {
          success: false,
          status: "refund_pending",
          reference,
          provider_reference:
            providerRef || null,
          amount: sellingPrice,
          error:
            "The provider rejected the transaction and the automatic refund could not be completed. The transaction has been flagged for reconciliation.",
        };
      }

      await supabase
        .from("transactions")
        .update({
          status: "failed",
          provider_reference:
            providerRef || null,
          metadata: {
            ...metadata,
            provider_response:
              providerResponse,
            provider_status:
              status,
            reconciliation_required:
              false,
            refunded: true,
          },
        })
        .eq("id", transaction.id);

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

    await supabase
      .from("transactions")
      .update({
        status: "pending",
        provider_reference:
          providerRef || null,
        metadata: {
          ...metadata,
          provider_response:
            providerResponse,
          provider_status:
            status,
          reconciliation_required:
            true,
        },
      })
      .eq("id", transaction.id);

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
      reconciliation_required: true,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Provider request could not be completed.";

    /*
     * IMPORTANT:
     *
     * A network error / timeout is NOT automatically refunded.
     * The provider may have received and processed the request.
     * The transaction therefore remains pending and is flagged
     * for reconciliation.
     */

    await supabase
      .from("transactions")
      .update({
        status: "pending",
        metadata: {
          ...metadata,
          provider_error: message,
          reconciliation_required: true,
        },
      })
      .eq("id", transaction.id);

    return {
      success: true,
      status: "pending",
      reference,
      amount: sellingPrice,
      message:
        "Your transaction is being processed. Please check your transaction history for the final status.",
      reconciliation_required: true,
    };
  }
}

function normalizedAction(value: unknown): string {
  const action = clean(value).toLowerCase();

  const aliases: Record<string, string> = {
    catalogue: "catalog",
    get_catalogue: "catalog",
    get_catalog: "catalog",

    get_billers: "billers",
    get_networks: "networks",

    get_items: "items",
    get_plans: "plans",

    verify_customer: "verify",
    verifycustomer: "verify",

    validate_customer: "verify",
    validate: "verify",

    pay: "purchase",
    service: "purchase",
  };

  return aliases[action] ?? action;
}

Deno.serve(async (req) => {
  const headers = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
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
          error: "Unauthorized.",
        },
        401,
      );
    }

    let body: Record<string, unknown>;

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

    const action = normalizedAction(
      body?.action ?? "catalog",
    );

    const service = serviceOf(
      body?.service,
    );

    /*
     * Some catalogue calls can technically be made
     * without a service, but ServicePayment always supplies
     * one. Keep the validation explicit so bad requests do
     * not silently hit the provider.
     */
    if (!service || !SUPPORTED_SERVICES.has(service)) {
      return json(
        {
          success: false,
          error: "Unsupported or missing service.",
        },
        400,
      );
    }

    /*
     * -------------------------------------------------------
     * CATALOGUE / BILLERS / NETWORKS
     * -------------------------------------------------------
     *
     * ServicePayment currently calls:
     *
     * { action: "billers", service: "..." }
     *
     * and then:
     *
     * { action: "items", service: "...", biller_code: "..." }
     *
     * Both are intentionally supported here.
     */
    if (
      action === "catalog" ||
      action === "billers" ||
      action === "networks"
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
          "identifier",
          "cable_tv",
          "cableTv",
        ),
      );

      const result = await catalog(
        service,
        code || undefined,
      );

      return json(result);
    }

    /*
     * -------------------------------------------------------
     * ITEMS / PLANS
     * -------------------------------------------------------
     *
     * This is the critical compatibility fix for the current
     * ServicePayment.tsx.
     *
     * The frontend sends:
     *
     * action: "items"
     *
     * The previous backend did NOT recognize that action and
     * returned:
     *
     * Unsupported action.
     */
    if (
      action === "items" ||
      action === "plans"
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
          "identifier",
          "cable_tv",
          "cableTv",
        ),
      );

      const result = await catalog(
        service,
        code || undefined,
      );

      return json({
        ...result,
        items:
          Array.isArray(result.items)
            ? result.items
            : [],
        plans:
          Array.isArray(result.plans)
            ? result.plans
            : Array.isArray(result.items)
            ? result.items
            : [],
      });
    }

    /*
     * -------------------------------------------------------
     * CUSTOMER VERIFICATION
     * -------------------------------------------------------
     */
    if (action === "verify") {
      const result =
        await verifyCustomer(
          service,
          body,
        );

      return json(result);
    }

    /*
     * -------------------------------------------------------
     * PURCHASE
     * -------------------------------------------------------
     */
    if (action === "purchase") {
      const result =
        await purchase(
          user.id,
          service,
          body,
        );

      return json(result);
    }

    return json(
      {
        success: false,
        error: "Unsupported action.",
        action,
      },
      400,
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

    return json(
      {
        success: false,
        error: message,
      },
      500,
    );
  }
});
