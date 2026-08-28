import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";

import AdminLayout from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";


interface AdminTransaction {
  id: string;
  user_id: string;
  wallet_id: string | null;
  transaction_type: string;
  amount: number | string;
  description: string | null;
  status: string;
  reference_number: string;
  created_at: string | null;
  updated_at: string | null;
  currency: string;
  category: string | null;
  provider: string | null;
  provider_reference: string | null;
  metadata: Record<string, any>;
  completed_at: string | null;
  chargeback_status: string | null;
  chargeback_amount: number | string | null;
  chargeback_reference: string | null;
  chargeback_at: string | null;

  user_full_name: string | null;
  user_email: string | null;
  user_phone: string | null;

  total_count: number;
}


const PAGE_SIZE = 25;


const formatMoney = (
  amount: number | string,
  currency = "NGN"
) => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }
  ).format(value);
};


const formatDate = (
  value: string | null
) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(new Date(value));
};


const normalizeStatus = (
  status: string
) => {
  return String(status || "")
    .trim()
    .toLowerCase();
};


const statusClasses = (
  status: string
) => {
  switch (normalizeStatus(status)) {
    case "completed":
    case "successful":
    case "success":
      return "bg-green-100 text-green-700";

    case "pending":
    case "processing":
    case "queued":
      return "bg-yellow-100 text-yellow-700";

    case "failed":
    case "cancelled":
    case "canceled":
    case "reversed":
      return "bg-red-100 text-red-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
};


const statusIcon = (
  status: string
) => {
  switch (normalizeStatus(status)) {
    case "completed":
    case "successful":
    case "success":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "pending":
    case "processing":
    case "queued":
      return (
        <Clock3 className="h-3.5 w-3.5" />
      );

    case "failed":
    case "cancelled":
    case "canceled":
    case "reversed":
      return (
        <XCircle className="h-3.5 w-3.5" />
      );

    default:
      return (
        <Activity className="h-3.5 w-3.5" />
      );
  }
};


const transactionTypeLabel = (
  value: string
) => {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
};


const AdminTransactionsPage = () => {
  const { toast } = useToast();

  const [transactions, setTransactions] =
    useState<AdminTransaction[]>([]);

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

  const [
    transactionType,
    setTransactionType,
  ] = useState("");

  const [category, setCategory] =
    useState("");

  const [selectedTransaction, setSelectedTransaction] =
    useState<AdminTransaction | null>(null);


  const totalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(
        totalCount / PAGE_SIZE
      )
    );
  }, [totalCount]);


  const fetchTransactions =
    useCallback(
      async (
        showRefresh = false
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
            "admin_get_transactions",
            {
              p_page: page,
              p_page_size: PAGE_SIZE,
              p_search:
                search.trim() || null,
              p_status:
                status || null,
              p_transaction_type:
                transactionType || null,
              p_category:
                category || null,
              p_date_from: null,
              p_date_to: null,
            }
          );

          if (error) {
            throw error;
          }

          const rows =
            (data ||
              []) as AdminTransaction[];

          setTransactions(rows);

          setTotalCount(
            Number(
              rows[0]?.total_count || 0
            )
          );
        } catch (error: any) {
          console.error(
            "Admin transactions fetch failed:",
            error
          );

          toast({
            title:
              "Unable to load transactions",
            description:
              error?.message ||
              "Something went wrong while loading transactions.",
            variant:
              "destructive",
          });

          setTransactions([]);
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
        transactionType,
        category,
        toast,
      ]
    );


  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);


  const handleSearch = () => {
    setPage(1);
    setSearch(
      searchInput.trim()
    );
  };


  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setTransactionType("");
    setCategory("");
    setPage(1);
  };


  const hasFilters =
    search ||
    status ||
    transactionType ||
    category;


  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">

        {/* ==================================================
            HEADER
        ================================================== */}

        <section>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Transactions
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Monitor customer wallet and payment
                transactions across IyanjuPay.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                fetchTransactions(true)
              }
              disabled={loading || refreshing}
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
              Transaction Filters
            </h3>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">

            {/* SEARCH */}

            <div className="xl:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

              <Input
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    handleSearch();
                  }
                }}
                placeholder="Search reference, customer, email..."
                className="pl-9"
              />
            </div>


            {/* STATUS */}

            <select
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value
                );
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                All statuses
              </option>

              <option value="completed">
                Completed
              </option>

              <option value="successful">
                Successful
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="processing">
                Processing
              </option>

              <option value="failed">
                Failed
              </option>

              <option value="reversed">
                Reversed
              </option>
            </select>


            {/* TYPE */}

            <select
              value={transactionType}
              onChange={(event) => {
                setTransactionType(
                  event.target.value
                );
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                All transaction types
              </option>

              <option value="deposit">
                Deposit
              </option>

              <option value="transfer">
                Transfer
              </option>

              <option value="bill_payment">
                Bill Payment
              </option>

              <option value="airtime">
                Airtime
              </option>

              <option value="data">
                Data
              </option>

              <option value="electricity">
                Electricity
              </option>

              <option value="cable">
                Cable
              </option>

              <option value="internet">
                Internet
              </option>
            </select>


            {/* CATEGORY */}

            <select
              value={category}
              onChange={(event) => {
                setCategory(
                  event.target.value
                );
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                All categories
              </option>

              <option value="funding">
                Funding
              </option>

              <option value="transfer">
                Transfer
              </option>

              <option value="bills">
                Bills
              </option>

              <option value="airtime">
                Airtime
              </option>

              <option value="data">
                Data
              </option>

              <option value="electricity">
                Electricity
              </option>

              <option value="cable">
                Cable
              </option>

              <option value="internet">
                Internet
              </option>
            </select>

          </div>


          <div className="flex flex-wrap items-center gap-2 mt-3">

            <Button
              type="button"
              size="sm"
              onClick={handleSearch}
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>

            {hasFilters && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearFilters}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear filters
              </Button>
            )}

          </div>

        </section>


        {/* ==================================================
            SUMMARY
        ================================================== */}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Activity className="h-5 w-5 text-purple-600" />
              </div>

              <div>
                <p className="text-xs text-gray-500">
                  Matching Transactions
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {totalCount.toLocaleString()}
                </p>
              </div>
            </div>

          </div>


          <div className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <ArrowDownToLine className="h-5 w-5 text-green-600" />
              </div>

              <div>
                <p className="text-xs text-gray-500">
                  Current Page
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {transactions.length.toLocaleString()}
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
                  Page
                </p>

                <p className="text-xl font-bold text-gray-900">
                  {page} / {totalPages}
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
              Transaction Records
            </h3>

            <p className="text-xs text-gray-500 mt-1">
              Latest transactions appear first.
            </p>
          </div>


          {loading ? (

            <div className="py-20 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                Loading transactions...
              </div>
            </div>

          ) : transactions.length === 0 ? (

            <div className="py-20 text-center">

              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">
                <Activity className="h-6 w-6 text-gray-400" />
              </div>

              <p className="font-semibold text-gray-900 mt-4">
                No transactions found
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
                      Transaction
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Customer
                    </th>

                    <th className="text-left px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Type
                    </th>

                    <th className="text-right px-5 py-3 font-semibold text-gray-500 whitespace-nowrap">
                      Amount
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

                  {transactions.map(
                    (transaction) => (

                      <tr
                        key={
                          transaction.id
                        }
                        className="hover:bg-gray-50 transition"
                      >

                        {/* TRANSACTION */}

                        <td className="px-5 py-4">

                          <div className="max-w-[220px]">

                            <p className="font-semibold text-gray-900 truncate">
                              {
                                transaction.description ||
                                transactionTypeLabel(
                                  transaction.transaction_type
                                )
                              }
                            </p>

                            <p className="text-[11px] text-gray-400 font-mono mt-1 truncate">
                              {
                                transaction.reference_number
                              }
                            </p>

                            {transaction.provider && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                {
                                  transaction.provider
                                }
                              </p>
                            )}

                          </div>

                        </td>


                        {/* CUSTOMER */}

                        <td className="px-5 py-4">

                          <div className="max-w-[190px]">

                            <p className="font-medium text-gray-900 truncate">
                              {
                                transaction.user_full_name ||
                                "Unknown customer"
                              }
                            </p>

                            <p className="text-[11px] text-gray-400 truncate mt-1">
                              {
                                transaction.user_email ||
                                transaction.user_phone ||
                                "—"
                              }
                            </p>

                          </div>

                        </td>


                        {/* TYPE */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span className="text-gray-700">
                            {transactionTypeLabel(
                              transaction.transaction_type
                            )}
                          </span>

                          {transaction.category && (
                            <p className="text-[11px] text-gray-400 mt-1">
                              {
                                transaction.category
                              }
                            </p>
                          )}

                        </td>


                        {/* AMOUNT */}

                        <td className="px-5 py-4 text-right whitespace-nowrap">

                          <span className="font-bold text-gray-900">
                            {formatMoney(
                              transaction.amount,
                              transaction.currency
                            )}
                          </span>

                        </td>


                        {/* STATUS */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span
                            className={`
                              inline-flex
                              items-center
                              gap-1.5
                              px-2.5
                              py-1
                              rounded-full
                              text-[11px]
                              font-semibold
                              ${statusClasses(
                                transaction.status
                              )}
                            `}
                          >
                            {statusIcon(
                              transaction.status
                            )}

                            {
                              transaction.status
                            }
                          </span>

                        </td>


                        {/* DATE */}

                        <td className="px-5 py-4 whitespace-nowrap">

                          <span className="text-gray-600 text-xs">
                            {formatDate(
                              transaction.created_at
                            )}
                          </span>

                        </td>


                        {/* ACTION */}

                        <td className="px-5 py-4 text-right">

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedTransaction(
                                transaction
                              )
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}


          {/* PAGINATION */}

          {!loading &&
            transactions.length > 0 && (
              <div className="border-t px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                <p className="text-xs text-gray-500">
                  Showing{" "}
                  <span className="font-semibold text-gray-700">
                    {(page - 1) *
                      PAGE_SIZE +
                      1}
                  </span>{" "}
                  –
                  <span className="font-semibold text-gray-700">
                    {Math.min(
                      page *
                        PAGE_SIZE,
                      totalCount
                    )}
                  </span>{" "}
                  of{" "}
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
                            value - 1
                          )
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>


                  <span className="text-xs text-gray-500 px-2">
                    {page} /{" "}
                    {totalPages}
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
                            value + 1
                          )
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
            TRANSACTION DETAILS
        ================================================== */}

        {selectedTransaction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

            <button
              type="button"
              aria-label="Close transaction details"
              onClick={() =>
                setSelectedTransaction(
                  null
                )
              }
              className="absolute inset-0 bg-black/40"
            />


            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">

              <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">

                <div>
                  <h3 className="font-bold text-gray-900">
                    Transaction Details
                  </h3>

                  <p className="text-xs text-gray-400 mt-1 font-mono">
                    {
                      selectedTransaction.reference_number
                    }
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setSelectedTransaction(
                      null
                    )
                  }
                >
                  <XCircle className="h-5 w-5" />
                </Button>

              </div>


              <div className="p-5 space-y-5">

                {/* AMOUNT */}

                <div className="rounded-2xl bg-gray-50 border p-5 text-center">

                  <p className="text-xs text-gray-500">
                    Transaction Amount
                  </p>

                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {formatMoney(
                      selectedTransaction.amount,
                      selectedTransaction.currency
                    )}
                  </p>

                  <span
                    className={`
                      inline-flex
                      items-center
                      gap-1.5
                      px-3
                      py-1
                      rounded-full
                      text-xs
                      font-semibold
                      mt-3
                      ${statusClasses(
                        selectedTransaction.status
                      )}
                    `}
                  >
                    {statusIcon(
                      selectedTransaction.status
                    )}

                    {
                      selectedTransaction.status
                    }
                  </span>

                </div>


                {/* DETAILS */}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <p className="text-xs text-gray-400">
                      Customer
                    </p>

                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {
                        selectedTransaction.user_full_name ||
                        "Unknown customer"
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Email
                    </p>

                    <p className="text-sm font-semibold text-gray-900 mt-1 break-all">
                      {
                        selectedTransaction.user_email ||
                        "—"
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Transaction Type
                    </p>

                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {transactionTypeLabel(
                        selectedTransaction.transaction_type
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Category
                    </p>

                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {
                        selectedTransaction.category ||
                        "—"
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Provider
                    </p>

                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {
                        selectedTransaction.provider ||
                        "—"
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Provider Reference
                    </p>

                    <p className="text-sm font-mono text-gray-700 mt-1 break-all">
                      {
                        selectedTransaction.provider_reference ||
                        "—"
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Created
                    </p>

                    <p className="text-sm text-gray-700 mt-1">
                      {formatDate(
                        selectedTransaction.created_at
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-gray-400">
                      Completed
                    </p>

                    <p className="text-sm text-gray-700 mt-1">
                      {formatDate(
                        selectedTransaction.completed_at
                      )}
                    </p>
                  </div>

                </div>


                {/* CHARGEBACK */}

                {selectedTransaction.chargeback_status && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">

                    <p className="font-semibold text-orange-800 text-sm">
                      Chargeback Information
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-3">

                      <div>
                        <p className="text-[11px] text-orange-600">
                          Status
                        </p>

                        <p className="text-sm font-semibold text-orange-900">
                          {
                            selectedTransaction.chargeback_status
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-orange-600">
                          Amount
                        </p>

                        <p className="text-sm font-semibold text-orange-900">
                          {formatMoney(
                            selectedTransaction.chargeback_amount ||
                              0,
                            selectedTransaction.currency
                          )}
                        </p>
                      </div>

                    </div>

                  </div>
                )}


                {/* DESCRIPTION */}

                <div>
                  <p className="text-xs text-gray-400">
                    Description
                  </p>

                  <p className="text-sm text-gray-700 mt-1">
                    {
                      selectedTransaction.description ||
                      "No description"
                    }
                  </p>
                </div>

              </div>

            </div>

          </div>
        )}

      </div>
    </AdminLayout>
  );
};


export default AdminTransactionsPage;
