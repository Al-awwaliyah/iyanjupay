import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowDownLeft,
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  CreditCard,
  Download,
  Globe,
  History,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Smartphone,
  Wallet,
  Wifi,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/* ================================================================
   TYPES
   ================================================================ */

type JsonObject = Record<string, any>;

type Transaction = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  transaction_type: string;
  amount: number | string;
  description: string | null;
  status: string;
  reference_number: string;
  provider: string | null;
  provider_reference: string | null;
  category: string | null;
  metadata: JsonObject | null;
  created_at: string;
};

type TransactionKind =
  | "bank_transfer"
  | "wallet_transfer"
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet"
  | "funding"
  | "refund"
  | "fee"
  | "other";

type Direction =
  | "incoming"
  | "outgoing";

type FilterType =
  | "all"
  | "money_in"
  | "money_out"
  | "transfers"
  | "bills"
  | "funding"
  | "refunds";

type StatusFilter =
  | "all"
  | "successful"
  | "pending"
  | "failed";

type NormalizedTransaction = {
  transaction: Transaction;

  kind: TransactionKind;

  direction: Direction;

  title: string;

  subtitle: string;

  /*
   * IMPORTANT:
   * This is the CUSTOMER-FACING service provider/biller/network.
   * It must NEVER contain ClubKonnect, Flutterwave, or another
   * internal fulfilment provider.
   */
  serviceProviderName: string;

  recipientName: string;

  senderName: string;

  phoneNumber: string;

  accountNumber: string;

  accountName: string;

  bankCode: string;

  bankName: string;

  walletId: string;

  virtualAccountNumber: string;

  meterNumber: string;

  meterType: string;

  smartcardNumber: string;

  packageName: string;

  internetAccount: string;

  amount: number;

  fee: number;

  totalCharged: number;

  isSuccessful: boolean;

  isPending: boolean;

  isFailed: boolean;
};

type TransactionHistoryProps = {
  onBack?: () => void;
};

/* ================================================================
   CONSTANTS
   ================================================================ */

const PAGE_SIZE = 10;

const SUCCESS_STATUSES = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "succeeded",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "reversed",
]);

const PENDING_STATUSES = new Set([
  "pending",
  "processing",
  "queued",
  "new",
  "initiated",
  "in_progress",
  "in-progress",
]);

const BILL_KINDS = new Set<TransactionKind>([
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
]);

/*
 * Internal fulfilment providers must NEVER be displayed to the
 * customer as a service provider/network/biller.
 */
const INTERNAL_PROVIDER_NAMES = new Set([
  "clubkonnect",
  "club konnect",
  "club-konnect",
  "flutterwave",
  "flutter wave",
  "flutter-wave",
  "iyanjupay",
  "iyanju pay",
]);

/* ================================================================
   HELPERS
   ================================================================ */

const normalizeText = (
  value: unknown
): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
};

const stringValue = (
  ...values: unknown[]
): string => {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return "";
};

const numberValue = (
  ...values: unknown[]
): number => {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const formatCurrency = (
  value: number
): string => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(
    Number.isFinite(value)
      ? value
      : 0
  );
};

const formatDate = (
  value: string
): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString(
    "en-NG",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
};

const formatDateTime = (
  value: string
): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString(
    "en-NG",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
};

const normalizePhone = (
  value: unknown
): string => {
  return String(value ?? "").trim();
};

const getNested = (
  object: JsonObject,
  paths: string[][]
): unknown => {
  for (const path of paths) {
    let current: any = object;

    for (const key of path) {
      if (
        current === null ||
        current === undefined
      ) {
        current = undefined;
        break;
      }

      current = current[key];
    }

    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== ""
    ) {
      return current;
    }
  }

  return undefined;
};

const escapeCsv = (
  value: unknown
): string => {
  const text = String(value ?? "");

  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
};

/* ================================================================
   CUSTOMER-FACING SERVICE PROVIDER
   ================================================================ */

/**
 * Returns true when a value represents an internal fulfilment
 * provider rather than the customer's actual network/biller.
 */
const isInternalProviderName = (
  value: unknown
): boolean => {
  const normalized = normalizeText(
    value
  );

  if (!normalized) {
    return true;
  }

  return INTERNAL_PROVIDER_NAMES.has(
    normalized.replace(/_/g, " ")
  ) ||
    INTERNAL_PROVIDER_NAMES.has(
      normalized
    );
};

/**
 * Extract the customer-facing network/biller/service provider.
 *
 * IMPORTANT:
 * We deliberately DO NOT fall back to metadata.provider.
 * `metadata.provider` is commonly ClubKonnect/Flutterwave and is
 * an internal implementation detail.
 */
const getCustomerServiceProvider = (
  metadata: JsonObject,
  service: string
): string => {
  const candidates: unknown[] = [];

  /*
   * Strong customer-facing fields first.
   */
  candidates.push(
    metadata.network_name,
    metadata.networkName,
    metadata.network,
    metadata.biller_name,
    metadata.billerName,
    metadata.service_provider_name,
    metadata.serviceProviderName,
    metadata.operator_name,
    metadata.operatorName,
    metadata.tv_service,
    metadata.tvService,
    metadata.cable_provider,
    metadata.cableProvider,
    metadata.electricity_company,
    metadata.electricityCompany,
    metadata.disco_name,
    metadata.discoName,
    metadata.disco,
    metadata.provider_name,
    metadata.providerName
  );

  /*
   * Search nested customer-facing response data.
   */
  candidates.push(
    getNested(metadata, [
      ["flutterwave", "data", "network_name"],
    ]),
    getNested(metadata, [
      ["flutterwave", "data", "networkName"],
    ]),
    getNested(metadata, [
      ["flutterwave", "data", "network"],
    ]),
    getNested(metadata, [
      ["flutterwave_response", "data", "network_name"],
    ]),
    getNested(metadata, [
      ["flutterwave_response", "data", "networkName"],
    ]),
    getNested(metadata, [
      ["flutterwave_response", "data", "network"],
    ]),
    getNested(metadata, [
      ["flutterwave", "data", "biller_name"],
    ]),
    getNested(metadata, [
      ["flutterwave_response", "data", "biller_name"],
    ])
  );

  for (const candidate of candidates) {
    const value = stringValue(
      candidate
    );

    if (
      value &&
      !isInternalProviderName(value)
    ) {
      return value;
    }
  }

  /*
   * Do NOT use metadata.provider here.
   *
   * If the service is cable and no biller was persisted, we can
   * still attempt to identify the TV service from the metadata.
   */
  if (service === "cable") {
    const cableCandidates = [
      metadata.tv,
      metadata.tv_provider,
      metadata.tvProvider,
      metadata.cable,
      metadata.cable_service,
      metadata.cableService,
    ];

    for (const candidate of cableCandidates) {
      const value = stringValue(
        candidate
      );

      if (
        value &&
        !isInternalProviderName(value)
      ) {
        return value;
      }
    }
  }

  return "";
};

/* ================================================================
   DETERMINE TRANSACTION KIND
   ================================================================ */

