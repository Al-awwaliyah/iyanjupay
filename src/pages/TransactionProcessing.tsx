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
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";

type TransferType =
  | "iyanjupay"
  | "bank";

type TransactionStatus =
  | "processing"
  | "success"
  | "pending"
  | "failed";

interface TransactionProcessingPageProps {
  transferType: TransferType;

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

interface TransferResult {
  success?: boolean;

  status?: string;

  message?: string;

  error?: string;

  reference?: string;

  transaction_id?: string;

  transactionId?: string;

  transfer_id?: string;

  transferId?: string;

  credit_transaction_id?: string;

  amount?: number;

  fee?: number;

  total_charged?: number;

  recipient_name?: string;

  recipient_wallet_id?: string;

  data?: any;
}

/**
 * ============================================================
 * TRANSACTION PROCESSING PAGE
 * ============================================================
 *
 * This page is responsible for EXECUTING the already
 * PIN-authorized transfer.
 *
 * SendMoneyPage:
 *
 * Recipient
 *    ↓
 * Amount
 *    ↓
 * Review
 *    ↓
 * Payment PIN
 *    ↓
 * THIS PAGE
 *    ↓
 * Edge Function
 *    ↓
 * Success / Pending / Failed
 *
 * Important:
 *
 * PaymentPinModal has already authorized the transaction
 * before this page is reached.
 *
 * This page therefore does NOT ask for the PIN again.
 */
const TransactionProcessingPage = ({
  transferType,
  amount,
  details,
  idempotencyKey,
  onDone,
  onBack,
}: TransactionProcessingPageProps) => {
  const { toast } = useToast();

  const [status, setStatus] =
    useState<TransactionStatus>(
      "processing"
    );

  const [result, setResult] =
    useState<TransferResult | null>(
      null
    );

  const [errorMessage, setErrorMessage] =
    useState("");

  const [retrying, setRetrying] =
    useState(false);

  /*
   * Prevent duplicate execution caused by:
   *
   * - React re-render
   * - StrictMode
   * - multiple callbacks
   * - accidental double click
   */
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
  // EXTRACT ERROR MESSAGE
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
        // Keep original error.
      }

