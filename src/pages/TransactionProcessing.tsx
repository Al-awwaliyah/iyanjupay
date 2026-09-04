import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type TransactionType = "iyanjupay" | "bank" | "bill";
type LegacyTransferType = "iyanjupay" | "bank";

interface TransactionProcessingPageProps {
  transactionType?: TransactionType;
  transferType?: LegacyTransferType;
  amount: number;
  details: any;
  idempotencyKey: string;
  onDone: () => Promise<void> | void;
  onBack: () => Promise<void> | void;
}

type ProcessingStatus = "processing" | "success" | "pending" | "failed";

interface TransactionResult {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;

  reference?: string;
  reference_number?: string;
  transaction_reference?: string;
  transaction_id?: string;
  transactionId?: string;

  transfer_id?: string;
  transferId?: string;

  bill_payment_id?: string;
  billPaymentId?: string;

  amount?: number | string;
  fee?: number | string;

  recipient?: string;
  customer?: string;
  customer_name?: string;

  biller?: string;
  biller_name?: string;
  item?: string;
  item_name?: string;

  provider?: string;

  data?: any;
  metadata?: Record<string, any>;

  [key: string]: any;
}

const NAVY = "#082A63";
const GOLD = "#F4B400";

const SUCCESS_STATUSES = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "succeeded",
  "paid",
]);

const PENDING_STATUSES = new Set([
  "pending",
  "processing",
  "queued",
  "order_received",
  "order_processed",
  "on_hold",
  "awaiting",
  "submitted",
  "201",
  "300",
  "399",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "reversed",
  "error",
]);

