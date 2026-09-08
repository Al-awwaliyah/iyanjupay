import {
  asArray,
  asObject,
  extractObjectData,
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
  getUser,
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

const SUPPORTED_SERVICES =
  new Set<Service>([
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
 * ---------------------------------------------------------
 * PRICING
 * ---------------------------------------------------------
 *
 * Airtime:
 *   0%
 *
 * Everything else:
 *   10%
 *
 * Final selling price is rounded UP to nearest ₦5.
 */
const STANDARD_MARKUP = 0.10;
const AIRTIME_MARKUP = 0;

/*
 * ---------------------------------------------------------
 * CORS
 * ---------------------------------------------------------
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Access-Control-Max-Age":
    "86400",
  "Content-Type":
    "application/json",
};

/*
 * ---------------------------------------------------------
 * BASIC HELPERS
 * ---------------------------------------------------------
 */

function clean(
  value: unknown,
): string {
  return text(value).trim();
}

function bodyObject(
  value: unknown,
): Record<string, any> {
  return asObject(value);
}

function pickBody(
  body: Record<string, unknown>,
  ...keys: string[],
): unknown {
  const obj =
    bodyObject(body);

  const details =
    asObject(
      obj.details,
    );

  for (
    const key of keys
  ) {
    const direct =
      obj[key];

    if (
      direct !== undefined &&
      direct !== null &&
      clean(direct) !== ""
    ) {
      return direct;
    }

    const nested =
      details[key];

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

/*
 * ---------------------------------------------------------
 * SERVICE NORMALIZATION
 * ---------------------------------------------------------
 */
function serviceOf(
  value: unknown,
): Service | null {
  const raw =
    clean(value)
      .toLowerCase();

  const aliases:
    Record<string, Service> = {
      airtime:
        "airtime",

      data:
        "data",

      mobile_data:
        "data",

      "mobile-data":
        "data",

      mobiledata:
        "data",

      cable:
        "cable",

      cabletv:
        "cable",

      "cable-tv":
        "cable",

      electricity:
        "electricity",

      electric:
        "electricity",

      education:
        "education",

      waec:
        "education",

      jamb:
        "education",

      "airtime-card":
        "airtime-card",

      airtime_card:
        "airtime-card",

      airtime_epin:
        "airtime-card",

      "airtime-epin":
        "airtime-card",

      airtimepin:
        "airtime-card",

      "data-card":
        "data-card",

      data_card:
        "data-card",

      data_epin:
        "data-card",

      "data-epin":
        "data-card",

      datapin:
        "data-card",

      "recharge-card":
        "recharge-card",

      recharge_card:
        "recharge-card",

      recharge:
        "recharge-card",

      epin:
        "recharge-card",
    };

  return (
    aliases[raw] ??
    null
  );
}

/*
 * ---------------------------------------------------------
 * PHONE
 * ---------------------------------------------------------
 */
function normalizePhone(
  value: unknown,
): string {
  let phone =
    clean(value)
      .replace(
        /[^\d+]/g,
        "",
      );

  if (
    phone.startsWith("+234")
  ) {
    phone =
      "234" +
      phone.slice(4);
  } else if (
    phone.startsWith("0")
  ) {
    phone =
      "234" +
      phone.slice(1);
  }

  return phone;
}

function validPhone(
  phone: string,
): boolean {
  return /^234[789]\d{9}$/.test(
    phone,
  );
}

/*
 * ---------------------------------------------------------
 * NETWORK
 * ---------------------------------------------------------
 */
function networkCode(
  value: unknown,
): string {
  if (
    value &&
    typeof value ===
      "object"
  ) {
    const obj =
      asObject(value);

    return clean(
      firstValue(
        obj.code,
        obj.network_code,
        obj.networkCode,
        obj.identifier,
        obj.provider_code,
        obj.providerCode,
        obj.id,
        obj.value,
      ),
    );
  }

  const raw =
    clean(value);

  const normalized =
    raw
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      );

  if (
    normalized.includes(
      "airtel",
    )
  ) {
    return "airtel";
  }

  if (
    normalized === "mtn" ||
    normalized.includes(
      "mtn",
    )
  ) {
    return "mtn";
  }

  if (
    normalized === "glo" ||
    normalized.includes(
      "glo",
    )
  ) {
    return "glo";
  }

  if (
    normalized.includes(
      "9mobile",
    ) ||
    normalized.includes(
      "etisalat",
    )
  ) {
    return "9mobile";
  }

  return raw;
}

/*
 * ---------------------------------------------------------
 * PROVIDER ITEM HELPERS
 * ---------------------------------------------------------
 */
function itemId(
  item: unknown,
): string {
  const obj =
    asObject(item);

  return clean(
    firstValue(
      obj.id,
      obj.ID,
      obj.code,
      obj.Code,
      obj.plan_code,
      obj.planCode,
      obj.plan_id,
      obj.planId,
      obj.identifier,
      obj.value,
      obj.product_code,
      obj.productCode,
    ),
  );
}

function rawItemName(
  item: unknown,
): string {
  const obj =
    asObject(item);

  return clean(
    firstValue(
      obj.name,
      obj.Name,
      obj.plan_name,
      obj.planName,
      obj.title,
      obj.Title,
      obj.description,
      obj.Description,
      obj.package_name,
      obj.packageName,
      obj.label,
      obj.Label,
      obj.product_name,
      obj.productName,
      obj.denomination_name,
      obj.denominationName,
      itemId(item),
    ),
  );
}

/*
 * Provider classifications must NEVER become
 * customer-facing labels.
 */
function cleanCustomerPlanName(
  value: unknown,
): string {
  let name =
    clean(value);

  name =
    name
      .replace(
        /\bSME\b/gi,
        "",
      )
      .replace(
        /\bDIRECT\s+DATA\b/gi,
        "",
      )
      .replace(
        /\bDIRECT\b/gi,
        "",
      )
      .replace(
        /\bGIFTING\b/gi,
        "",
      )
      .replace(
        /\bGIFT\b/gi,
        "",
      )
      .replace(
        /\bAWOOF\b/gi,
        "",
      )
      .replace(
        /\bCORPORATE\s+DATA\b/gi,
        "",
      )
      .replace(
        /\bCORPORATE\b/gi,
        "",
      )
      .replace(
        /\bBUSINESS\s+DATA\b/gi,
        "",
      )
      .replace(
        /\bPROMO\b/gi,
        "",
      )
      .replace(
        /\bPROMOTION\b/gi,
        "",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  name =
    name
      .replace(
        /^\s*[-–—|:/]+\s*/,
        "",
      )
      .replace(
        /\s*[-–—|:/]+\s*$/g,
        "",
      )
      .replace(
        /\(\s*\)/g,
        "",
      )
      .replace(
        /\[\s*\]/g,
        "",
      )
      .replace(
        /\{\s*\}/g,
        "",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  return name;
}

/*
 * ---------------------------------------------------------
 * PRICE EXTRACTION
 * ---------------------------------------------------------
 */
function itemPrice(
  item: unknown,
): number {
  const raw =
    asObject(item);

  const nestedCandidates = [
    raw.data,
    raw.plan,
    raw.product,
    raw.option,
    raw.details,
    raw.package,
    raw.product_details,
    raw.plan_details,
  ];

  let nested:
    Record<string, any> = {};

  for (
    const candidate of
      nestedCandidates
  ) {
    const obj =
      asObject(candidate);

    if (
      Object.keys(obj)
        .length > 0
    ) {
      nested = obj;
      break;
    }
  }

  const direct =
    numberValue(
      firstValue(
        raw.price,
        raw.Price,

        raw.amount,
        raw.Amount,

        raw.cost,
        raw.Cost,

        raw.selling_price,
        raw.sellingPrice,

        raw.provider_price,
        raw.providerPrice,

        raw.provider_amount,
        raw.providerAmount,

        raw.plan_amount,
        raw.planAmount,

        raw.plan_price,
        raw.planPrice,

        raw.denomination,

        raw.face_value,
        raw.faceValue,

        raw.value,
      ),
    );

  if (
    direct > 0
  ) {
    return direct;
  }

  return numberValue(
    firstValue(
      nested.price,
      nested.Price,

      nested.amount,
      nested.Amount,

      nested.cost,
      nested.Cost,

      nested.selling_price,
      nested.sellingPrice,

      nested.provider_price,
      nested.providerPrice,

      nested.provider_amount,
      nested.providerAmount,

      nested.plan_amount,
      nested.planAmount,

      nested.plan_price,
      nested.planPrice,

      nested.denomination,

      nested.face_value,
      nested.faceValue,

      nested.value,
    ),
  );
}

/*
 * ---------------------------------------------------------
 * VALIDITY
 * ---------------------------------------------------------
 */
function itemValidity(
  item: unknown,
): string {
  const obj =
    asObject(item);

  const raw =
    firstValue(
      obj.validity,
      obj.validity_period,
      obj.validityPeriod,
      obj.validity_days,
      obj.validityDays,
      obj.duration,
      obj.duration_days,
      obj.durationDays,
      obj.period,
      obj.days,
    );

  if (
    raw !== undefined &&
    raw !== null
  ) {
    const value =
      clean(raw);

    if (value) {
      return value;
    }
  }

  const name =
    clean(
      rawItemName(item),
    );

  const match =
    name.match(
      /\b\d+\s*(?:day|days|week|weeks|month|months)\b/i,
    );

  return match
    ? match[0]
    : "";
}

/*
 * ---------------------------------------------------------
 * NETWORK FROM PLAN
 * ---------------------------------------------------------
 */
function itemNetwork(
  item: unknown,
  fallback = "",
): string {
  const obj =
    asObject(item);

  return clean(
    firstValue(
      obj.network,
      obj.network_code,
      obj.networkCode,
      obj.network_id,
      obj.networkId,
      obj.provider_code,
      obj.providerCode,
      obj.identifier,
      fallback,
    ),
  );
}

/*
 * ---------------------------------------------------------
 * NECO FILTER
 * ---------------------------------------------------------
 */
function isNeco(
  item: unknown,
): boolean {
  const obj =
    asObject(item);

  const nestedObjects = [
    obj.provider,
    obj.data,
    obj.plan,
    obj.product,
    obj.option,
    obj.details,
  ];

  const nestedText =
    nestedObjects
      .map((value) => {
        const nested =
          asObject(value);

        return [
          nested.name,
          nested.Name,
          nested.title,
          nested.Title,
          nested.description,
          nested.Description,
          nested.code,
          nested.Code,
          nested.id,
          nested.ID,
        ]
          .map(clean)
          .join(" ");
      })
      .join(" ");

  const haystack = [
    obj.name,
    obj.Name,
    obj.title,
    obj.Title,
    obj.description,
    obj.Description,
    obj.provider,
    obj.provider_name,
    obj.providerName,
    obj.code,
    obj.Code,
    obj.id,
    obj.ID,
    obj.plan_id,
    obj.planId,
    obj.plan_code,
    obj.planCode,
    nestedText,
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  return /\bneco\b/.test(
    haystack,
  );
}

/*
 * ---------------------------------------------------------
 * PUBLIC PROVIDER
 * ---------------------------------------------------------
 */
function publicProvider(
  item: unknown,
): Record<string, unknown> {
  if (
    typeof item ===
    "string"
  ) {
    return {
      id: item,
      code: item,
      name: item,
    };
  }

  const obj =
    asObject(item);

  const code =
    clean(
      firstValue(
        obj.identifier,
        obj.code,
        obj.Code,
        obj.id,
        obj.ID,
        obj.network_code,
        obj.networkCode,
        obj.provider_code,
        obj.providerCode,
      ),
    );

  const name =
    clean(
      firstValue(
        obj.name,
        obj.Name,
        obj.network_name,
        obj.networkName,
        obj.provider_name,
        obj.providerName,
        obj.title,
        obj.Title,
        obj.label,
        obj.Label,
        code,
      ),
    );

  return {
    id: code,
    code,
    name,
  };
}

/*
 * ---------------------------------------------------------
 * PUBLIC ITEM
 * ---------------------------------------------------------
 *
 * Only safe customer-facing catalogue fields are exposed.
 */
function publicItem(
  item: unknown,
  service: Service,
  fallbackNetwork = "",
): Record<string, unknown> {
  const obj =
    asObject(item);

  const id =
    itemId(obj);

  const providerPrice =
    itemPrice(obj);

  const markup =
    service === "airtime"
      ? AIRTIME_MARKUP
      : STANDARD_MARKUP;

  const price =
    providerPrice > 0
      ? roundSellingPrice(
          providerPrice,
          markup,
        )
      : 0;

  const network =
    itemNetwork(
      obj,
      fallbackNetwork,
    );

  return {
    id,

    code:
      id,

    name:
      cleanCustomerPlanName(
        rawItemName(obj),
      ),

    price,

    provider_price:
      providerPrice,

    validity:
      itemValidity(obj),

    network:
      network
        ? network
        : "",
  };
}

/*
 * ---------------------------------------------------------
 * RESPONSE LIST
 * ---------------------------------------------------------
 */
function extractList(
  value: unknown,
): unknown[] {
  if (
    Array.isArray(value)
  ) {
    return value;
  }

  const obj =
    asObject(value);

  const candidates = [
    obj.results,
    obj.items,
    obj.plans,
    obj.providers,
    obj.networks,
    obj.billers,
    obj.options,
    obj.products,
    obj.available_plans,
    obj.data,
  ];

  for (
    const candidate of
      candidates
  ) {
    if (
      Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  /*
   * Nested response.
   */
  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    const nested =
      extractList(
        obj.data,
      );

    if (
      nested.length > 0
    ) {
      return nested;
    }
  }

  return [];
}

function responseList(
  value: unknown,
): unknown[] {
  /*
   * peyflexPublicGet() returns an HTTP
   * result wrapper. asObject()/asArray()
   * from _shared/peyflex.ts unwrap that wrapper.
   */
  const direct =
    extractList(value);

  if (
    direct.length > 0
  ) {
    return direct;
  }

  return asArray(value);
}

/*
 * ---------------------------------------------------------
 * RECURSIVE CATALOGUE OBJECT EXTRACTION
 * ---------------------------------------------------------
 *
 * Peyflex catalogue endpoints can return arrays,
 * nested data objects, keyed maps or option objects.
 */
function catalogueObjects(
  value: unknown,
  depth = 0,
): unknown[] {
  if (
    depth > 6 ||
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (
    Array.isArray(value)
  ) {
    const result:
      unknown[] = [];

    for (
      const entry of
        value
    ) {
      if (
        entry &&
        typeof entry ===
          "object"
      ) {
        result.push(
          entry,
        );
      } else if (
        typeof entry ===
          "string" ||
        typeof entry ===
          "number"
      ) {
        result.push({
          value:
            entry,
          name:
            String(entry),
        });
      }
    }

    return result;
  }

  if (
    typeof value !==
      "object"
  ) {
    if (
      typeof value ===
        "string" ||
      typeof value ===
        "number"
    ) {
      return [
        {
          value:
            value,
          name:
            String(value),
        },
      ];
    }

    return [];
  }

  const obj =
    asObject(value);

  /*
   * Prefer known catalogue containers.
   */
  const containers = [
    obj.results,
    obj.items,
    obj.plans,
    obj.products,
    obj.options,
    obj.available_plans,
    obj.networks,
    obj.providers,
    obj.billers,
  ];

  for (
    const container of
      containers
  ) {
    if (
      container !== undefined &&
      container !== null
    ) {
      const nested =
        catalogueObjects(
          container,
          depth + 1,
        );

      if (
        nested.length > 0
      ) {
        return nested;
      }
    }
  }

  /*
   * data can itself be a list or nested object.
   */
  if (
    obj.data !== undefined &&
    obj.data !== null
  ) {
    const nested =
      catalogueObjects(
        obj.data,
        depth + 1,
      );

    if (
      nested.length > 0
    ) {
      return nested;
    }
  }

  /*
   * If this object itself has catalogue-like
   * product fields, keep it.
   */
  const hasProductIdentity =
    Boolean(
      clean(
        firstValue(
          obj.id,
          obj.ID,
          obj.code,
          obj.Code,
          obj.plan_code,
          obj.planCode,
          obj.plan_id,
          obj.planId,
          obj.identifier,
          obj.product_code,
          obj.productCode,
          obj.name,
          obj.Name,
          obj.title,
          obj.Title,
          obj.denomination,
          obj.amount,
          obj.price,
          obj.value,
        ),
      ),
    );

  if (
    hasProductIdentity
  ) {
    return [
      obj,
    ];
  }

  /*
   * Keyed map:
   *
   * {
   *   "mtn": {...},
   *   "airtel": {...}
   * }
   *
   * or:
   *
   * {
   *   "100": {...},
   *   "200": {...}
   * }
   */
  const entries =
    Object.entries(
      obj,
    );

  const mapped:
    unknown[] = [];

  for (
    const [
      key,
      entry,
    ] of entries
  ) {
    if (
      entry &&
      typeof entry ===
        "object" &&
      !Array.isArray(entry)
    ) {
      const entryObj =
        asObject(entry);

      mapped.push({
        ...entryObj,

        code:
          firstValue(
            entryObj.code,
            entryObj.Code,
            entryObj.id,
            entryObj.ID,
            key,
          ),

        name:
          firstValue(
            entryObj.name,
            entryObj.Name,
            entryObj.title,
            entryObj.Title,
            key,
          ),
      });

      continue;
    }

    if (
      typeof entry ===
        "string" ||
      typeof entry ===
        "number"
    ) {
      mapped.push({
        code:
          key,

        name:
          key,

        value:
          entry,

        amount:
          entry,
      });
    }
  }

  return mapped;
}

/*
 * ---------------------------------------------------------
 * EDUCATION FLATTENER
 * ---------------------------------------------------------
 */
function flattenEducationPlans(
  value: unknown,
): unknown[] {
  const result:
    unknown[] = [];

  const topLevel =
    responseList(value);

  for (
    const provider of
      topLevel
  ) {
    if (
      isNeco(provider)
    ) {
      continue;
    }

    const providerObj =
      asObject(provider);

    const providerCode =
      clean(
        firstValue(
          providerObj.identifier,
          providerObj.code,
          providerObj.id,
          providerObj.provider_code,
          providerObj.providerCode,
          "education",
        ),
      );

    const nestedCandidates = [
      providerObj.plans,
      providerObj.items,
      providerObj.products,
      providerObj.available_plans,
      providerObj.options,
      providerObj.data,
    ];

    let plans:
      unknown[] = [];

    for (
      const candidate of
        nestedCandidates
    ) {
      if (
        candidate ===
          undefined ||
        candidate ===
          null
      ) {
        continue;
      }

      const extracted =
        catalogueObjects(
          candidate,
        );

      if (
        extracted.length > 0
      ) {
        plans =
          extracted;
        break;
      }
    }

    /*
     * If no nested plans exist, the provider itself
     * may already be the purchasable product.
     */
    if (
      plans.length === 0
    ) {
      if (
        !isNeco(
          provider,
        )
      ) {
        result.push({
          ...(
            providerObj
          ),

          provider:
            providerCode,

          provider_code:
            providerCode,
        });
      }

      continue;
    }

    for (
      const plan of
        plans
    ) {
      if (
        isNeco(plan)
      ) {
        continue;
      }

      if (
        plan &&
        typeof plan ===
          "object"
      ) {
        const planObj =
          asObject(plan);

        result.push({
          ...planObj,

          provider:
            providerCode,

          provider_code:
            providerCode,
        });
      } else {
        result.push({
          value:
            plan,

          name:
            String(plan),

          provider:
            providerCode,

          provider_code:
            providerCode,
        });
      }
    }
  }

  /*
   * Direct-plan response fallback.
   */
  if (
    result.length === 0 &&
    topLevel.length > 0
  ) {
    for (
      const item of
        topLevel
    ) {
      if (
        !isNeco(item)
      ) {
        result.push(
          item,
        );
      }
    }
  }

  return result;
}

/*
 * ---------------------------------------------------------
 * RECHARGE CARD FLATTENER
 * ---------------------------------------------------------
 */
function flattenRechargeOptions(
  value: unknown,
): unknown[] {
  const result:
    unknown[] = [];

  /*
   * First try standard catalogue arrays.
   */
  const direct =
    extractList(value);

  if (
    direct.length > 0
  ) {
    return catalogueObjects(
      direct,
    );
  }

  const payload =
    asObject(value);

  /*
   * options may itself be a map.
   */
  const options =
    payload.options;

  if (
    options &&
    typeof options ===
      "object" &&
    !Array.isArray(options)
  ) {
    for (
      const [
        key,
        option,
      ] of Object.entries(
        options as Record<
          string,
          unknown
        >,
      )
    ) {
      if (
        option &&
        typeof option ===
          "object"
      ) {
        const optionObj =
          asObject(
            option,
          );

        result.push({
          ...optionObj,

          code:
            firstValue(
              optionObj.code,
              optionObj.Code,
              optionObj.id,
              optionObj.ID,
              key,
            ),

          name:
            firstValue(
              optionObj.name,
              optionObj.Name,
              optionObj.title,
              optionObj.Title,
              key,
            ),
        });
      } else if (
        typeof option ===
          "string" ||
        typeof option ===
          "number"
      ) {
        result.push({
          code:
            key,

          value:
            option,

          amount:
            option,

          name:
            key,
        });
      }
    }
  }

  /*
   * data may also be a keyed map.
   */
  const data =
    payload.data;

  if (
    data &&
    typeof data ===
      "object" &&
    !Array.isArray(data)
  ) {
    for (
      const [
        key,
        option,
      ] of Object.entries(
        data as Record<
          string,
          unknown
        >,
      )
    ) {
      if (
        option &&
        typeof option ===
          "object"
      ) {
        const optionObj =
          asObject(
            option,
          );

        result.push({
          ...optionObj,

          code:
            firstValue(
              optionObj.code,
              optionObj.Code,
              optionObj.id,
              optionObj.ID,
              key,
            ),

          name:
            firstValue(
              optionObj.name,
              optionObj.Name,
              optionObj.title,
              optionObj.Title,
              key,
            ),
        });
      } else if (
        typeof option ===
          "string" ||
        typeof option ===
          "number"
      ) {
        result.push({
          code:
            key,

          value:
            option,

          amount:
            option,

          name:
            key,
        });
      }
    }
  }

  /*
   * Generic fallback for any remaining keyed
   * object returned by Peyflex.
   */
  if (
    result.length === 0
  ) {
    return catalogueObjects(
      value,
    );
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
  /*
   * -------------------------------------------------------
   * AIRTIME
   * -------------------------------------------------------
   */
  if (
    service === "airtime"
  ) {
    const response =
      await peyflexPublicGet(
        "/api/airtime/networks/",
      );

    const networks =
      responseList(
        response,
      )
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          publicProvider,
        );

    return {
      success:
        response.ok,

      service,

      amount_based:
        true,

      billers:
        networks,

      networks,

      providers:
        networks,

      items: [],

      plans: [],
    };
  }

  /*
   * -------------------------------------------------------
   * DATA
   * -------------------------------------------------------
   */
  if (
    service === "data"
  ) {
    const networksResponse =
      await peyflexPublicGet(
        "/api/data/networks/",
      );

    const networks =
      responseList(
        networksResponse,
      )
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          publicProvider,
        );

    if (!code) {
      return {
        success:
          networksResponse.ok,

        service,

        amount_based:
          false,

        billers:
          networks,

        networks,

        providers:
          networks,

        items: [],

        plans: [],
      };
    }

    const plansResponse =
      await peyflexPublicGet(
        "/api/data/plans/",
        {
          network:
            networkCode(code),
        },
      );

    const rawPlans =
      responseList(
        plansResponse,
      );

    const items =
      rawPlans
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          (item) =>
            publicItem(
              item,
              service,
              code,
            ),
        )
        .filter(
          (item) =>
            clean(item.id) !==
              "" &&
            numberValue(
              item.provider_price,
            ) > 0,
        );

    return {
      success:
        plansResponse.ok,

      service,

      amount_based:
        false,

      billers:
        networks,

      networks,

      providers:
        networks,

      items,

      plans:
        items,
    };
  }

  /*
   * -------------------------------------------------------
   * CABLE
   * -------------------------------------------------------
   */
  if (
    service === "cable"
  ) {
    const providersResponse =
      await peyflexPublicGet(
        "/api/cable/providers/",
      );

    const providers =
      responseList(
        providersResponse,
      )
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          publicProvider,
        );

    if (!code) {
      return {
        success:
          providersResponse.ok,

        service,

        amount_based:
          false,

        billers:
          providers,

        providers,

        items: [],

        plans: [],
      };
    }

    const plansResponse =
      await peyflexPublicGet(
        `/api/cable/plans/${encodeURIComponent(
          code,
        )}/`,
      );

    const rawPlans =
      responseList(
        plansResponse,
      );

    const items =
      rawPlans
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          (item) =>
            publicItem(
              item,
              service,
              code,
            ),
        )
        .filter(
          (item) =>
            clean(item.id) !==
              "" &&
            numberValue(
              item.provider_price,
            ) > 0,
        );

    return {
      success:
        plansResponse.ok,

      service,

      amount_based:
        false,

      billers:
        providers,

      providers,

      items,

      plans:
        items,
    };
  }

  /*
   * -------------------------------------------------------
   * ELECTRICITY
   * -------------------------------------------------------
   */
  if (
    service ===
      "electricity"
  ) {
    const response =
      await peyflexPublicGet(
        "/api/electricity/plans/",
        {
          identifier:
            "electricity",
        },
      );

    const companies =
      responseList(
        response,
      )
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          publicProvider,
        );

    return {
      success:
        response.ok,

      service,

      amount_based:
        true,

      billers:
        companies,

      providers:
        companies,

      items: [],

      plans: [],
    };
  }

  /*
   * -------------------------------------------------------
   * EDUCATION
   * -------------------------------------------------------
   */
  if (
    service === "education"
  ) {
    const response =
      await peyflexPublicGet(
        "/api/education/providers/",
      );

    /*
     * Remove NECO providers.
     */
    const providerRaw =
      responseList(
        response,
      ).filter(
        (provider) =>
          !isNeco(provider),
      );

    const providers =
      providerRaw.map(
        publicProvider,
      );

    /*
     * Flatten nested education plans.
     */
    let rawItems =
      flattenEducationPlans(
        response,
      );

    /*
     * Remove NECO plans as well.
     */
    rawItems =
      rawItems.filter(
        (item) =>
          !isNeco(item),
      );

    let items =
      rawItems
        .map(
          (item) =>
            publicItem(
              item,
              service,
              code ||
                "education",
            ),
        )
        .filter(
          (item) =>
            clean(item.id) !==
              "" &&
            numberValue(
              item.provider_price,
            ) > 0,
        );

    /*
     * If a provider was selected, filter
     * by its internal network/provider identifier.
     */
    if (code) {
      const selected =
        clean(code)
          .toLowerCase();

      items =
        items.filter(
          (item) => {
            const itemNetwork =
              clean(
                item.network,
              ).toLowerCase();

            return (
              !itemNetwork ||
              itemNetwork ===
                selected
            );
          },
        );
    }

    return {
      success:
        response.ok,

      service,

      amount_based:
        false,

      billers:
        providers,

      providers,

      items,

      plans:
        items,
    };
  }

  /*
   * -------------------------------------------------------
   * RECHARGE / AIRTIME CARD / DATA CARD
   * -------------------------------------------------------
   */
  if (
    service ===
      "airtime-card" ||
    service ===
      "data-card" ||
    service ===
      "recharge-card"
  ) {
    const response =
      await peyflexPublicGet(
        "/api/rc/options/",
      );

    const options =
      flattenRechargeOptions(
        response,
      );

    const items =
      options
        .filter(
          (item) =>
            !isNeco(item),
        )
        .map(
          (item) =>
            publicItem(
              item,
              service,
            ),
        )
        .filter(
          (item) =>
            clean(item.id) !==
              "" &&
            numberValue(
              item.provider_price,
            ) > 0,
        );

    return {
      success:
        response.ok,

      service,

      amount_based:
        false,

      billers: [],

      providers: [],

      items,

      plans:
        items,
    };
  }

  throw new Error(
    "Unsupported service.",
  );
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
   * -------------------------------------------------------
   * CABLE
   * -------------------------------------------------------
   */
  if (
    service === "cable"
  ) {
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

    const providerResponse =
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
          providerResponse,
        ),

      verified:
        providerLooksSuccessful(
          providerResponse,
        ),

      customer:
        extractObjectData(
          providerResponse,
        ),

      data:
        providerResponse,

      message:
        providerMessage(
          providerResponse,
        ),
    };
  }

  /*
   * -------------------------------------------------------
   * ELECTRICITY
   * -------------------------------------------------------
   */
  if (
    service === "electricity"
  ) {
    const meter =
      clean(
        pickBody(
          body,
          "meter",
          "meter_number",
          "meterNumber",
        ),
      );

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

    const providerResponse =
      await peyflexGet(
        "/api/electricity/verify/",
        {
          identifier,
          meter,
          plan,
          type,
        },
      );

    return {
      success:
        !providerLooksFailed(
          providerResponse,
        ),

      verified:
        providerLooksSuccessful(
          providerResponse,
        ),

      customer:
        extractObjectData(
          providerResponse,
        ),

      data:
        providerResponse,

      message:
        providerMessage(
          providerResponse,
        ),
    };
  }

  return {
    success: true,

    verified: true,

    message:
      "Verification is not required for this service.",
  };
}

/*
 * ---------------------------------------------------------
 * FIND AUTHORITATIVE CATALOGUE ITEM
 * ---------------------------------------------------------
 */
async function findCatalogItem(
  service: Service,
  body: Record<string, unknown>,
) {
  const requestedCode =
    clean(
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

  if (!requestedCode) {
    return null;
  }

  const requestedNetwork =
    clean(
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
    Array.isArray(
      catalogue.items,
    )
      ? catalogue.items
      : [];

  const wanted =
    requestedCode
      .trim()
      .toLowerCase();

  const found =
    items.find(
      (item) => {
        const obj =
          asObject(item);

        const values = [
          obj.id,
          obj.code,
          obj.plan_code,
          obj.planCode,
          obj.plan_id,
          obj.planId,
        ]
          .map(clean)
          .map(
            (value) =>
              value.toLowerCase(),
          );

        return values.includes(
          wanted,
        );
      },
    );

  return found ??
    null;
}

/*
 * ---------------------------------------------------------
 * AUTHORITATIVE PRICE
 * ---------------------------------------------------------
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
   * 0% markup.
   */
  if (
    service === "airtime"
  ) {
    const amount =
      numberValue(
        pickBody(
          body,
          "amount",
          "value",
          "price",
        ),
      );

    if (
      !amount ||
      amount <= 0
    ) {
      throw new Error(
        "A valid airtime amount is required.",
      );
    }

    return {
      providerPrice:
        amount,

      sellingPrice:
        roundSellingPrice(
          amount,
          AIRTIME_MARKUP,
        ),

      item: null,
    };
  }

  /*
   * ELECTRICITY
   *
   * Amount based.
   */
  if (
    service ===
      "electricity"
  ) {
    const amount =
      numberValue(
        pickBody(
          body,
          "amount",
          "value",
          "price",
        ),
      );

    if (
      !amount ||
      amount <= 0
    ) {
      throw new Error(
        "A valid electricity amount is required.",
      );
    }

    return {
      providerPrice:
        amount,

      sellingPrice:
        roundSellingPrice(
          amount,
          STANDARD_MARKUP,
        ),

      item: null,
    };
  }

  /*
   * All other services must match
   * an actual Peyflex catalogue item.
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

  const obj =
    asObject(item);

  const providerPrice =
    numberValue(
      firstValue(
        obj.provider_price,
        obj.providerPrice,
        obj.price,
      ),
    );

  if (
    !providerPrice ||
    providerPrice <= 0
  ) {
    throw new Error(
      "The selected Peyflex plan has an invalid price.",
    );
  }

  return {
    providerPrice,

    sellingPrice:
      roundSellingPrice(
        providerPrice,
        STANDARD_MARKUP,
      ),

    item,
  };
}

/*
 * ---------------------------------------------------------
 * PROVIDER PURCHASE
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
   * -------------------------------------------------------
   * AIRTIME
   * -------------------------------------------------------
   */
  if (
    service === "airtime"
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

    if (!network) {
      throw new Error(
        "Airtime network is required.",
      );
    }

    if (!validPhone(phone)) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    return await peyflexPost(
      "/api/airtime/topup/",
      {
        network,

        amount:
          providerPrice,

        mobile_number:
          phone,
      },
    );
  }

  /*
   * -------------------------------------------------------
   * DATA
   * -------------------------------------------------------
   */
  if (
    service === "data"
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

    if (!validPhone(phone)) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    return await peyflexPost(
      "/api/data/purchase/",
      {
        network,

        mobile_number:
          phone,

        plan_code:
          planCode,
      },
    );
  }

  /*
   * -------------------------------------------------------
   * CABLE
   * -------------------------------------------------------
   */
  if (
    service === "cable"
  ) {
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
   * -------------------------------------------------------
   * ELECTRICITY
   * -------------------------------------------------------
   */
  if (
    service ===
      "electricity"
  ) {
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

    if (!identifier) {
      throw new Error(
        "Electricity provider is required.",
      );
    }

    if (!meter) {
      throw new Error(
        "Meter number is required.",
      );
    }

    return await peyflexPost(
      "/api/electricity/subscribe/",
      {
        identifier,

        meter,

        plan,

        amount:
          String(
            providerPrice,
          ),

        type,

        phone,
      },
    );
  }

  /*
   * -------------------------------------------------------
   * EDUCATION
   * -------------------------------------------------------
   */
  if (
    service === "education"
  ) {
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

    /*
     * NECO is permanently disabled.
     */
    if (
      /\bneco\b/i.test(
        planId,
      )
    ) {
      throw new Error(
        "This education service is not available.",
      );
    }

    return await peyflexPost(
      "/api/education/purchase/",
      {
        identifier:
          "education",

        plan_id:
          planId,

        quantity:
          String(quantity),

        phone,
      },
    );
  }

  /*
   * -------------------------------------------------------
   * RECHARGE / CARD
   * -------------------------------------------------------
   */
  if (
    service ===
      "airtime-card" ||
    service ===
      "data-card" ||
    service ===
      "recharge-card"
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

        amount:
          providerPrice,

        quantity,

        pin,

        brand_name:
          "IyanjuPay",
      },
    );
  }

  throw new Error(
    "Unsupported service.",
  );
}

/*
 * ---------------------------------------------------------
 * SELECTED ITEM METADATA
 * ---------------------------------------------------------
 */
function safeSelectedItem(
  item: unknown,
): Record<string, unknown> | null {
  if (!item) {
    return null;
  }

  const obj =
    asObject(item);

  return {
    id:
      itemId(obj),

    code:
      itemId(obj),

    name:
      cleanCustomerPlanName(
        rawItemName(obj),
      ),

    price:
      numberValue(
        obj.price,
      ),

    provider_price:
      numberValue(
        firstValue(
          obj.provider_price,
          obj.providerPrice,
          obj.price,
        ),
      ),

    validity:
      itemValidity(obj),

    network:
      clean(
        obj.network,
      ),
  };
}

/*
 * ---------------------------------------------------------
 * PURCHASE
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
   * Cable and electricity have their own customer
   * identifiers. Other services require phone.
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
      ? Math.floor(
          quantityRaw,
        )
      : 1;

  if (
    quantity < 1
  ) {
    throw new Error(
      "Quantity must be at least 1.",
    );
  }

  /*
   * NEVER trust frontend price.
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

  if (
    sellingPrice <= 0
  ) {
    throw new Error(
      "Invalid transaction amount.",
    );
  }

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
        p_user_id:
          userId,

        p_amount:
          sellingPrice,

        p_reference:
          reference,

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
    Array.isArray(
      debitData,
    )
      ? debitData[0]
      : debitData;

  if (
    debitResult &&
    typeof debitResult ===
      "object" &&
    "success" in
      debitResult
  ) {
    const success =
      Boolean(
        (
          debitResult as Record<
            string,
            unknown
          >
        ).success,
      );

    if (!success) {
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
  }

  /*
   * -------------------------------------------------------
   * SAFE METADATA
   * -------------------------------------------------------
   */
  const selectedItem =
    safeSelectedItem(
      pricing.item,
    );

  const billerCode =
    clean(
      pickBody(
        body,
        "biller_code",
        "billerCode",
        "provider_code",
        "providerCode",
        "identifier",
      ),
    );

  const itemCode =
    clean(
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
    );

  const markupAmount =
    sellingPrice -
    providerPrice;

  const metadata = {
    service,

    provider:
      "peyflex",

    customer_phone:
      phone,

    phone,

    biller_code:
      billerCode,

    item_code:
      itemCode,

    provider_price:
      providerPrice,

    selling_price:
      sellingPrice,

    markup:
      markupAmount,

    markup_rate:
      service ===
        "airtime"
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
      .from(
        "transactions",
      )
      .insert({
        user_id:
          userId,

        reference_number:
          reference,

        transaction_type:
          "service_purchase",

        amount:
          sellingPrice,

        status:
          "pending",

        provider:
          "peyflex",

        provider_reference:
          null,

        metadata,

        description:
          `${service} purchase`,
      })
      .select()
      .single();

  if (
    transactionError
  ) {
    /*
     * Transaction record failed after wallet debit.
     * Roll the debit back.
     */
    await supabase.rpc(
      "refund_wallet",
      {
        p_user_id:
          userId,

        p_amount:
          sellingPrice,

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
     * SUCCESS
     * -----------------------------------------------------
     */
    if (
      providerLooksSuccessful(
        providerResponse,
      )
    ) {
      await supabase
        .from(
          "transactions",
        )
        .update({
          status:
            "completed",

          provider_reference:
            providerRef ||
            null,

          metadata: {
            ...metadata,

            provider_status:
              status,

            provider_message:
              message ||
              null,

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

        status:
          "completed",

        reference,

        provider_reference:
          providerRef ||
          null,

        amount:
          sellingPrice,

        message:
          message ||
          "Transaction completed successfully.",
      };
    }

    /*
     * -----------------------------------------------------
     * DEFINITIVE FAILURE
     * -----------------------------------------------------
     */
    if (
      providerLooksFailed(
        providerResponse,
      )
    ) {
      const {
        error:
          refundError,
      } =
        await supabase.rpc(
          "refund_wallet",
          {
            p_user_id:
              userId,

            p_amount:
              sellingPrice,

            p_reference:
              `${reference}_REFUND`,

            p_description:
              `Refund for failed ${service} purchase`,
          },
        );

      /*
       * Refund failure remains flagged.
       */
      if (
        refundError
      ) {
        await supabase
          .from(
            "transactions",
          )
          .update({
            status:
              "failed",

            provider_reference:
              providerRef ||
              null,

            metadata: {
              ...metadata,

              provider_status:
                status,

              provider_message:
                message ||
                null,

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
            providerRef ||
            null,

          amount:
            sellingPrice,

          error:
            "The provider rejected the transaction, but the automatic refund could not be completed. The transaction has been flagged for reconciliation.",
        };
      }

      /*
       * Refund succeeded.
       */
      await supabase
        .from(
          "transactions",
        )
        .update({
          status:
            "failed",

          provider_reference:
            providerRef ||
            null,

          metadata: {
            ...metadata,

            provider_status:
              status,

            provider_message:
              message ||
              null,

            reconciliation_required:
              false,

            refunded:
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
          "failed",

        reference,

        provider_reference:
          providerRef ||
          null,

        amount:
          sellingPrice,

        refunded:
          true,

        error:
          message ||
          "The service provider rejected the transaction.",
      };
    }

    /*
     * -----------------------------------------------------
     * AMBIGUOUS RESPONSE
     * -----------------------------------------------------
     *
     * DO NOT REFUND.
     */
    await supabase
      .from(
        "transactions",
      )
      .update({
        status:
          "pending",

        provider_reference:
          providerRef ||
          null,

        metadata: {
          ...metadata,

          provider_status:
            status,

          provider_message:
            message ||
            null,

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

      status:
        "pending",

      reference,

      provider_reference:
        providerRef ||
        null,

      amount:
        sellingPrice,

      message:
        message ||
        "Your transaction is being processed.",

      reconciliation_required:
        true,
    };
  } catch (
    error
  ) {
    /*
     * -----------------------------------------------------
     * NETWORK / TIMEOUT / UNKNOWN ERROR
     * -----------------------------------------------------
     *
     * NEVER automatically refund.
     */
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Provider request could not be completed.";

    await supabase
      .from(
        "transactions",
      )
      .update({
        status:
          "pending",

        metadata: {
          ...metadata,

          provider_error:
            errorMessage,

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

      status:
        "pending",

      reference,

      amount:
        sellingPrice,

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
 */
function normalizedAction(
  value: unknown,
): string {
  const action =
    clean(value)
      .toLowerCase();

  const aliases:
    Record<string, string> = {
      catalogue:
        "catalog",

      get_catalogue:
        "catalog",

      get_catalog:
        "catalog",

      get_billers:
        "billers",

      get_networks:
        "networks",

      get_items:
        "items",

      get_plans:
        "plans",

      verify_customer:
        "verify",

      verifycustomer:
        "verify",

      validate_customer:
        "verify",

      validate:
        "verify",

      pay:
        "purchase",

      service:
        "purchase",
    };

  return (
    aliases[action] ??
    action
  );
}

/*
 * ---------------------------------------------------------
 * JSON RESPONSE
 * ---------------------------------------------------------
 */
function response(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers:
        CORS_HEADERS,
    },
  );
}

/*
 * ---------------------------------------------------------
 * HTTP HANDLER
 * ---------------------------------------------------------
 */
Deno.serve(
  async (req) => {
    /*
     * CORS PREFLIGHT MUST COME FIRST.
     */
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status:
            204,

          headers:
            CORS_HEADERS,
        },
      );
    }

    /*
     * POST ONLY.
     */
    if (
      req.method !==
      "POST"
    ) {
      return response(
        {
          success:
            false,

          error:
            "Method not allowed.",
        },
        405,
      );
    }

    try {
      /*
       * ---------------------------------------------------
       * AUTH
       * ---------------------------------------------------
       */
      const user =
        await getUser(
          req,
        );

      if (!user) {
        return response(
          {
            success:
              false,

            error:
              "Unauthorized.",
          },
          401,
        );
      }

      /*
       * ---------------------------------------------------
       * REQUEST BODY
       * ---------------------------------------------------
       */
      let body:
        Record<
          string,
          unknown
        >;

      try {
        const parsed =
          await req.json();

        if (
          !parsed ||
          typeof parsed !==
            "object" ||
          Array.isArray(
            parsed,
          )
        ) {
          return response(
            {
              success:
                false,

              error:
                "Invalid JSON request body.",
            },
            400,
          );
        }

        body =
          parsed as Record<
            string,
            unknown
          >;
      } catch {
        return response(
          {
            success:
              false,

            error:
              "Invalid JSON request body.",
          },
          400,
        );
      }

      /*
       * ---------------------------------------------------
       * ACTION
       * ---------------------------------------------------
       */
      const action =
        normalizedAction(
          body.action ??
            "catalog",
        );

      /*
       * ---------------------------------------------------
       * SERVICE
       * ---------------------------------------------------
       */
      const service =
        serviceOf(
          body.service,
        );

      if (
        !service ||
        !SUPPORTED_SERVICES.has(
          service,
        )
      ) {
        return response(
          {
            success:
              false,

            error:
              "Unsupported or missing service.",
          },
          400,
        );
      }

      /*
       * ---------------------------------------------------
       * BILLERS / NETWORKS / CATALOG
       * ---------------------------------------------------
       */
      if (
        action ===
          "catalog" ||
        action ===
          "billers" ||
        action ===
          "networks"
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

        return response(
          result,
          result.success
            ? 200
            : 502,
        );
      }

      /*
       * ---------------------------------------------------
       * ITEMS / PLANS
       * ---------------------------------------------------
       *
       * This is the action used by the current
       * ServicePayment.tsx.
       */
      if (
        action ===
          "items" ||
        action ===
          "plans"
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

        return response(
          {
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
          },
          result.success
            ? 200
            : 502,
        );
      }

      /*
       * ---------------------------------------------------
       * VERIFY
       * ---------------------------------------------------
       */
      if (
        action ===
        "verify"
      ) {
        const result =
          await verifyCustomer(
            service,
            body,
          );

        return response(
          result,
          200,
        );
      }

      /*
       * ---------------------------------------------------
       * PURCHASE
       * ---------------------------------------------------
       */
      if (
        action ===
        "purchase"
      ) {
        const result =
          await purchase(
            user.id,
            service,
            body,
          );

        return response(
          result,
          200,
        );
      }

      /*
       * ---------------------------------------------------
       * UNKNOWN ACTION
       * ---------------------------------------------------
       */
      return response(
        {
          success:
            false,

          error:
            "Unsupported action.",

          action,
        },
        400,
      );
    } catch (
      error
    ) {
      console.error(
        "peyflex-services error:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      return response(
        {
          success:
            false,

          error:
            message,
        },
        500,
      );
    }
  },
);
