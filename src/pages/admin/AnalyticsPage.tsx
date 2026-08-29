import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  Download,
  FileBarChart,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { AdminLayout } from "@/pages/admin/AdminLayout";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// TYPES
// ============================================================

type AnalyticsPeriod =
  | "7"
  | "30"
  | "90"
  | "365"
  | "custom";

type TrendMode =
  | "daily"
  | "weekly"
  | "monthly";

type TrendPoint = {
  period: string;

  transaction_count: number;
  transaction_value: number;

  successful_count: number;
  successful_value: number;

  failed_count: number;
  failed_value: number;

  pending_count: number;
  pending_value: number;

  funding_count: number;
  funding_volume: number;

  transfer_count: number;
  transfer_volume: number;

  bill_payment_count: number;
  bill_payment_volume: number;

  revenue: number;
};

type CustomerGrowthPoint = {
  period: string;
  new_customers: number;
};

type BreakdownItem = {
  category?: string;
  provider?: string;
  status?: string;
  transaction_type?: string;
  count: number;
  volume: number;
};

type AnalyticsSummary = {
  period?: {
    start_at: string;
    end_at: string;
  };

  transactions?: {
    total_count: number;
    successful_count: number;
    failed_count: number;
    pending_count: number;

    total_value: number;
    successful_value: number;
    failed_value: number;
    pending_value: number;
  };

  funding?: {
    count: number;
    volume: number;
  };

  transfers?: {
    count: number;
    volume: number;
  };

  bill_payments?: {
    count: number;
    volume: number;
  };

  internal_transfers?: {
    count: number;
    volume: number;
  };

  revenue?: {
    total: number;
    transfer_fees: number;
    bill_fees: number;
    other_fees: number;
  };
};

type AnalyticsData = {
  summary?: AnalyticsSummary;

  trends?: {
    daily?: {
      data?: TrendPoint[];
    };

    weekly?: {
      data?: TrendPoint[];
    };

    monthly?: {
      data?: TrendPoint[];
    };
  };

  breakdown?: {
    data?: {
      by_category?: BreakdownItem[];
      by_provider?: BreakdownItem[];
      by_status?: BreakdownItem[];
      by_transaction_type?: BreakdownItem[];
    };
  };

  customer_growth?: {
    data?: CustomerGrowthPoint[];
  };

  kyc?: {
    total_users: number;
    verified: number;
    pending: number;
    unverified: number;

    levels?: {
      level_1: number;
      level_2: number;
      level_3: number;
    };

    bvn_verified: number;
  };

  generated_at?: string;
};

// ============================================================
// FORMATTERS
// ============================================================

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat("en-NG", {
  maximumFractionDigits: 0,
});

function money(value: number | null | undefined): string {
  return NGN.format(Number(value || 0));
}

