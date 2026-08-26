import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Clock3,
  Loader2,
  ArrowLeft,
  ReceiptText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { supabase } from "@/integrations/supabase/client";

type TransactionStatus =
  | "processing"
  | "pending"
  | "successful"
  | "failed";

type TransactionState = {
  transaction_id?: string;
  reference?: string;
  status?: string;
  amount?: number;
  total_charged?: number;
  service?: string;
  beneficiary_name?: string;
  account_number?: string;
  account_bank?: string;
  message?: string;
  error?: string;
};

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 120000;

const normalizeStatus = (
  value: unknown
): TransactionStatus => {
  const status = String(value ?? "")
    .toLowerCase()
    .trim();

  if (
    status === "successful" ||
    status === "success" ||
    status === "completed" ||
    status === "complete"
  ) {
    return "successful";
  }

  if (
    status === "failed" ||
    status === "failure" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "failed";
  }

  if (
    status === "pending" ||
    status === "queued" ||
    status === "processing" ||
    status === "new"
  ) {
    return "pending";
  }

  return "processing";
};

const formatNaira = (
  amount: number | undefined
) => {
  if (
    typeof amount !== "number" ||
    Number.isNaN(amount)
  ) {
    return "₦0.00";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
};

const TransactionProcessing = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialState =
    (location.state as TransactionState | null) ??
    null;

  const [
    transaction,
    setTransaction,
  ] = useState<TransactionState>(
    initialState ?? {}
  );

  const [
    status,
    setStatus,
  ] = useState<TransactionStatus>(
    normalizeStatus(
      initialState?.status
    )
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState(
    initialState?.error ??
      initialState?.message ??
      ""
  );

  const [
    elapsed,
    setElapsed,
  ] = useState(0);

  const pollingRef =
    useRef(false);

  const transactionId =
    transaction.transaction_id;

  /*
   * ============================================================
   * REDIRECT IF TRANSACTION DATA IS MISSING
   * ============================================================
   */

  useEffect(() => {
    if (!transactionId) {
      navigate(
        "/dashboard",
        {
          replace: true,
        }
      );
    }
  }, [
    transactionId,
    navigate,
  ]);

  /*
   * ============================================================
   * POLLING TIMER
   * ============================================================
   */

  useEffect(() => {
    if (
      status === "successful" ||
      status === "failed"
    ) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setElapsed(
          current => current + 1000
        );
      }, 1000);

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [status]);

  /*
   * ============================================================
   * TRANSACTION STATUS
   *
   * The processing page checks the database transaction.
   *
   * The Flutterwave webhook remains the authority that updates
   * the final transaction state.
   * ============================================================
   */

  useEffect(() => {
    if (!transactionId) {
      return;
    }

    if (
      status === "successful" ||
      status === "failed"
    ) {
      return;
    }

    if (pollingRef.current) {
      return;
    }

    pollingRef.current = true;

    let cancelled = false;

    const checkStatus =
      async () => {
        try {
          const {
            data,
            error,
          } =
            await supabase
              .from("transactions")
              .select(
                `
                  id,
                  reference_number,
                  status,
                  amount,
                  metadata
                `
              )
              .eq(
                "id",
                transactionId
              )
              .maybeSingle();

          if (
            cancelled
          ) {
            return;
          }

          if (error) {
            console.error(
              "Transaction status lookup error:",
              error
            );

            return;
          }

          if (!data) {
            return;
          }

          const metadata =
            (
              data.metadata ??
              {}
            ) as Record<
              string,
              unknown
            >;

          const normalized =
            normalizeStatus(
              data.status
            );

          setTransaction(
            current => ({
              ...current,

              transaction_id:
                data.id,

              reference:
                data.reference_number,

              status:
                data.status,

              amount:
                Number(
                  metadata.transfer_amount ??
                    metadata.amount ??
                    data.amount ??
                    current.amount ??
                    0
                ),

              total_charged:
                Number(
                  metadata.total_charged ??
                    metadata.totalCharged ??
                    data.amount ??
                    current.total_charged ??
                    0
                ),

              service:
                String(
                  metadata.service ??
                    metadata.service_type ??
                    current.service ??
                    "Transaction"
                ),

              beneficiary_name:
                String(
                  metadata.beneficiary_name ??
                    metadata.customer_name ??
                    current.beneficiary_name ??
                    ""
                ),

              account_number:
                String(
                  metadata.account_number ??
                    current.account_number ??
                    ""
                ),

              account_bank:
                String(
                  metadata.account_bank ??
                    current.account_bank ??
                    ""
                ),

              message:
                String(
                  metadata.message ??
                    current.message ??
                    ""
                ),

              error:
                String(
                  metadata.error ??
                    current.error ??
                    ""
                ),
            })
          );

          setStatus(
            normalized
          );

          if (
            normalized ===
            "failed"
          ) {
            setErrorMessage(
              String(
                metadata.error ??
                  metadata.message ??
                  "The transaction could not be completed."
              )
            );
          }

          if (
            normalized ===
            "successful"
          ) {
            setErrorMessage("");
          }
        } catch (error) {
          console.error(
            "Transaction status polling error:",
            error
          );
        }
      };

    checkStatus();

    const interval =
      window.setInterval(
        checkStatus,
        POLL_INTERVAL
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        interval
      );

      pollingRef.current =
        false;
    };
  }, [
    transactionId,
    status,
  ]);

  /*
   * ============================================================
   * SAFETY TIMEOUT
   *
   * We never falsely say "failed" simply because polling took
   * longer than expected.
   *
   * The user remains in pending state.
   * ============================================================
   */

  useEffect(() => {
    if (
      elapsed <
      MAX_POLL_TIME
    ) {
      return;
    }

    if (
      status === "processing"
    ) {
      setStatus("pending");
    }
  }, [
    elapsed,
    status,
  ]);

  /*
   * ============================================================
   * DONE
   * ============================================================
   */

  const handleDone =
    () => {
      navigate(
        "/dashboard",
        {
          replace: true,
        }
      );
    };

  /*
   * ============================================================
   * STATUS CONTENT
   * ============================================================
   */

  const renderStatusIcon =
    () => {
      if (
        status ===
        "successful"
      ) {
        return (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
          </div>
        );
      }

      if (
        status ===
        "failed"
      ) {
        return (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-14 w-14 text-red-600" />
          </div>
        );
      }

      if (
        status ===
        "pending"
      ) {
        return (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-amber-100">
            <Clock3 className="h-14 w-14 text-amber-600" />
          </div>
        );
      }

      return (
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
          <Loader2 className="h-14 w-14 animate-spin text-blue-600" />
        </div>
      );
    };

  const getTitle =
    () => {
      switch (status) {
        case "successful":
          return "Transaction Successful";

        case "pending":
          return "Transaction Pending";

        case "failed":
          return "Transaction Failed";

        default:
          return "Processing Transaction";
      }
    };

  const getDescription =
    () => {
      switch (status) {
        case "successful":
          return (
            "Your transaction was completed successfully."
          );

        case "pending":
          return (
            "Your transaction is still being processed. Please wait for the final status."
          );

        case "failed":
          return (
            errorMessage ||
            "Your transaction could not be completed."
          );

        default:
          return (
            "Please wait while we process your transaction."
          );
      }
    };

  const title =
    getTitle();

  const description =
    getDescription();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 px-4 py-8">

      <div className="mx-auto max-w-md">

        <Button
          variant="ghost"
          onClick={handleDone}
          className="mb-6 text-purple-600"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </Button>

        <Card className="overflow-hidden shadow-xl">

          <CardHeader className="text-center">

            <div className="mb-5">
              {renderStatusIcon()}
            </div>

            <CardTitle className="text-2xl">
              {title}
            </CardTitle>

            <p className="mt-2 text-sm text-gray-600">
              {description}
            </p>

          </CardHeader>

          <CardContent className="space-y-5">

            {status ===
              "processing" && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-center">

                <div className="flex items-center justify-center gap-2 text-sm font-medium text-blue-800">

                  <Loader2 className="h-4 w-4 animate-spin" />

                  Processing your transaction...

                </div>

                <p className="mt-2 text-xs text-blue-700">
                  Please do not close the app.
                </p>

              </div>
            )}

            {status ===
              "pending" && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-center">

                <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">

                  <Clock3 className="h-4 w-4" />

                  Awaiting final confirmation

                </div>

                <p className="mt-2 text-xs text-amber-700">
                  Flutterwave is still processing this transaction.
                </p>

              </div>
            )}

            {status ===
              "failed" && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-4">

                <p className="text-sm font-medium text-red-800">
                  Transaction failed
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {errorMessage ||
                    "The transaction could not be completed."}
                </p>

              </div>
            )}

            {status ===
              "successful" && (
              <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-center">

                <p className="text-sm font-medium text-green-800">
                  Transaction completed successfully.
                </p>

              </div>
            )}

            <div className="rounded-xl border bg-white">

              <div className="flex items-center gap-3 border-b p-4">

                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                  <ReceiptText className="h-5 w-5 text-purple-600" />
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Transaction
                  </p>

                  <p className="font-semibold text-gray-900">
                    {transaction.service ||
                      "IyanjuPay Transaction"}
                  </p>
                </div>

              </div>

              <div className="space-y-3 p-4">

                {transaction.amount !==
                  undefined && (
                  <div className="flex justify-between gap-4">

                    <span className="text-sm text-gray-500">
                      Amount
                    </span>

                    <span className="font-semibold">
                      {formatNaira(
                        transaction.amount
                      )}
                    </span>

                  </div>
                )}

                {transaction.total_charged !==
                  undefined && (
                  <div className="flex justify-between gap-4">

                    <span className="text-sm text-gray-500">
                      Total charged
                    </span>

                    <span className="font-semibold">
                      {formatNaira(
                        transaction.total_charged
                      )}
                    </span>

                  </div>
                )}

                {transaction.beneficiary_name && (
                  <div className="flex justify-between gap-4">

                    <span className="text-sm text-gray-500">
                      Recipient
                    </span>

                    <span className="max-w-[60%] text-right font-medium">
                      {
                        transaction.beneficiary_name
                      }
                    </span>

                  </div>
                )}

                {transaction.account_number && (
                  <div className="flex justify-between gap-4">

                    <span className="text-sm text-gray-500">
                      Account
                    </span>

                    <span className="font-medium">
                      {
                        transaction.account_number
                      }
                    </span>

                  </div>
                )}

                {transaction.reference && (
                  <div className="flex justify-between gap-4">

                    <span className="text-sm text-gray-500">
                      Reference
                    </span>

                    <span className="max-w-[60%] break-all text-right text-xs font-medium">
                      {
                        transaction.reference
                      }
                    </span>

                  </div>
                )}

              </div>

            </div>

            {(status ===
              "successful" ||
              status ===
                "pending" ||
              status ===
                "failed") && (
              <Button
                type="button"
                onClick={
                  handleDone
                }
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Done
              </Button>
            )}

          </CardContent>

        </Card>

      </div>

    </div>
  );
};

export default TransactionProcessing;
