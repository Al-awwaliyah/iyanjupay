import {
  corsHeaders,
  json,
  adminClient,
  getUser,
  flw,
} from "../_shared/auth.ts";



type ServiceType =
  | "airtime"
  | "electricity"
  | "cable"
  | "internet";

const SUPPORTED_SERVICES: ServiceType[] = [
  "airtime",
  "electricity",
  "cable",
  "internet",
];

const SERVICE_CATEGORY_MAP: Record<ServiceType, string> = {
  airtime: "AIRTIME",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

const SUCCESS_STATUSES = new Set([
  "successful",
  "success",
  "completed",
  "complete",
  "succeeded",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "rejected",
  "reversed",
  "reverse",
  "cancelled",
  "canceled",
]);

const PENDING_STATUSES = new Set([
  "pending",
  "processing",
  "queued",
  "initiated",
  "in_progress",
  "in-progress",
]);

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeService(value: unknown): ServiceType | null {
  const service = cleanString(value)
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (SUPPORTED_SERVICES.includes(service as ServiceType)) {
    return service as ServiceType;
  }

  return null;
}

function normalizeStatus(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function firstNonEmpty(...values: unknown[]): unknown {
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

function getNested(object: any, paths: string[][]): unknown {
  for (const path of paths) {
    let current = object;

    for (const key of path) {
      if (current === null || current === undefined) {
        current = undefined;
        break;
      }

      current = current[key];
    }

    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== ""
    ) {
      return current;
    }
  }

  return undefined;
}

function isSuccessfulStatus(value: unknown): boolean {
  return SUCCESS_STATUSES.has(normalizeStatus(value));
}

function isFailedStatus(value: unknown): boolean {
  return FAILED_STATUSES.has(normalizeStatus(value));
}

function isPendingStatus(value: unknown): boolean {
  return PENDING_STATUSES.has(normalizeStatus(value));
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return json(body, status);
}

function extractItemCode(body: any, details: any): string {
  return cleanString(
    firstNonEmpty(
      body?.item_code,
      body?.itemCode,
      details?.item_code,
      details?.itemCode,
    ),
  );
}

function extractBillerCode(body: any, details: any): string {
  return cleanString(
    firstNonEmpty(
      body?.biller_code,
      body?.billerCode,
      details?.biller_code,
      details?.billerCode,
    ),
  );
}

function extractCustomer(body: any, details: any): string {
  return cleanString(
    firstNonEmpty(
      body?.customer,
      body?.customer_id,
      body?.customerId,
      body?.phoneNumber,
      body?.phone,
      body?.meterNumber,
      body?.meter_number,
      body?.smartCardNumber,
      body?.smartcardNumber,
      body?.smartcard_number,
      body?.accountNumber,
      body?.account_number,
      details?.customer,
      details?.customer_id,
      details?.customerId,
      details?.phoneNumber,
      details?.phone,
      details?.meterNumber,
      details?.meter_number,
      details?.smartCardNumber,
      details?.smartcardNumber,
      details?.smartcard_number,
      details?.accountNumber,
      details?.account_number,
    ),
  );
}

/*
 * ============================================================
 * OPAQUE CATALOG ROUTES
 * ============================================================
 *
 * The frontend receives opaque biller/item tokens rather than
 * trusting provider routing values supplied by the browser.
 */

async function getRouteTokenSecret(): Promise<CryptoKey> {
  const secret = cleanString(
    Deno.env.get("SERVICE_ROUTE_TOKEN_SECRET") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "",
  );

  if (!secret) {
    throw new Error("Service route secret is not configured.");
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);

  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encodeRouteToken(value: unknown): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(value)),
  );

  const key = await getRouteTokenSecret();

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function decodeRouteToken<T>(value: unknown): Promise<T | null> {
  const token = cleanString(value);
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  try {
    const key = await getRouteTokenSecret();

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload),
    );

    if (!valid) {
      return null;
    }

    return JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    ) as T;
  } catch (error) {
    console.error("Invalid service route token:", error);
    return null;
  }
}

