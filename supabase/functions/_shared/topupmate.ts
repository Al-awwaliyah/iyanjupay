const TOPUPMATE_LIVE_BASE_URL = "https://connect.topupmate.com/api/";
const TOPUPMATE_SANDBOX_BASE_URL = "https://connect.topupmate.com/sandbox/";

export type TopupmateResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
};

/**
 * Returns the configured Topupmate API base URL.
 *
 * Environment variables:
 * - TOPUPMATE_ENV=live|sandbox
 * - TOPUPMATE_BASE_URL=optional custom base URL
 */
export function getTopupmateBaseUrl(): string {
  const configured = (Deno.env.get("TOPUPMATE_BASE_URL") ?? "").trim();

  if (configured) {
    let value = configured.replace(/\/+$/, "");

    // The documented live Connect root is /api/. If the secret was saved as
    // only https://connect.topupmate.com, normalize it here so requests such
    // as /cable/verify/ do not accidentally hit the website root.
    try {
      const u = new URL(value);
      if (u.hostname === "connect.topupmate.com" && u.pathname === "") {
        value = `${value}/api`;
      }
    } catch {
      // Keep the configured value unchanged if it is not a valid URL.
    }

    return `${value}/`;
  }

  const environment = (Deno.env.get("TOPUPMATE_ENV") ?? "live").trim().toLowerCase();

  return environment === "sandbox"
    ? TOPUPMATE_SANDBOX_BASE_URL
    : TOPUPMATE_LIVE_BASE_URL;
}

function getTopupmateApiKey(): string {
  const apiKey = (Deno.env.get("TOPUPMATE_API_KEY") ?? "").trim();

  if (!apiKey) {
    throw new Error("Topupmate is not configured.");
  }

  return apiKey;
}

/**
 * Make an authenticated request to Topupmate.
 * The API key is read only on the Edge Function server and is never exposed
 * to the browser.
 */
export async function topupmateRequest(
  path: string,
  init: RequestInit = {},
): Promise<TopupmateResult> {
  const headers = new Headers(init.headers);

  headers.set("Authorization", `Token ${getTopupmateApiKey()}`);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const cleanPath = path.replace(/^\/+/, "");
  const response = await fetch(`${getTopupmateBaseUrl()}${cleanPath}`, {
    ...init,
    headers,
  });

  const text = await response.text();

  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = {
      status: response.ok ? "success" : "fail",
      msg: text,
    };
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    body,
  };
}

export async function topupmateGet(
  path: string,
  params: Record<string, any> = {},
): Promise<TopupmateResult> {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value) === "") {
      continue;
    }

    query.set(key, String(value));
  }

  const queryString = query.toString();
  const requestPath = queryString ? `${path}?${queryString}` : path;

  return topupmateRequest(requestPath, { method: "GET" });
}

export async function topupmatePost(
  path: string,
  body: Record<string, any>,
): Promise<TopupmateResult> {
  return topupmateRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Normalize Topupmate's response status into the application's states. */
export function normalizeTopupmateStatus(body: any): "success" | "processing" | "fail" {
  const value = String(
    body?.status ??
      body?.data?.status ??
      "",
  ).toLowerCase();

  if (
    [
      "success",
      "successful",
      "completed",
      "complete",
      "succeeded",
    ].includes(value)
  ) {
    return "success";
  }

  if (
    [
      "processing",
      "pending",
      "queued",
      "initiated",
      "in_progress",
      "in-progress",
    ].includes(value)
  ) {
    return "processing";
  }

  return "fail";
}

/** Return a safe provider message from the different response shapes. */
export function getTopupmateMessage(body: any): string {
  return String(
    body?.msg ??
      body?.message ??
      body?.error ??
      body?.data?.msg ??
      body?.data?.message ??
      body?.data?.error ??
      "Topupmate request failed.",
  ).trim();
}

/** Extract the provider transaction/reference value when available. */
export function getTopupmateReference(body: any): string | null {
  const reference =
    body?.transref ??
    body?.transaction_reference ??
    body?.reference ??
    body?.ref ??
    body?.data?.transref ??
    body?.data?.transaction_reference ??
    body?.data?.reference ??
    body?.data?.ref;

  const value = String(reference ?? "").trim();
  return value || null;
}

/**
 * Case- and separator-insensitive field lookup. Topupmate returns keys in
 * mixed styles (planid, PlanID, plan_id, BundleTypeCode, Customer_Name ...),
 * so exact-key lookups silently miss data.
 */
export function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;

  const map = new Map<string, any>();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k.toLowerCase().replace(/[^a-z0-9]/g, ""), v);
  }

  for (const key of keys) {
    const v = map.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }

  return undefined;
}

