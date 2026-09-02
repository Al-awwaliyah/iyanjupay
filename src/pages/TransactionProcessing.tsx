import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock3,
  Loader2,
  RefreshCw,
  Send,
  Receipt,
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

// ============================================================
// PROPS
// ============================================================

interface TransactionProcessingPageProps {
  /**
   * New unified transaction type.
   *
   * Preferred:
   *
   * "iyanjupay"
   * "bank"
   * "bill"
   */
  transactionType?: TransactionType;

  /**
   * Kept temporarily so the existing Dashboard
   * transfer flow does not break while we migrate it.
   *
   * This can be removed after Dashboard is updated.
   */
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

// ============================================================
// RESULT
// ============================================================

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
// COMPONENT
// ============================================================

/**
 * ============================================================
 * TRANSACTION PROCESSING PAGE
 * ============================================================
 *
 * This page executes an already PIN-authorized transaction.
 *
 * Transfer:
 *
 * Review
 *   ↓
 * Payment PIN
 *   ↓
 * THIS PAGE
 *   ↓
 * Transfer Edge Function
 *
 * Bill:
 *
 * Review
 *   ↓
 * Payment PIN
 *   ↓
 * THIS PAGE
 *   ↓
 * flutterwave-bills
 *
 * IMPORTANT:
 *
 * This page does NOT collect or verify the Payment PIN.
 *
 * PIN authorization happens before this page.
 *
 * BANK TRANSFER CONFIRMATION:
 *
 * If Flutterwave initially returns NEW / PENDING /
 * QUEUED, the page waits 5 seconds before deciding
 * whether to display Pending.
 *
 * During those 5 seconds, the page remains on the
 * Processing screen.
 *
 * After 5 seconds, the existing transaction record
 * is checked.
 */
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
  // RESOLVE TRANSACTION TYPE
  // ==========================================================

  /**
   * Prefer the new transactionType.
   *
   * Fall back to transferType temporarily so
   * existing transfer callers continue working.
   */
  const resolvedTransactionType: TransactionType =
    transactionType ??
    transferType ??
    "bank";

  const isBill =
    resolvedTransactionType === "bill";

  const isIyanjuPay =
    resolvedTransactionType ===
    "iyanjupay";

  const isBank =
    resolvedTransactionType === "bank";

  // ==========================================================
  // STATE
  // ==========================================================

  const [status, setStatus] =
    useState<TransactionStatus>(
      "processing"
    );

  const [result, setResult] =
    useState<TransactionResult | null>(
      null
    );

  const [errorMessage, setErrorMessage] =
    useState("");

  const [retrying, setRetrying] =
    useState(false);

  // ==========================================================
  // DUPLICATE EXECUTION PROTECTION
  // ==========================================================