const determineKind = (
  transaction: Transaction
): TransactionKind => {
  const metadata =
    transaction.metadata ?? {};

  const rawType = normalizeText(
    transaction.transaction_type
  );

  const category = normalizeText(
    transaction.category
  );

  const description = normalizeText(
    transaction.description
  );

  const metadataType = normalizeText(
    metadata.type
  );

  const metadataCategory =
    normalizeText(
      metadata.category
    );

  const metadataService =
    normalizeText(
      metadata.service
    );

  const metadataTransactionType =
    normalizeText(
      metadata.transaction_type
    );

  const combined = [
    rawType,
    category,
    description,
    metadataType,
    metadataCategory,
    metadataService,
    metadataTransactionType,
  ].join(" ");

  if (
    combined.includes(
      "transfer_refund"
    ) ||
    category ===
      "transfer_refund" ||
    rawType === "refund" ||
    combined.includes("refund")
  ) {
    return "refund";
  }

  if (
    combined.includes("fee") ||
    category === "transfer_fee"
  ) {
    return "fee";
  }

  if (
    combined.includes("airtime") ||
    metadataService === "airtime"
  ) {
    return "airtime";
  }

  if (
    combined.includes("electricity") ||
    metadataService ===
      "electricity"
  ) {
    return "electricity";
  }

  if (
    combined.includes("cable") ||
    combined.includes("dstv") ||
    combined.includes("gotv") ||
    metadataService === "cable"
  ) {
    return "cable";
  }

  if (
    combined.includes("internet") ||
    metadataService === "internet"
  ) {
    return "internet";
  }

  if (
    combined.includes("data") ||
    metadataService === "data"
  ) {
    return "data";
  }

  const recipient =
    metadata.recipient;

  const sender =
    metadata.sender;

  if (
    recipient ||
    sender ||
    combined.includes(
      "wallet_transfer"
    ) ||
    combined.includes(
      "wallet transfer"
    ) ||
    normalizeText(
      metadata.provider
    ) === "iyanjupay"
  ) {
    return "wallet_transfer";
  }

  if (
    combined.includes("funding") ||
    combined.includes("deposit") ||
    combined.includes(
      "wallet_funding"
    ) ||
    rawType === "credit" ||
    rawType === "funding" ||
    rawType === "deposit"
  ) {
    return "funding";
  }

  if (
    combined.includes(
      "bank_transfer"
    ) ||
    combined.includes(
      "bank transfer"
    ) ||
    category === "transfer" ||
    rawType === "transfer" ||
    rawType === "debit" ||
    normalizeText(
      metadata.provider
    ) === "flutterwave"
  ) {
    return "bank_transfer";
  }

  return "other";
};

/* ================================================================
   DETERMINE DIRECTION
   ================================================================ */

const determineDirection = (
  transaction: Transaction,
  kind: TransactionKind
): Direction => {
  const metadata =
    transaction.metadata ?? {};

  const explicitDirection =
    normalizeText(
      metadata.direction ??
        metadata.transaction_direction ??
        metadata.flow
    );

  if (
    explicitDirection ===
      "incoming" ||
    explicitDirection === "in" ||
    explicitDirection ===
      "credit" ||
    explicitDirection ===
      "received"
  ) {
    return "incoming";
  }

  if (
    explicitDirection ===
      "outgoing" ||
    explicitDirection === "out" ||
    explicitDirection ===
      "debit" ||
    explicitDirection === "sent"
  ) {
    return "outgoing";
  }

  if (
    metadata.sender &&
    !metadata.recipient
  ) {
    return "incoming";
  }

  if (
    metadata.recipient &&
    !metadata.sender
  ) {
    return "outgoing";
  }

  if (
    kind === "funding" ||
    kind === "refund"
  ) {
    return "incoming";
  }

  if (
    kind === "fee" ||
    BILL_KINDS.has(kind) ||
    kind === "bank_transfer"
  ) {
    return "outgoing";
  }

  const type =
    normalizeText(
      transaction.transaction_type
    );

  if (
    type === "credit" ||
    type === "deposit" ||
    type === "funding"
  ) {
    return "incoming";
  }

  return "outgoing";
};

/* ================================================================
   NORMALIZE TRANSACTION
   ================================================================ */

