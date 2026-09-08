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
  vtugatePost,
} from "../_shared/peyflex.ts";

import { adminClient, corsHeaders, getUser, json } from "../_shared/auth.ts";

/**
 * IyanjuPay service gateway — VTUGATE implementation.
 *
 * The Supabase function name remains `peyflex-services` during this migration
 * so existing client routing is not broken. There are no Peyflex API calls.
 *
 * Supported customer services:
 *   airtime, data, cable, electricity, education
 *
 * Betting, Smile, recharge-card, airtime/data e-pin and other unsupported
 * products are deliberately not exposed through this gateway.
 */

type Service = "airtime" | "data" | "cable" | "electricity" | "education";
const SUPPORTED = new Set<Service>(["airtime", "data", "cable", "electricity", "education"]);
const HOT_TYPES = new Set(["sme", "awoof", "gifting"]);

function clean(value: unknown): string { return text(value).trim(); }
function bodyObject(body: any): Record<string, any> { return asObject(body); }
function pickBody(body: any, ...keys: string[]): unknown {
  const obj = bodyObject(body);
  const details = asObject(obj.details);
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && clean(obj[key]) !== "") return obj[key];
    if (details[key] !== undefined && details[key] !== null && clean(details[key]) !== "") return details[key];
  }
  return undefined;
}

function serviceOf(value: unknown): Service | null {
  const v = clean(value).toLowerCase();
  if (v === "airtime") return "airtime";
  if (v === "data") return "data";
  if (["cable", "cabletv", "cable-tv", "tv"].includes(v)) return "cable";
  if (v === "electricity") return "electricity";
  if (["education", "waec", "jamb", "neco", "nabteb"].includes(v)) return "education";
  return null;
}

function normalizePhone(value: unknown): string {
  const raw = clean(value).replace(/[\s()\-]/g, "");
  if (/^\+234\d{10}$/.test(raw)) return raw.slice(1);
  if (/^234\d{10}$/.test(raw)) return raw;
  if (/^0\d{10}$/.test(raw)) return `234${raw.slice(1)}`;
  return raw;
}
function validPhone(value: string): boolean { return /^234\d{10}$/.test(value); }

function networkName(value: unknown): string {
  const raw = clean(value);
  const k = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (k.includes("mtn")) return "MTN";
  if (k.includes("glo")) return "GLO";
  if (k.includes("airtel")) return "Airtel";
  if (k.includes("9mobile") || k.includes("etisalat")) return "9mobile";
  return raw;
}

function logoForNetwork(name: string): string | null {
  const k = name.toLowerCase();
  if (k.includes("mtn")) return "https://www.google.com/s2/favicons?domain=mtn.ng&sz=128";
  if (k.includes("glo")) return "https://www.google.com/s2/favicons?domain=gloworld.com&sz=128";
  if (k.includes("airtel")) return "https://www.google.com/s2/favicons?domain=airtel.com.ng&sz=128";
  if (k.includes("9mobile")) return "https://www.google.com/s2/favicons?domain=9mobile.com.ng&sz=128";
  return null;
}

function sizeLabel(mb: number, name: string): string {
  if (mb > 0) {
    if (mb >= 1024) {
      const gb = mb / 1024;
      return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
    }
    return `${mb} MB`;
  }
  const m = name.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : name || "Data plan";
}

function dataCategory(dataType: unknown, plan: any): "HOT" | "EXTRA_NIGHT" | "DAILY" | "WEEKLY" | "MONTHLY" {
  const type = clean(dataType).toLowerCase();
  if (HOT_TYPES.has(type)) return "HOT";
  const label = `${clean(plan.name)} ${clean(plan.description)}`.toLowerCase();
  if (/extra\s*night|night\s*(plan|data)|midnight/.test(label)) return "EXTRA_NIGHT";
  const days = numberValue(plan.validity_days);
  if (days >= 28) return "MONTHLY";
  if (days >= 7) return "WEEKLY";
  return "DAILY";
}