  const executionStartedRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
          typeof error.context
            .json === "function"
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
        // Keep original message.
      }

      return message;
    };

  // ==========================================================
  // DISPLAY NAMES
  // ==========================================================

  const getBillServiceName =
    (): string => {
      const service =
        String(
          details?.service ??
            details?.type ??
            ""
        ).toLowerCase();

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
    };

  const billServiceName =
    getBillServiceName();

  const transactionName =
    isBill
      ? billServiceName
      : "Transfer";

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

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // PENDING
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // FAILED
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SUCCESS BOOLEAN
    // --------------------------------------------------------

    if (
      response?.success === true
    ) {
      return "success";
    }

    // --------------------------------------------------------
    // FAILURE BOOLEAN
    // --------------------------------------------------------

    if (
      response?.success === false
    ) {
      return "failed";
    }

    // --------------------------------------------------------
    // UNKNOWN
    // --------------------------------------------------------

    /*
     * Never falsely display success.
     *
     * If the backend did not provide a definitive
     * status, treat it as pending.
     */
    return "pending";
  };

  // ==========================================================
  // CHECK BANK TRANSFER STATUS AFTER 5 SECONDS
  // ==========================================================
  //
  // Flutterwave may initially return NEW / PENDING /
  // QUEUED even when the transfer completes shortly
  // afterwards.
  //
  // We therefore wait 5 seconds before deciding whether
  // to display Pending.
  //
  // IMPORTANT:
  //
  // This function does NOT call flutterwave-transfer again.
  //
  // It only checks the existing transaction record.
  // ==========================================================

  const checkBankTransferStatus =
    useCallback(
      async (
        transactionId: string,
        initialResponse: TransactionResult
      ): Promise<TransactionResult> => {
        /*
         * Wait exactly 6 seconds.
         */
        await new Promise<void>(
          (resolve) => {
            setTimeout(
              resolve,
              8000
            );
          }
        );

        /*
         * Component may have been unmounted
         * while waiting.
         */
        if (!mountedRef.current) {
          return initialResponse;
        }

        /*
         * Without a transaction ID we cannot
         * safely check the transaction.
         */
        if (!transactionId) {
          console.warn(
            "Bank transfer status check skipped: transaction ID missing."
          );

          return initialResponse;
        }

        try {
          console.log(
            "Checking bank transfer status after 5 seconds:",
            transactionId
          );

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
              transactionId
            )
            .maybeSingle();

          if (error) {
            console.error(
              "Bank transfer status check failed:",
              error
            );

            /*
             * Never falsely display success.
             *
             * If the database check fails,
             * retain the original provider response.
             */
            return initialResponse;
          }

          if (!transaction) {
            console.warn(
              "Bank transfer transaction was not found:",
              transactionId
            );

            return initialResponse;
          }

          /*
           * Preserve the original Flutterwave response
           * while overriding the status with the latest
           * transaction status from our database.
           */
          const databaseResponse:
            TransactionResult = {
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
                ...(initialResponse.data ||
                  {}),

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

          console.log(
            "Bank transfer status after 5-second check:",
            databaseResponse
          );

          return databaseResponse;
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
        // ----------------------------------------------------
        // DUPLICATE PROTECTION
        // ----------------------------------------------------

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

              /*
               * Keep account_name for compatibility
               * with existing callers.
               */
              account_name:
                details?.recipient,

              /*
               * IMPORTANT:
               *
               * flutterwave-transfer expects
               * beneficiary_name.
               *
               * This fixes:
               *
               * "Beneficiary name is required."
               */
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

            /*
             * IMPORTANT:
             *
             * The Payment PIN is deliberately NOT
             * included anywhere in this request.
             *
             * PIN authorization has already happened.
             *
             * The backend must independently:
             *
             * - authenticate the user
             * - validate the bill
             * - calculate the real provider price
             * - enforce wallet balance
             * - debit the wallet safely
             * - call Flutterwave
             * - maintain idempotency
             */
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

                /*
                 * Explicitly prevent accidental PIN
                 * propagation if a caller ever attaches
                 * it to details.
                 */
                paymentPin:
                  undefined,

                pin:
                  undefined,
              },

              idempotency_key:
                idempotencyKey,
            };
          }

          // ==================================================
          // VALIDATE FUNCTION
          // ==================================================

          if (!functionName) {
            throw new Error(
              "Invalid transaction type."
            );
          }

          // ==================================================
          // LOG SAFE TRANSACTION INFORMATION
          // ==================================================

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

              biller_code:
                isBill
                  ? details?.biller_code
                  : undefined,

              item_code:
                isBill
                  ? details?.item_code
                  : undefined,

              /*
               * Do NOT log payment PIN.
               */
            }
          );

          // ==================================================
          // CALL EDGE FUNCTION
          // ==================================================

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

          // ==================================================
          // RESPONSE LOG
          // ==================================================

          console.log(
            "Transaction Edge Function response:",
            data
          );

          // ==================================================
          // FUNCTION ERROR
          // ==================================================

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

          // ==================================================
          // EMPTY RESPONSE
          // ==================================================

          if (!data) {
            throw new Error(
              `No response was received from the ${transactionName.toLowerCase()} service.`
            );
          }

          // ==================================================
          // NORMALIZED RESPONSE
          // ==================================================

          const response =
            data as TransactionResult;

          // ==================================================
          // EXPLICIT BACKEND ERROR
          // ==================================================

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

          // ==================================================
          // DETERMINE INITIAL STATUS
          // ==================================================

          let finalResponse =
            response;

          let normalizedStatus =
            normalizeStatus(
              response
            );

          // ==================================================
          // BANK TRANSFER 5-SECOND CONFIRMATION
          // ==================================================
          //
          // If Flutterwave says NEW/PENDING/QUEUED,
          // remain on Processing for 5 seconds.
          //
          // Then check the existing transaction.
          //
          // No second transfer is created.
          // ==================================================

          if (
            isBank &&
            normalizedStatus ===
              "pending"
          ) {
            console.log(
              "Flutterwave bank transfer is pending."
            );

            console.log(
              "Waiting 5 seconds before displaying final status..."
            );

            /*
             * Keep the Processing screen visible
             * during the 5-second confirmation period.
             */
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

            /*
             * Get the existing transaction ID.
             */
            const existingTransactionId =
              response.transaction_id ||
              response.transactionId ||
              response.data
                ?.transaction_id ||
              "";

            /*
             * Wait 5 seconds and then check
             * the existing transaction.
             */
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

            /*
             * Recalculate the status using the
             * latest database information.
             */
            normalizedStatus =
              normalizeStatus(
                finalResponse
              );

            console.log(
              "Bank transfer final status after 5 seconds:",
              normalizedStatus
            );
          }

          // ==================================================
          // COMPONENT STILL MOUNTED
          // ==================================================

          if (
            !mountedRef.current
          ) {
            return;
          }

          // ==================================================
          // SAVE FINAL RESULT
          // ==================================================

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
                `₦${amount.toLocaleString(
                  "en-NG"
                )} ${
                  isBill
                    ? `${billServiceName.toLowerCase()} payment`
                    : "transfer"
                } completed successfully.`,
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
                `Your ${
                  isBill
                    ? billServiceName.toLowerCase()
                    : "transfer"
                } has been submitted and is awaiting final confirmation.`,
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
       * IMPORTANT:
       *
       * Reuse the SAME idempotency key.
       *
       * Never create a new key for retry.
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
  // DISPLAY HELPERS
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
  // TRANSFER DISPLAY
  // ==========================================================

  const recipient =
    details?.recipient ||
    details?.recipientName ||
    result?.recipient_name ||
    result?.data?.recipient_name ||
    "Recipient";

  const bank =
    details?.bank ||
    "";

  const accountNumber =
    details?.accountNumber ||
    "";

  // ==========================================================
  // BILL DISPLAY
  // ==========================================================

  const billProvider =
    details?.provider ||
    details?.biller?.name ||
    details?.biller?.short_name ||
    result?.provider ||
    result?.data?.provider ||
    "Provider";

  const billCustomer =
    details?.customer ||
    "";

  const billPackage =
    details?.item?.name ||
    details?.item?.short_name ||
    details?.packageName ||
    "";

  const billCustomerLabel =
    details?.customerLabel ||
    (
      details?.service ===
        "airtime" ||
      details?.service ===
        "data"
        ? "Phone Number"
        : details?.service ===
            "electricity"
          ? "Meter Number"
          : details?.service ===
              "cable"
            ? "Smart Card / Decoder"
            : details?.service ===
                "internet"
              ? "Account Number"
              : "Customer"
    );

  // ==========================================================
  // PAGE TITLE
  // ==========================================================

  const processingTitle =
    isBill
      ? `Processing ${billServiceName}`
      : "Processing Transfer";

  const successTitle =
    isBill
      ? `${billServiceName} Successful`
      : "Transfer Successful";

  const pendingTitle =
    isBill
      ? `${billServiceName} Pending`
      : "Transfer Pending";

  const failedTitle =
    isBill
      ? `${billServiceName} Failed`
      : "Transfer Failed";

  // ==========================================================
  // PROCESSING UI
  // ==========================================================

  if (
    status === "processing"
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <div className="flex items-center gap-2">

                {isBill ? (
                  <Receipt className="h-5 w-5" />
                ) : (
                  <Send className="h-5 w-5" />
                )}

                <h1 className="text-lg sm:text-xl font-bold">
                  {processingTitle}
                </h1>

              </div>

            </div>

          </div>

        </header>

        <main className="max-w-2xl mx-auto px-4 py-10">

          <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 text-center">

            <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-5">

              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />

            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              {processingTitle}
            </h2>

            <p className="text-gray-600 mt-2">
              Please wait while we securely process your{" "}
              {isBill
                ? `${billServiceName.toLowerCase()} payment`
                : "transfer"}.
            </p>

            <p className="text-sm text-gray-500 mt-5">
              Do not close this page or submit the transaction again.
            </p>

            <div className="mt-7 rounded-xl bg-gray-50 border p-4 text-left space-y-3">

              {isBill ? (
                <>
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Service
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {billServiceName}
                    </span>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Provider
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {billProvider}
                    </span>

                  </div>

                  {billCustomer && (
                    <div className="flex justify-between gap-4">

                      <span className="text-gray-500">
                        {billCustomerLabel}
                      </span>

                      <span className="font-semibold text-gray-900 text-right break-all">
                        {billCustomer}
                      </span>

                    </div>
                  )}

                  {billPackage && (
                    <div className="flex justify-between gap-4">

                      <span className="text-gray-500">
                        Package
                      </span>

                      <span className="font-semibold text-gray-900 text-right">
                        {billPackage}
                      </span>

                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Recipient
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {recipient}
                    </span>

                  </div>

                  {isBank && (
                    <>
                      <div className="flex justify-between gap-4">

                        <span className="text-gray-500">
                          Bank
                        </span>

                        <span className="font-semibold text-gray-900 text-right">
                          {bank}
                        </span>

                      </div>

                      <div className="flex justify-between gap-4">

                        <span className="text-gray-500">
                          Account
                        </span>

                        <span className="font-semibold text-gray-900">
                          {accountNumber}
                        </span>

                      </div>
                    </>
                  )}
                </>
              )}

              <div className="border-t pt-3 flex justify-between gap-4">

                <span className="font-semibold">
                  Amount
                </span>

                <span className="font-bold text-green-700">
                  ₦
                  {amount.toLocaleString(
                    "en-NG",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </span>

              </div>

            </div>

          </div>

        </main>
      </div>
    );
  }

  // ==========================================================
  // SUCCESS UI
  // ==========================================================

  if (
    status === "success"
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50">

        <header className="bg-gradient-to-r from-green-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <div className="flex items-center gap-2">

                <CheckCircle2 className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  {successTitle}
                </h1>

              </div>

            </div>

          </div>

        </header>

        <main className="max-w-2xl mx-auto px-4 py-10">

          <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8">

            <div className="text-center">

              <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">

                <CheckCircle2 className="h-11 w-11 text-green-600" />

              </div>

              <h2 className="text-2xl font-bold text-gray-900">
                {successTitle}
              </h2>

              <p className="text-gray-600 mt-2">
                Your{" "}
                {isBill
                  ? `${billServiceName.toLowerCase()} payment`
                  : "transfer"}{" "}
                has been completed successfully.
              </p>

              <p className="text-4xl font-bold text-green-700 mt-6">
                ₦
                {amount.toLocaleString(
                  "en-NG",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </p>

            </div>

            <div className="mt-8 rounded-xl bg-gray-50 border p-4 space-y-4">

              {isBill ? (
                <>
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Service
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {billServiceName}
                    </span>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Provider
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {billProvider}
                    </span>

                  </div>

                  {billCustomer && (
                    <div className="flex justify-between gap-4">

                      <span className="text-gray-500">
                        {billCustomerLabel}
                      </span>

                      <span className="font-semibold text-gray-900 text-right break-all">
                        {billCustomer}
                      </span>

                    </div>
                  )}

                  {billPackage && (
                    <div className="flex justify-between gap-4">

                      <span className="text-gray-500">
                        Package
                      </span>

                      <span className="font-semibold text-gray-900 text-right">
                        {billPackage}
                      </span>

                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Recipient
                    </span>

                    <span className="font-semibold text-gray-900 text-right">
                      {recipient}
                    </span>

                  </div>

                  {isBank && (
                    <>
                      <div className="flex justify-between gap-4">

                        <span className="text-gray-500">
                          Bank
                        </span>

                        <span className="font-semibold text-gray-900 text-right">
                          {bank}
                        </span>

                      </div>

                      <div className="flex justify-between gap-4">

                        <span className="text-gray-500">
                          Account
                        </span>

                        <span className="font-semibold text-gray-900">
                          {accountNumber}
                        </span>

                      </div>
                    </>
                  )}
                </>
              )}

              {reference && (
                <div className="border-t pt-4 flex justify-between gap-4">

                  <span className="text-gray-500">
                    Reference
                  </span>

                  <span className="font-mono text-sm font-semibold text-gray-900 text-right break-all">
                    {reference}
                  </span>

                </div>
              )}

              {transactionId && (
                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Transaction ID
                  </span>

                  <span className="font-mono text-xs text-gray-700 text-right break-all">
                    {transactionId}
                  </span>

                </div>
              )}

            </div>

            <Button
              type="button"
              onClick={() =>
                void onDone()
              }
              className="w-full h-12 mt-7 bg-green-600 hover:bg-green-700 text-base font-semibold"
            >
              Done
            </Button>

          </div>

        </main>

      </div>
    );
  }

  // ==========================================================
  // PENDING UI
  // ==========================================================

  if (
    status === "pending"
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-blue-50 to-indigo-50">

        <header className="bg-gradient-to-r from-yellow-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <div className="flex items-center gap-2">

                <Clock3 className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  {pendingTitle}
                </h1>

              </div>

            </div>

          </div>

        </header>

        <main className="max-w-2xl mx-auto px-4 py-10">

          <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8">

            <div className="text-center">

              <div className="mx-auto w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mb-5">

                <Clock3 className="h-11 w-11 text-yellow-600" />

              </div>

              <h2 className="text-2xl font-bold text-gray-900">
                {pendingTitle}
              </h2>

              <p className="text-gray-600 mt-2">
                Your{" "}
                {isBill
                  ? `${billServiceName.toLowerCase()} payment`
                  : "transfer"}{" "}
                has been submitted but is still awaiting final confirmation.
              </p>

              <p className="text-4xl font-bold text-gray-900 mt-6">
                ₦
                {amount.toLocaleString(
                  "en-NG",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </p>

            </div>

            <div className="mt-8 rounded-xl bg-yellow-50 border border-yellow-200 p-4">

              <p className="text-sm text-yellow-800">

                Please do not submit the same{" "}
                {isBill
                  ? "payment"
                  : "transfer"}{" "}
                again. The existing transaction is being processed using the same transaction reference.

              </p>

            </div>

            {reference && (
              <div className="mt-5 rounded-xl bg-gray-50 border p-4">

                <p className="text-xs text-gray-500">
                  Transaction Reference
                </p>

                <p className="font-mono text-sm font-semibold text-gray-900 mt-1 break-all">
                  {reference}
                </p>

              </div>
            )}

            <Button
              type="button"
              onClick={() =>
                void onDone()
              }
              className="w-full h-12 mt-7 bg-green-600 hover:bg-green-700 text-base font-semibold"
            >
              Done
            </Button>

          </div>

        </main>

      </div>
    );
  }

  // ==========================================================
  // FAILED UI
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-blue-50 to-indigo-50">

      <header className="bg-gradient-to-r from-red-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <div className="flex items-center h-16">

            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void onBack()
              }
              className="text-white hover:bg-white/20 mr-2"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-2">

              <XCircle className="h-5 w-5" />

              <h1 className="text-lg sm:text-xl font-bold">
                {failedTitle}
              </h1>

            </div>

          </div>

        </div>

      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">

        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8">

          <div className="text-center">

            <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-5">

              <XCircle className="h-11 w-11 text-red-600" />

            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              {failedTitle}
            </h2>

            <p className="text-gray-600 mt-2">
              We could not complete this{" "}
              {isBill
                ? `${billServiceName.toLowerCase()} payment`
                : "transfer"}.
            </p>

          </div>

          <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4">

            <p className="text-sm font-medium text-red-800">
              {errorMessage ||
                `The ${isBill ? billServiceName.toLowerCase() : "transfer"} could not be completed.`}
            </p>

          </div>

          <div className="mt-5 rounded-xl bg-gray-50 border p-4 space-y-3">

            {isBill ? (
              <>
                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Service
                  </span>

                  <span className="font-semibold text-gray-900 text-right">
                    {billServiceName}
                  </span>

                </div>

                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Provider
                  </span>

                  <span className="font-semibold text-gray-900 text-right">
                    {billProvider}
                  </span>

                </div>

                {billCustomer && (
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      {billCustomerLabel}
                    </span>

                    <span className="font-semibold text-gray-900 text-right break-all">
                      {billCustomer}
                    </span>

                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Recipient
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {recipient}
                </span>

              </div>
            )}

            <div className="flex justify-between gap-4">

              <span className="text-gray-500">
                Amount
              </span>

              <span className="font-bold text-gray-900">
                ₦
                {amount.toLocaleString(
                  "en-NG",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </span>

            </div>

            {reference && (
              <div className="border-t pt-3 flex justify-between gap-4">

                <span className="text-gray-500">
                  Reference
                </span>

                <span className="font-mono text-xs text-gray-700 text-right break-all">
                  {reference}
                </span>

              </div>
            )}

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7">

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void onBack()
              }
              className="h-12"
              disabled={retrying}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <Button
              type="button"
              onClick={
                handleRetry
              }
              disabled={retrying}
              className="h-12 bg-green-600 hover:bg-green-700"
            >
              {retrying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </>
              )}
            </Button>

          </div>

        </div>

      </main>

    </div>
  );
};

export default TransactionProcessingPage;
