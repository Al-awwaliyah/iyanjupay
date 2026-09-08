/**
 * IyanjuPay — Peyflex server-side API client
 *
 * Source of truth:
 * Peyflex Public API Documentation supplied for this project.
 *
 * IMPORTANT:
 * - PEYFLEX_API_TOKEN is a Supabase Edge Function secret.
 * - Never import this file from browser/client code.
 * - Provider credentials are never returned to the client.
 */

function getBaseUrl(): string {
  const baseUrl = Deno.env.get("PEYFLEX_BASE_URL")?.trim();
  if (!baseUrl) throw new Error("PEYFLEX_BASE_URL is not configured.");
  return baseUrl.replace(/\/+$/, "");
}

export type PeyflexHttpResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
  rawText: string;
};

function getToken(): string {
  const token = Deno.env.get("PEYFLEX_API_TOKEN")?.trim();
  if (!token) {
    throw new Error("PEYFLEX_API_TOKEN is not configured.");
  }
  return token;
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
  );

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function parseResponse(response: Response): Promise<PeyflexHttpResult> {
  const rawText = await response.text();
  let body: any = null;

  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    body,
    rawText,
  };
}

/**
 * Public catalogue GET.
 * The Peyflex documentation marks catalogue endpoints such as networks/plans
 * as not requiring authentication.
 */
export async function peyflexPublicGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseResponse(response);
}

/**
 * Authenticated Peyflex GET.
 */
export async function peyflexGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${getToken()}`,
    },
  });

  return parseResponse(response);
}

/**
 * Authenticated Peyflex POST.
 */
export async function peyflexPost(
  path: string,
  body: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${getToken()}`,
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}

/**
 * Safe provider response extraction.
 * Peyflex's documentation examples show JSON but do not define one universal
 * response envelope for every service, so the adapter deliberately handles
 * common {data}, {results}, {message}, {status}, etc. shapes without inventing
 * provider fields.
 */
export function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;

  const obj = asObject(value);
  const candidates = [
    obj.results,
    obj.data,
    obj.items,
    obj.plans,
    obj.providers,
    obj.networks,
    obj.options,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = asArray(candidate);
      if (nested.length) return nested;
    }
  }

  return [];
}

export function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }
  return undefined;
}

export function text(value: unknown): string {
  if (value === undefined || value === null) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  const obj = asObject(value);
  const nested = firstValue(
    obj.name,
    obj.Name,
    obj.label,
    obj.Label,
    obj.title,
    obj.Title,
    obj.code,
    obj.Code,
    obj.id,
    obj.ID,
    obj.identifier,
  );

  if (nested !== undefined && nested !== value) return text(nested);

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = text(value)
    .replace(/[₦,\s]/g, "")
    .replace(/NGN/gi, "");

  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
}

export function normalizeStatus(body: any): string {
  const obj = asObject(body);
  const data = asObject(obj.data);

  return text(
    firstValue(
      obj.status,
      obj.Status,
      obj.state,
      obj.State,
      data.status,
      data.Status,
      data.state,
      data.State,
    ),
  )
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function providerMessage(body: any): string {
  const obj = asObject(body);
  const data = asObject(obj.data);

  return text(
    firstValue(
      obj.message,
      obj.Message,
      obj.detail,
      obj.error,
      obj.error_message,
      data.message,
      data.Message,
      data.detail,
      data.error,
    ),
  );
}

export function providerReference(body: any): string | null {
  const obj = asObject(body);
  const data = asObject(obj.data);

  const value = firstValue(
    obj.reference,
    obj.reference_id,
    obj.referenceId,
    obj.transaction_reference,
    obj.transaction_id,
    obj.order_id,
    obj.orderId,
    obj.id,
    data.reference,
    data.reference_id,
    data.referenceId,
    data.transaction_reference,
    data.transaction_id,
    data.order_id,
    data.orderId,
    data.id,
  );

  const result = text(value);
  return result || null;
}

export function providerLooksSuccessful(body: any, httpOk: boolean): boolean {
  if (!httpOk) return false;

  const status = normalizeStatus(body);
  const obj = asObject(body);
  const data = asObject(obj.data);

  if (
    status === "SUCCESS" ||
    status === "SUCCESSFUL" ||
    status === "COMPLETED" ||
    status === "ORDER_COMPLETED"
  ) {
    return true;
  }

  if (obj.success === true || data.success === true) return true;

  return false;
}

export function providerLooksFailed(body: any, httpOk: boolean): boolean {
  if (!httpOk) return true;

  const status = normalizeStatus(body);

  return new Set([
    "FAILED",
    "FAILURE",
    "TRANSACTION_FAILED",
    "ORDER_FAILED",
    "DECLINED",
    "REJECTED",
    "CANCELLED",
    "INVALID",
  ]).has(status);
}

export function roundSellingPrice(
  providerCost: number,
  markupRate: number,
): number {
  const marked = providerCost * (1 + markupRate);
  return Math.ceil((marked - Number.EPSILON) / 5) * 5;
}
