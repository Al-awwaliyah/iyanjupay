// ============================================================
// IYANJUPAY — CLUBKONNECT SHARED API CLIENT
// ============================================================
// Server-side only. Never import this module into the frontend.
// ClubKonnect credentials must remain in Supabase Edge Function
// environment variables.
// ============================================================

const BASE_URL = "https://www.nellobytesystems.com";

function s(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function first(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && s(value) !== "") return value;
  }
  return undefined;
}

function normalizeKey(value: unknown): string {
  return s(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(value: unknown, ...aliases: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const source = value as Record<string, unknown>;
  const map = new Map<string, unknown>();

  for (const [key, val] of Object.entries(source)) {
    map.set(normalizeKey(key), val);
  }

  for (const alias of aliases) {
    const found = map.get(normalizeKey(alias));
    if (found !== undefined && found !== null && s(found) !== "") return found;
  }

  return undefined;
}

function credentials() {
  const userId = s(
    Deno.env.get("CLUBKONNECT_USER_ID") ??
      Deno.env.get("CLUBKONNECT_USERID"),
  );

  const apiKey = s(
    Deno.env.get("CLUBKONNECT_API_KEY") ??
      Deno.env.get("CLUBKONNECT_APIKEY"),
  );

  if (!userId || !apiKey) {
    throw new Error("ClubKonnect credentials are not configured.");
  }

  return { userId, apiKey };
}

export function clubKonnectCallbackUrl(): string | undefined {
  const configured = s(Deno.env.get("CLUBKONNECT_CALLBACK_URL"));
  if (configured) return configured;

  const supabaseUrl = s(Deno.env.get("SUPABASE_URL"));
  if (!supabaseUrl) return undefined;

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/clubkonnect-webhook`;
}

export type ClubKonnectResponse<T = any> = {
  ok: boolean;
  status: number;
  body: T;
};

/**
 * Central ClubKonnect HTTP transport.
 *
 * The service Edge Function supplies only provider endpoint parameters.
 * UserID and APIKey are injected here and never leave the server.
 */
export async function clubKonnectRequest<T = any>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<ClubKonnectResponse<T>> {
  const { userId, apiKey } = credentials();

  const url = new URL(`${BASE_URL}/${endpoint}`);

  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || s(value) === "") continue;
    url.searchParams.set(key, s(value));
  }

  console.log("ClubKonnect request", {
    endpoint,
    parameter_names: Object.keys(params),
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let body: any = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {
      status: "NON_JSON_RESPONSE",
      raw: text.slice(0, 500),
    };
  }

  console.log("ClubKonnect response", {
    endpoint,
    http_status: response.status,
    ok: response.ok,
    status: first(
      pick(body, "status", "Status", "orderstatus", "OrderStatus"),
      pick(body?.data, "status", "Status", "orderstatus", "OrderStatus"),
    ) ?? null,
    statuscode: first(
      pick(body, "statuscode", "statusCode", "StatusCode"),
      pick(body?.data, "statuscode", "statusCode", "StatusCode"),
    ) ?? null,
    orderid: first(
      pick(body, "orderid", "orderId", "OrderID"),
      pick(body?.data, "orderid", "orderId", "OrderID"),
    ) ?? null,
    requestid: first(
      pick(body, "requestid", "requestId", "RequestID"),
      pick(body?.data, "requestid", "requestId", "RequestID"),
    ) ?? null,
  });

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

// ============================================================
// Named convenience wrappers
// ============================================================
// These wrappers intentionally remain thin. Endpoint-specific
// catalogue parsing and financial logic stay in clubkonnect-services.

export const clubKonnectAirtimeNetworks = () =>
  clubKonnectRequest("APIAirtimeNetworksV2.asp");

export const clubKonnectDataNetworks = () =>
  clubKonnectRequest("APIDatabundleNetworksV2.asp");

export const clubKonnectDataPlans = (network?: string) =>
  clubKonnectRequest("APIDatabundlePlansV2.asp", {
    MobileNetwork: network,
  });

export const clubKonnectCableTypes = () =>
  clubKonnectRequest("APICableTVTypeV2.asp");

export const clubKonnectCablePackages = (cableTv: string) =>
  clubKonnectRequest("APICableTVPackagesV2.asp", {
    CableTV: cableTv,
  });

export const clubKonnectVerifyCable = (params: {
  cableTv: string;
  smartCard: string;
}) =>
  clubKonnectRequest("APIVerifyCableTVV1.asp", {
    CableTV: params.cableTv,
    SmartCardNo: params.smartCard,
  });

export const clubKonnectVerifyElectricity = (params: {
  electricCompany: string;
  meterNumber: string;
  meterType?: string;
}) =>
  clubKonnectRequest("APIVerifyElectricityV1.asp", {
    ElectricCompany: params.electricCompany,
    MeterNo: params.meterNumber,
    MeterType: params.meterType,
  });

export const clubKonnectVerifyJAMB = (params: {
  examType: string;
  profileCode: string;
}) =>
  clubKonnectRequest("APIVerifyJAMBV1.asp", {
    ExamType: params.examType,
    ProfileID: params.profileCode,
  });

export const clubKonnectAirtime = (params: {
  network: string;
  phone: string;
  amount: number;
  requestId?: string;
  callbackUrl?: string;
}) =>
  clubKonnectRequest("APIAirtimeV1.asp", {
    MobileNetwork: params.network,
    MobileNumber: params.phone,
    Amount: params.amount,
    RequestID: params.requestId,
    CallBackURL: params.callbackUrl,
  });

export const clubKonnectData = (params: {
  network: string;
  phone: string;
  plan: string;
  requestId?: string;
  callbackUrl?: string;
}) =>
  clubKonnectRequest("APIDatabundleV1.asp", {
    MobileNetwork: params.network,
    MobileNumber: params.phone,
    DataPlan: params.plan,
    RequestID: params.requestId,
    CallBackURL: params.callbackUrl,
  });

export const clubKonnectCable = (params: {
  cableTv: string;
  packageCode: string;
  smartCard: string;
  phone?: string;
  requestId?: string;
  callbackUrl?: string;
}) =>
  clubKonnectRequest("APICableTVV1.asp", {
    CableTV: params.cableTv,
    Package: params.packageCode,
    SmartCardNo: params.smartCard,
    MobileNumber: params.phone,
    RequestID: params.requestId,
    CallBackURL: params.callbackUrl,
  });

export const clubKonnectElectricity = (params: {
  electricCompany: string;
  meterNumber: string;
  meterType?: string;
  amount: number;
  phone?: string;
  requestId?: string;
  callbackUrl?: string;
}) =>
  clubKonnectRequest("APIElectricityV1.asp", {
    ElectricCompany: params.electricCompany,
    MeterNo: params.meterNumber,
    MeterType: params.meterType,
    Amount: params.amount,
    MobileNumber: params.phone,
    RequestID: params.requestId,
    CallBackURL: params.callbackUrl,
  });

export const clubKonnectQuery = (orderId: string) =>
  clubKonnectRequest("APIQueryV1.asp", {
    OrderID: orderId,
  });

export const clubKonnectQueryByRequestId = (requestId: string) =>
  clubKonnectRequest("APIQueryV1.asp", {
    RequestID: requestId,
  });

export const clubKonnectAirtimePinCatalog = () =>
  clubKonnectRequest("APIEPINDiscountV2.asp");

export const clubKonnectDataPinCatalog = () =>
  clubKonnectRequest("APIEPINDiscountV2.asp");

export const clubKonnectSmilePackages = () =>
  clubKonnectRequest("APISmilePackagesV2.asp");

export const clubKonnectWaecPackages = () =>
  clubKonnectRequest("APIWAECPackagesV2.asp");

export const clubKonnectJambPackages = () =>
  clubKonnectRequest("APIJAMBPackagesV2.asp");
