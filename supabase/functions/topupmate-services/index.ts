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

const educationProviders = [
  {
    id: "JAMB",
    code: "JAMB",
    name: "JAMB",
    provider: "JAMB",
    provider_service: "jamb",
  },
  {
    id: "WAEC",
    code: "WAEC",
    name: "WAEC",
    provider: "WAEC",
    provider_service: "waec",
  },
  {
    id: "NECO",
    code: "NECO",
    name: "NECO",
    provider: "NECO",
    provider_service: "neco",
  },
  {
    id: "NABTEB",
    code: "NABTEB",
    name: "NABTEB",
    provider: "NABTEB",
    provider_service: "nabteb",
  },
];

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
  const values = [
    r?.period,
    r?.plan_period,
    r?.planPeriod,
    r?.validity,
    r?.validity_period,
    r?.validityPeriod,
    r?.duration,
    r?.plan_type,
    r?.planType,
    r?.type,
  ];

  for (const value of values) {
    const text = s(value).replace(/\s+/g, " ");
    if (text) return text;
  }

  return "";
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

  const period = getProviderPeriod(r);
  const validityDays =
    r?.validity_days ??
    r?.validityDays ??
    r?.duration_days ??
    r?.durationDays ??
    "";

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
    plan_period: r?.plan_period ?? period,
    planPeriod: r?.planPeriod ?? period,

    validity: r?.validity ?? period,
    validity_period: r?.validity_period ?? period,
    validityPeriod: r?.validityPeriod ?? period,

    duration: r?.duration ?? period,

    validity_days: validityDays,
    validityDays,
    duration_days: r?.duration_days ?? validityDays,
    durationDays: r?.durationDays ?? validityDays,

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
  { key: "alpha", name: "Alpha", service: "alpha" },
  { key: "kirani", name: "Kirani", service: "kirani" },
  { key: "ratel", name: "Ratel", service: "ratel" },
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

async function getInternetPlans(providerKey = "") {
  const wanted = internetProvider(providerKey);
  const routeAliases: Record<string, string[]> = {
    smile: ["smile", "smile-data"],
    alpha: ["alpha", "alphatopup", "alpha-data"],
    kirani: ["kirani", "kirani-data"],
    ratel: ["ratel", "ratel-data"],
  };

  const candidates = wanted
    ? (routeAliases[wanted] ?? [wanted, `${wanted}-data`, `${wanted}data`])
    : INTERNET_PROVIDERS.flatMap((x) => routeAliases[x.key] ?? [x.service]);

  const seen = new Set<string>();
  const all: any[] = [];

  for (const serviceName of candidates) {
    if (seen.has(serviceName)) continue;
    seen.add(serviceName);

    const r = await get("/services/", { service: serviceName });
    if (!r.ok) continue;

    const a = rows(r.body);
    if (!a.length) continue;

    const tagged = a.map((x: any) => ({
      ...x,
      provider: x?.provider ?? x?.provider_name ?? internetProviderName(wanted || serviceName),
      provider_name: x?.provider_name ?? x?.provider ?? internetProviderName(wanted || serviceName),
      internet_provider: internetProvider(x?.internet_provider ?? x?.provider ?? x?.provider_name) || wanted || internetProvider(serviceName),
    }));

    all.push(...tagged);

    if (wanted && tagged.some((x: any) => price(x) > 0 || id(x))) {
      return tagged;
    }
  }

  return wanted
    ? all.filter((x: any) => internetProvider(x?.internet_provider ?? x?.provider) === wanted)
    : all;
}

function arrayRows(...values: any[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nested of [
        value.response,
        value.data,
        value.results,
        value.items,
        value.products,
        value.plans,
        value.packages,
        value.msg,
      ]) {
        if (Array.isArray(nested)) return nested;
      }
    }
  }
  return [];
}

