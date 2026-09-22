const BASE_URL = "https://bilalsadasub.com";

export type Json = Record<string, unknown>;

export const BILAL_BASE_URL = BASE_URL;

export function bilalToken(): string {
  const token = Deno.env.get("BILALSADASUB_API_TOKEN")?.trim();
  if (!token) throw new Error("Bilalsadasub is not configured");
  return token;
}

export async function bilalRequest<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = bilalToken();
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Token ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(`Bilalsadasub HTTP ${response.status}`);
      (error as any).status = response.status;
      (error as any).provider = data;
      throw error;
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function postJson<T = any>(path: string, body: Json): Promise<T> {
  return bilalRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function getJson<T = any>(path: string): Promise<T> {
  return bilalRequest<T>(path, { method: "GET" });
}

export function safeProviderMessage(error: unknown): string {
  const status = Number((error as any)?.status ?? 0);
  if (status === 401) return "Service temporarily unavailable.";
  if (status === 402) return "Service temporarily unavailable.";
  if (status === 429) return "Please try again shortly.";
  return "Unable to complete the service request right now.";
}

export function networkId(value: unknown): number | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (["1", "01", "mtn"].includes(v)) return 1;
  if (["2", "02", "airtel"].includes(v)) return 2;
  if (["3", "03", "glo"].includes(v)) return 3;
  if (["4", "04", "9mobile", "9 mobile", "t2", "etisalat"].includes(v)) return 4;
  if (["5", "05", "vitel"].includes(v)) return 5;
  return null;
}

export function networkName(id: number): string {
  return ({1: "MTN", 2: "Airtel", 3: "Glo", 4: "9mobile", 5: "VITEL"} as Record<number,string>)[id] ?? String(id);
}

export function sellingPrice(providerPrice: number, markup = 0.05): number {
  const cost = Math.max(0, Number(providerPrice) || 0);
  if (!cost) return 0;
  return Math.ceil((cost * (1 + markup) - Number.EPSILON) / 10) * 10;
}

export function airtimeSellingPrice(amount: number): number {
  return Math.max(0, Math.round(Number(amount) || 0));
}

export function normalizePeriod(value: unknown): string {
  const raw = String(value ?? "").trim();
  const s = raw.toLowerCase();
  if (/365\s*days?|1\s*year/.test(s)) return "365 days";
  if (/30\s*days?|monthly/.test(s)) return "30 days";
  if (/14\s*days?/.test(s)) return "14 days";
  if (/7\s*days?|weekly/.test(s)) return "7 days";
  if (/3\s*days?/.test(s)) return "3 days";
  if (/2\s*days?/.test(s)) return "2 days";
  if (/1\s*day|daily/.test(s)) return "1 day";
  if (/2\s*hours?/.test(s)) return "2 hours";
  if (/1\s*hour/.test(s)) return "1 hour";
  return raw || "Other";
}

export function dataTab(planType: string, period: string): string {
  if (/sme/i.test(planType)) return "HOT_DEALS";
  const p = normalizePeriod(period);
  if (p === "1 day") return "DAILY";
  if (p === "7 days") return "WEEKLY";
  if (p === "30 days") return "MONTHLY";
  if (p === "365 days") return "YEARLY";
  return "OTHER";
}

export function providerFailed(body: any): boolean {
  const s = String(body?.status ?? body?.Status ?? "").toLowerCase();
  return ["failed", "failure", "declined", "error", "rejected", "cancelled", "canceled"].includes(s);
}

export function providerDefinitivelyFailed(error: unknown): boolean {
  const status = Number((error as any)?.status ?? 0);
  return [400, 401, 402, 429].includes(status);
}

export function providerSuccessful(body: any): boolean {
  const s = String(body?.status ?? body?.Status ?? "").toLowerCase();
  return ["success", "successful", "completed", "complete", "paid"].includes(s);
}