function dataPlan(plan: any, serviceRow: any): Record<string, unknown> {
  const name = clean(plan.name) || "Data plan";
  const serviceId = numberValue(plan.service_id || serviceRow.service_id);
  const code = clean(plan.code);
  const price = numberValue(plan.price);
  const network = networkName(firstValue(plan.network_name, serviceRow.network_name));
  const validityDays = numberValue(plan.validity_days);
  return {
    id: `${serviceId}:${code}`,
    code,
    name,
    display_name: sizeLabel(numberValue(plan.size_mb), name),
    price,
    amount: price,
    providerPrice: price,
    provider_amount: price,
    service_id: serviceId,
    plan_code: code,
    networkName: network,
    networkCode: network.toLowerCase(),
    validityDays,
    validity_days: validityDays,
    duration: validityDays,
    validity: validityDays ? `${validityDays} days` : null,
    data_type: clean(serviceRow.data_type).toLowerCase() || null,
    dataCategory: dataCategory(serviceRow.data_type, plan),
    delivery_rate: plan.delivery_rate ?? null,
    delivery_comment: clean(plan.delivery_comment) || null,
    raw: plan,
  };
}

function serviceRowToBiller(row: any, service: Service): Record<string, unknown> {
  const id = numberValue(row.service_id);
  if (service === "data" || service === "airtime") {
    const name = networkName(row.network_name);
    return {
      id: String(id),
      code: String(id),
      service_id: id,
      name,
      display_name: name,
      network_name: name,
      data_type: clean(row.data_type).toLowerCase() || null,
      logo: logoForNetwork(name),
      raw: row,
    };
  }
  if (service === "cable") {
    const name = clean(row.tv_name || row.network_name || row.service_name || row.name).toUpperCase();
    return { id: String(id), code: String(id), service_id: id, name, display_name: name, tv_name: name, raw: row };
  }
  if (service === "electricity") {
    const name = clean(row.disco || row.service_name || row.name).toUpperCase();
    return { id: String(id), code: String(id), service_id: id, name, display_name: name, disco: clean(row.disco).toLowerCase() || name.toLowerCase(), meterTypes: [
      { id: "prepaid", code: "prepaid", name: "Prepaid" },
      { id: "postpaid", code: "postpaid", name: "Postpaid" },
    ], raw: row };
  }
  const name = clean(row.edu_type || row.service_name || row.service_name || row.name || row.product_code).toUpperCase();
  return { id: String(id), code: String(id), service_id: id, name, display_name: name, edu_type: row.edu_type, product_code: clean(row.product_code), raw: row };
}

async function fetchAllServices(): Promise<any[]> {
  const result = await vtugatePost("/api/v1/fetchallservices", {});
  if (!result.ok || !result.body?.status) throw new Error(providerMessage(result.body) || "Unable to load available services.");
  return asArray(result.body.data);
}