async function giftCatalog(productId?: string) {
  const r = await get(
    "/giftcard/available/",
    productId
      ? { countryCode: "NG", productId }
      : { countryCode: "NG" },
  );

  if (
    !r.ok ||
    String(r.body?.status).toLowerCase() === "fail"
  ) {
    throw new Error(msg(r.body));
  }

  return arrayRows(
    r.body?.response,
    r.body?.data,
    r.body?.results,
    r.body?.items,
    r.body?.products,
    r.body?.msg,
    r.body,
  );
}

function giftProduct(r: any) {
  const productId = String(
    r?.productId ??
      r?.product_id ??
      r?.id ??
      "",
  );

  const nm = s(
    r?.productName ??
      r?.product_name ??
      r?.name ??
      "Gift Card",
  );

  const denoms = Array.isArray(
    r?.fixedRecipientDenominations,
  )
    ? r.fixedRecipientDenominations
        .map(Number)
        .filter((x: number) => x > 0)
    : [];

  const senderDenoms = Array.isArray(
    r?.fixedSenderDenominations,
  )
    ? r.fixedSenderDenominations
        .map(Number)
        .filter((x: number) => x > 0)
    : [];

  const mapRows = Array.isArray(
    r?.fixedRecipientToSenderDenominationsMap,
  )
    ? r.fixedRecipientToSenderDenominationsMap
    : [];

  const mappedSender = mapRows
    .map((x: any) => Number(Object.values(x || {})[0]))
    .filter((x: number) => x > 0);

  const effectiveSender = senderDenoms.length
    ? senderDenoms
    : mappedSender;

  const firstPrice = effectiveSender[0] || 0;

  return {
    id: productId,
    code: productId,
    name: nm,
    display_name: nm,
    provider: "Topupmate",
    provider_name: "Topupmate",
    product_id: productId,
    productId,
    countryCode: r?.countryCode,
    denominationType: r?.denominationType,
    fixedRecipientDenominations: denoms,
    minRecipientDenomination: r?.minRecipientDenomination,
    maxRecipientDenomination: r?.maxRecipientDenomination,
    fixedSenderDenominations: effectiveSender,
    fixedRecipientToSenderDenominationsMap: mapRows,
    senderFee: r?.senderFee,
    senderFeePercentage: r?.senderFeePercentage,
    logoUrls: r?.logoUrls || [],
    redeemInstruction: r?.redeemInstruction || {},
    providerPrice: firstPrice,
    price: firstPrice,
    selling_price: firstPrice
      ? ceil10(firstPrice * 1.03)
      : 0,
    raw: r,
  };
}

