import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  FileSearch,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ================================================================
   TYPES
   ================================================================ */

interface ReconciliationRow {
  id: string;
  transaction_id: string;

  provider_record_id?: string | null;

  internal_reference?: string | null;
  provider_reference?: string | null;

  amount: number | string;
  provider_amount?: number | string | null;
  amount_difference?: number | string | null;

  currency?: string | null;

  internal_status?: string | null;
  provider_status?: string | null;

  transaction_type?: string | null;
  category?: string | null;
  provider?: string | null;

  user_id: string;

  state: string;
  issue_type?: string | null;

  provider_reference_match?: boolean | null;
  internal_reference_match?: boolean | null;
  amount_match?: boolean | null;
  status_match?: boolean | null;

  refund_status?: string | null;

  reconciliation_required?: boolean | null;

  created_at?: string | null;
  updated_at?: string | null;

  total_count?: number | string | null;

  [key: string]: any;
}

interface ReconciliationSummary {
  total_records: number;
  matched_count: number;
  unmatched_count: number;
  discrepancy_count: number;
  investigating_count: number;
  resolved_count: number;
  pending_transfer_count: number;
  refund_pending_count: number;
  discrepancy_amount: number;
}

interface ReconciliationDetail {
  transaction: Record<string, any> | null;
  provider: Record<string, any> | null;
  case: Record<string, any> | null;
  events: Array<Record<string, any>>;
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const PAGE_SIZE = 25;

/* ================================================================
   HELPERS
   ================================================================ */

const asNumber = (
  value: unknown,
  fallback = 0,
): number => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const asBoolean = (
  value: unknown,
): boolean => {
  if (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "t" ||
    value === "1"
  ) {
    return true;
  }

  return false;
};

const unwrapRpc = <T,>(
  data: T | T[] | null,
): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0
      ? data[0]
      : null;
  }

  return data ?? null;
};

/* ================================================================
   MONEY
   ================================================================ */

const formatMoney = (
  amount: number | string | null | undefined,
  currency = "NGN",
) => {
  const safeCurrency =
    currency || "NGN";

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    },
  ).format(
    asNumber(amount),
  );
};

/* ================================================================
   DATE
   ================================================================ */

const formatDate = (
  value: string | null | undefined,
) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
};

/* ================================================================
   LABEL
   ================================================================ */

