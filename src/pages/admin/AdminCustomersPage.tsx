import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

import AdminLayout from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
  phone_number: string | null;

  kyc_level: number | null;
  kyc_status: string | null;

  bvn_verified: boolean;
  phone_verified: boolean;

  created_at: string | null;

  wallet_id: string | null;
  wallet_status: string | null;
  wallet_balance: number;
  held_balance: number;
  wallet_currency: string | null;

  has_virtual_account: boolean;
}

interface CustomerProfile {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
  phone_number: string | null;

  kyc_level: number | null;
  kyc_status: string | null;

  bvn_verified: boolean;
  bvn_verified_at: string | null;

  phone_verified: boolean;
  phone_verified_at: string | null;

  created_at: string | null;
  updated_at: string | null;
}

interface CustomerWallet {
  id: string;
  wallet_id: string;
  balance: number;
  held_balance: number;
  currency: string;
  status: string;
  virtual_account_number: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CustomerTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  reference_number: string;
  category: string | null;
  provider: string | null;
  provider_reference: string | null;
  created_at: string | null;
  completed_at: string | null;
}

interface CustomerDetails {
  profile: CustomerProfile;
  wallet: CustomerWallet | null;
  transactions: CustomerTransaction[];
}

const PAGE_SIZE = 25;

const formatNumber = (
  value: number
) => {
  return new Intl.NumberFormat(
    "en-NG"
  ).format(Number(value) || 0);
};

const formatMoney = (
  value: number,
  currency = "NGN"
) => {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }
  ).format(Number(value) || 0);
};

const formatDate = (
  value: string | null
) => {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-NG",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(value));
  } catch {
    return "—";
  }
};

const formatDateOnly = (
  value: string | null
) => {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-NG",
      {
        dateStyle: "medium",
      }
    ).format(new Date(value));
  } catch {
    return "—";
  }
};

const getInitials = (
  name: string | null
) => {
  if (!name) {
    return "U";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
};

const getKycLabel = (
  status: string | null
) => {
  if (!status) {
    return "Unverified";
  }

  const normalized =
    status.toLowerCase();

  if (
    normalized === "verified"
  ) {
    return "Verified";
  }

  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "review" ||
    normalized === "under_review"
  ) {
    return "Pending";
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
};

const getKycClasses = (
  status: string | null
) => {
  const normalized =
    (status || "").toLowerCase();

  if (
    normalized === "verified"
  ) {
    return "bg-green-100 text-green-700";
  }

  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "review" ||
    normalized === "under_review"
  ) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-gray-100 text-gray-600";
};

const getTransactionStatusClasses = (
  status: string
) => {
  const normalized =
    status
      .toLowerCase()
      .replace(/[_-]/g, " ");

  if (
    normalized === "successful" ||
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "bg-green-100 text-green-700";
  }

  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "queued" ||
    normalized === "initiated"
  ) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-red-100 text-red-700";
};