const normalizeTransaction = (
  transaction: Transaction
): NormalizedTransaction => {
  const metadata =
    transaction.metadata ?? {};

  const kind =
    determineKind(transaction);

  const direction =
    determineDirection(
      transaction,
      kind
    );

  /* --------------------------------------------------------------
     BANK TRANSFER
     -------------------------------------------------------------- */

  const accountNumber =
    stringValue(
      metadata.account_number,
      metadata.accountNumber,
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "account_number",
        ],
      ]),
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "accountNumber",
        ],
      ]),
      getNested(metadata, [
        [
          "flutterwave",
          "data",
          "account_number",
        ],
      ])
    );

  const accountName =
    stringValue(
      metadata.beneficiary_name,
      metadata.beneficiaryName,
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "full_name",
        ],
      ]),
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "account_name",
        ],
      ]),
      getNested(metadata, [
        [
          "flutterwave",
          "data",
          "full_name",
        ],
      ])
    );

  const bankCode =
    stringValue(
      metadata.account_bank,
      metadata.bank_code,
      metadata.bankCode,
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "bank_code",
        ],
      ])
    );

  const bankName =
    stringValue(
      metadata.bank_name,
      metadata.bankName,
      getNested(metadata, [
        [
          "flutterwave_response",
          "data",
          "bank_name",
        ],
      ]),
      getNested(metadata, [
        [
          "flutterwave",
          "data",
          "bank_name",
        ],
      ])
    );

  /* --------------------------------------------------------------
     INTERNAL WALLET TRANSFER
     -------------------------------------------------------------- */

  const recipient =
    metadata.recipient ?? {};

  const sender =
    metadata.sender ?? {};

  const recipientName =
    stringValue(
      recipient.name,
      recipient.full_name,
      recipient.fullName,
      metadata.recipient_name,
      metadata.beneficiary_name
    );

  const senderName =
    stringValue(
      sender.name,
      sender.full_name,
      sender.fullName,
      metadata.sender_name
    );

  const walletId =
    stringValue(
      recipient.wallet_id,
      recipient.walletId,
      metadata.recipient_wallet_id,
      sender.wallet_id,
      sender.walletId,
      metadata.sender_wallet_id
    );

  /* --------------------------------------------------------------
     BILL INFORMATION
     -------------------------------------------------------------- */

  const service =
    normalizeText(
      metadata.service ??
        getNested(metadata, [
          ["flutterwave", "service"],
        ])
    );

  /*
   * CRITICAL:
   *
   * `serviceProviderName` is deliberately derived from customer-
   * facing network/biller fields only.
   *
   * We NEVER fall back to metadata.provider.
   */
  const serviceProviderName =
    getCustomerServiceProvider(
      metadata,
      service
    );

  const phoneNumber =
    normalizePhone(
      metadata.customer_phone ??
        metadata.customerPhone ??
        metadata.phone_number ??
        metadata.phone ??
        (
          service === "airtime" ||
          service === "data"
            ? metadata.customer
            : undefined
        ) ??
        getNested(metadata, [
          [
            "flutterwave",
            "data",
            "phone_number",
          ],
        ]) ??
        getNested(metadata, [
          [
            "flutterwave_response",
            "data",
            "phone_number",
          ],
        ]) ??
        recipient.phone_number ??
        sender.phone_number
    );

  const meterNumber =
    stringValue(
      metadata.meter_number,
      metadata.meterNumber,
      metadata.meter,
      service === "electricity"
        ? metadata.customer
        : undefined
    );

  const meterType =
    stringValue(
      metadata.meter_type,
      metadata.meterType,
      metadata.customer_type,
      metadata.customerType
    );

  const smartcardNumber =
    stringValue(
      metadata.smartcard_number,
      metadata.smartcardNumber,
      metadata.iuc_number,
      metadata.iucNumber,
      service === "cable"
        ? metadata.customer
        : undefined
    );

  const packageName =
    stringValue(
      metadata.package,
      metadata.package_name,
      metadata.packageName,
      metadata.plan,
      metadata.plan_name,
      metadata.planName,
      metadata.item_name,
      metadata.itemName
    );

  const internetAccount =
    stringValue(
      metadata.account_number,
      metadata.internet_account,
      metadata.internetAccount,
      service === "internet"
        ? metadata.customer
        : undefined
    );

  /* --------------------------------------------------------------
     FUNDING
     -------------------------------------------------------------- */

  const virtualAccountNumber =
    stringValue(
      metadata.virtual_account_number,
      metadata.virtualAccountNumber,
      metadata.account_number,
      getNested(metadata, [
        [
          "virtual_account",
          "account_number",
        ],
      ])
    );

  /* --------------------------------------------------------------
     ELECTRONIC TRANSFER FEE
     -------------------------------------------------------------- */

  const isElectronicFee =
    kind === "fee" &&
    (
      normalizeText(
        transaction.category
      ) ===
        "electronic_transfer_fee" ||
      normalizeText(
        metadata.category
      ) ===
        "electronic_transfer_fee" ||
      normalizeText(
        metadata.fee_type
      ) ===
        "electronic_transfer_fee" ||
      normalizeText(
        transaction.description
      ).includes(
        "electronic_transfer_fee"
      ) ||
      normalizeText(
        transaction.description
      ).includes(
        "electronic_transfer_fee_for"
      )
    );

  /* --------------------------------------------------------------
     PRICING
     -------------------------------------------------------------- */

  const amount = isElectronicFee
    ? numberValue(
        metadata.electronic_fee_amount_charged,
        metadata.electronic_fee,
        transaction.amount
      )
    : numberValue(
        metadata.transfer_amount,
        transaction.amount
      );

  const fee = isElectronicFee
    ? 0
    : numberValue(
        metadata.iyanjupay_fee,
        metadata.transfer_fee,
        metadata.fee,
        metadata.fee_amount,
        metadata.electronic_fee
      );

  const totalCharged =
    isElectronicFee
      ? amount
      : numberValue(
          metadata.total_charged,
          metadata.totalCharged,
          amount + fee
        );

  /* --------------------------------------------------------------
     STATUS
     -------------------------------------------------------------- */

  const normalizedStatus =
    normalizeText(
      transaction.status
    );

  const isSuccessful =
    SUCCESS_STATUSES.has(
      normalizedStatus
    );

  const isFailed =
    FAILED_STATUSES.has(
      normalizedStatus
    );

  const isPending =
    PENDING_STATUSES.has(
      normalizedStatus
    ) ||
    (!isSuccessful &&
      !isFailed);

  /* --------------------------------------------------------------
     DISPLAY TITLE
     -------------------------------------------------------------- */

  let title = "Transaction";

  let subtitle =
    transaction.description ||
    "IyanjuPay transaction";

  if (
    kind === "bank_transfer"
  ) {
    title =
      direction === "incoming"
        ? `Transfer from ${
            senderName ||
            "Bank account"
          }`
        : `Transfer to ${
            accountName ||
            recipientName ||
            "Bank account"
          }`;

    subtitle =
      bankName ||
      (bankCode
        ? `Bank code ${bankCode}`
        : "Bank transfer");
  }

  if (
    kind === "wallet_transfer"
  ) {
    title =
      direction === "incoming"
        ? `Transfer from ${
            senderName ||
            "IyanjuPay user"
          }`
        : `Transfer to ${
            recipientName ||
            "IyanjuPay user"
          }`;

    subtitle =
      "IyanjuPay Wallet";
  }

  if (kind === "airtime") {
    title =
      serviceProviderName
        ? `Airtime — ${serviceProviderName}`
        : "Airtime";

    subtitle =
      phoneNumber ||
      "Mobile recharge";
  }

  if (kind === "data") {
    title =
      serviceProviderName
        ? `Data — ${serviceProviderName}`
        : "Data";

    subtitle =
      phoneNumber ||
      packageName ||
      "Data bundle";
  }

  if (
    kind === "electricity"
  ) {
    title =
      serviceProviderName
        ? `Electricity — ${serviceProviderName}`
        : "Electricity";

    subtitle =
      meterNumber
        ? `Meter ${meterNumber}`
        : "Electricity payment";
  }

  if (kind === "cable") {
    title =
      serviceProviderName
        ? `Cable TV — ${serviceProviderName}`
        : "Cable TV";

    subtitle =
      smartcardNumber
        ? `IUC ${smartcardNumber}`
        : packageName ||
          "Cable TV payment";
  }

  if (kind === "internet") {
    title =
      serviceProviderName
        ? `Internet — ${serviceProviderName}`
        : "Internet";

    subtitle =
      internetAccount ||
      "Internet payment";
  }

  if (kind === "funding") {
    title =
      senderName
        ? `Wallet Funding from ${senderName}`
        : "Wallet Funding";

    subtitle =
      stringValue(
        metadata.sender_bank,
        metadata.bank_name,
        metadata.sender_bank_name,
        "Bank transfer"
      );
  }

  if (kind === "refund") {
    title = "Transfer Refund";

    subtitle =
      stringValue(
        metadata.reason,
        "Refund credited to wallet"
      );
  }

  if (kind === "fee") {
    title = isElectronicFee
      ? "Electronic Transfer Fee"
      : "Transfer Fee";

    subtitle =
      transaction.description ||
      "IyanjuPay transaction fee";
  }

  return {
    transaction,

    kind,

    direction,

    title,

    subtitle,

    serviceProviderName,

    recipientName,

    senderName,

    phoneNumber,

    accountNumber,

    accountName,

    bankCode,

    bankName,

    walletId,

    virtualAccountNumber,

    meterNumber,

    meterType,

    smartcardNumber,

    packageName,

    internetAccount,

    amount,

    fee,

    totalCharged,

    isSuccessful,

    isPending,

    isFailed,
  };
};

/* ================================================================
   STATUS LABEL
   ================================================================ */

const getStatusLabel = (
  normalized: NormalizedTransaction
): string => {
  if (normalized.isSuccessful) {
    return "Successful";
  }

  if (normalized.isFailed) {
    return "Failed";
  }

  return "Pending";
};

/* ================================================================
   STATUS BADGE
   ================================================================ */

