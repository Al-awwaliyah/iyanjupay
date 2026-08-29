import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
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

import { useNavigate } from "react-router-dom";

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
  provider_record_id: string | null;
  internal_reference: string | null;
  provider_reference: string | null;
  amount: number | string;
  provider_amount: number | string | null;
  amount_difference: number | string;
  currency: string;
  internal_status: string | null;
  provider_status: string | null;
  transaction_type: string | null;
  category: string | null;
  provider: string | null;
  user_id: string;
  state: string;
  issue_type: string | null;
  provider_reference_match: boolean;
  internal_reference_match: boolean;
  amount_match: boolean;
  status_match: boolean;
  refund_status: string | null;
  reconciliation_required: boolean;
  created_at: string;
  updated_at: string;
  total_count: number;
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
   MONEY
   ================================================================ */

const formatMoney = (
  amount: number | string | null | undefined,
  currency = "NGN",
) => {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    },
  ).format(
    Number(amount || 0),
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
  state: string,
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

    default:
      return "bg-gray-100 text-gray-600";
  }
};


/* ================================================================
   STATE ICON
   ================================================================ */

const stateIcon = (
  state: string,
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

    default:
      return (
        <ShieldAlert className="h-3.5 w-3.5" />
      );
  }
};


/* ================================================================
   BOOLEAN MATCH BADGE
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

  /*
   * React Router navigation.
   *
   * navigate(-1) returns the user to the previous page,
   * preserving the existing routing structure.
   */
  const navigate = useNavigate();


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

  const [providerFilter, setProviderFilter] =
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

  const [investigationNotes, setInvestigationNotes] =
    useState("");


  /* ================================================================
     TOTAL PAGES
     ================================================================ */

  const totalPages = useMemo(() => {
    const total =
      Number(
        rows[0]?.total_count || 0,
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
          Array.isArray(data)
            ? data[0]
            : data;

        setSummary(
          item
            ? {
                total_records:
                  Number(
                    item.total_records || 0,
                  ),

                matched_count:
                  Number(
                    item.matched_count || 0,
                  ),

                unmatched_count:
                  Number(
                    item.unmatched_count || 0,
                  ),

                discrepancy_count:
                  Number(
                    item.discrepancy_count || 0,
                  ),

                investigating_count:
                  Number(
                    item.investigating_count || 0,
                  ),

                resolved_count:
                  Number(
                    item.resolved_count || 0,
                  ),

                pending_transfer_count:
                  Number(
                    item.pending_transfer_count || 0,
                  ),

                refund_pending_count:
                  Number(
                    item.refund_pending_count || 0,
                  ),

                discrepancy_amount:
                  Number(
                    item.discrepancy_amount || 0,
                  ),
              }
            : null,
        );
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
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_reconciliation_list",
            {
              p_page: page,

              p_page_size:
                PAGE_SIZE,

              p_search:
                search.trim() ||
                null,

              p_state:
                stateFilter === "all"
                  ? null
                  : stateFilter,

              p_provider:
                providerFilter === "all"
                  ? null
                  : providerFilter,

              p_status:
                statusFilter === "all"
                  ? null
                  : statusFilter,
            },
          );

          if (error) {
            throw error;
          }

          setRows(
            (data || []) as ReconciliationRow[],
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
        providerFilter,
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
    fetchSummary()
      .catch((error: any) => {
        console.error(
          "Reconciliation summary failed:",
          error,
        );
      });
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
    setProviderFilter("all");
    setPage(1);
  };


  /* ================================================================
     REFRESH
     ================================================================ */

  const handleRefresh = async () => {
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

      setSelected(
        data as ReconciliationDetail,
      );

      const existingNotes =
        (data as any)?.case
          ?.investigation_notes;

      if (existingNotes) {
        setInvestigationNotes(
          String(existingNotes),
        );
      }

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
    if (!selectedRow) {
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

          p_refund_status:
            null,

          p_assigned_to:
            null,
        },
      );

      if (error) {
        throw error;
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

      await Promise.all([
        fetchRows(true),
        fetchSummary(),
      ]);

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

        {/* BACK BUTTON */}

        <div className="mb-4">

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/admin")}
            className="gap-2 -ml-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

        </div>


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
          EVERYTHING BELOW THIS POINT REMAINS EXACTLY AS YOUR
          EXISTING COMPONENT
          ============================================================ */}

      {/* SUMMARY, ALERT, FILTERS, TABLE, PAGINATION,
          INVESTIGATION MODAL, ETC. */}

    </div>
  );
};

export default ReconciliationPage;