const AdminCustomersPage =
  () => {
    const { toast } =
      useToast();

    const [customers, setCustomers] =
      useState<Customer[]>([]);

    const [total, setTotal] =
      useState(0);

    const [page, setPage] =
      useState(0);

    const [searchInput, setSearchInput] =
      useState("");

    const [search, setSearch] =
      useState("");

    const [loading, setLoading] =
      useState(true);

    const [refreshing, setRefreshing] =
      useState(false);

    const [selectedCustomerId, setSelectedCustomerId] =
      useState<string | null>(null);

    const [details, setDetails] =
      useState<CustomerDetails | null>(
        null
      );

    const [detailsLoading, setDetailsLoading] =
      useState(false);

    const [detailsError, setDetailsError] =
      useState<string | null>(null);

    const loadCustomers =
      useCallback(
        async (
          currentSearch: string,
          currentPage: number,
          isRefresh = false
        ) => {
          if (isRefresh) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          try {
            const {
              data,
              error,
            } = await supabase.rpc(
              "get_admin_customers",
              {
                p_search:
                  currentSearch.trim() ||
                  null,

                p_limit:
                  PAGE_SIZE,

                p_offset:
                  currentPage *
                  PAGE_SIZE,
              }
            );

            if (error) {
              throw error;
            }

            const result =
              data as {
                customers?: Customer[];
                total?: number;
              };

            setCustomers(
              result.customers || []
            );

            setTotal(
              Number(
                result.total || 0
              )
            );
          } catch (error: any) {
            console.error(
              "Failed to load admin customers:",
              error
            );

            toast({
              title:
                "Customers unavailable",
              description:
                error?.message ||
                "Unable to load customers.",
              variant:
                "destructive",
            });
          } finally {
            setLoading(false);
            setRefreshing(false);
          }
        },
        [toast]
      );

    const loadCustomerDetails =
      useCallback(
        async (
          customerId: string
        ) => {
          setSelectedCustomerId(
            customerId
          );

          setDetails(null);
          setDetailsError(null);
          setDetailsLoading(true);

          try {
            const {
              data,
              error,
            } = await supabase.rpc(
              "get_admin_customer_details",
              {
                p_user_id:
                  customerId,
              }
            );

            if (error) {
              throw error;
            }

            if (!data) {
              throw new Error(
                "No customer details were returned."
              );
            }

            setDetails(
              data as CustomerDetails
            );
          } catch (error: any) {
            console.error(
              "Failed to load customer details:",
              error
            );

            const message =
              error?.message ||
              "Unable to load customer details.";

            setDetailsError(
              message
            );

            toast({
              title:
                "Customer details unavailable",
              description:
                message,
              variant:
                "destructive",
            });
          } finally {
            setDetailsLoading(
              false
            );
          }
        },
        [toast]
      );

    useEffect(() => {
      loadCustomers(
        search,
        page
      );
    }, [
      loadCustomers,
      search,
      page,
    ]);

    const handleSearch =
      (
        event: React.FormEvent
      ) => {
        event.preventDefault();

        setPage(0);
        setSearch(
          searchInput.trim()
        );
      };

    const clearSearch =
      () => {
        setSearchInput("");
        setSearch("");
        setPage(0);
      };

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total / PAGE_SIZE
        )
      );

    const copyText =
      async (
        value: string,
        label: string
      ) => {
        try {
          await navigator.clipboard.writeText(
            value
          );

          toast({
            title: "Copied",
            description: `${label} copied to clipboard.`,
          });
        } catch {
          toast({
            title: "Copy failed",
            description:
              "Unable to copy this value.",
            variant:
              "destructive",
          });
        }
      };

    return (
      <AdminLayout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ==================================================
              HEADER
          ================================================== */}

          <section className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Customers
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Search and manage IyanjuPay customers.
              </p>
            </div>

            <button
              type="button"
              disabled={
                refreshing
              }
              onClick={() =>
                loadCustomers(
                  search,
                  page,
                  true
                )
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>

          </section>


          {/* ==================================================
              SEARCH
          ================================================== */}

          <section className="bg-white border rounded-2xl p-4">

            <form
              onSubmit={
                handleSearch
              }
              className="flex flex-col sm:flex-row gap-3"
            >

              <div className="relative flex-1">

                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

                <Input
                  value={
                    searchInput
                  }
                  onChange={(event) =>
                    setSearchInput(
                      event.target
                        .value
                    )
                  }
                  placeholder="Search by name, email, phone or nickname..."
                  className="pl-10 pr-10 h-11 rounded-xl"
                />

                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput(
                        ""
                      );
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

              </div>

              <Button
                type="submit"
                className="h-11 rounded-xl px-6 bg-purple-600 hover:bg-purple-700"
              >
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>

              {search && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={
                    clearSearch
                  }
                >
                  Clear
                </Button>
              )}

            </form>

          </section>


          {/* ==================================================
              CUSTOMER COUNT
          ================================================== */}

          <div className="flex items-center justify-between">

            <p className="text-sm text-gray-500">
              {formatNumber(
                total
              )}{" "}
              customer
              {total === 1
                ? ""
                : "s"}
              {search
                ? ` matching "${search}"`
                : ""}
            </p>

            {total > 0 && (
              <p className="text-xs text-gray-400">
                Page{" "}
                {page + 1}{" "}
                of{" "}
                {totalPages}
              </p>
            )}

          </div>


          {/* ==================================================
              CUSTOMER TABLE
          ================================================== */}

          <section className="bg-white border rounded-2xl overflow-hidden">

            {loading ? (

              <div className="min-h-[350px] flex items-center justify-center">

                <div className="text-center">

                  <RefreshCw className="h-7 w-7 animate-spin text-purple-600 mx-auto" />

                  <p className="text-sm text-gray-500 mt-3">
                    Loading customers...
                  </p>

                </div>

              </div>

            ) : customers.length === 0 ? (

              <div className="min-h-[350px] flex items-center justify-center p-8">

                <div className="text-center">

                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto">

                    <UsersIcon />

                  </div>

                  <h3 className="font-semibold text-gray-900 mt-4">
                    No customers found
                  </h3>

                  <p className="text-sm text-gray-500 mt-1">
                    {search
                      ? "Try a different search term."
                      : "There are no customers to display yet."}
                  </p>

                </div>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[1050px]">

                  <thead>

                    <tr className="bg-gray-50 border-b">

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Customer
                      </th>

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Contact
                      </th>

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        KYC
                      </th>

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Wallet
                      </th>

                      <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Balance
                      </th>

                      <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Joined
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {customers.map(
                      (customer) => (
                        <tr
                          key={
                            customer.id
                          }
                          onClick={() =>
                            loadCustomerDetails(
                              customer.id
                            )
                          }
                          className="border-b last:border-b-0 hover:bg-purple-50 cursor-pointer transition"
                        >

                          {/* CUSTOMER */}

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-3">

                              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {getInitials(
                                  customer.full_name ||
                                    customer.nickname
                                )}
                              </div>

                              <div className="min-w-0">

                                <p className="text-sm font-semibold text-gray-900 truncate max-w-[220px]">
                                  {customer.full_name ||
                                    customer.nickname ||
                                    "Unnamed Customer"}
                                </p>

                                <p className="text-[11px] text-gray-400 mt-1">
                                  ID:{" "}
                                  {customer.id.slice(
                                    0,
                                    8
                                  )}
                                  ...
                                </p>

                              </div>

                            </div>

                          </td>


                          {/* CONTACT */}

                          <td className="px-5 py-4">

                            <div className="space-y-1">

                              {customer.email && (
                                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <Mail className="h-3.5 w-3.5 text-gray-400" />

                                  <span className="max-w-[230px] truncate">
                                    {
                                      customer.email
                                    }
                                  </span>
                                </p>
                              )}

                              {customer.phone_number && (
                                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5 text-gray-400" />

                                  {
                                    customer.phone_number
                                  }
                                </p>
                              )}

                            </div>

                          </td>


                          {/* KYC */}

                          <td className="px-5 py-4">

                            <div className="space-y-2">

                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${getKycClasses(
                                  customer.kyc_status
                                )}`}
                              >
                                {
                                  getKycLabel(
                                    customer.kyc_status
                                  )
                                }
                              </span>

                              <p className="text-[11px] text-gray-400">
                                Level{" "}
                                {customer.kyc_level ||
                                  0}
                              </p>

                            </div>

                          </td>


                          {/* WALLET */}

                          <td className="px-5 py-4">

                            {customer.wallet_id ? (
                              <div>

                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                    customer.wallet_status?.toLowerCase() ===
                                    "active"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {customer.wallet_status ||
                                    "Unknown"}
                                </span>

                                <p className="text-[11px] text-gray-400 mt-1">
                                  {customer.has_virtual_account
                                    ? "Virtual account enabled"
                                    : "No virtual account"}
                                </p>

                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">
                                No wallet
                              </span>
                            )}

                          </td>


                          {/* BALANCE */}

                          <td className="px-5 py-4 text-right">

                            <p className="text-sm font-bold text-gray-900">
                              {formatMoney(
                                Number(
                                  customer.wallet_balance
                                ),
                                customer.wallet_currency ||
                                  "NGN"
                              )}
                            </p>

                            {Number(
                              customer.held_balance
                            ) > 0 && (
                              <p className="text-[11px] text-orange-600 mt-1">
                                Held:{" "}
                                {formatMoney(
                                  Number(
                                    customer.held_balance
                                  ),
                                  customer.wallet_currency ||
                                    "NGN"
                                )}
                              </p>
                            )}

                          </td>


                          {/* JOINED */}

                          <td className="px-5 py-4 text-right">

                            <p className="text-xs text-gray-500 whitespace-nowrap">
                              {formatDateOnly(
                                customer.created_at
                              )}
                            </p>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </section>


          {/* ==================================================
              PAGINATION
          ================================================== */}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">

              <Button
                type="button"
                variant="outline"
                disabled={
                  page === 0
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      Math.max(
                        value - 1,
                        0
                      )
                  )
                }
                className="rounded-xl"
              >
                Previous
              </Button>

              <span className="text-xs text-gray-500">
                {page + 1} /{" "}
                {totalPages}
              </span>

              <Button
                type="button"
                variant="outline"
                disabled={
                  page >=
                  totalPages - 1
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      Math.min(
                        value + 1,
                        totalPages - 1
                      )
                  )
                }
                className="rounded-xl"
              >
                Next
              </Button>

            </div>
          )}


          {/* ==================================================
              CUSTOMER DETAIL DRAWER
          ================================================== */}

          {selectedCustomerId && (
            <div className="fixed inset-0 z-[100]">

              <button
                type="button"
                aria-label="Close customer details"
                onClick={() => {
                  setSelectedCustomerId(
                    null
                  );
                  setDetails(null);
                }}
                className="absolute inset-0 bg-black/40"
              />

              <aside className="absolute right-0 top-0 h-full w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto">

                {/* DRAWER HEADER */}

                <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(
                          null
                        );
                        setDetails(
                          null
                        );
                      }}
                      className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center"
                    >
                      <ArrowLeft className="h-5 w-5 text-gray-500" />
                    </button>

                    <div>
                      <h3 className="font-bold text-gray-900">
                        Customer Details
                      </h3>

                      <p className="text-[11px] text-gray-400">
                        Secure administrative view
                      </p>
                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(
                        null
                      );
                      setDetails(null);
                    }}
                    className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>

                </div>


                {/* DETAILS LOADING */}

                {detailsLoading && (
                  <div className="min-h-[500px] flex items-center justify-center">

                    <div className="text-center">

                      <RefreshCw className="h-7 w-7 animate-spin text-purple-600 mx-auto" />

                      <p className="text-sm text-gray-500 mt-3">
                        Loading customer...
                      </p>

                    </div>

                  </div>
                )}


                {/* DETAILS ERROR */}

                {!detailsLoading &&
                  detailsError && (
                    <div className="p-6">

                      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">

                        <XCircle className="h-7 w-7 text-red-600 mx-auto" />

                        <h3 className="font-semibold text-red-900 mt-3">
                          Unable to load customer
                        </h3>

                        <p className="text-sm text-red-700 mt-1">
                          {
                            detailsError
                          }
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            loadCustomerDetails(
                              selectedCustomerId
                            )
                          }
                          className="mt-4 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                        >
                          Try again
                        </button>

                      </div>

                    </div>
                  )}


                {/* DETAILS */}

                {!detailsLoading &&
                  !detailsError &&
                  details && (
                    <div className="p-5 space-y-5">

                      {/* PROFILE CARD */}

                      <section className="bg-gray-50 border rounded-2xl p-5">

                        <div className="flex items-center gap-4">

                          <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">
                            {getInitials(
                              details.profile.full_name ||
                                details.profile.nickname
                            )}
                          </div>

                          <div className="min-w-0">

                            <h4 className="font-bold text-gray-900 truncate">
                              {details.profile.full_name ||
                                details.profile.nickname ||
                                "Unnamed Customer"}
                            </h4>

                            <p className="text-xs text-gray-500 mt-1">
                              Customer since{" "}
                              {formatDateOnly(
                                details.profile.created_at
                              )}
                            </p>

                          </div>

                        </div>


                        <div className="grid grid-cols-1 gap-3 mt-5">

                          {details.profile.email && (
                            <div className="flex items-center justify-between gap-3">

                              <div className="flex items-center gap-2 min-w-0">

                                <Mail className="h-4 w-4 text-gray-400 shrink-0" />

                                <span className="text-sm text-gray-700 truncate">
                                  {
                                    details.profile.email
                                  }
                                </span>

                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  copyText(
                                    details.profile.email!,
                                    "Email"
                                  )
                                }
                                className="p-1.5 rounded-lg hover:bg-gray-200"
                              >
                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                              </button>

                            </div>
                          )}

                          {details.profile.phone_number && (
                            <div className="flex items-center justify-between gap-3">

                              <div className="flex items-center gap-2 min-w-0">

                                <Phone className="h-4 w-4 text-gray-400 shrink-0" />

                                <span className="text-sm text-gray-700">
                                  {
                                    details.profile.phone_number
                                  }
                                </span>

                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  copyText(
                                    details.profile.phone_number!,
                                    "Phone number"
                                  )
                                }
                                className="p-1.5 rounded-lg hover:bg-gray-200"
                              >
                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                              </button>

                            </div>
                          )}

                        </div>

                      </section>


                      {/* KYC CARD */}

                      <section className="bg-white border rounded-2xl p-5">

                        <div className="flex items-center gap-3">

                          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                            <ShieldCheck className="h-5 w-5 text-green-600" />
                          </div>

                          <div>
                            <h4 className="font-bold text-gray-900">
                              KYC & Verification
                            </h4>

                            <p className="text-xs text-gray-500">
                              Customer verification status
                            </p>
                          </div>

                        </div>


                        <div className="grid grid-cols-2 gap-3 mt-5">

                          <div className="rounded-xl bg-gray-50 p-3">

                            <p className="text-[11px] text-gray-400">
                              KYC Status
                            </p>

                            <span
                              className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${getKycClasses(
                                details.profile.kyc_status
                              )}`}
                            >
                              {getKycLabel(
                                details.profile.kyc_status
                              )}
                            </span>

                          </div>


                          <div className="rounded-xl bg-gray-50 p-3">

                            <p className="text-[11px] text-gray-400">
                              KYC Level
                            </p>

                            <p className="text-lg font-bold text-gray-900 mt-2">
                              Level{" "}
                              {details.profile.kyc_level ||
                                0}
                            </p>

                          </div>


                          <div className="rounded-xl bg-gray-50 p-3">

                            <p className="text-[11px] text-gray-400">
                              BVN Verification
                            </p>

                            <div className="flex items-center gap-1.5 mt-2">

                              {details.profile.bvn_verified ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />

                                  <span className="text-xs font-semibold text-green-700">
                                    Verified
                                  </span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 text-gray-400" />

                                  <span className="text-xs font-semibold text-gray-500">
                                    Not verified
                                  </span>
                                </>
                              )}

                            </div>

                          </div>


                          <div className="rounded-xl bg-gray-50 p-3">

                            <p className="text-[11px] text-gray-400">
                              Phone Verification
                            </p>

                            <div className="flex items-center gap-1.5 mt-2">

                              {details.profile.phone_verified ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />

                                  <span className="text-xs font-semibold text-green-700">
                                    Verified
                                  </span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 text-gray-400" />

                                  <span className="text-xs font-semibold text-gray-500">
                                    Not verified
                                  </span>
                                </>
                              )}

                            </div>

                          </div>

                        </div>

                      </section>


                      {/* WALLET CARD */}

                      <section className="bg-white border rounded-2xl p-5">

                        <div className="flex items-center gap-3">

                          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Wallet className="h-5 w-5 text-purple-600" />
                          </div>

                          <div>
                            <h4 className="font-bold text-gray-900">
                              Wallet
                            </h4>

                            <p className="text-xs text-gray-500">
                              Current wallet position
                            </p>
                          </div>

                        </div>


                        {!details.wallet ? (

                          <div className="mt-5 rounded-xl bg-gray-50 border p-4 text-center">

                            <Wallet className="h-6 w-6 text-gray-300 mx-auto" />

                            <p className="text-sm text-gray-500 mt-2">
                              No wallet found.
                            </p>

                          </div>

                        ) : (

                          <div className="mt-5 space-y-4">

                            <div className="grid grid-cols-2 gap-3">

                              <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">

                                <p className="text-xs text-purple-600">
                                  Available
                                </p>

                                <p className="text-lg font-bold text-purple-900 mt-1">
                                  {formatMoney(
                                    Number(
                                      details.wallet.balance
                                    ),
                                    details.wallet.currency
                                  )}
                                </p>

                              </div>


                              <div className="rounded-xl bg-orange-50 border border-orange-100 p-4">

                                <p className="text-xs text-orange-600">
                                  Held
                                </p>

                                <p className="text-lg font-bold text-orange-900 mt-1">
                                  {formatMoney(
                                    Number(
                                      details.wallet.held_balance
                                    ),
                                    details.wallet.currency
                                  )}
                                </p>

                              </div>

                            </div>


                            <div className="flex items-center justify-between border-t pt-4">

                              <span className="text-sm text-gray-500">
                                Wallet status
                              </span>

                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                  details.wallet.status?.toLowerCase() ===
                                  "active"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {
                                  details.wallet.status
                                }
                              </span>

                            </div>


                            <div className="flex items-center justify-between gap-3 border-t pt-4">

                              <div>

                                <p className="text-xs text-gray-400">
                                  Virtual Account
                                </p>

                                <p className="text-sm font-semibold text-gray-800 mt-1">
                                  {details.wallet
                                    .virtual_account_number ||
                                    "Not available"}
                                </p>

                              </div>

                              {details.wallet
                                .virtual_account_number && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyText(
                                      details.wallet!
                                        .virtual_account_number!,
                                      "Virtual account number"
                                    )
                                  }
                                  className="p-2 rounded-lg hover:bg-gray-100"
                                >
                                  <Copy className="h-4 w-4 text-gray-400" />
                                </button>
                              )}

                            </div>

                          </div>

                        )}

                      </section>


                      {/* TRANSACTIONS */}

                      <section className="bg-white border rounded-2xl overflow-hidden">

                        <div className="p-5 border-b">

                          <div className="flex items-center gap-3">

                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                              <Wallet className="h-5 w-5 text-blue-600" />
                            </div>

                            <div>

                              <h4 className="font-bold text-gray-900">
                                Transaction History
                              </h4>

                              <p className="text-xs text-gray-500">
                                Latest 100 customer transactions
                              </p>

                            </div>

                          </div>

                        </div>


                        {details.transactions.length ===
                        0 ? (

                          <div className="p-8 text-center">

                            <ActivityIcon />

                            <p className="text-sm text-gray-500 mt-3">
                              No transactions found.
                            </p>

                          </div>

                        ) : (

                          <div className="divide-y">

                            {details.transactions.map(
                              (
                                transaction
                              ) => (
                                <div
                                  key={
                                    transaction.id
                                  }
                                  className="p-4"
                                >

                                  <div className="flex items-start justify-between gap-3">

                                    <div className="min-w-0">

                                      <p className="text-sm font-semibold text-gray-900 capitalize">
                                        {transaction.transaction_type ||
                                          "Transaction"}
                                      </p>

                                      <p className="text-[11px] text-gray-400 mt-1 truncate">
                                        {
                                          transaction.reference_number
                                        }
                                      </p>

                                    </div>

                                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">
                                      {formatMoney(
                                        Number(
                                          transaction.amount
                                        ),
                                        transaction.currency
                                      )}
                                    </p>

                                  </div>


                                  <div className="flex items-center justify-between gap-3 mt-3">

                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize ${getTransactionStatusClasses(
                                        transaction.status
                                      )}`}
                                    >
                                      {
                                        transaction.status
                                      }
                                    </span>

                                    <span className="text-[11px] text-gray-400">
                                      {formatDate(
                                        transaction.created_at
                                      )}
                                    </span>

                                  </div>


                                  {transaction.description && (
                                    <p className="text-xs text-gray-500 mt-3">
                                      {
                                        transaction.description
                                      }
                                    </p>
                                  )}

                                </div>
                              )
                            )}

                          </div>

                        )}

                      </section>

                    </div>
                  )}

              </aside>

            </div>
          )}

        </div>
      </AdminLayout>
    );
  };


const UsersIcon =
  () => (
    <User className="h-7 w-7 text-gray-400" />
  );

const ActivityIcon =
  () => (
    <Wallet className="h-7 w-7 text-gray-300 mx-auto" />
  );

export default AdminCustomersPage;
