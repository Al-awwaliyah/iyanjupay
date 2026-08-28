import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
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

  metadata: Record<string, any> | null;

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
// NIGERIAN BANK CODE MAP
// ============================================================

const NIGERIAN_BANK_CODES: Record<string, string> = {
  // Major banks
  "044": "Access Bank",
  "050": "Ecobank Nigeria",
  "057": "Zenith Bank",
  "058": "Guaranty Trust Bank",
  "033": "United Bank for Africa",
  "011": "First Bank of Nigeria",
  "070": "Fidelity Bank",
  "032": "Union Bank of Nigeria",
  "035": "Wema Bank",
  "214": "First City Monument Bank",
  "076": "Polaris Bank",
  "082": "Keystone Bank",
  "221": "Stanbic IBTC Bank",
  "232": "Sterling Bank",
  "215": "Unity Bank",
  "068": "Standard Chartered Bank",
  "023": "Citibank Nigeria",
  "301": "Jaiz Bank",
  "101": "Providus Bank",
  "103": "Globus Bank",
  "100": "SunTrust Bank",
  "102": "Titan Trust Bank",
  "104": "Parallex Bank",
  "107": "Optimism Bank",
  "108": "New Prudential Bank",
  "110": "VFD Microfinance Bank",

  // PSB / fintech / NIP codes
  "100001": "FET",
  "100002": "Paga",
  "100003": "Parkway / ReadyCash",
  "100004": "OPay",
  "100005": "Cellulant",
  "100006": "eTranzact",
  "100007": "Stanbic IBTC @ease",
  "100008": "Ecobank Xpress",
  "100009": "GTMobile",
  "100010": "TeasyMobile",
  "100011": "Mkudi",
  "100012": "VTNetworks",
  "100013": "AccessMobile",
  "100014": "FBNMobile",
  "100016": "FortisMobile",
  "100017": "Hedonmark",
  "100018": "ZenithMobile",
  "100019": "Fidelity Mobile",
  "100020": "MoneyBox",
  "100022": "GoMoney",
  "100025": "Zinternet",
  "100026": "One Finance",
  "100032": "NOWNOW",
  "100033": "PalmPay",

  // Common MFB / fintech codes
  "090405": "Moniepoint Microfinance Bank",
  "090175": "Rubies MFB",
  "090110": "VFD Microfinance Bank",
  "090267": "Kuda Microfinance Bank",
  "090176": "Rubies MFB",
  "090551": "FairMoney Microfinance Bank",
  "090565": "Carbon",
  "090574": "Goldman Microfinance Bank",
  "090615": "Beststar Microfinance Bank",
  "090634": "Cashbridge Microfinance Bank",
};


// ============================================================
// HELPERS
// ============================================================

const cleanValue = (
  value: unknown,
): string => {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value).trim();
};


