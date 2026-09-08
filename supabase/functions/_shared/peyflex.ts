/**
 * IyanjuPay — VTUGATE server-side API client.
 *
 * The file keeps the existing _shared/peyflex.ts import path so the current
 * Supabase function can be migrated without changing every frontend reference.
 * The implementation itself contains NO Peyflex API calls.
 *
 * Required Supabase secrets:
 *   VTUGATE_API_TOKEN
 * Optional:
 *   VTUGATE_BASE_URL (defaults to https://api.vtugate.com)
 */

export const VTUGATE_BASE_URL =
  Deno.env.get("VTUGATE_BASE_URL")?.trim() || "https://api.vtugate.com";

export type VTUGATEHttpResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
  rawText: string;
};

function getToken(): string {
  const token = Deno.env.get("VTUGATE_API_TOKEN")?.trim();
  if (!token) throw new Error("VTUGATE_API_TOKEN is not configured.");
  return token;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${VTUGATE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseResponse(response: Response): Promise<VTUGATEHttpResult> {
  const rawText = await response.text();
  let body: any = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }
  return { ok: response.ok, httpStatus: response.status, body, rawText };
}

export async function vtugatePost(
  path: string,
  body: Record<string, unknown> = {},
): Promise<VTUGATEHttpResult> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) form.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${getToken()}`,
      },
      body: form.toString(),
      signal: controller.signal,
    });
    return await parseResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

export function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  const obj = asObject(value);
  for (const candidate of [obj.data, obj.results, obj.items, obj.plans, obj.services]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

export function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).trim();
  try { return JSON.stringify(value); } catch { return ""; }
}

export function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(text(value).replace(/[₦,\s]/g, "").replace(/NGN/gi, ""));
  return Number.isFinite(n) ? n : 0;
}

export function providerMessage(body: any): string {
  const obj = asObject(body);
  const data = asObject(obj.data);
  return text(firstValue(
    obj.message,
    obj.error,
    obj.detail,
    data.provider_message,
    data.message,
    data.error,
  ));
}

export function providerReference(body: any): string | null {
  const obj = asObject(body);
  const data = asObject(obj.data);
  const value = firstValue(
    data.external_reference,
    obj.external_reference,
    data.transaction_id,
    obj.transaction_id,
  );
  const result = text(value);
  return result || null;
}

export function normalizeStatus(body: any): string {
  const obj = asObject(body);
  const data = asObject(obj.data);
  return text(firstValue(
    data.status,
    obj.status,
    data.provider_status,
    obj.provider_status,
  )).toUpperCase().replace(/[\s-]+/g, "_");
}

export function providerLooksSuccessful(body: any, httpOk: boolean): boolean {
  if (!httpOk) return false;
  const obj = asObject(body);
  const data = asObject(obj.data);
  return obj.status === true || data.provider_status === true ||
    ["SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(normalizeStatus(body));
}

export function providerLooksFailed(body: any, httpOk: boolean): boolean {
  if (!httpOk) return true;
  const obj = asObject(body);
  const data = asObject(obj.data);
  if (obj.status === false || data.provider_status === false) return true;
  return ["FAILED", "FAILURE", "DECLINED", "REJECTED", "CANCELLED", "REFUNDED"].includes(normalizeStatus(body));
}
