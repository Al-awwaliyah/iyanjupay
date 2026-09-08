function getBaseUrl(): string {
  const baseUrl = Deno.env
    .get("PEYFLEX_BASE_URL")
    ?.trim();

  if (!baseUrl) {
    throw new Error(
      "PEYFLEX_BASE_URL is not configured.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function getToken(): string {
  const token = Deno.env
    .get("PEYFLEX_API_TOKEN")
    ?.trim();

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
    path.startsWith("http://") ||
      path.startsWith("https://")
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
  const rawText =
    await response.text();

  let body: any = null;

  if (rawText.trim()) {
    try {
      body =
        JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    body,
    rawText,
  };
}

/**
 * Public GET.
 *
 * Used for Peyflex catalogue endpoints that do not
 * require the API token.
 */
export async function peyflexPublicGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response =
    await fetch(
      buildUrl(path, params),
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  return parseResponse(
    response,
  );
}

/**
 * Authenticated GET.
 */
export async function peyflexGet(
  path: string,
  params?: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response =
    await fetch(
      buildUrl(path, params),
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
          Authorization:
            `Token ${getToken()}`,
        },
      },
    );

  return parseResponse(
    response,
  );
}

/**
 * Authenticated POST.
 */
export async function peyflexPost(
  path: string,
  body: Record<string, unknown>,
): Promise<PeyflexHttpResult> {
  const response =
    await fetch(
      buildUrl(path),
      {
        method: "POST",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          Authorization:
            `Token ${getToken()}`,
        },
        body: JSON.stringify(
          body,
        ),
      },
    );

  return parseResponse(
    response,
  );
}

/**
 * Detect Peyflex HTTP wrapper.
 */
function isHttpResult(
  value: unknown,
): value is PeyflexHttpResult {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const obj =
    value as Record<
      string,
      unknown
    >;

  return (
    "body" in obj &&
    "httpStatus" in obj &&
    "ok" in obj
  );
}

/**
 * Unwrap Peyflex HTTP wrapper.
 *
 * Supports both:
 *
 * {
 *   ok,
 *   httpStatus,
 *   body,
 *   rawText
 * }
 *
 * and the raw Peyflex body.
 */
export function unwrapPeyflex(
  value: unknown,
): any {
  if (
    isHttpResult(value)
  ) {
    return value.body;
  }

  return value;
}

/**
 * Convert a value into an object.
 */
export function asObject(
  value: unknown,
): Record<string, any> {
  value =
    unwrapPeyflex(value);

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      any
    >;
  }

  return {};
}

/**
 * Convert common Peyflex response structures
 * into an array.
 */
export function asArray(
  value: unknown,
): any[] {
  value =
    unwrapPeyflex(value);

  if (Array.isArray(value)) {
    return value;
  }

  const obj =
    asObject(value);

  const directCandidates = [
    obj.results,
    obj.items,
    obj.plans,
    obj.providers,
    obj.networks,
    obj.billers,
    obj.options,
    obj.products,
    obj.available_plans,
  ];

  for (
    const candidate of
      directCandidates
  ) {
    if (
      Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  /*
   * data is handled separately because
   * data can itself be an object containing
   * another array.
   */
  if (
    Array.isArray(obj.data)
  ) {
    return obj.data;
  }

  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    const nested =
      asArray(obj.data);

    if (
      nested.length > 0
    ) {
      return nested;
    }
  }

  return [];
}

/**
 * Return the first non-empty value.
 */
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

/**
 * Convert arbitrary values to text.
 */
export function text(
  value: unknown,
): string {
  value =
    unwrapPeyflex(value);

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
    nested !== undefined
  ) {
    return text(nested);
  }

  try {
    return JSON.stringify(
      value,
    );
  } catch {
    return "";
  }
}

/**
 * Convert an arbitrary value to number.
 */
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

  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }

  const raw =
    text(value);

  if (!raw) {
    return 0;
  }

  /*
   * Handle common Nigerian currency
   * representations.
   */
  const cleaned =
    raw
      .replace(/₦/g, "")
      .replace(/NGN/gi, "")
      .replace(/,/g, "")
      .trim();

  /*
   * Some APIs may return values such as:
   *
   * "₦2,500"
   * "2500.00"
   */
  const direct =
    Number(cleaned);

  if (
    Number.isFinite(direct)
  ) {
    return direct;
  }

  /*
   * Fallback for strings containing
   * a numeric value.
   */
  const match =
    cleaned.match(
      /-?\d+(?:\.\d+)?/,
    );

  if (!match) {
    return 0;
  }

  const parsed =
    Number(match[0]);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

/**
 * Extract the actual provider payload.
 *
 * This is intentionally exported because
 * peyflex-services needs it for customer
 * verification responses.
 */
export function extractObjectData(
  value: unknown,
): Record<string, any> {
  const payload =
    unwrapPeyflex(value);

  const obj =
    asObject(payload);

  /*
   * If data is an object, that is usually
   * the actual response payload.
   */
  if (
    obj.data &&
    typeof obj.data ===
      "object" &&
    !Array.isArray(obj.data)
  ) {
    return asObject(
      obj.data,
    );
  }

  return obj;
}

