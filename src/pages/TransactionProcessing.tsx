import { getFunctionErrorMessage } from "@/lib/errorHandling";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock3, Copy,
  Download, FileDown, Image as ImageIcon, Loader2, Printer,
  Receipt, RefreshCw, Send, ShieldCheck, Sparkles, XCircle,
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
  amount?: number;
  details?: any;
  idempotencyKey?: string;
  onDone?: () => Promise<void> | void;
  onBack?: () => Promise<void> | void;
};

type TransactionProcessingRouteState = {
  transactionType?: TransactionType;
  transferType?: LegacyTransferType;
  amount?: number;
  details?: any;
  idempotencyKey?: string;
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
  created_at?: string;
  transaction_date?: string;
  data?: any;
  metadata?: any;
  [key: string]: any;
};

type ReceiptRow = {
  label: string;
  value: string;
  strong?: boolean;
};

const NAVY = "#082A63";
const GOLD = "#F4B400";
const PURPLE = "#5B28C9";

const formatNaira = (value: number) =>
  `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const SAFE_TECHNICAL_FAILURE =
  "Technical issue. We’re working to resolve it shortly.";
const SAFE_FAILED =
  "We could not complete this transaction. Please try again shortly.";

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
    response?.status ??
    response?.data?.status ??
    response?.data?.transaction_status ??
    "",
  ).trim().toLowerCase();

  if ([
    "success", "successful", "completed", "complete", "succeeded",
    "paid", "successful_payment", "successfully_completed",
  ].includes(raw)) return "success";

  if ([
    "pending", "processing", "queued", "new", "initiated",
    "awaiting", "in_progress", "submitted",
  ].includes(raw)) return "pending";

  if ([
    "failed", "failure", "cancelled", "canceled", "reversed",
    "rejected", "declined", "error", "fail",
  ].includes(raw)) return "failed";

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
  if (!text || isLikelyTechnicalText(text)) {
    return SAFE_TECHNICAL_FAILURE;
  }
  return SAFE_FAILED;
};

/**
 * Creates a downloadable receipt image using the browser's canvas API.
 * The same image is then embedded into a PDF, so both formats look identical.
 */
const createReceiptCanvas = (data: {
  title: string;
  amount: string;
  rows: ReceiptRow[];
  date: string;
}) => {
  const width = 1200;
  const padding = 90;
  const contentWidth = width - padding * 2;
  const rowHeight = 88;
  const height = Math.max(
    1450,
    780 + data.rows.length * rowHeight,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create receipt image.");

  ctx.fillStyle = "#F7F5FF";
  ctx.fillRect(0, 0, width, height);

  // Main receipt sheet.
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(8,42,99,0.10)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.roundRect(35, 35, width - 70, height - 70, 30);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Brand icon.
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.roundRect(width / 2 - 42, 85, 84, 84, 22);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 34px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IP", width / 2, 127);

  ctx.fillStyle = NAVY;
  ctx.font = "900 48px Arial, sans-serif";
  ctx.fillText("IyanjuPay", width / 2, 225);

  ctx.fillStyle = "#64748B";
  ctx.font = "24px Arial, sans-serif";
  ctx.fillText("Money, made effortless.", width / 2, 270);

  // Success badge.
  ctx.fillStyle = "#ECFDF5";
  ctx.beginPath();
  ctx.roundRect(width / 2 - 205, 320, 410, 58, 29);
  ctx.fill();

  ctx.fillStyle = "#047857";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText("✓  TRANSACTION SUCCESSFUL", width / 2, 349);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "bold 19px Arial, sans-serif";
  ctx.fillText(data.title.toUpperCase() + " RECEIPT", width / 2, 440);

  ctx.fillStyle = NAVY;
  ctx.font = "900 54px Arial, sans-serif";
  ctx.fillText(data.amount, width / 2, 520);

  // Divider.
  ctx.strokeStyle = "#DCE4F0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, 585);
  ctx.lineTo(width - padding, 585);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = NAVY;
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.fillText("TRANSACTION DETAILS", padding, 645);

  let y = 710;

  const wrapText = (text: string, maxWidth: number, font: string) => {
    ctx.font = font;
    const words = String(text).split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  data.rows.forEach((row) => {
    const labelLines = wrapText(row.label, 350, "22px Arial, sans-serif");
    const valueLines = wrapText(
      row.value,
      590,
      row.strong
        ? "bold 24px Arial, sans-serif"
        : "bold 22px Arial, sans-serif",
    );

    const lines = Math.max(labelLines.length, valueLines.length, 1);
    const currentHeight = Math.max(75, lines * 32 + 35);

    ctx.fillStyle = "#64748B";
    ctx.font = "22px Arial, sans-serif";
    labelLines.forEach((line, index) => {
      ctx.textAlign = "left";
      ctx.fillText(line, padding, y + 28 + index * 30);
    });

    ctx.fillStyle = row.strong ? NAVY : "#1E293B";
    ctx.font = row.strong
      ? "bold 24px Arial, sans-serif"
      : "bold 22px Arial, sans-serif";

    valueLines.forEach((line, index) => {
      ctx.textAlign = "right";
      ctx.fillText(
        line,
        width - padding,
        y + 28 + index * 30,
      );
    });

    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding, y + currentHeight);
    ctx.lineTo(width - padding, y + currentHeight);
    ctx.stroke();

    y += currentHeight;
  });

  y += 65;

  ctx.textAlign = "center";
  ctx.fillStyle = NAVY;
  ctx.font = "bold 25px Arial, sans-serif";
  ctx.fillText("Thank you for using IyanjuPay.", width / 2, y);

  ctx.fillStyle = "#64748B";
  ctx.font = "22px Arial, sans-serif";
  ctx.fillText("Simple. Secure. Seamless.", width / 2, y + 42);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "18px Arial, sans-serif";
  ctx.fillText(
    "This receipt is your transaction confirmation.",
    width / 2,
    y + 95,
  );

  ctx.fillStyle = "#CBD5E1";
  ctx.font = "16px Arial, sans-serif";
  ctx.fillText("IyanjuPay", width / 2, height - 75);

  return canvas;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const downloadReceiptImage = (canvas: HTMLCanvasElement) => {
  canvas.toBlob((blob) => {
    if (!blob) throw new Error("Could not generate receipt image.");
    downloadBlob(blob, `IyanjuPay-Receipt-${Date.now()}.png`);
  }, "image/png");
};

/**
 * Creates a one-page PDF containing the receipt image.
 * This avoids requiring an additional PDF package in the project.
 */
const createReceiptPdf = (
  jpegDataUrl: string,
  imageWidth: number,
  imageHeight: number,
) => {
  const base64 = jpegDataUrl.split(",")[1];
  const jpegBinary = atob(base64);
  const jpegBytes = new Uint8Array(jpegBinary.length);

  for (let i = 0; i < jpegBinary.length; i++) {
    jpegBytes[i] = jpegBinary.charCodeAt(i);
  }

  const pageWidth = 595.28;
  const pageHeight = pageWidth * (imageHeight / imageWidth);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteOffset = 0;

  const append = (part: Uint8Array) => {
    chunks.push(part);
    byteOffset += part.length;
  };

  const appendText = (value: string) => append(encoder.encode(value));

  appendText("%PDF-1.4\n");

  const addObject = (id: number, content: string) => {
    offsets[id] = byteOffset;
    appendText(`${id} 0 obj\n${content}\nendobj\n`);
  };

  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

  addObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );

  offsets[4] = byteOffset;
  appendText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  append(jpegBytes);
  appendText("\nendstream\nendobj\n");

  const contentStream = encoder.encode(
    `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`,
  );

  offsets[5] = byteOffset;
  appendText(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`,
  );
  append(contentStream);
  appendText("\nendstream\nendobj\n");

  const xrefOffset = byteOffset;
  appendText("xref\n0 6\n");
  appendText("0000000000 65535 f \n");

  for (let i = 1; i <= 5; i++) {
    appendText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  appendText(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new Blob(chunks, { type: "application/pdf" });
};

const CompactSummaryRow = ({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) => (
  <div
    className={[
      "flex min-h-[32px] items-center justify-between gap-3",
      last ? "" : "border-b border-slate-100",
    ].join(" ")}
  >
    <span className="shrink-0 text-[9px] font-medium text-slate-400">
      {label}
    </span>
    <span
      className={[
        "max-w-[68%] truncate text-right",
        strong
          ? "text-[12px] font-black text-[#082A63]"
          : "text-[10px] font-semibold text-slate-700",
      ].join(" ")}
      title={value}
    >
      {value}
    </span>
  </div>
);

const CompactTransferIdentity = ({
  recipient,
  bank,
  accountNumber,
  isBank,
}: {
  recipient: string;
  bank: string;
  accountNumber: string;
  isBank: boolean;
}) => (
  <div className="flex items-center gap-2.5 py-2.5">
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63] text-[11px] font-black text-white">
      {getInitials(recipient)}
      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500">
        <Check className="h-2 w-2 text-white" strokeWidth={3} />
      </div>
    </div>

    <div className="min-w-0 flex-1">
      <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        Sending to
      </p>
      <p className="truncate text-xs font-black text-slate-900">
        {recipient}
      </p>
      <p className="truncate text-[9px] font-medium text-slate-500">
        {isBank
          ? `${bank ? `${bank} • ` : ""}${maskAccountNumber(accountNumber)}`
          : "IyanjuPay wallet"}
      </p>
    </div>

    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
  </div>
);

const CompactBillIdentity = ({
  service,
  customer,
  customerLabel,
  packageName,
}: {
  service: string;
  customer: string;
  customerLabel: string;
  packageName: string;
}) => (
  <div className="flex items-center gap-2.5 py-2.5">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63] text-[10px] font-black text-white">
      {getInitials(service)}
    </div>

    <div className="min-w-0 flex-1">
      <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        Service
      </p>
      <p className="truncate text-xs font-black text-slate-900">
        {service}
      </p>
      <div className="flex min-w-0 items-center gap-1.5">
        {customer && (
          <span className="truncate text-[9px] font-medium text-slate-500">
            {customerLabel}:{" "}
            <span className="font-semibold text-slate-700">
              {customer}
            </span>
          </span>
        )}
        {packageName && (
          <>
            <span className="shrink-0 text-[8px] text-slate-300">•</span>
            <span className="truncate text-[9px] font-medium text-slate-500">
              {packageName}
            </span>
          </>
        )}
      </div>
    </div>
  </div>
);