function getSafeProviderLogo(raw: any): string | null {
  const value = cleanString(
    raw?.logo ??
      raw?.logo_url ??
      raw?.logoUrl,
  );

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.hostname === "cdn.simpleicons.org") {
      return null;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/*
 * ============================================================
 * FLUTTERWAVE API HELPERS
 * ============================================================
 */

async function fetchBillItems(billerCode: string) {
  return flw(
    `/billers/${encodeURIComponent(billerCode)}/items`,
    {
      method: "GET",
    },
  );
}

async function validateBillCustomer(
  itemCode: string,
  customer: string,
) {
  return flw(
    `/bill-items/${encodeURIComponent(itemCode)}/validate?customer=${encodeURIComponent(customer)}`,
    {
      method: "GET",
    },
  );
}

async function validateFlutterwaveSelectedItem(
  billerCode: string,
  itemCode: string,
) {
  const response = await fetchBillItems(billerCode);

  if (
    !response.ok ||
    response.body?.status !== "success"
  ) {
    throw new Error(
      "Unable to verify the selected bill package.",
    );
  }

  const items = Array.isArray(response.body?.data)
    ? response.body.data
    : [];

  const selected = items.find(
    (item: any) =>
      cleanString(
        item?.item_code ??
          item?.itemCode ??
          item?.code,
      ) === itemCode,
  );

  if (!selected) {
    throw new Error(
      "The selected bill package is no longer available.",
    );
  }

  return {
    selected,
    response,
  };
}

async function getFlutterwaveBillStatus(reference: string) {
  return flw(
    `/bills/${encodeURIComponent(reference)}?verbose=1`,
    {
      method: "GET",
    },
  );
}

function extractProviderReference(body: any): string | null {
  const value = firstNonEmpty(
    body?.provider_reference,
    body?.providerReference,
    body?.provider_response?.data?.flw_ref,
    body?.provider_response?.data?.reference,
    body?.provider_response?.data?.id,
    body?.data?.flw_ref,
    body?.data?.reference,
    body?.data?.id,
  );

  return value ? cleanString(value) : null;
}

function getProviderMessage(body: any): string | null {
  const value = firstNonEmpty(
    body?.message,
    body?.error,
    body?.provider_message,
    body?.provider_response?.message,
    body?.provider_response?.data?.message,
    body?.data?.message,
  );

  return value ? cleanString(value) : null;
}

/*
 * ============================================================
 * LOCAL TRANSACTION HELPERS
 * ============================================================
 */

async function getLocalTransaction(
  admin: any,
  userId: string,
  reference: string,
) {
  const { data, error } = await admin
    .from("transactions")
    .select(
      `
        id,
        user_id,
        wallet_id,
        amount,
        status,
        description,
        reference_number,
        provider,
        provider_reference,
        metadata,
        created_at
      `,
    )
    .eq("user_id", userId)
    .eq("reference_number", reference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
) {
  const { error } = await admin
    .from("transactions")
    .update(updates)
    .eq("user_id", userId)
    .eq("reference_number", reference);

  if (error) {
    console.error("Transaction update failed:", error);
  }
}

async function refundBillTransaction(
  admin: any,
  userId: string,
  reference: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  const refundReference = `REFUND_${reference}`;

  const { data, error } = await admin.rpc(
    "refund_wallet",
    {
      _user_id: userId,
      _amount: amount,
      _description: "Bill payment reversal (flutterwave)",
      _idempotency_key: refundReference,
      _reference: refundReference,
      _metadata: {
        ...metadata,
        original_reference: reference,
        refund_reference: refundReference,
        provider: "flutterwave",
        reason,
      },
    },
  );

  if (error) {
    console.error("Bill refund failed:", error);

    return {
      success: false,
      data: null,
      error,
    };
  }

  return {
    success: true,
    data,
    error: null,
  };
}

/*
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    const user = await getUser(req);

    if (!user) {
      return jsonResponse(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    let body: any;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid request.",
        },
        400,
      );
    }

    const action = cleanString(
      body?.action ?? "service",
    ).toLowerCase();

    const admin = adminClient();

    console.log(
      "flutterwave-bills request:",
      JSON.stringify({
        action,
        user_id: user.id,
        service:
          body?.service ??
          body?.details?.service ??
          null,
        biller_code:
          body?.biller_code ??
          body?.details?.biller_code ??
          null,
        item_code:
          body?.item_code ??
          body?.details?.item_code ??
          null,
      }),
    );

    /* ========================================================
     * ACTION: CATEGORIES
     * ======================================================== */

    if (action === "categories") {
      const response = await flw(
        "/bill-categories?country=NG",
        {
          method: "GET",
        },
      );

      if (!response.ok) {
        console.error(
          "Flutterwave categories request failed:",
          response.body,
        );

        return jsonResponse(
          {
            success: false,
            error: "Unable to load bill categories.",
          },
          502,
        );
      }

      return jsonResponse({
        success: true,
        data: response.body?.data ?? [],
      });
    }

    /* ========================================================
     * ACTION: BILLERS
     * ========================================================
     *
     * Flutterwave only. The returned biller_code is an opaque
     * signed token containing the real Flutterwave biller code.
     */

    if (action === "billers") {
      const service = normalizeService(
        body?.service ?? body?.details?.service,
      );

      if (!service) {
        return jsonResponse(
          {
            success: false,
            error: "A valid Flutterwave service is required.",
          },
          400,
        );
      }

      const category =
        cleanString(
          body?.category ??
            body?.details?.category ??
            SERVICE_CATEGORY_MAP[service],
        ) || SERVICE_CATEGORY_MAP[service];

      try {
        const response = await flw(
          `/bills/${encodeURIComponent(category)}/billers?country=NG`,
          {
            method: "GET",
          },
        );

        if (
          !response.ok ||
          response.body?.status !== "success"
        ) {
          console.error(
            "Flutterwave billers request failed:",
            response.body,
          );

          return jsonResponse(
            {
              success: false,
              error: "Unable to load service providers.",
            },
            502,
          );
        }

        const sourceBillers = Array.isArray(
          response.body?.data,
        )
          ? response.body.data
          : [];

        const billers = await Promise.all(
          sourceBillers.map(async (biller: any) => {
            const realBillerCode = cleanString(
              biller?.biller_code ??
                biller?.code ??
                biller?.id,
            );

            if (!realBillerCode) {
              return null;
            }

            const name = cleanString(
              biller?.name ??
                biller?.short_name ??
                biller?.biller_name ??
                realBillerCode,
            );

            const publicBiller =
              biller && typeof biller === "object"
                ? {
                    ...biller,
                  }
                : {};

            delete publicBiller.provider;
            delete publicBiller.provider_id;
            delete publicBiller.provider_amount;
            delete publicBiller.selling_amount;
            delete publicBiller.markup_rate;
            delete publicBiller.markup_amount;

            return {
              ...publicBiller,
              name,
              short_name: cleanString(
                biller?.short_name ?? name,
              ),
              logo: getSafeProviderLogo(biller),
              biller_code: await encodeRouteToken({
                version: 1,
                provider: "flutterwave",
                service,
                biller_code: realBillerCode,
              }),
              category,
              country: "NG",
            };
          }),
        );

        const validBillers = billers.filter(Boolean);

        if (!validBillers.length) {
          return jsonResponse(
            {
              success: false,
              error:
                "No service providers are currently available.",
            },
            502,
          );
        }

        return jsonResponse({
          success: true,
          service,
          billers: validBillers,
        });
      } catch (error) {
        console.error(
          "Flutterwave billers request exception:",
          error,
        );

        return jsonResponse(
          {
            success: false,
            error: "Unable to load service providers.",
          },
          502,
        );
      }
    }

    /* ========================================================
     * ACTION: ITEMS
     * ======================================================== */

    if (action === "items") {
      const service = normalizeService(
        body?.service ?? body?.details?.service,
      );

      const publicBillerCode = extractBillerCode(
        body,
        body?.details ?? {},
      );

      if (!service) {
        return jsonResponse(
          {
            success: false,
            error: "A valid service is required.",
          },
          400,
        );
      }

      if (!publicBillerCode) {
        return jsonResponse(
          {
            success: false,
            error: "A valid biller is required.",
          },
          400,
        );
      }

      const route = await decodeRouteToken<{
        version: number;
        provider: string;
        service: ServiceType;
        biller_code: string;
      }>(publicBillerCode);

      if (
        !route ||
        route.provider !== "flutterwave" ||
        route.service !== service ||
        !route.biller_code
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected service provider is no longer available.",
          },
          400,
        );
      }

      try {
        const response = await fetchBillItems(
          route.biller_code,
        );

        if (
          !response.ok ||
          response.body?.status !== "success"
        ) {
          console.error(
            "Flutterwave items request failed:",
            response.body,
          );

          return jsonResponse(
            {
              success: false,
              error: "Unable to load service packages.",
            },
            502,
          );
        }

        const sourceItems = Array.isArray(
          response.body?.data,
        )
          ? response.body.data
          : [];

        const items = await Promise.all(
          sourceItems.map(async (item: any) => {
            const realItemCode = cleanString(
              item?.item_code ??
                item?.itemCode ??
                item?.code ??
                item?.id,
            );

            if (!realItemCode) {
              return null;
            }

            const providerAmount = normalizeAmount(
              firstNonEmpty(
                item?.amount,
                item?.price,
                item?.selling_price,
              ),
            );

            if (providerAmount <= 0) {
              return null;
            }

            const name = cleanString(
              item?.name ??
                item?.short_name ??
                item?.description ??
                realItemCode,
            );

            const publicItem = {
              ...item,
              name,
              item_code: await encodeRouteToken({
                version: 1,
                provider: "flutterwave",
                service,
                biller_code: route.biller_code,
                item_code: realItemCode,
              }),
              amount: providerAmount,
              selling_price: providerAmount,
              provider_id: undefined,
              provider: undefined,
            };

            return publicItem;
          }),
        );

        return jsonResponse({
          success: true,
          service,
          biller_code: publicBillerCode,
          items: items.filter(Boolean),
        });
      } catch (error) {
        console.error(
          "Flutterwave item catalog exception:",
          error,
        );

        return jsonResponse(
          {
            success: false,
            error: "Unable to load service packages.",
          },
          502,
        );
      }
    }

    /* ========================================================
     * ACTION: VALIDATE
     * ======================================================== */

    if (action === "validate") {
      const service = normalizeService(
        body?.service ?? body?.details?.service,
      );

      const publicBillerCode = extractBillerCode(
        body,
        body?.details ?? {},
      );

      const publicItemCode = extractItemCode(
        body,
        body?.details ?? {},
      );

      let customer = extractCustomer(
        body,
        body?.details ?? {},
      );

      if (!service) {
        return jsonResponse(
          {
            success: false,
            error: "A valid service is required.",
          },
          400,
        );
      }

      if (!publicBillerCode || !publicItemCode) {
        return jsonResponse(
          {
            success: false,
            error: "A valid service package is required.",
          },
          400,
        );
      }

      if (!customer) {
        return jsonResponse(
          {
            success: false,
            error: "Customer information is required.",
          },
          400,
        );
      }

      const billerRoute = await decodeRouteToken<{
        version: number;
        provider: string;
        service: ServiceType;
        biller_code: string;
      }>(publicBillerCode);

      const itemRoute = await decodeRouteToken<{
        version: number;
        provider: string;
        service: ServiceType;
        biller_code: string;
        item_code: string;
      }>(publicItemCode);

      if (
        !billerRoute ||
        billerRoute.provider !== "flutterwave" ||
        billerRoute.service !== service ||
        !billerRoute.biller_code ||
        !itemRoute ||
        itemRoute.provider !== "flutterwave" ||
        itemRoute.service !== service ||
        itemRoute.biller_code !== billerRoute.biller_code ||
        !itemRoute.item_code
      ) {
        return jsonResponse(
          {
            success: false,
            error: "The selected service package is invalid.",
          },
          400,
        );
      }

      if (service === "airtime") {
        customer = customer.replace(/\s+/g, "");

        if (!/^(?:\+?234|0)[0-9]{10}$/.test(customer)) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid Nigerian phone number.",
            },
            400,
          );
        }
      }

      if (service === "electricity") {
        if (customer.length < 5) {
          return jsonResponse(
            {
              success: false,
              error: "Please provide a valid meter number.",
            },
            400,
          );
        }
      }

      if (service === "cable") {
        if (customer.length < 5) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid smartcard or decoder number.",
            },
            400,
          );
        }
      }

      if (service === "internet") {
        if (customer.length < 3) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid internet account number.",
            },
            400,
          );
        }
      }

      const shouldValidateCustomer =
        service === "electricity" ||
        service === "cable" ||
        service === "internet";

      if (shouldValidateCustomer) {
        try {
          const validation = await validateBillCustomer(
            itemRoute.item_code,
            customer,
          );

          if (
            !validation.ok ||
            validation.body?.status !== "success"
          ) {
            console.error(
              "Flutterwave customer validation failed:",
              validation.body,
            );

            return jsonResponse(
              {
                success: false,
                error:
                  "Unable to validate the customer account.",
              },
              400,
            );
          }

          return jsonResponse({
            success: true,
            service,
            validated: true,
            data: validation.body?.data ?? null,
          });
        } catch (error) {
          console.error(
            "Flutterwave customer validation error:",
            error,
          );

          return jsonResponse(
            {
              success: false,
              error:
                "Unable to validate the customer account.",
            },
            502,
          );
        }
      }

      return jsonResponse({
        success: true,
        service,
        validated: true,
        data: null,
      });
    }

    /* ========================================================
     * ACTION: STATUS
     * ======================================================== */

    if (action === "status") {
      const reference = cleanString(
        body?.reference ??
          body?.transaction_reference ??
          body?.details?.reference,
      );

      if (!reference) {
        return jsonResponse(
          {
            success: false,
            error: "Transaction reference is required.",
          },
          400,
        );
      }

      const txn = await getLocalTransaction(
        admin,
        user.id,
        reference,
      );

      if (!txn) {
        return jsonResponse(
          {
            success: false,
            error: "Transaction not found.",
          },
          404,
        );
      }

      const metadata =
        txn.metadata &&
        typeof txn.metadata === "object"
          ? txn.metadata
          : {};

      const provider = cleanString(
        txn.provider ??
          metadata?.provider_id ??
          "flutterwave",
      ).toLowerCase();

      if (provider !== "flutterwave") {
        return jsonResponse(
          {
            success: false,
            error:
              "This transaction is handled by another service provider.",
          },
          409,
        );
      }

      const providerReference = cleanString(
        txn.provider_reference ?? reference,
      );

      let response;

      try {
        response = await getFlutterwaveBillStatus(
          providerReference,
        );
      } catch (error) {
        console.error(
          "Flutterwave bill status request failed:",
          error,
        );

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "pending",
            provider: "flutterwave",
            provider_reference: providerReference,
            metadata: {
              ...metadata,
              reconciliation_required: true,
              status_check_failed: true,
              status_check_at: new Date().toISOString(),
            },
          },
        );

        return jsonResponse({
          success: true,
          status: "pending",
          reference,
          message:
            "Your payment is still being verified.",
        });
      }

      const providerStatus = normalizeStatus(
        getNested(response.body, [
          ["data", "status"],
          ["status"],
        ]),
      );

      const providerReferenceFromResponse =
        extractProviderReference({
          provider_response: response.body,
        }) ?? providerReference;

      if (
        response.ok &&
        (providerStatus === "successful" ||
          providerStatus === "success" ||
          providerStatus === "completed")
      ) {
        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "successful",
            provider: "flutterwave",
            provider_reference: providerReferenceFromResponse,
            completed_at: new Date().toISOString(),
            metadata: {
              ...metadata,
              flutterwave_status: providerStatus,
              flutterwave_response: response.body,
              reconciliation_required: false,
              reconciled_at: new Date().toISOString(),
            },
          },
        );

        return jsonResponse({
          success: true,
          status: "successful",
          reference,
          message: "Payment completed successfully.",
        });
      }

      if (
        response.ok &&
        (providerStatus === "failed" ||
          providerStatus === "cancelled" ||
          providerStatus === "reversed" ||
          providerStatus === "declined")
      ) {
        const refund = await refundBillTransaction(
          admin,
          user.id,
          reference,
          normalizeAmount(txn.amount),
          "Flutterwave bill payment failed.",
          {
            flutterwave_status: providerStatus,
            flutterwave_response: response.body,
            refund_trigger: "status_reconciliation",
          },
        );

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "failed",
            provider: "flutterwave",
            provider_reference: providerReferenceFromResponse,
            metadata: {
              ...metadata,
              flutterwave_status: providerStatus,
              flutterwave_response: response.body,
              refunded: refund.success,
              refund_pending: !refund.success,
              refund_error: refund.error?.message ?? null,
              reconciliation_required: false,
            },
          },
        );

        if (!refund.success) {
          return jsonResponse(
            {
              success: false,
              status: "failed",
              reference,
              error:
                "The payment failed, but the automatic refund requires retry.",
            },
            503,
          );
        }

        return jsonResponse({
          success: false,
          status: "failed",
          reference,
          refunded: true,
          message:
            "Payment failed. Your wallet has been refunded.",
        });
      }

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "pending",
          provider: "flutterwave",
          provider_reference: providerReferenceFromResponse,
          metadata: {
            ...metadata,
            flutterwave_status: providerStatus,
            flutterwave_response: response.body,
            reconciliation_required: true,
            pending_since: new Date().toISOString(),
          },
        },
      );

      return jsonResponse({
        success: true,
        status: "pending",
        reference,
        message: "Your payment is still being verified.",
      });
    }

    /* ========================================================
     * ACTION: PAY / SERVICE
     * ======================================================== */

    if (action === "pay" || action === "service") {
      const details = body?.details ?? {};

      const service = normalizeService(
        body?.service ?? details?.service,
      );

      if (!service) {
        return jsonResponse(
          {
            success: false,
            error: "Please select a valid service.",
          },
          400,
        );
      }

      const country = cleanString(
        firstNonEmpty(
          body?.country,
          details?.country,
          "NG",
        ),
      ).toUpperCase();

      if (country !== "NG") {
        return jsonResponse(
          {
            success: false,
            error:
              "Bill payments currently support Nigeria only.",
          },
          400,
        );
      }

      const publicBillerCode = extractBillerCode(
        body,
        details,
      );

      const publicItemCode = extractItemCode(
        body,
        details,
      );

      const billerRoute = await decodeRouteToken<{
        version: number;
        provider: string;
        service: ServiceType;
        biller_code: string;
      }>(publicBillerCode);

      const itemRoute = await decodeRouteToken<{
        version: number;
        provider: string;
        service: ServiceType;
        biller_code: string;
        item_code: string;
      }>(publicItemCode);

      if (
        !billerRoute ||
        billerRoute.provider !== "flutterwave" ||
        billerRoute.service !== service ||
        !billerRoute.biller_code ||
        !itemRoute ||
        itemRoute.provider !== "flutterwave" ||
        itemRoute.service !== service ||
        itemRoute.biller_code !== billerRoute.biller_code ||
        !itemRoute.item_code
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected service package is no longer available.",
          },
          400,
        );
      }

      const billerCode = billerRoute.biller_code;
      const itemCode = itemRoute.item_code;

      let customer = extractCustomer(body, details);

      if (!customer) {
        return jsonResponse(
          {
            success: false,
            error: "Customer information is required.",
          },
          400,
        );
      }

      if (service === "airtime") {
        customer = customer.replace(/\s+/g, "");

        if (!/^(?:\+?234|0)[0-9]{10}$/.test(customer)) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid Nigerian phone number.",
            },
            400,
          );
        }
      }

      if (service === "electricity") {
        if (customer.length < 5) {
          return jsonResponse(
            {
              success: false,
              error: "Please provide a valid meter number.",
            },
            400,
          );
        }
      }

      if (service === "cable") {
        if (customer.length < 5) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid smartcard or decoder number.",
            },
            400,
          );
        }
      }

      if (service === "internet") {
        if (customer.length < 3) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please provide a valid internet account number.",
            },
            400,
          );
        }
      }

      /* --------------------------------------------------------
       * CATALOG VERIFICATION
       * -------------------------------------------------------- */

      let selectedItem: any = null;
      let providerAmount = 0;

      const catalog = await validateFlutterwaveSelectedItem(
        billerCode,
        itemCode,
      );

      selectedItem = catalog.selected;

      providerAmount = normalizeAmount(
        firstNonEmpty(
          selectedItem?.amount,
          selectedItem?.price,
          selectedItem?.selling_price,
        ),
      );

      if (providerAmount <= 0) {
        return jsonResponse(
          {
            success: false,
            error:
              "Unable to determine the bill package price.",
          },
          400,
        );
      }

      /*
       * Flutterwave services handled here use the exact provider
       * package amount. There is no ClubKonnect pricing logic in
       * this function.
       */

      const sellingAmount = roundMoney(providerAmount);

      /* --------------------------------------------------------
       * SERVICE-SPECIFIC CUSTOMER VALIDATION
       * -------------------------------------------------------- */

      let validationData: any = null;

      const shouldValidateCustomer =
        service === "electricity" ||
        service === "cable" ||
        service === "internet";

      if (shouldValidateCustomer) {
        try {
          const validation = await validateBillCustomer(
            itemCode,
            customer,
          );

          if (
            !validation.ok ||
            validation.body?.status !== "success"
          ) {
            console.error(
              "Flutterwave bill customer validation failed:",
              validation.body,
            );

            return jsonResponse(
              {
                success: false,
                error:
                  "Unable to validate the customer account.",
              },
              400,
            );
          }

          validationData = validation.body?.data ?? null;
        } catch (error) {
          console.error(
            "Flutterwave customer validation error:",
            error,
          );

          return jsonResponse(
            {
              success: false,
              error:
                "Unable to validate the customer account.",
            },
            502,
          );
        }
      }

      /* --------------------------------------------------------
       * TRANSACTION REFERENCE
       * -------------------------------------------------------- */

      const reference = `BILL_${crypto.randomUUID()}`;

      const transactionMetadata = {
        service,
        category: SERVICE_CATEGORY_MAP[service],
        biller_code: billerCode,
        item_code: itemCode,
        customer,
        country,
        provider: "flutterwave",
        provider_id: "flutterwave",
        provider_amount: providerAmount,
        selling_amount: sellingAmount,
        data_markup: 0,
        markup_rate: 0,
        markup_amount: 0,
        selected_item: selectedItem,
        validation: validationData,
        reconciliation_required: true,
      };

      /* --------------------------------------------------------
       * DEBIT WALLET
       * -------------------------------------------------------- */

      const {
        data: debitResult,
        error: debitError,
      } = await admin.rpc(
        "debit_wallet",
        {
          _user_id: user.id,
          _amount: sellingAmount,
          _description: `Bill payment (${service})`,
          _idempotency_key: reference,
          _reference: reference,
          _category: "bill_payment",
          _metadata: transactionMetadata,
        },
      );

      if (debitError) {
        console.error(
          "Flutterwave bill wallet debit failed:",
          debitError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to process the payment from your wallet.",
          },
          400,
        );
      }

      const transactionId = debitResult?.id ?? null;

      /* --------------------------------------------------------
       * FLUTTERWAVE PAYMENT REQUEST
       * -------------------------------------------------------- */

      let flutterwaveResponse: any = null;

      try {
        flutterwaveResponse = await flw(
          `/billers/${encodeURIComponent(billerCode)}/items/${encodeURIComponent(itemCode)}/payment`,
          {
            method: "POST",
            body: JSON.stringify({
              country: "NG",
              customer_id: customer,
              amount: providerAmount,
              type: selectedItem?.type ?? service,
              reference,
              biller_code: billerCode,
              item_code: itemCode,
              phone_number:
                details?.phone ??
                details?.phoneNumber ??
                customer,
            }),
          },
        );
      } catch (error) {
        /*
         * Do NOT refund immediately. The request may have reached
         * Flutterwave even when the transport call throws.
         */

        console.error(
          "Flutterwave bill request failed:",
          error,
        );

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "pending",
            provider: "flutterwave",
            metadata: {
              ...transactionMetadata,
              provider_request_failed: true,
              provider_request_error:
                error instanceof Error
                  ? error.message
                  : String(error),
              reconciliation_required: true,
            },
          },
        );

        return jsonResponse({
          success: true,
          status: "pending",
          reference,
          transaction_id: transactionId,
          message: "Your payment is being verified.",
        });
      }

      const flutterwaveData =
        flutterwaveResponse?.body ?? null;

      console.log(
        "Flutterwave bill payment response:",
        JSON.stringify({
          http_status: flutterwaveResponse?.status,
          ok: flutterwaveResponse?.ok,
          body: flutterwaveData,
        }),
      );

      const flutterwaveStatus = normalizeStatus(
        firstNonEmpty(
          flutterwaveData?.data?.status,
          flutterwaveData?.status,
        ),
      );

      const providerReference =
        extractProviderReference({
          provider_response: flutterwaveData,
        });

      /* --------------------------------------------------------
       * SUCCESS
       * -------------------------------------------------------- */

      if (
        flutterwaveResponse?.ok &&
        flutterwaveData?.status === "success" &&
        (!flutterwaveData?.data?.status ||
          isSuccessfulStatus(flutterwaveData?.data?.status))
      ) {
        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "successful",
            provider: "flutterwave",
            provider_reference: providerReference,
            completed_at: new Date().toISOString(),
            metadata: {
              ...transactionMetadata,
              flutterwave_status: flutterwaveStatus,
              flutterwave_response: flutterwaveData,
              reconciliation_required: false,
              reconciled_at: new Date().toISOString(),
            },
          },
        );

        return jsonResponse({
          success: true,
          status: "successful",
          reference,
          transaction_id: transactionId,
          message: "Payment completed successfully.",
        });
      }

      /* --------------------------------------------------------
       * DEFINITIVE FAILURE
       * -------------------------------------------------------- */

      const flutterwaveFailure =
        !flutterwaveResponse?.ok ||
        isFailedStatus(flutterwaveStatus);

      if (flutterwaveFailure) {
        const providerMessage = getProviderMessage({
          provider_response: flutterwaveData,
        });

        console.error(
          "Flutterwave bill payment failed:",
          JSON.stringify({
            status: flutterwaveStatus,
            message: providerMessage,
            response: flutterwaveData,
          }),
        );

        const refund = await refundBillTransaction(
          admin,
          user.id,
          reference,
          sellingAmount,
          "Flutterwave bill payment failed.",
          {
            ...transactionMetadata,
            flutterwave_status: flutterwaveStatus,
            flutterwave_response: flutterwaveData,
          },
        );

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status: "failed",
            provider: "flutterwave",
            provider_reference: providerReference,
            metadata: {
              ...transactionMetadata,
              flutterwave_status: flutterwaveStatus,
              flutterwave_response: flutterwaveData,
              refunded: refund.success,
              refund_pending: !refund.success,
              refund_error: refund.error?.message ?? null,
              reconciliation_required: false,
            },
          },
        );

        if (!refund.success) {
          return jsonResponse(
            {
              success: false,
              status: "failed",
              reference,
              transaction_id: transactionId,
              error:
                "The payment failed, but the automatic refund requires retry.",
            },
            503,
          );
        }

        return jsonResponse({
          success: false,
          status: "failed",
          reference,
          transaction_id: transactionId,
          refunded: true,
          message:
            "Payment failed. Your wallet has been refunded.",
        });
      }

      /* --------------------------------------------------------
       * PENDING / UNKNOWN
       * -------------------------------------------------------- */

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "pending",
          provider: "flutterwave",
          provider_reference: providerReference,
          metadata: {
            ...transactionMetadata,
            flutterwave_status: flutterwaveStatus,
            flutterwave_response: flutterwaveData,
            reconciliation_required: true,
            pending_since: new Date().toISOString(),
          },
        },
      );

      return jsonResponse({
        success: true,
        status: "pending",
        reference,
        transaction_id: transactionId,
        message:
          "Your payment has been initiated and is being verified.",
      });
    }

    return jsonResponse(
      {
        success: false,
        error: "Unsupported bill payment action.",
      },
      400,
    );
  } catch (error) {
    console.error(
      "FLUTTERWAVE-BILLS INTERNAL ERROR:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to process your bill payment right now. Please try again.",
      },
      500,
    );
  }
});
