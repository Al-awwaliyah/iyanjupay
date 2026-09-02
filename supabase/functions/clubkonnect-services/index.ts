import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * IyanjuPay - ClubKonnect service provider
 *
 * Customer-facing services backed by this function:
 *   data
 *   education (WAEC / JAMB e-PIN)
 *   airtime-card (airtime recharge PIN)
 *   data-card (data recharge PIN)
 *
 * Flutterwave-backed services remain in flutterwave-bills.
 * Provider credentials are server-side only.
 */

type JsonObject = Record<string, any>;
type ClubService = "data" | "education" | "airtime-card" | "data-card";

type CatalogItem = {
  id: string;
  code?: string;
  name: string;
  price: number;
  networkCode?: string;
  service: ClubService;
  period?: string;
  planType?: string;
  validityDays?: number | null;
  isHotDeal?: boolean;
  raw: JsonObject;
};

const BASE = "https://www.nellobytesystems.com";

const NETWORK_NAMES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const FAILURE_TEXT = new Set([
  "ORDER_FAILED",
  "FAILED",
  "FAILURE",
  "TRANSACTION_FAILED",
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "MISSING_USERID",
  "MISSING_APIKEY",
  "MISSING_MOBILENETWORK",
  "MISSING_DATAPLAN",
  "INVALID_DATAPLAN",
  "INVALID_RECIPIENT",
  "INVALID_MOBILENUMBER",
  "INVALID_PHONENO",
  "INVALID_EXAMTYPE",
  "MISSING_EXAMTYPE",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_FUNDS",
  "QUANTITY_NOT_AVAILABLE",
  "PIN_NOT_AVAILABLE",
]);

const PENDING_TEXT = new Set([
  "ORDER_RECEIVED",
  "ORDER_ONHOLD",
  "ORDER_PROCESSED",
  "PROCESSING",
  "PENDING",
  "REQUEST_QUEUED",
  "REQUEST_PROCESSING",
  "NETWORK_UNRESPONSIVE",
]);

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0;
}

function first(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && s(value) !== "") return value;
  }
  return undefined;
}