async function billers(service: string) {
  if (["education", "jamb", "waec", "neco", "nabteb"].includes(service)) {
    return {
      success: true,
      service,
      billers: educationProviders,
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
      provider_service: x.key,
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

  if (service === "recharge-card" || service === "airtime-card") {
    const providers = [
      { id: "1", code: "1", biller_code: "1", name: "MTN", display_name: "MTN", provider: "1", provider_name: "MTN", network_code: "1", status: "active" },
      { id: "2", code: "2", biller_code: "2", name: "Airtel", display_name: "Airtel", provider: "2", provider_name: "Airtel", network_code: "2", status: "active" },
      { id: "3", code: "3", biller_code: "3", name: "Glo", display_name: "Glo", provider: "3", provider_name: "Glo", network_code: "3", status: "active" },
      { id: "4", code: "4", biller_code: "4", name: "9mobile", display_name: "9mobile", provider: "4", provider_name: "9mobile", network_code: "4", status: "active" },
    ];
    return {
      success: true,
      service,
      billers: providers,
      items: [],
      plans: [],
      packages: [],
    };
  }

  if (service === "gift-card") {
    const a = await giftCatalog();
    const products = a
      .filter(
        (x: any) =>
          String(x?.status ?? "ACTIVE").toLowerCase() !== "inactive",
      )
      .map(giftProduct)
      .filter((x: any) => x.id);

    return {
      success: true,
      service,
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
    throw new Error(msg(c.body));
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
      throw new Error("A mobile network is required.");
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
      b.provider_name ??
        b.provider ??
        b.biller_code ??
        b.internet_provider,
    );

    const a = await getInternetPlans(requestedProvider);
    const items = a
      .map((r: any) => ({
        ...norm("internet", r),
        internet_provider: internetProvider(r?.internet_provider ?? r?.provider ?? requestedProvider),
        provider: internetProviderName(r?.internet_provider ?? r?.provider ?? requestedProvider),
        provider_name: internetProviderName(r?.internet_provider ?? r?.provider ?? requestedProvider),
      }))
      .filter((x: any) => x.providerPrice > 0);

    return {
      success: true,
      service: "internet",
      selected_provider: requestedProvider || null,
      billers: INTERNET_PROVIDERS.map((x) => ({
        id: x.key, code: x.key, name: x.name, display_name: x.name,
        provider: x.key, provider_name: x.name, biller_code: x.key, status: "active",
      })),
      items,
      plans: items,
      packages: items,
    };
  }

  if (service === "gift-card") {
    const productId = s(
      b.product_id ??
        b.productId ??
        b.biller_code ??
        b.provider,
    );

    const products = await giftCatalog(
      productId || undefined,
    );

    const product =
      products.find(
        (x: any) =>
          String(
            x?.productId ??
              x?.product_id ??
              x?.id ??
              "",
          ) === productId,
      ) ?? products[0];

    if (!product) {
      throw new Error("Gift card product not found.");
    }

    const gp = giftProduct(product);
    const denoms = gp.fixedRecipientDenominations.length
      ? gp.fixedRecipientDenominations
      : [
          gp.minRecipientDenomination,
          gp.maxRecipientDenomination,
        ].filter((x: any) => Number(x) > 0);

    const sender = gp.fixedSenderDenominations;

    const items = denoms.map(
      (d: number, i: number) => {
        const providerAmount = Number(sender[i] ?? 0);
        const customerPrice = providerAmount
          ? sell(providerAmount, 3)
          : 0;

        return {
          id: `${gp.id}:${d}`,
          code: `${gp.id}:${d}`,
          plan_id: `${gp.id}:${d}`,
          name: `${gp.name} $${d}`,
          display_name: `${gp.name} $${d}`,
          provider: "Topupmate",
          provider_name: "Topupmate",
          providerPrice: providerAmount,
          provider_price: providerAmount,
          selling_price: customerPrice,
          price: customerPrice,
          amount: customerPrice,
          recipient_amount: d,
          product_id: gp.id,
          productId: gp.id,
          denomination: d,
          raw: {
            ...product,
            fixedRecipientDenominations:
              gp.fixedRecipientDenominations,
            fixedSenderDenominations: sender,
          },
        };
      },
    );

    return {
      success: true,
      service: "gift-card",
      billers: [gp],
      items,
      plans: items,
      packages: items,
    };
  }

  if (service === "recharge-card" || service === "airtime-card") {
    const requestedNetwork = network(
      b.network_code ??
        b.networkId ??
        b.provider ??
        b.provider_name ??
        b.biller_code ??
        "",
    );

    if (!requestedNetwork) {
      throw new Error("A mobile network is required.");
    }

    const c = await get("/services/", { service: "recharge-card" });
    if (!c.ok || String(c.body?.status).toLowerCase() === "fail") {
      throw new Error(msg(c.body));
    }

    const all = rows(c.body);
    const matched = all.filter((item: any) =>
      dataPlanMatchesNetwork(item, requestedNetwork) ||
      providerMatches(item, requestedNetwork)
    );

    const source = matched.length
      ? matched
      : all.filter((item: any) =>
          providerMatches(item, networkName(requestedNetwork))
        );

    const items = source
      .map((r: any) => norm("recharge-card", r))
      .map((item: any) => ({
        ...item,
        denomination: n(item.raw?.denomination ?? item.raw?.value ?? item.raw?.amount ?? item.providerPrice),
        value: n(item.raw?.value ?? item.raw?.denomination ?? item.raw?.amount ?? item.providerPrice),
      }))
      .filter((x: any) => x.providerPrice > 0 && x.id);

    return {
      success: true,
      service: "recharge-card",
      selected_network: requestedNetwork,
      billers: [],
      items,
      plans: items,
      packages: items,
    };
  }

  if (["education", "jamb", "waec", "neco", "nabteb"].includes(service)) {
    const requestedProvider = s(
      b.provider_service ??
        b.provider_name ??
        b.provider ??
        b.biller_code ??
        service,
    ).toLowerCase();

    const c = await get("/services/", { service: "exampin" });
    if (!c.ok || String(c.body?.status).toLowerCase() === "fail") {
      throw new Error(msg(c.body));
    }

    const all = rows(c.body);
    const wanted = requestedProvider.replace(/[^a-z0-9]+/g, "");
    const matched = all.filter((item: any) => {
      if (!wanted || wanted === "education") return true;
      return providerMatches(item, requestedProvider);
    });

    const source = matched.length ? matched : (
      wanted === "jamb" || wanted === "waec" || wanted === "neco" || wanted === "nabteb"
        ? all.filter((item: any) => providerMatches(item, wanted.toUpperCase()))
        : all
    );

    const items = source
      .map((r: any) => norm("education", r))
      .filter((x: any) => x.providerPrice > 0);

    return {
      success: true,
      service: "education",
      selected_provider: requestedProvider,
      billers: educationProviders,
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
    throw new Error(msg(c.body));
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
      b.provider_name ??
        b.provider ??
        b.biller_code ??
        b.cable_tv,
    );

    const i = s(
      b.iuc ??
        b.smartcard_number ??
        b.smartcard_no ??
        b.customer,
    );

    if (!p || !/^[0-9]{8,20}$/.test(i)) {
      throw new Error(
        "Enter a valid IUC / SmartCard number (8–20 digits).",
      );
    }

    let r = await post(
      "/cabletv/verify/",
      {
        provider: p,
        iucnumber: i,
      },
    );

    // // Diagnostic test: try the proposed Cable validation route first, then
    // retry the same route without the trailing slash only on HTTP 404.
    if (r.httpStatus === 404) {
      r = await post(
        "/cabletv/verify/",
        {
          provider: p,
          iucnumber: i,
        },
      );
    }

    if (!r.ok || status(r.body) === "fail") {
      const providerMessage = s(
        r.body?.msg ??
          r.body?.message ??
          r.body?.error,
      );

      if (r.httpStatus === 404) {
        throw new Error(
          "Topupmate Cable verification endpoint returned HTTP 404. Please confirm the live Cable verification route.",
        );
      }

      throw new Error(
        providerMessage ||
          "Could Not Verify Smart Card/IUC Number",
      );
    }

    // Topupmate returns Cable verification fields at the top level.
    // Example: { status: "success", name: "Ibrahim Yusuf", Customer_Name: "Ibrahim Yusuf" }
    const d = r.body ?? {};

    const nm = s(
      d?.name ??
        d?.Customer_Name ??
        d?.customer_name ??
        d?.customerName ??
        d?.subscriber_name ??
        (status(d) === "success" ? d?.msg : ""),
    );

    if (!nm) {
      throw new Error(
        "Unable to verify this SmartCard number.",
      );
    }

    return {
      success: true,
      customer_name: nm,
      customerName: nm,
      message: "Customer verified successfully.",
    };
  }

  if (service === "electricity") {
    const p = disco(
      b.biller_code ??
        b.provider ??
        b.disco,
    );

    const m = s(
      b.meter ??
        b.meter_number ??
        b.customer,
    );

    const t = s(
      b.meter_type ??
        b.meterType ??
        "prepaid",
    ).toLowerCase();

    if (
      !p ||
      !m ||
      !["prepaid", "postpaid"].includes(t)
    ) {
      throw new Error("Meter details are required.");
    }

    const r = await post(
      "/electricity/verify/",
      {
        provider: p,
        meternumber: m,
        metertype: t,
      },
    );

    if (!r.ok || status(r.body) === "fail") {
      throw new Error(msg(r.body));
    }

    const d =
      r.body?.response ??
      r.body?.data ??
      r.body;

    const nm = s(
      d?.name ??
        d?.customer_name ??
        d?.customerName ??
        d?.customer_name_on_meter,
    );

    return {
      success: true,
      customer_name: nm,
      customerName: nm,
      message: "Meter verified successfully.",
    };
  }

  throw new Error(
    "Verification is not required for this service.",
  );
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

  const customer = s(
    d.customer ??
      d.phone ??
      d.mobile_number ??
      d.phoneNumber ??
      d.account_id,
  );

  let pAmt = 0;
  let sAmt = 0;
  let path = "";
  let body: O = {};

  if (service === "airtime") {
    const net = network(
      d.network_code ??
        d.networkId ??
        d.biller_code ??
        d.network,
    );

    pAmt = n(d.amount ?? b.amount);

    if (
      !net ||
      !/^[0-9]{11}$/.test(customer) ||
      pAmt < 50
    ) {
      throw new Error(
        "Enter a valid phone number, network and airtime amount.",
      );
    }

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
      d.network_code ??
        d.networkId ??
        d.biller_code ??
        d.network,
    );

    const plan = s(
      d.item_code ??
        d.plan_code ??
        item.id ??
        item.code,
    );

    if (
      !net ||
      !/^[0-9]{11}$/.test(customer) ||
      !plan
    ) {
      throw new Error(
        "Network, phone number and data plan are required.",
      );
    }

    path = "/data/";
    body = {
      network: net,
      phone: customer,
      plan,
      ref: r,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.provider_amount,
    );

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

    if (!pAmt) {
      throw new Error(
        "The selected data plan is unavailable.",
      );
    }

    sAmt = sell(pAmt, MARKUP);
  } else if (service === "cable") {
    const pr = cable(
      d.provider_name ??
        d.providerName ??
        d.biller_code ??
        d.cable_tv,
    );

    const i = s(
      d.smartcard_number ??
        d.smartcardNumber ??
        d.smartcard_no ??
        d.customer,
    );

    const plan = s(
      d.item_code ??
        d.plan_code ??
        item.id ??
        item.code,
    );

    if (
      !pr ||
      !/^[0-9]{10}$/.test(i) ||
      !plan
    ) {
      throw new Error(
        "Cable provider, SmartCard number and package are required.",
      );
    }

    path = "/cabletv/";
    body = {
      provider: pr,
      iucnumber: i,
      plan,
      ref: r,
      subtype: s(d.subtype ?? "renew") || "renew",
      phone: customer || undefined,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

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

    if (!pAmt) {
      throw new Error(
        "The selected cable package is unavailable.",
      );
    }

    sAmt = sell(pAmt, MARKUP);
  } else if (service === "electricity") {
    const pr = disco(
      d.biller_code ??
        d.provider ??
        d.disco,
    );

    const m = s(
      d.meter_number ??
        d.meter ??
        d.customer,
    );

    const t = s(
      d.meter_type ??
        d.meterType ??
        "prepaid",
    ).toLowerCase();

    pAmt = n(
      d.provider_amount ??
        d.amount ??
        b.amount,
    );

    if (
      !pr ||
      !m ||
      !["prepaid", "postpaid"].includes(t) ||
      pAmt <= 0
    ) {
      throw new Error(
        "Electricity provider, meter type, meter number and amount are required.",
      );
    }

    path = "/electricity/";
    body = {
      provider: pr,
      meternumber: m,
      amount: pAmt,
      metertype: t,
      phone: customer || undefined,
      ref: r,
    };
    sAmt = pAmt;
  } else if (
    ["education", "jamb", "waec", "neco", "nabteb"].includes(service)
  ) {
    const pr = s(
      d.provider ??
        d.provider_name ??
        d.biller_code ??
        "WAEC",
    ).toUpperCase();

    const q = Math.max(
      1,
      Math.floor(n(d.quantity ?? 1)),
    );

    path = "/exampin/";
    body = {
      provider: pr,
      quantity: q,
      ref: r,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

    if (!pAmt) {
      const c = await get("/services/", {
        service: "exampin",
      });

      pAmt = price(
        rows(c.body).find(
          (x: any) =>
            id(x) === s(d.item_code ?? item.id),
        ),
      );
    }

    if (!pAmt) {
      throw new Error(
        "The selected education PIN is unavailable.",
      );
    }

    sAmt = sell(pAmt, MARKUP) * q;
  } else if (
    service === "airtime-card" ||
    service === "recharge-card"
  ) {
    const net = network(
      d.network_code ??
        d.networkId ??
        d.biller_code ??
        d.network,
    );

    const plan = s(
      d.item_code ??
        item.id ??
        item.code,
    );

    const q = Math.max(
      1,
      Math.floor(n(d.quantity ?? 1)),
    );

    if (!net || !plan) {
      throw new Error(
        "Network and airtime PIN denomination are required.",
      );
    }

    path = "/rechargepin/";
    body = {
      network: net,
      quantity: q,
      plan,
      businessname: s(d.businessname ?? "IyanjuPay"),
      ref: r,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

    if (!pAmt) {
      const c = await get("/services/", {
        service: "recharge-card",
      });

      pAmt = price(
        rows(c.body).find(
          (x: any) => id(x) === plan,
        ),
      );
    }

    if (!pAmt) {
      throw new Error(
        "The selected recharge PIN is unavailable.",
      );
    }

    sAmt = pAmt * q;
  } else if (service === "data-card") {
    const net = network(
      d.network_code ??
        d.networkId ??
        d.biller_code ??
        d.network,
    );

    const plan = s(
      d.item_code ??
        item.id ??
        item.code,
    );

    const q = Math.max(
      1,
      Math.floor(n(d.quantity ?? 1)),
    );

    if (!net || !plan) {
      throw new Error(
        "Network and data PIN plan are required.",
      );
    }

    path = "/datapin/";
    body = {
      network: net,
      quantity: q,
      data_plan: plan,
      businessname: s(d.businessname ?? "IyanjuPay"),
      ref: r,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

    if (!pAmt) {
      const c = await get("/services/", {
        service: "datapin",
      });

      pAmt = price(
        rows(c.body).find(
          (x: any) => id(x) === plan,
        ),
      );
    }

    if (!pAmt) {
      throw new Error(
        "The selected data PIN is unavailable.",
      );
    }

    sAmt = sell(pAmt, MARKUP) * q;
  } else if (service === "gift-card") {
    const productId = s(
      d.product_id ??
        d.productId ??
        item.product_id ??
        item.productId ??
        d.biller_code,
    );

    const recipientEmail = s(
      d.email ??
        d.recipient_email ??
        d.account_number ??
        d.customer ??
        customer,
    );

    const amount = n(
      d.recipient_amount ??
        d.amount ??
        item.recipient_amount ??
        item.denomination,
    );

    const sender = s(
      d.sender ?? "IyanjuPay Customer",
    );

    const units = Math.max(
      1,
      Math.floor(
        n(d.units ?? d.quantity ?? 1),
      ),
    );

    if (
      !productId ||
      !recipientEmail ||
      !/^\S+@\S+\.\S+$/.test(recipientEmail) ||
      amount <= 0
    ) {
      throw new Error(
        "Gift card product, amount and a valid email address are required.",
      );
    }

    path = "/giftcard/";
    body = {
      product: Number(productId),
      amount,
      email: recipientEmail,
      sender,
      units,
      ref: r,
    };

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

    if (!pAmt) {
      const products = await giftCatalog(productId);
      const gp = products.find(
        (x: any) =>
          String(
            x?.productId ??
              x?.product_id ??
              x?.id ??
              "",
          ) === productId,
      );

      const den = Array.isArray(
        gp?.fixedRecipientDenominations,
      )
        ? gp.fixedRecipientDenominations.map(Number)
        : [];

      const snd = Array.isArray(
        gp?.fixedSenderDenominations,
      )
        ? gp.fixedSenderDenominations.map(Number)
        : [];

      const mapped = Array.isArray(
        gp?.fixedRecipientToSenderDenominationsMap,
      )
        ? gp.fixedRecipientToSenderDenominationsMap
            .map((x: any) =>
              Number(Object.values(x || {})[0]),
            )
            .filter((x: number) => x > 0)
        : [];

      const effectiveSender = snd.length ? snd : mapped;
      const idx = den.findIndex(
        (x: number) => x === amount,
      );

      pAmt = idx >= 0
        ? n(effectiveSender[idx])
        : 0;
    }

    if (!pAmt) {
      throw new Error(
        "The selected gift card denomination is unavailable.",
      );
    }

    sAmt = sell(pAmt, MARKUP) * units;
  } else if (
    service === "internet" ||
    service === "smile"
  ) {
    const providerKey = internetProvider(
      d.provider_name ??
        d.provider ??
        d.biller_code ??
        d.internet_provider ??
        item.provider_name ??
        item.provider,
    ) || "smile";

    const plan = s(
      d.item_code ??
        d.plan_code ??
        item.id ??
        item.code,
    );

    const acct = s(
      d.account_number ??
        d.accountNumber ??
        d.account_id ??
        d.phoneNumber ??
        d.phone ??
        d.customer,
    );

    if (!plan || !acct) {
      throw new Error(
        `${internetProviderName(providerKey)} account and plan are required.`,
      );
    }

    if (providerKey === "smile") {
      path = "/smile-data/";
      body = {
        PhoneNumber: acct,
        BundleTypeCode: plan,
        actype: s(d.account_type ?? "prepaid"),
      };
    } else if (providerKey === "alpha") {
      path = "/alphatopup/";
      body = {
        phone: acct,
        planid: plan,
        ref: r,
      };
    } else if (providerKey === "kirani") {
      path = "/kirani/";
      body = {
        phone: acct,
        planid: plan,
        ref: r,
      };
    } else {
      path = "/ratel/";
      body = {
        phone: acct,
        planid: plan,
        ref: r,
      };
    }

    pAmt = n(
      item.providerPrice ??
        item.provider_price ??
        item.price,
    );

    if (!pAmt) {
      const c = await get("/services/", {
        service: providerKey,
      });

      pAmt = price(
        rows(c.body).find(
          (x: any) => id(x) === plan,
        ),
      );
    }

    if (!pAmt) {
      throw new Error(
        `The selected ${internetProviderName(providerKey)} plan is unavailable.`,
      );
    }

    sAmt = sell(pAmt, MARKUP);

  } else {
    throw new Error(
      "This service is not available through Topupmate.",
    );
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
    throw new Error(
      "Unable to process the payment from your wallet.",
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

    if (!q.ok && status(pr) !== "processing") {
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

      throw new Error(
        "Purchase failed. Your wallet has been refunded.",
      );
    }
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes("refunded")
    ) {
      throw e;
    }

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

    throw new Error(
      "Purchase failed. Your wallet has been refunded.",
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
        throw new Error(
          "Transaction reference is required.",
        );
      }

      const q = await get(
        "/transaction/status/",
        { reference: r },
      );

      if (!q.ok) {
        throw new Error(msg(q.body));
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
        throw new Error(msg(q.body));
      }

      return json({
        success: true,
        wallet: q.body,
      });
    }

    if (ac === "notifications") {
      const q = await get("/notification/");

      if (!q.ok) {
        throw new Error(msg(q.body));
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
        throw new Error(msg(q.body));
      }

      return json({
        success: true,
        ...q.body,
      });
    }

    throw new Error(
      "Unsupported service request.",
    );
  } catch (e: any) {
    console.error(
      "Topupmate service error",
      {
        action: ac,
        service: b.service,
        user_id: u.id,
        error: e,
      },
    );

    return json(
      {
        success: false,
        error: String(
          e?.message ??
            "Service request failed.",
        ),
      },
      400,
    );
  }
});
