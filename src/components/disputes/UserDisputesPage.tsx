import React, {  useCallback,  useEffect,  useMemo,  useState, } from "react";
import {  AlertCircle,  CheckCircle2,  Clock3,  Eye,  FileText,  Loader2,  Plus,  RefreshCw,  Search,  X,  XCircle, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";


interface UserDispute {
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
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  transaction_reference: string;
  transaction_type: string;
  transaction_status: string;
  transaction_category: string | null;
  transaction_provider: string | null;
  provider_reference: string | null;
  total_count?: number;
}


interface UserTransaction {
  id: string;
  amount: number | string;

  currency: string;

  description: string | null;

  status: string;

  reference_number: string;

  created_at: string;

  transaction_type: string;

  category: string | null;

  provider: string | null;

  provider_reference: string | null;
}


const PAGE_SIZE = 20;


const formatMoney = (
  amount: number | string,
  currency = "NGN",
) => {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    },
  ).format(Number(amount || 0));
};


const formatDate = (
  value: string | null,
) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
};


const normalizeStatus = (
  value: string,
) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};


const statusClasses = (
  status: string,
) => {
  switch (normalizeStatus(status)) {
    case "resolved":
      return "bg-green-100 text-green-700";

    case "investigating":
      return "bg-blue-100 text-blue-700";

    case "open":
      return "bg-yellow-100 text-yellow-700";

    case "rejected":
      return "bg-red-100 text-red-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


const statusIcon = (
  status: string,
) => {
  switch (normalizeStatus(status)) {
    case "resolved":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "investigating":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    case "open":
      return (
        <AlertCircle className="h-3.5 w-3.5" />
      );

    case "rejected":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    default:
      return (
        <FileText className="h-3.5 w-3.5" />
      );
  }
};


const priorityClasses = (
  priority: string,
) => {
  switch (
    String(priority || "")
      .toLowerCase()
  ) {
    case "urgent":
      return "bg-red-100 text-red-700";

    case "high":
      return "bg-orange-100 text-orange-700";

    case "normal":
      return "bg-gray-100 text-gray-600";

    case "low":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


const transactionTypeLabel = (
  value: string,
) => {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
};


const UserDisputesPage = () => {
  const { toast } = useToast();

  const [disputes, setDisputes] =
    useState<UserDispute[]>([]);

  const [transactions, setTransactions] =
    useState<UserTransaction[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [loadingTransactions, setLoadingTransactions] =
    useState(false);

  const [submitting, setSubmitting] =
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

  const [selectedDispute, setSelectedDispute] =
    useState<UserDispute | null>(null);

  const [showCreate, setShowCreate] =
    useState(false);

  const [selectedTransactionId, setSelectedTransactionId] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [priority, setPriority] =
    useState("normal");


  const totalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(
        totalCount / PAGE_SIZE,
      ),
    );
  }, [totalCount]);


  // ==========================================================
  // FETCH DISPUTES
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
            "get_my_disputes",
            {
              p_page: page,
              p_page_size: PAGE_SIZE,
              p_search:
                search.trim() || null,
              p_status:
                status || null,
            },
          );

          if (error) {
            throw error;
          }

          const rows =
            (data || []) as UserDispute[];

          setDisputes(rows);

          setTotalCount(
            Number(
              rows[0]?.total_count || 0,
            ),
          );
        } catch (error: any) {
          console.error(
            "User disputes fetch failed:",
            error,
          );

          toast({
            title: "Unable to load disputes",
            description:
              error?.message ||
              "Something went wrong while loading your disputes.",
            variant: "destructive",
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
        toast,
      ],
    );


  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);


  // ==========================================================
  // FETCH USER TRANSACTIONS FOR CREATE DISPUTE
  // ==========================================================

  const fetchTransactions =
    useCallback(
      async () => {
        setLoadingTransactions(true);

        try {
          const {
            data: {
              user,
            },
          } = await supabase.auth.getUser();

          if (!user) {
            throw new Error(
              "Authentication required",
            );
          }

          const {
            data,
            error,
          } = await supabase
            .from("transactions")
            .select(
              `
                id,
                amount,
                currency,
                description,
                status,
                reference_number,
                created_at,
                transaction_type,
                category,
                provider,
                provider_reference
              `,
            )
            .eq(
              "user_id",
              user.id,
            )
            .not(
              "status",
              "in",
              "(pending,processing,queued)",
            )
            .order(
              "created_at",
              {
                ascending: false,
              },
            )
            .limit(100);

          if (error) {
            throw error;
          }

          setTransactions(
            (data || []) as UserTransaction[],
          );
        } catch (error: any) {
          console.error(
            "User transactions fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load transactions",
            description:
              error?.message ||
              "Unable to load your transactions.",
            variant: "destructive",
          });
        } finally {
          setLoadingTransactions(false);
        }
      },
      [toast],
    );


  // ==========================================================
  // CREATE DISPUTE
  // ==========================================================

  const handleCreateDispute =
    async () => {
      if (!selectedTransactionId) {
        toast({
          title: "Select a transaction",
          description:
            "Please select the transaction you want to dispute.",
          variant: "destructive",
        });

        return;
      }

      if (!reason.trim()) {
        toast({
          title: "Reason required",
          description:
            "Please select a dispute reason.",
          variant: "destructive",
        });

        return;
      }

      setSubmitting(true);

      try {
        const {
          error,
        } = await supabase.rpc(
          "create_my_dispute",
          {
            p_transaction_id:
              selectedTransactionId,

            p_reason:
              reason.trim(),

            p_description:
              description.trim() ||
              null,

            p_priority:
              priority,
          },
        );

        if (error) {
          throw error;
        }

        toast({
          title: "Dispute submitted",
          description:
            "Your dispute has been submitted successfully. Our support team will review it.",
        });

        setShowCreate(false);

        setSelectedTransactionId("");
        setReason("");
        setDescription("");
        setPriority("normal");

        setPage(1);

        await fetchDisputes(true);
      } catch (error: any) {
        console.error(
          "Create dispute failed:",
          error,
        );

        toast({
          title:
            "Unable to submit dispute",
          description:
            error?.message ||
            "Something went wrong while submitting your dispute.",
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    };


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
    setPage(1);
  };


  const openCreateModal =
    async () => {
      setShowCreate(true);

      if (
        transactions.length === 0
      ) {
        await fetchTransactions();
      }
    };


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">

      {/* HEADER */}

      <section>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          <div>

            <h1 className="text-2xl font-bold text-gray-900">
              Disputes
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Report and track issues with your transactions.
            </p>

          </div>

          <div className="flex gap-2">

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
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}

              Refresh
            </Button>

            <Button
              type="button"
              onClick={openCreateModal}
            >
              <Plus className="h-4 w-4 mr-2" />

              New dispute
            </Button>

          </div>

        </div>

      </section>


      {/* FILTERS */}

      <section className="bg-white border rounded-2xl p-4">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <div className="relative md:col-span-2">

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
              placeholder="Search dispute ID or transaction reference..."
              className="pl-9"
            />

          </div>

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

        </div>

        <div className="flex gap-2 mt-3">

          <Button
            type="button"
            size="sm"
            onClick={handleSearch}
          >
            <Search className="h-4 w-4 mr-2" />

            Search
          </Button>

          {(search || status) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}

        </div>

      </section>


      {/* RECORDS */}

      <section className="bg-white border rounded-2xl overflow-hidden">

        <div className="px-5 py-4 border-b">

          <h2 className="font-bold text-gray-900">
            My Disputes
          </h2>

          <p className="text-xs text-gray-500 mt-1">
            Track the status of issues you have reported.
          </p>

        </div>


        {loading ? (

          <div className="py-20 flex justify-center">

            <div className="flex items-center gap-2 text-sm text-gray-500">

              <Loader2 className="h-5 w-5 animate-spin text-purple-600" />

              Loading disputes...

            </div>

          </div>

        ) : disputes.length === 0 ? (

          <div className="py-20 text-center">

            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">

              <FileText className="h-6 w-6 text-gray-400" />

            </div>

            <p className="font-semibold text-gray-900 mt-4">
              No disputes found
            </p>

            <p className="text-sm text-gray-500 mt-1">
              You currently have no transaction disputes.
            </p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-50 border-b">

                <tr>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Transaction
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Reason
                  </th>

                  <th className="text-right px-5 py-3 font-semibold text-gray-500">
                    Amount
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Priority
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Status
                  </th>

                  <th className="text-left px-5 py-3 font-semibold text-gray-500">
                    Date
                  </th>

                  <th className="text-right px-5 py-3">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y">

                {disputes.map(
                  (dispute) => (
                    <tr
                      key={dispute.id}
                      className="hover:bg-gray-50"
                    >

                      <td className="px-5 py-4">

                        <p className="font-semibold text-gray-900">
                          {
                            transactionTypeLabel(
                              dispute.transaction_type,
                            )
                          }
                        </p>

                        <p className="text-[11px] text-gray-400 font-mono mt-1">
                          {
                            dispute.transaction_reference
                          }
                        </p>

                      </td>


                      <td className="px-5 py-4">

                        <p className="font-medium text-gray-900">
                          {
                            dispute.reason
                          }
                        </p>

                        {dispute.description && (
                          <p className="text-xs text-gray-400 mt-1 max-w-[250px] truncate">
                            {
                              dispute.description
                            }
                          </p>
                        )}

                      </td>


                      <td className="px-5 py-4 text-right font-bold">

                        {
                          formatMoney(
                            dispute.amount,
                            dispute.currency,
                          )
                        }

                      </td>


                      <td className="px-5 py-4">

                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${priorityClasses(
                            dispute.priority,
                          )}`}
                        >
                          {
                            dispute.priority
                          }
                        </span>

                      </td>


                      <td className="px-5 py-4">

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
                            dispute.status
                          }

                        </span>

                      </td>


                      <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-500">

                        {
                          formatDate(
                            dispute.created_at,
                          )
                        }

                      </td>


                      <td className="px-5 py-4 text-right">

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelectedDispute(
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


        {/* PAGINATION */}

        {!loading &&
          disputes.length > 0 && (

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


      {/* ======================================================
          CREATE DISPUTE MODAL
      ====================================================== */}

      {showCreate && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

          <button
            type="button"
            aria-label="Close"
            onClick={() =>
              setShowCreate(false)
            }
            className="absolute inset-0 bg-black/40"
          />

          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">

            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">

              <div>

                <h3 className="font-bold text-gray-900">
                  Report a transaction issue
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Select the transaction you want us to investigate.
                </p>

              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setShowCreate(false)
                }
              >
                <X className="h-5 w-5" />
              </Button>

            </div>


            <div className="p-5 space-y-5">

              {/* TRANSACTION */}

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  Transaction
                </label>

                {loadingTransactions ? (

                  <div className="mt-2 h-10 border rounded-md flex items-center px-3 text-sm text-gray-500">

                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                    Loading your transactions...

                  </div>

                ) : (

                  <select
                    value={
                      selectedTransactionId
                    }
                    onChange={(event) =>
                      setSelectedTransactionId(
                        event.target.value,
                      )
                    }
                    className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >

                    <option value="">
                      Select transaction
                    </option>

                    {transactions.map(
                      (transaction) => (
                        <option
                          key={
                            transaction.id
                          }
                          value={
                            transaction.id
                          }
                        >
                          {formatMoney(
                            transaction.amount,
                            transaction.currency,
                          )}{" "}
                          —{" "}
                          {
                            transaction.reference_number
                          }
                        </option>
                      ),
                    )}

                  </select>

                )}

              </div>


              {/* REASON */}

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  Reason
                </label>

                <select
                  value={reason}
                  onChange={(event) =>
                    setReason(
                      event.target.value,
                    )
                  }
                  className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >

                  <option value="">
                    Select a reason
                  </option>

                  <option value="Unauthorized transaction">
                    Unauthorized transaction
                  </option>

                  <option value="Transaction failed but wallet was debited">
                    Transaction failed but wallet was debited
                  </option>

                  <option value="Recipient did not receive funds">
                    Recipient did not receive funds
                  </option>

                  <option value="Incorrect amount">
                    Incorrect amount
                  </option>

                  <option value="Duplicate transaction">
                    Duplicate transaction
                  </option>

                  <option value="Service not received">
                    Service not received
                  </option>

                  <option value="Other">
                    Other
                  </option>

                </select>

              </div>


              {/* PRIORITY */}

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  Priority
                </label>

                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(
                      event.target.value,
                    )
                  }
                  className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
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

                </select>

              </div>


              {/* DESCRIPTION */}

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(
                      event.target.value,
                    )
                  }
                  placeholder="Explain what happened..."
                  rows={5}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />

              </div>


              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">

                <p className="text-xs text-blue-700 leading-relaxed">
                  Please provide accurate information. Your dispute will be reviewed by the IyanjuPay support team.
                </p>

              </div>


              <Button
                type="button"
                className="w-full"
                disabled={
                  submitting ||
                  loadingTransactions
                }
                onClick={
                  handleCreateDispute
                }
              >

                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}

                Submit dispute

              </Button>

            </div>

          </div>

        </div>

      )}


      {/* ======================================================
          DETAILS MODAL
      ====================================================== */}

      {selectedDispute && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

          <button
            type="button"
            aria-label="Close"
            onClick={() =>
              setSelectedDispute(null)
            }
            className="absolute inset-0 bg-black/40"
          />

          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">

            <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex items-center justify-between">

              <div>

                <h3 className="font-bold text-gray-900">
                  Dispute Details
                </h3>

                <p className="text-[11px] text-gray-400 font-mono mt-1 break-all">
                  {selectedDispute.id}
                </p>

              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setSelectedDispute(null)
                }
              >
                <X className="h-5 w-5" />
              </Button>

            </div>


            <div className="p-5 space-y-5">

              {/* STATUS */}

              <div className="rounded-2xl bg-gray-50 border p-5 text-center">

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

                <div className="flex justify-center gap-2 mt-3">

                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusClasses(
                      selectedDispute.status,
                    )}`}
                  >

                    {
                      statusIcon(
                        selectedDispute.status,
                      )
                    }

                    {
                      selectedDispute.status
                    }

                  </span>

                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${priorityClasses(
                      selectedDispute.priority,
                    )}`}
                  >

                    {
                      selectedDispute.priority
                    }

                  </span>

                </div>

              </div>


              {/* TRANSACTION */}

              <div className="rounded-2xl border p-5">

                <h4 className="font-bold text-gray-900 mb-4">
                  Transaction
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <p className="text-xs text-gray-400">
                      Reference
                    </p>

                    <p className="text-sm font-mono font-semibold mt-1 break-all">
                      {
                        selectedDispute.transaction_reference
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">
                      Type
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {
                        transactionTypeLabel(
                          selectedDispute.transaction_type,
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">
                      Transaction Status
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {
                        selectedDispute.transaction_status
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">
                      Provider
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {
                        selectedDispute.transaction_provider ||
                        "—"
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">
                      Provider Reference
                    </p>

                    <p className="text-xs font-mono mt-1 break-all">
                      {
                        selectedDispute.provider_reference ||
                        "—"
                      }
                    </p>
                  </div>

                </div>

              </div>


              {/* ISSUE */}

              <div className="rounded-2xl border p-5">

                <h4 className="font-bold text-gray-900 mb-4">
                  Reported Issue
                </h4>

                <p className="text-sm font-semibold text-gray-900">
                  {
                    selectedDispute.reason
                  }
                </p>

                {selectedDispute.description && (
                  <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap leading-relaxed">
                    {
                      selectedDispute.description
                    }
                  </p>
                )}

                <p className="text-xs text-gray-400 mt-4">
                  Submitted{" "}
                  {
                    formatDate(
                      selectedDispute.created_at,
                    )
                  }
                </p>

              </div>


              {/* ADMIN RESPONSE */}

              {(selectedDispute.admin_notes ||
                selectedDispute.resolution) && (

                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5">

                  <h4 className="font-bold text-gray-900 mb-4">
                    IyanjuPay Response
                  </h4>

                  {selectedDispute.admin_notes && (
                    <div>

                      <p className="text-xs text-gray-500">
                        Support notes
                      </p>

                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {
                          selectedDispute.admin_notes
                        }
                      </p>

                    </div>
                  )}

                  {selectedDispute.resolution && (
                    <div className="mt-4">

                      <p className="text-xs text-gray-500">
                        Resolution
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1 whitespace-pre-wrap">
                        {
                          selectedDispute.resolution
                        }
                      </p>

                    </div>
                  )}

                  {selectedDispute.resolved_at && (
                    <p className="text-xs text-gray-400 mt-4">
                      Resolved{" "}
                      {
                        formatDate(
                          selectedDispute.resolved_at,
                        )
                      }
                    </p>
                  )}

                </div>

              )}

            </div>

          </div>

        </div>

      )}

    </div>
  );
};


export default UserDisputesPage;
