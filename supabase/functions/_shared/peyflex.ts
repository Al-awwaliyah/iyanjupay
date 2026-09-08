function getBaseUrl(): string {
  const baseUrl = Deno.env.get("PEYFLEX_BASE_URL")?.trim();

  if (!baseUrl) {
    throw new Error(
      "PEYFLEX_BASE_URL is not configured.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function getToken(): string {
  const token =
    Deno.env.get("PEYFLEX_API_TOKEN")?.trim();

  if (!token) {
    throw new Error(
      "PEYFLEX_API_TOKEN is not configured.",
    );
  }

  return token;
}

export type PeyflexHttpResult = {
  ok: boolean;
  httpStatus: number;
  body: any;
  rawText: string;
};

function buildUrl(
  path: string,
  params?: Record<string, unknown>,
): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${getBaseUrl()}${
          path.startsWith("/")
            ? path
            : `/${path}`
        }`,
  );

  if (params) {
    for (const [key, value] of Object.entries(
      params,
    )) {
      if (
        value !== undefined &&
        value !== null &&
        String(value) !== ""
      ) {
        url.searchParams.set(
          key,
          String(value),
        );
      }
    }
  }

  return url.toString();
}

async function parseResponse(
  response: Response,
): Promise<PeyflexHttpResult> {
  const rawText = await response.text();

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
 * Catalogue GET.
 *
 * Returns the complete HTTP wrapper so the caller can
 * inspect both HTTP status and Peyflex body.
 */
export async function peyflexPublicGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(
    buildUrl(path, params),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );

  return parseResponse(response);
}

/**
 * Authenticated Peyflex GET.
 */
export async function peyflexGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(
    buildUrl(path, params),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${getToken()}`,
      },
    },
  );

  return parseResponse(response);
}

/**
 * Authenticated Peyflex POST.
 */
export async function peyflexPost(
  path: string,
  body: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response = await fetch(
    buildUrl(path),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${getToken()}`,
      },
      body: JSON.stringify(body),
    },
  );

  return parseResponse(response);
}

/**
 * Unwrap a Peyflex HTTP result.
 *
 * This is important because peyflexGet/peyflexPost/
 * peyflexPublicGet return:
 *
 * {
 *   ok,
 *   httpStatus,
 *   body,
 *   rawText
 * }
 *
 * All response-processing helpers below therefore work
 * with either the wrapper or the raw Peyflex body.
 */
export function unwrapPeyflex(
  value: unknown,
): any {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const obj =
      value as Record<string, any>;

    if (
      "body" in obj &&
      "httpStatus" in obj &&
      "ok" in obj
    ) {
      return obj.body;
    }
  }

  return value;
}

/**
 * Return whether a value is an HTTP wrapper.
 */
function isHttpResult(
  value: unknown,
): value is PeyflexHttpResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "body" in
        (value as Record<string, unknown>) &&
      "httpStatus" in
        (value as Record<string, unknown>) &&
      "ok" in
        (value as Record<string, unknown>),
  );
}

export function asObject(
  value: unknown,
): Record<string, any> {
  value = unwrapPeyflex(value);

  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function asArray(
  value: unknown,
): any[] {
  value = unwrapPeyflex(value);

  if (Array.isArray(value)) {
    return value;
  }

  const obj =
    asObject(value);

  const candidates = [
    obj.results,
    obj.data,
    obj.items,
    obj.plans,
    obj.providers,
    obj.networks,
    obj.billers,
    obj.options,
    obj.products,
    obj.available_plans,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (
      candidate &&
      typeof candidate === "object"
    ) {
      const nested =
        asArray(candidate);

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

export function firstValue(
  ...values: unknown[]
): unknown {
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

export function text(
  value: unknown,
): string {
  value = unwrapPeyflex(value);

  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  const obj =
    asObject(value);

  const nested =
    firstValue(
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

  if (
    nested !== undefined &&
    nested !== value
  ) {
    return text(nested);
  }

  try {
    return JSON.stringify(value);
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
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const cleaned =
    text(value)
      .replace(/[₦,\s]/g, "")
      .replace(/NGN/gi, "");

  const result =
    Number(cleaned);

  return Number.isFinite(result)
    ? result
    : 0;
}

export function normalizeStatus(
  body: any,
): string {
  const obj =
    asObject(body);

  const data =
    asObject(obj.data);

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
    .replace(
      /[\s-]+/g,
      "_",
    );
}

export function providerMessage(
  body: any,
): string {
  const obj =
    asObject(body);

  const data =
    asObject(obj.data);

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
      data.error_message,
    ),
  );
}

export function providerReference(
  body: any,
): string | null {
  const obj =
    asObject(body);

  const data =
    asObject(obj.data);

  const value =
    firstValue(
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

  const result =
    text(value);

  return result || null;
}

/**
 * Successful response detection.
 *
 * The second parameter is optional so the existing
 * peyflex-services function can safely call:
 *
 * providerLooksSuccessful(response)
 *
 * If the response is an HTTP wrapper, its `ok` value
 * is automatically used.
 */
export function providerLooksSuccessful(
  body: any,
  httpOk?: boolean,
): boolean {
  const ok =
    httpOk ??
    (
      isHttpResult(body)
        ? body.ok
        : true
    );

  if (!ok) {
    return false;
  }

  const payload =
    unwrapPeyflex(body);

  const status =
    normalizeStatus(payload);

  const obj =
    asObject(payload);

  const data =
    asObject(obj.data);

  if (
    status === "SUCCESS" ||
    status === "SUCCESSFUL" ||
    status === "COMPLETED" ||
    status === "ORDER_COMPLETED"
  ) {
    return true;
  }

  if (
    obj.success === true ||
    data.success === true
  ) {
    return true;
  }

  return false;
}

export function providerLooksFailed(
  body: any,
  httpOk?: boolean,
): boolean {
  const ok =
    httpOk ??
    (
      isHttpResult(body)
        ? body.ok
        : true
    );

  if (!ok) {
    return true;
  }

  const payload =
    unwrapPeyflex(body);

  const status =
    normalizeStatus(payload);

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

/**
 * Calculate selling price.
 *
 * Airtime:
 *   0% markup
 *
 * Other services:
 *   markup supplied by caller.
 */
export function roundSellingPrice(
  providerCost: number,
  markupRate = 0,
): number {
  if (
    !Number.isFinite(providerCost) ||
    providerCost <= 0
  ) {
    return 0;
  }

  const marked =
    providerCost *
    (1 + markupRate);

  return Math.ceil(
    (marked - Number.EPSILON) / 5,
  ) * 5;
}
