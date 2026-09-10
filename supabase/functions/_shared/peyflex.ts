/**
 * IyanjuPay — ZOEDATA server-side API client via VPS proxy.
 *
 * IMPORTANT:
 * This file intentionally keeps the existing
 * _shared/peyflex.ts filename so existing Supabase
 * function imports remain unchanged.
 *
 * ARCHITECTURE:
 *
 *   Supabase Edge Function
 *          ↓
 *   VPS /zoedata proxy
 *          ↓
 *   ZOEDATA API
 *
 * The ZOEDATA API key MUST stay on the VPS.
 * Supabase no longer calls ZOEDATA directly.
 *
 * REQUIRED SUPABASE SECRETS:
 *
 *   ZOEDATA_PROXY_URL
 *     Example:
 *     https://your-vps-domain.com/zoedata
 *
 *   ZOEDATA_PROXY_SECRET
 *     Must exactly match the VPS PROXY_SECRET.
 *
 * OPTIONAL:
 *
 *   ZOEDATA_BASE_URL
 *   ZOEDATA_CATALOG_JSON
 *   ZOEDATA_CATALOG_URL
 *
 * IMPORTANT:
 * ZOEDATA_API_TOKEN / ZOEDATA_API_KEY is intentionally
 * NOT read by this file anymore.
 *
 * The ZOEDATA API token stays exclusively on the VPS.
 *
 * Existing compatibility:
 *
 *   zoedataPost("", finalProviderRequest)
 *
 * continues to work exactly as before.
 *
 * The empty path is retained because the existing
 * peyflex-services/index.ts uses it for ZOEDATA vending.
 */

export const ZOEDATA_BASE_URL =
  Deno.env.get("ZOEDATA_BASE_URL")?.trim() ||
  "https://zoedata.ng";

export const ZOEDATA_VENDING_PATH =
  "/autobiz_vending_index.php";

/**
 * VPS proxy URL.
 *
 * Example:
 *
 *   https://api.example.com/zoedata
 *
 * Do NOT put the ZOEDATA API key here.
 */
export const ZOEDATA_PROXY_URL =
  Deno.env.get("ZOEDATA_PROXY_URL")?.trim() || "";

/**
 * Shared secret used between Supabase and the VPS.
 *
 * This MUST match:
 *
 *   PROXY_SECRET
 *
 * on the VPS.
 */
function getProxySecret(): string {
  const secret =
    Deno.env.get("ZOEDATA_PROXY_SECRET")?.trim();

  if (!secret) {
    throw new Error(
      "ZOEDATA_PROXY_SECRET is not configured.",
    );
  }

  return secret;
}

export type ZOEDATAHttpResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
  rawText: string;
};

/**
 * Resolve an API path.
 *
 * The VPS proxy currently exposes:
 *
 *   POST /zoedata
 *
 * The path parameter is retained for compatibility
 * with the existing backend.
 *
 * IMPORTANT:
 * zoedataPost("", body) is the normal provider call.
 */
function resolvePath(
  path: string,
): string {
  const normalizedPath =
    path.trim();

  /*
   * The current VPS proxy accepts all supported
   * ZOEDATA operations through /zoedata.
   *
   * Therefore an empty path still means the normal
   * ZOEDATA vending/provider request.
   */
  if (!normalizedPath) {
    return "/zoedata";
  }

  /*
   * If an existing backend passes the ZOEDATA
   * vending endpoint explicitly, continue routing
   * it through the VPS proxy.
   */
  if (
    normalizedPath ===
      ZOEDATA_VENDING_PATH ||
    normalizedPath ===
      ZOEDATA_VENDING_PATH.replace(
        /^\/+/,
        "",
      )
  ) {
    return "/zoedata";
  }

  /*
   * If a full URL is supplied, it is intentionally
   * NOT allowed to bypass the VPS.
   *
   * All provider traffic must go through the
   * whitelisted VPS IP.
   */
  return "/zoedata";
}