async function catalog(service: Service, code?: string, extra?: Record<string, unknown>) {
  const rows = (await fetchAllServices()).filter((row) => {
    const type = clean(row.service_type).toLowerCase();
    return service === "cable" ? type === "tv" : type === service;
  });

  if (service === "data") {
    const selectedServiceId = code ? numberValue(code) : 0;
    const selectedRow = selectedServiceId
      ? rows.find((r) => numberValue(r.service_id) === selectedServiceId)
      : null;
    const network = selectedRow ? networkName(selectedRow.network_name) : (code ? networkName(code) : "");
    const networkRows = rows.filter((r) => !network || networkName(r.network_name) === network);
    const unique = new Map<string, any>();
    for (const row of networkRows) {
      const key = networkName(row.network_name).toLowerCase();
      if (!unique.has(key)) unique.set(key, row);
    }
    if (!code) {
      const billers = [...unique.values()].map((r) => serviceRowToBiller(r, service));
      return { success: true, service, networks: billers, billers, providers: billers, items: [], plans: [], packages: [], amount_based: false, requires_verification: false };
    }
    const plans: any[] = [];
    const seen = new Set<string>();
    for (const row of networkRows) {
      const result = await vtugatePost("/api/v1/fetchdataplans", { service_id: numberValue(row.service_id) });
      if (!result.ok || !result.body?.status) continue;
      for (const plan of asArray(asObject(result.body.data).data_plans)) {
        const normalized = dataPlan(plan, row);
        if (!normalized.code || normalized.price <= 0) continue;
        const key = `${normalized.service_id}:${normalized.code}`;
        if (!seen.has(key)) { seen.add(key); plans.push(normalized); }
      }
    }
    return { success: true, service, networks: [...unique.values()].map((r) => serviceRowToBiller(r, service)), billers: [...unique.values()].map((r) => serviceRowToBiller(r, service)), items: plans, plans, packages: plans, amount_based: false, requires_verification: false };
  }

  const billers = rows.map((r) => serviceRowToBiller(r, service));
  if (!code) {
    return { success: true, service, billers, networks: billers, providers: billers, items: [], plans: [], packages: [], amount_based: service === "airtime" || service === "electricity", requires_verification: service === "cable" || service === "electricity" };
  }

  const serviceId = numberValue(code);
  const row = rows.find((r) => numberValue(r.service_id) === serviceId);
  if (!row) throw new Error("The selected service is no longer available.");

  if (service === "cable") {
    const smartcard = clean(extra?.smartcard_number || extra?.smartcard || extra?.customer);
    if (!smartcard) return { success: true, service, billers, networks: billers, items: [], plans: [], packages: [], requires_verification: true };
    const verified = await verifyCustomer(service, { service_id: serviceId, smartcard_number: smartcard, phone: clean(extra?.phone) || "08000000000" });
    const plans = asArray(asObject(verified.data).cable_plans).map((p: any) => ({
      id: clean(p.code), code: clean(p.code), plan_code: clean(p.code), name: clean(p.name), plan_name: clean(p.name),
      price: numberValue(p.price), amount: numberValue(p.price), service_id: numberValue(p.service_id || serviceId), raw: p,
    }));
    return { success: true, service, billers, networks: billers, items: plans, plans, packages: plans, requires_verification: true, verified_name: clean(asObject(verified.data).smartcard_name) };
  }

  if (service === "education") {
    const result = await vtugatePost("/api/v1/geteducationtypeprice", { service_id: serviceId });
    if (!result.ok || !result.body?.status) throw new Error(providerMessage(result.body) || "Unable to load education price.");
    const data = asObject(result.body.data);
    const item = { id: String(serviceId), code: clean(data.product_code || row.product_code || data.type), plan_code: clean(data.product_code || row.product_code || data.type), product_code: clean(data.product_code || row.product_code || data.type), name: clean(row.service_name || row.edu_type || data.type), price: numberValue(data.price), amount: numberValue(data.price), service_id: serviceId, raw: data };
    return { success: true, service, billers, networks: billers, items: [item], plans: [item], packages: [item], requires_verification: false };
  }

  return { success: true, service, billers, networks: billers, items: [], plans: [], packages: [], requires_verification: service === "electricity" };
}

async function verifyCustomer(service: Service, body: any): Promise<Record<string, unknown>> {
  if (service === "cable") {
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    const smartcard = clean(pickBody(body, "smartcard_number", "smartcard", "iuc", "customer"));
    const phone = normalizePhone(pickBody(body, "phone", "phone_number") || "08000000000");
    if (!serviceId || !smartcard) throw new Error("Cable service and SmartCard/IUC number are required.");
    const result = await vtugatePost("/api/v1/verifycabletv", { service_id: serviceId, phone, smartcard_number: smartcard });
    const data = asObject(result.body?.data);
    const success = result.ok && result.body?.status === true && data.provider_status !== false;
    if (!success) throw new Error(providerMessage(result.body) || "Cable customer verification failed.");
    return { success: true, status: "success", message: clean(result.body.message) || "Verification was successful", customer_name: clean(data.smartcard_name), data, raw: result.body };
  }
  if (service === "electricity") {
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    const meter = clean(pickBody(body, "meter_no", "meter_number", "meterNumber", "customer"));
    let disco = clean(pickBody(body, "disco"));
    if (!serviceId || !meter) throw new Error("Electricity service and meter number are required.");
    if (!disco || /^\d+$/.test(disco)) {
      const rows = await fetchAllServices();
      const row = rows.find((r) => clean(r.service_type).toLowerCase() === "electricity" && numberValue(r.service_id) === serviceId);
      disco = clean(row?.disco || row?.network_name || row?.service_name);
    }
    if (!disco) throw new Error("Unable to determine the selected Disco.");
    const result = await vtugatePost("/api/v1/verifyelectricity", { service_id: serviceId, meter_no: meter, disco: disco.toLowerCase() });
    const data = asObject(result.body?.data);
    const success = result.ok && result.body?.status === true && data.provider_status !== false;
    if (!success) throw new Error(providerMessage(result.body) || "Meter verification failed.");
    return { success: true, status: "success", message: clean(result.body.message) || "Verification was successful", customer_name: clean(data.meter_name), data, raw: result.body };
  }
  throw new Error("Verification is not supported for this service.");
}

