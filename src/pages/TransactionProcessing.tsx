import { getFunctionErrorMessage } from "@/lib/errorHandling";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock3, Copy,
  Loader2, Receipt, RefreshCw, Send, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type TransactionType = "iyanjupay" | "bank" | "bill";
type LegacyTransferType = "iyanjupay" | "bank";
type TransactionStatus = "success" | "pending" | "failed";

type TransactionProcessingPageProps = {
  transactionType?: TransactionType;
  transferType?: LegacyTransferType;
  amount: number;
  details: any;
  idempotencyKey: string;
  onDone: () => Promise<void> | void;
  onBack: () => Promise<void> | void;
};

type TransactionResult = {
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
};

const NAVY = "#082A63";
const GOLD = "#F4B400";

const formatNaira = (value: number) =>
  `₦${Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const maskAccountNumber = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
};

const getInitials = (value: string) => {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "IP";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/**
 * Customer-facing transaction messages are deliberately controlled here.
 * Provider JSON, endpoint errors, Supabase errors and technical diagnostics
 * may be logged, but are never rendered as customer-facing text.
 */
const SAFE_TECHNICAL_FAILURE = "Technical issue. We’re working to resolve it shortly.";
const SAFE_FAILED = "We could not complete this transaction. Please try again shortly.";

const normalizeService = (value: unknown) =>
  String(value ?? "").toLowerCase().trim().replace(/[_\s]+/g, "-");

const serviceLabel = (value: unknown) => {
  switch (normalizeService(value)) {
    case "airtime": return "Airtime";
    case "data": return "Data";
    case "cable":
    case "cable-tv":
    case "cabletv": return "Cable TV";
    case "electricity": return "Electricity";
    case "education":
    case "exampin":
    case "jamb":
    case "waec":
    case "neco":
    case "nabteb":
    case "exam-pin": return "Education";
    case "recharge-card":
    case "recharge-pin":
    case "airtime-card": return "Recharge PIN";
    case "data-card":
    case "data-pin": return "Data PIN";
    case "gift-card":
    case "giftcard": return "Gift Card";
    case "airtime-to-cash": return "Airtime to Cash";
    case "internet":
    case "internet-service": return "Internet Service";
    case "internet-esim":
    case "esim": return "Internet eSIM";
    case "savings": return "Savings";
    case "virtual-card": return "Virtual Card";
    default: return "Bill Payment";
  }
};

const normalizeStatus = (response: TransactionResult): TransactionStatus => {
  const raw = String(
    response?.status ?? response?.data?.status ?? response?.data?.transaction_status ?? "",
  ).trim().toLowerCase();

  if (["success", "successful", "completed", "complete", "succeeded", "paid", "successful_payment", "successfully_completed"].includes(raw)) return "success";
  if (["pending", "processing", "queued", "new", "initiated", "awaiting", "in_progress", "submitted"].includes(raw)) return "pending";
  if (["failed", "failure", "cancelled", "canceled", "reversed", "rejected", "declined", "error", "fail"].includes(raw)) return "failed";
  if (response?.success === true) return "success";
  if (response?.success === false) return "failed";
  return "pending";
};

const isLikelyTechnicalText = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return true;
  return /(supabase|edge function|function invoke|http\s*\d{3}|status code|endpoint|provider response|topupmate|flutterwave|json|request failed|network error|fetch failed|rpc|postgres|database|console|stack trace|daily transaction limit|internal server|server error|500|502|503|504)/i.test(text);
};

const safeCustomerFailure = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text || isLikelyTechnicalText(text)) return SAFE_TECHNICAL_FAILURE;
  return SAFE_FAILED;
};

const CompactSummaryRow = ({ label, value, strong = false, last = false }: { label: string; value: string; strong?: boolean; last?: boolean }) => (
  <div className={["flex min-h-[32px] items-center justify-between gap-3", last ? "" : "border-b border-slate-100"].join(" ")}>
    <span className="shrink-0 text-[9px] font-medium text-slate-400">{label}</span>
    <span className={["max-w-[68%] truncate text-right", strong ? "text-[12px] font-black text-[#082A63]" : "text-[10px] font-semibold text-slate-700"].join(" ")} title={value}>{value}</span>
  </div>
);

const CompactTransferIdentity = ({ recipient, bank, accountNumber, isBank }: { recipient: string; bank: string; accountNumber: string; isBank: boolean }) => (
  <div className="flex items-center gap-2.5 py-2.5">
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63] text-[11px] font-black text-white">
      {getInitials(recipient)}
      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500"><Check className="h-2 w-2 text-white" strokeWidth={3} /></div>
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Sending to</p>
      <p className="truncate text-xs font-black text-slate-900">{recipient}</p>
      <p className="truncate text-[9px] font-medium text-slate-500">{isBank ? `${bank ? `${bank} • ` : ""}${maskAccountNumber(accountNumber)}` : "IyanjuPay wallet"}</p>
    </div>
    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
  </div>
);

const CompactBillIdentity = ({ service, customer, customerLabel, packageName }: { service: string; customer: string; customerLabel: string; packageName: string }) => (
  <div className="flex items-center gap-2.5 py-2.5">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63] text-[10px] font-black text-white">{getInitials(service)}</div>
    <div className="min-w-0 flex-1">
      <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Service</p>
      <p className="truncate text-xs font-black text-slate-900">{service}</p>
      <div className="flex min-w-0 items-center gap-1.5">
        {customer && <span className="truncate text-[9px] font-medium text-slate-500">{customerLabel}: <span className="font-semibold text-slate-700">{customer}</span></span>}
        {packageName && <><span className="shrink-0 text-[8px] text-slate-300">•</span><span className="truncate text-[9px] font-medium text-slate-500">{packageName}</span></>}
      </div>
    </div>
  </div>
);

const TransactionProcessingPage = ({ transactionType, transferType, amount, details, idempotencyKey, onDone, onBack }: TransactionProcessingPageProps) => {
  const { toast } = useToast();
  const resolvedTransactionType: TransactionType = transactionType ?? transferType ?? "bank";
  const isBill = resolvedTransactionType === "bill";
  const isIyanjuPay = resolvedTransactionType === "iyanjupay";
  const isBank = resolvedTransactionType === "bank";

  // "submitting" is an internal execution state, not a transaction outcome.
  // The customer only ever sees success, pending or failed as the final status.
  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [submitting, setSubmitting] = useState(true);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const executionStartedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const billServiceName = useMemo(() => serviceLabel(details?.service ?? details?.type), [details]);
  const transactionName = isBill ? billServiceName : "Transfer";

  const recipient = details?.recipient || details?.recipientName || result?.recipient_name || result?.data?.recipient_name || "Recipient";
  const bank = details?.bank || details?.bankName || "";
  const accountNumber = details?.accountNumber || details?.account_number || "";
  const billCustomer = details?.customer || details?.customerNumber || details?.phone || "";
  const billPackage = details?.item?.name || details?.item?.short_name || details?.packageName || details?.package_name || details?.package || "";

  const billCustomerLabel = details?.customerLabel || (() => {
    const service = normalizeService(details?.service ?? details?.type);
    if (service === "airtime" || service === "data" || service === "airtime-card" || service === "data-card" || service === "recharge-card") return "Phone Number";
    if (service === "electricity") return "Meter Number";
    if (service === "cable" || service === "cable-tv" || service === "cabletv") return "Smart Card";
    if (service === "internet" || service === "internet-service") return "Account Number";
    return "Customer";
  })();

  const reference = result?.reference || result?.data?.reference || result?.transaction_id || result?.transactionId || result?.transfer_id || result?.transferId || result?.bill_payment_id || result?.billPaymentId || result?.data?.transaction_id || result?.data?.transfer_id || result?.data?.bill_payment_id || "";

  const transactionId = result?.transaction_id || result?.transactionId || result?.data?.transaction_id || result?.credit_transaction_id || result?.bill_payment_id || result?.billPaymentId || "";

  const checkBankTransferStatus = useCallback(async (transactionIdToCheck: string, initialResponse: TransactionResult): Promise<TransactionResult> => {
    await new Promise<void>(resolve => window.setTimeout(resolve, 8000));
    if (!mountedRef.current || !transactionIdToCheck) return initialResponse;

    try {
      const { data: transaction, error } = await supabase.from("transactions").select(`id,status,reference_number,provider_reference,amount,metadata`).eq("id", transactionIdToCheck).maybeSingle();
      if (error) {
        console.error("Bank transfer status check failed:", error);
        return initialResponse;
      }
      if (!transaction) {
        console.warn("Bank transfer transaction was not found:", transactionIdToCheck);
        return initialResponse;
      }
      return {
        ...initialResponse,
        transaction_id: transaction.id,
        reference: transaction.reference_number || initialResponse.reference,
        transfer_id: transaction.provider_reference || initialResponse.transfer_id,
        status: transaction.status,
        amount: Number(transaction.amount ?? initialResponse.amount ?? amount),
        metadata: transaction.metadata,
        data: { ...(initialResponse.data || {}), status: transaction.status, transaction_id: transaction.id, reference: transaction.reference_number || initialResponse.reference, provider_reference: transaction.provider_reference, metadata: transaction.metadata },
      };
    } catch (error) {
      console.error("Unexpected bank transfer status check error:", error);
      return initialResponse;
    }
  }, [amount]);

  const executeTransaction = useCallback(async (allowDuplicateGuard = false) => {
    if (executionStartedRef.current && !allowDuplicateGuard) return;
    executionStartedRef.current = true;

    if (mountedRef.current) {
      setSubmitting(true);
      setStatus(null);
      setErrorMessage("");
      setResult(null);
    }

    try {
      let functionName = "";
      let body: Record<string, any> = {};

      if (isIyanjuPay) {
        functionName = "iyanjuPay-transfer";
        body = {
          wallet_id: details?.wallet_id || details?.recipientWalletId,
          amount,
          narration: details?.narration || "IyanjuPay transfer",
          idempotency_key: idempotencyKey,
        };
      } else if (isBank) {
        functionName = "flutterwave-transfer";
        body = {
          amount,
          account_number: details?.accountNumber,
          account_bank: details?.bankCode,
          bank_code: details?.bankCode,
          account_name: details?.recipient,
          beneficiary_name: details?.recipient,
          narration: details?.narration || "Bank transfer",
          idempotency_key: idempotencyKey,
        };
      } else if (isBill) {
        functionName = "topupmate-services";
        const service = String(details?.service ?? details?.type ?? "").toLowerCase().trim();
        const billerCode = String(details?.biller_code ?? details?.billerCode ?? "").trim();
        const itemCode = String(details?.item_code ?? details?.itemCode ?? "").trim();
        const customer = String(details?.customer ?? "").trim();
        body = {
          action: "purchase",
          service,
          amount,
          biller_code: billerCode,
          item_code: itemCode,
          customer,
          country: details?.country || "NG",
          details: { ...details, paymentPin: undefined, pin: undefined },
          idempotency_key: idempotencyKey,
        };
      }

      if (!functionName) throw new Error("Invalid transaction type.");

      console.log("Executing authorized transaction:", {
        functionName,
        transactionType: resolvedTransactionType,
        amount,
        idempotencyKey,
        service: isBill ? details?.service : undefined,
      });

      const { data, error } = await supabase.functions.invoke(functionName, { body });

      // Keep complete technical details in the browser console for the developer,
      // but never pass them into the customer-facing result panel.
      if (error) {
        console.error("Transaction function error:", { functionName, error });
        throw new Error("TRANSACTION_TECHNICAL_ERROR");
      }

      if (!data) {
        console.error("Transaction returned no data:", { functionName });
        throw new Error("TRANSACTION_TECHNICAL_ERROR");
      }

      const response = data as TransactionResult;
      console.log("Transaction provider/function response:", response);

      if (response.success === false && !response.status && !response.data?.status) {
        console.error("Transaction returned an unsuccessful response:", response);
        if (mountedRef.current) {
          setResult(response);
          setStatus("failed");
          setErrorMessage(safeCustomerFailure(response.error ?? response.message));
          setSubmitting(false);
        }
        return;
      }

      let finalResponse = response;
      let finalStatus = normalizeStatus(response);

      if (isBank && finalStatus === "pending") {
        const existingTransactionId = response.transaction_id || response.transactionId || response.data?.transaction_id || "";
        finalResponse = await checkBankTransferStatus(existingTransactionId, response);
        if (!mountedRef.current) return;
        finalStatus = normalizeStatus(finalResponse);
      }

      if (!mountedRef.current) return;

      setResult(finalResponse);
      setStatus(finalStatus);
      setSubmitting(false);

      if (finalStatus === "success") {
        toast({
          title: isBill ? `${billServiceName} Successful` : "Transfer Successful",
          description: `Your ${isBill ? billServiceName.toLowerCase() : "transfer"} was completed successfully.`,
        });
        return;
      }

      if (finalStatus === "pending") {
        toast({
          title: isBill ? `${billServiceName} Pending` : "Transfer Pending",
          description: `Your ${isBill ? billServiceName.toLowerCase() : "transfer"} is awaiting final confirmation.`,
        });
        return;
      }

      setErrorMessage(safeCustomerFailure(finalResponse.error ?? finalResponse.message));
    } catch (error: any) {
      console.error("Transaction processing error:", error);
      if (!mountedRef.current) return;
      setResult(null);
      setStatus("failed");
      setSubmitting(false);

      const rawSafe = error?.message === "TRANSACTION_TECHNICAL_ERROR"
        ? ""
        : getFunctionErrorMessage(error, "");
      setErrorMessage(safeCustomerFailure(rawSafe));

      toast({
        title: isBill ? `${billServiceName} Failed` : "Transfer Failed",
        description: safeCustomerFailure(rawSafe),
        variant: "destructive",
      });
    }
  }, [amount, details, idempotencyKey, isBank, isBill, isIyanjuPay, resolvedTransactionType, billServiceName, toast, checkBankTransferStatus]);

  useEffect(() => {
    if (executionStartedRef.current) return;
    void executeTransaction();
  }, [executeTransaction]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    executionStartedRef.current = false;
    try {
      await executeTransaction(true);
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  };

  const handleCopyReference = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      toast({ title: "Reference copied", description: "Transaction reference copied to your clipboard." });
      window.setTimeout(() => { if (mountedRef.current) setCopied(false); }, 1800);
    } catch {
      toast({ title: "Unable to copy", description: "Please copy the reference manually.", variant: "destructive" });
    }
  };

  const displayStatus = status ?? "pending";
  const statusConfig = status === null ? {
    eyebrow: "PLEASE WAIT",
    title: "Please wait",
    description: "Your transaction is being confirmed securely.",
  } : status === "success" ? {
    eyebrow: "TRANSACTION COMPLETE",
    title: isBill ? `${billServiceName} Successful` : "Transfer Successful",
    description: isBill ? `Your ${billServiceName.toLowerCase()} payment was completed successfully.` : "Your transfer was completed successfully.",
  } : status === "pending" ? {
    eyebrow: "AWAITING CONFIRMATION",
    title: isBill ? `${billServiceName} Pending` : "Transfer Pending",
    description: isBill ? `Your ${billServiceName.toLowerCase()} payment is awaiting final confirmation.` : "Your transfer is awaiting final confirmation.",
  } : {
    eyebrow: "TRANSACTION UNSUCCESSFUL",
    title: isBill ? `${billServiceName} Failed` : "Transfer Failed",
    description: isBill ? `We could not complete your ${billServiceName.toLowerCase()} payment.` : "We could not complete your transfer.",
  };

  const renderStatusIcon = () => {
    if (status === null) return (
      <div className="relative flex h-[76px] w-[76px] items-center justify-center">
        <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[#F4B400]" />
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[#082A63] shadow-lg shadow-[#082A63]/20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>
      </div>
    );
    if (status === "success") return <div className="relative flex h-[76px] w-[76px] items-center justify-center"><div className="absolute inset-0 rounded-full bg-emerald-50" /><div className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/20"><Check className="h-7 w-7 text-white" strokeWidth={3} /></div></div>;
    if (status === "pending") return <div className="relative flex h-[76px] w-[76px] items-center justify-center"><div className="absolute inset-0 rounded-full bg-amber-50" /><div className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/20"><Clock3 className="h-7 w-7 text-white" /></div></div>;
    return <div className="relative flex h-[76px] w-[76px] items-center justify-center"><div className="absolute inset-0 rounded-full bg-red-50" /><div className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/20"><XCircle className="h-7 w-7 text-white" /></div></div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F6F8FC] text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-[58px] items-center justify-between px-4">
          <button type="button" onClick={() => void onBack()} disabled={submitting || retrying} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#082A63] text-white">{isBill ? <Receipt className="h-4 w-4" /> : <Send className="h-4 w-4" />}</div><div className="text-center"><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-400">IyanjuPay</p><p className="max-w-[140px] truncate text-xs font-bold text-slate-900">{transactionName}</p></div></div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50"><ShieldCheck className="h-4 w-4 text-emerald-600" /></div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-4 py-3">
        <div className="mx-auto flex h-full w-full max-w-md flex-col">
          <section className="flex shrink-0 flex-col items-center text-center">
            <div className="mb-2">{renderStatusIcon()}</div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
              {status === null ? <Loader2 className="h-2.5 w-2.5 animate-spin text-[#082A63]" /> : status === "success" ? <Sparkles className="h-2.5 w-2.5 text-[#F4B400]" /> : status === "pending" ? <Clock3 className="h-2.5 w-2.5 text-amber-500" /> : <XCircle className="h-2.5 w-2.5 text-red-500" />}
              <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{statusConfig.eyebrow}</span>
            </div>
            <h1 className="mt-2 text-xl font-black tracking-tight text-slate-950">{statusConfig.title}</h1>
            <p className="mt-0.5 max-w-[310px] text-[11px] leading-4 text-slate-500">{statusConfig.description}</p>
            {status !== "failed" && <div className="mt-2"><p className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-400">Amount</p><p className="text-2xl font-black tracking-tight" style={{ color: NAVY }}>{formatNaira(amount)}</p></div>}
          </section>

          <section className="mt-3 min-h-0 shrink rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#082A63]/[0.07]"><Receipt className="h-3.5 w-3.5" style={{ color: NAVY }} /></div><div><p className="text-[11px] font-bold text-slate-900">Transaction Details</p><p className="text-[8px] text-slate-400">Secure transaction summary</p></div></div><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /></div>
            <div className="px-3.5">
              {isBill ? <CompactBillIdentity service={billServiceName} customer={billCustomer} customerLabel={billCustomerLabel} packageName={billPackage} /> : <CompactTransferIdentity recipient={recipient} bank={bank} accountNumber={accountNumber} isBank={isBank} />}
              <div className="border-t border-dashed border-slate-200">
                <CompactSummaryRow label={isBill ? "Service" : "Recipient"} value={isBill ? billServiceName : recipient} />
                {isBill && billCustomer && <CompactSummaryRow label={billCustomerLabel} value={billCustomer} />}
                {isBill && billPackage && <CompactSummaryRow label="Package" value={billPackage} />}
                {isBank && bank && <CompactSummaryRow label="Bank" value={bank} />}
                {isBank && accountNumber && <CompactSummaryRow label="Account" value={maskAccountNumber(accountNumber)} />}
                <CompactSummaryRow label="Amount" value={formatNaira(amount)} strong last />
              </div>
            </div>
          </section>

          {status === "success" && reference && <section className="mt-2.5 shrink-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-emerald-600">Reference</p><p className="mt-0.5 truncate font-mono text-[10px] font-bold text-slate-700">{reference}</p></div><button type="button" onClick={handleCopyReference} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[9px] font-bold text-slate-600 shadow-sm ring-1 ring-emerald-100 transition hover:text-[#082A63]">{copied ? <><Check className="h-3 w-3 text-emerald-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}</button></div></section>}

          {status === "pending" && <section className="mt-2.5 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100"><Clock3 className="h-4 w-4 text-amber-600" /></div><div className="min-w-0"><p className="text-[10px] font-bold text-amber-950">Awaiting confirmation</p><p className="mt-0.5 text-[9px] leading-3.5 text-amber-800">Please don't submit this {isBill ? "payment" : "transfer"} again.</p></div></div></section>}

          {status === "failed" && <section className="mt-2.5 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"><div className="flex items-start gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100"><XCircle className="h-4 w-4 text-red-600" /></div><div className="min-w-0"><p className="text-[10px] font-bold text-red-950">Transaction failed</p><p className="mt-0.5 line-clamp-3 text-[9px] leading-3.5 text-red-800">{errorMessage || SAFE_FAILED}</p></div></div></section>}

          {submitting && <div className="mt-2.5 flex shrink-0 items-center justify-center gap-1.5 text-center"><ShieldCheck className="h-3 w-3 text-emerald-500" /><p className="text-[8px] font-semibold text-slate-400">Your transaction is securely protected</p></div>}

          {!submitting && status !== null && <div className="mt-auto shrink-0 pt-2.5">{status === "failed" ? <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => void onBack()} disabled={retrying} className="h-11 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button><Button type="button" onClick={handleRetry} disabled={retrying} className="h-11 rounded-xl bg-[#082A63] text-xs font-bold text-white shadow-lg shadow-[#082A63]/20 hover:bg-[#082A63]/95">{retrying ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Retrying</> : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Try Again</>}</Button></div> : <Button type="button" onClick={() => void onDone()} className="h-11 w-full rounded-xl bg-[#082A63] text-xs font-bold text-white shadow-lg shadow-[#082A63]/20 hover:bg-[#082A63]/95">{status === "success" ? <><CheckCircle2 className="mr-1.5 h-4 w-4" />Done</> : <>Continue to Dashboard<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></>}</Button>}</div>}

          <div className="flex shrink-0 items-center justify-center gap-1.5 pb-1 pt-2"><ShieldCheck className="h-2.5 w-2.5 text-emerald-500" /><span className="text-[7px] font-bold uppercase tracking-[0.12em] text-slate-400">Securely processed by IyanjuPay</span></div>
        </div>
      </main>
    </div>
  );
};

export default TransactionProcessingPage;