function number(value: number | null | undefined): string {
  return NUMBER.format(Number(value || 0));
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(
  value: number | undefined,
  total: number | undefined,
): number {
  const safeTotal = safeNumber(total);

  if (safeTotal <= 0) {
    return 0;
  }

  return (safeNumber(value) / safeTotal) * 100;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPeriod(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
  });
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  loading = false,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;

  trend?: {
    value: string;
    positive?: boolean;
  };

  loading?: boolean;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              {title}
            </p>

            {loading ? (
              <div className="mt-2 h-8 w-28 animate-pulse rounded-md bg-muted" />
            ) : (
              <p className="mt-2 truncate text-2xl font-bold tracking-tight">
                {value}
              </p>
            )}

            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}

            {trend && (
              <div
                className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${
                  trend.positive === false
                    ? "text-destructive"
                    : "text-emerald-600"
                }`}
              >
                {trend.positive === false ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                )}

                {trend.value}
              </div>
            )}
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// SECTION HEADER
// ============================================================

function SectionHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {Icon && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4.5 w-4.5" />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
      <BarChart3 className="mb-3 h-8 w-8 text-muted-foreground/50" />

      <p className="font-medium">{title}</p>

      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

// ============================================================
// PROGRESS BAR
// ============================================================

function ProgressBar({
  value,
  label,
  count,
  total,
  volume,
}: {
  value: number;
  label: string;
  count: number;
  total: number;
  volume?: number;
}) {
  const percent = Math.min(
    100,
    Math.max(0, safeNumber(value)),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">
          {label}
        </span>

        <span className="shrink-0 text-xs text-muted-foreground">
          {number(count)} ({percent.toFixed(1)}%)
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{
            width: `${percent}%`,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{number(total)} total</span>

        {volume !== undefined && (
          <span>{money(volume)}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TREND CHART
// ============================================================

function TrendChart({
  data,
  valueKey,
  title,
  formatter = money,
}: {
  data: TrendPoint[];

  valueKey:
    | "transaction_value"
    | "successful_value"
    | "funding_volume"
    | "transfer_volume"
    | "bill_payment_volume"
    | "revenue";

  title: string;

  formatter?: (value: number) => string;
}) {
  if (!data.length) {
    return (
      <EmptyState
        title="No trend data"
        description="There is no transaction activity for the selected period."
      />
    );
  }

  const values = data.map((item) =>
    safeNumber(item[valueKey]),
  );

  const max = Math.max(...values, 1);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>

        <p className="text-xs text-muted-foreground">
          {data.length} periods
        </p>
      </div>

      <div className="flex h-64 items-end gap-1.5 overflow-hidden">
        {data.map((item, index) => {
          const value = safeNumber(
            item[valueKey],
          );

          const height =
            value <= 0
              ? 2
              : Math.max(
                  4,
                  (value / max) * 100,
                );

          const showLabel =
            data.length <= 14 ||
            index === 0 ||
            index === data.length - 1 ||
            index %
                Math.max(
                  1,
                  Math.ceil(data.length / 7),
                ) ===
              0;

          return (
            <div
              key={`${item.period}-${index}`}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${formatDate(
                item.period,
              )}: ${formatter(value)}`}
            >
              <div
                className="mb-1 w-full max-w-[26px] rounded-t-sm bg-foreground/80 transition-all group-hover:bg-foreground"
                style={{
                  height: `${height}%`,
                }}
              />

              {showLabel && (
                <span className="mt-2 truncate text-[9px] text-muted-foreground">
                  {formatPeriod(item.period)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// CUSTOMER GROWTH CHART
// ============================================================

function CustomerGrowthChart({
  data,
}: {
  data: CustomerGrowthPoint[];
}) {
  if (!data.length) {
    return (
      <EmptyState
        title="No customer growth data"
        description="No new customer registrations were recorded during this period."
      />
    );
  }

  const values = data.map((item) =>
    safeNumber(item.new_customers),
  );

  const max = Math.max(...values, 1);

  const totalNew = values.reduce(
    (sum, value) => sum + value,
    0,
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-medium">
          New customers
        </p>

        <p className="text-xs text-muted-foreground">
          {number(totalNew)} new
        </p>
      </div>

      <div className="flex h-64 items-end gap-1.5 overflow-hidden">
        {data.map((item, index) => {
          const value = safeNumber(
            item.new_customers,
          );

          const height =
            value <= 0
              ? 2
              : Math.max(
                  4,
                  (value / max) * 100,
                );

          const showLabel =
            data.length <= 14 ||
            index === 0 ||
            index === data.length - 1 ||
            index %
                Math.max(
                  1,
                  Math.ceil(data.length / 7),
                ) ===
              0;

          return (
            <div
              key={`${item.period}-${index}`}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${formatDate(
                item.period,
              )}: ${number(value)} customers`}
            >
              <div
                className="mb-1 w-full max-w-[26px] rounded-t-sm bg-foreground/80 transition-all group-hover:bg-foreground"
                style={{
                  height: `${height}%`,
                }}
              />

              {showLabel && (
                <span className="mt-2 truncate text-[9px] text-muted-foreground">
                  {formatPeriod(item.period)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MAIN ANALYTICS PAGE
// ============================================================

function AnalyticsPage() {
  const [analytics, setAnalytics] =
    useState<AnalyticsData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [period, setPeriod] =
    useState<AnalyticsPeriod>("30");

  const [customStart, setCustomStart] =
    useState("");

  const [customEnd, setCustomEnd] =
    useState("");

  const [trendMode, setTrendMode] =
    useState<TrendMode>("daily");

  // ==========================================================
  // DATE RANGE
  // ==========================================================

  const dateRange = useMemo(() => {
    const end = new Date();

    if (period === "custom") {
      if (!customStart || !customEnd) {
        return null;
      }

      const start = new Date(
        `${customStart}T00:00:00`,
      );

      const customEndDate = new Date(
        `${customEnd}T23:59:59`,
      );

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(
          customEndDate.getTime(),
        )
      ) {
        return null;
      }

      if (start > customEndDate) {
        return null;
      }

      return {
        start,
        end: customEndDate,
      };
    }

    const days = Number(period);

    const start = new Date(end);

    start.setDate(
      start.getDate() - days,
    );

    return {
      start,
      end,
    };
  }, [
    period,
    customStart,
    customEnd,
  ]);

  // ==========================================================
  // LOAD ANALYTICS
  // ==========================================================

  const loadAnalytics = useCallback(
    async (showRefresh = false) => {
      if (!dateRange) {
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "admin_analytics_dashboard",
          {
            p_start_at:
              dateRange.start.toISOString(),

            p_end_at:
              dateRange.end.toISOString(),
          },
        );

        if (rpcError) {
          throw rpcError;
        }

        setAnalytics(
          (data || null) as AnalyticsData | null,
        );
      } catch (err) {
        console.error(
          "Analytics loading error:",
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load analytics.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange],
  );

  // ==========================================================
  // LOAD WHEN FILTER CHANGES
  // ==========================================================

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    void loadAnalytics(false);
  }, [
    dateRange,
    loadAnalytics,
  ]);

  // ==========================================================
  // DATA REFERENCES
  // ==========================================================

  const summary =
    analytics?.summary;

  const transactions =
    summary?.transactions;

  const funding =
    summary?.funding;

  const transfers =
    summary?.transfers;

  const billPayments =
    summary?.bill_payments;

  const internalTransfers =
    summary?.internal_transfers;

  const revenue =
    summary?.revenue;

  const breakdown =
    analytics?.breakdown?.data;

  const kyc =
    analytics?.kyc;

  const customerGrowth =
    analytics?.customer_growth?.data || [];

  // ==========================================================
  // TREND DATA
  // ==========================================================

  const trendData = useMemo(() => {
    return (
      analytics?.trends?.[trendMode]
        ?.data || []
    );
  }, [
    analytics,
    trendMode,
  ]);

  // ==========================================================
  // SUCCESS / FAILURE / PENDING
  // ==========================================================

  const successRate = useMemo(() => {
    return percentage(
      transactions?.successful_count,
      transactions?.total_count,
    );
  }, [transactions]);

  const failureRate = useMemo(() => {
    return percentage(
      transactions?.failed_count,
      transactions?.total_count,
    );
  }, [transactions]);

  const pendingRate = useMemo(() => {
    return percentage(
      transactions?.pending_count,
      transactions?.total_count,
    );
  }, [transactions]);

  // ==========================================================
  // KYC RATES
  // ==========================================================

  const kycVerifiedRate =
    useMemo(() => {
      return percentage(
        kyc?.verified,
        kyc?.total_users,
      );
    }, [kyc]);

  const bvnVerifiedRate =
    useMemo(() => {
      return percentage(
        kyc?.bvn_verified,
        kyc?.total_users,
      );
    }, [kyc]);

  // ==========================================================
  // BREAKDOWN TOTALS
  // ==========================================================

  const categoryTotal =
    useMemo(() => {
      return (
        breakdown?.by_category?.reduce(
          (total, item) =>
            total +
            safeNumber(item.count),
          0,
        ) || 0
      );
    }, [breakdown]);

  const providerTotal =
    useMemo(() => {
      return (
        breakdown?.by_provider?.reduce(
          (total, item) =>
            total +
            safeNumber(item.count),
          0,
        ) || 0
      );
    }, [breakdown]);

  const transactionTypeTotal =
    useMemo(() => {
      return (
        breakdown?.by_transaction_type?.reduce(
          (total, item) =>
            total +
            safeNumber(item.count),
          0,
        ) || 0
      );
    }, [breakdown]);

  // ==========================================================
  // CSV EXPORT
  // ==========================================================

  const exportAnalyticsCsv =
    useCallback(() => {
      if (!analytics) {
        return;
      }

      const rows: string[][] = [];

      const addSection = (
        title: string,
      ) => {
        if (rows.length > 0) {
          rows.push([]);
        }

        rows.push([title]);
      };

      const addRow = (
        label: string,
        value:
          | string
          | number
          | null
          | undefined,
      ) => {
        rows.push([
          label,
          value === null ||
          value === undefined
            ? ""
            : String(value),
        ]);
      };

      const addHeaders = (
        ...headers: string[]
      ) => {
        rows.push(headers);
      };

      // --------------------------------------------------------
      // REPORT INFORMATION
      // --------------------------------------------------------

      addSection(
        "IYANJUPAY ANALYTICS REPORT",
      );

      addRow(
        "Report Generated",
        analytics.generated_at
          ? formatDateTime(
              analytics.generated_at,
            )
          : new Date().toLocaleString(
              "en-NG",
            ),
      );

      addRow(
        "Period Start",
        summary?.period?.start_at
          ? formatDateTime(
              summary.period.start_at,
            )
          : "",
      );

      addRow(
        "Period End",
        summary?.period?.end_at
          ? formatDateTime(
              summary.period.end_at,
            )
          : "",
      );

      // --------------------------------------------------------
      // TRANSACTIONS
      // --------------------------------------------------------

      addSection(
        "TRANSACTION SUMMARY",
      );

      addRow(
        "Total Transactions",
        transactions?.total_count || 0,
      );

      addRow(
        "Successful Transactions",
        transactions?.successful_count ||
          0,
      );

      addRow(
        "Failed Transactions",
        transactions?.failed_count || 0,
      );

      addRow(
        "Pending Transactions",
        transactions?.pending_count || 0,
      );

      addRow(
        "Total Transaction Value",
        transactions?.total_value || 0,
      );

      addRow(
        "Successful Transaction Value",
        transactions?.successful_value ||
          0,
      );

      addRow(
        "Failed Transaction Value",
        transactions?.failed_value || 0,
      );

      addRow(
        "Pending Transaction Value",
        transactions?.pending_value || 0,
      );

      addRow(
        "Success Rate",
        `${successRate.toFixed(2)}%`,
      );

      addRow(
        "Failure Rate",
        `${failureRate.toFixed(2)}%`,
      );

      addRow(
        "Pending Rate",
        `${pendingRate.toFixed(2)}%`,
      );

      // --------------------------------------------------------
      // FUNDING
      // --------------------------------------------------------

      addSection("FUNDING");

      addRow(
        "Funding Transactions",
        funding?.count || 0,
      );

      addRow(
        "Funding Volume",
        funding?.volume || 0,
      );

      // --------------------------------------------------------
      // BANK TRANSFERS
      // --------------------------------------------------------

      addSection("BANK TRANSFERS");

      addRow(
        "Transfer Transactions",
        transfers?.count || 0,
      );

      addRow(
        "Transfer Volume",
        transfers?.volume || 0,
      );

      // --------------------------------------------------------
      // BILL PAYMENTS
      // --------------------------------------------------------

      addSection("BILL PAYMENTS");

      addRow(
        "Bill Payment Transactions",
        billPayments?.count || 0,
      );

      addRow(
        "Bill Payment Volume",
        billPayments?.volume || 0,
      );

      // --------------------------------------------------------
      // INTERNAL TRANSFERS
      // --------------------------------------------------------

      addSection(
        "INTERNAL IYANJUPAY TRANSFERS",
      );

      addRow(
        "Internal Transfer Transactions",
        internalTransfers?.count || 0,
      );

      addRow(
        "Internal Transfer Volume",
        internalTransfers?.volume || 0,
      );

      // --------------------------------------------------------
      // REVENUE
      // --------------------------------------------------------

      addSection("REVENUE");

      addRow(
        "Total Revenue",
        revenue?.total || 0,
      );

      addRow(
        "Transfer Fees",
        revenue?.transfer_fees || 0,
      );

      addRow(
        "Bill Payment Fees",
        revenue?.bill_fees || 0,
      );

      addRow(
        "Other Fees",
        revenue?.other_fees || 0,
      );

      const trendHeaders = [
        "Period",
        "Transaction Count",
        "Transaction Value",
        "Successful Count",
        "Successful Value",
        "Failed Count",
        "Failed Value",
        "Pending Count",
        "Pending Value",
        "Funding Count",
        "Funding Volume",
        "Transfer Count",
        "Transfer Volume",
        "Bill Payment Count",
        "Bill Payment Volume",
        "Revenue",
      ];

      const addTrendSection = (
        title: string,
        data: TrendPoint[],
      ) => {
        addSection(title);
        addHeaders(...trendHeaders);

        data.forEach((item) => {
          rows.push([
            item.period,
            String(
              item.transaction_count || 0,
            ),
            String(
              item.transaction_value || 0,
            ),
            String(
              item.successful_count || 0,
            ),
            String(
              item.successful_value || 0,
            ),
            String(
              item.failed_count || 0,
            ),
            String(
              item.failed_value || 0,
            ),
            String(
              item.pending_count || 0,
            ),
            String(
              item.pending_value || 0,
            ),
            String(
              item.funding_count || 0,
            ),
            String(
              item.funding_volume || 0,
            ),
            String(
              item.transfer_count || 0,
            ),
            String(
              item.transfer_volume || 0,
            ),
            String(
              item.bill_payment_count || 0,
            ),
            String(
              item.bill_payment_volume || 0,
            ),
            String(
              item.revenue || 0,
            ),
          ]);
        });
      };

      addTrendSection(
        "DAILY TRENDS",
        analytics.trends?.daily?.data || [],
      );

      addTrendSection(
        "WEEKLY TRENDS",
        analytics.trends?.weekly?.data || [],
      );

      addTrendSection(
        "MONTHLY TRENDS",
        analytics.trends?.monthly?.data || [],
      );

      // --------------------------------------------------------
      // BREAKDOWN
      // --------------------------------------------------------

      addSection(
        "BREAKDOWN - CATEGORY",
      );

      addHeaders(
        "Category",
        "Transaction Count",
        "Volume",
        "Percentage",
      );

      (
        breakdown?.by_category || []
      ).forEach((item) => {
        rows.push([
          item.category || "uncategorized",
          String(item.count || 0),
          String(item.volume || 0),
          `${percentage(
            item.count,
            categoryTotal,
          ).toFixed(2)}%`,
        ]);
      });

      addSection(
        "BREAKDOWN - PROVIDER",
      );

      addHeaders(
        "Provider",
        "Transaction Count",
        "Volume",
        "Percentage",
      );

      (
        breakdown?.by_provider || []
      ).forEach((item) => {
        rows.push([
          item.provider || "unknown",
          String(item.count || 0),
          String(item.volume || 0),
          `${percentage(
            item.count,
            providerTotal,
          ).toFixed(2)}%`,
        ]);
      });

      addSection(
        "BREAKDOWN - STATUS",
      );

      addHeaders(
        "Status",
        "Transaction Count",
        "Volume",
        "Percentage",
      );

      (
        breakdown?.by_status || []
      ).forEach((item) => {
        rows.push([
          item.status || "unknown",
          String(item.count || 0),
          String(item.volume || 0),
          `${percentage(
            item.count,
            transactions?.total_count || 0,
          ).toFixed(2)}%`,
        ]);
      });

      addSection(
        "BREAKDOWN - TRANSACTION TYPE",
      );

      addHeaders(
        "Transaction Type",
        "Transaction Count",
        "Volume",
        "Percentage",
      );

      (
        breakdown?.by_transaction_type || []
      ).forEach((item) => {
        rows.push([
          item.transaction_type || "unknown",
          String(item.count || 0),
          String(item.volume || 0),
          `${percentage(
            item.count,
            transactionTypeTotal,
          ).toFixed(2)}%`,
        ]);
      });

      // --------------------------------------------------------
      // CUSTOMER GROWTH
      // --------------------------------------------------------

      addSection("CUSTOMER GROWTH");

      addHeaders(
        "Period",
        "New Customers",
      );

      (
        analytics.customer_growth?.data ||
        []
      ).forEach((item) => {
        rows.push([
          item.period,
          String(
            item.new_customers || 0,
          ),
        ]);
      });

      // --------------------------------------------------------
      // KYC
      // --------------------------------------------------------

      addSection("KYC OVERVIEW");

      addRow(
        "Total Users",
        kyc?.total_users || 0,
      );

      addRow(
        "Verified Users",
        kyc?.verified || 0,
      );

      addRow(
        "Pending KYC",
        kyc?.pending || 0,
      );

      addRow(
        "Unverified Users",
        kyc?.unverified || 0,
      );

      addRow(
        "BVN Verified",
        kyc?.bvn_verified || 0,
      );

      addRow(
        "KYC Verified Rate",
        `${kycVerifiedRate.toFixed(2)}%`,
      );

      addRow(
        "BVN Verified Rate",
        `${bvnVerifiedRate.toFixed(2)}%`,
      );

      // --------------------------------------------------------
      // KYC LEVELS
      // --------------------------------------------------------

      addSection(
        "KYC LEVEL DISTRIBUTION",
      );

      addHeaders(
        "KYC Level",
        "Users",
        "Percentage",
      );

      rows.push([
        "Level 1",
        String(
          kyc?.levels?.level_1 || 0,
        ),
        `${percentage(
          kyc?.levels?.level_1,
          kyc?.total_users,
        ).toFixed(2)}%`,
      ]);

      rows.push([
        "Level 2",
        String(
          kyc?.levels?.level_2 || 0,
        ),
        `${percentage(
          kyc?.levels?.level_2,
          kyc?.total_users,
        ).toFixed(2)}%`,
      ]);

      rows.push([
        "Level 3",
        String(
          kyc?.levels?.level_3 || 0,
        ),
        `${percentage(
          kyc?.levels?.level_3,
          kyc?.total_users,
        ).toFixed(2)}%`,
      ]);

      // --------------------------------------------------------
      // CSV ESCAPE
      // --------------------------------------------------------

      const csvEscape = (
        value: string,
      ) => {
        if (
          value.includes(",") ||
          value.includes('"') ||
          value.includes("\n") ||
          value.includes("\r")
        ) {
          return `"${value.replace(
            /"/g,
            '""',
          )}"`;
        }

        return value;
      };

      const csvContent =
        "\uFEFF" +
        rows
          .map((row) =>
            row
              .map((value) =>
                csvEscape(
                  String(value ?? ""),
                ),
              )
              .join(","),
          )
          .join("\r\n");

      // --------------------------------------------------------
      // DOWNLOAD
      // --------------------------------------------------------

      const blob = new Blob(
        [csvContent],
        {
          type: "text/csv;charset=utf-8;",
        },
      );

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      const timestamp =
        new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);

      anchor.href = url;

      anchor.download =
        `iyanjupay-analytics-${timestamp}.csv`;

      document.body.appendChild(anchor);

      anchor.click();

      document.body.removeChild(anchor);

      URL.revokeObjectURL(url);
    }, [
      analytics,
      summary,
      transactions,
      funding,
      transfers,
      billPayments,
      internalTransfers,
      revenue,
      breakdown,
      kyc,
      successRate,
      failureRate,
      pendingRate,
      kycVerifiedRate,
      bvnVerifiedRate,
      categoryTotal,
      providerTotal,
      transactionTypeTotal,
    ]);

  // ==========================================================
  // ERROR SCREEN
  // ==========================================================

  if (
    error &&
    !analytics &&
    !loading
  ) {
    return (
      <AdminLayout>
        <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">
                Analytics
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Monitor IyanjuPay transaction
                performance, revenue, customers,
                and KYC activity.
              </p>
            </div>

            <Card className="border-destructive/30">
              <CardContent className="flex flex-col items-center justify-center p-10 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>

                <h2 className="text-lg font-semibold">
                  Unable to load analytics
                </h2>

                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  {error}
                </p>

                <Button
                  className="mt-5"
                  onClick={() =>
                    void loadAnalytics(true)
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ==========================================================
  // MAIN RENDER
  // ==========================================================

  return (
    <AdminLayout>
      <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* ====================================================
              HEADER
          ==================================================== */}

          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                  <BarChart3 className="h-5 w-5" />
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                    Analytics
                  </h1>

                  <p className="mt-1 text-sm text-muted-foreground">
                    IyanjuPay platform performance,
                    transaction activity and
                    financial insights
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={period}
                onValueChange={(value) =>
                  setPeriod(
                    value as AnalyticsPeriod,
                  )
                }
              >
                <SelectTrigger className="w-full sm:w-[165px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="7">
                    Last 7 days
                  </SelectItem>

                  <SelectItem value="30">
                    Last 30 days
                  </SelectItem>

                  <SelectItem value="90">
                    Last 90 days
                  </SelectItem>

                  <SelectItem value="365">
                    Last 12 months
                  </SelectItem>

                  <SelectItem value="custom">
                    Custom range
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() =>
                  void loadAnalytics(true)
                }
                disabled={
                  loading ||
                  refreshing ||
                  !dateRange
                }
              >
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}

                Refresh
              </Button>

              <Button
                variant="outline"
                onClick={exportAnalyticsCsv}
                disabled={
                  !analytics ||
                  loading ||
                  refreshing
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* ====================================================
              CUSTOM DATE RANGE
          ==================================================== */}

          {period === "custom" && (
            <Card>
              <CardContent className="p-4">
                <div className="grid gap-4 md:grid-cols-3 md:items-end">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Start date
                    </label>

                    <Input
                      type="date"
                      value={customStart}
                      onChange={(event) =>
                        setCustomStart(
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      End date
                    </label>

                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(event) =>
                        setCustomEnd(
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {!customStart ||
                    !customEnd ? (
                      "Select both dates to load analytics."
                    ) : dateRange ? (
                      <>
                        Showing{" "}
                        <strong>
                          {formatDate(
                            dateRange.start,
                          )}
                        </strong>{" "}
                        to{" "}
                        <strong>
                          {formatDate(
                            dateRange.end,
                          )}
                        </strong>
                      </>
                    ) : (
                      <span className="text-destructive">
                        Invalid date range.
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ====================================================
              PERIOD
          ==================================================== */}

          {summary?.period && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>Reporting period:</span>

              <span className="font-medium text-foreground">
                {formatDate(
                  summary.period.start_at,
                )}
              </span>

              <span>—</span>

              <span className="font-medium text-foreground">
                {formatDate(
                  summary.period.end_at,
                )}
              </span>

              {analytics?.generated_at && (
                <>
                  <span className="mx-1 hidden sm:inline">
                    •
                  </span>

                  <span>
                    Updated{" "}
                    {formatDateTime(
                      analytics.generated_at,
                    )}
                  </span>
                </>
              )}
            </div>
          )}

          {/* ====================================================
              PRIMARY KPI
          ==================================================== */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Transaction volume"
              value={
                loading
                  ? "..."
                  : money(
                      transactions?.total_value,
                    )
              }
              subtitle={`${number(
                transactions?.total_count,
              )} transactions`}
              icon={Activity}
              loading={loading}
            />

            <StatCard
              title="Successful value"
              value={
                loading
                  ? "..."
                  : money(
                      transactions?.successful_value,
                    )
              }
              subtitle={`${successRate.toFixed(
                1,
              )}% success rate`}
              icon={CheckCircle2}
              loading={loading}
            />

            <StatCard
              title="Total revenue"
              value={
                loading
                  ? "..."
                  : money(revenue?.total)
              }
              subtitle="IyanjuPay fees generated"
              icon={TrendingUp}
              loading={loading}
            />

            <StatCard
              title="Total customers"
              value={
                loading
                  ? "..."
                  : number(
                      kyc?.total_users,
                    )
              }
              subtitle="Registered platform users"
              icon={Users}
              loading={loading}
            />
          </div>

          {/* ====================================================
              TRANSACTION PERFORMANCE
          ==================================================== */}

          <section>
            <SectionHeader
              title="Transaction performance"
              description="Overall transaction outcome and value distribution."
              icon={Activity}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Successful"
                value={number(
                  transactions?.successful_count,
                )}
                subtitle={money(
                  transactions?.successful_value,
                )}
                icon={CheckCircle2}
              />

              <StatCard
                title="Pending"
                value={number(
                  transactions?.pending_count,
                )}
                subtitle={`${pendingRate.toFixed(
                  1,
                )}% of transactions`}
                icon={Clock3}
              />

              <StatCard
                title="Failed"
                value={number(
                  transactions?.failed_count,
                )}
                subtitle={`${failureRate.toFixed(
                  1,
                )}% of transactions`}
                icon={XCircle}
              />

              <StatCard
                title="Success rate"
                value={`${successRate.toFixed(
                  1,
                )}%`}
                subtitle={`${number(
                  transactions?.successful_count,
                )} successful`}
                icon={ShieldCheck}
              />
            </div>
          </section>

          {/* ====================================================
              FINANCIAL ACTIVITY
          ==================================================== */}

          <section>
            <SectionHeader
              title="Financial activity"
              description="Breakdown of major IyanjuPay transaction channels."
              icon={Wallet}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Wallet className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Funding
                      </p>

                      <p className="text-xl font-bold">
                        {money(
                          funding?.volume,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {number(
                      funding?.count,
                    )}{" "}
                    successful funding
                    transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <CreditCard className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Bank transfers
                      </p>

                      <p className="text-xl font-bold">
                        {money(
                          transfers?.volume,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {number(
                      transfers?.count,
                    )}{" "}
                    successful transfers
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <FileBarChart className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Bill payments
                      </p>

                      <p className="text-xl font-bold">
                        {money(
                          billPayments?.volume,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {number(
                      billPayments?.count,
                    )}{" "}
                    successful payments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <ArrowUpRight className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Internal transfers
                      </p>

                      <p className="text-xl font-bold">
                        {money(
                          internalTransfers?.volume,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {number(
                      internalTransfers?.count,
                    )}{" "}
                    successful transfers
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ====================================================
              REVENUE
          ==================================================== */}

          <section>
            <SectionHeader
              title="Revenue"
              description="IyanjuPay revenue generated from applicable transaction fees."
              icon={TrendingUp}
            />

            <Card>
              <CardContent className="p-5">
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total revenue
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {money(revenue?.total)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">
                      Transfer fees
                    </p>

                    <p className="mt-1 text-xl font-semibold">
                      {money(
                        revenue?.transfer_fees,
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">
                      Bill fees
                    </p>

                    <p className="mt-1 text-xl font-semibold">
                      {money(
                        revenue?.bill_fees,
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">
                      Other fees
                    </p>

                    <p className="mt-1 text-xl font-semibold">
                      {money(
                        revenue?.other_fees,
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ====================================================
              TRANSACTION TRENDS
          ==================================================== */}

          <section>
            <SectionHeader
              title="Transaction trends"
              description="Track transaction activity and value over time."
              icon={BarChart3}
            />

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  Transaction value
                </CardTitle>

                <Select
                  value={trendMode}
                  onValueChange={(value) =>
                    setTrendMode(
                      value as TrendMode,
                    )
                  }
                >
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="daily">
                      Daily
                    </SelectItem>

                    <SelectItem value="weekly">
                      Weekly
                    </SelectItem>

                    <SelectItem value="monthly">
                      Monthly
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>

              <CardContent>
                <TrendChart
                  data={trendData}
                  valueKey="transaction_value"
                  title={`${titleCase(
                    trendMode,
                  )} transaction value`}
                />
              </CardContent>
            </Card>
          </section>

          {/* ====================================================
              REVENUE + SUCCESSFUL VALUE
          ==================================================== */}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Revenue trend
                </CardTitle>
              </CardHeader>

              <CardContent>
                <TrendChart
                  data={trendData}
                  valueKey="revenue"
                  title="Revenue generated"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Successful transaction value
                </CardTitle>
              </CardHeader>

              <CardContent>
                <TrendChart
                  data={trendData}
                  valueKey="successful_value"
                  title="Successful transaction value"
                />
              </CardContent>
            </Card>
          </div>

          {/* ====================================================
              FUNDING + TRANSFER TRENDS
          ==================================================== */}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Funding trend
                </CardTitle>
              </CardHeader>

              <CardContent>
                <TrendChart
                  data={trendData}
                  valueKey="funding_volume"
                  title="Funding volume"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Transfer trend
                </CardTitle>
              </CardHeader>

              <CardContent>
                <TrendChart
                  data={trendData}
                  valueKey="transfer_volume"
                  title="Transfer volume"
                />
              </CardContent>
            </Card>
          </div>

          {/* ====================================================
              BREAKDOWN
          ==================================================== */}

          <section>
            <SectionHeader
              title="Transaction breakdown"
              description="Understand where transaction activity is coming from."
              icon={Database}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    By category
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  {!breakdown?.by_category
                    ?.length ? (
                    <EmptyState
                      title="No category data"
                      description="No categorized transactions were found for this period."
                    />
                  ) : (
                    breakdown.by_category
                      .slice(0, 8)
                      .map((item) => (
                        <ProgressBar
                          key={
                            item.category ||
                            "unknown"
                          }
                          label={titleCase(
                            item.category ||
                              "uncategorized",
                          )}
                          count={safeNumber(
                            item.count,
                          )}
                          total={
                            categoryTotal
                          }
                          value={percentage(
                            item.count,
                            categoryTotal,
                          )}
                          volume={safeNumber(
                            item.volume,
                          )}
                        />
                      ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    By provider
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  {!breakdown?.by_provider
                    ?.length ? (
                    <EmptyState
                      title="No provider data"
                      description="No provider information was found for this period."
                    />
                  ) : (
                    breakdown.by_provider
                      .slice(0, 8)
                      .map((item) => (
                        <ProgressBar
                          key={
                            item.provider ||
                            "unknown"
                          }
                          label={titleCase(
                            item.provider ||
                              "unknown",
                          )}
                          count={safeNumber(
                            item.count,
                          )}
                          total={
                            providerTotal
                          }
                          value={percentage(
                            item.count,
                            providerTotal,
                          )}
                          volume={safeNumber(
                            item.volume,
                          )}
                        />
                      ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    By status
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  {!breakdown?.by_status
                    ?.length ? (
                    <EmptyState
                      title="No status data"
                      description="No transaction status data was found."
                    />
                  ) : (
                    breakdown.by_status
                      .slice(0, 8)
                      .map((item) => (
                        <ProgressBar
                          key={
                            item.status ||
                            "unknown"
                          }
                          label={titleCase(
                            item.status ||
                              "unknown",
                          )}
                          count={safeNumber(
                            item.count,
                          )}
                          total={safeNumber(
                            transactions?.total_count,
                          )}
                          value={percentage(
                            item.count,
                            transactions?.total_count,
                          )}
                          volume={safeNumber(
                            item.volume,
                          )}
                        />
                      ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    By transaction type
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  {!breakdown?.by_transaction_type
                    ?.length ? (
                    <EmptyState
                      title="No transaction type data"
                      description="No transaction type information was found for this period."
                    />
                  ) : (
                    breakdown.by_transaction_type
                      .slice(0, 8)
                      .map((item) => (
                        <ProgressBar
                          key={
                            item.transaction_type ||
                            "unknown"
                          }
                          label={titleCase(
                            item.transaction_type ||
                              "unknown",
                          )}
                          count={safeNumber(
                            item.count,
                          )}
                          total={
                            transactionTypeTotal
                          }
                          value={percentage(
                            item.count,
                            transactionTypeTotal,
                          )}
                          volume={safeNumber(
                            item.volume,
                          )}
                        />
                      ))
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ====================================================
              CUSTOMER GROWTH
          ==================================================== */}

          <section>
            <SectionHeader
              title="Customer growth"
              description="New customer registrations during the selected period."
              icon={Users}
            />

            <Card>
              <CardContent className="p-5">
                <CustomerGrowthChart
                  data={customerGrowth}
                />
              </CardContent>
            </Card>
          </section>

          {/* ====================================================
              KYC
          ==================================================== */}

          <section>
            <SectionHeader
              title="KYC overview"
              description="Customer verification and KYC-level distribution."
              icon={ShieldCheck}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Verification status
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ProgressBar
                    label="Verified"
                    count={safeNumber(
                      kyc?.verified,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={
                      kycVerifiedRate
                    }
                  />

                  <ProgressBar
                    label="Pending"
                    count={safeNumber(
                      kyc?.pending,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={percentage(
                      kyc?.pending,
                      kyc?.total_users,
                    )}
                  />

                  <ProgressBar
                    label="Unverified"
                    count={safeNumber(
                      kyc?.unverified,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={percentage(
                      kyc?.unverified,
                      kyc?.total_users,
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    KYC levels
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ProgressBar
                    label="Level 1"
                    count={safeNumber(
                      kyc?.levels?.level_1,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={percentage(
                      kyc?.levels?.level_1,
                      kyc?.total_users,
                    )}
                  />

                  <ProgressBar
                    label="Level 2"
                    count={safeNumber(
                      kyc?.levels?.level_2,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={percentage(
                      kyc?.levels?.level_2,
                      kyc?.total_users,
                    )}
                  />

                  <ProgressBar
                    label="Level 3"
                    count={safeNumber(
                      kyc?.levels?.level_3,
                    )}
                    total={safeNumber(
                      kyc?.total_users,
                    )}
                    value={percentage(
                      kyc?.levels?.level_3,
                      kyc?.total_users,
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* KYC KPI */}

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total users"
                value={number(
                  kyc?.total_users,
                )}
                subtitle="All registered users"
                icon={Users}
              />

              <StatCard
                title="Verified users"
                value={number(
                  kyc?.verified,
                )}
                subtitle={`${kycVerifiedRate.toFixed(
                  1,
                )}% verified`}
                icon={CheckCircle2}
              />

              <StatCard
                title="Pending KYC"
                value={number(
                  kyc?.pending,
                )}
                subtitle="Awaiting verification"
                icon={Clock3}
              />

              <StatCard
                title="BVN verified"
                value={number(
                  kyc?.bvn_verified,
                )}
                subtitle={`${bvnVerifiedRate.toFixed(
                  1,
                )}% of users`}
                icon={ShieldCheck}
              />
            </div>
          </section>

          {/* ====================================================
              FOOTER
          ==================================================== */}

          <div className="border-t pt-6">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />

                <span>
                  Analytics are calculated from the
                  existing IyanjuPay transactions and
                  customer records.
                </span>
              </div>

              {analytics?.generated_at && (
                <span>
                  Last generated{" "}
                  {formatDateTime(
                    analytics.generated_at,
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AnalyticsPage;