function findDataPlan(plans: any[], serviceId: number, planCode: string): any | null {
  return plans.find((p) => numberValue(p.service_id) === serviceId && clean(p.code) === planCode) || null;
}

async function authoritativePurchaseData(body: any) {
  const serviceId = numberValue(pickBody(body, "service_id", "selected_service_id"));
  const planCode = clean(pickBody(body, "plan_code", "item_code", "itemCode"));
  if (!serviceId || !planCode) throw new Error("A valid data plan is required.");
  const result = await vtugatePost("/api/v1/fetchdataplans", { service_id: serviceId });
  if (!result.ok || !result.body?.status) throw new Error(providerMessage(result.body) || "The selected data plan is unavailable.");
  const plan = findDataPlan(asArray(asObject(result.body.data).data_plans), serviceId, planCode);
  if (!plan) throw new Error("The selected data plan is no longer available.");
  const catalogPrice = numberValue(plan.price);
  const requestedAmount = numberValue(pickBody(body, "amount"));
  if (catalogPrice <= 0 || Math.abs(requestedAmount - catalogPrice) > 0.01) throw new Error("The selected data plan price is no longer valid.");
  return { price: catalogPrice, plan };
}

async function purchase(admin: any, user: any, service: Service, body: any) {
  const phone = normalizePhone(pickBody(body, "phone_number", "phone", "customer"));
  if (["airtime", "data", "education"].includes(service) && !validPhone(phone)) throw new Error("Please provide a valid Nigerian phone number.");

  let sellingAmount = numberValue(pickBody(body, "amount", "selling_amount"));
  let selected: any = null;
  let providerRequest: Record<string, unknown>;

  if (service === "data") {
    const data = await authoritativePurchaseData(body);
    sellingAmount = data.price;
    selected = data.plan;
    providerRequest = { service_id: numberValue(selected.service_id), phone_number: phone, amount: sellingAmount, plan_code: clean(selected.code) };
  } else if (service === "airtime") {
    if (sellingAmount <= 0) throw new Error("A valid airtime amount is required.");
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    if (!serviceId) throw new Error("Please select a network.");
    providerRequest = { service_id: serviceId, phone_number: phone, amount: sellingAmount };
  } else if (service === "cable") {
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    const smartcard = clean(pickBody(body, "smartcard_number", "smartcard", "iuc", "customer"));
    const planCode = clean(pickBody(body, "plan_code", "item_code", "itemCode"));
    const planName = clean(pickBody(body, "plan_name", "item_name", "itemName"));
    if (!serviceId || !smartcard || !planCode || !planName) throw new Error("Cable service, SmartCard/IUC and verified package are required.");
    const phoneValue = normalizePhone(pickBody(body, "phone", "phone_number") || user.phone);
    if (!validPhone(phoneValue)) throw new Error("A valid Nigerian phone number is required for this cable purchase.");
    providerRequest = { service_id: serviceId, phone: phoneValue, smartcard_number: smartcard, amount: sellingAmount, plan_code: planCode, plan_name: planName };
  } else if (service === "electricity") {
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    const meter = clean(pickBody(body, "meter_no", "meter_number", "meterNumber", "customer"));
    let disco = clean(pickBody(body, "disco"));
    if (!serviceId || !meter || sellingAmount <= 0) throw new Error("Electricity service, meter and amount are required.");
    if (!disco || /^\d+$/.test(disco)) {
      const rows = await fetchAllServices();
      const row = rows.find((r) => clean(r.service_type).toLowerCase() === "electricity" && numberValue(r.service_id) === serviceId);
      disco = clean(row?.disco || row?.network_name || row?.service_name);
    }
    if (!disco) throw new Error("Unable to determine the selected Disco.");
    const electricityPhone = normalizePhone(pickBody(body, "phone", "phone_number") || user.phone);
    if (!validPhone(electricityPhone)) throw new Error("A valid Nigerian phone number is required for this electricity purchase.");
    providerRequest = { service_id: serviceId, meter_no: meter, disco: disco.toLowerCase(), amount: sellingAmount, phone_number: electricityPhone };
  } else {
    const serviceId = numberValue(pickBody(body, "service_id", "biller_code", "billerCode"));
    const productCode = clean(pickBody(body, "product_code", "plan_code", "item_code"));
    const quantity = Math.max(1, Math.floor(numberValue(pickBody(body, "quantity")) || 1));
    if (!serviceId || !productCode || sellingAmount <= 0) throw new Error("Education product and amount are required.");
    providerRequest = { service_id: serviceId, phone, quantity, product_code: productCode };
  }

  if (sellingAmount <= 0) throw new Error("A valid payment amount is required.");

  const reference = `VTU_${crypto.randomUUID()}`;
  const metadata: Record<string, unknown> = {
    service,
    provider: "vtugate",
    provider_id: "vtugate",
    customer: phone || null,
    selling_amount: sellingAmount,
    provider_amount: sellingAmount,
    selected_item: selected,
    provider_request: providerRequest,
    request_id: reference,
    reconciliation_required: true,
  };

  const { data: debitResult, error: debitError } = await admin.rpc("debit_wallet", {
    _user_id: user.id,
    _amount: sellingAmount,
    _description: `${service} purchase`,
    _idempotency_key: clean(pickBody(body, "idempotency_key", "idempotencyKey")) || reference,
    _reference: reference,
    _category: "bill_payment",
    _metadata: metadata,
  });
  if (debitError) throw new Error("Unable to process the payment from your wallet.");
  const localTransactionId = debitResult?.id ?? null;
  if (!localTransactionId) throw new Error("Wallet debit did not return a transaction.");

  let result: any;
  try {
    const endpoint = service === "airtime" ? "/api/v1/buyairtime" : service === "data" ? "/api/v1/buydata" : service === "cable" ? "/api/v1/buycabletv" : service === "electricity" ? "/api/v1/buyelectricity" : "/api/v1/buyeducation";
    result = await vtugatePost(endpoint, providerRequest);
  } catch (error) {
    await updateTransaction(admin, user.id, reference, { status: "pending", provider: "vtugate", provider_reference: reference, metadata: { ...metadata, provider_request_exception: true, reconciliation_required: true } });
    return { success: true, status: "pending", reference, transaction_id: localTransactionId, message: "Your payment was sent for processing and is being verified." };
  }

  const providerData = asObject(result.body?.data);
  const externalReference = clean(providerData.external_reference) || null;
  const providerTransactionId = numberValue(providerData.transaction_id) || null;
  const providerRef = externalReference || (providerTransactionId ? String(providerTransactionId) : null) || reference;

  if (providerLooksSuccessful(result.body, result.ok)) {
    await updateTransaction(admin, user.id, reference, { status: "completed", provider: "vtugate", provider_reference: providerRef, completed_at: new Date().toISOString(), metadata: { ...metadata, vtugate_response: result.body, vtugate_transaction_id: providerTransactionId, vtugate_external_reference: externalReference, reconciliation_required: false } });
    return { success: true, status: "successful", reference, transaction_id: localTransactionId, provider_transaction_id: providerTransactionId, provider_reference: externalReference, message: providerMessage(result.body) || "Purchase completed successfully.", fulfillment: result.body };
  }

  if (providerLooksFailed(result.body, result.ok)) {
    const reason = providerMessage(result.body) || "The service purchase failed.";
    const refund = await refundTransaction(admin, user.id, reference, sellingAmount, reason, { ...metadata, vtugate_response: result.body });
    await updateTransaction(admin, user.id, reference, { status: "failed", provider: "vtugate", provider_reference: providerRef, metadata: { ...metadata, vtugate_response: result.body, refunded: refund.success, refund_pending: !refund.success, reconciliation_required: !refund.success } });
    return refund.success
      ? { success: false, status: "failed", reference, transaction_id: localTransactionId, error: reason, refunded: true }
      : { success: false, status: "failed", reference, transaction_id: localTransactionId, error: "The purchase failed, but the automatic refund requires retry.", refund_pending: true };
  }

  await updateTransaction(admin, user.id, reference, { status: "pending", provider: "vtugate", provider_reference: providerRef, metadata: { ...metadata, vtugate_response: result.body, reconciliation_required: true } });
  return { success: true, status: "pending", reference, transaction_id: localTransactionId, provider_transaction_id: providerTransactionId, provider_reference: externalReference, message: providerMessage(result.body) || "Your payment is being processed and will be verified." };
}