const ReceiptPrintRow = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className="flex items-start justify-between gap-5 border-b border-slate-100 py-3">
    <span className="text-xs font-medium text-slate-500">
      {label}
    </span>
    <span
      className={`max-w-[65%] break-all text-right text-xs ${
        strong
          ? "font-extrabold text-[#082A63]"
          : "font-semibold text-slate-800"
      }`}
    >
      {value}
    </span>
  </div>
);

const TransactionProcessingPage = (
  props: TransactionProcessingPageProps,
) => {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = (location.state ?? {}) as TransactionProcessingRouteState;

  const transactionType =
    props.transactionType ?? routeState.transactionType;

  const transferType =
    props.transferType ?? routeState.transferType;

  const amount = Number(props.amount ?? routeState.amount ?? 0);
  const details = props.details ?? routeState.details ?? {};

  const idempotencyKey =
    props.idempotencyKey ?? routeState.idempotencyKey ?? "";

  const onDone =
    props.onDone ?? (() => navigate("/dashboard", { replace: true }));

  const onBack =
    props.onBack ?? (() => navigate("/dashboard", { replace: true }));

  const hasTransactionPayload =
    Number.isFinite(amount) &&
    amount > 0 &&
    Boolean(idempotencyKey) &&
    Boolean(transactionType ?? transferType);

  const resolvedTransactionType: TransactionType =
    transactionType ?? transferType ?? "bank";

  const isBill = resolvedTransactionType === "bill";
  const isIyanjuPay = resolvedTransactionType === "iyanjupay";
  const isBank = resolvedTransactionType === "bank";

  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [submitting, setSubmitting] = useState(true);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<"image" | "pdf" | null>(null);

  const executionStartedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const billServiceName = useMemo(
    () => serviceLabel(details?.service ?? details?.type),
    [details],
  );

  const transactionName = isBill ? billServiceName : "Transfer";

  const recipient =
    details?.recipient ||
    details?.recipientName ||
    result?.recipient_name ||
    result?.data?.recipient_name ||
    "Recipient";

  const bank = details?.bank || details?.bankName || "";

  const accountNumber =
    details?.accountNumber || details?.account_number || "";

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

  const billCustomerLabel = details?.customerLabel || (() => {
    const service = normalizeService(details?.service ?? details?.type);

    if (
      service === "airtime" ||
      service === "data" ||
      service === "airtime-card" ||
      service === "data-card" ||
      service === "recharge-card"
    ) return "Phone Number";

    if (service === "electricity") return "Meter Number";

    if (
      service === "cable" ||
      service === "cable-tv" ||
      service === "cabletv"
    ) return "Smart Card";

    if (
      service === "internet" ||
      service === "internet-service"
    ) return "Account Number";

    return "Customer";
  })();

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

  const receiptDate = (() => {
    const rawDate =
      result?.created_at ||
      result?.data?.created_at ||
      result?.transaction_date ||
      result?.data?.transaction_date;

    const date = rawDate ? new Date(rawDate) : new Date();

    return Number.isNaN(date.getTime())
      ? new Date().toLocaleString("en-NG")
      : date.toLocaleString("en-NG", {
          dateStyle: "medium",
          timeStyle: "short",
        });
  })();

  const receiptFee = Number(
    result?.fee ??
    result?.data?.fee ??
    details?.fee ??
    0,
  );

  const receiptTotal = Number(
    result?.total_charged ??
    result?.data?.total_charged ??
    amount + receiptFee,
  );

  const getReceiptRows = (): ReceiptRow[] => {
    const rows: ReceiptRow[] = [];

    if (isBill) {
      rows.push({ label: "Service", value: billServiceName });

      if (billCustomer) {
        rows.push({
          label: billCustomerLabel,
          value: String(billCustomer),
        });
      }

      if (billPackage) {
        rows.push({ label: "Package", value: String(billPackage) });
      }
    } else {
      rows.push({ label: "Recipient", value: String(recipient) });

      if (isBank && bank) {
        rows.push({ label: "Bank", value: String(bank) });
      }

      if (isBank && accountNumber) {
        rows.push({
          label: "Account Number",
          value: maskAccountNumber(accountNumber),
        });
      }

      if (isIyanjuPay && details?.wallet_id) {
        rows.push({
          label: "Wallet ID",
          value: String(details.wallet_id),
        });
      }
    }

    rows.push({
      label: "Transaction Amount",
      value: formatNaira(amount),
    });

    if (receiptFee > 0) {
      rows.push({
        label: "Transaction Fee",
        value: formatNaira(receiptFee),
      });
    }

    rows.push({
      label: "Total Charged",
      value: formatNaira(receiptTotal),
      strong: true,
    });

    if (reference) {
      rows.push({
        label: "Transaction Reference",
        value: String(reference),
      });
    }

    if (transactionId) {
      rows.push({
        label: "Transaction ID",
        value: String(transactionId),
      });
    }

    rows.push({ label: "Date", value: receiptDate });
    rows.push({ label: "Status", value: "Successful", strong: true });

    return rows;
  };

  const handleDownloadReceipt = async (format: "image" | "pdf") => {
    if (status !== "success" || downloading) return;

    setDownloading(format);

    try {
      const canvas = createReceiptCanvas({
        title: isBill ? billServiceName : "Transfer",
        amount: formatNaira(amount),
        rows: getReceiptRows(),
        date: receiptDate,
      });

      if (format === "image") {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) resolve(value);
            else reject(new Error("Could not generate receipt image."));
          }, "image/png");
        });

        downloadBlob(
          blob,
          `IyanjuPay-Receipt-${Date.now()}.png`,
        );

        toast({
          title: "Receipt image downloaded",
          description: "Your PNG receipt is ready.",
        });
      } else {
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.96);
        const pdf = createReceiptPdf(
          jpegDataUrl,
          canvas.width,
          canvas.height,
        );

        downloadBlob(
          pdf,
          `IyanjuPay-Receipt-${Date.now()}.pdf`,
        );

        toast({
          title: "Receipt PDF downloaded",
          description: "Your PDF receipt is ready.",
        });
      }
    } catch (error) {
      console.error("Receipt download failed:", error);

      toast({
        title: "Download unsuccessful",
        description: "We could not generate your receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setDownloading(null);
    }
  };

  const checkBankTransferStatus = useCallback(
    async (
      transactionIdToCheck: string,
      initialResponse: TransactionResult,
    ): Promise<TransactionResult> => {
      if (!mountedRef.current || !transactionIdToCheck) {
        return initialResponse;
      }

      try {
        const { data: transaction, error } = await supabase
          .from("transactions")
          .select(
            "id,status,reference_number,provider_reference,amount,metadata",
          )
          .eq("id", transactionIdToCheck)
          .maybeSingle();

        if (error) {
          console.error("Bank transfer status check failed:", error);
          return initialResponse;
        }

        if (!transaction) {
          console.warn(
            "Bank transfer transaction was not found:",
            transactionIdToCheck,
          );
          return initialResponse;
        }

        return {
          ...initialResponse,
          transaction_id: transaction.id,
          reference:
            transaction.reference_number || initialResponse.reference,
          transfer_id:
            transaction.provider_reference || initialResponse.transfer_id,
          status: transaction.status,
          amount: Number(transaction.amount ?? initialResponse.amount ?? amount),
          metadata: transaction.metadata,
          data: {
            ...(initialResponse.data || {}),
            status: transaction.status,
            transaction_id: transaction.id,
            reference:
              transaction.reference_number || initialResponse.reference,
            provider_reference: transaction.provider_reference,
            metadata: transaction.metadata,
          },
        };
      } catch (error) {
        console.error(
          "Unexpected bank transfer status check error:",
          error,
        );
        return initialResponse;
      }
    },
    [amount],
  );

  const executeTransaction = useCallback(
    async (allowDuplicateGuard = false) => {
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
            wallet_id:
              details?.wallet_id || details?.recipientWalletId,
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

          const service = String(
            details?.service ?? details?.type ?? "",
          ).toLowerCase().trim();

          const billerCode = String(
            details?.biller_code ?? details?.billerCode ?? "",
          ).trim();

          const itemCode = String(
            details?.item_code ?? details?.itemCode ?? "",
          ).trim();

          const customer = String(details?.customer ?? "").trim();

          body = {
            action: "purchase",
            service,
            amount,
            biller_code: billerCode,
            item_code: itemCode,
            customer,
            country: details?.country || "NG",
            details: {
              ...details,
              paymentPin: undefined,
              pin: undefined,
            },
            idempotency_key: idempotencyKey,
          };
        }

        if (!functionName) {
          throw new Error("Invalid transaction type.");
        }

        console.log("Executing authorized transaction:", {
          functionName,
          transactionType: resolvedTransactionType,
          amount,
          idempotencyKey,
          service: isBill ? details?.service : undefined,
        });

        const { data, error } = await supabase.functions.invoke(
          functionName,
          { body },
        );

        if (error) {
          console.error("Transaction function error:", {
            functionName,
            error,
          });
          throw new Error("TRANSACTION_TECHNICAL_ERROR");
        }

        if (!data) {
          console.error("Transaction returned no data:", {
            functionName,
          });
          throw new Error("TRANSACTION_TECHNICAL_ERROR");
        }

        const response = data as TransactionResult;

        console.log("Transaction provider/function response:", response);

        if (
          response.success === false &&
          !response.status &&
          !response.data?.status
        ) {
          console.error(
            "Transaction returned an unsuccessful response:",
            response,
          );

          if (mountedRef.current) {
            setResult(response);
            setStatus("failed");
            setErrorMessage(
              safeCustomerFailure(response.error ?? response.message),
            );
            setSubmitting(false);
          }

          return;
        }

        let finalResponse = response;
        let finalStatus = normalizeStatus(response);

        if (isBank && finalStatus === "pending") {
          const existingTransactionId =
            response.transaction_id ||
            response.transactionId ||
            response.data?.transaction_id ||
            "";

          finalResponse = await checkBankTransferStatus(
            existingTransactionId,
            response,
          );

          if (!mountedRef.current) return;

          finalStatus = normalizeStatus(finalResponse);
        }

        if (!mountedRef.current) return;

        setResult(finalResponse);
        setStatus(finalStatus);
        setSubmitting(false);

        if (
          finalStatus === "success" ||
          finalStatus === "pending"
        ) return;

        setErrorMessage(
          safeCustomerFailure(
            finalResponse.error ?? finalResponse.message,
          ),
        );
      } catch (error: any) {
        console.error("Transaction processing error:", error);

        if (!mountedRef.current) return;

        setResult(null);
        setStatus("failed");
        setSubmitting(false);

        const rawSafe =
          error?.message === "TRANSACTION_TECHNICAL_ERROR"
            ? ""
            : getFunctionErrorMessage(error, "");

        setErrorMessage(safeCustomerFailure(rawSafe));

        toast({
          title: isBill
            ? `${billServiceName} Failed`
            : "Transfer Failed",
          description: safeCustomerFailure(rawSafe),
          variant: "destructive",
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
      toast,
      checkBankTransferStatus,
    ],
  );

  useEffect(() => {
    if (!hasTransactionPayload) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (executionStartedRef.current) return;

    void executeTransaction();
  }, [executeTransaction, hasTransactionPayload, navigate]);

  const handleRetry = async () => {
    if (retrying) return;

    setRetrying(true);
    executionStartedRef.current = false;

    try {
      await executeTransaction(true);
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
        description: "Transaction reference copied to your clipboard.",
      });

      window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 1800);
    } catch {
      toast({
        title: "Unable to copy",
        description: "Please copy the reference manually.",
        variant: "destructive",
      });
    }
  };

  const statusConfig = status === null
    ? {
        eyebrow: "PLEASE WAIT",
        title: "Please wait",
        description:
          "Your transaction is being confirmed securely.",
      }
    : status === "success"
      ? {
          eyebrow: "TRANSACTION COMPLETE",
          title: isBill
            ? `${billServiceName} Successful`
            : "Transfer Successful",
          description: isBill
            ? `Your ${billServiceName.toLowerCase()} payment was completed successfully.`
            : "Your transfer was completed successfully.",
        }
      : status === "pending"
        ? {
            eyebrow: "AWAITING CONFIRMATION",
            title: isBill
              ? `${billServiceName} Pending`
              : "Transfer Pending",
            description: isBill
              ? `Your ${billServiceName.toLowerCase()} payment is awaiting final confirmation.`
              : "Your transfer is awaiting final confirmation.",
          }
        : {
            eyebrow: "TRANSACTION UNSUCCESSFUL",
            title: isBill
              ? `${billServiceName} Failed`
              : "Transfer Failed",
            description: isBill
              ? `We could not complete your ${billServiceName.toLowerCase()} payment.`
              : "We could not complete your transfer.",
          };

  const renderStatusIcon = () => {
    if (status === null) {
      return (
        <div className="relative flex h-[88px] w-[88px] items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[#F4B400]" />
          <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[#082A63] shadow-lg shadow-[#082A63]/20">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        </div>
      );
    }

    if (status === "success") {
      return (
        <div className="relative flex h-[88px] w-[88px] items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-50" />
          <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/20">
            <Check className="h-7 w-7 text-white" strokeWidth={3} />
          </div>
        </div>
      );
    }

    if (status === "pending") {
      return (
        <div className="relative flex h-[88px] w-[88px] items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-amber-50" />
          <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/20">
            <Clock3 className="h-7 w-7 text-white" />
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex h-[88px] w-[88px] items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-red-50" />
        <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/20">
          <XCircle className="h-7 w-7 text-white" />
        </div>
      </div>
    );
  };

  if (!hasTransactionPayload) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F7F5FF] text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-[64px] items-center justify-between px-4">
          <button
            type="button"
            onClick={() => void onBack()}
            disabled={submitting || retrying}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#7026D9] to-[#4B35C8] text-white">
              {isBill
                ? <Receipt className="h-4 w-4" />
                : <Send className="h-4 w-4" />}
            </div>

            <div className="text-center">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
                IyanjuPay
              </p>
              <p className="max-w-[140px] truncate text-xs font-bold text-slate-900">
                {transactionName}
              </p>
            </div>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-4 py-3">
        <div className="mx-auto flex h-full w-full max-w-md flex-col">
          <section className="flex shrink-0 flex-col items-center text-center">
            <div className="mb-2">{renderStatusIcon()}</div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
              {status === null
                ? <Loader2 className="h-2.5 w-2.5 animate-spin text-[#082A63]" />
                : status === "success"
                  ? <Sparkles className="h-2.5 w-2.5 text-[#F4B400]" />
                  : status === "pending"
                    ? <Clock3 className="h-2.5 w-2.5 text-amber-500" />
                    : <XCircle className="h-2.5 w-2.5 text-red-500" />}

              <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                {statusConfig.eyebrow}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {statusConfig.title}
            </h1>

            <p className="mt-0.5 max-w-[310px] text-[11px] leading-4 text-slate-500">
              {statusConfig.description}
            </p>

            {status !== "failed" && (
              <div className="mt-2">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Amount
                </p>
                <p
                  className="text-[30px] font-black tracking-tight"
                  style={{ color: PURPLE }}
                >
                  {formatNaira(amount)}
                </p>
              </div>
            )}
          </section>

          <section className="mt-4 min-h-0 shrink rounded-[24px] border border-[#E9E2FA] bg-white shadow-[0_12px_35px_rgba(76,44,150,0.08)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6B35D4]/[0.09]">
                  <Receipt className="h-3.5 w-3.5" style={{ color: PURPLE }} />
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-900">
                    Transaction Details
                  </p>
                  <p className="text-[8px] text-slate-400">
                    Secure transaction summary
                  </p>
                </div>
              </div>

              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            </div>

            <div className="px-3.5">
              {isBill ? (
                <CompactBillIdentity
                  service={billServiceName}
                  customer={billCustomer}
                  customerLabel={billCustomerLabel}
                  packageName={billPackage}
                />
              ) : (
                <CompactTransferIdentity
                  recipient={recipient}
                  bank={bank}
                  accountNumber={accountNumber}
                  isBank={isBank}
                />
              )}

              <div className="border-t border-dashed border-slate-200">
                {isBill ? (
                  <>
                    <CompactSummaryRow
                      label="Service"
                      value={billServiceName}
                    />
                    {billCustomer && (
                      <CompactSummaryRow
                        label={billCustomerLabel}
                        value={billCustomer}
                      />
                    )}
                    {billPackage && (
                      <CompactSummaryRow
                        label="Package"
                        value={billPackage}
                      />
                    )}
                  </>
                ) : (
                  <CompactSummaryRow
                    label="Recipient"
                    value={recipient}
                  />
                )}

                {isBank && bank && (
                  <CompactSummaryRow label="Bank" value={bank} />
                )}

                {isBank && accountNumber && (
                  <CompactSummaryRow
                    label="Account"
                    value={maskAccountNumber(accountNumber)}
                  />
                )}

                <CompactSummaryRow
                  label="Amount"
                  value={formatNaira(amount)}
                  strong
                  last
                />
              </div>
            </div>
          </section>

          {status === "success" && reference && (
            <section className="mt-2.5 shrink-0 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-emerald-600">
                    Reference
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-slate-700">
                    {reference}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyReference}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[9px] font-bold text-slate-600 shadow-sm ring-1 ring-emerald-100 transition hover:text-[#082A63]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {status === "pending" && (
            <section className="mt-2.5 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Clock3 className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-amber-950">
                    Awaiting confirmation
                  </p>
                  <p className="mt-0.5 text-[9px] leading-3.5 text-amber-800">
                    Please don't submit this {isBill ? "payment" : "transfer"} again.
                  </p>
                </div>
              </div>
            </section>
          )}

          {status === "failed" && (
            <section className="mt-2.5 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-red-950">
                    Transaction failed
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-[9px] leading-3.5 text-red-800">
                    {errorMessage || SAFE_FAILED}
                  </p>
                </div>
              </div>
            </section>
          )}

          {submitting && (
            <div className="mt-2.5 flex shrink-0 items-center justify-center gap-1.5 text-center">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <p className="text-[8px] font-semibold text-slate-400">
                Your transaction is securely protected
              </p>
            </div>
          )}

          {!submitting && status !== null && (
            <div className="mt-auto shrink-0 pt-2.5">
              {status === "failed" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onBack()}
                    disabled={retrying}
                    className="h-11 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700"
                  >
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    Back
                  </Button>

                  <Button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="h-11 rounded-xl bg-gradient-to-r from-[#7026D9] to-[#4B35C8] text-xs font-bold text-white shadow-lg shadow-[#5B28C9]/20 hover:opacity-95"
                  >
                    {retrying ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Retrying
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Try Again
                      </>
                    )}
                  </Button>
                </div>
              ) : status === "success" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDownloadReceipt("image")}
                      disabled={downloading !== null}
                      className="h-11 rounded-xl border-[#D9D0F2] bg-white text-[11px] font-bold text-[#5B28C9] hover:bg-purple-50"
                    >
                      {downloading === "image" ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="mr-1.5 h-4 w-4" />
                      )}
                      {downloading === "image" ? "Preparing..." : "Download Image"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDownloadReceipt("pdf")}
                      disabled={downloading !== null}
                      className="h-11 rounded-xl border-[#D9D0F2] bg-white text-[11px] font-bold text-[#5B28C9] hover:bg-purple-50"
                    >
                      {downloading === "pdf" ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="mr-1.5 h-4 w-4" />
                      )}
                      {downloading === "pdf" ? "Preparing..." : "Download PDF"}
                    </Button>
                  </div>

                  <Button
                    type="button"
                    onClick={() => void onDone()}
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-[#7026D9] to-[#4B35C8] text-xs font-bold text-white shadow-lg shadow-[#5B28C9]/20 hover:opacity-95"
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Done
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => void onDone()}
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-[#7026D9] to-[#4B35C8] text-xs font-bold text-white shadow-lg shadow-[#5B28C9]/20 hover:opacity-95"
                >
                  Continue to Dashboard
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-center justify-center gap-1.5 pb-1 pt-2">
            <ShieldCheck className="h-2.5 w-2.5 text-emerald-500" />
            <span className="text-[7px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Securely processed by IyanjuPay
            </span>
          </div>
        </div>
      </main>

      {/* Dedicated receipt: hidden in the app and visible only when printing. */}
      {status === "success" && (
        <div
          id="iyanjupay-print-receipt"
          className="hidden print:block"
        >
          <div className="mx-auto w-full max-w-[700px] bg-white p-8 font-sans text-slate-900">
            <div className="border-b-2 border-[#082A63] pb-5 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#082A63] text-xl font-black text-white">
                IP
              </div>

              <h1 className="text-2xl font-black tracking-tight text-[#082A63]">
                IyanjuPay
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Money, made effortless.
              </p>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Transaction Successful
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {isBill ? billServiceName : "Transfer"} Receipt
              </p>

              <p className="mt-2 text-3xl font-black text-[#082A63]">
                {formatNaira(amount)}
              </p>
            </div>

            <div className="mt-7">
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-[#082A63]">
                Transaction Details
              </h2>

              <div className="space-y-0">
                {getReceiptRows().map((row, index) => (
                  <ReceiptPrintRow
                    key={`${row.label}-${index}`}
                    label={row.label}
                    value={row.value}
                    strong={row.strong}
                  />
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-dashed border-slate-300 pt-5 text-center">
              <p className="text-sm font-bold text-[#082A63]">
                Thank you for using IyanjuPay.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Simple. Secure. Seamless.
              </p>
              <p className="mt-4 text-[10px] text-slate-400">
                This receipt is your transaction confirmation.
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }

          html,
          body {
            background: #ffffff !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden !important;
          }

          #iyanjupay-print-receipt,
          #iyanjupay-print-receipt * {
            visibility: visible !important;
          }

          #iyanjupay-print-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #111827 !important;
            z-index: 999999 !important;
          }

          #iyanjupay-print-receipt .text-slate-500 {
            color: #64748b !important;
          }

          #iyanjupay-print-receipt .text-slate-400 {
            color: #94a3b8 !important;
          }

          #iyanjupay-print-receipt .text-emerald-700 {
            color: #047857 !important;
          }

          #iyanjupay-print-receipt .bg-emerald-50 {
            background: #ecfdf5 !important;
          }

          #iyanjupay-print-receipt .bg-\\[\\#082A63\\] {
            background: #082A63 !important;
          }

          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};

export default TransactionProcessingPage;
