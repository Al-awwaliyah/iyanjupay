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
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  User,
  Wallet,
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

// ============================================================
// HELPERS
// ============================================================

const formatMoney = (
  amount: number | string,
  currency = "NGN",
) => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const normalizeStatus = (status: string) => {
  return String(status || "")
    .trim()
    .toLowerCase();
};

const statusClasses = (status: string) => {
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

const statusIcon = (status: string) => {
  switch (normalizeStatus(status)) {
    case "completed":
    case "successful":
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5" />;

    case "pending":
    case "processing":
    case "queued":
      return <Clock3 className="h-3.5 w-3.5" />;

    case "failed":
    case "cancelled":
    case "canceled":
    case "reversed":
      return <XCircle className="h-3.5 w-3.5" />;

    default:
      return <Activity className="h-3.5 w-3.5" />;
  }
};

const transactionTypeLabel = (value: string | null | undefined) => {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const categoryLabel = (value: string | null | undefined) => {
  if (!value) {
    return "Uncategorized";
  }

  switch (String(value).trim().toLowerCase()) {
    case "bill_payment":
      return "Bill Payment";

    case "transfer":
      return "Transfer";

    case "refund":
      return "Refund";

    default:
      return transactionTypeLabel(value);
  }
};

// ============================================================
// METADATA HELPERS
// ============================================================

const getMetadata = (
  transaction: AdminTransaction,
): Record<string, any> => {
  return (
    transaction.metadata &&
    typeof transaction.metadata === "object"
      ? transaction.metadata
      : {}
  );
};

const getMetadataValue = (
  transaction: AdminTransaction,
  ...keys: string[]
) => {
  const metadata = getMetadata(transaction);

  for (const key of keys) {
    const value = metadata?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
};

// ============================================================
// INTELLIGENT SERVICE DETECTION
// ============================================================

const normalizeService = (value: unknown) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "airtime":
    case "airtime_purchase":
      return "airtime";

    case "data":
    case "data_purchase":
      return "data";

    case "electricity":
    case "electricity_bill":
    case "electricity_payment":
      return "electricity";

    case "cable":
    case "cable_tv":
    case "cable_payment":
      return "cable";

    case "internet":
    case "internet_payment":
      return "internet";

    default:
      return null;
  }
};

const getBillService = (
  transaction: AdminTransaction,
) => {
  if (
    String(transaction.category || "").toLowerCase() !==
    "bill_payment"
  ) {
    return null;
  }

  const directValue = getMetadataValue(
    transaction,
    "service",
    "service_type",
    "serviceType",
    "bill_type",
    "billType",
    "product_type",
    "productType",
    "category",
    "biller_type",
    "billerType",
  );

  const directService = normalizeService(directValue);

  if (directService) {
    return directService;
  }

  const metadata = getMetadata(transaction);

  const nestedCandidates = [
    metadata?.bill?.service,
    metadata?.bill?.type,
    metadata?.bill?.category,
    metadata?.details?.service,
    metadata?.details?.service_type,
    metadata?.purchase?.service,
    metadata?.purchase?.type,
  ];

  for (const candidate of nestedCandidates) {
    const service = normalizeService(candidate);

    if (service) {
      return service;
    }
  }

  const description = String(
    transaction.description || "",
  ).toLowerCase();

  const descriptionMatches = [
    "airtime",
    "data",
    "electricity",
    "cable",
    "internet",
  ];

  for (const service of descriptionMatches) {
    if (description.includes(service)) {
      return service;
    }
  }

  return null;
};

const getIntelligentTransactionLabel = (
  transaction: AdminTransaction,
) => {
  const billService = getBillService(transaction);

  if (billService) {
    return `${transactionTypeLabel(billService)} Bill Payment`;
  }

  if (transaction.description?.trim()) {
    return transaction.description.trim();
  }

  if (
    transaction.transaction_type ===
    "wallet_funding"
  ) {
    return "Wallet Funding";
  }

  if (
    transaction.transaction_type ===
    "internal_transfer"
  ) {
    return "IyanjuPay Transfer";
  }

  if (
    transaction.transaction_type ===
    "refund"
  ) {
    return "Refund";
  }

  if (
    transaction.transaction_type ===
    "debit"
  ) {
    if (
      String(transaction.category || "")
        .toLowerCase() === "transfer"
    ) {
      return "Bank Transfer";
    }

    if (
      String(transaction.category || "")
        .toLowerCase() === "bill_payment"
    ) {
      return "Bill Payment";
    }

    return "Debit";
  }

  return transactionTypeLabel(
    transaction.transaction_type,
  );
};

// ============================================================
// BANK TRANSFER HELPERS
// ============================================================

const isBankTransfer = (
  transaction: AdminTransaction,
) => {
  const metadata = getMetadata(transaction);

  return (
    String(transaction.category || "").toLowerCase() ===
      "transfer" &&
    (
      metadata.transaction_type === "bank_transfer" ||
      metadata.counterparty_type === "bank_account" ||
      Boolean(
        metadata.account_number ||
        metadata.account_number_masked ||
        metadata.account_bank ||
        metadata.bank_code
      )
    )
  );
};

const maskAccountNumber = (
  accountNumber: string,
) => {
  const clean = String(accountNumber || "").replace(
    /\D/g,
    "",
  );

  if (!clean) {
    return "—";
  }

  if (clean.length < 4) {
    return clean;
  }

  return `xxxxxx${clean.slice(-4)}`;
};

const getRecipientName = (
  transaction: AdminTransaction,
) => {
  return (
    getMetadataValue(
      transaction,
      "beneficiary_name",
      "beneficiaryName",
      "recipient_name",
      "recipientName",
      "account_name",
      "accountName",
      "bank_account_name",
      "counterparty_name",
    ) || "Unknown recipient"
  );
};

const getRecipientBank = (
  transaction: AdminTransaction,
) => {
  return (
    getMetadataValue(
      transaction,
      "account_bank_name",
      "bank_name",
      "recipient_bank_name",
      "beneficiary_bank_name",
      "accountBankName",
    ) ||
    getMetadataValue(
      transaction,
      "account_bank",
      "bank_code",
      "bankCode",
    ) ||
    "Unknown bank"
  );
};

const getRecipientAccount = (
  transaction: AdminTransaction,
) => {
  const raw = getMetadataValue(
    transaction,
    "account_number",
    "accountNumber",
    "account_number_masked",
    "accountNumberMasked",
  );

  if (!raw) {
    return "—";
  }

  const value = String(raw);

  if (
    value.toLowerCase().includes("x") ||
    value.includes("*")
  ) {
    return value;
  }

  return maskAccountNumber(value);
};

const getRecipientWalletId = (
  transaction: AdminTransaction,
) => {
  return getMetadataValue(
    transaction,
    "recipient_wallet_id",
    "recipientWalletId",
    "beneficiary_wallet_id",
    "beneficiaryWalletId",
  );
};

const getRecipientEmail = (
  transaction: AdminTransaction,
) => {
  return getMetadataValue(
    transaction,
    "recipient_email",
    "recipientEmail",
    "beneficiary_email",
    "beneficiaryEmail",
  );
};

const getRecipientPhone = (
  transaction: AdminTransaction,
) => {
  return getMetadataValue(
    transaction,
    "recipient_phone",
    "recipientPhone",
    "beneficiary_phone",
    "beneficiaryPhone",
  );
};

// ============================================================
// CLIPBOARD
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
      description: `${label} copied to clipboard.`,
    });
  } catch (error) {
    console.error(
      "Clipboard copy failed:",
      error,
    );

    toast({
      title: "Copy failed",
      description: `Unable to copy ${label}.`,
      variant: "destructive",
    });
  }
};