async function updateTransaction(admin: any, userId: string, reference: string, updates: Record<string, unknown>) {
  const { error } = await admin.from("transactions").update(updates).eq("user_id", userId).eq("reference_number", reference);
  if (error) console.error("VTUGATE transaction update failed:", error);
  return !error;
}

async function refundTransaction(admin: any, userId: string, reference: string, amount: number, reason: string, metadata: Record<string, unknown>) {
  const refundReference = `REFUND_${reference}`;
  const { data, error } = await admin.rpc("refund_wallet", {
    _user_id: userId,
    _amount: amount,
    _description: "VTUGATE service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: { ...metadata, original_reference: reference, refund_reference: refundReference, provider: "vtugate", reason },
  });
  return { success: !error, data, error: error?.message ?? null };
}

async function transactionStatus(body: any) {
  const transactionId = numberValue(pickBody(body, "transaction_id", "provider_transaction_id"));
  const externalReference = clean(pickBody(body, "external_reference", "provider_reference"));
  if (!transactionId && !externalReference) throw new Error("transaction_id or external_reference is required.");
  const result = await vtugatePost("/api/v1/transactionstatus", {
    ...(transactionId ? { transaction_id: transactionId } : {}),
    ...(externalReference ? { external_reference: externalReference } : {}),
    requery: pickBody(body, "requery") ?? true,
  });
  if (!result.ok || !result.body?.status) throw new Error(providerMessage(result.body) || "Unable to fetch transaction status.");
  const data = asObject(result.body.data);
  return { success: true, status: clean(data.status).toLowerCase() || "pending", data, raw: result.body };
}

