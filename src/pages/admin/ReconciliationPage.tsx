import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AlertCircle, CheckCircle2, Clock3, Eye, FileSearch, Filter, Loader2, RefreshCw, Search, ShieldAlert, X, XCircle, } from "lucide-react";

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

  provider: string | null;

  provider_reference: string | null;

  internal_reference: string | null;

  transaction_id: string | null;

  transaction_type: string | null;

  amount: number | string;

  currency: string;

  provider_status: string | null;

  internal_status: string | null;

  reconciliation_status: string;

  amount_difference: number | string;

  provider_created_at: string | null;

  provider_completed_at: string | null;

  internal_created_at: string | null;

  internal_completed_at: string | null;

  account_reference: string | null;

  metadata: Record<string, any> | null;

  notes: string | null;

  created_at: string;

  updated_at: string;
}


interface ReconciliationSummary {
  total: number;

  matched: number;

  unmatched: number;

  pending: number;

  amount_mismatch: number;

  status_mismatch: number;

  missing_internal: number;

  missing_provider: number;

  exception: number;

  total_provider_volume: number;

  difference_volume: number;
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
   STATUS CLASSES
   ================================================================ */

const stateClasses = (
  status: string | null | undefined,
) => {
  switch (
    String(status || "")
      .toLowerCase()
  ) {
    case "matched":
      return "bg-green-100 text-green-700";

    case "unmatched":
      return "bg-yellow-100 text-yellow-700";

    case "pending":
      return "bg-orange-100 text-orange-700";

    case "amount_mismatch":
      return "bg-red-100 text-red-700";

    case "status_mismatch":
      return "bg-red-100 text-red-700";

    case "missing_internal":
      return "bg-orange-100 text-orange-700";

    case "missing_provider":
      return "bg-orange-100 text-orange-700";

    case "exception":
      return "bg-red-100 text-red-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


/* ================================================================
   STATUS ICON
   ================================================================ */

const stateIcon = (
  status: string | null | undefined,
) => {
  switch (
    String(status || "")
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

    case "pending":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    case "amount_mismatch":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    case "status_mismatch":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    case "missing_internal":
      return (
        <AlertCircle className="h-3.5 w-3.5" />
      );

    case "missing_provider":
      return (
        <AlertCircle className="h-3.5 w-3.5" />
      );

    case "exception":
      return (
        <ShieldAlert className="h-3.5 w-3.5" />
      );

    default:
      return (
        <ShieldAlert className="h-3.5 w-3.5" />
      );
  }
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

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [providerFilter, setProviderFilter] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const [selectedRow, setSelectedRow] =
    useState<ReconciliationRow | null>(
      null,
    );

  const [actionLoading, setActionLoading] =
    useState(false);

  const [investigationNotes, setInvestigationNotes] =
    useState("");


  /* ================================================================
     TOTAL PAGES
     ================================================================ */

  /*
   * The current backend list RPC does not return total_count.
   *
   * Therefore pagination is based on whether the current page
   * contains PAGE_SIZE records.
   */

  const hasNextPage =
    rows.length === PAGE_SIZE;

  const totalPages = useMemo(
    () => {
      return hasNextPage
        ? page + 1
        : page;
    },
    [
      hasNextPage,
      page,
    ],
  );


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

        /*
         * Current backend returns JSONB object:
         *
         * {
         *   total,
         *   matched,
         *   unmatched,
         *   pending,
         *   amount_mismatch,
         *   status_mismatch,
         *   missing_internal,
         *   missing_provider,
         *   exception,
         *   total_provider_volume,
         *   difference_volume
         * }
         */

        const item =
          data &&
          typeof data === "object"
            ? data as Record<string, any>
            : null;

        if (!item) {
          setSummary(null);
          return;
        }

        setSummary({
          total:
            Number(
              item.total || 0,
            ),

          matched:
            Number(
              item.matched || 0,
            ),

          unmatched:
            Number(
              item.unmatched || 0,
            ),

          pending:
            Number(
              item.pending || 0,
            ),

          amount_mismatch:
            Number(
              item.amount_mismatch || 0,
            ),

          status_mismatch:
            Number(
              item.status_mismatch || 0,
            ),

          missing_internal:
            Number(
              item.missing_internal || 0,
            ),

          missing_provider:
            Number(
              item.missing_provider || 0,
            ),

          exception:
            Number(
              item.exception || 0,
            ),

          total_provider_volume:
            Number(
              item.total_provider_volume || 0,
            ),

          difference_volume:
            Number(
              item.difference_volume || 0,
            ),
        });
      },
      [],
    );


  /* ================================================================
     FETCH RECONCILIATION RECORDS
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
           * Backend signature:
           *
           * admin_reconciliation_list(
           *   _status,
           *   _provider,
           *   _search,
           *   _limit,
           *   _offset
           * )
           */

          const offset =
            (page - 1) *
            PAGE_SIZE;

          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_reconciliation_list",
            {
              _status:
                statusFilter === "all"
                  ? null
                  : statusFilter,

              _provider:
                providerFilter === "all"
                  ? null
                  : providerFilter,

              _search:
                search.trim() ||
                null,

              _limit:
                PAGE_SIZE,

              _offset:
                offset,
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

  const openInvestigation = (
    row: ReconciliationRow,
  ) => {
    setSelectedRow(row);

    setInvestigationNotes(
      row.notes || "",
    );
  };


  /* ================================================================
     CLOSE INVESTIGATION
     ================================================================ */

  const closeInvestigation = () => {
    if (actionLoading) {
      return;
    }

    setSelectedRow(null);
    setInvestigationNotes("");
  };


  /* ================================================================
     UPDATE RECONCILIATION STATUS
     ================================================================ */

  const updateStatus = async (
    status:
      | "unmatched"
      | "matched"
      | "amount_mismatch"
      | "status_mismatch"
      | "missing_internal"
      | "missing_provider"
      | "pending"
      | "exception",
  ) => {
    if (!selectedRow) {
      return;
    }

    if (
      status === "exception" &&
      !investigationNotes.trim()
    ) {
      toast({
        title:
          "Notes required",
        description:
          "Please enter investigation notes before marking this record as an exception.",
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
        "admin_reconciliation_update_status",
        {
          _id:
            selectedRow.id,

          _status:
            status,

          _notes:
            investigationNotes.trim() ||
            null,
        },
      );

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "The reconciliation record could not be updated.",
        );
      }

      toast({
        title:
          "Reconciliation updated",

        description:
          `Record marked as ${labelize(status)}.`,
      });

      /*
       * Update selected row immediately so the modal
       * reflects the new state without requiring another
       * detail RPC.
       */

      setSelectedRow(
        (current) =>
          current
            ? {
                ...current,

                reconciliation_status:
                  status,

                notes:
                  investigationNotes.trim() ||
                  current.notes,
              }
            : current,
      );

      await Promise.all([
        fetchRows(true),
        fetchSummary(),
      ]);

    } catch (error: any) {
      console.error(
        "Reconciliation status update failed:",
        error,
      );

      toast({
        title:
          "Unable to update reconciliation",
        description:
          error?.message ||
          "The reconciliation status could not be updated.",
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
          <div className="flex items-center gap-4">

            {/* BACK BUTTON */}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-purple-600 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div>

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
              {summary?.total ?? "—"}
            </p>

          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-4">

            <p className="text-xs text-gray-500">
              Matched
            </p>

            <p className="text-2xl font-bold text-green-600 mt-1">
              {summary?.matched ?? "—"}
            </p>

          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-4">

            <p className="text-xs text-gray-500">
              Discrepancies
            </p>

            <p className="text-2xl font-bold text-red-600 mt-1">
              {
                summary
                  ? (
                      summary.amount_mismatch +
                      summary.status_mismatch +
                      summary.exception
                    )
                  : "—"
              }
            </p>

          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-4">

            <p className="text-xs text-gray-500">
              Pending
            </p>

            <p className="text-2xl font-bold text-orange-600 mt-1">
              {summary?.pending ?? "—"}
            </p>

          </CardContent>
        </Card>

      </section>


      {/* ============================================================
          SECONDARY SUMMARY
          ============================================================ */}

      {summary && (

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          <Card>
            <CardContent className="p-4">

              <p className="text-xs text-gray-500">
                Missing internal
              </p>

              <p className="text-xl font-bold text-orange-600 mt-1">
                {summary.missing_internal}
              </p>

            </CardContent>
          </Card>


          <Card>
            <CardContent className="p-4">

              <p className="text-xs text-gray-500">
                Missing provider
              </p>

              <p className="text-xl font-bold text-orange-600 mt-1">
                {summary.missing_provider}
              </p>

            </CardContent>
          </Card>


          <Card>
            <CardContent className="p-4">

              <p className="text-xs text-gray-500">
                Provider volume
              </p>

              <p className="text-xl font-bold text-gray-900 mt-1">
                {formatMoney(
                  summary.total_provider_volume,
                )}
              </p>

            </CardContent>
          </Card>


          <Card>
            <CardContent className="p-4">

              <p className="text-xs text-gray-500">
                Difference volume
              </p>

              <p className="text-xl font-bold text-red-600 mt-1">
                {formatMoney(
                  summary.difference_volume,
                )}
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
          summary?.amount_mismatch || 0,
        ) > 0 ||

        Number(
          summary?.status_mismatch || 0,
        ) > 0 ||

        Number(
          summary?.missing_internal || 0,
        ) > 0 ||

        Number(
          summary?.missing_provider || 0,
        ) > 0 ||

        Number(
          summary?.exception || 0,
        ) > 0 ||

        Number(
          summary?.pending || 0,
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
                There are pending, missing, mismatched, or exception records that may require investigation.
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

          <div className="relative">

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
              placeholder="Search reference or account..."
              className="pl-9"
            />

          </div>


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
              All reconciliation statuses
            </option>

            <option value="matched">
              Matched
            </option>

            <option value="unmatched">
              Unmatched
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="amount_mismatch">
              Amount mismatch
            </option>

            <option value="status_mismatch">
              Status mismatch
            </option>

            <option value="missing_internal">
              Missing internal
            </option>

            <option value="missing_provider">
              Missing provider
            </option>

            <option value="exception">
              Exception
            </option>

          </select>


          {/* PROVIDER */}

          <Input
            value={
              providerFilter === "all"
                ? ""
                : providerFilter
            }
            onChange={(event) => {
              const value =
                event.target.value.trim();

              setProviderFilter(
                value || "all",
              );

              setPage(1);
            }}
            placeholder="Provider e.g. flutterwave"
          />

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
            statusFilter !== "all" ||
            providerFilter !== "all"
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
                    Amount
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Status
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Reconciliation
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Created
                  </th>

                  <th className="text-right px-5 py-3">
                    Action
                  </th>

                </tr>

              </thead>


              <tbody className="divide-y">

                {rows.map(
                  (row) => (

                    <tr
                      key={row.id}
                      className="hover:bg-gray-50"
                    >

                      {/* INTERNAL */}

                      <td className="px-5 py-4">

                        <p className="font-mono text-xs font-semibold text-gray-900 break-all">
                          {
                            row.internal_reference ||
                            "Not available"
                          }
                        </p>

                        <p className="text-[11px] text-gray-400 mt-1">
                          {
                            labelize(
                              row.transaction_type,
                            )
                          }
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


                      {/* AMOUNT */}

                      <td className="px-5 py-4 text-right">

                        <p className="font-bold text-gray-900">
                          {
                            formatMoney(
                              row.amount,
                              row.currency,
                            )
                          }
                        </p>

                        {Number(
                          row.amount_difference,
                        ) !== 0 && (

                          <p className="text-[11px] text-red-600 mt-1">
                            Difference{" "}
                            {formatMoney(
                              row.amount_difference,
                              row.currency,
                            )}
                          </p>

                        )}

                      </td>


                      {/* STATUS */}

                      <td className="px-5 py-4">

                        <div className="space-y-1">

                          <span className="block text-xs font-semibold text-gray-700">
                            Internal:{" "}
                            {
                              labelize(
                                row.internal_status,
                              )
                            }
                          </span>

                          <span className="block text-xs text-gray-500">
                            Provider:{" "}
                            {
                              labelize(
                                row.provider_status,
                              )
                            }
                          </span>

                        </div>

                      </td>


                      {/* RECONCILIATION */}

                      <td className="px-5 py-4">

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${stateClasses(
                            row.reconciliation_status,
                          )}`}
                        >

                          {
                            stateIcon(
                              row.reconciliation_status,
                            )
                          }

                          {
                            labelize(
                              row.reconciliation_status,
                            )
                          }

                        </span>

                      </td>


                      {/* CREATED */}

                      <td className="px-5 py-4">

                        <span className="text-xs text-gray-600">
                          {
                            formatDate(
                              row.created_at,
                            )
                          }
                        </span>

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

                  ),
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
                </span>

                {hasNextPage && (
                  <>
                    {" "}of{" "}
                    <span className="font-semibold">
                      {totalPages}
                    </span>
                  </>
                )}

              </p>


              <div className="flex gap-2">

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    page <= 1 ||
                    loading
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
                    !hasNextPage ||
                    loading
                  }
                  onClick={() =>
                    setPage(
                      (value) =>
                        value + 1,
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

      {selectedRow && (

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
                    selectedRow.internal_reference ||
                    selectedRow.id
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
                disabled={
                  actionLoading
                }
              >
                <X className="h-5 w-5" />
              </Button>

            </div>


            <div className="p-5 space-y-5">

              {/* ==================================================
                  CURRENT STATE
                  ================================================== */}

              <div className="rounded-2xl bg-gray-50 border p-5">

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                  <div>

                    <p className="text-xs text-gray-500">
                      Reconciliation status
                    </p>

                    <div className="mt-2">

                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${stateClasses(
                          selectedRow.reconciliation_status,
                        )}`}
                      >

                        {
                          stateIcon(
                            selectedRow.reconciliation_status,
                          )
                        }

                        {
                          labelize(
                            selectedRow.reconciliation_status,
                          )
                        }

                      </span>

                    </div>

                  </div>


                  <div className="text-left sm:text-right">

                    <p className="text-xs text-gray-500">
                      Provider amount
                    </p>

                    <p className="text-2xl font-bold text-gray-900 mt-1">

                      {
                        formatMoney(
                          selectedRow.amount,
                          selectedRow.currency,
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
                            selectedRow.internal_reference ||
                            "Not available"
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Transaction ID
                        </p>

                        <p className="font-mono text-xs break-all mt-1">
                          {
                            selectedRow.transaction_id ||
                            "Not available"
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Amount
                        </p>

                        <p className="font-bold text-gray-900 mt-1">
                          {
                            selectedRow.transaction_id
                              ? formatMoney(
                                  selectedRow.amount,
                                  selectedRow.currency,
                                )
                              : "Not available"
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
                              selectedRow.internal_status,
                            )
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Internal created
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            formatDate(
                              selectedRow.internal_created_at,
                            )
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


                    <div className="space-y-4 mt-4">

                      <div>

                        <p className="text-xs text-gray-400">
                          Provider
                        </p>

                        <p className="font-semibold text-gray-900 mt-1">
                          {
                            selectedRow.provider ||
                            "—"
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Provider reference
                        </p>

                        <p className="font-mono text-sm font-semibold break-all mt-1">
                          {
                            selectedRow.provider_reference ||
                            "Not available"
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Provider transaction ID
                        </p>

                        <p className="font-mono text-xs break-all mt-1">
                          {
                            selectedRow.metadata
                              ?.provider_transaction_id ||
                            "Not available"
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
                              selectedRow.amount,
                              selectedRow.currency,
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
                              selectedRow.provider_status,
                            )
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-gray-400">
                          Provider created
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            formatDate(
                              selectedRow.provider_created_at,
                            )
                          }
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

              </div>


              {/* ==================================================
                  COMPARISON CHECKS
                  ================================================== */}

              <div className="rounded-2xl border p-5">

                <h4 className="font-bold text-gray-900 mb-4">
                  Reconciliation checks
                </h4>


                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                  {/* INTERNAL REFERENCE */}

                  <div className="rounded-xl bg-gray-50 p-4">

                    <p className="text-xs text-gray-500">
                      Internal reference
                    </p>

                    <div className="mt-2">

                      {selectedRow.internal_reference ? (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">

                          <CheckCircle2 className="h-3.5 w-3.5" />

                          Present

                        </span>

                      ) : (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">

                          <AlertCircle className="h-3.5 w-3.5" />

                          Missing

                        </span>

                      )}

                    </div>

                  </div>


                  {/* PROVIDER REFERENCE */}

                  <div className="rounded-xl bg-gray-50 p-4">

                    <p className="text-xs text-gray-500">
                      Provider reference
                    </p>

                    <div className="mt-2">

                      {selectedRow.provider_reference ? (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">

                          <CheckCircle2 className="h-3.5 w-3.5" />

                          Present

                        </span>

                      ) : (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">

                          <XCircle className="h-3.5 w-3.5" />

                          Missing

                        </span>

                      )}

                    </div>

                  </div>


                  {/* AMOUNT */}

                  <div className="rounded-xl bg-gray-50 p-4">

                    <p className="text-xs text-gray-500">
                      Amount difference
                    </p>

                    <div className="mt-2">

                      {Number(
                        selectedRow.amount_difference,
                      ) === 0 ? (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">

                          <CheckCircle2 className="h-3.5 w-3.5" />

                          Match

                        </span>

                      ) : (

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">

                          <XCircle className="h-3.5 w-3.5" />

                          {
                            formatMoney(
                              selectedRow.amount_difference,
                              selectedRow.currency,
                            )
                          }

                        </span>

                      )}

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
                      Reconciliation ID
                    </p>

                    <p className="font-mono text-xs break-all mt-1">
                      {
                        selectedRow.id
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-gray-400">
                      Transaction ID
                    </p>

                    <p className="font-mono text-xs break-all mt-1">
                      {
                        selectedRow.transaction_id ||
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
                          selectedRow.transaction_type,
                        )
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-gray-400">
                      Account reference
                    </p>

                    <p className="font-mono text-xs break-all mt-1">
                      {
                        selectedRow.account_reference ||
                        "—"
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-gray-400">
                      Currency
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {
                        selectedRow.currency
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
                          selectedRow.created_at,
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
                          selectedRow.updated_at,
                        )
                      }
                    </p>

                  </div>

                </div>

              </div>


              {/* ==================================================
                  METADATA
                  ================================================== */}

              {selectedRow.metadata && (

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900 mb-4">
                    Provider metadata
                  </h4>

                  <pre className="rounded-xl bg-gray-950 text-gray-100 p-4 overflow-x-auto text-xs leading-relaxed">
                    {
                      JSON.stringify(
                        selectedRow.metadata,
                        null,
                        2,
                      )
                    }
                  </pre>

                </div>

              )}


              {/* ==================================================
                  NOTES
                  ================================================== */}

              <div className="rounded-2xl border p-5">

                <h4 className="font-bold text-gray-900">
                  Investigation
                </h4>

                <p className="text-xs text-gray-500 mt-1">
                  Record what was checked and why the reconciliation status was changed.
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
                      updateStatus(
                        "pending",
                      )
                    }
                  >

                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Clock3 className="h-4 w-4 mr-2" />
                    )}

                    Mark pending

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "matched",
                      )
                    }
                  >

                    <CheckCircle2 className="h-4 w-4 mr-2" />

                    Mark matched

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "unmatched",
                      )
                    }
                  >

                    <Clock3 className="h-4 w-4 mr-2" />

                    Mark unmatched

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "amount_mismatch",
                      )
                    }
                  >

                    <XCircle className="h-4 w-4 mr-2" />

                    Amount mismatch

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "status_mismatch",
                      )
                    }
                  >

                    <XCircle className="h-4 w-4 mr-2" />

                    Status mismatch

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "missing_internal",
                      )
                    }
                  >

                    <AlertCircle className="h-4 w-4 mr-2" />

                    Missing internal

                  </Button>


                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "missing_provider",
                      )
                    }
                  >

                    <AlertCircle className="h-4 w-4 mr-2" />

                    Missing provider

                  </Button>


                  <Button
                    type="button"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      updateStatus(
                        "exception",
                      )
                    }
                  >

                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 mr-2" />
                    )}

                    Mark exception

                  </Button>

                </div>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};


export default ReconciliationPage;