const StatusBadge = ({
  transaction,
}: {
  transaction: NormalizedTransaction;
}) => {
  if (transaction.isSuccessful) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Successful
      </span>
    );
  }

  if (transaction.isFailed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <X className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-700">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Pending
    </span>
  );
};

/* ================================================================
   TRANSACTION ICON
   ================================================================ */

const TransactionIcon = ({
  transaction,
}: {
  transaction: NormalizedTransaction;
}) => {
  let Icon = CircleDollarSign;

  switch (transaction.kind) {
    case "bank_transfer":
      Icon = Building2;
      break;

    case "wallet_transfer":
      Icon = Wallet;
      break;

    case "airtime":
      Icon = Smartphone;
      break;

    case "data":
      Icon = Wifi;
      break;

    case "electricity":
      Icon = Zap;
      break;

    case "cable":
      Icon = CreditCard;
      break;

    case "internet":
      Icon = Globe;
      break;

    case "funding":
      Icon = Banknote;
      break;

    case "refund":
      Icon = ArrowDownLeft;
      break;

    case "fee":
      Icon = Receipt;
      break;
  }

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        transaction.direction ===
        "incoming"
          ? "bg-green-50 text-green-600"
          : "bg-purple-50 text-purple-600"
      }`}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
};

/* ================================================================
   DETAIL ROW
   ================================================================ */

const DetailRow = ({
  label,
  value,
  mono = false,
  copyable = false,
  onCopy,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) => {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
      <span className="text-sm text-gray-500">
        {label}
      </span>

      <div className="flex min-w-0 items-center gap-2 text-right">
        <span
          className={`break-all text-sm font-medium text-gray-900 ${
            mono
              ? "font-mono"
              : ""
          }`}
        >
          {value}
        </span>

        {copyable &&
          onCopy && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onCopy}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
      </div>
    </div>
  );
};

/* ================================================================
   COMPONENT
   ================================================================ */

const TransactionHistory = ({
  onBack,
}: TransactionHistoryProps) => {
  const { user } = useAuth();

  const { toast } = useToast();

  const [
    transactions,
    setTransactions,
  ] = useState<Transaction[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    filterType,
    setFilterType,
  ] = useState<FilterType>(
    "all"
  );

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>(
    "all"
  );

  const [
    dateFilter,
    setDateFilter,
  ] = useState("all");

  const [
    page,
    setPage,
  ] = useState(1);

  const [
    selectedTransaction,
    setSelectedTransaction,
  ] =
    useState<NormalizedTransaction | null>(
      null
    );

  /* ============================================================== 
     LOAD TRANSACTIONS
     ============================================================== */

  const loadTransactions =
    useCallback(
      async (
        showRefresh = false
      ) => {
        if (!user?.id) {
          setTransactions([]);
          setLoading(false);
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
            error: queryError,
          } = await supabase
            .from("transactions")
            .select(
              `
                id,
                user_id,
                wallet_id,
                transaction_type,
                amount,
                description,
                status,
                reference_number,
                provider,
                provider_reference,
                category,
                metadata,
                created_at
              `
            )
            .eq(
              "user_id",
              user.id
            )
            .order(
              "created_at",
              {
                ascending: false,
              }
            );

          if (queryError) {
            throw queryError;
          }

          setTransactions(
            (data ??
              []) as Transaction[]
          );
        } catch (err: any) {
          console.error(
            "Transaction history load error:",
            err
          );

          setError(
            err?.message ||
              "Unable to load transaction history."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [user?.id]
    );

  /* ============================================================== 
     INITIAL LOAD
     ============================================================== */

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  /* ============================================================== 
     REALTIME
     ============================================================== */

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const channel =
      supabase
        .channel(
          `transaction-history-${user.id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          payload => {
            if (
              payload.eventType ===
              "INSERT"
            ) {
              const incoming =
                payload.new as Transaction;

              setTransactions(
                current => {
                  const exists =
                    current.some(
                      item =>
                        item.id ===
                        incoming.id
                    );

                  if (exists) {
                    return current;
                  }

                  return [
                    incoming,
                    ...current,
                  ].sort(
                    (a, b) =>
                      new Date(
                        b.created_at
                      ).getTime() -
                      new Date(
                        a.created_at
                      ).getTime()
                  );
                }
              );

              return;
            }

            if (
              payload.eventType ===
              "UPDATE"
            ) {
              const updated =
                payload.new as Transaction;

              setTransactions(
                current =>
                  current
                    .map(item =>
                      item.id ===
                      updated.id
                        ? updated
                        : item
                    )
                    .sort(
                      (a, b) =>
                        new Date(
                          b.created_at
                        ).getTime() -
                        new Date(
                          a.created_at
                        ).getTime()
                    )
              );

              return;
            }

            if (
              payload.eventType ===
              "DELETE"
            ) {
              const deleted =
                payload.old as Transaction;

              setTransactions(
                current =>
                  current.filter(
                    item =>
                      item.id !==
                      deleted.id
                  )
              );
            }
          }
        )
        .subscribe(status => {
          if (
            status ===
            "CHANNEL_ERROR"
          ) {
            console.warn(
              "Transaction realtime channel error."
            );
          }
        });

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [user?.id]);

  /* ============================================================== 
     NORMALIZED TRANSACTIONS
     ============================================================== */

  const normalizedTransactions =
    useMemo(
      () =>
        transactions.map(
          normalizeTransaction
        ),
      [transactions]
    );

  /* ============================================================== 
     FILTER
     ============================================================== */

  const filteredTransactions =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      const now = new Date();

      return normalizedTransactions.filter(
        transaction => {
          const raw =
            transaction.transaction;

          if (query) {
            const searchable = [
              transaction.title,
              transaction.subtitle,
              transaction.serviceProviderName,
              transaction.recipientName,
              transaction.senderName,
              transaction.phoneNumber,
              transaction.accountNumber,
              transaction.accountName,
              transaction.bankName,
              transaction.walletId,
              transaction.virtualAccountNumber,
              transaction.meterNumber,
              transaction.smartcardNumber,
              transaction.packageName,
              raw.reference_number,
              raw.provider_reference,
              raw.description,
              raw.category,
              raw.transaction_type,
              raw.status,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            if (
              !searchable.includes(
                query
              )
            ) {
              return false;
            }
          }

          if (
            filterType ===
              "money_in" &&
            transaction.direction !==
              "incoming"
          ) {
            return false;
          }

          if (
            filterType ===
              "money_out" &&
            transaction.direction !==
              "outgoing"
          ) {
            return false;
          }

          if (
            filterType ===
              "transfers" &&
            transaction.kind !==
              "bank_transfer" &&
            transaction.kind !==
              "wallet_transfer"
          ) {
            return false;
          }

          if (
            filterType ===
              "bills" &&
            !BILL_KINDS.has(
              transaction.kind
            )
          ) {
            return false;
          }

          if (
            filterType ===
              "funding" &&
            transaction.kind !==
              "funding"
          ) {
            return false;
          }

          if (
            filterType ===
              "refunds" &&
            transaction.kind !==
              "refund"
          ) {
            return false;
          }

          if (
            statusFilter ===
              "successful" &&
            !transaction.isSuccessful
          ) {
            return false;
          }

          if (
            statusFilter ===
              "failed" &&
            !transaction.isFailed
          ) {
            return false;
          }

          if (
            statusFilter ===
              "pending" &&
            !transaction.isPending
          ) {
            return false;
          }

          if (
            dateFilter !== "all"
          ) {
            const createdAt =
              new Date(
                raw.created_at
              );

            if (
              dateFilter ===
              "today"
            ) {
              const start =
                new Date(now);

              start.setHours(
                0,
                0,
                0,
                0
              );

              if (
                createdAt < start
              ) {
                return false;
              }
            }

            if (
              dateFilter ===
              "7_days"
            ) {
              const start =
                new Date(now);

              start.setDate(
                start.getDate() -
                  7
              );

              if (
                createdAt < start
              ) {
                return false;
              }
            }

            if (
              dateFilter ===
              "30_days"
            ) {
              const start =
                new Date(now);

              start.setDate(
                start.getDate() -
                  30
              );

              if (
                createdAt < start
              ) {
                return false;
              }
            }

            if (
              dateFilter ===
              "this_month"
            ) {
              const start =
                new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  1
                );

              if (
                createdAt < start
              ) {
                return false;
              }
            }
          }

          return true;
        }
      );
    }, [
      normalizedTransactions,
      search,
      filterType,
      statusFilter,
      dateFilter,
    ]);

  /* ============================================================== 
     PAGINATION
     ============================================================== */

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredTransactions.length /
          PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  const paginatedTransactions =
    useMemo(() => {
      const start =
        (safePage - 1) *
        PAGE_SIZE;

      return filteredTransactions.slice(
        start,
        start + PAGE_SIZE
      );
    }, [
      filteredTransactions,
      safePage,
    ]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    filterType,
    statusFilter,
    dateFilter,
  ]);

  /* ============================================================== 
     COPY
     ============================================================== */

  const copyToClipboard =
    useCallback(
      async (
        value: string,
        label: string
      ) => {
        if (!value) {
          return;
        }

        try {
          await navigator.clipboard.writeText(
            value
          );

          toast({
            title: "Copied",
            description: `${label} copied to clipboard.`,
          });
        } catch (err) {
          console.error(
            "Clipboard error:",
            err
          );

          toast({
            title: "Copy failed",
            description: `Unable to copy ${label.toLowerCase()}.`,
            variant:
              "destructive",
          });
        }
      },
      [toast]
    );

  /* ============================================================== 
     CSV EXPORT
     ============================================================== */

  const exportCsv =
    useCallback(() => {
      if (
        filteredTransactions.length ===
        0
      ) {
        toast({
          title:
            "Nothing to export",
          description:
            "There are no transactions matching your current filters.",
        });

        return;
      }

      /*
       * Deliberately no internal Provider column.
       */
      const headers = [
        "Date",
        "Title",
        "Type",
        "Direction",
        "Amount",
        "Fee",
        "Total Charged",
        "Status",
        "Service Provider",
        "Bank",
        "Account Name",
        "Account Number",
        "Phone Number",
        "Wallet ID",
        "Meter Number",
        "Smartcard/IUC",
        "Reference",
      ];

      const rows =
        filteredTransactions.map(
          item =>
            [
              formatDateTime(
                item.transaction.created_at
              ),
              item.title,
              item.kind,
              item.direction,
              item.amount.toFixed(2),
              item.fee.toFixed(2),
              item.totalCharged.toFixed(
                2
              ),
              getStatusLabel(item),
              item.serviceProviderName,
              item.bankName,
              item.accountName,
              item.accountNumber,
              item.phoneNumber,
              item.walletId,
              item.meterNumber,
              item.smartcardNumber,
              item.transaction
                .reference_number,
            ]
              .map(escapeCsv)
              .join(",")
        );

      const csv = [
        headers
          .map(escapeCsv)
          .join(","),
        ...rows,
      ].join("\n");

      const blob =
        new Blob(
          [csv],
          {
            type:
              "text/csv;charset=utf-8;",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href = url;

      anchor.download = `iyanjupay-transaction-history-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      document.body.removeChild(
        anchor
      );

      URL.revokeObjectURL(
        url
      );

      toast({
        title:
          "Transactions exported",
        description: `${filteredTransactions.length} transaction${
          filteredTransactions.length ===
          1
            ? ""
            : "s"
        } exported successfully.`,
      });
    }, [
      filteredTransactions,
      toast,
    ]);

  /* ============================================================== 
     PRINT RECEIPT
     ============================================================== */

  const printReceipt =
    useCallback(
      (
        item: NormalizedTransaction
      ) => {
        const transaction =
          item.transaction;

        const status =
          getStatusLabel(item);

        const amount =
          formatCurrency(
            item.amount
          );

        const fee =
          formatCurrency(
            item.fee
          );

        const total =
          formatCurrency(
            item.totalCharged
          );

        const reference =
          transaction.reference_number;

        const detail = (
          label: string,
          value: string
        ) => {
          if (!value) {
            return "";
          }

          return `
            <div class="row">
              <span>${label}</span>
              <strong>${value}</strong>
            </div>
          `;
        };

        let details = "";

        if (
          item.kind ===
          "bank_transfer"
        ) {
          details += detail(
            "Account name",
            item.accountName
          );

          details += detail(
            "Account number",
            item.accountNumber
          );

          details += detail(
            "Bank",
            item.bankName ||
              item.bankCode
          );
        }

        if (
          item.kind ===
          "wallet_transfer"
        ) {
          if (
            item.direction ===
            "incoming"
          ) {
            details += detail(
              "Sender",
              item.senderName
            );
          } else {
            details += detail(
              "Recipient",
              item.recipientName
            );
          }

          details += detail(
            "Phone number",
            item.phoneNumber
          );

          details += detail(
            "Wallet ID",
            item.walletId
          );
        }

        if (
          item.kind ===
          "airtime"
        ) {
          details += detail(
            "Service provider",
            item.serviceProviderName
          );

          details += detail(
            "Phone number",
            item.phoneNumber
          );
        }

        if (
          item.kind === "data"
        ) {
          details += detail(
            "Service provider",
            item.serviceProviderName
          );

          details += detail(
            "Phone number",
            item.phoneNumber
          );

          details += detail(
            "Plan",
            item.packageName
          );
        }

        if (
          item.kind ===
          "electricity"
        ) {
          details += detail(
            "Service provider",
            item.serviceProviderName
          );

          details += detail(
            "Meter number",
            item.meterNumber
          );

          details += detail(
            "Meter type",
            item.meterType
          );
        }

        if (
          item.kind === "cable"
        ) {
          details += detail(
            "Service provider",
            item.serviceProviderName
          );

          details += detail(
            "Smartcard/IUC",
            item.smartcardNumber
          );

          details += detail(
            "Package",
            item.packageName
          );
        }

        if (
          item.kind ===
          "internet"
        ) {
          details += detail(
            "Service provider",
            item.serviceProviderName
          );

          details += detail(
            "Account number",
            item.internetAccount
          );

          details += detail(
            "Plan",
            item.packageName
          );
        }

        if (
          item.kind ===
          "funding"
        ) {
          details += detail(
            "Sender",
            item.senderName
          );

          details += detail(
            "Bank",
            stringValue(
              transaction.metadata
                ?.sender_bank,
              transaction.metadata
                ?.bank_name,
              transaction.metadata
                ?.sender_bank_name,
              "Bank transfer"
            )
          );

          details += detail(
            "Virtual account",
            item.virtualAccountNumber
          );
        }

        const popup =
          window.open(
            "",
            "_blank",
            "width=700,height=850"
          );

        if (!popup) {
          toast({
            title:
              "Unable to print",
            description:
              "Please allow pop-ups for IyanjuPay and try again.",
            variant:
              "destructive",
          });

          return;
        }

        popup.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>IyanjuPay Receipt - ${reference}</title>

            <style>
              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                padding: 40px 20px;
                background: #f5f5f5;
                color: #111827;
                font-family:
                  Arial,
                  Helvetica,
                  sans-serif;
              }

              .receipt {
                width: 100%;
                max-width: 620px;
                margin: 0 auto;
                background: white;
                border-radius: 18px;
                padding: 32px;
                box-shadow:
                  0 10px 35px
                  rgba(0,0,0,.08);
              }

              .brand {
                text-align: center;
                margin-bottom: 24px;
              }

              .brand img {
                width: 64px;
                height: 64px;
                object-fit: contain;
                margin-bottom: 8px;
              }

              .brand h1 {
                margin: 0;
                font-size: 26px;
              }

              .brand p {
                margin: 6px 0 0;
                color: #6b7280;
                font-size: 13px;
              }

              .status {
                text-align: center;
                margin: 22px 0;
              }

              .status span {
                display: inline-block;
                padding: 8px 16px;
                border-radius: 999px;
                font-size: 13px;
                font-weight: 700;
              }

              .successful {
                background: #ecfdf5;
                color: #047857;
              }

              .failed {
                background: #fef2f2;
                color: #b91c1c;
              }

              .pending {
                background: #fffbeb;
                color: #b45309;
              }

              .title {
                text-align: center;
                font-size: 20px;
                font-weight: 700;
                margin-bottom: 5px;
              }

              .subtitle {
                text-align: center;
                color: #6b7280;
                font-size: 14px;
                margin-bottom: 28px;
              }

              .section {
                border-top: 1px solid #e5e7eb;
                padding-top: 12px;
                margin-top: 16px;
              }

              .row {
                display: flex;
                justify-content: space-between;
                gap: 20px;
                padding: 11px 0;
                border-bottom: 1px solid #f3f4f6;
                font-size: 13px;
              }

              .row span {
                color: #6b7280;
              }

              .row strong {
                text-align: right;
                word-break: break-word;
              }

              .amount {
                margin-top: 20px;
                padding: 18px;
                border-radius: 12px;
                background: #f9fafb;
              }

              .amount .row:last-child {
                border-bottom: 0;
                font-size: 16px;
              }

              .footer {
                text-align: center;
                margin-top: 28px;
                padding-top: 20px;
                border-top: 1px dashed #d1d5db;
                color: #6b7280;
                font-size: 11px;
                line-height: 1.6;
              }

              @media print {
                body {
                  padding: 0;
                  background: white;
                }

                .receipt {
                  box-shadow: none;
                  max-width: none;
                }
              }
            </style>
          </head>

          <body>
            <div class="receipt">

              <div class="brand">
                <img
                  src="${window.location.origin}/icon-180.png"
                  alt="IyanjuPay"
                />
                <h1>IyanjuPay</h1>
                <p>Transaction Receipt</p>
              </div>

              <div class="status">
                <span class="${
                  item.isSuccessful
                    ? "successful"
                    : item.isFailed
                    ? "failed"
                    : "pending"
                }">
                  ${status}
                </span>
              </div>

              <div class="title">
                ${item.title}
              </div>

              <div class="subtitle">
                ${item.subtitle}
              </div>

              <div class="section">
                ${details}
              </div>

              <div class="amount">
                ${detail(
                  "Amount",
                  amount
                )}

                ${
                  item.fee > 0
                    ? detail(
                        "Fee",
                        fee
                      )
                    : ""
                }

                ${
                  item.fee > 0
                    ? detail(
                        "Total charged",
                        total
                      )
                    : ""
                }
              </div>

              <div class="section">
                ${detail(
                  "Reference",
                  reference
                )}

                ${detail(
                  "Date",
                  formatDateTime(
                    transaction.created_at
                  )
                )}

                ${
                  transaction.provider_reference
                    ? detail(
                        "Transaction reference",
                        transaction.provider_reference
                      )
                    : ""
                }
              </div>

              <div class="footer">
                This receipt was generated by IyanjuPay.<br />
                Keep this receipt for your records.
              </div>

            </div>

            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
          </html>
        `);

        popup.document.close();
      },
      [toast]
    );

  /* ============================================================== 
     CLEAR FILTERS
     ============================================================== */

  const clearFilters =
    useCallback(() => {
      setSearch("");
      setFilterType("all");
      setStatusFilter("all");
      setDateFilter("all");
      setPage(1);
    }, []);

  const hasActiveFilters =
    Boolean(
      search ||
        filterType !== "all" ||
        statusFilter !== "all" ||
        dateFilter !== "all"
    );

  /* ============================================================== 
     RENDER
     ============================================================== */

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* HEADER */}

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">
                  Transaction History
                </h1>

                <p className="text-xs text-gray-500 sm:text-sm">
                  View and manage your IyanjuPay transactions
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  loadTransactions(
                    true
                  )
                }
                disabled={
                  loading ||
                  refreshing
                }
                title="Refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    refreshing
                      ? "animate-spin"
                      : ""
                  }`}
                />
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={
                  exportCsv
                }
                disabled={
                  filteredTransactions.length ===
                  0
                }
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        {/* SUMMARY */}

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Total
              </p>

              <p className="mt-1 text-xl font-bold text-gray-900">
                {
                  normalizedTransactions.length
                }
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Successful
              </p>

              <p className="mt-1 text-xl font-bold text-green-600">
                {
                  normalizedTransactions.filter(
                    item =>
                      item.isSuccessful
                  ).length
                }
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Pending
              </p>

              <p className="mt-1 text-xl font-bold text-yellow-600">
                {
                  normalizedTransactions.filter(
                    item =>
                      item.isPending
                  ).length
                }
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">
                Failed
              </p>

              <p className="mt-1 text-xl font-bold text-red-600">
                {
                  normalizedTransactions.filter(
                    item =>
                      item.isFailed
                  ).length
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SEARCH */}

        <Card className="mb-5 border-0 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <Input
                value={search}
                onChange={event =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search transactions, names, phone, account or reference..."
                className="h-11 pl-10 pr-10"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                value={filterType}
                onValueChange={value =>
                  setFilterType(
                    value as FilterType
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Transaction type" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All transactions
                  </SelectItem>

                  <SelectItem value="money_in">
                    Money received
                  </SelectItem>

                  <SelectItem value="money_out">
                    Money sent
                  </SelectItem>

                  <SelectItem value="transfers">
                    Transfers
                  </SelectItem>

                  <SelectItem value="bills">
                    Bills & services
                  </SelectItem>

                  <SelectItem value="funding">
                    Wallet funding
                  </SelectItem>

                  <SelectItem value="refunds">
                    Refunds
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={value =>
                  setStatusFilter(
                    value as StatusFilter
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All statuses
                  </SelectItem>

                  <SelectItem value="successful">
                    Successful
                  </SelectItem>

                  <SelectItem value="pending">
                    Pending
                  </SelectItem>

                  <SelectItem value="failed">
                    Failed
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={dateFilter}
                onValueChange={
                  setDateFilter
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Date" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All dates
                  </SelectItem>

                  <SelectItem value="today">
                    Today
                  </SelectItem>

                  <SelectItem value="7_days">
                    Last 7 days
                  </SelectItem>

                  <SelectItem value="30_days">
                    Last 30 days
                  </SelectItem>

                  <SelectItem value="this_month">
                    This month
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Showing{" "}
                  {
                    filteredTransactions.length
                  }{" "}
                  matching transaction
                  {filteredTransactions.length ===
                  1
                    ? ""
                    : "s"}
                </p>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={
                    clearFilters
                  }
                >
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ERROR */}

        {error && (
          <Card className="mb-5 border-red-200 bg-red-50 shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <X className="h-8 w-8 text-red-500" />

              <div>
                <p className="font-semibold text-red-800">
                  Unable to load transactions
                </p>

                <p className="mt-1 text-sm text-red-600">
                  {error}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  loadTransactions()
                }
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* LOADING */}

        {loading && (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-purple-600" />

              <p className="mt-3 text-sm text-gray-500">
                Loading transactions...
              </p>
            </div>
          </div>
        )}

        {/* EMPTY */}

        {!loading &&
          !error &&
          filteredTransactions.length ===
            0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <History className="h-8 w-8 text-gray-400" />
                </div>

                <h2 className="mt-5 text-lg font-semibold text-gray-900">
                  {hasActiveFilters
                    ? "No matching transactions"
                    : "No transactions yet"}
                </h2>

                <p className="mt-2 max-w-sm text-sm text-gray-500">
                  {hasActiveFilters
                    ? "Try changing your search or filters."
                    : "Your completed transfers, bill payments and wallet activities will appear here."}
                </p>

                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={
                      clearFilters
                    }
                  >
                    Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

        {/* TRANSACTION LIST */}

        {!loading &&
          !error &&
          paginatedTransactions.length >
            0 && (
            <div className="space-y-3">
              {paginatedTransactions.map(
                item => {
                  const amountText =
                    formatCurrency(
                      item.amount
                    );

                  const amountClass =
                    item.direction ===
                    "incoming"
                      ? "text-green-600"
                      : "text-gray-900";

                  return (
                    <Card
                      key={
                        item.transaction.id
                      }
                      className="cursor-pointer border-0 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                      onClick={() =>
                        setSelectedTransaction(
                          item
                        )
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <TransactionIcon
                            transaction={
                              item
                            }
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                                  {
                                    item.title
                                  }
                                </h3>

                                <p className="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
                                  {
                                    item.subtitle
                                  }
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-sm font-bold sm:text-base ${amountClass}`}
                                >
                                  {item.direction ===
                                  "incoming"
                                    ? "+"
                                    : "-"}
                                  {amountText}
                                </p>

                                {item.fee >
                                  0 && (
                                  <p className="mt-0.5 text-[11px] text-gray-400">
                                    Fee{" "}
                                    {formatCurrency(
                                      item.fee
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <StatusBadge
                                  transaction={
                                    item
                                  }
                                />

                                <span className="text-xs text-gray-400">
                                  {formatDate(
                                    item
                                      .transaction
                                      .created_at
                                  )}
                                </span>
                              </div>

                              <span className="font-mono text-[10px] text-gray-400 sm:text-xs">
                                {
                                  item
                                    .transaction
                                    .reference_number
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
              )}
            </div>
          )}

        {/* PAGINATION */}

        {!loading &&
          filteredTransactions.length >
            PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500 sm:text-sm">
                Page{" "}
                {safePage} of{" "}
                {totalPages}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    safePage <= 1
                  }
                  onClick={() =>
                    setPage(
                      current =>
                        Math.max(
                          1,
                          current -
                            1
                        )
                    )
                  }
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    safePage >=
                    totalPages
                  }
                  onClick={() =>
                    setPage(
                      current =>
                        Math.min(
                          totalPages,
                          current +
                            1
                        )
                    )
                  }
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

        {!loading &&
          filteredTransactions.length >
            0 && (
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-400">
                Showing{" "}
                {(safePage - 1) *
                  PAGE_SIZE +
                  1}
                –
                {Math.min(
                  safePage *
                    PAGE_SIZE,
                  filteredTransactions.length
                )}{" "}
                of{" "}
                {
                  filteredTransactions.length
                }{" "}
                transactions
              </p>
            </div>
          )}
      </main>

      {/* ==========================================================
          TRANSACTION DETAILS DIALOG
          ========================================================== */}

      <Dialog
        open={
          selectedTransaction !==
          null
        }
        onOpenChange={open => {
          if (!open) {
            setSelectedTransaction(
              null
            );
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          {selectedTransaction && (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">
                  Transaction details
                </DialogTitle>
              </DialogHeader>

              <div className="pb-2">
                <div className="flex flex-col items-center text-center">
                  <TransactionIcon
                    transaction={
                      selectedTransaction
                    }
                  />

                  <h2 className="mt-4 text-xl font-bold text-gray-900">
                    {
                      selectedTransaction.title
                    }
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {
                      selectedTransaction.subtitle
                    }
                  </p>

                  <div className="mt-3">
                    <StatusBadge
                      transaction={
                        selectedTransaction
                      }
                    />
                  </div>

                  <p
                    className={`mt-4 text-3xl font-extrabold ${
                      selectedTransaction.direction ===
                      "incoming"
                        ? "text-green-600"
                        : "text-gray-900"
                    }`}
                  >
                    {selectedTransaction.direction ===
                    "incoming"
                      ? "+"
                      : "-"}
                    {formatCurrency(
                      selectedTransaction.amount
                    )}
                  </p>

                  {selectedTransaction.fee >
                    0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Total charged{" "}
                      {formatCurrency(
                        selectedTransaction.totalCharged
                      )}
                    </p>
                  )}
                </div>

                {/* BANK TRANSFER */}

                {selectedTransaction.kind ===
                  "bank_transfer" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Bank transfer
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label={
                          selectedTransaction.direction ===
                          "incoming"
                            ? "From"
                            : "Transfer to"
                        }
                        value={
                          selectedTransaction.accountName ||
                          selectedTransaction.recipientName ||
                          selectedTransaction.senderName
                        }
                      />

                      <DetailRow
                        label="Bank"
                        value={
                          selectedTransaction.bankName ||
                          selectedTransaction.bankCode
                        }
                      />

                      <DetailRow
                        label="Account name"
                        value={
                          selectedTransaction.accountName
                        }
                      />

                      <DetailRow
                        label="Account number"
                        value={
                          selectedTransaction.accountNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.accountNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.accountNumber,
                            "Account number"
                          )
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />

                      {selectedTransaction.fee >
                        0 && (
                        <DetailRow
                          label="Transfer fee"
                          value={formatCurrency(
                            selectedTransaction.fee
                          )}
                        />
                      )}

                      {selectedTransaction.fee >
                        0 && (
                        <DetailRow
                          label="Total charged"
                          value={formatCurrency(
                            selectedTransaction.totalCharged
                          )}
                        />
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* IYANJUPAY WALLET TRANSFER */}

                {selectedTransaction.kind ===
                  "wallet_transfer" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        IyanjuPay Wallet
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label={
                          selectedTransaction.direction ===
                          "incoming"
                            ? "Transfer from"
                            : "Transfer to"
                        }
                        value={
                          selectedTransaction.direction ===
                          "incoming"
                            ? selectedTransaction.senderName
                            : selectedTransaction.recipientName
                        }
                      />

                      <DetailRow
                        label="Phone number"
                        value={
                          selectedTransaction.phoneNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.phoneNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.phoneNumber,
                            "Phone number"
                          )
                        }
                      />

                      <DetailRow
                        label="IyanjuPay Wallet"
                        value={
                          selectedTransaction.walletId
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.walletId
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.walletId,
                            "Wallet ID"
                          )
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />

                      <DetailRow
                        label="Fee"
                        value={formatCurrency(
                          selectedTransaction.fee
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* AIRTIME */}

                {selectedTransaction.kind ===
                  "airtime" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Airtime
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Service provider"
                        value={
                          selectedTransaction.serviceProviderName
                        }
                      />

                      <DetailRow
                        label="Phone number"
                        value={
                          selectedTransaction.phoneNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.phoneNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.phoneNumber,
                            "Phone number"
                          )
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* DATA */}

                {selectedTransaction.kind ===
                  "data" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Data
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Service provider"
                        value={
                          selectedTransaction.serviceProviderName
                        }
                      />

                      <DetailRow
                        label="Phone number"
                        value={
                          selectedTransaction.phoneNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.phoneNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.phoneNumber,
                            "Phone number"
                          )
                        }
                      />

                      <DetailRow
                        label="Plan"
                        value={
                          selectedTransaction.packageName
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* ELECTRICITY */}

                {selectedTransaction.kind ===
                  "electricity" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Electricity
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Service provider"
                        value={
                          selectedTransaction.serviceProviderName
                        }
                      />

                      <DetailRow
                        label="Meter number"
                        value={
                          selectedTransaction.meterNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.meterNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.meterNumber,
                            "Meter number"
                          )
                        }
                      />

                      <DetailRow
                        label="Meter type"
                        value={
                          selectedTransaction.meterType
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* CABLE */}

                {selectedTransaction.kind ===
                  "cable" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Cable TV
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Service provider"
                        value={
                          selectedTransaction.serviceProviderName
                        }
                      />

                      <DetailRow
                        label="Smartcard / IUC"
                        value={
                          selectedTransaction.smartcardNumber
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.smartcardNumber
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.smartcardNumber,
                            "Smartcard/IUC number"
                          )
                        }
                      />

                      <DetailRow
                        label="Package"
                        value={
                          selectedTransaction.packageName
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* INTERNET */}

                {selectedTransaction.kind ===
                  "internet" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Internet
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Service provider"
                        value={
                          selectedTransaction.serviceProviderName
                        }
                      />

                      <DetailRow
                        label="Account number"
                        value={
                          selectedTransaction.internetAccount
                        }
                        mono
                        copyable={Boolean(
                          selectedTransaction.internetAccount
                        )}
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.internetAccount,
                            "Account number"
                          )
                        }
                      />

                      <DetailRow
                        label="Plan"
                        value={
                          selectedTransaction.packageName
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={formatCurrency(
                          selectedTransaction.amount
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* FUNDING */}

                {selectedTransaction.kind ===
                  "funding" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Wallet Funding
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="From"
                        value={
                          selectedTransaction.senderName
                        }
                      />

                      <DetailRow
                        label="Bank"
                        value={stringValue(
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.sender_bank,
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.sender_bank_name,
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.bank_name,
                          "Bank transfer"
                        )}
                      />

                      <DetailRow
                        label="Sender account"
                        value={stringValue(
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.sender_account
                        )}
                        mono
                      />

                      <DetailRow
                        label="Virtual account"
                        value={
                          selectedTransaction.virtualAccountNumber
                        }
                        mono
                        copyable
                        onCopy={() =>
                          copyToClipboard(
                            selectedTransaction.virtualAccountNumber,
                            "Virtual account number"
                          )
                        }
                      />

                      <DetailRow
                        label="Amount"
                        value={`+${formatCurrency(
                          selectedTransaction.amount
                        )}`}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* REFUND */}

                {selectedTransaction.kind ===
                  "refund" && (
                  <Card className="mt-6 border-gray-200 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Refund
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <DetailRow
                        label="Reason"
                        value={stringValue(
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.reason,
                          "Transfer refund"
                        )}
                      />

                      <DetailRow
                        label="Refund amount"
                        value={`+${formatCurrency(
                          selectedTransaction.amount
                        )}`}
                      />

                      <DetailRow
                        label="Original reference"
                        value={stringValue(
                          selectedTransaction
                            .transaction
                            .metadata
                            ?.original_reference
                        )}
                        mono
                      />
                    </CardContent>
                  </Card>
                )}

                {/* AMOUNT */}

                <Card className="mt-4 border-gray-200 shadow-none">
                  <CardContent className="p-4">
                    <DetailRow
                      label="Amount"
                      value={formatCurrency(
                        selectedTransaction.amount
                      )}
                    />

                    {selectedTransaction.fee >
                      0 && (
                      <DetailRow
                        label="Fee"
                        value={formatCurrency(
                          selectedTransaction.fee
                        )}
                      />
                    )}

                    {selectedTransaction.fee >
                      0 && (
                      <DetailRow
                        label="Total charged"
                        value={formatCurrency(
                          selectedTransaction.totalCharged
                        )}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* TRANSACTION INFORMATION */}

                <Card className="mt-4 border-gray-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Transaction information
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <DetailRow
                      label="Status"
                      value={getStatusLabel(
                        selectedTransaction
                      )}
                    />

                    <DetailRow
                      label="Date"
                      value={formatDateTime(
                        selectedTransaction
                          .transaction
                          .created_at
                      )}
                    />

                    <DetailRow
                      label="Reference"
                      value={
                        selectedTransaction
                          .transaction
                          .reference_number
                      }
                      mono
                      copyable
                      onCopy={() =>
                        copyToClipboard(
                          selectedTransaction
                            .transaction
                            .reference_number,
                          "Reference"
                        )
                      }
                    />

                    <DetailRow
                      label="Description"
                      value={
                        selectedTransaction
                          .transaction
                          .description ||
                        ""
                      }
                    />
                  </CardContent>
                </Card>

                {/* ACTIONS */}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(
                        selectedTransaction
                          .transaction
                          .reference_number,
                        "Reference"
                      )
                    }
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy reference
                  </Button>

                  <Button
                    type="button"
                    onClick={() =>
                      printReceipt(
                        selectedTransaction
                      )
                    }
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print receipt
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionHistory;
