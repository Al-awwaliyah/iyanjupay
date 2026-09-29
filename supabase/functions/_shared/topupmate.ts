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
      "ok",
      "true",
      "1",
    ].includes(value) ||
    body?.success === true ||
    body?.success === "true" ||
    body?.ok === true ||
    body?.data?.success === true ||
    body?.data?.success === "true"
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
    ].includes(value) ||
    body?.success === false &&
      ["processing", "pending", "queued", "initiated", "in_progress", "in-progress"].includes(String(body?.status ?? "").toLowerCase())
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

/** Extract an array from the common Topupmate catalogue response shapes. */
export function getTopupmateRows(body: any): any[] {
  if (Array.isArray(body)) {
    return body;
  }

  const candidates = [
    body?.response,
    body?.plans,
    body?.packages,
    body?.services,
    body?.items,
    body?.products,
    body?.providers,
    body?.msg,
    body?.data,
    body?.results,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nested of [
        value.items, value.plans, value.packages, value.products,
        value.providers, value.results, value.response, value.msg, value.data,
      ]) {
        if (Array.isArray(nested)) return nested;
      }
    }
  }

  return [];
}

export function getTopupmateId(item: any): string {
  return String(
    item?.id ??
      item?.plan_id ??
      item?.planId ??
      item?.service_id ??
      item?.serviceId ??
      item?.code ??
      item?.product_id ??
      item?.productId ??
      "",
  ).trim();
}

export function getTopupmateName(item: any): string {
  return String(
    item?.name ??
      item?.plan_name ??
      item?.planName ??
      item?.package_name ??
      item?.packageName ??
      item?.description ??
      item?.title ??
      item?.label ??
      item?.network ??
      item?.providerName ??
      item?.provider_name ??
      "",
  ).trim();
}

export function getTopupmateProvider(item: any): string {
  return String(
    item?.provider ??
      item?.provider_name ??
      item?.providerName ??
      item?.network ??
      item?.network_name ??
      item?.networkName ??
      "",
  ).trim();
}

export function getTopupmatePrice(item: any): number {
  const value = Number(
    item?.price ??
      item?.amount ??
      item?.charge_amount ??
      item?.selling_price ??
      item?.cost ??
      item?.value ??
      item?.denomination,
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