const normalizeValue = (
  value: unknown,
): string => {
  return cleanValue(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
};


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

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
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


const normalizeStatus = (
  status: string,
) => {
  return normalizeValue(status);
};


const statusClasses = (
  status: string,
) => {
  switch (
    normalizeStatus(status)
  ) {
    case "completed":
    case "successful":
    case "success":
      return "bg-green-100 text-green-700";

    case "pending":
    case "processing":
    case "queued":
    case "new":
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
  status: string,
) => {
  switch (
    normalizeStatus(status)
  ) {
    case "completed":
    case "successful":
    case "success":
      return (
        <CheckCircle2 className="h-3.5 w-3.5" />
      );

    case "pending":
    case "processing":
    case "queued":
    case "new":
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


// ============================================================
// METADATA
// ============================================================

const getMetadata = (
  transaction: AdminTransaction,
) => {
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
  const metadata =
    getMetadata(transaction);

  for (const key of keys) {
    const value =
      metadata?.[key];

    if (
      value !== undefined &&
      value !== null &&
      cleanValue(value) !== ""
    ) {
      return value;
    }
  }

  return null;
};


// ============================================================
// TRANSACTION INTELLIGENCE
// ============================================================

const getTransactionKind = (
  transaction: AdminTransaction,
) => {
  const type =
    normalizeValue(
      transaction.transaction_type,
    );

  const category =
    normalizeValue(
      transaction.category,
    );

  const metadata =
    getMetadata(transaction);

  const metadataType =
    normalizeValue(
      metadata.transaction_type,
    );

  const counterpartyType =
    normalizeValue(
      metadata.counterparty_type,
    );

  // ----------------------------------------------------------
  // INTERNAL WALLET TRANSFER
  // ----------------------------------------------------------

  if (
    type === "internal_transfer" ||
    metadataType === "internal_transfer" ||
    counterpartyType ===
      "wallet"
  ) {
    return "internal_transfer";
  }

  // ----------------------------------------------------------
  // WALLET FUNDING
  // ----------------------------------------------------------

  if (
    type === "wallet_funding" ||
    category === "funding" ||
    category === "wallet_funding"
  ) {
    return "wallet_funding";
  }

  // ----------------------------------------------------------
  // BANK TRANSFER
  // ----------------------------------------------------------

  if (
    category === "transfer" ||
    metadataType === "bank_transfer" ||
    counterpartyType ===
      "bank_account" ||
    Boolean(
      metadata.account_number ||
      metadata.account_number_masked ||
      metadata.account_bank ||
      metadata.bank_code ||
      metadata.bank_name
    )
  ) {
    return "bank_transfer";
  }

  // ----------------------------------------------------------
  // BILL PAYMENT
  // ----------------------------------------------------------

  if (
    category === "bill_payment" ||
    type === "bill_payment" ||
    [
      "airtime",
      "data",
      "electricity",
      "cable",
      "internet",
    ].includes(type)
  ) {
    return "bill_payment";
  }

  // ----------------------------------------------------------
  // REFUND
  // ----------------------------------------------------------

  if (
    type === "refund" ||
    category === "refund"
  ) {
    return "refund";
  }

  return "other";
};


// ============================================================
// FRIENDLY TRANSACTION LABEL
// ============================================================

const getTransactionLabel = (
  transaction: AdminTransaction,
) => {
  const kind =
    getTransactionKind(
      transaction,
    );

  const metadata =
    getMetadata(transaction);

  switch (kind) {
    case "internal_transfer":
      return (
        metadata.narration ||
        "IyanjuPay Wallet Transfer"
      );

    case "wallet_funding":
      return (
        metadata.narration ||
        "Wallet Funding"
      );

    case "bank_transfer":
      return (
        transaction.description ||
        "Bank Transfer"
      );

    case "bill_payment":
      return (
        transaction.description ||
        "Bill Payment"
      );

    case "refund":
      return (
        transaction.description ||
        "Refund"
      );

    default:
      return (
        transaction.description ||
        cleanValue(
          transaction.transaction_type,
        )
          .replace(/_/g, " ")
          .replace(/\b\w/g, (
            char,
          ) =>
            char.toUpperCase(),
          )
      );
  }
};


// ============================================================
// BANK DETAILS
// ============================================================

const normalizeBankCode = (
  value: unknown,
) => {
  const raw =
    cleanValue(value);

  if (!raw) {
    return "";
  }

  return raw.replace(
    /[^0-9]/g,
    "",
  );
};


const getBankCode = (
  transaction: AdminTransaction,
) => {
  const metadata =
    getMetadata(transaction);

  const value =
    getMetadataValue(
      transaction,

      "bankcode",
      "bank_code",

      "account_bank",
      "accountBank",

      "bankCode",

      "recipient_bank_code",
      "recipientBankCode",

      "beneficiary_bank_code",
      "beneficiaryBankCode",
    );

  return normalizeBankCode(
    value,
  );
};


const getBankName = (
  transaction: AdminTransaction,
) => {
  const metadata =
    getMetadata(transaction);

  // ----------------------------------------------------------
  // FIRST: explicit bank name stored in metadata
  // ----------------------------------------------------------

  const explicitName =
    getMetadataValue(
      transaction,

      "bankname",
      "bank_name",

      "account_bank_name",
      "accountBankName",

      "recipient_bank_name",
      "recipientBankName",

      "beneficiary_bank_name",
      "beneficiaryBankName",

      "bankName",
    );

  if (
    explicitName &&
    !/^\d+$/.test(
      cleanValue(explicitName),
    )
  ) {
    return cleanValue(
      explicitName,
    );
  }

  // ----------------------------------------------------------
  // SECOND: resolve bank code
  // ----------------------------------------------------------

  const code =
    getBankCode(
      transaction,
    );

  if (
    code &&
    NIGERIAN_BANK_CODES[code]
  ) {
    return NIGERIAN_BANK_CODES[
      code
    ];
  }

  // ----------------------------------------------------------
  // THIRD: fallback to provider
  // ----------------------------------------------------------

  if (
    transaction.provider &&
    !/^\d+$/.test(
      cleanValue(
        transaction.provider,
      ),
    )
  ) {
    return cleanValue(
      transaction.provider,
    );
  }

  // ----------------------------------------------------------
  // FOURTH: show code only when
  // absolutely necessary
  // ----------------------------------------------------------

  return code
    ? `Bank (${code})`
    : "Unknown bank";
};


// ============================================================
// BANK TRANSFER DETECTION
// ============================================================

const isBankTransfer = (
  transaction: AdminTransaction,
) => {
  return (
    getTransactionKind(
      transaction,
    ) === "bank_transfer"
  );
};


// ============================================================
// RECIPIENT HELPERS
// ============================================================

const getRecipientName = (
  transaction: AdminTransaction,
) => {
  const metadata =
    getMetadata(transaction);

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
      "bankAccountName",

      "counterparty_name",
      "counterpartyName",

      "fullname",
      "full_name",

      "destination_name",
      "destinationName",
    ) ||
    metadata.customer?.name ||
    "Unknown recipient"
  );
};


const getRecipientBank = (
  transaction: AdminTransaction,
) => {
  return getBankName(
    transaction,
  );
};


const maskAccountNumber = (
  accountNumber: string,
) => {
  const clean =
    String(
      accountNumber || "",
    ).replace(
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


const getRecipientAccount = (
  transaction: AdminTransaction,
) => {
  const raw =
    getMetadataValue(
      transaction,

      "account_number",
      "accountNumber",

      "recipient_account_number",
      "recipientAccountNumber",

      "beneficiary_account_number",
      "beneficiaryAccountNumber",

      "destination_account_number",
      "destinationAccountNumber",

      "account_number_masked",
      "accountNumberMasked",
    );

  if (!raw) {
    return "—";
  }

  const value =
    cleanValue(raw);

  if (
    value.toLowerCase()
      .includes("x")
  ) {
    return value;
  }

  return maskAccountNumber(
    value,
  );
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

    "destination_wallet_id",
    "destinationWalletId",

    "to_wallet_id",
    "toWalletId",
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

    "destination_email",
    "destinationEmail",
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

    "destination_phone",
    "destinationPhone",
  );
};


// ============================================================
// TYPE LABEL
// ============================================================

const transactionTypeLabel = (
  transaction: AdminTransaction,
) => {
  const kind =
    getTransactionKind(
      transaction,
    );

  switch (kind) {
    case "internal_transfer":
      return "Wallet Transfer";

    case "wallet_funding":
      return "Wallet Funding";

    case "bank_transfer":
      return "Bank Transfer";

    case "bill_payment":
      return "Bill Payment";

    case "refund":
      return "Refund";

    default:
      return cleanValue(
        transaction.transaction_type,
      )
        .replace(/_/g, " ")
        .replace(/\b\w/g, (
          char,
        ) =>
          char.toUpperCase(),
        );
  }
};


// ============================================================
// CATEGORY LABEL
// ============================================================

const categoryLabel = (
  transaction: AdminTransaction,
) => {
  const category =
    normalizeValue(
      transaction.category,
    );

  switch (category) {
    case "transfer":
      return "Transfer";

    case "bill_payment":
      return "Bill Payment";

    case "refund":
      return "Refund";

    case "funding":
      return "Funding";

    default:
      return (
        cleanValue(
          transaction.category,
        )
          .replace(/_/g, " ")
          .replace(/\b\w/g, (
            char,
          ) =>
            char.toUpperCase(),
          ) ||
        "—"
      );
  }
};


// ============================================================
// COPY
// ============================================================

const copyToClipboard = async (
  value: string,
  label: string,
  toast: ReturnType<
    typeof useToast
  >["toast"],
) => {
  try {
    await navigator.clipboard.writeText(
      value,
    );

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

const AdminTransactionsPage =
  () => {
    const { toast } =
      useToast();

    const [
      transactions,
      setTransactions,
    ] =
      useState<
        AdminTransaction[]
      >([]);

    const [loading, setLoading] =
      useState(true);

    const [
      refreshing,
      setRefreshing,
    ] =
      useState(false);

    const [page, setPage] =
      useState(1);

    const [
      totalCount,
      setTotalCount,
    ] =
      useState(0);

    const [
      searchInput,
      setSearchInput,
    ] =
      useState("");

    const [search, setSearch] =
      useState("");

    const [status, setStatus] =
      useState("");

    const [
      transactionType,
      setTransactionType,
    ] =
      useState("");

    const [category, setCategory] =
      useState("");

    const [
      selectedTransaction,
      setSelectedTransaction,
    ] =
      useState<
        AdminTransaction | null
      >(null);


    const totalPages =
      useMemo(
        () =>
          Math.max(
            1,
            Math.ceil(
              totalCount /
                PAGE_SIZE,
            ),
          ),
        [totalCount],
      );


    // ========================================================
    // FETCH
    // ========================================================

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
            } =
              await supabase.rpc(
                "admin_get_transactions",
                {
                  p_page: page,

                  p_page_size:
                    PAGE_SIZE,

                  p_search:
                    search.trim() ||
                    null,

                  p_status:
                    status ||
                    null,

                  p_transaction_type:
                    transactionType ||
                    null,

                  p_category:
                    category ||
                    null,

                  p_date_from:
                    null,

                  p_date_to:
                    null,
                },
              );

            if (error) {
              throw error;
            }

            const rows =
              (
                data || []
              ) as AdminTransaction[];

            setTransactions(
              rows,
            );

            setTotalCount(
              Number(
                rows[0]
                  ?.total_count ||
                  0,
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

              variant:
                "destructive",
            });

            setTransactions(
              [],
            );

            setTotalCount(0);
          } finally {
            setLoading(false);
            setRefreshing(
              false,
            );
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


    // ========================================================
    // FILTERS
    // ========================================================

    const handleSearch =
      () => {
        setPage(1);

        setSearch(
          searchInput.trim(),
        );
      };


    const clearFilters =
      () => {
        setSearchInput("");
        setSearch("");
        setStatus("");
        setTransactionType("");
        setCategory("");
        setPage(1);
      };


    const hasFilters =
      Boolean(
        search ||
        status ||
        transactionType ||
        category,
      );


    // ========================================================
    // RENDER
    // ========================================================

    return (
      <AdminLayout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">

          {/* HEADER */}

          <section>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Transactions
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  Monitor customer funding, wallet transfers,
                  bank transfers, bill payments and refunds.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  fetchTransactions(
                    true,
                  )
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


          {/* FILTERS */}

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
                  value={
                    searchInput
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearchInput(
                      event.target
                        .value,
                    )
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      handleSearch();
                    }
                  }}
                  placeholder="Search reference, customer, email, phone..."
                  className="pl-9"
                />
              </div>


              {/* STATUS */}

              <select
                value={status}
                onChange={(
                  event,
                ) => {
                  setStatus(
                    event.target
                      .value,
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


              {/* REAL TRANSACTION TYPES */}

              <select
                value={
                  transactionType
                }
                onChange={(
                  event,
                ) => {
                  setTransactionType(
                    event.target
                      .value,
                  );

                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  All transaction types
                </option>

                <option value="wallet_funding">
                  Wallet Funding
                </option>

                <option value="internal_transfer">
                  Wallet Transfer
                </option>

                <option value="debit">
                  Debit
                </option>

                <option value="refund">
                  Refund
                </option>
              </select>


              {/* REAL CATEGORIES */}

              <select
                value={category}
                onChange={(
                  event,
                ) => {
                  setCategory(
                    event.target
                      .value,
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
              </select>

            </div>


            <div className="flex flex-wrap items-center gap-2 mt-3">

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
          </section>


          {/* SUMMARY */}

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
                    {page} /{" "}
                    {totalPages}
                  </p>
                </div>

              </div>
            </div>

          </section>


          {/* TABLE */}

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
            ) : transactions.length ===
              0 ? (
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
                      (
                        transaction,
                      ) => {

                        const bankTransfer =
                          isBankTransfer(
                            transaction,
                          );

                        const kind =
                          getTransactionKind(
                            transaction,
                          );

                        return (
                          <tr
                            key={
                              transaction.id
                            }
                            className="hover:bg-gray-50 transition"
                          >

                            {/* TRANSACTION */}

                            <td className="px-5 py-4">

                              <div className="max-w-[230px]">

                                <div className="flex items-center gap-2">

                                  {kind ===
                                    "internal_transfer" ? (
                                    <ArrowLeftRight className="h-4 w-4 text-purple-500 shrink-0" />
                                  ) : kind ===
                                    "wallet_funding" ? (
                                    <ArrowDownToLine className="h-4 w-4 text-green-500 shrink-0" />
                                  ) : kind ===
                                    "bank_transfer" ? (
                                    <ArrowUpFromLine className="h-4 w-4 text-blue-500 shrink-0" />
                                  ) : (
                                    <Activity className="h-4 w-4 text-gray-400 shrink-0" />
                                  )}

                                  <p className="font-semibold text-gray-900 truncate">
                                    {
                                      getTransactionLabel(
                                        transaction,
                                      )
                                    }
                                  </p>

                                </div>


                                <p className="text-[11px] text-gray-400 font-mono mt-1 truncate">
                                  {
                                    transaction.reference_number
                                  }
                                </p>


                                {transaction.provider && (
                                  <p className="text-[11px] text-gray-400 mt-1 truncate">
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


                            {/* RECIPIENT */}

                            <td className="px-5 py-4">

                              {bankTransfer ? (
                                <div className="max-w-[230px]">

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
                              ) : kind ===
                                "internal_transfer" ? (
                                <div className="max-w-[230px]">

                                  <div className="flex items-center gap-2">

                                    <Wallet className="h-4 w-4 text-purple-500 shrink-0" />

                                    <p className="font-semibold text-gray-900 truncate">
                                      IyanjuPay Wallet
                                    </p>

                                  </div>

                                  {getRecipientWalletId(
                                    transaction,
                                  ) && (
                                    <p className="text-[11px] text-gray-400 font-mono mt-1 truncate">
                                      {
                                        getRecipientWalletId(
                                          transaction,
                                        )
                                      }
                                    </p>
                                  )}

                                </div>
                              ) : (
                                <span className="text-gray-400">
                                  —
                                </span>
                              )}

                            </td>


                            {/* TYPE */}

                            <td className="px-5 py-4 whitespace-nowrap">

                              <span className="text-gray-700 font-medium">
                                {
                                  transactionTypeLabel(
                                    transaction,
                                  )
                                }
                              </span>

                              <p className="text-[11px] text-gray-400 mt-1">
                                {
                                  categoryLabel(
                                    transaction,
                                  )
                                }
                              </p>

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


            {/* PAGINATION */}

            {!loading &&
              transactions.length >
                0 && (
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

                    {" – "}

                    <span className="font-semibold text-gray-700">
                      {
                        Math.min(
                          page *
                            PAGE_SIZE,
                          totalCount,
                        )
                      }
                    </span>

                    {" of "}

                    <span className="font-semibold text-gray-700">
                      {
                        totalCount
                      }
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
                          (
                            value,
                          ) =>
                            Math.max(
                              1,
                              value -
                                1,
                            ),
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
                          (
                            value,
                          ) =>
                            Math.min(
                              totalPages,
                              value +
                                1,
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

          {selectedTransaction && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

              <button
                type="button"
                aria-label="Close transaction details"
                onClick={() =>
                  setSelectedTransaction(
                    null,
                  )
                }
                className="absolute inset-0 bg-black/40"
              />


              <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">

                {/* HEADER */}

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
                      setSelectedTransaction(
                        null,
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
                      {
                        getTransactionLabel(
                          selectedTransaction,
                        )
                      }
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


                  {/* CUSTOMER */}

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


                  {/* RECIPIENT */}

                  {(isBankTransfer(
                    selectedTransaction,
                  ) ||
                    getTransactionKind(
                      selectedTransaction,
                    ) ===
                      "internal_transfer") && (

                    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5">

                      <div className="flex items-center gap-2 mb-4">

                        {isBankTransfer(
                          selectedTransaction,
                        ) ? (
                          <Building2 className="h-5 w-5 text-purple-600" />
                        ) : (
                          <Wallet className="h-5 w-5 text-purple-600" />
                        )}

                        <div>

                          <h4 className="font-bold text-gray-900">
                            Recipient Details
                          </h4>

                          <p className="text-xs text-gray-500">
                            Beneficiary information associated with this transaction.
                          </p>

                        </div>

                      </div>


                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        {/* NAME */}

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

                        {isBankTransfer(
                          selectedTransaction,
                        ) && (
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

                            {getBankCode(
                              selectedTransaction,
                            ) && (
                              <p className="text-[11px] text-gray-400 font-mono mt-1">
                                Bank code:{" "}
                                {
                                  getBankCode(
                                    selectedTransaction,
                                  )
                                }
                              </p>
                            )}

                          </div>
                        )}


                        {/* ACCOUNT */}

                        {isBankTransfer(
                          selectedTransaction,
                        ) && (
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
                        )}


                        {/* WALLET */}

                        {getRecipientWalletId(
                          selectedTransaction,
                        ) && (
                          <div className="bg-white rounded-xl border p-3">

                            <p className="text-[11px] text-gray-400">
                              Recipient Wallet ID
                            </p>

                            <div className="flex items-center gap-2 mt-1">

                              <Wallet className="h-4 w-4 text-purple-500" />

                              <p className="text-xs font-mono font-semibold text-gray-900 break-all">
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


                        {/* EMAIL */}

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


                        {/* PHONE */}

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

                    </div>
                  )}


                  {/* TRANSACTION INFO */}

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
                          Transaction
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {
                            getTransactionLabel(
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
                              selectedTransaction,
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
                              selectedTransaction,
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


                  {/* CHARGEBACK */}

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


                  {/* RAW METADATA */}

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