// ============================================================
// COMPONENT
// ============================================================

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

  const [
    selectedTransaction,
    setSelectedTransaction,
  ] = useState<AdminTransaction | null>(
    null,
  );

  const totalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(
        totalCount / PAGE_SIZE,
      ),
    );
  }, [totalCount]);

  // ==========================================================
  // FETCH TRANSACTIONS
  // ==========================================================

  const fetchTransactions =
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
            },
          );

          if (error) {
            throw error;
          }

          const rows =
            (data || []) as AdminTransaction[];

          setTransactions(rows);

          setTotalCount(
            Number(
              rows[0]?.total_count || 0,
            ),
          );
        } catch (error: any) {
          console.error(
            "Admin transactions fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load transactions",

            description:
              error?.message ||
              "Something went wrong while loading transactions.",

            variant: "destructive",
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
      ],
    );

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // ==========================================================
  // SEARCH / FILTERS
  // ==========================================================

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setTransactionType("");
    setCategory("");
    setPage(1);
  };

  const hasFilters = Boolean(
    search ||
    status ||
    transactionType ||
    category,
  );

  // ==========================================================
  // RENDER
  // ==========================================================

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
              Transaction Filters
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
                placeholder="Search reference, customer, email, recipient..."
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

              <option value="queued">
                Queued
              </option>

              <option value="failed">
                Failed
              </option>

              <option value="reversed">
                Reversed
              </option>

            </select>

            {/* CATEGORY */}

            <select
              value={category}
              onChange={(event) => {
                setCategory(
                  event.target.value,
                );
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                All categories
              </option>

              <option value="transfer">
                Transfer
              </option>

              <option value="bill_payment">
                Bill Payment
              </option>

              <option value="refund">
                Refund
              </option>

              <option value="__uncategorized__">
                Uncategorized
              </option>
            </select>

            {/* TRANSACTION TYPE */}

            <select
              value={transactionType}
              onChange={(event) => {
                setTransactionType(
                  event.target.value,
                );
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                All transaction types
              </option>

              <option value="internal_transfer">
                Internal Transfer
              </option>

              <option value="wallet_funding">
                Wallet Funding
              </option>

              <option value="debit">
                Debit
              </option>

              <option value="refund">
                Refund
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
            ACTIVE FILTER SUMMARY
        ================================================== */}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">

            <span className="text-xs text-gray-500">
              Active filters:
            </span>

            {search && (
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                Search: {search}
              </span>
            )}

            {status && (
              <span className="px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                Status: {transactionTypeLabel(status)}
              </span>
            )}

            {transactionType && (
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                Type: {transactionTypeLabel(transactionType)}
              </span>
            )}

            {category && (
              <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                Category:{" "}
                {category === "__uncategorized__"
                  ? "Uncategorized"
                  : categoryLabel(category)}
              </span>
            )}

          </div>
        )}

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
                      Recipient
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
                    (transaction) => {

                      const bankTransfer =
                        isBankTransfer(
                          transaction,
                        );

                      const billService =
                        getBillService(
                          transaction,
                        );

                      return (
                        <tr
                          key={transaction.id}
                          className="hover:bg-gray-50 transition"
                        >

                          {/* TRANSACTION */}

                          <td className="px-5 py-4">

                            <div className="max-w-[240px]">

                              <p className="font-semibold text-gray-900 truncate">

                                {
                                  getIntelligentTransactionLabel(
                                    transaction,
                                  )
                                }

                              </p>

                              <p className="text-[11px] text-gray-400 font-mono mt-1 truncate">
                                {
                                  transaction.reference_number
                                }
                              </p>

                              {billService && (
                                <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold">
                                  {transactionTypeLabel(
                                    billService,
                                  )}
                                </span>
                              )}

                              {transaction.provider && (
                                <p className="text-[11px] text-gray-400 mt-1 truncate">
                                  {transaction.provider}
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

                          {/* RECIPIENT */}

                          <td className="px-5 py-4">

                            {bankTransfer ? (

                              <div className="max-w-[220px]">

                                <div className="flex items-center gap-2">

                                  <Building2 className="h-4 w-4 text-purple-500 shrink-0" />

                                  <p className="font-semibold text-gray-900 truncate">
                                    {
                                      getRecipientName(
                                        transaction,
                                      )
                                    }
                                  </p>

                                </div>

                                <p className="text-[11px] text-gray-500 mt-1 truncate">
                                  {
                                    getRecipientBank(
                                      transaction,
                                    )
                                  }
                                </p>

                                <p className="text-[11px] text-gray-400 font-mono mt-1">
                                  {
                                    getRecipientAccount(
                                      transaction,
                                    )
                                  }
                                </p>

                              </div>

                            ) : (

                              <span className="text-gray-400">
                                —
                              </span>

                            )}

                          </td>

                          {/* TYPE */}

                          <td className="px-5 py-4 whitespace-nowrap">

                            <span className="text-gray-700">
                              {
                                transactionTypeLabel(
                                  transaction.transaction_type,
                                )
                              }
                            </span>

                            {transaction.category && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                {
                                  categoryLabel(
                                    transaction.category,
                                  )
                                }
                              </p>
                            )}

                          </td>

                          {/* AMOUNT */}

                          <td className="px-5 py-4 text-right whitespace-nowrap">

                            <span className="font-bold text-gray-900">
                              {
                                formatMoney(
                                  transaction.amount,
                                  transaction.currency,
                                )
                              }
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
                                  transaction.status,
                                )}
                              `}
                            >

                              {
                                statusIcon(
                                  transaction.status,
                                )
                              }

                              {
                                transaction.status
                              }

                            </span>

                          </td>

                          {/* DATE */}

                          <td className="px-5 py-4 whitespace-nowrap">

                            <span className="text-gray-600 text-xs">
                              {
                                formatDate(
                                  transaction.created_at,
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
                                setSelectedTransaction(
                                  transaction,
                                )
                              }
                            >

                              <Eye className="h-4 w-4 mr-1" />

                              View

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

          {/* ==================================================
              PAGINATION
          ================================================== */}

          {!loading &&
            transactions.length > 0 && (

              <div className="border-t px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                <p className="text-xs text-gray-500">

                  Showing{" "}

                  <span className="font-semibold text-gray-700">
                    {
                      (page - 1) *
                        PAGE_SIZE +
                      1
                    }
                  </span>{" "}

                  –

                  <span className="font-semibold text-gray-700">
                    {
                      Math.min(
                        page * PAGE_SIZE,
                        totalCount,
                      )
                    }
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
            TRANSACTION DETAILS MODAL
        ================================================== */}

        {selectedTransaction && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

            <button
              type="button"
              aria-label="Close transaction details"
              onClick={() =>
                setSelectedTransaction(null)
              }
              className="absolute inset-0 bg-black/40"
            />

            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">

              {/* MODAL HEADER */}

              <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex items-center justify-between">

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
                    setSelectedTransaction(null)
                  }
                >
                  <XCircle className="h-5 w-5" />
                </Button>

              </div>

              <div className="p-5 space-y-5">

                {/* ==================================================
                    AMOUNT
                ================================================== */}

                <div className="rounded-2xl bg-gray-50 border p-5 text-center">

                  <p className="text-xs text-gray-500">
                    Transaction Amount
                  </p>

                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {
                      formatMoney(
                        selectedTransaction.amount,
                        selectedTransaction.currency,
                      )
                    }
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
                        selectedTransaction.status,
                      )}
                    `}
                  >

                    {
                      statusIcon(
                        selectedTransaction.status,
                      )
                    }

                    {
                      selectedTransaction.status
                    }

                  </span>

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
                        Phone
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {
                          selectedTransaction.user_phone ||
                          "—"
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        User ID
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-xs font-mono text-gray-700 break-all">
                          {
                            selectedTransaction.user_id
                          }
                        </p>

                        <button
                          type="button"
                          className="shrink-0 text-gray-400 hover:text-gray-700"
                          onClick={() =>
                            copyToClipboard(
                              selectedTransaction.user_id,
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
                    RECIPIENT
                ================================================== */}

                {isBankTransfer(
                  selectedTransaction,
                ) && (

                  <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5">

                    <div className="flex items-center gap-2 mb-4">

                      <Building2 className="h-5 w-5 text-purple-600" />

                      <div>

                        <h4 className="font-bold text-gray-900">
                          Recipient Details
                        </h4>

                        <p className="text-xs text-gray-500">
                          Information required for transfer investigation and recipient support.
                        </p>

                      </div>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      {/* RECIPIENT NAME */}

                      <div className="bg-white rounded-xl border p-3">

                        <p className="text-[11px] text-gray-400">
                          Recipient Name
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            getRecipientName(
                              selectedTransaction,
                            )
                          }
                        </p>

                      </div>

                      {/* BANK */}

                      <div className="bg-white rounded-xl border p-3">

                        <p className="text-[11px] text-gray-400">
                          Recipient Bank
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            getRecipientBank(
                              selectedTransaction,
                            )
                          }
                        </p>

                      </div>

                      {/* ACCOUNT */}

                      <div className="bg-white rounded-xl border p-3">

                        <p className="text-[11px] text-gray-400">
                          Account Number
                        </p>

                        <p className="text-sm font-mono font-semibold text-gray-900 mt-1">
                          {
                            getRecipientAccount(
                              selectedTransaction,
                            )
                          }
                        </p>

                      </div>

                      {/* RECIPIENT WALLET ID */}

                      {getRecipientWalletId(
                        selectedTransaction,
                      ) && (

                        <div className="bg-white rounded-xl border p-3">

                          <p className="text-[11px] text-gray-400">
                            Recipient Wallet ID
                          </p>

                          <div className="flex items-center gap-2 mt-1">

                            <Wallet className="h-4 w-4 text-purple-500" />

                            <p className="text-sm font-mono font-semibold text-gray-900 break-all">
                              {
                                getRecipientWalletId(
                                  selectedTransaction,
                                )
                              }
                            </p>

                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-700"
                              onClick={() =>
                                copyToClipboard(
                                  String(
                                    getRecipientWalletId(
                                      selectedTransaction,
                                    ),
                                  ),
                                  "Recipient Wallet ID",
                                  toast,
                                )
                              }
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>

                          </div>

                        </div>
                      )}

                      {/* RECIPIENT EMAIL */}

                      {getRecipientEmail(
                        selectedTransaction,
                      ) && (

                        <div className="bg-white rounded-xl border p-3">

                          <p className="text-[11px] text-gray-400">
                            Recipient Email
                          </p>

                          <div className="flex items-center gap-2 mt-1">

                            <Mail className="h-4 w-4 text-gray-400" />

                            <p className="text-sm font-semibold text-gray-900 break-all">
                              {
                                getRecipientEmail(
                                  selectedTransaction,
                                )
                              }
                            </p>

                          </div>

                        </div>
                      )}

                      {/* RECIPIENT PHONE */}

                      {getRecipientPhone(
                        selectedTransaction,
                      ) && (

                        <div className="bg-white rounded-xl border p-3">

                          <p className="text-[11px] text-gray-400">
                            Recipient Phone
                          </p>

                          <div className="flex items-center gap-2 mt-1">

                            <Phone className="h-4 w-4 text-gray-400" />

                            <p className="text-sm font-semibold text-gray-900">
                              {
                                getRecipientPhone(
                                  selectedTransaction,
                                )
                              }
                            </p>

                          </div>

                        </div>
                      )}

                    </div>

                    <div className="mt-4 rounded-xl bg-white border p-4">

                      <p className="text-xs font-semibold text-gray-700">
                        Recipient support
                      </p>

                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Use the recipient details above to identify the beneficiary when investigating a failed, pending, reversed, or disputed bank transfer.
                      </p>

                    </div>

                  </div>
                )}

                {/* ==================================================
                    BILL PAYMENT INFORMATION
                ================================================== */}

                {getBillService(
                  selectedTransaction,
                ) && (

                  <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">

                    <div className="flex items-center gap-2 mb-4">

                      <ArrowUpFromLine className="h-5 w-5 text-blue-600" />

                      <div>

                        <h4 className="font-bold text-gray-900">
                          Bill Payment
                        </h4>

                        <p className="text-xs text-gray-500">
                          Service information detected from the transaction metadata.
                        </p>

                      </div>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      <div className="bg-white rounded-xl border p-3">

                        <p className="text-[11px] text-gray-400">
                          Service
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            transactionTypeLabel(
                              getBillService(
                                selectedTransaction,
                              ) || "",
                            )
                          }
                        </p>

                      </div>

                      <div className="bg-white rounded-xl border p-3">

                        <p className="text-[11px] text-gray-400">
                          Category
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          Bill Payment
                        </p>

                      </div>

                    </div>

                  </div>
                )}

                {/* ==================================================
                    GENERAL TRANSACTION DETAILS
                ================================================== */}

                <div className="rounded-2xl border p-5">

                  <div className="flex items-center gap-2 mb-4">

                    <Activity className="h-4 w-4 text-blue-600" />

                    <h4 className="font-bold text-gray-900">
                      Transaction Information
                    </h4>

                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div>

                      <p className="text-xs text-gray-400">
                        Transaction Description
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {
                          getIntelligentTransactionLabel(
                            selectedTransaction,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Transaction Type
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {
                          transactionTypeLabel(
                            selectedTransaction.transaction_type,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Category
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {
                          categoryLabel(
                            selectedTransaction.category,
                          )
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
                        Currency
                      </p>

                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {
                          selectedTransaction.currency ||
                          "NGN"
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Transaction ID
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-xs font-mono text-gray-700 break-all">
                          {
                            selectedTransaction.id
                          }
                        </p>

                        <button
                          type="button"
                          className="shrink-0 text-gray-400 hover:text-gray-700"
                          onClick={() =>
                            copyToClipboard(
                              selectedTransaction.id,
                              "Transaction ID",
                              toast,
                            )
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>

                      </div>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Reference
                      </p>

                      <div className="flex items-center gap-2 mt-1">

                        <p className="text-xs font-mono text-gray-700 break-all">
                          {
                            selectedTransaction.reference_number
                          }
                        </p>

                        <button
                          type="button"
                          className="shrink-0 text-gray-400 hover:text-gray-700"
                          onClick={() =>
                            copyToClipboard(
                              selectedTransaction.reference_number,
                              "Transaction reference",
                              toast,
                            )
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>

                      </div>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Created
                      </p>

                      <p className="text-sm text-gray-700 mt-1">
                        {
                          formatDate(
                            selectedTransaction.created_at,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Updated
                      </p>

                      <p className="text-sm text-gray-700 mt-1">
                        {
                          formatDate(
                            selectedTransaction.updated_at,
                          )
                        }
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-gray-400">
                        Completed
                      </p>

                      <p className="text-sm text-gray-700 mt-1">
                        {
                          formatDate(
                            selectedTransaction.completed_at,
                          )
                        }
                      </p>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    CHARGEBACK
                ================================================== */}

                {selectedTransaction.chargeback_status && (

                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">

                    <p className="font-semibold text-orange-800 text-sm">
                      Chargeback Information
                    </p>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">

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
                          {
                            formatMoney(
                              selectedTransaction.chargeback_amount ||
                                0,
                              selectedTransaction.currency,
                            )
                          }
                        </p>

                      </div>

                      <div>

                        <p className="text-[11px] text-orange-600">
                          Reference
                        </p>

                        <p className="text-sm font-mono text-orange-900 break-all">
                          {
                            selectedTransaction.chargeback_reference ||
                            "—"
                          }
                        </p>

                      </div>

                      <div>

                        <p className="text-[11px] text-orange-600">
                          Date
                        </p>

                        <p className="text-sm text-orange-900">
                          {
                            formatDate(
                              selectedTransaction.chargeback_at,
                            )
                          }
                        </p>

                      </div>

                    </div>

                  </div>
                )}

                {/* ==================================================
                    DESCRIPTION
                ================================================== */}

                <div>

                  <p className="text-xs text-gray-400">
                    Original Description
                  </p>

                  <p className="text-sm text-gray-700 mt-1">
                    {
                      selectedTransaction.description ||
                      "No description"
                    }
                  </p>

                </div>

                {/* ==================================================
                    RAW METADATA
                ================================================== */}

                {Object.keys(
                  getMetadata(
                    selectedTransaction,
                  ),
                ).length > 0 && (

                  <details className="rounded-xl border bg-gray-50">

                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700">
                      Internal transaction metadata
                    </summary>

                    <div className="border-t p-4">

                      <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-all overflow-x-auto">
                        {
                          JSON.stringify(
                            selectedTransaction.metadata,
                            null,
                            2,
                          )
                        }
                      </pre>

                    </div>

                  </details>
                )}

              </div>

            </div>

          </div>
        )}

      </div>
    </AdminLayout>
  );
};

export default AdminTransactionsPage;