function looksLikeRows(a: any): boolean {
  return Array.isArray(a) && a.length > 0 && a.some((x) => x && typeof x === "object");
}

/**
 * Extract an array of records from any of the common Topupmate/Reloadly-style
 * response envelopes (response, data, content, results, plans ...), searching
 * up to four levels deep.
 */
export function getTopupmateRows(body: any, depth = 0): any[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object" || depth > 4) return [];

  const preferred = [
    "response", "plans", "packages", "services", "data", "results",
    "content", "items", "products", "giftcards", "catalog", "catalogue",
    "list", "rows", "records",
  ];

  for (const key of preferred) {
    const value = pick(body, [key]);
    if (looksLikeRows(value)) return value;
  }

  for (const key of preferred) {
    const value = pick(body, [key]);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = getTopupmateRows(value, depth + 1);
      if (nested.length) return nested;
    }
  }

  return [];
}

export function getTopupmateId(item: any): string {
  return String(
    pick(item, [
      "id", "plan_id", "planid", "bundletypecode", "bundle_code", "bundlecode",
      "data_plan", "dataplan", "service_id", "serviceid", "code",
      "product_id", "productid", "package_id", "packageid", "plancode",
      "variation_code", "variationcode",
    ]) ?? "",
  ).trim();
}

export function getTopupmateName(item: any): string {
  return String(
    pick(item, [
      "name", "plan_name", "planname", "package_name", "packagename",
      "bundle_name", "bundlename", "bundle", "description", "title",
      "label", "product_name", "productname", "network", "provider_name",
      "providername",
    ]) ?? "",
  ).trim();
}

export function getTopupmateProvider(item: any): string {
  return String(
    pick(item, [
      "provider", "provider_name", "providername", "network",
      "network_name", "networkname", "operator",
    ]) ?? "",
  ).trim();
}

export function getTopupmatePrice(item: any): number {
  const value = Number(
    pick(item, [
      "price", "amount", "charge_amount", "selling_price", "sellingprice",
      "cost", "plan_amount", "planamount", "bundle_amount", "bundleamount",
      "plan_price", "planprice", "bundle_price", "bundleprice",
      "total_amount", "totalamount", "charge", "fee",
      "value", "denomination",
    ]),
  );

  return Number.isFinite(value) ? value : 0;
}

/** Round a positive customer charge upward to the next ₦10 boundary. */
export function ceilToTen(amount: number): number {
  return Math.ceil(Math.max(0, Number(amount) || 0) / 10) * 10;
}

/** Apply the application's percentage markup and round upward to ₦10. */
export function applyTopupmateMarkup(amount: number, markupPercent = 3): number {
  const value = Number(amount) || 0;

  if (value <= 0) {
    return 0;
  }

  return ceilToTen(value * (1 + markupPercent / 100));
}

// Backward-compatible aliases used by the Topupmate Edge Functions.
export const base = getTopupmateBaseUrl;
export const tm = topupmateRequest;
export const get = topupmateGet;
export const post = topupmatePost;
export const status = normalizeTopupmateStatus;
export const msg = getTopupmateMessage;
export const pref = getTopupmateReference;
export const rows = getTopupmateRows;
export const id = getTopupmateId;
export const name = getTopupmateName;
export const provider = getTopupmateProvider;
export const price = getTopupmatePrice;
export const ceil10 = ceilToTen;
export const sell = applyTopupmateMarkup;
