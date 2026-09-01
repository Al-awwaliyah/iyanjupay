const DEFAULT_BASE_URL =
  "https://www.nellobytesystems.com";

export type ClubKonnectResponse = {
  ok: boolean;
  http_status: number;
  body: any;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getCredentials() {
  const userId = clean(
    Deno.env.get("CLUBKONNECT_USER_ID"),
  );

  const apiKey = clean(
    Deno.env.get("CLUBKONNECT_API_KEY"),
  );

  const baseUrl =
    clean(
      Deno.env.get(
        "CLUBKONNECT_BASE_URL",
      ),
    ) || DEFAULT_BASE_URL;

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  return {
    userId,
    apiKey,
    baseUrl: baseUrl.replace(
      /\/+$/,
      "",
    ),
  };
}

/**
 * Performs a secure server-side GET request
 * to ClubKonnect.
 *
 * Credentials are never exposed to the client.
 */
export async function clubKonnect(
  endpoint: string,
  params: Record<
    string,
    string | number | undefined | null
  > = {},
): Promise<ClubKonnectResponse> {
  const {
    userId,
    apiKey,
    baseUrl,
  } = getCredentials();

  const url = new URL(
    `${baseUrl}/${endpoint.replace(/^\/+/, "")}`,
  );

  url.searchParams.set(
    "UserID",
    userId,
  );

  url.searchParams.set(
    "APIKey",
    apiKey,
  );

  for (
    const [key, value] of Object.entries(
      params,
    )
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    url.searchParams.set(
      key,
      String(value),
    );
  }

  console.log(
    "ClubKonnect request:",
    JSON.stringify({
      endpoint,
      params: Object.fromEntries(
        Object.entries(params).map(
          ([key, value]) => [
            key,
            key.toLowerCase().includes(
              "phone",
            ) ||
            key.toLowerCase().includes(
              "mobile",
            ) ||
            key.toLowerCase().includes(
              "meter",
            ) ||
            key.toLowerCase().includes(
              "smartcard",
            )
              ? "[REDACTED]"
              : value,
          ],
        ),
      ),
    }),
  );

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => {
      controller.abort();
    },
    30_000,
  );

  try {
    const response =
      await fetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
          },
          signal:
            controller.signal,
        },
      );

    const raw =
      await response.text();

    let body: any = null;

    try {
      body =
        raw
          ? JSON.parse(raw)
          : null;
    } catch {
      body = {
        raw,
      };
    }

    console.log(
      "ClubKonnect response:",
      JSON.stringify({
        endpoint,
        http_status:
          response.status,
        body,
      }),
    );

    return {
      ok: response.ok,
      http_status:
        response.status,
      body,
    };
  } catch (error) {
    console.error(
      "ClubKonnect request failed:",
      error,
    );

    throw error;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/**
 * Check ClubKonnect wallet balance.
 */
export async function clubKonnectBalance() {
  return clubKonnect(
    "APIWalletBalanceV1.asp",
  );
}

/**
 * Fetch mobile networks supported
 * by ClubKonnect.
 */
export async function clubKonnectAirtimeNetworks() {
  return clubKonnect(
    "APIAirtimeNetworkV2.asp",
  );
}

/**
 * Fetch data networks supported
 * by ClubKonnect.
 */
export async function clubKonnectDataNetworks() {
  return clubKonnect(
    "APIDatabundleNetworkV2.asp",
  );
}

/**
 * Fetch ClubKonnect data plans.
 */
export async function clubKonnectDataPlans() {
  return clubKonnect(
    "APIDatabundlePlansV2.asp",
  );
}

/**
 * Purchase airtime.
 */
export async function clubKonnectAirtime(
  params: {
    network: string;
    amount: number;
    phone: string;
    requestId: string;
    callbackUrl?: string;
  },
) {
  return clubKonnect(
    "APIAirtimeV1.asp",
    {
      MobileNetwork:
        params.network,

      Amount:
        params.amount,

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,

      CallBackURL:
        params.callbackUrl,
    },
  );
}

/**
 * Purchase data.
 */
export async function clubKonnectData(
  params: {
    network: string;
    dataPlan: string;
    phone: string;
    requestId: string;
    callbackUrl?: string;
  },
) {
  return clubKonnect(
    "APIDatabundleV1.asp",
    {
      MobileNetwork:
        params.network,

      DataPlan:
        params.dataPlan,

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,

      CallBackURL:
        params.callbackUrl,
    },
  );
}

/**
 * Fetch ClubKonnect cable TV types.
 */
export async function clubKonnectCableTypes() {
  return clubKonnect(
    "APICableTVTypeV2.asp",
  );
}

/**
 * Fetch ClubKonnect cable packages.
 */
export async function clubKonnectCablePackages() {
  return clubKonnect(
    "APICableTVPackagesV2.asp",
  );
}

/**
 * Verify a cable smartcard/IUC.
 */
export async function clubKonnectVerifyCable(
  params: {
    cableTv: string;
    smartCard: string;
  },
) {
  return clubKonnect(
    "APIVerifyCableTVV1.asp",
    {
      CableTV:
        params.cableTv,

      SmartCardNo:
        params.smartCard,
    },
  );
}

/**
 * Purchase cable TV.
 */
export async function clubKonnectCable(
  params: {
    cableTv: string;
    packageCode: string;
    smartCard: string;
    phone: string;
    requestId: string;
    callbackUrl?: string;
  },
) {
  return clubKonnect(
    "APICableTVV1.asp",
    {
      CableTV:
        params.cableTv,

      Package:
        params.packageCode,

      SmartCardNo:
        params.smartCard,

      PhoneNo:
        params.phone,

      RequestID:
        params.requestId,

      CallBackURL:
        params.callbackUrl,
    },
  );
}

/**
 * Verify electricity meter.
 */
export async function clubKonnectVerifyElectricity(
  params: {
    company: string;
    meterType: string;
    meterNumber: string;
  },
) {
  return clubKonnect(
    "APIVerifyElectricityV1.asp",
    {
      ElectricCompany:
        params.company,

      MeterType:
        params.meterType,

      MeterNo:
        params.meterNumber,
    },
  );
}

/**
 * Purchase electricity.
 */
export async function clubKonnectElectricity(
  params: {
    company: string;
    meterType: string;
    meterNumber: string;
    amount: number;
    phone: string;
    requestId: string;
    callbackUrl?: string;
  },
) {
  return clubKonnect(
    "APIElectricityV1.asp",
    {
      ElectricCompany:
        params.company,

      MeterType:
        params.meterType,

      MeterNo:
        params.meterNumber,

      Amount:
        params.amount,

      PhoneNo:
        params.phone,

      RequestID:
        params.requestId,

      CallBackURL:
        params.callbackUrl,
    },
  );
}

/**
 * Query a ClubKonnect transaction.
 */
export async function clubKonnectQuery(
  orderId: string,
) {
  return clubKonnect(
    "APIQueryV1.asp",
    {
      OrderID:
        orderId,
    },
  );
}

/**
 * Query using our RequestID.
 */
export async function clubKonnectQueryByRequestId(
  requestId: string,
) {
  return clubKonnect(
    "APIQueryV1.asp",
    {
      RequestID:
        requestId,
    },
  );
}