      return message;
    };

  // ==========================================================
  // NORMALIZE STATUS
  // ==========================================================

  const normalizeStatus = (
    response: TransferResult
  ): TransactionStatus => {
    const rawStatus =
      String(
        response?.status ||
          response?.data?.status ||
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
      ].includes(rawStatus)
    ) {
      return "failed";
    }

    /*
     * Existing IyanjuPay function uses
     * success: true for successful transfers.
     */
    if (
      response?.success === true
    ) {
      return "success";
    }

    if (
      response?.success === false
    ) {
      return "failed";
    }

    /*
     * If the Edge Function returned without
     * a clear status, treat it as pending rather
     * than falsely telling the user the transfer
     * succeeded.
     */
    return "pending";
  };

  // ==========================================================
  // EXECUTE TRANSFER
  // ==========================================================

  const executeTransfer =
    useCallback(
      async (
        allowDuplicateGuard = false
      ) => {
        /*
         * Duplicate protection.
         */
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
          // IYANJUPAY
          // ==================================================

          if (
            transferType ===
            "iyanjupay"
          ) {
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
          // BANK
          // ==================================================

          if (
            transferType === "bank"
          ) {
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

              narration:
                details?.narration ||
                "Bank transfer",

              idempotency_key:
                idempotencyKey,
            };
          }

          if (!functionName) {
            throw new Error(
              "Invalid transfer type."
            );
          }

          console.log(
            "Executing authorized transfer:",
            {
              functionName,
              transferType,
              amount,
              idempotencyKey,
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

          console.log(
            "Transfer Edge Function response:",
            data
          );

          if (error) {
            const message =
              await extractFunctionError(
                error,
                "Unable to process this transfer."
              );

            throw new Error(message);
          }

          /*
           * The Edge Function must return an object.
           */
          if (!data) {
            throw new Error(
              "No response was received from the transfer service."
            );
          }

          /*
           * Some Supabase functions return:
           *
           * {
           *   success: true,
           *   ...
           * }
           *
           * Others may return:
           *
           * {
           *   success: true,
           *   data: {...}
           * }
           *
           * Preserve the complete response.
           */
          const response =
            data as TransferResult;

          /*
           * Explicit backend error.
           */
          if (
            response.success ===
              false &&
            !response.status
          ) {
            throw new Error(
              response.error ||
                response.message ||
                "Transfer failed."
            );
          }

          const normalizedStatus =
            normalizeStatus(
              response
            );

          if (
            !mountedRef.current
          ) {
            return;
          }

          setResult(response);
          setStatus(
            normalizedStatus
          );

          if (
            normalizedStatus ===
            "success"
          ) {
            toast({
              title:
                "Transfer Successful",
              description:
                response.message ||
                `₦${amount.toLocaleString(
                  "en-NG"
                )} transfer completed successfully.`,
            });

            return;
          }

          if (
            normalizedStatus ===
            "pending"
          ) {
            toast({
              title:
                "Transfer Pending",
              description:
                response.message ||
                "Your transfer has been submitted and is awaiting final confirmation.",
            });

            return;
          }

          /*
           * Failed status returned normally
           * by backend.
           */
          setErrorMessage(
            response.error ||
              response.message ||
              "The transfer could not be completed."
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

          setErrorMessage(
            error?.message ||
              "Unable to complete this transfer."
          );

          toast({
            title:
              "Transfer Failed",
            description:
              error?.message ||
              "Unable to complete this transfer.",
            variant:
              "destructive",
          });
        }
      },
      [
        amount,
        details,
        idempotencyKey,
        toast,
        transferType,
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

    void executeTransfer();
  }, [executeTransfer]);

  // ==========================================================
  // RETRY
  // ==========================================================

  const handleRetry = async () => {
    /*
     * VERY IMPORTANT:
     *
     * Do NOT generate a new idempotency key
     * during retry.
     *
     * Reusing the same key protects against
     * accidentally charging the wallet twice
     * if the first request actually reached
     * the backend but the frontend timed out.
     */
    if (retrying) {
      return;
    }

    setRetrying(true);

    /*
     * Permit one retry execution.
     */
    executionStartedRef.current =
      false;

    try {
      await executeTransfer();
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
    result?.data?.transaction_id ||
    result?.data?.transfer_id ||
    "";

  const transactionId =
    result?.transaction_id ||
    result?.transactionId ||
    result?.data?.transaction_id ||
    result?.credit_transaction_id ||
    "";

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
                <Send className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Transaction Processing
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
              Processing Transfer
            </h2>

            <p className="text-gray-600 mt-2">
              Please wait while we securely process your transfer.
            </p>

            <p className="text-sm text-gray-500 mt-5">
              Do not close this page or submit the transfer again.
            </p>

            <div className="mt-7 rounded-xl bg-gray-50 border p-4 text-left space-y-3">

              <div className="flex justify-between gap-4">
                <span className="text-gray-500">
                  Recipient
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {recipient}
                </span>
              </div>

              {transferType ===
                "bank" && (
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

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50">

        <header className="bg-gradient-to-r from-green-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Transfer Successful
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
                Transfer Successful
              </h2>

              <p className="text-gray-600 mt-2">
                Your transfer has been completed successfully.
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

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Recipient
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {recipient}
                </span>

              </div>

              {transferType ===
                "bank" && (
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

  if (status === "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-blue-50 to-indigo-50">

        <header className="bg-gradient-to-r from-yellow-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Transfer Pending
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
                Transfer Pending
              </h2>

              <p className="text-gray-600 mt-2">
                Your transfer has been submitted but is still awaiting final confirmation.
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
                Please do not submit the same transfer again. The existing transaction is being processed using the same transaction reference.
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
                Transfer Failed
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
              Transfer Failed
            </h2>

            <p className="text-gray-600 mt-2">
              We could not complete this transfer.
            </p>

          </div>

          <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4">

            <p className="text-sm font-medium text-red-800">
              {errorMessage ||
                "The transfer could not be completed."}
            </p>

          </div>

          <div className="mt-5 rounded-xl bg-gray-50 border p-4 space-y-3">

            <div className="flex justify-between gap-4">

              <span className="text-gray-500">
                Recipient
              </span>

              <span className="font-semibold text-gray-900 text-right">
                {recipient}
              </span>

            </div>

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