async function accountDetails() {
  const result = await vtugatePost("/api/v1/accountdetails", {});
  if (!result.ok || !result.body?.status) throw new Error(providerMessage(result.body) || "Unable to fetch provider account details.");
  return { success: true, data: result.body.data, raw: result.body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ success: false, error: "Authentication required." }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: "Invalid JSON request body." }, 400); }

    const action = clean(body?.action || "catalog").toLowerCase();
    if (action === "account_details") return json(await accountDetails());
    if (action === "transaction_status" || action === "requery") return json(await transactionStatus(body));

    const service = serviceOf(body?.service);
    if (!service || !SUPPORTED.has(service)) return json({ success: false, error: "This service is not available." }, 400);

    if (["catalog", "get_catalog", "billers", "networks", "plans", "items", "get_billers"].includes(action)) {
      const code = clean(pickBody(body, "biller_code", "billerCode", "service_id", "serviceId", "network"));
      const result = await catalog(service, code || undefined, {
        smartcard_number: pickBody(body, "smartcard_number", "smartcard", "iuc", "customer"),
        phone: pickBody(body, "phone", "phone_number"),
      });
      return json(result);
    }

    if (["verify", "validate", "verify_customer"].includes(action)) return json(await verifyCustomer(service, body));
    if (["pay", "purchase", "service"].includes(action)) return json(await purchase(adminClient(), user, service, body));

    return json({ success: false, error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("VTUGATE services error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unable to process service request." }, 400);
  }
});