function obj(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function normalizeStatus(value: unknown): string {
  return s(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function arrays(body: unknown): any[] {
  if (Array.isArray(body)) return body;
  const root = obj(body);
  for (const key of ["data", "Data", "result", "Result", "plans", "Plans", "packages", "Packages", "networks", "Networks", "TXN_EPIN", "TXN_EPIN_DATABUNDLE"]) {
    if (Array.isArray(root[key])) return root[key];
  }
  return [];
}

function credentials() {
  const userId = s(Deno.env.get("CLUBKONNECT_USER_ID") ?? Deno.env.get("CLUBKONNECT_USERID"));
  const apiKey = s(Deno.env.get("CLUBKONNECT_API_KEY") ?? Deno.env.get("CLUBKONNECT_APIKEY"));
  if (!userId || !apiKey) throw new Error("ClubKonnect credentials are not configured.");
  return { userId, apiKey };
}

function callbackUrl(): string | undefined {
  const configured = s(Deno.env.get("CLUBKONNECT_CALLBACK_URL"));
  if (configured) return configured;
  const supabaseUrl = s(Deno.env.get("SUPABASE_URL"));
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/clubkonnect-webhook` : undefined;
}

async function ck(endpoint: string, params: Record<string, unknown> = {}) {
  const { userId, apiKey } = credentials();
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && s(value) !== "") url.searchParams.set(key, s(value));
  }

  console.log("ClubKonnect request", { endpoint, parameter_names: Object.keys(params) });
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { status: "NON_JSON_RESPONSE" }; }

  console.log("ClubKonnect response", {
    endpoint,
    http_status: response.status,
    ok: response.ok,
    status: first(body?.status, body?.orderstatus, body?.Status, body?.OrderStatus) ?? null,
    statuscode: first(body?.statuscode, body?.statusCode, body?.StatusCode) ?? null,
    orderid: first(body?.orderid, body?.orderId, body?.OrderID) ?? null,
  });

  return { ok: response.ok, status: response.status, body };
}

function statusCode(body: any): number | null {
  const x = Number(first(body?.statuscode, body?.statusCode, body?.StatusCode, body?.data?.statuscode, body?.data?.statusCode));
  return Number.isFinite(x) ? x : null;
}

function statusText(body: any): string {
  return normalizeStatus(first(body?.status, body?.orderstatus, body?.Status, body?.OrderStatus, body?.data?.status, body?.data?.orderstatus));
}

function orderId(body: any): string | null {
  const x = first(body?.orderid, body?.orderId, body?.OrderID, body?.data?.orderid, body?.data?.orderId, body?.data?.OrderID);
  return x === undefined ? null : s(x);
}

function requestId(body: any): string | null {
  const x = first(body?.requestid, body?.requestId, body?.RequestID, body?.data?.requestid, body?.data?.requestId, body?.data?.RequestID);
  return x === undefined ? null : s(x);
}

function classify(body: any, ok: boolean) {
  const code = statusCode(body);
  const text = statusText(body);
  if (ok && (code === 200 || text === "ORDER_COMPLETED" || text === "SUCCESS" || text === "SUCCESSFUL")) return { state: "successful" as const, code, text };
  if (text && FAILURE_TEXT.has(text)) return { state: "failed" as const, code, text };
  if (text && PENDING_TEXT.has(text)) return { state: "pending" as const, code, text };
  return { state: "pending" as const, code, text };
}

function networkCode(value: unknown): string {
  const key = s(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["01", "mtn"].includes(key)) return "01";
  if (["02", "glo", "globacom"].includes(key)) return "02";
  if (["03", "9mobile", "etisalat", "t2mobile"].includes(key)) return "03";
  if (["04", "airtel"].includes(key)) return "04";
  return s(value);
}

function normalizeNetwork(raw: any) {
  const o = obj(raw);
  const code = networkCode(first(o.networkid, o.network_id, o.networkCode, o.network_code, o.code, o.id, o.MobileNetwork, o.mobilenetwork));
  if (!code) return null;
  const name = s(first(o.network, o.Network, o.name, o.NetworkName, o.network_name, NETWORK_NAMES[code], code));
  return { code, name };
}

async function networks() {
  const response = await ck("APIDatabundleNetworkV2.asp");
  if (!response.ok) throw new Error("Network catalogue unavailable.");
  const list = arrays(response.body).map(normalizeNetwork).filter(Boolean) as { code: string; name: string }[];
  const fallback = Object.entries(NETWORK_NAMES).map(([code, name]) => ({ code, name }));
  const merged = new Map<string, { code: string; name: string }>();
  for (const x of [...list, ...fallback]) merged.set(x.code, x);
  return [...merged.values()].filter(x => ["01", "02", "03", "04"].includes(x.code));
}

function validity(text: string): number | null {
  const day = text.match(/\b(\d+)\s*days?\b/i);
  if (day) return Number(day[1]);
  const month = text.match(/\b(\d+)\s*months?\b/i);
  if (month) return Number(month[1]) * 30;
  const year = text.match(/\b(\d+)\s*years?\b/i);
  if (year) return Number(year[1]) * 365;
  return null;
}

function period(text: string, days: number | null): string {
  const x = text.toLowerCase();
  if (x.includes("daily") || days === 1) return "daily";
  if (x.includes("weekly") || days === 7) return "weekly";
  if (x.includes("monthly") || days === 30) return "monthly";
  return "other";
}

function planFromRaw(raw: any, fallbackNetwork = ""): CatalogItem | null {
  const o = obj(raw);
  const id = s(first(o.dataplan, o.data_plan, o.dataPlan, o.planid, o.plan_id, o.planId, o.productid, o.product_id, o.id, o.code, o.DataPlan));
  if (!id) return null;
  const name = s(first(o.name, o.plan, o.plan_name, o.planName, o.productname, o.product_name, o.description, o.DataPlanName, id));
  const price = n(first(o.price, o.amount, o.cost, o.selling_price, o.sellingPrice, o.Price, o.Amount));
  const net = networkCode(first(o.networkid, o.network_id, o.networkCode, o.network_code, o.MobileNetwork, o.mobilenetwork, o.network) ?? fallbackNetwork);
  if (!net || price <= 0) return null;
  const days = Number.isFinite(Number(o.validity_days)) ? Number(o.validity_days) : validity(name);
  const type = s(first(o.plantype, o.plan_type, o.planType, o.type, o.category, o.category_name, "Data"));
  return {
    id,
    name,
    price,
    networkCode: net,
    service: "data",
    period: period(name, days),
    planType: type,
    validityDays: days,
    isHotDeal: /\bsme\b/i.test(type) || /\bsme\b/i.test(name),
    raw: o,
  };
}

async function dataPlans(): Promise<CatalogItem[]> {
  const response = await ck("APIDatabundlePlansV2.asp");
  if (!response.ok) throw new Error("Data catalogue unavailable.");
  const result: CatalogItem[] = [];
  let currentNetwork = "";
  const source = arrays(response.body);
  for (const raw of source) {
    const possible = normalizeNetwork(raw);
    if (possible) currentNetwork = possible.code;
    const item = planFromRaw(raw, currentNetwork);
    if (item) result.push(item);
  }
  if (!result.length && response.body && typeof response.body === "object") {
    for (const [key, value] of Object.entries(obj(response.body))) {
      if (!Array.isArray(value)) continue;
      for (const raw of value) {
        const item = planFromRaw(raw, networkCode(key));
        if (item) result.push(item);
      }
    }
  }
  const unique = new Map<string, CatalogItem>();
  for (const item of result) unique.set(`${item.networkCode}:${item.id}`, item);
  return [...unique.values()];
}

function publicNetwork(x: { code: string; name: string }) {
  return { biller_code: x.code, code: x.code, name: x.name, short_name: x.name };
}

function publicDataPlan(x: CatalogItem) {
  return {
    item_code: x.id,
    biller_code: x.networkCode,
    name: x.name,
    description: x.name,
    amount: x.price,
    selling_price: x.price,
    provider_amount: x.price,
    service: "data",
    network_code: x.networkCode,
    plan_period: x.period,
    plan_type: x.planType,
    validity_days: x.validityDays,
    is_hot_deal: !!x.isHotDeal,
  };
}

async function educationPackages(kind: "waec" | "jamb"): Promise<CatalogItem[]> {
  const endpoint = kind === "jamb" ? "APIJAMBPackagesV2.asp" : "APIWAECPackagesV2.asp";
  const response = await ck(endpoint);
  if (!response.ok) throw new Error("Education catalogue unavailable.");
  const result: CatalogItem[] = [];
  for (const raw of arrays(response.body)) {
    const o = obj(raw);
    const id = s(first(o.examtype, o.exam_type, o.ExamType, o.code, o.Code, o.id, o.package, o.Package, o.productid, o.product_id));
    if (!id) continue;
    const name = s(first(o.name, o.package_name, o.packageName, o.examname, o.exam_name, o.description, o.ExamTypeName, id));
    const price = n(first(o.price, o.amount, o.cost, o.selling_price, o.Price, o.Amount));
    if (price <= 0) continue;
    result.push({ id, code: id, name, price, service: "education", raw: o });
  }
  if (!result.length && response.body && typeof response.body === "object") {
    for (const [key, value] of Object.entries(obj(response.body))) {
      if (!Array.isArray(value)) continue;
      for (const raw of value) {
        const o = obj(raw);
        const id = s(first(o.examtype, o.exam_type, o.ExamType, o.code, o.id, key));
        const name = s(first(o.name, o.package_name, o.examname, o.description, id));
        const price = n(first(o.price, o.amount, o.cost, o.selling_price, o.Price, o.Amount));
        if (id && price > 0) result.push({ id, code: id, name, price, service: "education", raw: o });
      }
    }
  }
  const unique = new Map<string, CatalogItem>();
  for (const item of result) unique.set(item.id, item);
  return [...unique.values()];
}

async function airtimePinCatalog(): Promise<CatalogItem[]> {
  const response = await ck("APIEPINDiscountV2.asp");
  if (!response.ok) throw new Error("Airtime PIN catalogue unavailable.");
  const result: CatalogItem[] = [];
  for (const raw of arrays(response.body)) {
    const o = obj(raw);
    const net = networkCode(first(o.mobilenetwork, o.MobileNetwork, o.network, o.networkid, o.network_code));
    const value = n(first(o.value, o.Value, o.amount, o.Amount, o.denomination, o.Denomination));
    if (!net || !value) continue;
    const discount = n(first(o.discount, o.Discount, o.discount_percent, o.discountPercentage));
    const price = n(first(o.price, o.Price, o.amount_payable, o.AmountPayable)) || Math.max(0, value - (value * discount / 100));
    result.push({ id: String(value), code: String(value), name: `${NETWORK_NAMES[net] ?? net} ₦${value.toLocaleString()} Airtime PIN`, price: price || value, networkCode: net, service: "airtime-card", raw: o });
  }
  if (!result.length) {
    for (const [code, name] of Object.entries(NETWORK_NAMES)) for (const value of [100, 200, 500]) {
      result.push({ id: String(value), code: String(value), name: `${name} ₦${value.toLocaleString()} Airtime PIN`, price: value, networkCode: code, service: "airtime-card", raw: {} });
    }
  }
  return result;
}

async function cardPlans(kind: "airtime-card" | "data-card", network?: string): Promise<CatalogItem[]> {
  if (kind === "airtime-card") return (await airtimePinCatalog()).filter(x => !network || x.networkCode === network);
  const plans = await dataPlans();
  return plans.filter(x => !network || x.networkCode === network).map(x => ({ ...x, service: "data-card" as const }));
}

function publicItem(x: CatalogItem) {
  return {
    item_code: x.id,
    biller_code: x.networkCode ?? x.code ?? "",
    name: x.name,
    description: x.name,
    amount: x.price,
    selling_price: x.price,
    provider_amount: x.price,
    service: x.service,
    network_code: x.networkCode ?? "",
    plan_period: x.period,
    plan_type: x.planType,
    validity_days: x.validityDays,
    is_hot_deal: !!x.isHotDeal,
  };
}

function phone(body: JsonObject, details: JsonObject): string {
  let value = s(first(body.customer, body.phone, body.phone_number, body.phoneNumber, details.customer, details.phone, details.phone_number, details.phoneNumber));
  value = value.replace(/[\s-]/g, "");
  if (/^\+234\d{10}$/.test(value)) return value.slice(1);
  if (/^234\d{10}$/.test(value)) return value;
  if (/^0\d{10}$/.test(value)) return `234${value.slice(1)}`;
  return value;
}

function validPhone(value: string) { return /^234\d{10}$/.test(value); }

function quantity(body: JsonObject, details: JsonObject): number {
  const q = Number(first(body.quantity, details.quantity, 1));
  return Number.isInteger(q) && q >= 1 && q <= 100 ? q : 0;
}

function publicReference(body: JsonObject, details: JsonObject): string {
  return s(first(body.reference, body.transaction_reference, details.reference));
}

async function updateTxn(admin: any, userId: string, reference: string, updates: Record<string, unknown>) {
  const { error } = await admin.from("transactions").update(updates).eq("user_id", userId).eq("reference_number", reference);
  if (error) console.error("ClubKonnect transaction update failed", error);
}

async function refund(admin: any, userId: string, reference: string, amount: number, reason: string, metadata: JsonObject) {
  const refundReference = `REFUND_${reference}`;
  const { data, error } = await admin.rpc("refund_wallet", {
    _user_id: userId,
    _amount: amount,
    _description: "ClubKonnect service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: { ...metadata, original_reference: reference, refund_reference: refundReference, provider: "clubkonnect", reason },
  });
  if (error) return { success: false, data: null, error };
  return { success: true, data, error: null };
}

function safeProviderResponse(body: any) {
  return {
    status: first(body?.status, body?.orderstatus, body?.Status, body?.OrderStatus) ?? null,
    statuscode: statusCode(body),
    orderid: orderId(body),
    requestid: requestId(body),
    remark: first(body?.remark, body?.orderremark, body?.OrderRemark) ?? null,
  };
}

function fulfillment(body: any) {
  // Deliberately return PIN/card data to the authenticated purchaser, but never log it.
  const result: JsonObject = {};
  for (const key of ["carddetails", "cardDetails", "TXN_EPIN", "TXN_EPIN_DATABUNDLE", "pin", "serial", "sno", "batchno", "transactionid", "transactiondate", "productname", "mobilenetwork", "amount"]) {
    if (body?.[key] !== undefined) result[key] = body[key];
  }
  return result;
}

function errorResponse(message: string, status = 400) { return json({ success: false, error: message }, status); }

async function getCatalog(service: ClubService, billerCode = "") {
  if (service === "data") return (await dataPlans()).filter(x => x.networkCode === billerCode);
  if (service === "education") return [];
  return await cardPlans(service, billerCode || undefined);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed.", 405);

  const user = await getUser(req);
  if (!user) return errorResponse("Authentication required.", 401);
  const admin = adminClient();

  let body: JsonObject;
  try { body = obj(await req.json()); } catch { return errorResponse("Invalid request body."); }

  const action = s(body.action).toLowerCase();
  const details = obj(body.details);
  const service = s(first(body.service, details.service, "data")).toLowerCase() as ClubService;

  if (!["data", "education", "airtime-card", "data-card"].includes(service)) {
    return errorResponse("This service is not available through this provider.");
  }

  console.log("clubkonnect-services", { action, service, user_id: user.id });

  if (action === "billers" || action === "networks") {
    try {
      if (service === "education") {
        return json({ success: true, service, billers: [
          { biller_code: "waec", code: "waec", name: "WAEC", short_name: "WAEC" },
          { biller_code: "jamb", code: "jamb", name: "JAMB", short_name: "JAMB" },
        ] });
      }
      const list = await networks();
      return json({ success: true, service, billers: list.map(publicNetwork) });
    } catch (error) {
      console.error("ClubKonnect billers error", error);
      return errorResponse("Unable to load available options right now.", 502);
    }
  }

  if (action === "items" || action === "plans") {
    const biller = s(first(body.biller_code, body.billerCode, body.network_code, body.networkCode, details.biller_code, details.billerCode, details.network_code, details.networkCode));
    if (!biller) return errorResponse("Please select an option.");
    try {
      let items: CatalogItem[] = [];
      if (service === "data") items = await getCatalog("data", networkCode(biller));
      else if (service === "education") {
        if (biller !== "waec" && biller !== "jamb") return errorResponse("Invalid education service.");
        items = await educationPackages(biller as "waec" | "jamb");
      } else items = await getCatalog(service, networkCode(biller));
      return json({ success: true, service, biller_code: biller, items: items.map(publicItem) });
    } catch (error) {
      console.error("ClubKonnect items error", error);
      return errorResponse("Unable to load available packages right now.", 502);
    }
  }

  if (action === "validate") {
    const biller = s(first(body.biller_code, body.billerCode, details.biller_code, details.billerCode));
    const itemCode = s(first(body.item_code, body.itemCode, details.item_code, details.itemCode));
    if (!biller || !itemCode) return errorResponse("A valid option and package are required.");
    try {
      let item: CatalogItem | undefined;
      if (service === "data") item = (await dataPlans()).find(x => x.networkCode === networkCode(biller) && x.id === itemCode);
      else if (service === "education") item = (await educationPackages(biller as "waec" | "jamb")).find(x => x.id === itemCode);
      else item = (await cardPlans(service, networkCode(biller))).find(x => x.id === itemCode);
      if (!item) return errorResponse("The selected package is no longer available.");
      return json({ success: true, status: "successful", validated: true, data: publicItem(item) });
    } catch (error) {
      console.error("ClubKonnect validation error", error);
      return errorResponse("Unable to verify the selected package.", 502);
    }
  }

  if (action === "pay" || action === "service") {
    const biller = s(first(body.biller_code, body.billerCode, details.biller_code, details.billerCode));
    const itemCode = s(first(body.item_code, body.itemCode, details.item_code, details.itemCode));
    const qty = quantity(body, details);

    if (!biller || !itemCode) return errorResponse("Please select a valid service option and package.");
    if ((service === "airtime-card" || service === "data-card") && !qty) return errorResponse("Quantity must be between 1 and 100.");

    let selected: CatalogItem | undefined;
    try {
      if (service === "data") selected = (await dataPlans()).find(x => x.networkCode === networkCode(biller) && x.id === itemCode);
      else if (service === "education") selected = (await educationPackages(biller as "waec" | "jamb")).find(x => x.id === itemCode);
      else selected = (await cardPlans(service, networkCode(biller))).find(x => x.id === itemCode);
    } catch (error) {
      console.error("ClubKonnect catalog verification error", error);
      return errorResponse("Unable to verify the selected package. Please try again.", 502);
    }

    if (!selected) return errorResponse("The selected package is no longer available.");

    const customerPhone = phone(body, details);
    if ((service === "data" || service === "education") && !validPhone(customerPhone)) {
      return errorResponse("Enter a valid Nigerian mobile number.");
    }

    const total = Math.round(selected.price * (service === "airtime-card" || service === "data-card" ? qty : 1) * 100) / 100;
    if (total <= 0) return errorResponse("The selected package has an invalid price.");

    const reference = `CK_${service.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_${crypto.randomUUID()}`;
    const metadata = {
      service,
      category: "bill_payment",
      provider: "clubkonnect",
      provider_id: "clubkonnect",
      biller_code: biller,
      item_code: selected.id,
      network_code: selected.networkCode ?? null,
      customer: customerPhone || null,
      provider_amount: selected.price,
      selling_amount: total,
      quantity: service === "airtime-card" || service === "data-card" ? qty : 1,
      plan_name: selected.name,
      plan_period: selected.period ?? null,
      plan_type: selected.planType ?? null,
      is_hot_deal: !!selected.isHotDeal,
      request_id: reference,
      reconciliation_required: true,
    };

    const { data: debitResult, error: debitError } = await admin.rpc("debit_wallet", {
      _user_id: user.id,
      _amount: total,
      _description: `${service} purchase`,
      _idempotency_key: reference,
      _reference: reference,
      _category: "bill_payment",
      _metadata: metadata,
    });

    if (debitError) {
      console.error("ClubKonnect wallet debit failed", debitError);
      return errorResponse("Unable to process the payment from your wallet.");
    }

    const transactionId = debitResult?.id ?? null;
    let providerResponse: any;

    try {
      if (service === "data") {
        providerResponse = await ck("APIDatabundleV1.asp", {
          MobileNetwork: networkCode(biller),
          DataPlan: selected.id,
          MobileNumber: customerPhone,
          RequestID: reference,
          CallBackURL: callbackUrl(),
        });
      } else if (service === "airtime-card") {
        providerResponse = await ck("APIEPINV1.asp", {
          MobileNetwork: networkCode(biller),
          Value: selected.id,
          Quantity: qty,
          RequestID: reference,
          CallBackURL: callbackUrl(),
        });
      } else if (service === "data-card") {
        providerResponse = await ck("APIDatabundleEPINV1.asp", {
          MobileNetwork: networkCode(biller),
          DataPlan: selected.id,
          Quantity: qty,
          RequestID: reference,
          CallBackURL: callbackUrl(),
        });
      } else {
        providerResponse = await ck(biller === "jamb" ? "APIJAMBV1.asp" : "APIWAECV1.asp", {
          ExamType: selected.id,
          PhoneNo: customerPhone,
          RequestID: reference,
          CallBackURL: callbackUrl(),
        });
      }
    } catch (error) {
      console.error("ClubKonnect provider request exception", error);
      await updateTxn(admin, user.id, reference, {
        status: "pending",
        provider: "clubkonnect",
        provider_reference: reference,
        metadata: { ...metadata, provider_request_failed: true, reconciliation_required: true },
      });
      return json({ success: true, status: "pending", reference, transaction_id: transactionId, message: "Your purchase is being verified." });
    }

    const classified = classify(providerResponse.body, providerResponse.ok);
    const providerOrderId = orderId(providerResponse.body);
    const providerRequestId = requestId(providerResponse.body) ?? reference;
    const safe = safeProviderResponse(providerResponse.body);

    if (classified.state === "successful") {
      await updateTxn(admin, user.id, reference, {
        status: "successful",
        provider: "clubkonnect",
        provider_reference: providerOrderId ?? providerRequestId,
        completed_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          clubkonnect_order_id: providerOrderId,
          clubkonnect_request_id: providerRequestId,
          clubkonnect_statuscode: classified.code,
          clubkonnect_status: classified.text,
          clubkonnect_response: safe,
          fulfillment: fulfillment(providerResponse.body),
          reconciliation_required: false,
          reconciled_at: new Date().toISOString(),
        },
      });
      return json({
        success: true,
        status: "successful",
        reference,
        transaction_id: transactionId,
        message: service === "data" ? "Data purchase completed successfully." : "Purchase completed successfully.",
        fulfillment: fulfillment(providerResponse.body),
      });
    }

    if (classified.state === "failed") {
      const refundResult = await refund(admin, user.id, reference, total, `${service} purchase failed.`, {
        ...metadata,
        clubkonnect_order_id: providerOrderId,
        clubkonnect_request_id: providerRequestId,
        clubkonnect_statuscode: classified.code,
        clubkonnect_status: classified.text,
        clubkonnect_response: safe,
      });

      await updateTxn(admin, user.id, reference, {
        status: "failed",
        provider: "clubkonnect",
        provider_reference: providerOrderId ?? providerRequestId,
        metadata: {
          ...metadata,
          clubkonnect_order_id: providerOrderId,
          clubkonnect_request_id: providerRequestId,
          clubkonnect_statuscode: classified.code,
          clubkonnect_status: classified.text,
          clubkonnect_response: safe,
          refunded: refundResult.success,
          refund_pending: !refundResult.success,
        },
      });

      if (!refundResult.success) return json({ success: false, status: "failed", reference, error: "The payment failed, but the automatic refund requires retry." }, 503);
      return json({ success: false, status: "failed", reference, error: "Purchase failed. Your wallet has been refunded." });
    }

    await updateTxn(admin, user.id, reference, {
      status: "pending",
      provider: "clubkonnect",
      provider_reference: providerOrderId ?? providerRequestId,
      metadata: {
        ...metadata,
        clubkonnect_order_id: providerOrderId,
        clubkonnect_request_id: providerRequestId,
        clubkonnect_statuscode: classified.code,
        clubkonnect_status: classified.text,
        clubkonnect_response: safe,
        reconciliation_required: true,
      },
    });

    return json({ success: true, status: "pending", reference, transaction_id: transactionId, message: "Your purchase is being processed." });
  }

  if (action === "status") {
    const reference = publicReference(body, details);
    if (!reference) return errorResponse("Transaction reference is required.");

    const { data: txn, error: txnError } = await admin.from("transactions").select("id, amount, status, provider, provider_reference, metadata").eq("user_id", user.id).eq("reference_number", reference).maybeSingle();
    if (txnError || !txn) return errorResponse("Transaction not found.", 404);

    if (txn.status === "successful") return json({ success: true, status: "successful", reference, transaction_id: txn.id, data: txn.metadata?.fulfillment ?? {} });
    if (txn.status === "failed") return json({ success: false, status: "failed", reference, transaction_id: txn.id });

    const metadata = obj(txn.metadata);
    const order = s(first(metadata.clubkonnect_order_id, txn.provider_reference));
    const request = s(first(metadata.clubkonnect_request_id, metadata.request_id, reference));

    let providerResponse: any;
    try {
      providerResponse = await ck("APIQueryV1.asp", order ? { OrderID: order } : { RequestID: request });
    } catch (error) {
      console.error("ClubKonnect status request failed", error);
      return json({ success: true, status: "pending", reference, message: "Your purchase is still being verified." });
    }

    const classified = classify(providerResponse.body, providerResponse.ok);
    const providerOrderId = (orderId(providerResponse.body) ?? order) || null;
    const providerRequestId = (requestId(providerResponse.body) ?? request) || reference;
    const safe = safeProviderResponse(providerResponse.body);

    if (classified.state === "successful") {
      const result = fulfillment(providerResponse.body);
      await updateTxn(admin, user.id, reference, {
        status: "successful",
        provider: "clubkonnect",
        provider_reference: providerOrderId ?? providerRequestId,
        completed_at: new Date().toISOString(),
        metadata: { ...metadata, clubkonnect_order_id: providerOrderId, clubkonnect_request_id: providerRequestId, clubkonnect_statuscode: classified.code, clubkonnect_status: classified.text, clubkonnect_response: safe, fulfillment: result, reconciliation_required: false },
      });
      return json({ success: true, status: "successful", reference, transaction_id: txn.id, message: "Purchase completed successfully.", fulfillment: result });
    }

    if (classified.state === "failed") {
      const amount = n(txn.amount);
      const refundResult = await refund(admin, user.id, reference, amount, "ClubKonnect transaction failed during reconciliation.", { ...metadata, clubkonnect_status: classified.text, clubkonnect_statuscode: classified.code, clubkonnect_response: safe });
      await updateTxn(admin, user.id, reference, { status: "failed", provider: "clubkonnect", provider_reference: providerOrderId ?? providerRequestId, metadata: { ...metadata, clubkonnect_status: classified.text, clubkonnect_statuscode: classified.code, clubkonnect_response: safe, refunded: refundResult.success, refund_pending: !refundResult.success } });
      if (!refundResult.success) return json({ success: false, status: "failed", reference, error: "The transaction failed and the automatic refund requires retry." }, 503);
      return json({ success: false, status: "failed", reference, message: "Purchase failed. Your wallet has been refunded." });
    }

    await updateTxn(admin, user.id, reference, { status: "pending", provider_reference: providerOrderId ?? providerRequestId, metadata: { ...metadata, clubkonnect_status: classified.text, clubkonnect_statuscode: classified.code, clubkonnect_response: safe, reconciliation_required: true } });
    return json({ success: true, status: "pending", reference, message: "Your purchase is still being verified." });
  }

  return errorResponse("Unsupported action.");
});
