import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ============================================================
// FLUTTERWAVE SECRETS
// ============================================================

const FLW_SECRET_KEY =
  Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

const FLW_ENCRYPTION_KEY =
  Deno.env.get("FLUTTERWAVE_ENCRYPTION_KEY") ?? "";

// ============================================================
// CONFIG
// ============================================================

const FLW_BASE_URL = (
  Deno.env.get("FLW_BASE_URL") ??
  "https://api.flutterwave.com/v3"
).replace(/\/+$/, "");

const CURRENCY = "NGN";

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// ============================================================
// TYPES
// ============================================================

interface FlutterwaveBalance {
  currency?: string;
  available_balance?: number | string;
  ledger_balance?: number | string;
  [key: string]: unknown;
}

interface FlutterwaveSettlement {
  id?: string;
  net_amount?: number | string;
  gross_amount?: number | string;
  currency?: string;
  status?: string;
  destination?: string;
  due_datetime?: string;
  created_datetime?: string;
  settlement_type?: string;
  subaccount_id?: string;
  disburse_ref?: string;
  fees?: unknown[];
  charges?: unknown[];
  charge_count?: number | string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FlutterwaveWalletStatement {
  type?: string;
  amount?: number | string;
  currency?: string;
  balance_before?: number | string;
  balance_after?: number | string;
  reference?: string;
  date?: string;
  created_at?: string;
  narration?: string;
  remarks?: string;
  transaction_type?: string;
  payout_id?: string | number;
  id?: string | number;
  [key: string]: unknown;
}

interface PageInfo {
  total?: number;
  current_page?: number;
  total_pages?: number;
}

interface SettlementResponse {
  status?: string;
  message?: string;
  data?: FlutterwaveSettlement[];
  meta?: {
    page_info?: PageInfo;
  };
}

interface WalletStatementResponse {
  status?: string;
  message?: string;
  data?: FlutterwaveWalletStatement[];
  meta?: {
    page_info?: PageInfo;
    next?: string;
    previous?: string;
  };
}

// ============================================================
// RESPONSE
// ============================================================

function jsonResponse(
  body: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

// ============================================================
// AUTH TOKEN
// ============================================================

function getBearerToken(
  request: Request
): string | null {
  const authorization =
    request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  if (
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

// ============================================================
// NUMBER
// ============================================================

function toNumber(
  value: unknown,
  fallback = 0
): number {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

// ============================================================
// DATE
// ============================================================

function safeDate(
  value: unknown
): string | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(String(value));

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

// ============================================================
// TRACE ID
// ============================================================

function randomTraceId(): string {
  return crypto.randomUUID();
}

// ============================================================
// FLUTTERWAVE REQUEST
// ============================================================

async function flutterwaveRequest<T>(
  path: string,
  options: {
    method?: string;
    query?: Record<
      string,
      string | number | boolean | undefined
    >;
  } = {}
): Promise<T> {
  if (!FLW_SECRET_KEY) {
    throw new Error(
      "FLUTTERWAVE_SECRET_KEY is not configured."
    );
  }

  const method =
    options.method ?? "GET";

  const url =
    new URL(
      `${FLW_BASE_URL}${path}`
    );

  if (options.query) {
    for (
      const [key, value]
      of Object.entries(
        options.query
      )
    ) {
      if (
        value !== undefined &&
        value !== null &&
        String(value).length > 0
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    }
  }

  const response =
    await fetch(
      url.toString(),
      {
        method,
        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${FLW_SECRET_KEY}`,

          "X-Trace-Id":
            randomTraceId(),
        },
      }
    );

  const text =
    await response.text();

  let payload: any = null;

  try {
    payload =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    payload = {
      raw: text,
    };
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Flutterwave request failed with HTTP ${response.status}.`;

    throw new Error(message);
  }

  if (
    payload?.status &&
    String(
      payload.status
    ).toLowerCase() !== "success"
  ) {
    throw new Error(
      payload?.message ||
        "Flutterwave request failed."
    );
  }

  return payload as T;
}

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

async function authenticateAdmin(
  request: Request
) {
  const accessToken =
    getBearerToken(request);

  if (!accessToken) {
    throw new Error(
      "Authentication required."
    );
  }

  const {
    data: {
      user,
    },
    error,
  } =
    await supabaseAdmin.auth.getUser(
      accessToken
    );

  if (error || !user) {
    throw new Error(
      "Invalid or expired authentication session."
    );
  }

  const {
    data: admin,
    error: adminError,
  } =
    await supabaseAdmin
      .from("support_admins")
      .select(
        "user_id, role, is_active"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

  if (adminError) {
    throw new Error(
      adminError.message
    );
  }

  if (!admin) {
    throw new Error(
      "Administrator access required."
    );
  }

  return {
    user,
    admin,
  };
}

// ============================================================
// FETCH PAYOUT BALANCE
//
// THIS IS THE MAIN FLUTTERWAVE F4B WALLET BALANCE.
//
// /v3/balances/NGN
//
// available_balance = available for payouts
// ledger_balance    = ledger balance
// ============================================================

async function fetchPayoutBalance() {
  const response =
    await flutterwaveRequest<{
      status: string;
      message: string;
      data: FlutterwaveBalance;
    }>(
      `/balances/${CURRENCY}`
    );

  const data =
    response.data ?? {};

  return {
    currency:
      data.currency ??
      CURRENCY,

    availableBalance:
      toNumber(
        data.available_balance
      ),

    ledgerBalance:
      toNumber(
        data.ledger_balance
      ),

    raw: data,
  };
}

// ============================================================
// FETCH SETTLEMENTS
//
// Flutterwave settlement endpoint:
//
// GET /v3/settlements
//
// We use settlement records to identify funds that are
// still pending/unsettled.
//
// This is NOT the same thing as the payout wallet.
// ============================================================

async function fetchSettlements(
  from: string,
  to: string,
  page = 1,
  size = 50
) {
  const response =
    await flutterwaveRequest<SettlementResponse>(
      "/settlements",
      {
        query: {
          from,
          to,
          page,
          size,
        },
      }
    );

  const transactions =
    Array.isArray(
      response.data
    )
      ? response.data
      : [];

  return {
    transactions,

    pageInfo:
      response.meta?.page_info ??
      null,
  };
}

// ============================================================
// FETCH PENDING COLLECTION BALANCE
//
// Collection Balance = funds collected but not yet settled.
//
// Flutterwave documents collection balance as funds held
// before settlement.
//
// We therefore calculate it from settlement records whose
// settlement status is pending/processing/queued.
//
// IMPORTANT:
// This is intentionally NOT /balances/NGN.
// /balances/NGN is the payout/F4B wallet balance.
// ============================================================

async function fetchCollectionBalance(
  from: string,
  to: string
) {
  let page = 1;

  const maxPages = 20;

  const allSettlements:
    FlutterwaveSettlement[] = [];

  while (
    page <= maxPages
  ) {
    const result =
      await fetchSettlements(
        from,
        to,
        page,
        50
      );

    allSettlements.push(
      ...result.transactions
    );

    const totalPages =
      toNumber(
        result.pageInfo
          ?.total_pages,
        0
      );

    if (
      totalPages > 0 &&
      page >= totalPages
    ) {
      break;
    }

    if (
      result.transactions
        .length < 50
    ) {
      break;
    }

    page += 1;
  }

  const pendingStatuses =
    new Set([
      "pending",
      "processing",
      "queued",
      "created",
      "initiated",
    ]);

  const pendingSettlements =
    allSettlements.filter(
      (settlement) => {
        const status =
          String(
            settlement.status ??
              ""
          )
            .trim()
            .toLowerCase();

        return pendingStatuses.has(
          status
        );
      }
    );

  const pendingGross =
    pendingSettlements.reduce(
      (
        total,
        settlement
      ) =>
        total +
        toNumber(
          settlement.gross_amount
        ),
      0
    );

  const pendingNet =
    pendingSettlements.reduce(
      (
        total,
        settlement
      ) =>
        total +
        toNumber(
          settlement.net_amount
        ),
      0
    );

  return {
    currency:
      CURRENCY,

    balance:
      pendingNet,

    grossBalance:
      pendingGross,

    pendingSettlementCount:
      pendingSettlements.length,

    settlements:
      pendingSettlements,

    allSettlements,
  };
}

// ============================================================
// WALLET HISTORY
//
// GET /v3/wallet/statement
//
// This represents movements on the F4B wallet/payout balance.
// ============================================================

async function fetchPayoutHistory(
  from: string,
  to: string,
  page = 1
) {
  const response =
    await flutterwaveRequest<WalletStatementResponse>(
      "/wallet/statement",
      {
        query: {
          from,
          to,
          currency:
            CURRENCY,
          page,
          type:
            "C",
          include_transaction_type:
            true,
          include_payout_id:
            true,
        },
      }
    );

  return {
    transactions:
      Array.isArray(
        response.data
      )
        ? response.data
        : [],

    pageInfo:
      response.meta?.page_info ??
      null,

    next:
      response.meta?.next ??
      null,

    previous:
      response.meta?.previous ??
      null,
  };
}

// ============================================================
// SAVE BALANCE SNAPSHOT
// ============================================================

async function saveSnapshot(
  balanceType:
    | "collection"
    | "payout",
  balance: number,
  availableBalance:
    | number
    | null,
  ledgerBalance:
    | number
    | null,
  metadata: Record<
    string,
    unknown
  >
) {
  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "flutterwave_balance_snapshots"
      )
      .insert({
        balance_type:
          balanceType,

        currency:
          CURRENCY,

        balance,

        available_balance:
          availableBalance,

        ledger_balance:
          ledgerBalance,

        source:
          "flutterwave",

        provider_reference:
          null,

        metadata,
      });

  if (error) {
    throw new Error(
      `Failed to save ${balanceType} balance snapshot: ${error.message}`
    );
  }
}

// ============================================================
// SAVE SYNC LOG
// ============================================================

async function saveSyncLog(
  values: {
    status:
      | "success"
      | "failed"
      | "partial";

    collectionBalance:
      | number
      | null;

    payoutBalance:
      | number
      | null;

    errorMessage?:
      | string
      | null;

    responseMetadata?:
      Record<
        string,
        unknown
      >;
  }
) {
  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "flutterwave_balance_sync_logs"
      )
      .insert({
        status:
          values.status,

        collection_balance:
          values.collectionBalance,

        payout_balance:
          values.payoutBalance,

        currency:
          CURRENCY,

        error_message:
          values.errorMessage ??
          null,

        response_metadata:
          values.responseMetadata ??
          {},
      });

  if (error) {
    console.error(
      "Failed to save Flutterwave balance sync log:",
      error
    );
  }
}

// ============================================================
// AUDIT LOG
// ============================================================

async function writeAuditLog(
  userId: string,
  action: string,
  metadata: Record<
    string,
    unknown
  >
) {
  try {
    const {
      error,
    } =
      await supabaseAdmin
        .from("audit_logs")
        .insert({
          user_id:
            userId,

          action,

          metadata,
        });

    if (error) {
      console.warn(
        "Audit log was not written:",
        error.message
      );
    }
  } catch (error) {
    console.warn(
      "Audit logging failed:",
      error
    );
  }
}

// ============================================================
// DATE HELPERS
// ============================================================

function defaultFromDate(): string {
  return new Date(
    Date.now() -
      30 *
        24 *
        60 *
        60 *
        1000
  )
    .toISOString()
    .slice(0, 10);
}

function today(): string {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

// ============================================================
// SYNC BALANCES
// ============================================================

async function syncBalances(
  userId: string
) {
  const startedAt =
    new Date().toISOString();

  const from =
    defaultFromDate();

  const to =
    today();

  let collection:
    Awaited<
      ReturnType<
        typeof fetchCollectionBalance
      >
    > | null = null;

  let payout:
    Awaited<
      ReturnType<
        typeof fetchPayoutBalance
      >
    > | null = null;

  let collectionError:
    string | null = null;

  let payoutError:
    string | null = null;

  // ----------------------------------------------------------
  // COLLECTION
  // ----------------------------------------------------------

  try {
    collection =
      await fetchCollectionBalance(
        from,
        to
      );
  } catch (error: any) {
    collectionError =
      error?.message ??
      "Unable to fetch collection balance.";

    console.error(
      "Collection balance error:",
      error
    );
  }

  // ----------------------------------------------------------
  // PAYOUT
  // ----------------------------------------------------------

  try {
    payout =
      await fetchPayoutBalance();
  } catch (error: any) {
    payoutError =
      error?.message ??
      "Unable to fetch payout balance.";

    console.error(
      "Payout balance error:",
      error
    );
  }

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  let status:
    | "success"
    | "partial"
    | "failed";

  if (
    collection &&
    payout
  ) {
    status =
      "success";
  } else if (
    collection ||
    payout
  ) {
    status =
      "partial";
  } else {
    status =
      "failed";
  }

  // ----------------------------------------------------------
  // COLLECTION SNAPSHOT
  // ----------------------------------------------------------

  if (collection) {
    try {
      await saveSnapshot(
        "collection",

        collection.balance,

        collection.balance,

        collection.grossBalance,

        {
          provider:
            "flutterwave",

          balance_source:
            "pending_settlements",

          pending_settlement_count:
            collection.pendingSettlementCount,

          from,

          to,

          synchronized_at:
            new Date().toISOString(),
        }
      );
    } catch (error) {
      console.error(
        "Collection snapshot failed:",
        error
      );
    }
  }

  // ----------------------------------------------------------
  // PAYOUT SNAPSHOT
  // ----------------------------------------------------------

  if (payout) {
    try {
      await saveSnapshot(
        "payout",

        payout.availableBalance,

        payout.availableBalance,

        payout.ledgerBalance,

        {
          provider:
            "flutterwave",

          balance_source:
            "f4b_wallet",

          synchronized_at:
            new Date().toISOString(),
        }
      );
    } catch (error) {
      console.error(
        "Payout snapshot failed:",
        error
      );
    }
  }

  // ----------------------------------------------------------
  // SYNC LOG
  // ----------------------------------------------------------

  const errors =
    [
      collectionError,
      payoutError,
    ].filter(Boolean);

  await saveSyncLog({
    status,

    collectionBalance:
      collection?.balance ??
      null,

    payoutBalance:
      payout?.availableBalance ??
      null,

    errorMessage:
      errors.length > 0
        ? errors.join(" | ")
        : null,

    responseMetadata: {
      provider:
        "flutterwave",

      collectionSource:
        "pending_settlements",

      payoutSource:
        "f4b_wallet",

      collectionPendingSettlementCount:
        collection
          ?.pendingSettlementCount ??
        0,

      from,

      to,
    },
  });

  // ----------------------------------------------------------
  // AUDIT
  // ----------------------------------------------------------

  await writeAuditLog(
    userId,
    "flutterwave_balance_sync",
    {
      status,

      collection_balance:
        collection?.balance ??
        null,

      payout_balance:
        payout?.availableBalance ??
        null,

      collection_source:
        "pending_settlements",

      payout_source:
        "f4b_wallet",

      collection_error:
        collectionError,

      payout_error:
        payoutError,
    }
  );

  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  return {
    success:
      status !== "failed",

    status,

    currency:
      CURRENCY,

    synchronizedAt:
      new Date().toISOString(),

    collection: collection
      ? {
          currency:
            collection.currency,

          balance:
            collection.balance,

          grossBalance:
            collection.grossBalance,

          pendingSettlementCount:
            collection.pendingSettlementCount,

          source:
            "flutterwave_pending_collection",

          sourceDescription:
            "Funds collected but not yet settled.",
        }
      : null,

    payout: payout
      ? {
          currency:
            payout.currency,

          availableBalance:
            payout.availableBalance,

          ledgerBalance:
            payout.ledgerBalance,

          source:
            "flutterwave_f4b_wallet",

          sourceDescription:
            "Flutterwave wallet funds currently available for payouts.",
        }
      : null,

    errors: {
      collection:
        collectionError,

      payout:
        payoutError,
    },
  };
}

// ============================================================
// BALANCE HISTORY
// ============================================================

async function getHistory(
  request: Request,
  userId: string
) {
  const url =
    new URL(
      request.url
    );

  const type =
    (
      url.searchParams.get(
        "type"
      ) ?? "all"
    ).toLowerCase();

  const page =
    Math.max(
      Number(
        url.searchParams.get(
          "page"
        ) ?? "1"
      ),
      1
    );

  const from =
    url.searchParams.get(
      "from"
    ) ??
    defaultFromDate();

  const to =
    url.searchParams.get(
      "to"
    ) ??
    today();

  const result: any = {
    success:
      true,

    currency:
      CURRENCY,

    from,

    to,

    collection:
      null,

    payout:
      null,

    settlements:
      null,
  };

  // ----------------------------------------------------------
  // COLLECTION / SETTLEMENT HISTORY
  // ----------------------------------------------------------

  if (
    type === "all" ||
    type === "collection" ||
    type === "settlement"
  ) {
    const settlements =
      await fetchSettlements(
        from,
        to,
        page,
        50
      );

    result.settlements = {
      transactions:
        settlements.transactions,

      pageInfo:
        settlements.pageInfo,
    };

    result.collection = {
      transactions:
        settlements.transactions
          .filter(
            (
              settlement
            ) => {
              const status =
                String(
                  settlement.status ??
                    ""
                ).toLowerCase();

              return [
                "pending",
                "processing",
                "queued",
                "created",
                "initiated",
              ].includes(
                status
              );
            }
          ),

      pageInfo:
        settlements.pageInfo,
    };
  }

  // ----------------------------------------------------------
  // PAYOUT WALLET HISTORY
  // ----------------------------------------------------------

  if (
    type === "all" ||
    type === "payout"
  ) {
    result.payout =
      await fetchPayoutHistory(
        from,
        to,
        page
      );
  }

  // ----------------------------------------------------------
  // AUDIT
  // ----------------------------------------------------------

  await writeAuditLog(
    userId,
    "flutterwave_balance_history_view",
    {
      type,
      from,
      to,
      page,
    }
  );

  return result;
}

// ============================================================
// HEALTH CHECK
// ============================================================

async function healthCheck(
  userId: string
) {
  let payoutOk =
    false;

  let collectionOk =
    false;

  let payoutError:
    string | null =
    null;

  let collectionError:
    string | null =
    null;

  // ----------------------------------------------------------
  // PAYOUT
  // ----------------------------------------------------------

  try {
    await fetchPayoutBalance();

    payoutOk =
      true;
  } catch (error: any) {
    payoutError =
      error?.message ??
      "Flutterwave payout wallet unavailable.";
  }

  // ----------------------------------------------------------
  // COLLECTION
  // ----------------------------------------------------------

  try {
    await fetchCollectionBalance(
      defaultFromDate(),
      today()
    );

    collectionOk =
      true;
  } catch (error: any) {
    collectionError =
      error?.message ??
      "Flutterwave settlement data unavailable.";
  }

  await writeAuditLog(
    userId,
    "flutterwave_provider_health_check",
    {
      collectionOk,
      payoutOk,
    }
  );

  return {
    success:
      payoutOk ||
      collectionOk,

    provider:
      "flutterwave",

    environment:
      FLW_BASE_URL.includes(
        "sandbox"
      )
        ? "sandbox"
        : "production",

    collection: {
      available:
        collectionOk,

      source:
        "pending_settlements",

      error:
        collectionError,
    },

    payout: {
      available:
        payoutOk,

      source:
        "f4b_wallet",

      error:
        payoutError,
    },

    encryptionKeyConfigured:
      Boolean(
        FLW_ENCRYPTION_KEY
      ),

    secretKeyConfigured:
      Boolean(
        FLW_SECRET_KEY
      ),

    checkedAt:
      new Date().toISOString(),
  };
}

// ============================================================
// MAIN
// ============================================================

Deno.serve(
  async (request) => {
    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    // --------------------------------------------------------
    // METHODS
    // --------------------------------------------------------

    if (
      request.method !==
        "GET" &&
      request.method !==
        "POST"
    ) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "Method not allowed.",
        },
        405
      );
    }

    try {
      // ------------------------------------------------------
      // ADMIN AUTH
      // ------------------------------------------------------

      const {
        user,
      } =
        await authenticateAdmin(
          request
        );

      const url =
        new URL(
          request.url
        );

      const action =
        url.searchParams.get(
          "action"
        ) ??
        (
          request.method ===
          "POST"
            ? "sync"
            : "balances"
        );

      // ------------------------------------------------------
      // BALANCES
      // ------------------------------------------------------

      if (
        action ===
        "balances"
      ) {
        const result =
          await syncBalances(
            user.id
          );

        return jsonResponse(
          result
        );
      }

      // ------------------------------------------------------
      // SYNC
      // ------------------------------------------------------

      if (
        action ===
        "sync"
      ) {
        const result =
          await syncBalances(
            user.id
          );

        return jsonResponse(
          result
        );
      }

      // ------------------------------------------------------
      // HISTORY
      // ------------------------------------------------------

      if (
        action ===
        "history"
      ) {
        const result =
          await getHistory(
            request,
            user.id
          );

        return jsonResponse(
          result
        );
      }

      // ------------------------------------------------------
      // HEALTH
      // ------------------------------------------------------

      if (
        action ===
        "health"
      ) {
        const result =
          await healthCheck(
            user.id
          );

        return jsonResponse(
          result
        );
      }

      // ------------------------------------------------------
      // UNKNOWN
      // ------------------------------------------------------

      return jsonResponse(
        {
          success:
            false,

          error:
            `Unknown action "${action}".`,
        },
        400
      );
    } catch (error: any) {
      console.error(
        "admin-flutterwave-balance error:",
        error
      );

      const message =
        error?.message ??
        "Unable to communicate with Flutterwave.";

      const lower =
        message.toLowerCase();

      const status =
        lower.includes(
          "authentication required"
        ) ||
        lower.includes(
          "invalid or expired"
        ) ||
        lower.includes(
          "administrator access"
        )
          ? 401
          : 500;

      return jsonResponse(
        {
          success:
            false,

          error:
            message,
        },
        status
      );
    }
  }
);