const labelize = (
  value: string | null | undefined,
) => {
  if (!value) {
    return "—";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
};

/* ================================================================
   STATE CLASSES
   ================================================================ */

const stateClasses = (
  state: string | null | undefined,
) => {
  switch (
    String(state || "")
      .toLowerCase()
  ) {
    case "matched":
      return "bg-green-100 text-green-700";

    case "unmatched":
      return "bg-yellow-100 text-yellow-700";

    case "discrepancy":
      return "bg-red-100 text-red-700";

    case "investigating":
      return "bg-blue-100 text-blue-700";

    case "resolved":
      return "bg-purple-100 text-purple-700";

    case "refunded":
      return "bg-green-100 text-green-700";

    case "refund_pending":
      return "bg-orange-100 text-orange-700";

    case "pending":
      return "bg-orange-100 text-orange-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};

/* ================================================================
   STATE ICON
   ================================================================ */

const stateIcon = (
  state: string | null | undefined,
) => {
  switch (
    String(state || "")
      .toLowerCase()
  ) {
    case "matched":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "unmatched":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    case "discrepancy":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    case "investigating":
      return (
        <FileSearch className="h-3.5 w-3.5" />
      );

    case "resolved":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "refund_pending":
      return (
        <AlertCircle className="h-3.5 w-3.5" />
      );

    case "pending":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    default:
      return (
        <ShieldAlert className="h-3.5 w-3.5" />
      );
  }
};

/* ================================================================
   MATCH BADGE
   ================================================================ */

const MatchBadge = ({
  matched,
}: {
  matched: boolean;
}) => {
  if (matched) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Match
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5" />
      Mismatch
    </span>
  );
};

/* ================================================================
   PAGE
   ================================================================ */

const ReconciliationPage = () => {
  const { toast } = useToast();

  /* ================================================================
     STATE
     ================================================================ */

  const [rows, setRows] =
    useState<ReconciliationRow[]>([]);

  const [summary, setSummary] =
    useState<ReconciliationSummary | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [searchInput, setSearchInput] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [stateFilter, setStateFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const [selected, setSelected] =
    useState<ReconciliationDetail | null>(
      null,
    );

  const [selectedRow, setSelectedRow] =
    useState<ReconciliationRow | null>(
      null,
    );

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [
    investigationNotes,
    setInvestigationNotes,
  ] = useState("");

  /* ================================================================
     TOTAL PAGES
     ================================================================ */

  const totalPages = useMemo(() => {
    const total = asNumber(
      rows[0]?.total_count,
    );

    return Math.max(
      1,
      Math.ceil(
        total / PAGE_SIZE,
      ),
    );
  }, [rows]);

  /* ================================================================
     FETCH SUMMARY
     ================================================================ */

  const fetchSummary =
    useCallback(
      async () => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_reconciliation_summary",
        );

        if (error) {
          throw error;
        }

        const item =
          unwrapRpc<any>(data);

        if (!item) {
          setSummary({
            total_records: 0,
            matched_count: 0,
            unmatched_count: 0,
            discrepancy_count: 0,
            investigating_count: 0,
            resolved_count: 0,
            pending_transfer_count: 0,
            refund_pending_count: 0,
            discrepancy_amount: 0,
          });

          return;
        }

        setSummary({
          total_records:
            asNumber(
              item.total_records,
            ),

          matched_count:
            asNumber(
              item.matched_count,
            ),

          unmatched_count:
            asNumber(
              item.unmatched_count,
            ),

          discrepancy_count:
            asNumber(
              item.discrepancy_count,
            ),

          investigating_count:
            asNumber(
              item.investigating_count,
            ),

          resolved_count:
            asNumber(
              item.resolved_count,
            ),

          pending_transfer_count:
            asNumber(
              item.pending_transfer_count,
            ),

          refund_pending_count:
            asNumber(
              item.refund_pending_count,
            ),

          discrepancy_amount:
            asNumber(
              item.discrepancy_amount,
            ),
        });
      },
      [],
    );

  /* ================================================================
     FETCH RECONCILIATION
     ================================================================ */

  const fetchRows =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          /*
           * IMPORTANT:
           *
           * The admin page only reads reconciliation data.
           *
           * Provider records are NOT created from this page.
           *
           * They should be populated by the backend/webhook/
           * reconciliation process.
           */
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_reconciliation_list",
            {
              p_page:
                page,

              p_page_size:
                PAGE_SIZE,

              p_search:
                search.trim() ||
                null,

              p_state:
                stateFilter === "all"
                  ? null
                  : stateFilter,

              p_status:
                statusFilter === "all"
                  ? null
                  : statusFilter,
            },
          );

          if (error) {
            throw error;
          }

          const normalized =
            Array.isArray(data)
              ? data
              : data
                ? [data]
                : [];

          setRows(
            normalized.map(
              (item: any) => ({
                ...item,

                amount:
                  item.amount ?? 0,

                provider_amount:
                  item.provider_amount ??
                  null,

                amount_difference:
                  item.amount_difference ??
                  0,

                provider_reference_match:
                  asBoolean(
                    item.provider_reference_match,
                  ),

                internal_reference_match:
                  asBoolean(
                    item.internal_reference_match,
                  ),

                amount_match:
                  asBoolean(
                    item.amount_match,
                  ),

                status_match:
                  asBoolean(
                    item.status_match,
                  ),

                total_count:
                  item.total_count ?? 0,
              }),
            ),
          );
        } catch (error: any) {
          console.error(
            "Reconciliation fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load reconciliation",
            description:
              error?.message ||
              "Something went wrong while loading reconciliation records.",
            variant:
              "destructive",
          });

          setRows([]);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        page,
        search,
        stateFilter,
        statusFilter,
        toast,
      ],
    );

  /* ================================================================
     INITIAL LOAD
     ================================================================ */

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchSummary().catch(
      (error: any) => {
        console.error(
          "Reconciliation summary failed:",
          error,
        );
      },
    );
  }, [fetchSummary]);

  /* ================================================================
     SEARCH
     ================================================================ */

  const handleSearch = () => {
    setPage(1);
    setSearch(
      searchInput.trim(),
    );
  };

  /* ================================================================
     CLEAR FILTERS
     ================================================================ */

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStateFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  /* ================================================================
     REFRESH
     ================================================================ */

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        fetchRows(true),
        fetchSummary(),
      ]);
    } catch (error) {
      console.error(
        "Reconciliation refresh failed:",
        error,
      );
    } finally {
      setRefreshing(false);
    }
  };

  /* ================================================================
     OPEN INVESTIGATION
     ================================================================ */

  const openInvestigation = async (
    row: ReconciliationRow,
  ) => {
    setSelectedRow(row);
    setSelected(null);
    setDetailLoading(true);
    setInvestigationNotes("");

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "admin_reconciliation_detail",
        {
          p_transaction_id:
            row.transaction_id,
        },
      );

      if (error) {
        throw error;
      }

      const detail =
        unwrapRpc<ReconciliationDetail>(
          data,
        );

      if (!detail) {
        throw new Error(
          "No reconciliation detail was returned.",
        );
      }

      setSelected({
        transaction:
          detail.transaction ??
          null,

        provider:
          detail.provider ??
          null,

        case:
          detail.case ??
          null,

        events:
          Array.isArray(
            detail.events,
          )
            ? detail.events
            : [],
      });

      const existingNotes =
        detail.case
          ?.investigation_notes ??
        detail.case
          ?.notes ??
        null;

      setInvestigationNotes(
        existingNotes
          ? String(existingNotes)
          : "",
      );
    } catch (error: any) {
      console.error(
        "Reconciliation detail failed:",
        error,
      );

      toast({
        title:
          "Unable to open investigation",
        description:
          error?.message ||
          "Unable to load reconciliation details.",
        variant:
          "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  /* ================================================================
     CLOSE INVESTIGATION
     ================================================================ */

  const closeInvestigation = () => {
    setSelected(null);
    setSelectedRow(null);
    setInvestigationNotes("");
  };

  /* ================================================================
     CASE ACTION
     ================================================================ */

  const updateCase = async (
    state:
      | "matched"
      | "investigating"
      | "resolved",
  ) => {
    if (!selectedRow?.transaction_id) {
      toast({
        title:
          "Transaction unavailable",
        description:
          "The reconciliation transaction ID is missing.",
        variant:
          "destructive",
      });

      return;
    }

    if (
      state === "resolved" &&
      !investigationNotes.trim()
    ) {
      toast({
        title:
          "Resolution notes required",
        description:
          "Enter investigation or resolution notes before resolving this case.",
        variant:
          "destructive",
      });

      return;
    }

    setActionLoading(true);

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "admin_reconciliation_update_case",
        {
          p_transaction_id:
            selectedRow.transaction_id,

          p_state:
            state,

          p_notes:
            investigationNotes.trim() ||
            null,
        },
      );

      if (error) {
        throw error;
      }

      /*
       * Some PostgreSQL functions return JSON,
       * others return a record. If the backend
       * explicitly returns success=false, surface it.
       */
      const result =
        unwrapRpc<any>(data);

      if (
        result &&
        result.success === false
      ) {
        throw new Error(
          result.error ||
          result.message ||
          "The reconciliation case could not be updated.",
        );
      }

      toast({
        title:
          state === "resolved"
            ? "Reconciliation resolved"
            : state === "matched"
              ? "Marked as matched"
              : "Investigation started",

        description:
          "The reconciliation case has been updated.",
      });

      /*
       * Refresh list + summary.
       */
      await Promise.all([
        fetchRows(true),
        fetchSummary(),
      ]);

      /*
       * Refresh currently opened detail.
       */
      await openInvestigation(
        selectedRow,
      );
    } catch (error: any) {
      console.error(
        "Reconciliation case update failed:",
        error,
      );

      toast({
        title:
          "Unable to update case",
        description:
          error?.message ||
          "The reconciliation case could not be updated.",
        variant:
          "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 space-y-6">

      {/* ============================================================
          HEADER
      ============================================================ */}

      <section>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Reconciliation
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Compare provider transactions with IyanjuPay records and investigate discrepancies.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={
              loading ||
              refreshing
            }
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}

            Refresh
          </Button>

        </div>
      </section>

      {/* ============================================================
          SUMMARY
      ============================================================ */}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              Total records
            </p>

            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary
                ? summary.total_records
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              Matched
            </p>

            <p className="text-2xl font-bold text-green-600 mt-1">
              {summary
                ? summary.matched_count
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              Discrepancies
            </p>

            <p className="text-2xl font-bold text-red-600 mt-1">
              {summary
                ? summary.discrepancy_count
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              Pending transfers
            </p>

            <p className="text-2xl font-bold text-orange-600 mt-1">
              {summary
                ? summary.pending_transfer_count
                : "—"}
            </p>
          </CardContent>
        </Card>

      </section>

      {/* ============================================================
          SECONDARY SUMMARY
      ============================================================ */}

      {summary && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Unmatched
              </p>

              <p className="text-xl font-bold text-yellow-600 mt-1">
                {summary.unmatched_count}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Investigating
              </p>

              <p className="text-xl font-bold text-blue-600 mt-1">
                {summary.investigating_count}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Resolved
              </p>

              <p className="text-xl font-bold text-purple-600 mt-1">
                {summary.resolved_count}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Refund pending
              </p>

              <p className="text-xl font-bold text-orange-600 mt-1">
                {summary.refund_pending_count}
              </p>
            </CardContent>
          </Card>

        </section>
      )}

      {/* ============================================================
          ALERT
      ============================================================ */}

      {(
        Number(
          summary?.discrepancy_count ||
          0,
        ) > 0 ||
        Number(
          summary?.pending_transfer_count ||
          0,
        ) > 0 ||
        Number(
          summary?.refund_pending_count ||
          0,
        ) > 0
      ) && (

        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">

          <div className="flex gap-3">

            <ShieldAlert className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />

            <div>

              <p className="font-semibold text-orange-900">
                Reconciliation attention required
              </p>

              <p className="text-sm text-orange-700 mt-1">
                There are pending, unmatched, discrepant, or refund-pending transactions that may require investigation.
              </p>

            </div>

          </div>

        </section>
      )}

      {/* ============================================================
          FILTERS
      ============================================================ */}

      <section className="bg-white border rounded-2xl p-4">

        <div className="flex items-center gap-2 mb-4">

          <Filter className="h-4 w-4 text-gray-500" />

          <h2 className="font-semibold text-gray-900">
            Filters
          </h2>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

          {/* SEARCH */}

          <div className="relative xl:col-span-1">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

            <Input
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  handleSearch();
                }
              }}
              placeholder="Search reference..."
              className="pl-9"
            />

          </div>

          {/* STATE */}

          <select
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(
                event.target.value,
              );

              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >

            <option value="all">
              All reconciliation states
            </option>

            <option value="matched">
              Matched
            </option>

            <option value="unmatched">
              Unmatched
            </option>

            <option value="discrepancy">
              Discrepancy
            </option>

            <option value="investigating">
              Investigating
            </option>

            <option value="resolved">
              Resolved
            </option>

            <option value="refund_pending">
              Refund pending
            </option>

          </select>

          {/* STATUS */}

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value,
              );

              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >

            <option value="all">
              All transaction statuses
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="successful">
              Successful
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="failed">
              Failed
            </option>

            <option value="refunded">
              Refunded
            </option>

          </select>

        </div>

        <div className="flex flex-wrap gap-2 mt-3">

          <Button
            type="button"
            size="sm"
            onClick={handleSearch}
          >
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>

          {(
            search ||
            stateFilter !== "all" ||
            statusFilter !== "all"
          ) && (

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={
                clearFilters
              }
            >
              Clear filters
            </Button>

          )}

        </div>

      </section>

      {/* ============================================================
          TABLE
      ============================================================ */}

      <section className="bg-white border rounded-2xl overflow-hidden">

        <div className="px-5 py-4 border-b">

          <h2 className="font-bold text-gray-900">
            Reconciliation Records
          </h2>

          <p className="text-xs text-gray-500 mt-1">
            Provider transactions compared against internal IyanjuPay records.
          </p>

        </div>

        {loading ? (

          <div className="py-20 flex justify-center">

            <div className="flex items-center gap-2 text-sm text-gray-500">

              <Loader2 className="h-5 w-5 animate-spin text-purple-600" />

              Loading reconciliation...

            </div>

          </div>

        ) : rows.length === 0 ? (

          <div className="py-20 text-center">

            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto">

              <CheckCircle2 className="h-6 w-6 text-green-500" />

            </div>

            <p className="font-semibold text-gray-900 mt-4">
              No reconciliation records found
            </p>

            <p className="text-sm text-gray-500 mt-1">
              No records match the selected filters.
            </p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-50 border-b">

                <tr>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Internal reference
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Provider reference
                  </th>

                  <th className="text-right px-5 py-3 font-semibold text-gray-500">
                    Internal amount
                  </th>

                  <th className="text-right px-5 py-3 font-semibold text-gray-500">
                    Provider amount
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Status
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Reconciliation
                  </th>

                  <th className="text-right px-5 py-3">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y">

                {rows.map(
                  (row) => {

                    const amountDifference =
                      asNumber(
                        row.amount_difference,
                      );

                    return (
                      <tr
                        key={
                          row.transaction_id ||
                          row.id
                        }
                        className="hover:bg-gray-50"
                      >

                        {/* INTERNAL */}

                        <td className="px-5 py-4">

                          <p className="font-mono text-xs font-semibold text-gray-900 break-all">
                            {
                              row.internal_reference ||
                              "—"
                            }
                          </p>

                          <p className="text-[11px] text-gray-400 mt-1">
                            {labelize(
                              row.transaction_type,
                            )}
                          </p>

                        </td>

                        {/* PROVIDER */}

                        <td className="px-5 py-4">

                          <p className="font-mono text-xs font-semibold text-gray-900 break-all">
                            {
                              row.provider_reference ||
                              "Not available"
                            }
                          </p>

                          <p className="text-[11px] text-gray-400 mt-1">
                            {
                              row.provider ||
                              "—"
                            }
                          </p>

                        </td>

                        {/* INTERNAL AMOUNT */}

                        <td className="px-5 py-4 text-right">

                          <p className="font-bold text-gray-900">
                            {
                              formatMoney(
                                row.amount,
                                row.currency ||
                                  "NGN",
                              )
                            }
                          </p>

                        </td>

                        {/* PROVIDER AMOUNT */}

                        <td className="px-5 py-4 text-right">

                          {row.provider_amount !==
                          null &&
                          row.provider_amount !==
                          undefined ? (

                            <>
                              <p className="font-bold text-gray-900">
                                {
                                  formatMoney(
                                    row.provider_amount,
                                    row.currency ||
                                      "NGN",
                                  )
                                }
                              </p>

                              {amountDifference !==
                                0 && (

                                <p className="text-[11px] text-red-600 mt-1">
                                  Difference{" "}
                                  {formatMoney(
                                    amountDifference,
                                    row.currency ||
                                      "NGN",
                                  )}
                                </p>

                              )}
                            </>

                          ) : (

                            <span className="text-xs text-gray-400">
                              Not available
                            </span>

                          )}

                        </td>

                        {/* STATUS */}

                        <td className="px-5 py-4">

                          <div className="space-y-1">

                            <span className="text-xs font-semibold text-gray-700">
                              Internal:{" "}
                              {labelize(
                                row.internal_status,
                              )}
                            </span>

                            <span className="block text-xs text-gray-500">
                              Provider:{" "}
                              {labelize(
                                row.provider_status,
                              )}
                            </span>

                          </div>

                        </td>

                        {/* STATE */}

                        <td className="px-5 py-4">

                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${stateClasses(
                              row.state,
                            )}`}
                          >

                            {stateIcon(
                              row.state,
                            )}

                            {labelize(
                              row.state,
                            )}

                          </span>

                          {row.issue_type && (

                            <p className="text-[11px] text-red-500 mt-1">
                              {
                                row.issue_type
                              }
                            </p>

                          )}

                        </td>

                        {/* ACTION */}

                        <td className="px-5 py-4 text-right">

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              openInvestigation(
                                row,
                              )
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Investigate
                          </Button>

                        </td>

                      </tr>
                    );
                  },
                )}

              </tbody>

            </table>

          </div>

        )}

        {/* ==========================================================
            PAGINATION
        ========================================================== */}

        {!loading &&
          rows.length > 0 && (

            <div className="border-t px-5 py-4 flex items-center justify-between">

              <p className="text-xs text-gray-500">

                Page{" "}
                <span className="font-semibold">
                  {page}
                </span>{" "}
                of{" "}
                <span className="font-semibold">
                  {totalPages}
                </span>

              </p>

              <div className="flex gap-2">

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    page <= 1
                  }
                  onClick={() =>
                    setPage(
                      (value) =>
                        Math.max(
                          1,
                          value - 1,
                        ),
                    )
                  }
                >
                  Previous
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    page >=
                    totalPages
                  }
                  onClick={() =>
                    setPage(
                      (value) =>
                        Math.min(
                          totalPages,
                          value + 1,
                        ),
                    )
                  }
                >
                  Next
                </Button>

              </div>

            </div>

          )}

      </section>

      {/* ============================================================
          INVESTIGATION MODAL
      ============================================================ */}

      {(selectedRow ||
        detailLoading) && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

          <button
            type="button"
            aria-label="Close investigation"
            onClick={
              closeInvestigation
            }
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">

            {/* HEADER */}

            <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex items-center justify-between">

              <div>

                <h3 className="font-bold text-gray-900">
                  Reconciliation Investigation
                </h3>

                <p className="text-[11px] text-gray-400 font-mono mt-1 break-all">
                  {
                    selectedRow?.internal_reference ||
                    selectedRow?.transaction_id ||
                    "Loading..."
                  }
                </p>

              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={
                  closeInvestigation
                }
              >
                <X className="h-5 w-5" />
              </Button>

            </div>

            {detailLoading ? (

              <div className="py-24 flex justify-center">

                <div className="flex items-center gap-2 text-sm text-gray-500">

                  <Loader2 className="h-5 w-5 animate-spin text-purple-600" />

                  Loading investigation...

                </div>

              </div>

            ) : selected ? (

              <div className="p-5 space-y-5">

                {/* ==================================================
                    STATE
                ================================================== */}

                <div className="rounded-2xl bg-gray-50 border p-5">

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                    <div>

                      <p className="text-xs text-gray-500">
                        Reconciliation state
                      </p>

                      <div className="mt-2">

                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${stateClasses(
                            selectedRow?.state ||
                            selected.case?.state ||
                            "unmatched",
                          )}`}
                        >

                          {stateIcon(
                            selectedRow?.state ||
                            selected.case?.state ||
                            "unmatched",
                          )}

                          {labelize(
                            selectedRow?.state ||
                            selected.case?.state ||
                            "unmatched",
                          )}

                        </span>

                      </div>

                    </div>

                    <div className="text-left sm:text-right">

                      <p className="text-xs text-gray-500">
                        Internal amount
                      </p>

                      <p className="text-2xl font-bold text-gray-900 mt-1">

                        {
                          formatMoney(
                            selected.transaction
                              ?.amount ??
                              selectedRow?.amount,
                            selected.transaction
                              ?.currency ??
                              selectedRow?.currency ??
                              "NGN",
                          )
                        }

                      </p>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    COMPARISON
                ================================================== */}

                <div className="rounded-2xl border overflow-hidden">

                  <div className="px-5 py-4 border-b">

                    <h4 className="font-bold text-gray-900">
                      Provider vs IyanjuPay
                    </h4>

                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2">

                    {/* INTERNAL */}

                    <div className="p-5 border-b md:border-b-0 md:border-r">

                      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                        IyanjuPay
                      </p>

                      <div className="space-y-4 mt-4">

                        <div>

                          <p className="text-xs text-gray-400">
                            Internal reference
                          </p>

                          <p className="font-mono text-sm font-semibold break-all mt-1">
                            {
                              selected.transaction
                                ?.reference_number ||
                              selectedRow?.internal_reference ||
                              "—"
                            }
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-gray-400">
                            Amount
                          </p>

                          <p className="font-bold text-gray-900 mt-1">
                            {
                              formatMoney(
                                selected.transaction
                                  ?.amount ??
                                  selectedRow?.amount,
                                selected.transaction
                                  ?.currency ??
                                  selectedRow?.currency ??
                                  "NGN",
                              )
                            }
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-gray-400">
                            Status
                          </p>

                          <p className="font-semibold text-gray-900 mt-1">
                            {
                              labelize(
                                selected.transaction
                                  ?.status ??
                                selectedRow?.internal_status,
                              )
                            }
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-gray-400">
                            Provider
                          </p>

                          <p className="font-semibold text-gray-900 mt-1">
                            {
                              selected.transaction
                                ?.provider ??
                              selectedRow?.provider ??
                              "—"
                            }
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-gray-400">
                            Provider reference stored internally
                          </p>

                          <p className="font-mono text-xs break-all mt-1">
                            {
                              selected.transaction
                                ?.provider_reference ??
                              selectedRow?.provider_reference ??
                              "—"
                            }
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* PROVIDER */}

                    <div className="p-5">

                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                        Provider
                      </p>

                      {selected.provider ? (

                        <div className="space-y-4 mt-4">

                          <div>

                            <p className="text-xs text-gray-400">
                              Provider reference
                            </p>

                            <p className="font-mono text-sm font-semibold break-all mt-1">
                              {
                                selected.provider
                                  ?.provider_reference ||
                                selected.provider
                                  ?.provider_transaction_id ||
                                selectedRow?.provider_reference ||
                                "—"
                              }
                            </p>

                          </div>

                          <div>

                            <p className="text-xs text-gray-400">
                              Amount
                            </p>

                            <p className="font-bold text-gray-900 mt-1">
                              {
                                formatMoney(
                                  selected.provider
                                    ?.amount ??
                                  selectedRow?.provider_amount,
                                  selected.provider
                                    ?.currency ||
                                  selectedRow?.currency ||
                                  "NGN",
                                )
                              }
                            </p>

                          </div>

                          <div>

                            <p className="text-xs text-gray-400">
                              Status
                            </p>

                            <p className="font-semibold text-gray-900 mt-1">
                              {
                                labelize(
                                  selected.provider
                                    ?.status ??
                                  selectedRow?.provider_status,
                                )
                              }
                            </p>

                          </div>

                          <div>

                            <p className="text-xs text-gray-400">
                              Internal reference supplied by provider
                            </p>

                            <p className="font-mono text-xs break-all mt-1">
                              {
                                selected.provider
                                  ?.internal_reference ||
                                "—"
                              }
                            </p>

                          </div>

                          <div>

                            <p className="text-xs text-gray-400">
                              Provider transaction ID
                            </p>

                            <p className="font-mono text-xs break-all mt-1">
                              {
                                selected.provider
                                  ?.provider_transaction_id ||
                                selected.provider
                                  ?.provider_record_id ||
                                selectedRow?.provider_record_id ||
                                "—"
                              }
                            </p>

                          </div>

                        </div>

                      ) : (

                        <div className="mt-4 rounded-xl bg-yellow-50 border border-yellow-200 p-4">

                          <div className="flex gap-2">

                            <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />

                            <div>

                              <p className="font-semibold text-yellow-900">
                                No provider record found
                              </p>

                              <p className="text-sm text-yellow-700 mt-1">
                                This transaction may still be waiting for provider confirmation or provider reconciliation data.
                              </p>

                            </div>

                          </div>

                        </div>

                      )}

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    MATCH CHECKS
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900 mb-4">
                    Reconciliation checks
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                    <div className="rounded-xl bg-gray-50 p-4">

                      <p className="text-xs text-gray-500">
                        Provider reference
                      </p>

                      <div className="mt-2">

                        <MatchBadge
                          matched={asBoolean(
                            selectedRow
                              ?.provider_reference_match,
                          )}
                        />

                      </div>

                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">

                      <p className="text-xs text-gray-500">
                        Internal reference
                      </p>

                      <div className="mt-2">

                        <MatchBadge
                          matched={asBoolean(
                            selectedRow
                              ?.internal_reference_match,
                          )}
                        />

                      </div>

                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">

                      <p className="text-xs text-gray-500">
                        Amount
                      </p>

                      <div className="mt-2">

                        <MatchBadge
                          matched={asBoolean(
                            selectedRow
                              ?.amount_match,
                          )}
                        />

                      </div>

                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">

                      <p className="text-xs text-gray-500">
                        Status
                      </p>

                      <div className="mt-2">

                        <MatchBadge
                          matched={asBoolean(
                            selectedRow
                              ?.status_match,
                          )}
                        />

                      </div>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    TRANSACTION INFORMATION
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900 mb-4">
                    Transaction information
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                    <div>

                      <p className="text-xs text-gray-400">
                        Transaction ID
                      </p>

                      <p className="font-mono text-xs break-all mt-1">
                        {
                          selected.transaction
                            ?.id ||
                          selectedRow
                            ?.transaction_id ||
                          "—"
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        User ID
                      </p>

                      <p className="font-mono text-xs break-all mt-1">
                        {
                          selected.transaction
                            ?.user_id ||
                          selectedRow?.user_id ||
                          "—"
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Transaction type
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {
                          labelize(
                            selected.transaction
                              ?.transaction_type ??
                            selectedRow
                              ?.transaction_type,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Category
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {
                          labelize(
                            selected.transaction
                              ?.category ??
                            selectedRow?.category,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Created
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {
                          formatDate(
                            selected.transaction
                              ?.created_at ??
                            selectedRow?.created_at,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Updated
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {
                          formatDate(
                            selected.transaction
                              ?.updated_at ??
                            selectedRow?.updated_at,
                          )
                        }
                      </p>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    REFUND
                ================================================== */}

                {(selectedRow?.refund_status ||
                  selected.transaction
                    ?.refund_status) && (

                  <div className="rounded-2xl border p-5">

                    <h4 className="font-bold text-gray-900 mb-4">
                      Refund status
                    </h4>

                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${stateClasses(
                        selectedRow
                          ?.refund_status ||
                        selected.transaction
                          ?.refund_status,
                      )}`}
                    >
                      {stateIcon(
                        selectedRow
                          ?.refund_status ||
                        selected.transaction
                          ?.refund_status,
                      )}

                      {labelize(
                        selectedRow
                          ?.refund_status ||
                        selected.transaction
                          ?.refund_status,
                      )}
                    </span>

                  </div>
                )}

                {/* ==================================================
                    METADATA
                ================================================== */}

                {selected.transaction
                  ?.metadata && (

                  <div className="rounded-2xl border p-5">

                    <h4 className="font-bold text-gray-900 mb-4">
                      Transaction metadata
                    </h4>

                    <pre className="rounded-xl bg-gray-950 text-gray-100 p-4 overflow-x-auto text-xs leading-relaxed">
                      {JSON.stringify(
                        selected.transaction
                          ?.metadata,
                        null,
                        2,
                      )}
                    </pre>

                  </div>
                )}

                {/* ==================================================
                    INVESTIGATION
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900">
                    Investigation
                  </h4>

                  <p className="text-xs text-gray-500 mt-1">
                    Record what was checked and why the case was resolved.
                  </p>

                  <textarea
                    value={
                      investigationNotes
                    }
                    onChange={(event) =>
                      setInvestigationNotes(
                        event.target.value,
                      )
                    }
                    rows={5}
                    placeholder="Enter investigation findings..."
                    className="mt-4 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
                  />

                  <div className="flex flex-wrap gap-2 mt-4">

                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        actionLoading
                      }
                      onClick={() =>
                        updateCase(
                          "investigating",
                        )
                      }
                    >

                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileSearch className="h-4 w-4 mr-2" />
                      )}

                      Start investigation

                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        actionLoading
                      }
                      onClick={() =>
                        updateCase(
                          "matched",
                        )
                      }
                    >

                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}

                      Mark matched

                    </Button>

                    <Button
                      type="button"
                      disabled={
                        actionLoading
                      }
                      onClick={() =>
                        updateCase(
                          "resolved",
                        )
                      }
                    >

                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}

                      Resolve case

                    </Button>

                  </div>

                </div>

                {/* ==================================================
                    EVENTS
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900 mb-4">
                    Investigation history
                  </h4>

                  {(
                    selected.events ||
                    []
                  ).length === 0 ? (

                    <p className="text-sm text-gray-500">
                      No reconciliation events recorded yet.
                    </p>

                  ) : (

                    <div className="space-y-3">

                      {selected.events.map(
                        (
                          event,
                          index,
                        ) => (

                          <div
                            key={
                              String(
                                event.id ||
                                index,
                              )
                            }
                            className="rounded-xl bg-gray-50 border p-4"
                          >

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                              <p className="font-semibold text-gray-900">
                                {
                                  labelize(
                                    event.event_type,
                                  )
                                }
                              </p>

                              <p className="text-xs text-gray-400">
                                {
                                  formatDate(
                                    event.created_at,
                                  )
                                }
                              </p>

                            </div>

                            {(
                              event.old_state ||
                              event.new_state
                            ) && (

                              <p className="text-xs text-gray-500 mt-2">

                                {
                                  labelize(
                                    event.old_state,
                                  )
                                }

                                {" → "}

                                {
                                  labelize(
                                    event.new_state,
                                  )
                                }

                              </p>

                            )}

                            {event.notes && (

                              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
                                {
                                  event.notes
                                }
                              </p>

                            )}

                          </div>

                        ),
                      )}

                    </div>
                  )}

                </div>

              </div>

            ) : null}

          </div>

        </div>
      )}

    </div>
  );
};

export default ReconciliationPage;