/**
 * Build the VPS proxy URL.
 *
 * IMPORTANT:
 * No direct ZOEDATA URL is generated here.
 */
function buildProxyUrl(
  path = "",
): string {
  if (!ZOEDATA_PROXY_URL) {
    throw new Error(
      "ZOEDATA_PROXY_URL is not configured.",
    );
  }

  const base =
    ZOEDATA_PROXY_URL.replace(
      /\/+$/,
      "",
    );

  const resolvedPath =
    resolvePath(path);

  /*
   * If the configured proxy URL already ends
   * with /zoedata, don't append /zoedata again.
   */
  if (
    base
      .toLowerCase()
      .endsWith("/zoedata")
  ) {
    return base;
  }

  return `${base}${resolvedPath}`;
}

async function parseResponse(
  response: Response,
): Promise<ZOEDATAHttpResult> {
  const rawText =
    await response.text();

  let body: any = null;

  try {
    body = rawText
      ? JSON.parse(rawText)
      : null;
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
 * POST request through the VPS.
 *
 * IMPORTANT:
 *
 * BEFORE:
 *
 *   Supabase → https://zoedata.ng/autobiz_vending_index.php
 *
 * NOW:
 *
 *   Supabase → VPS /zoedata
 *          → ZOEDATA
 *
 * The VPS adds the ZOEDATA API authentication
 * header using the API key stored on the VPS.
 *
 * The Supabase function only sends:
 *
 *   X-Proxy-Secret
 */
export async function zoedataPost(
  path = "",
  body: Record<string, unknown> = {},
): Promise<ZOEDATAHttpResult> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      35_000,
    );

  try {
    const url =
      buildProxyUrl(path);

    const proxySecret =
      getProxySecret();

    /*
     * Never log the proxy secret.
     *
     * The VPS is responsible for adding:
     *
     *   Bearer: ZOEDATA_API_KEY
     *
     * to the provider request.
     */
    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            "X-Proxy-Secret":
              proxySecret,
          },

          body:
            JSON.stringify(body),

          signal:
            controller.signal,
        },
      );

    return await parseResponse(
      response,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET request helper.
 *
 * Kept for compatibility with the existing
 * IyanjuPay backend.
 *
 * Provider traffic must still go through the VPS.
 *
 * The current VPS /zoedata endpoint is POST-based,
 * so this helper is retained primarily for
 * compatibility with existing imports.
 *
 * If a GET operation is ever required by the
 * backend, the VPS must expose a corresponding
 * authenticated GET endpoint before it can be used.
 */
export async function zoedataGet(
  path: string,
): Promise<ZOEDATAHttpResult> {
  const normalizedPath =
    path.trim();

  /*
   * The current VPS proxy's /zoedata endpoint
   * accepts POST requests only.
   *
   * We therefore use POST with an action/path
   * wrapper only when this compatibility helper
   * is explicitly called.
   *
   * This avoids making any direct request to ZOEDATA.
   */
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      35_000,
    );

  try {
    const url =
      buildProxyUrl(
        normalizedPath,
      );

    const proxySecret =
      getProxySecret();

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            "X-Proxy-Secret":
              proxySecret,
          },

          body:
            JSON.stringify({
              action:
                "balance",
            }),

          signal:
            controller.signal,
        },
      );

    return await parseResponse(
      response,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function asObject(
  value: unknown,
): Record<string, any> {
  return value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function asArray(
  value: unknown,
): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  const obj =
    asObject(value);

  for (
    const candidate of [
      obj.data,
      obj.results,
      obj.items,
      obj.plans,
      obj.products,
      obj.services,
      obj.catalog,
      obj.catalogue,
    ]
  ) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

export function firstValue(
  ...values: unknown[]
): unknown {
  for (
    const value of values
  ) {
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

export function text(
  value: unknown,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (
    [
      "string",
      "number",
      "boolean",
    ].includes(
      typeof value,
    )
  ) {
    return String(
      value,
    ).trim();
  }

  try {
    return JSON.stringify(
      value,
    );
  } catch {
    return "";
  }
}

export function numberValue(
  value: unknown,
): number {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : 0;
  }

  const n =
    Number(
      text(value)
        .replace(
          /[₦,\s]/g,
          "",
        )
        .replace(
          /NGN/gi,
          "",
        ),
    );

  return Number.isFinite(n)
    ? n
    : 0;
}

export function providerMessage(
  body: any,
): string {
  const obj =
    asObject(body);

  const data =
    asObject(
      obj.data,
    );

  return text(
    firstValue(
      obj.message,
      obj.server_message,
      obj.error,
      obj.detail,
      obj.true_response,

      data.message,
      data.server_message,
      data.error,
      data.true_response,
      data.text_status,
    ),
  );
}

export function providerReference(
  body: any,
): string | null {
  const obj =
    asObject(body);

  const data =
    asObject(
      obj.data,
    );

  const value =
    firstValue(
      data.recharge_id,
      obj.recharge_id,

      data.order_id,
      obj.order_id,

      data.transaction_id,
      obj.transaction_id,

      data.user_reference,
      obj.user_reference,
    );

  const result =
    text(value);

  return result || null;
}

export function normalizeStatus(
  body: any,
): string {
  const obj =
    asObject(body);

  const data =
    asObject(
      obj.data,
    );

  return text(
    firstValue(
      data.status,
      data.text_status,
      data.pay_status,

      obj.status,
      obj.text_status,
      obj.pay_status,
      obj.off_status,
    ),
  )
    .toUpperCase()
    .replace(
      /[\s-]+/g,
      "_",
    );
}

export function providerLooksSuccessful(
  body: any,
  httpOk: boolean,
): boolean {
  if (!httpOk) {
    return false;
  }

  const obj =
    asObject(body);

  const data =
    asObject(
      obj.data,
    );

  const status =
    normalizeStatus(
      body,
    );

  if (
    obj.status === false ||
    data.status === false
  ) {
    return false;
  }

  return [
    "DONE",
    "SUCCESS",
    "SUCCESSFUL",
    "COMPLETED",
    "COMPLETE",
  ].includes(
    status,
  ) ||
    data.text_status ===
      "COMPLETED" ||
    data.status ===
      "COMPLETED" ||
    data.status ===
      "DONE";
}

export function providerLooksFailed(
  body: any,
  httpOk: boolean,
): boolean {
  if (!httpOk) {
    return true;
  }

  const obj =
    asObject(body);

  const data =
    asObject(
      obj.data,
    );

  const status =
    normalizeStatus(
      body,
    );

  if (
    obj.status === false ||
    data.status === false
  ) {
    return true;
  }

  return [
    "FAILED",
    "FAILURE",
    "DECLINED",
    "REJECTED",
    "CANCELLED",
    "CANCELED",
    "REFUNDED",
  ].includes(
    status,
  ) ||
    data.text_status
      ?.toString()
      .toUpperCase() ===
      "FAILED";
}

/**
 * Round UP to the next ₦50,
 * as required by IyanjuPay pricing.
 */
export function roundUpTo50(
  value: number,
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  return (
    Math.ceil(
      value / 50,
    ) * 50
  );
}

/**
 * Apply provider/product markup
 * and then round UP to ₦50.
 */
export function roundSellingPrice(
  providerPrice: number,
  markupPercent: number,
): number {
  if (
    !Number.isFinite(
      providerPrice,
    ) ||
    providerPrice <= 0
  ) {
    return 0;
  }

  const rate =
    Number.isFinite(
      markupPercent,
    )
      ? Math.max(
          0,
          markupPercent,
        )
      : 0;

  return roundUpTo50(
    providerPrice *
      (1 + rate / 100),
  );
}