/**
 * Normalize provider status.
 */
export function normalizeStatus(
  body: any,
): string {
  const payload =
    unwrapPeyflex(body);

  const obj =
    asObject(payload);

  const data =
    asObject(obj.data);

  const status =
    firstValue(
      obj.status,
      obj.Status,
      obj.state,
      obj.State,
      obj.transaction_status,
      obj.transactionStatus,
      obj.order_status,
      obj.orderStatus,

      data.status,
      data.Status,
      data.state,
      data.State,
      data.transaction_status,
      data.transactionStatus,
      data.order_status,
      data.orderStatus,
    );

  return text(status)
    .toUpperCase()
    .replace(
      /[\s-]+/g,
      "_",
    );
}

/**
 * Extract provider message.
 */
export function providerMessage(
  body: any,
): string {
  const payload =
    unwrapPeyflex(body);

  const obj =
    asObject(payload);

  const data =
    asObject(obj.data);

  return text(
    firstValue(
      obj.message,
      obj.Message,
      obj.detail,
      obj.error,
      obj.error_message,
      obj.errorMessage,
      obj.description,

      data.message,
      data.Message,
      data.detail,
      data.error,
      data.error_message,
      data.errorMessage,
      data.description,
    ),
  );
}

/**
 * Extract provider transaction reference.
 */
export function providerReference(
  body: any,
): string | null {
  const payload =
    unwrapPeyflex(body);

  const obj =
    asObject(payload);

  const data =
    asObject(obj.data);

  const value =
    firstValue(
      obj.reference,
      obj.reference_id,
      obj.referenceId,
      obj.transaction_reference,
      obj.transactionReference,
      obj.transaction_id,
      obj.transactionId,
      obj.order_id,
      obj.orderId,
      obj.request_id,
      obj.requestId,
      obj.id,

      data.reference,
      data.reference_id,
      data.referenceId,
      data.transaction_reference,
      data.transactionReference,
      data.transaction_id,
      data.transactionId,
      data.order_id,
      data.orderId,
      data.request_id,
      data.requestId,
      data.id,
    );

  const result =
    text(value);

  return result || null;
}

/**
 * Provider success detection.
 *
 * HTTP success alone is NOT enough.
 *
 * We first inspect an explicit provider
 * success/status field.
 */
export function providerLooksSuccessful(
  body: any,
  httpOk?: boolean,
): boolean {
  const actualHttpOk =
    httpOk ??
    (
      isHttpResult(body)
        ? body.ok
        : true
    );

  if (
    !actualHttpOk
  ) {
    return false;
  }

  const payload =
    unwrapPeyflex(body);

  const obj =
    asObject(payload);

  const data =
    asObject(obj.data);

  const status =
    normalizeStatus(
      payload,
    );

  if (
    [
      "SUCCESS",
      "SUCCESSFUL",
      "COMPLETED",
      "COMPLETE",
      "ORDER_COMPLETED",
      "TRANSACTION_COMPLETED",
      "SUCCESSFULL",
    ].includes(status)
  ) {
    return true;
  }

  if (
    obj.success === true ||
    data.success === true
  ) {
    return true;
  }

  /*
   * Some provider responses use
   * boolean status fields.
   */
  if (
    obj.status === true ||
    data.status === true
  ) {
    return true;
  }

  return false;
}

/**
 * Provider definitive failure detection.
 */
export function providerLooksFailed(
  body: any,
  httpOk?: boolean,
): boolean {
  const actualHttpOk =
    httpOk ??
    (
      isHttpResult(body)
        ? body.ok
        : true
    );

  /*
   * HTTP failure is a definitive provider
   * rejection/error for our purposes.
   */
  if (
    !actualHttpOk
  ) {
    return true;
  }

  const payload =
    unwrapPeyflex(body);

  const status =
    normalizeStatus(
      payload,
    );

  return new Set([
    "FAILED",
    "FAILURE",
    "TRANSACTION_FAILED",
    "TRANSACTION_FAILURE",
    "ORDER_FAILED",
    "ORDER_FAILURE",
    "DECLINED",
    "REJECTED",
    "CANCELLED",
    "CANCELED",
    "INVALID",
    "ERROR",
    "ERR",
  ]).has(status);
}

/**
 * Calculate IyanjuPay selling price.
 *
 * Airtime:
 *   0% markup
 *
 * Other services:
 *   caller supplies markup.
 *
 * Final amount:
 *   rounded UP to nearest ₦5.
 */
export function roundSellingPrice(
  providerCost: number,
  markupRate = 0,
): number {
  if (
    !Number.isFinite(
      providerCost,
    ) ||
    providerCost <= 0
  ) {
    return 0;
  }

  const safeMarkup =
    Number.isFinite(
      markupRate,
    ) &&
    markupRate >= 0
      ? markupRate
      : 0;

  const marked =
    providerCost *
    (1 + safeMarkup);

  return Math.ceil(
    (
      marked -
      Number.EPSILON
    ) / 5,
  ) * 5;
}
