/**
 * IyanjuPay — ZOEDATA server-side API client.
 *
 * The file intentionally keeps the existing _shared/peyflex.ts filename so
 * the existing Supabase function import path remains unchanged.
 *
 * Required Supabase secrets:
 *   ZOEDATA_API_TOKEN   (or ZOEDATA_API_KEY)
 *
 * Optional:
 *   ZOEDATA_BASE_URL
 *   ZOEDATA_CATALOG_JSON
 *   ZOEDATA_CATALOG_URL
 *
 * ZOEDATA API:
 *   Base URL:
 *     https://zoedata.ng
 *
 *   Vending endpoint:
 *     /autobiz_vending_index.php
 *
 * Authentication documented by ZOEDATA:
 *   Bearer: YOUR_API_KEY
 *
 * IMPORTANT:
 * Empty paths passed to zoedataPost() are intentionally routed to the
 * documented vending endpoint. This preserves compatibility with the
 * existing peyflex-services/index.ts call:
 *
 *   zoedataPost("", finalProviderRequest)
 */

export const ZOEDATA_BASE_URL =
  Deno.env.get("ZOEDATA_BASE_URL")?.trim() ||
  "https://zoedata.ng";

export const ZOEDATA_VENDING_PATH =
  "/autobiz_vending_index.php";

export type ZOEDATAHttpResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
  rawText: string;
};

function getToken(): string {
  const token =
    Deno.env.get("ZOEDATA_API_TOKEN")?.trim() ||
    Deno.env.get("ZOEDATA_API_KEY")?.trim();

  if (!token) {
    throw new Error(
      "ZOEDATA_API_TOKEN (or ZOEDATA_API_KEY) is not configured.",
    );
  }

  return token;
}

/**
 * Resolve an API path.
 *
 * IMPORTANT:
 * zoedataPost("", body) is used by the existing
 * peyflex-services/index.ts.
 *
 * An empty path MUST therefore resolve to the ZOEDATA vending
 * endpoint rather than the website root.
 */
function resolvePath(
  path: string,
): string {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return ZOEDATA_VENDING_PATH;
  }

  return normalizedPath;
}

function buildUrl(
  path = "",
): string {
  const base = ZOEDATA_BASE_URL.replace(
    /\/+$/,
    "",
  );

  if (!base) {
    throw new Error(
      "ZOEDATA_BASE_URL is not configured.",
    );
  }

  const resolvedPath = resolvePath(path);

  if (
    /^https?:\/\//i.test(
      resolvedPath,
    )
  ) {
    return resolvedPath;
  }

  return `${base}/${resolvedPath.replace(
    /^\/+/,
    "",
  )}`;
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
 * POST request to ZOEDATA.
 *
 * By default:
 *
 *   zoedataPost("", body)
 *
 * becomes:
 *
 *   POST https://zoedata.ng/autobiz_vending_index.php
 *
 * Authentication header:
 *
 *   Bearer: YOUR_API_KEY
 */
export async function zoedataPost(
  path = "",
  body: Record<string, unknown> = {},
): Promise<ZOEDATAHttpResult> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    30_000,
  );

  try {
    const url = buildUrl(path);

    const response = await fetch(
      url,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",

          // ZOEDATA documentation:
          //
          // Bearer: YOUR_API_KEY
          //
          // This is intentionally NOT:
          //
          // Authorization: Bearer YOUR_API_KEY
          Bearer: getToken(),
        },

        body: JSON.stringify(body),

        signal: controller.signal,
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
 * Kept for compatibility with the
 * existing IyanjuPay backend.
 *
 * ZOEDATA authentication:
 *
 *   Bearer: YOUR_API_KEY
 */
export async function zoedataGet(
  path: string,
): Promise<ZOEDATAHttpResult> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    30_000,
  );

  try {
    const url =
      buildUrl(path);

    const response = await fetch(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          // ZOEDATA documentation:
          // Bearer: YOUR_API_KEY
          Bearer: getToken(),
        },

        signal: controller.signal,
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

  const n = Number(
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
