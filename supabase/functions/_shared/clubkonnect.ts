// ============================================================
// IYANJUPAY — CLUBKONNECT SHARED API CLIENT
// ============================================================
//
// This file is SERVER-SIDE ONLY.
//
// Responsibilities:
//   - ClubKonnect credentials
//   - ClubKonnect HTTP requests
//   - Catalogue retrieval
//   - Customer identifier verification
//   - Service purchase requests
//   - Transaction status/query requests
//
// IMPORTANT:
//   - Never import this file from the frontend.
//   - Never expose CLUBKONNECT_USER_ID.
//   - Never expose CLUBKONNECT_API_KEY.
//   - Wallet/ledger/transaction logic belongs in the
//     clubkonnect-services Edge Function.
//
// ============================================================

const BASE_URL = "https://www.nellobytesystems.com";

export type ClubKonnectResponse<T = any> = {
  ok: boolean;
  httpStatus: number;
  body: T;
};

function clean(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function first<T = unknown>(
  ...values: T[]
): T | undefined {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      clean(value) !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function getCredentials() {
  const userId = clean(
    Deno.env.get("CLUBKONNECT_USER_ID") ??
      Deno.env.get("CLUBKONNECT_USERID"),
  );

  const apiKey = clean(
    Deno.env.get("CLUBKONNECT_API_KEY") ??
      Deno.env.get("CLUBKONNECT_APIKEY"),
  );

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  return {
    userId,
    apiKey,
  };
}

/**
 * Make a server-side GET request to ClubKonnect.
 */
async function request(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<ClubKonnectResponse> {
  const { userId, apiKey } = getCredentials();

  const url = new URL(
    `${BASE_URL}/${endpoint}`,
  );

  url.searchParams.set(
    "UserID",
    userId,
  );

  url.searchParams.set(
    "APIKey",
    apiKey,
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      value === null ||
      clean(value) === ""
    ) {
      continue;
    }

    url.searchParams.set(
      key,
      clean(value),
    );
  }

  console.log(
    "ClubKonnect request",
    {
      endpoint,
      parameter_names: Object.keys(params),
    },
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );

  const text = await response.text();

  let body: any = {};

  try {
    body = text
      ? JSON.parse(text)
      : {};
  } catch {
    body = {
      status: "NON_JSON_RESPONSE",
      raw: text.slice(0, 500),
    };
  }

  console.log(
    "ClubKonnect response",
    {
      endpoint,
      http_status: response.status,
      ok: response.ok,
      status: first(
        body?.status,
        body?.Status,
        body?.orderstatus,
        body?.OrderStatus,
      ) ?? null,
      statuscode: first(
        body?.statuscode,
        body?.StatusCode,
        body?.statusCode,
      ) ?? null,
      orderid: first(
        body?.orderid,
        body?.OrderID,
        body?.orderId,
      ) ?? null,
      requestid: first(
        body?.requestid,
        body?.RequestID,
        body?.requestId,
      ) ?? null,
    },
  );

  return {
    ok: response.ok,
    httpStatus: response.status,
    body,
  };
}

// ============================================================
// COMMON RESPONSE HELPERS
// ============================================================

export function clubKonnectStatus(
  body: any,
): string {
  return clean(
    first(
      body?.status,
      body?.Status,
      body?.orderstatus,
      body?.OrderStatus,
      body?.data?.status,
      body?.data?.Status,
    ),
  ).toLowerCase();
}

export function clubKonnectStatusCode(
  body: any,
): string {
  return clean(
    first(
      body?.statuscode,
      body?.StatusCode,
      body?.statusCode,
      body?.data?.statuscode,
      body?.data?.StatusCode,
    ),
  );
}

export function clubKonnectOrderId(
  body: any,
): string {
  return clean(
    first(
      body?.orderid,
      body?.OrderID,
      body?.orderId,
      body?.data?.orderid,
      body?.data?.OrderID,
    ),
  );
}

export function clubKonnectRequestId(
  body: any,
): string {
  return clean(
    first(
      body?.requestid,
      body?.RequestID,
      body?.requestId,
      body?.data?.requestid,
      body?.data?.RequestID,
    ),
  );
}

function arraysFrom(
  body: any,
): any[] {
  if (Array.isArray(body)) {
    return body;
  }

  const candidates = [
    body?.data,
    body?.Data,
    body?.items,
    body?.Items,
    body?.plans,
    body?.Plans,
    body?.packages,
    body?.Packages,
    body?.products,
    body?.Products,
    body?.result,
    body?.Result,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

// ============================================================
// AIRTIME
// ============================================================

export async function clubKonnectAirtimeNetworks() {
  return request(
    "APIAirtimeNetworksV2.asp",
  );
}

export async function clubKonnectAirtime(
  params: {
    network: string;
    phone: string;
    amount: number;
    requestId?: string;
    callbackUrl?: string;
  },
) {
  return request(
    "APIAirtimeV1.asp",
    {
      MobileNetwork: params.network,
      MobileNumber: params.phone,
      Amount: params.amount,
      RequestID: params.requestId,
      CallBackURL: params.callbackUrl,
    },
  );
}

// ============================================================
// DATA
// ============================================================

export async function clubKonnectDataNetworks() {
  return request(
    "APIDatabundleNetworksV2.asp",
  );
}

export async function clubKonnectDataPlans(
  network?: string,
) {
  return request(
    "APIDatabundlePlansV2.asp",
    {
      MobileNetwork: network,
    },
  );
}

export async function clubKonnectData(
  params: {
    network: string;
    phone: string;
    plan: string;
    requestId?: string;
    callbackUrl?: string;
  },
) {
  return request(
    "APIDatabundleV1.asp",
    {
      MobileNetwork: params.network,
      MobileNumber: params.phone,
      DataPlan: params.plan,
      RequestID: params.requestId,
      CallBackURL: params.callbackUrl,
    },
  );
}

// ============================================================
// CABLE TV
// ============================================================

export async function clubKonnectCableTypes() {
  return request(
    "APICableTVV1.asp",
  );
}

export async function clubKonnectCablePackages(
  cableTv: string,
) {
  return request(
    "APICableTVPackagesV1.asp",
    {
      CableTV: cableTv,
    },
  );
}

/**
 * IMPORTANT:
 *
 * This function must only be used when the exact
 * ClubKonnect verification contract is confirmed.
 *
 * It intentionally does NOT claim success merely because
 * a smartcard number exists locally.
 */
export async function clubKonnectVerifyCable(
  params: {
    cableTv: string;
    smartCard: string;
  },
) {
  throw new Error(
    "ClubKonnect Cable TV identifier verification endpoint/contract must be confirmed before enabling verification.",
  );
}

export async function clubKonnectCable(
  params: {
    cableTv: string;
    packageCode: string;
    smartCard: string;
    phone?: string;
    requestId?: string;
    callbackUrl?: string;
  },
) {
  return request(
    "APICableTVV1.asp",
    {
      CableTV: params.cableTv,
      Package: params.packageCode,
      SmartCardNo: params.smartCard,
      MobileNumber: params.phone,
      RequestID: params.requestId,
      CallBackURL: params.callbackUrl,
    },
  );
}

// ============================================================
// ELECTRICITY
// ============================================================

export async function clubKonnectElectricityCompanies() {
  return request(
    "APIElectricityCompaniesV2.asp",
  );
}

/**
 * IMPORTANT:
 *
 * Same rule as Cable TV:
 * never report a meter as valid without a real provider
 * verification response.
 */
export async function clubKonnectVerifyElectricity(
  params: {
    company: string;
    meterType: string;
    meterNumber: string;
  },
) {
  throw new Error(
    "ClubKonnect Electricity meter verification endpoint/contract must be confirmed before enabling verification.",
  );
}

export async function clubKonnectElectricity(
  params: {
    company: string;
    meterType: string;
    meterNumber: string;
    amount: number;
    phone?: string;
    requestId?: string;
    callbackUrl?: string;
  },
) {
  return request(
    "APIElectricityV1.asp",
    {
      ElectricityCompany: params.company,
      MeterType: params.meterType,
      MeterNumber: params.meterNumber,
      Amount: params.amount,
      MobileNumber: params.phone,
      RequestID: params.requestId,
      CallBackURL: params.callbackUrl,
    },
  );
}

// ============================================================
// TRANSACTION STATUS
// ============================================================

export async function clubKonnectQuery(
  orderId: string,
) {
  return request(
    "APIQueryV1.asp",
    {
      OrderID: orderId,
    },
  );
}

export async function clubKonnectQueryByRequestId(
  requestId: string,
) {
  return request(
    "APIQueryV1.asp",
    {
      RequestID: requestId,
    },
  );
}

// ============================================================
// GENERIC HELPERS
// ============================================================

export function extractClubKonnectArray(
  body: any,
): any[] {
  return arraysFrom(body);
}

export function clubKonnectSafeResponse(
  body: any,
) {
  return {
    status:
      clubKonnectStatus(body) || null,

    statuscode:
      clubKonnectStatusCode(body) || null,

    orderid:
      clubKonnectOrderId(body) || null,

    requestid:
      clubKonnectRequestId(body) || null,

    remark:
      clean(
        first(
          body?.remark,
          body?.Remark,
          body?.orderremark,
          body?.OrderRemark,
          body?.data?.remark,
          body?.data?.Remark,
        ),
      ) || null,
  };
}
