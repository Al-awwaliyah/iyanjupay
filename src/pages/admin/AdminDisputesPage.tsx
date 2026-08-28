import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AlertTriangle, Activity, Building2, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Eye, Filter, Loader2, Mail,
  Phone, RefreshCw,  Search, User, Wallet, X, XCircle, } from "lucide-react";

import AdminLayout from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";


interface AdminDispute {
  id: string;
  transaction_id: string;
  user_id: string;
  amount: number | string;
  currency: string;
  reason: string;
  description: string | null;
  status: string;
  priority: string;
  admin_notes: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  transaction_reference: string | null;
  transaction_type: string | null;
  transaction_status: string | null;
  transaction_category: string | null;
  transaction_provider: string | null;
  provider_reference: string | null;
  user_full_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  total_count: number;
}


const PAGE_SIZE = 25;


// ============================================================
// HELPERS
// ============================================================

const formatMoney = (
  amount: number | string,
  currency = "NGN",
) => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    },
  ).format(value);
};


const formatDate = (
  value: string | null,
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


const normalize = (
  value: string | null | undefined,
) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};


const titleCase = (
  value: string | null | undefined,
) => {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
};


// ============================================================
// STATUS
// ============================================================

const statusClasses = (
  status: string,
) => {
  switch (normalize(status)) {
    case "resolved":
      return "bg-green-100 text-green-700";

    case "rejected":
      return "bg-red-100 text-red-700";

    case "investigating":
      return "bg-blue-100 text-blue-700";

    case "open":
      return "bg-yellow-100 text-yellow-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


const statusIcon = (
  status: string,
) => {
  switch (normalize(status)) {
    case "resolved":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "rejected":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    case "investigating":
      return (
        <Activity className="h-3.5 w-3.5" />
      );

    case "open":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    default:
      return (
        <AlertTriangle className="h-3.5 w-3.5" />
      );
  }
};


// ============================================================
// PRIORITY
// ============================================================

const priorityClasses = (
  priority: string,
) => {
  switch (normalize(priority)) {
    case "urgent":
      return "bg-red-100 text-red-700";

    case "high":
      return "bg-orange-100 text-orange-700";

    case "normal":
      return "bg-blue-100 text-blue-700";

    case "low":
      return "bg-gray-100 text-gray-600";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


// ============================================================
// COPY
// ============================================================

const copyToClipboard = async (
  value: string,
  label: string,
  toast: ReturnType<typeof useToast>["toast"],
) => {
  try {
    await navigator.clipboard.writeText(value);

    toast({
      title: "Copied",
      description:
        `${label} copied to clipboard.`,
    });
  } catch (error) {
    console.error(
      "Clipboard copy failed:",
      error,
    );

    toast({
      title: "Copy failed",
      description:
        `Unable to copy ${label}.`,
      variant: "destructive",
    });
  }
};


// ============================================================
// COMPONENT
// ============================================================

const AdminDisputesPage = () => {
  const { toast } = useToast();


  const [
    disputes,
    setDisputes,
  ] = useState<AdminDispute[]>([]);


  const [loading, setLoading] =
    useState(true);


  const [refreshing, setRefreshing] =
    useState(false);


  const [page, setPage] =
    useState(1);


  const [totalCount, setTotalCount] =
    useState(0);


  const [searchInput, setSearchInput] =
    useState("");


  const [search, setSearch] =
    useState("");

  const [status, setStatus] =
    useState("");

  const [priority, setPriority] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [
    selectedDispute,
    setSelectedDispute,
  ] =
    useState<AdminDispute | null>(null);

  const [
    updating,
    setUpdating,
  ] =
    useState(false);

  const [
    editStatus,
    setEditStatus,
  ] =
    useState("");

  const [
    editPriority,
    setEditPriority,
  ] =
    useState("");

  const [
    editNotes,
    setEditNotes,
  ] =
    useState("");

  const totalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(
        totalCount / PAGE_SIZE,
      ),
    );
  }, [totalCount]);


  // ==========================================================
  // FETCH
  // ==========================================================

  const fetchDisputes =
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
            "admin_get_disputes",
            {
              p_page: page,

              p_page_size:
                PAGE_SIZE,

              p_search:
                search.trim() || null,

              p_status:
                status || null,

              p_priority:
                priority || null,

              p_reason:
                reason || null,
            },
          );

          if (error) {
            throw error;
          }

          const rows =
            (data || []) as
              AdminDispute[];

          setDisputes(rows);

          setTotalCount(
            Number(
              rows[0]?.total_count ||
                0,
            ),
          );
        } catch (error: any) {
          console.error(
            "Admin disputes fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load disputes",

            description:
              error?.message ||
              "Something went wrong while loading disputes.",

            variant:
              "destructive",
          });

          setDisputes([]);

          setTotalCount(0);
        } finally {
          setLoading(false);

          setRefreshing(false);
        }
      },
      [
        page,
        search,
        status,
        priority,
        reason,
        toast,
      ],
    );


  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);


  // ==========================================================
  // SEARCH
  // ==========================================================

  const handleSearch = () => {
    setPage(1);

    setSearch(
      searchInput.trim(),
    );
  };


  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPriority("");
    setReason("");
    setPage(1);
  };


  const hasFilters =
    Boolean(
      search ||
      status ||
      priority ||
      reason,
    );


  // ==========================================================
  // OPEN DETAILS
  // ==========================================================

  const openDispute = (
    dispute: AdminDispute,
  ) => {
    setSelectedDispute(dispute);

    setEditStatus(
      dispute.status,
    );

    setEditPriority(
      dispute.priority,
    );

    setEditNotes(
      dispute.admin_notes || "",
    );
  };


  // ==========================================================
  // UPDATE DISPUTE
  // ==========================================================

  const handleUpdateDispute =
    async () => {
      if (!selectedDispute) {
        return;
      }

      if (!editStatus) {
        toast({
          title: "Status required",
          description:
            "Please select a dispute status.",
          variant: "destructive",
        });

        return;
      }

      if (!editPriority) {
        toast({
          title: "Priority required",
          description:
            "Please select a dispute priority.",
          variant: "destructive",
        });

        return;
      }


      setUpdating(true);


      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_update_dispute",
          {
            p_dispute_id:
              selectedDispute.id,

            p_status:
              editStatus,

            p_priority:
              editPriority,

            p_admin_notes:
              editNotes.trim() || null,
          },
        );


        if (error) {
          throw error;
        }


        const updated =
          data as AdminDispute;


        toast({
          title: "Dispute updated",
          description:
            "The dispute has been updated successfully.",
        });


        setSelectedDispute(
          (current) =>
            current
              ? {
                  ...current,
                  ...updated,
                }
              : current,
        );


        await fetchDisputes(true);
      } catch (error: any) {
        console.error(
          "Dispute update failed:",
          error,
        );

        toast({
          title:
            "Unable to update dispute",

          description:
            error?.message ||
            "Something went wrong while updating the dispute.",

          variant:
            "destructive",
        });
      } finally {
        setUpdating(false);
      }
    };


  // ==========================================================
  // SUMMARY
  // ==========================================================

  const openCount = useMemo(
    () =>
      disputes.filter(
        (item) =>
          normalize(
            item.status,
          ) === "open",
      ).length,
    [disputes],
  );


  const investigatingCount =
    useMemo(
      () =>
        disputes.filter(
          (item) =>
            normalize(
              item.status,
            ) === "investigating",
        ).length,
      [disputes],
    );


  const urgentCount = useMemo(
    () =>
      disputes.filter(
        (item) =>
          normalize(
            item.priority,
          ) === "urgent",
      ).length,
    [disputes],
  );


  return (
    <AdminLayout>

      <div className="p-4 sm:p-6 lg:p-8 space-y-6">


        {/* ==================================================
            HEADER
        ================================================== */}

        <section>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>

              <div className="flex items-center gap-2">

                <AlertTriangle className="h-6 w-6 text-orange-500" />

                <h2 className="text-2xl font-bold text-gray-900">
                  Disputes
                </h2>

              </div>

              <p className="text-sm text-gray-500 mt-1">
                Investigate and manage customer transaction disputes.
              </p>

            </div>


            <Button
              type="button"
              variant="outline"
              onClick={() =>
                fetchDisputes(true)
              }
              disabled={
                loading ||
                refreshing
              }
              className="w-full sm:w-auto"
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


        {/* ==================================================
            FILTERS
        ================================================== */}

        <section className="bg-white border rounded-2xl p-4">

          <div className="flex items-center gap-2 mb-4">

            <Filter className="h-4 w-4 text-purple-600" />

            <h3 className="font-semibold text-gray-900">
              Dispute Filters
            </h3>

          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">


            {/* SEARCH */}

            <div className="xl:col-span-2 relative">

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
                placeholder="Search dispute, reference, customer, email..."
                className="pl-9"
              />

            </div>


            {/* STATUS */}

            <select
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value,
                );

                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              
              <option value="">
                All statuses
              </option>

              <option value="open">
                Open
              </option>

              <option value="investigating">
                Investigating
              </option>

              <option value="resolved">
                Resolved
              </option>

              <option value="rejected">
                Rejected
              </option>

            </select>


            {/* PRIORITY */}

            <select
              value={priority}
              onChange={(event) => {
                setPriority(
                  event.target.value,
                );

                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >

              <option value="">
                All priorities
              </option>

              <option value="urgent">
                Urgent
              </option>

              <option value="high">
                High
              </option>

              <option value="normal">
                Normal
              </option>

              <option value="low">
                Low
              </option>

            </select>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">

            {/* REASON */}

            <select
              value={reason}
              onChange={(event) => {
                setReason(
                  event.target.value,
                );

                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >

              <option value="">
                All dispute reasons
              </option>

              <option value="unauthorized">
                Unauthorized Transaction
              </option>

              <option value="failed_transfer">
                Failed Transfer
              </option>

              <option value="duplicate">
                Duplicate Transaction
              </option>

              <option value="wrong_amount">
                Wrong Amount
              </option>

              <option value="cash_not_received">
                Cash Not Received
              </option>

              <option value="service_not_received">
                Service Not Received
              </option>

              <option value="other">
                Other
              </option>

            </select>


            <div className="flex flex-wrap items-center gap-2">

              <Button
                type="button"
                size="sm"
                onClick={
                  handleSearch
                }
              >

                <Search className="h-4 w-4 mr-2" />

                Search

              </Button>


              {hasFilters && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={
                    clearFilters
                  }
                >

                  <XCircle className="h-4 w-4 mr-2" />

                  Clear filters

                </Button>
              )}

            </div>

          </div>

        </section>


        {/* ==================================================
            SUMMARY
        ================================================== */}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">


          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">

                <Activity className="h-5 w-5 text-purple-600" />

              </div>

              <div>

                <p className="text-xs text-gray-500">
                  Matching Disputes
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {totalCount.toLocaleString()}
                </p>

              </div>

            </div>

          </div>


          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">

                <Clock3 className="h-5 w-5 text-yellow-600" />

              </div>

              <div>

                <p className="text-xs text-gray-500">
                  Open
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {openCount}
                </p>

              </div>

            </div>

          </div>


          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">

                <Activity className="h-5 w-5 text-blue-600" />

              </div>

              <div>

                <p className="text-xs text-gray-500">
                  Investigating
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {investigatingCount}
                </p>

              </div>

            </div>

          </div>


          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">

                <AlertTriangle className="h-5 w-5 text-red-600" />

              </div>

              <div>

                <p className="text-xs text-gray-500">
                  Urgent
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {urgentCount}
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* ==================================================
            TABLE
        ================================================== */}

        <section className="bg-white border rounded-2xl overflow-hidden">

          <div className="px-5 py-4 border-b">

            <h3 className="font-bold text-gray-900">
              Dispute Records
            </h3>

            <p className="text-xs text-gray-500 mt-1">
              Urgent and high-priority disputes appear first.
            </p>

          </div>


          {loading ? (

            <div className="py-20 flex items-center justify-center">

              <div className="flex items-center gap-2 text-sm text-gray-500">

                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />

                Loading disputes...

              </div>

            </div>

          ) : disputes.length === 0 ? (

            <div className="py-20 text-center">

              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">

                <AlertTriangle className="h-6 w-6 text-gray-400" />

              </div>

              <p className="font-semibold text-gray-900 mt-4">
                No disputes found
              </p>

              <p className="text-sm text-gray-500 mt-1">
                Try changing your search or filters.
              </p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead className="bg-gray-50 border-b">

                  <tr>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Dispute
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Customer
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Transaction
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Reason
                    </th>

                    <th className="text-right px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Amount
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Priority
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Status
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Date
                    </th>

                    <th className="text-right px-5 py-3 font-semibold text-gray-500">
                      Action
                    </th>

                  </tr>

                </thead>


                <tbody className="divide-y">

                  {disputes.map(
                    (dispute) => (

                      <tr
                        key={
                          dispute.id
                        }
                        className="hover:bg-gray-50 transition"
                      >

                        {/* DISPUTE */}

                        <td className="px-5 py-4">

                          <div className="max-w-[210px]">

                            <p className="font-semibold text-gray-900 truncate">
                              {titleCase(
                                dispute.reason,
                              )}
                            </p>

                            <p className="text-[11px] font-mono text-gray-400 mt-1 truncate">
                              {dispute.id}
                            </p>

                          </div>

                        </td>


                        {/* CUSTOMER */}

                        <td className="px-5 py-4">

                          <div className="max-w-[190px]">

                            <p className="font-medium text-gray-900 truncate">

                              {
                                dispute.user_full_name ||
                                "Unknown customer"
                              }

                            </p>

                            <p className="text-[11px] text-gray-400 mt-1 truncate">

                              {
                                dispute.user_email ||
                                dispute.user_phone ||
                                "—"
                              }

                            </p>

                          </div>

                        </td>


                        {/* TRANSACTION */}

                        <td className="px-5 py-4">

                          <div className="max-w-[210px]">

                            <p className="font-semibold text-gray-900 truncate">

                              {
                                dispute.transaction_reference ||
                                "—"
                              }

                            </p>

                            <p className="text-[11px] text-gray-400 mt-1">

                              {
                                titleCase(
                                  dispute.transaction_type,
                                )
                              }

                            </p>

                            {dispute.transaction_provider && (
                              <p className="text-[11px] text-gray-400 mt-1">

                                {
                                  dispute.transaction_provider
                                }

                              </p>
                            )}

                          </div>

                        </td>


                        {/* REASON */}

                        <td className="px-5 py-4">

                          <span className="text-gray-700">
                            {
                              titleCase(
                                dispute.reason,
                              )
                            }
                          </span>

                        </td>


                        {/* AMOUNT */}

                        <td className="px-5 py-4 text-right whitespace-nowrap">

                          <span className="font-bold text-gray-900">

                            {
                              formatMoney(
                                dispute.amount,
                                dispute.currency,
                              )
                            }

                          </span>

                        </td>


                        {/* PRIORITY */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${priorityClasses(
                              dispute.priority,
                            )}`}
                          >

                            {
                              titleCase(
                                dispute.priority,
                              )
                            }

                          </span>

                        </td>


                        {/* STATUS */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusClasses(
                              dispute.status,
                            )}`}
                          >

                            {
                              statusIcon(
                                dispute.status,
                              )
                            }

                            {
                              titleCase(
                                dispute.status,
                              )
                            }

                          </span>

                        </td>


                        {/* DATE */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span className="text-xs text-gray-600">

                            {
                              formatDate(
                                dispute.created_at,
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
                              openDispute(
                                dispute,
                              )
                            }
                          >

                            <Eye className="h-4 w-4 mr-1" />

                            View

                          </Button>

                        </td>

                      </tr>

                    ),
                  )}

                </tbody>

              </table>

            </div>

          )}


          {/* ==================================================
              PAGINATION
          ================================================== */}

          {!loading &&
            disputes.length > 0 && (

              <div className="border-t px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                <p className="text-xs text-gray-500">

                  Showing{" "}

                  <span className="font-semibold text-gray-700">
                    {
                      (page - 1) *
                      PAGE_SIZE +
                      1
                    }
                  </span>

                  {" "}–{" "}

                  <span className="font-semibold text-gray-700">

                    {
                      Math.min(
                        page *
                          PAGE_SIZE,
                        totalCount,
                      )
                    }

                  </span>

                  {" "}of{" "}

                  <span className="font-semibold text-gray-700">
                    {totalCount}
                  </span>

                </p>


                <div className="flex items-center gap-2">

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

                    <ChevronLeft className="h-4 w-4 mr-1" />

                    Previous

                  </Button>


                  <span className="text-xs text-gray-500 px-2">

                    {page} / {totalPages}

                  </span>


                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      page >=
                        totalPages ||
                      loading
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

                    <ChevronRight className="h-4 w-4 ml-1" />

                  </Button>

                </div>

              </div>

            )}

        </section>


        {/* ==================================================
            DETAILS MODAL
        ================================================== */}

        {selectedDispute && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

            <button
              type="button"
              aria-label="Close dispute details"
              onClick={() =>
                setSelectedDispute(
                  null,
                )
              }
              className="absolute inset-0 bg-black/40"
            />


            <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-xl">


              {/* HEADER */}

              <div className="sticky top-0 z-20 bg-white border-b px-5 py-4 flex items-center justify-between">

                <div>

                  <div className="flex items-center gap-2">

                    <AlertTriangle className="h-5 w-5 text-orange-500" />

                    <h3 className="font-bold text-gray-900">
                      Dispute Details
                    </h3>

                  </div>

                  <p className="text-xs text-gray-400 mt-1 font-mono break-all">

                    {
                      selectedDispute.id
                    }

                  </p>

                </div>


                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setSelectedDispute(
                      null,
                    )
                  }
                >

                  <X className="h-5 w-5" />

                </Button>

              </div>


              <div className="p-5 space-y-5">


                {/* ==================================================
                    AMOUNT / STATUS
                ================================================== */}

                <div className="rounded-2xl bg-gray-50 border p-5">

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                    <div className="md:col-span-1">

                      <p className="text-xs text-gray-500">
                        Disputed Amount
                      </p>

                      <p className="text-3xl font-bold text-gray-900 mt-2">

                        {
                          formatMoney(
                            selectedDispute.amount,
                            selectedDispute.currency,
                          )
                        }

                      </p>

                    </div>


                    <div>

                      <p className="text-xs text-gray-500">
                        Status
                      </p>

                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mt-2 ${statusClasses(
                          selectedDispute.status,
                        )}`}
                      >

                        {
                          statusIcon(
                            selectedDispute.status,
                          )
                        }

                        {
                          titleCase(
                            selectedDispute.status,
                          )
                        }

                      </span>

                    </div>


                    <div>

                      <p className="text-xs text-gray-500">
                        Priority
                      </p>

                      <span
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold mt-2 ${priorityClasses(
                          selectedDispute.priority,
                        )}`}
                      >

                        {
                          titleCase(
                            selectedDispute.priority,
                          )
                        }

                      </span>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    CUSTOMER
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <div className="flex items-center gap-2 mb-4">

                    <User className="h-4 w-4 text-purple-600" />

                    <h4 className="font-bold text-gray-900">
                      Customer
                    </h4>

                  </div>


                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


                    <div>

                      <p className="text-xs text-gray-400">
                        Full Name
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">

                        {
                          selectedDispute.user_full_name ||
                          "Unknown customer"
                        }

                      </p>

                    </div>


                    <div>

                      <p className="text-xs text-gray-400">
                        Email
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <Mail className="h-4 w-4 text-gray-400 shrink-0" />

                        <p className="text-sm font-semibold text-gray-900 break-all">

                          {
                            selectedDispute.user_email ||
                            "—"
                          }

                        </p>

                      </div>

                    </div>


                    <div>

                      <p className="text-xs text-gray-400">
                        Phone
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <Phone className="h-4 w-4 text-gray-400 shrink-0" />

                        <p className="text-sm font-semibold text-gray-900">

                          {
                            selectedDispute.user_phone ||
                            "—"
                          }

                        </p>

                      </div>

                    </div>


                    <div>

                      <p className="text-xs text-gray-400">
                        User ID
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-xs font-mono text-gray-700 break-all">

                          {
                            selectedDispute.user_id
                          }

                        </p>

                        <button
                          type="button"
                          className="shrink-0 text-gray-400 hover:text-gray-700"
                          onClick={() =>
                            copyToClipboard(
                              selectedDispute.user_id,
                              "User ID",
                              toast,
                            )
                          }
                        >

                          <Copy className="h-3.5 w-3.5" />

                        </button>

                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    ORIGINAL TRANSACTION
                ================================================== */}

                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5">

                  <div className="flex items-center gap-2 mb-4">

                    <Wallet className="h-5 w-5 text-purple-600" />

                    <div>

                      <h4 className="font-bold text-gray-900">
                        Original Transaction
                      </h4>

                      <p className="text-xs text-gray-500">
                        Transaction associated with this dispute.
                      </p>

                    </div>

                  </div>


                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Reference
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-sm font-mono font-semibold text-gray-900 break-all">

                          {
                            selectedDispute.transaction_reference ||
                            "—"
                          }

                        </p>

                        {selectedDispute.transaction_reference && (
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-700 shrink-0"
                            onClick={() =>
                              copyToClipboard(
                                selectedDispute.transaction_reference!,
                                "Transaction reference",
                                toast,
                              )
                            }
                          >

                            <Copy className="h-3.5 w-3.5" />

                          </button>
                        )}

                      </div>

                    </div>


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Transaction Type
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">

                        {
                          titleCase(
                            selectedDispute.transaction_type,
                          )
                        }

                      </p>

                    </div>


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Transaction Status
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">

                        {
                          titleCase(
                            selectedDispute.transaction_status,
                          )
                        }

                      </p>

                    </div>


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Category
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">

                        {
                          titleCase(
                            selectedDispute.transaction_category,
                          ) || "—"
                        }

                      </p>

                    </div>


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Provider
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <Building2 className="h-4 w-4 text-purple-500" />

                        <p className="text-sm font-semibold text-gray-900">

                          {
                            selectedDispute.transaction_provider ||
                            "—"
                          }

                        </p>

                      </div>

                    </div>


                    <div className="bg-white border rounded-xl p-3">

                      <p className="text-[11px] text-gray-400">
                        Provider Reference
                      </p>

                      <p className="text-sm font-mono text-gray-700 mt-1 break-all">

                        {
                          selectedDispute.provider_reference ||
                          "—"
                        }

                      </p>

                    </div>


                    <div className="bg-white border rounded-xl p-3 sm:col-span-2">

                      <p className="text-[11px] text-gray-400">
                        Transaction ID
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-xs font-mono text-gray-700 break-all">

                          {
                            selectedDispute.transaction_id
                          }

                        </p>

                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-700 shrink-0"
                          onClick={() =>
                            copyToClipboard(
                              selectedDispute.transaction_id,
                              "Transaction ID",
                              toast,
                            )
                          }
                        >

                          <Copy className="h-3.5 w-3.5" />

                        </button>

                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    DISPUTE DESCRIPTION
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <h4 className="font-bold text-gray-900">
                    Dispute Information
                  </h4>


                  <div className="mt-4 space-y-4">

                    <div>

                      <p className="text-xs text-gray-400">
                        Reason
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">

                        {
                          titleCase(
                            selectedDispute.reason,
                          )
                        }

                      </p>

                    </div>


                    <div>

                      <p className="text-xs text-gray-400">
                        Customer Description
                      </p>

                      <div className="mt-1 rounded-xl bg-gray-50 border p-4">

                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">

                          {
                            selectedDispute.description ||
                            "No description provided."
                          }

                        </p>

                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    ADMIN ACTION
                ================================================== */}

                <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">

                  <div className="flex items-center gap-2 mb-4">

                    <Activity className="h-5 w-5 text-blue-600" />

                    <div>

                      <h4 className="font-bold text-gray-900">
                        Admin Action
                      </h4>

                      <p className="text-xs text-gray-500">
                        Update the investigation status, priority and internal notes.
                      </p>

                    </div>

                  </div>


                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


                    <div>

                      <label className="text-xs font-semibold text-gray-600">
                        Status
                      </label>

                      <select
                        value={editStatus}
                        onChange={(event) =>
                          setEditStatus(
                            event.target.value,
                          )
                        }
                        className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      >

                        <option value="open">
                          Open
                        </option>

                        <option value="investigating">
                          Investigating
                        </option>

                        <option value="resolved">
                          Resolved
                        </option>

                        <option value="rejected">
                          Rejected
                        </option>

                      </select>

                    </div>


                    <div>

                      <label className="text-xs font-semibold text-gray-600">
                        Priority
                      </label>

                      <select
                        value={editPriority}
                        onChange={(event) =>
                          setEditPriority(
                            event.target.value,
                          )
                        }
                        className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      >

                        <option value="low">
                          Low
                        </option>

                        <option value="normal">
                          Normal
                        </option>

                        <option value="high">
                          High
                        </option>

                        <option value="urgent">
                          Urgent
                        </option>

                      </select>

                    </div>


                    <div className="sm:col-span-2">

                      <label className="text-xs font-semibold text-gray-600">
                        Internal Admin Notes
                      </label>

                      <textarea
                        value={editNotes}
                        onChange={(event) =>
                          setEditNotes(
                            event.target.value,
                          )
                        }
                        rows={5}
                        placeholder="Add internal investigation notes..."
                        className="mt-1 w-full rounded-xl border border-input bg-white px-3 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />

                    </div>

                  </div>


                  <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setSelectedDispute(
                          null,
                        )
                      }
                      disabled={updating}
                    >
                      Close
                    </Button>


                    <Button
                      type="button"
                      onClick={
                        handleUpdateDispute
                      }
                      disabled={
                        updating
                      }
                    >

                      {updating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}

                      {updating
                        ? "Updating..."
                        : "Save Changes"}

                    </Button>

                  </div>

                </div>


                {/* ==================================================
                    RESOLUTION
                ================================================== */}

                {(selectedDispute.resolution ||
                  selectedDispute.resolved_at ||
                  selectedDispute.resolved_by) && (

                  <div className="rounded-2xl border border-green-200 bg-green-50 p-5">

                    <div className="flex items-center gap-2 mb-4">

                      <CheckCircle2 className="h-5 w-5 text-green-600" />

                      <h4 className="font-bold text-green-900">
                        Resolution
                      </h4>

                    </div>


                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      <div>

                        <p className="text-xs text-green-600">
                          Resolution
                        </p>

                        <p className="text-sm text-green-900 mt-1">

                          {
                            selectedDispute.resolution ||
                            "No resolution recorded."
                          }

                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-green-600">
                          Resolved At
                        </p>

                        <p className="text-sm text-green-900 mt-1">

                          {
                            formatDate(
                              selectedDispute.resolved_at,
                            )
                          }

                        </p>

                      </div>


                      {selectedDispute.resolved_by && (

                        <div className="sm:col-span-2">

                          <p className="text-xs text-green-600">
                            Resolved By
                          </p>

                          <div className="flex items-center gap-2 mt-1">

                            <p className="text-xs font-mono text-green-900 break-all">

                              {
                                selectedDispute.resolved_by
                              }

                            </p>

                            <button
                              type="button"
                              className="text-green-600 hover:text-green-800"
                              onClick={() =>
                                copyToClipboard(
                                  selectedDispute.resolved_by!,
                                  "Resolver ID",
                                  toast,
                                )
                              }
                            >

                              <Copy className="h-3.5 w-3.5" />

                            </button>

                          </div>

                        </div>

                      )}

                    </div>

                  </div>

                )}


                {/* ==================================================
                    TIMESTAMPS
                ================================================== */}

                <div className="rounded-xl border bg-gray-50 p-4">

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                    <div>

                      <p className="text-[11px] text-gray-400">
                        Created
                      </p>

                      <p className="text-xs text-gray-700 mt-1">
                        {
                          formatDate(
                            selectedDispute.created_at,
                          )
                        }
                      </p>

                    </div>


                    <div>

                      <p className="text-[11px] text-gray-400">
                        Last Updated
                      </p>

                      <p className="text-xs text-gray-700 mt-1">
                        {
                          formatDate(
                            selectedDispute.updated_at,
                          )
                        }
                      </p>

                    </div>


                    <div>

                      <p className="text-[11px] text-gray-400">
                        Currency
                      </p>

                      <p className="text-xs font-semibold text-gray-700 mt-1">
                        {
                          selectedDispute.currency
                        }
                      </p>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        )}

      </div>

    </AdminLayout>
  );
};


export default AdminDisputesPage;