const formatNaira = (value: number | string | undefined | null) => {
  const amount = Number(value ?? 0);

  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const maskAccountNumber = (value: string) => {
  if (!value) return "—";

  const clean = String(value).replace(/\s+/g, "");

  if (clean.length <= 4) return clean;

  return `${"•".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
};

const getInitials = (value: string) => {
  if (!value) return "IP";

  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "IP";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const normalizeStatus = (
  response: TransactionResult | null | undefined,
): ProcessingStatus => {
  if (!response) return "failed";

  if (response.success === true) {
    return "success";
  }

  if (response.success === false) {
    const explicit = String(response.status ?? "").toLowerCase();

    if (PENDING_STATUSES.has(explicit)) return "pending";

    return "failed";
  }

  const rawStatus = String(
    response.status ??
      response.data?.status ??
      response.data?.Status ??
      response.data?.statuscode ??
      "",
  )
    .trim()
    .toLowerCase();

  if (SUCCESS_STATUSES.has(rawStatus)) return "success";
  if (PENDING_STATUSES.has(rawStatus)) return "pending";
  if (FAILED_STATUSES.has(rawStatus)) return "failed";

  return "success";
};

const extractFunctionError = (error: any) => {
  if (!error) return "Transaction could not be completed.";

  if (typeof error === "string") {
    return error;
  }

  const context = error?.context;

  if (context) {
    try {
      if (typeof context === "object") {
        const parsed =
          context?.json ??
          context?.body ??
          context?.data ??
          context;

        if (parsed) {
          if (typeof parsed === "string") {
            try {
              const json = JSON.parse(parsed);

              return (
                json?.error ??
                json?.message ??
                json?.provider_message ??
                json?.provider_response?.message ??
                parsed
              );
            } catch {
              return parsed;
            }
          }

          return (
            parsed?.error ??
            parsed?.message ??
            parsed?.provider_message ??
            parsed?.provider_response?.message ??
            "Transaction could not be completed."
          );
        }
      }
    } catch {
      // Continue to fallback.
    }
  }

  return (
    error?.message ??
    error?.error_description ??
    error?.details ??
    "Transaction could not be completed."
  );
};

const SummaryRow = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) => (
  <div className="flex min-w-0 items-center justify-between gap-4 py-1.5">
    <span className="shrink-0 text-[11px] text-slate-500">{label}</span>

    <span
      className={[
        "min-w-0 truncate text-right text-[11px]",
        strong ? "font-semibold text-slate-900" : "font-medium text-slate-700",
      ].join(" ")}
    >
      {value}
    </span>
  </div>
);

const TransferIdentity = ({
  recipient,
  bank,
  accountNumber,
}: {
  recipient: string;
  bank: string;
  accountNumber: string;
}) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: NAVY }}
    >
      {getInitials(recipient || bank)}
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-slate-900">
        {recipient || "Recipient"}
      </p>

      <p className="truncate text-[10px] text-slate-500">
        {bank || "Bank"} • {maskAccountNumber(accountNumber)}
      </p>
    </div>
  </div>
);

const BillIdentity = ({
  customer,
  label,
}: {
  customer: string;
  label: string;
}) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold"
      style={{ color: NAVY }}
    >
      {getInitials(customer)}
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-slate-900">
        {customer || "Customer"}
      </p>

      <p className="truncate text-[10px] text-slate-500">{label}</p>
    </div>
  </div>
);

const TransactionProcessingPage = ({
  transactionType,
  transferType,
  amount,
  details,
  idempotencyKey,
  onDone,
  onBack,
}: TransactionProcessingPageProps) => {
  const { toast } = useToast();

  const resolvedTransactionType: TransactionType =
    transactionType ?? transferType ?? "bank";

  const isBill = resolvedTransactionType === "bill";
  const isIyanjuPay = resolvedTransactionType === "iyanjupay";
  const isBank = resolvedTransactionType === "bank";

  const [status, setStatus] = useState<ProcessingStatus>("processing");
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const executionStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const billServiceName = useMemo(() => {
    const service = String(
      details?.service ??
        details?.serviceType ??
        details?.type ??
        "",
    ).toLowerCase();

    const map: Record<string, string> = {
      airtime: "Airtime",
      data: "Data",
      electricity: "Electricity",
      cable: "Cable TV",
      "cable-tv": "Cable TV",
      internet: "Internet",
    };

    return map[service] ?? details?.serviceName ?? "Bill Payment";
  }, [details]);

  const recipient = useMemo(
    () =>
      String(
        details?.beneficiary_name ??
          details?.beneficiaryName ??
          details?.account_name ??
          details?.accountName ??
          details?.recipient ??
          details?.customer ??
          "",
      ),
    [details],
  );

  const bank = useMemo(
    () =>
      String(
        details?.bank_name ??
          details?.bankName ??
          details?.bank ??
          "",
      ),
    [details],
  );

  const accountNumber = useMemo(
    () =>
      String(
        details?.account_number ??
          details?.accountNumber ??
          "",
      ),
    [details],
  );

  const billCustomer = useMemo(
    () =>
      String(
        details?.customer_name ??
          details?.customerName ??
          details?.customer ??
          details?.meter_number ??
          details?.meterNumber ??
          details?.smartcard_no ??
          details?.smartcardNumber ??
          details?.phone ??
          details?.phoneNumber ??
          "",
      ),
    [details],
  );

  const billPackage = useMemo(
    () =>
      String(
        details?.package_name ??
          details?.packageName ??
          details?.package ??
          details?.item_name ??
          details?.itemName ??
          details?.plan_name ??
          "",
      ),
    [details],
  );

  const billCustomerLabel = useMemo(() => {
    const service = billServiceName.toLowerCase();

    if (service === "electricity") {
      return "Meter number";
    }

    if (service === "cable tv") {
      return "Smartcard / IUC";
    }

    if (service === "data" || service === "airtime") {
      return "Phone number";
    }

    return "Customer";
  }, [billServiceName]);

  const reference = useMemo(() => {
    return String(
      result?.reference ??
        result?.reference_number ??
        result?.transaction_reference ??
        result?.data?.reference ??
        result?.data?.reference_number ??
        result?.metadata?.reference ??
        "",
    );
  }, [result]);

  const transactionId = useMemo(() => {
    return String(
      result?.transaction_id ??
        result?.transactionId ??
        result?.data?.transaction_id ??
        result?.data?.transactionId ??
        "",
    );
  }, [result]);

  const checkBankTransferStatus = useCallback(
    async (initialResult: TransactionResult) => {
      if (!transactionId) {
        return initialResult;
      }

      await new Promise((resolve) => setTimeout(resolve, 8000));

      if (!mountedRef.current) {
        return initialResult;
      }

      const { data, error } = await supabase
        .from("transactions")
        .select(
          "status, reference_number, provider_reference, amount, metadata",
        )
        .eq("id", transactionId)
        .maybeSingle();

      if (error || !data) {
        return initialResult;
      }

      return {
        ...initialResult,
        status: data.status ?? initialResult.status,
        reference:
          data.reference_number ??
          initialResult.reference ??
          initialResult.reference_number,
        reference_number:
          data.reference_number ?? initialResult.reference_number,
        provider_reference:
          data.provider_reference ?? initialResult.provider_reference,
        amount: data.amount ?? initialResult.amount,
        metadata: data.metadata ?? initialResult.metadata,
      };
    },
    [transactionId],
  );

  const executeTransaction = useCallback(async () => {
    if (!mountedRef.current) return;

    setStatus("processing");
    setErrorMessage("");

    try {
      let functionName = "";
      let body: Record<string, any> = {};

      if (isIyanjuPay) {
        functionName = "iyanjuPay-transfer";

        body = {
          wallet_id: details?.wallet_id ?? details?.walletId,
          amount,
          narration:
            details?.narration ??
            details?.description ??
            "IyanjuPay transfer",
          idempotency_key: idempotencyKey,
        };
      } else if (isBank) {
        functionName = "flutterwave-transfer";

        body = {
          amount,
          account_number:
            details?.account_number ??
            details?.accountNumber,
          account_bank:
            details?.account_bank ??
            details?.bank_code ??
            details?.bankCode,
          bank_code:
            details?.bank_code ??
            details?.bankCode,
          account_name:
            details?.account_name ??
            details?.accountName ??
            details?.beneficiary_name ??
            details?.beneficiaryName,
          beneficiary_name:
            details?.beneficiary_name ??
            details?.beneficiaryName ??
            details?.account_name ??
            details?.accountName,
          narration:
            details?.narration ??
            details?.description ??
            "Bank transfer",
          idempotency_key: idempotencyKey,
        };
      } else {
        functionName = "flutterwave-bills";

        body = {
          action: "pay",
          service:
            details?.service ??
            details?.serviceType,
          amount,
          biller_code:
            details?.biller_code ??
            details?.billerCode ??
            details?.network_code ??
            details?.networkCode,
          item_code:
            details?.item_code ??
            details?.itemCode ??
            details?.product_code ??
            details?.productCode ??
            details?.variation_code ??
            details?.variationCode,
          customer:
            details?.customer ??
            details?.customerNumber ??
            details?.phone ??
            details?.phoneNumber ??
            details?.meter_number ??
            details?.meterNumber ??
            details?.smartcard_no ??
            details?.smartcardNumber,
          country: details?.country ?? "NG",
          details,
        };
      }

      const { data, error } = await supabase.functions.invoke(
        functionName,
        {
          body,
        },
      );

      if (error) {
        throw new Error(extractFunctionError(error));
      }

      if (!data) {
        throw new Error("No response was received from the payment service.");
      }

      if (data?.success === false && !data?.status) {
        throw new Error(
          data?.error ??
            data?.message ??
            data?.provider_message ??
            "Transaction could not be completed.",
        );
      }

      let normalizedResult: TransactionResult = {
        ...data,
        data: data?.data ?? data?.result,
      };

      let normalizedStatus = normalizeStatus(normalizedResult);

      if (isBank && normalizedStatus === "pending") {
        normalizedResult =
          await checkBankTransferStatus(normalizedResult);

        normalizedStatus = normalizeStatus(normalizedResult);
      }

      if (!mountedRef.current) return;

      setResult(normalizedResult);
      setStatus(normalizedStatus);

      if (normalizedStatus === "success") {
        toast({
          title: "Transaction successful",
          description: "Your transaction has been completed successfully.",
        });
      } else if (normalizedStatus === "pending") {
        toast({
          title: "Transaction pending",
          description:
            "Your transaction was received and is still being processed.",
        });
      } else {
        setErrorMessage(
          normalizedResult?.error ??
            normalizedResult?.message ??
            "Transaction could not be completed.",
        );
      }
    } catch (error: any) {
      if (!mountedRef.current) return;

      const message = extractFunctionError(error);

      setResult(null);
      setStatus("failed");
      setErrorMessage(message);

      toast({
        title: "Transaction failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    amount,
    checkBankTransferStatus,
    details,
    idempotencyKey,
    isBank,
    isIyanjuPay,
    toast,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    if (!executionStartedRef.current) {
      executionStartedRef.current = true;
      void executeTransaction();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [executeTransaction]);

  const handleRetry = async () => {
    if (retrying) return;

    setRetrying(true);
    executionStartedRef.current = false;

    try {
      await executeTransaction();
    } finally {
      if (mountedRef.current) {
        setRetrying(false);
      }
    }
  };

  const handleCopyReference = async () => {
    if (!reference) return;

    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);

      toast({
        title: "Reference copied",
        description: "Transaction reference copied to clipboard.",
      });

      window.setTimeout(() => {
        if (mountedRef.current) {
          setCopied(false);
        }
      }, 1600);
    } catch {
      toast({
        title: "Unable to copy",
        description: "Please copy the reference manually.",
      });
    }
  };

  const handleDone = async () => {
    await onDone();
  };

  const handleBack = async () => {
    if (status === "processing" || retrying) return;
    await onBack();
  };

  const displayReference =
    reference ||
    transactionId ||
    result?.transfer_id ||
    result?.transferId ||
    result?.bill_payment_id ||
    result?.billPaymentId ||
    "";

  const displayAmount = result?.amount ?? amount;

  const title = {
    processing: "Processing payment",
    success: "Payment successful",
    pending: "Payment pending",
    failed: "Payment failed",
  }[status];

  const description = {
    processing: isBill
      ? "Please wait while your payment is being processed."
      : "Please wait while your transaction is being processed.",
    success: isBill
      ? "Your payment has been completed."
      : "Your transaction has been completed.",
    pending: "Your transaction is being processed.",
    failed: "We couldn't complete this transaction.",
  }[status];

  const StatusIcon = {
    processing: Loader2,
    success: CheckCircle2,
    pending: Clock3,
    failed: XCircle,
  }[status];

  const statusIconClass = {
    processing: "animate-spin text-white",
    success: "text-white",
    pending: "text-white",
    failed: "text-white",
  }[status];

  const statusCircleClass = {
    processing: "bg-[#082A63]",
    success: "bg-emerald-500",
    pending: "bg-amber-500",
    failed: "bg-rose-500",
  }[status];

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-50">
      <div className="flex h-full min-h-0 flex-col">
        {/* Compact header */}
        <header className="flex h-[54px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={status === "processing" || retrying}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
              style={{
                background:
                  "linear-gradient(135deg, #4C1D95 0%, #6D28D9 48%, #2563EB 100%)",
              }}
            >
              IP
            </div>

            <span className="text-sm font-bold tracking-tight text-slate-900">
              IyanjuPay
            </span>
          </div>

          <div className="w-9" />
        </header>

        {/* One-screen content */}
        <main className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6">
          <div className="mx-auto flex h-full w-full max-w-md flex-col">
            {/* Status */}
            <section className="flex shrink-0 flex-col items-center pt-2 text-center">
              <div
                className={[
                  "flex h-[62px] w-[62px] items-center justify-center rounded-full shadow-sm",
                  statusCircleClass,
                ].join(" ")}
              >
                <StatusIcon
                  className={`h-8 w-8 ${statusIconClass}`}
                  strokeWidth={2.2}
                />
              </div>

              <h1 className="mt-2.5 text-lg font-extrabold tracking-tight text-slate-900">
                {title}
              </h1>

              <p className="mt-0.5 max-w-[280px] truncate text-[11px] text-slate-500">
                {description}
              </p>

              <div className="mt-2 text-[25px] font-black tracking-tight text-slate-950">
                {formatNaira(displayAmount)}
              </div>
            </section>

            {/* Main compact receipt */}
            <section className="mt-3 min-h-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              {isBank || isIyanjuPay ? (
                <TransferIdentity
                  recipient={recipient}
                  bank={isIyanjuPay ? "IyanjuPay" : bank}
                  accountNumber={accountNumber}
                />
              ) : (
                <BillIdentity
                  customer={billCustomer}
                  label={`${billServiceName}${
                    billPackage ? ` • ${billPackage}` : ""
                  }`}
                />
              )}

              <div className="my-2 border-t border-dashed border-slate-200" />

              <div>
                {isBill ? (
                  <>
                    <SummaryRow
                      label="Service"
                      value={billServiceName}
                      strong
                    />

                    {billPackage && (
                      <SummaryRow
                        label="Package"
                        value={billPackage}
                      />
                    )}

                    <SummaryRow
                      label={billCustomerLabel}
                      value={billCustomer}
                    />
                  </>
                ) : (
                  <>
                    <SummaryRow
                      label={isIyanjuPay ? "Transfer type" : "Transfer type"}
                      value={isIyanjuPay ? "IyanjuPay" : "Bank transfer"}
                      strong
                    />

                    {!isIyanjuPay && bank && (
                      <SummaryRow label="Bank" value={bank} />
                    )}

                    {accountNumber && (
                      <SummaryRow
                        label="Account"
                        value={maskAccountNumber(accountNumber)}
                      />
                    )}
                  </>
                )}

                {result?.fee !== undefined &&
                  result?.fee !== null && (
                    <SummaryRow
                      label="Fee"
                      value={formatNaira(result.fee)}
                    />
                  )}
              </div>

              {displayReference && (
                <>
                  <div className="my-2 border-t border-dashed border-slate-200" />

                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                        Reference
                      </p>

                      <p className="truncate text-[10px] font-semibold text-slate-700">
                        {displayReference}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyReference}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                      aria-label="Copy transaction reference"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Status messages */}
            <div className="mt-2 shrink-0">
              {status === "processing" && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />

                  <p className="truncate text-[10px] font-medium text-blue-700">
                    Please keep this page open while we complete your transaction.
                  </p>
                </div>
              )}

              {status === "pending" && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-600" />

                  <p className="truncate text-[10px] font-medium text-amber-700">
                    Your transaction was received. It may take a little while to
                    complete.
                  </p>
                </div>
              )}

              {status === "failed" && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                  <X className="h-3.5 w-3.5 shrink-0 text-rose-600" />

                  <p className="line-clamp-2 text-[10px] font-medium text-rose-700">
                    {errorMessage || "Transaction could not be completed."}
                  </p>
                </div>
              )}
            </div>

            {/* Security */}
            <div className="mt-auto shrink-0 pt-2">
              <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Secure transaction • Your funds are protected</span>
              </div>

              {/* Corrected completion controls */}
              <div className="mt-2">
                {status === "processing" && (
                  <Button
                    disabled
                    className="h-11 w-full rounded-xl bg-slate-200 text-xs font-bold text-slate-500"
                  >
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </Button>
                )}

                {status === "success" && (
                  <Button
                    type="button"
                    onClick={handleDone}
                    className="h-11 w-full rounded-xl text-xs font-bold text-white shadow-sm"
                    style={{
                      background:
                        "linear-gradient(135deg, #4C1D95 0%, #6D28D9 48%, #2563EB 100%)",
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Done — Continue to Dashboard
                  </Button>
                )}

                {status === "pending" && (
                  <Button
                    type="button"
                    onClick={handleDone}
                    className="h-11 w-full rounded-xl text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: NAVY }}
                  >
                    Back to Dashboard
                  </Button>
                )}

                {status === "failed" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      onClick={handleRetry}
                      disabled={retrying}
                      variant="outline"
                      className="h-11 rounded-xl border-slate-200 text-xs font-bold"
                    >
                      {retrying ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                      )}
                      {retrying ? "Retrying..." : "Try Again"}
                    </Button>

                    <Button
                      type="button"
                      onClick={handleDone}
                      disabled={retrying}
                      className="h-11 rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      Dashboard
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default TransactionProcessingPage;
