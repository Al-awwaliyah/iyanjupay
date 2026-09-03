import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  LockKeyhole,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// TYPES
// ============================================================

type TransactionType =
  | "iyanjupay"
  | "bank"
  | "bill";

type LegacyTransferType =
  | "iyanjupay"
  | "bank";

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

type TransactionStatus =
  | "processing"
  | "success"
  | "pending"
  | "failed";

interface TransactionProcessingPageProps {
  transactionType?: TransactionType;
  transferType?: LegacyTransferType;

  amount: number;

  details: any;

  idempotencyKey: string;

  onDone: () =>
    | Promise<void>
    | void;

  onBack: () =>
    | Promise<void>
    | void;
}

interface TransactionResult {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;

  reference?: string;

  transaction_id?: string;
  transactionId?: string;

  transfer_id?: string;
  transferId?: string;

  bill_payment_id?: string;
  billPaymentId?: string;

  credit_transaction_id?: string;

  amount?: number;
  fee?: number;
  total_charged?: number;

  recipient_name?: string;
  recipient_wallet_id?: string;

  customer?: string;

  biller_code?: string;
  item_code?: string;

  provider?: string;

  data?: any;
  metadata?: any;

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

const NAVY = "#082A63";
const GOLD = "#F4B400";

// ============================================================
// HELPERS
// ============================================================

const formatNaira = (
  value: number
): string =>
  `₦${Number(value || 0).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;

const maskAccountNumber = (
  value: string
): string => {
  const clean = String(value || "").trim();

  if (!clean) {
    return "";
  }

  if (clean.length <= 4) {
    return clean;
  }

  return `•••• ${clean.slice(-4)}`;
};

const getInitials = (
  value: string
): string => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "IP";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

// ============================================================
// COMPONENT
// ============================================================

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

  // ==========================================================
  // TRANSACTION TYPE
  // ==========================================================

  const resolvedTransactionType: TransactionType =
    transactionType ??
    transferType ??
    "bank";

  const isBill =
    resolvedTransactionType === "bill";

  const isIyanjuPay =
    resolvedTransactionType === "iyanjupay";

  const isBank =
    resolvedTransactionType === "bank";

  // ==========================================================
  // STATE
  // ==========================================================

  const [status, setStatus] =
    useState<TransactionStatus>("processing");

  const [result, setResult] =
    useState<TransactionResult | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [retrying, setRetrying] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  // ==========================================================
  // REFS
  // ==========================================================

  const executionStartedRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  // ==========================================================
  // MOUNT STATE
  // ==========================================================

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ==========================================================
  // BILL SERVICE
  // ==========================================================

  const billServiceName = useMemo(() => {
    const service = String(
      details?.service ??
        details?.type ??
        ""
    )
      .toLowerCase()
      .trim();

    switch (service) {
      case "airtime":
        return "Airtime";

      case "data":
        return "Data";

      case "electricity":
        return "Electricity";

      case "cable":
        return "Cable TV";

      case "internet":
        return "Internet";

      default:
        return "Bill Payment";
    }
  }, [details]);

  const transactionName = isBill
    ? billServiceName
    : "Transfer";

  // ==========================================================
  // DISPLAY VALUES
  // ==========================================================

  const recipient =
    details?.recipient ||
    details?.recipientName ||
    result?.recipient_name ||
    result?.data?.recipient_name ||
    "Recipient";

  const bank =
    details?.bank ||
    details?.bankName ||
    "";

  const accountNumber =
    details?.accountNumber ||
    details?.account_number ||
    "";

  const billCustomer =
    details?.customer ||
    details?.customerNumber ||
    details?.phone ||
    "";

  const billPackage =
    details?.item?.name ||
    details?.item?.short_name ||
    details?.packageName ||
    details?.package_name ||
    details?.package ||
    "";

  const billCustomerLabel =
    details?.customerLabel ||
    (() => {
      const service = String(
        details?.service ??
          details?.type ??
          ""
      ).toLowerCase();

      if (
        service === "airtime" ||
        service === "data"
      ) {
        return "Phone Number";
      }

      if (service === "electricity") {
        return "Meter Number";
      }

      if (service === "cable") {
        return "Smart Card";
      }

      if (service === "internet") {
        return "Account Number";
      }

      return "Customer";
    })();

  // ==========================================================
  // REFERENCE
  // ==========================================================

  const reference =
    result?.reference ||
    result?.data?.reference ||
    result?.transaction_id ||
    result?.transactionId ||
    result?.transfer_id ||
    result?.transferId ||
    result?.bill_payment_id ||
    result?.billPaymentId ||
    result?.data?.transaction_id ||
    result?.data?.transfer_id ||
    result?.data?.bill_payment_id ||
    "";

  const transactionId =
    result?.transaction_id ||
    result?.transactionId ||
    result?.data?.transaction_id ||
    result?.credit_transaction_id ||
    result?.bill_payment_id ||
    result?.billPaymentId ||
    "";

  // ==========================================================
  // EXTRACT FUNCTION ERROR
  // ==========================================================

  const extractFunctionError =
    async (
      error: any,
      fallback: string
    ): Promise<string> => {
      let message =
        error?.message ||
        fallback;

      try {
        if (
          error?.context &&
          typeof error.context.json ===
            "function"
        ) {
          const payload =
            await error.context.json();

          message =
            payload?.error ||
            payload?.message ||
            payload?.details ||
            message;
        }
      } catch {
        // Keep original error.
      }

      return message;
    };

  // ==========================================================
  // NORMALIZE STATUS
  // ==========================================================

  const normalizeStatus = (
    response: TransactionResult
  ): TransactionStatus => {
    const rawStatus =
      String(
        response?.status ||
          response?.data?.status ||
          response?.data?.transaction_status ||
          ""
      )
        .trim()
        .toLowerCase();

    if (
      [
        "success",
        "successful",
        "completed",
        "complete",
        "succeeded",
        "paid",
        "successful_payment",
        "successfully_completed",
      ].includes(rawStatus)
    ) {
      return "success";
    }

    if (
      [
        "pending",
        "processing",
        "queued",
        "new",
        "initiated",
        "awaiting",
        "in_progress",
        "submitted",
      ].includes(rawStatus)
    ) {
      return "pending";
    }

    if (
      [
        "failed",
        "failure",
        "cancelled",
        "canceled",
        "reversed",
        "rejected",
        "declined",
        "error",
      ].includes(rawStatus)
    ) {
      return "failed";
    }

    if (response?.success === true) {
      return "success";
    }

    if (response?.success === false) {
      return "failed";
    }

    return "pending";
  };

  // ==========================================================
  // BANK TRANSFER CONFIRMATION
  // ==========================================================

  const checkBankTransferStatus =
    useCallback(
      async (
        transactionIdToCheck: string,
        initialResponse: TransactionResult
      ): Promise<TransactionResult> => {
        /*
         * Keep the user on the premium processing
         * screen while the transaction gets its first
         * database confirmation.
         */
        await new Promise<void>(
          (resolve) => {
            setTimeout(
              resolve,
              8000
            );
          }
        );

        if (!mountedRef.current) {
          return initialResponse;
        }

        if (!transactionIdToCheck) {
          console.warn(
            "Bank transfer status check skipped: transaction ID missing."
          );

          return initialResponse;
        }

        try {
          const {
            data: transaction,
            error,
          } = await supabase
            .from("transactions")
            .select(
              `
                id,
                status,
                reference_number,
                provider_reference,
                amount,
                metadata
              `
            )
            .eq(
              "id",
              transactionIdToCheck
            )
            .maybeSingle();

          if (error) {
            console.error(
              "Bank transfer status check failed:",
              error
            );

            return initialResponse;
          }

          if (!transaction) {
            console.warn(
              "Bank transfer transaction was not found:",
              transactionIdToCheck
            );

            return initialResponse;
          }

          return {
            ...initialResponse,

            transaction_id:
              transaction.id,

            reference:
              transaction.reference_number ||
              initialResponse.reference,

            transfer_id:
              transaction.provider_reference ||
              initialResponse.transfer_id,

            status:
              transaction.status,

            amount:
              Number(
                transaction.amount ??
                  initialResponse.amount ??
                  amount
              ),

            metadata:
              transaction.metadata,

            data: {
              ...(initialResponse.data || {}),

              status:
                transaction.status,

              transaction_id:
                transaction.id,

              reference:
                transaction.reference_number ||
                initialResponse.reference,

              provider_reference:
                transaction.provider_reference,

              metadata:
                transaction.metadata,
            },
          };
        } catch (error) {
          console.error(
            "Unexpected bank transfer status check error:",
            error
          );

          return initialResponse;
        }
      },
      [amount]
    );

  // ==========================================================
  // EXECUTE TRANSACTION
  // ==========================================================

  const executeTransaction =
    useCallback(
      async (
        allowDuplicateGuard = false
      ) => {
        if (
          executionStartedRef.current &&
          !allowDuplicateGuard
        ) {
          return;
        }

        executionStartedRef.current =
          true;

        if (mountedRef.current) {
          setStatus("processing");
          setErrorMessage("");
          setResult(null);
        }

        try {
          let functionName = "";

          let body: Record<
            string,
            any
          > = {};

          // ==================================================
          // IYANJUPAY TRANSFER
          // ==================================================

          if (isIyanjuPay) {
            functionName =
              "iyanjuPay-transfer";

            body = {
              wallet_id:
                details?.wallet_id ||
                details?.recipientWalletId,

              amount,

              narration:
                details?.narration ||
                "IyanjuPay transfer",

              idempotency_key:
                idempotencyKey,
            };
          }

          // ==================================================
          // BANK TRANSFER
          // ==================================================

          if (isBank) {
            functionName =
              "flutterwave-transfer";

            body = {
              amount,

              account_number:
                details?.accountNumber,

              account_bank:
                details?.bankCode,

              bank_code:
                details?.bankCode,

              account_name:
                details?.recipient,

              beneficiary_name:
                details?.recipient,

              narration:
                details?.narration ||
                "Bank transfer",

              idempotency_key:
                idempotencyKey,
            };
          }

          // ==================================================
          // BILL PAYMENT
          // ==================================================

          if (isBill) {
            functionName =
              "flutterwave-bills";

            const service =
              String(
                details?.service ??
                  details?.type ??
                  ""
              ).toLowerCase();

            const billerCode =
              String(
                details?.biller_code ??
                  details?.billerCode ??
                  ""
              ).trim();

            const itemCode =
              String(
                details?.item_code ??
                  details?.itemCode ??
                  ""
              ).trim();

            const customer =
              String(
                details?.customer ??
                  ""
              ).trim();

            const country =
              details?.country ||
              "NG";

            body = {
              action: "pay",

              service,

              amount,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              country,

              details: {
                ...details,

                paymentPin:
                  undefined,

                pin:
                  undefined,
              },

              idempotency_key:
                idempotencyKey,
            };
          }

          if (!functionName) {
            throw new Error(
              "Invalid transaction type."
            );
          }

          console.log(
            "Executing authorized transaction:",
            {
              functionName,
              transactionType:
                resolvedTransactionType,
              amount,
              idempotencyKey,
              service:
                isBill
                  ? details?.service
                  : undefined,
            }
          );

          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              functionName,
              {
                body,
              }
            );

          if (error) {
            const message =
              await extractFunctionError(
                error,
                `Unable to process this ${transactionName.toLowerCase()}.`
              );

            throw new Error(
              message
            );
          }

          if (!data) {
            throw new Error(
              `No response was received from the ${transactionName.toLowerCase()} service.`
            );
          }

          const response =
            data as TransactionResult;

          if (
            response.success ===
              false &&
            !response.status &&
            !response.data?.status
          ) {
            throw new Error(
              response.error ||
                response.message ||
                `${transactionName} failed.`
            );
          }

          let finalResponse =
            response;

          let normalizedStatus =
            normalizeStatus(
              response
            );

          // ==================================================
          // BANK TRANSFER CONFIRMATION
          // ==================================================

          if (
            isBank &&
            normalizedStatus ===
              "pending"
          ) {
            if (
              mountedRef.current
            ) {
              setStatus(
                "processing"
              );

              setResult(
                response
              );
            }

            const existingTransactionId =
              response.transaction_id ||
              response.transactionId ||
              response.data
                ?.transaction_id ||
              "";

            finalResponse =
              await checkBankTransferStatus(
                existingTransactionId,
                response
              );

            if (
              !mountedRef.current
            ) {
              return;
            }

            normalizedStatus =
              normalizeStatus(
                finalResponse
              );
          }

          if (
            !mountedRef.current
          ) {
            return;
          }

          setResult(
            finalResponse
          );

          setStatus(
            normalizedStatus
          );

          // ==================================================
          // SUCCESS
          // ==================================================

          if (
            normalizedStatus ===
            "success"
          ) {
            toast({
              title:
                isBill
                  ? `${billServiceName} Successful`
                  : "Transfer Successful",

              description:
                finalResponse.message ||
                `Your ${isBill ? billServiceName.toLowerCase() : "transfer"} has been completed successfully.`,
            });

            return;
          }

          // ==================================================
          // PENDING
          // ==================================================

          if (
            normalizedStatus ===
            "pending"
          ) {
            toast({
              title:
                isBill
                  ? `${billServiceName} Pending`
                  : "Transfer Pending",

              description:
                finalResponse.message ||
                `Your ${isBill ? billServiceName.toLowerCase() : "transfer"} is awaiting final confirmation.`,
            });

            return;
          }

          // ==================================================
          // FAILED
          // ==================================================

          setErrorMessage(
            finalResponse.error ||
              finalResponse.message ||
              `The ${transactionName.toLowerCase()} could not be completed.`
          );
        } catch (error: any) {
          console.error(
            "Transaction processing error:",
            error
          );

          if (
            !mountedRef.current
          ) {
            return;
          }

          setResult(null);

          setStatus("failed");

          const message =
            error?.message ||
            `Unable to complete this ${transactionName.toLowerCase()}.`;

          setErrorMessage(
            message
          );

          toast({
            title:
              isBill
                ? `${billServiceName} Failed`
                : "Transfer Failed",

            description:
              message,

            variant:
              "destructive",
          });
        }
      },
      [
        amount,
        details,
        idempotencyKey,
        isBank,
        isBill,
        isIyanjuPay,
        resolvedTransactionType,
        billServiceName,
        transactionName,
        toast,
        checkBankTransferStatus,
      ]
    );

  // ==========================================================
  // INITIAL EXECUTION
  // ==========================================================

  useEffect(() => {
    if (
      executionStartedRef.current
    ) {
      return;
    }

    void executeTransaction();
  }, [
    executeTransaction,
  ]);

  // ==========================================================
  // RETRY
  // ==========================================================

  const handleRetry =
    async () => {
      if (retrying) {
        return;
      }

      setRetrying(true);

      /*
       * Reuse the SAME idempotency key.
       */
      executionStartedRef.current =
        false;

      try {
        await executeTransaction();
      } finally {
        if (mountedRef.current) {
          setRetrying(false);
        }
      }
    };

  // ==========================================================
  // COPY REFERENCE
  // ==========================================================

  const handleCopyReference =
    async () => {
      if (!reference) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          reference
        );

        setCopied(true);

        toast({
          title:
            "Reference copied",
          description:
            "Transaction reference copied to your clipboard.",
        });

        window.setTimeout(() => {
          if (mountedRef.current) {
            setCopied(false);
          }
        }, 1800);
      } catch {
        toast({
          title:
            "Unable to copy",
          description:
            "Please copy the reference manually.",
          variant:
            "destructive",
        });
      }
    };

  // ==========================================================
  // STATUS CONFIG
  // ==========================================================

  const statusConfig = {
    processing: {
      eyebrow:
        "SECURE PROCESSING",
      title:
        isBill
          ? `Processing ${billServiceName}`
          : "Processing Transfer",
      description:
        isBill
          ? `We're securely processing your ${billServiceName.toLowerCase()} payment.`
          : "We're securely processing your transfer.",
    },

    success: {
      eyebrow:
        "TRANSACTION COMPLETE",
      title:
        isBill
          ? `${billServiceName} Successful`
          : "Transfer Successful",
      description:
        isBill
          ? `Your ${billServiceName.toLowerCase()} payment was completed successfully.`
          : "Your transfer was completed successfully.",
    },

    pending: {
      eyebrow:
        "AWAITING CONFIRMATION",
      title:
        isBill
          ? `${billServiceName} Pending`
          : "Transfer Pending",
      description:
        isBill
          ? `Your ${billServiceName.toLowerCase()} payment has been submitted and is awaiting final confirmation.`
          : "Your transfer has been submitted and is awaiting final confirmation.",
    },

    failed: {
      eyebrow:
        "TRANSACTION UNSUCCESSFUL",
      title:
        isBill
          ? `${billServiceName} Failed`
          : "Transfer Failed",
      description:
        isBill
          ? `We could not complete your ${billServiceName.toLowerCase()} payment.`
          : "We could not complete your transfer.",
    },
  }[status];

  // ==========================================================
  // STATUS ICON
  // ==========================================================

  const renderStatusIcon =
    () => {
      if (
        status ===
        "processing"
      ) {
        return (
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full border-4 border-slate-100"
              aria-hidden="true"
            />

            <div
              className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#F4B400]"
              aria-hidden="true"
            />

            <div
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#082A63]"
            >
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          </div>
        );
      }

      if (
        status ===
        "success"
      ) {
        return (
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-emerald-50" />

            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/20">
              <Check className="h-8 w-8 text-white" strokeWidth={3} />
            </div>
          </div>
        );
      }

      if (
        status ===
        "pending"
      ) {
        return (
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-50" />

            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/20">
              <Clock3 className="h-8 w-8 text-white" />
            </div>
          </div>
        );
      }

      return (
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-red-50" />

          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/20">
            <XCircle className="h-8 w-8 text-white" />
          </div>
        </div>
      );
    };

  // ==========================================================
  // TRANSACTION SUMMARY
  // ==========================================================

  const renderTransactionSummary =
    () => {
      if (isBill) {
        return (
          <div className="space-y-0">
            <SummaryRow
              label="Service"
              value={billServiceName}
            />

            {billCustomer && (
              <SummaryRow
                label={
                  billCustomerLabel
                }
                value={
                  billCustomer
                }
              />
            )}

            {billPackage && (
              <SummaryRow
                label="Package"
                value={
                  billPackage
                }
              />
            )}

            <SummaryRow
              label="Amount"
              value={formatNaira(
                amount
              )}
              strong
            />
          </div>
        );
      }

      return (
        <div className="space-y-0">
          <SummaryRow
            label="Recipient"
            value={recipient}
          />

          {isBank &&
            bank && (
              <SummaryRow
                label="Bank"
                value={bank}
              />
            )}

          {isBank &&
            accountNumber && (
              <SummaryRow
                label="Account"
                value={maskAccountNumber(
                  accountNumber
                )}
              />
            )}

          <SummaryRow
            label="Amount"
            value={formatNaira(
              amount
            )}
            strong
          />
        </div>
      );
    };

  // ==========================================================
  // MAIN PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-slate-900">
      {/* ======================================================
          PREMIUM TOP BAR
      ====================================================== */}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() =>
              void onBack()
            }
            disabled={
              status ===
                "processing" ||
              retrying
            }
            className="group inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#082A63] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />

            <span className="hidden sm:inline">
              Back
            </span>
          </button>

          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm"
              style={{
                backgroundColor:
                  NAVY,
              }}
            >
              {isBill ? (
                <Receipt className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                IyanjuPay
              </p>

              <p className="text-sm font-bold text-slate-900">
                {transactionName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />

            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Secure
            </span>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* ====================================================
            STATUS HERO
        ==================================================== */}

        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(8,42,99,0.25)]">
          {/* Decorative premium background */}
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.06] blur-3xl"
            style={{
              backgroundColor:
                NAVY,
            }}
          />

          <div
            className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full opacity-[0.07] blur-3xl"
            style={{
              backgroundColor:
                GOLD,
            }}
          />

          <div className="relative px-5 py-10 text-center sm:px-10 sm:py-14">
            <div className="mb-7 flex justify-center">
              {renderStatusIcon()}
            </div>

            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {status ===
              "processing" ? (
                <Loader2 className="h-3 w-3 animate-spin text-[#082A63]" />
              ) : status ===
                "success" ? (
                <Sparkles className="h-3 w-3 text-[#F4B400]" />
              ) : status ===
                "pending" ? (
                <Clock3 className="h-3 w-3 text-amber-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}

              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                {statusConfig.eyebrow}
              </span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {statusConfig.title}
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
              {statusConfig.description}
            </p>

            {/* Amount */}
            {status !==
              "failed" && (
              <div className="mt-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Transaction Amount
                </p>

                <p
                  className="mt-1 text-4xl font-black tracking-tight sm:text-5xl"
                  style={{
                    color:
                      NAVY,
                  }}
                >
                  {formatNaira(
                    amount
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ====================================================
            TRANSACTION DETAILS
        ==================================================== */}

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]">
          {/* Receipt header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#082A63]/[0.07]">
                <Receipt
                  className="h-5 w-5"
                  style={{
                    color:
                      NAVY,
                  }}
                />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900">
                  Transaction Details
                </p>

                <p className="text-xs text-slate-400">
                  {status ===
                  "processing"
                    ? "Transaction in progress"
                    : "Transaction summary"}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-1.5 text-xs font-semibold text-slate-400 sm:flex">
              <LockKeyhole className="h-3.5 w-3.5" />
              Protected
            </div>
          </div>

          {/* Receipt body */}
          <div className="px-5 py-2 sm:px-7">
            {isBill ? (
              <BillIdentity
                service={
                  billServiceName
                }
                customer={
                  billCustomer
                }
                customerLabel={
                  billCustomerLabel
                }
                packageName={
                  billPackage
                }
              />
            ) : (
              <TransferIdentity
                recipient={
                  recipient
                }
                bank={bank}
                accountNumber={
                  accountNumber
                }
                isBank={
                  isBank
                }
              />
            )}

            <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
              {renderTransactionSummary()}
            </div>
          </div>
        </section>

        {/* ====================================================
            REFERENCE
        ==================================================== */}

        {reference && (
          <section className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                  Transaction Reference
                </p>

                <p className="mt-2 break-all font-mono text-sm font-bold text-slate-800">
                  {reference}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleCopyReference
                }
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-[#082A63]"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        {/* ====================================================
            PENDING NOTICE
        ==================================================== */}

        {status ===
          "pending" && (
          <section className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <Clock3 className="h-5 w-5 text-amber-600" />
              </div>

              <div>
                <h2 className="text-sm font-bold text-amber-950">
                  Your transaction is still being confirmed
                </h2>

                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Please do not submit the same{" "}
                  {isBill
                    ? "payment"
                    : "transfer"}{" "}
                  again. Your existing transaction is already being processed using its original reference.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ====================================================
            FAILED MESSAGE
        ==================================================== */}

        {status ===
          "failed" && (
          <section className="mt-5 overflow-hidden rounded-[1.5rem] border border-red-200 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]">
            <div className="border-b border-red-100 bg-red-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>

                <p className="text-sm font-bold text-red-900">
                  What happened?
                </p>
              </div>
            </div>

            <div className="px-5 py-5">
              <p className="text-sm leading-6 text-red-800">
                {errorMessage ||
                  `The ${isBill ? billServiceName.toLowerCase() : "transfer"} could not be completed.`}
              </p>
            </div>
          </section>
        )}

        {/* ====================================================
            SECURITY NOTE
        ==================================================== */}

        {status ===
          "processing" && (
          <section className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800">
                Secure transaction
              </p>

              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                Your transaction is protected by IyanjuPay's secure processing system.
              </p>
            </div>
          </section>
        )}

        {/* ====================================================
            ACTIONS
        ==================================================== */}

        {status !==
          "processing" && (
          <div className="mt-7">
            {status ===
            "failed" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void onBack()
                  }
                  disabled={
                    retrying
                  }
                  className="h-12 rounded-xl border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={
                    handleRetry
                  }
                  disabled={
                    retrying
                  }
                  className="h-12 rounded-xl text-sm font-bold text-white shadow-lg shadow-[#082A63]/20 hover:opacity-95"
                  style={{
                    backgroundColor:
                      NAVY,
                  }}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Try Again
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  void onDone()
                }
                className="h-13 w-full rounded-2xl text-sm font-bold text-white shadow-xl shadow-[#082A63]/20 transition hover:-translate-y-0.5 hover:opacity-95"
                style={{
                  backgroundColor:
                    NAVY,
                }}
              >
                {status ===
                "success" ? (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Done
                  </>
                ) : (
                  <>
                    Continue to Dashboard
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ====================================================
            FOOTER
        ==================================================== */}

        <div className="flex items-center justify-center gap-2 pb-5 pt-8 text-center">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />

          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Securely processed by IyanjuPay
          </p>
        </div>
      </main>
    </div>
  );
};

// ============================================================
// SUMMARY ROW
// ============================================================

interface SummaryRowProps {
  label: string;
  value: string;
  strong?: boolean;
}

const SummaryRow = ({
  label,
  value,
  strong = false,
}: SummaryRowProps) => (
  <div className="flex min-h-[54px] items-center justify-between gap-6 border-b border-slate-100 last:border-b-0">
    <span className="text-xs font-medium text-slate-400">
      {label}
    </span>

    <span
      className={[
        "max-w-[65%] break-words text-right",
        strong
          ? "text-base font-black text-[#082A63]"
          : "text-sm font-bold text-slate-800",
      ].join(" ")}
    >
      {value}
    </span>
  </div>
);

// ============================================================
// TRANSFER IDENTITY
// ============================================================

interface TransferIdentityProps {
  recipient: string;
  bank: string;
  accountNumber: string;
  isBank: boolean;
}

const TransferIdentity = ({
  recipient,
  bank,
  accountNumber,
  isBank,
}: TransferIdentityProps) => {
  const initials =
    getInitials(recipient);

  return (
    <div className="flex items-center gap-4 py-5">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#082A63] text-base font-black text-white shadow-lg shadow-[#082A63]/15">
        {initials}

        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500">
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
          Sending to
        </p>

        <p className="mt-1 truncate text-base font-black text-slate-900 sm:text-lg">
          {recipient}
        </p>

        {isBank ? (
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
            {bank
              ? `${bank} • `
              : ""}
            {maskAccountNumber(
              accountNumber
            )}
          </p>
        ) : (
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            IyanjuPay wallet
          </p>
        )}
      </div>

      <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-slate-50 sm:flex">
        <ArrowUpRight className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
};

// ============================================================
// BILL IDENTITY
// ============================================================

interface BillIdentityProps {
  service: string;
  customer: string;
  customerLabel: string;
  packageName: string;
}

const BillIdentity = ({
  service,
  customer,
  customerLabel,
  packageName,
}: BillIdentityProps) => {
  const initials =
    getInitials(service);

  return (
    <div className="flex items-center gap-4 py-5">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#082A63] text-sm font-black text-white shadow-lg shadow-[#082A63]/15">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
          Service
        </p>

        <p className="mt-1 truncate text-base font-black text-slate-900 sm:text-lg">
          {service}
        </p>

        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-slate-500">
          {customer && (
            <span>
              {customerLabel}:{" "}
              <span className="font-semibold text-slate-700">
                {customer}
              </span>
            </span>
          )}

          {packageName && (
            <>
              {customer && (
                <span className="text-slate-300">
                  •
                </span>
              )}

              <span>
                {packageName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionProcessingPage;
