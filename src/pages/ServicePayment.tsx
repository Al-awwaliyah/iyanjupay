import React, {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Receipt,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import TransactionProcessingPage from "@/components/transactions/TransactionProcessingPage";

// ============================================================
// TYPES
// ============================================================

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

interface BillProvider {
  code?: string;
  name?: string;
  short_name?: string;
  biller_code?: string;
  [key: string]: any;
}

interface BillItem {
  code?: string;
  item_code?: string;
  name?: string;
  short_name?: string;
  amount?: number;
  price?: number;
  [key: string]: any;
}

interface ServicePaymentProps {
  service: BillService | string;

  provider?: BillProvider | null;

  item?: BillItem | null;

  amount: number;

  customer: string;

  customerLabel?: string;

  packageName?: string;

  country?: string;

  details?: Record<string, any>;

  onBack: () =>
    | Promise<void>
    | void;

  onDone?: () =>
    | Promise<void>
    | void;
}

// ============================================================
// PAYMENT PIN RESPONSE
// ============================================================

interface PinVerificationResponse {
  success?: boolean;
  verified?: boolean;
  valid?: boolean;
  message?: string;
  error?: string;
  [key: string]: any;
}

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  provider,
  item,
  amount,
  customer,
  customerLabel,
  packageName,
  country = "NG",
  details = {},
  onBack,
  onDone,
}: ServicePaymentProps) => {
  // ==========================================================
  // STATE
  // ==========================================================

  const [showPin, setShowPin] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [pinError, setPinError] =
    useState("");

  const [showProcessing, setShowProcessing] =
    useState(false);

  const [idempotencyKey, setIdempotencyKey] =
    useState("");

  // ==========================================================
  // NORMALIZED VALUES
  // ==========================================================

  const normalizedService =
    String(service || "")
      .trim()
      .toLowerCase() as BillService;

  const serviceName =
    useMemo(() => {
      switch (normalizedService) {
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
    }, [normalizedService]);

  const resolvedProviderCode =
    String(
      provider?.code ??
        provider?.biller_code ??
        ""
    ).trim();

  const resolvedProviderName =
    provider?.name ||
    provider?.short_name ||
    "Provider";

  const resolvedItemCode =
    String(
      item?.code ??
        item?.item_code ??
        ""
    ).trim();

  const resolvedPackageName =
    packageName ||
    item?.name ||
    item?.short_name ||
    "";

  const resolvedCustomerLabel =
    customerLabel ||
    (
      normalizedService === "airtime" ||
      normalizedService === "data"
        ? "Phone Number"
        : normalizedService ===
            "electricity"
          ? "Meter Number"
          : normalizedService ===
              "cable"
            ? "Smart Card / Decoder"
            : normalizedService ===
                "internet"
              ? "Account Number"
              : "Customer"
    );

  // ==========================================================
  // FORMAT MONEY
  // ==========================================================

  const formatAmount =
    useCallback(
      (value: number) =>
        `₦${Number(value || 0).toLocaleString(
          "en-NG",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )}`,
      []
    );

  // ==========================================================
  // CREATE IDEMPOTENCY KEY
  // ==========================================================

  const createIdempotencyKey =
    useCallback(() => {
      if (
        typeof crypto !==
          "undefined" &&
        typeof crypto.randomUUID ===
          "function"
      ) {
        return crypto.randomUUID();
      }

      return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
    }, []);

  // ==========================================================
  // OPEN PIN
  // ==========================================================

  const handleContinue =
    () => {
      setPinError("");
      setPaymentPin("");
      setShowPin(true);
    };

  // ==========================================================
  // CLOSE PIN
  // ==========================================================

  const handleClosePin =
    () => {
      if (verifyingPin) {
        return;
      }

      setShowPin(false);
      setPaymentPin("");
      setPinError("");
    };

  // ==========================================================
  // VERIFY PAYMENT PIN
  // ==========================================================
  //
  // IMPORTANT:
  //
  // ServicePayment does NOT:
  //
  // - create a PIN
  // - retrieve a PIN
  // - store a PIN
  // - send the PIN to flutterwave-bills
  //
  // It only verifies the PIN.
  //
  // After successful authorization, TransactionProcessingPage
  // executes the actual transaction.
  // ==========================================================

  const verifyPaymentPin =
    useCallback(
      async () => {
        if (verifyingPin) {
          return;
        }

        const pin =
          paymentPin.trim();

        if (!pin) {
          setPinError(
            "Payment PIN is required."
          );
          return;
        }

        /*
         * Keep this aligned with the existing
         * IyanjuPay Payment PIN format.
         */
        if (!/^\d{4}$/.test(pin)) {
          setPinError(
            "Enter your 4-digit Payment PIN."
          );
          return;
        }

        setVerifyingPin(true);
        setPinError("");

        try {
          /*
           * Existing PIN verification Edge Function.
           *
           * The PIN is used ONLY for authorization.
           *
           * It is never passed to TransactionProcessingPage
           * or flutterwave-bills.
           */
          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "verify-payment-pin",
              {
                body: {
                  pin,
                },
              }
            );

          if (error) {
            let message =
              error.message ||
              "Payment PIN verification failed.";

            try {
              if (
                error.context &&
                typeof error.context
                  .json === "function"
              ) {
                const payload =
                  await error.context.json();

                message =
                  payload?.error ||
                  payload?.message ||
                  message;
              }
            } catch {
              // Keep original message.
            }

            throw new Error(message);
          }

          const response =
            (data ||
              {}) as PinVerificationResponse;

          const verified =
            response.success === true ||
            response.verified === true ||
            response.valid === true;

          if (!verified) {
            throw new Error(
              response.error ||
                response.message ||
                "Incorrect Payment PIN."
            );
          }

          // ==================================================
          // PIN AUTHORIZED
          // ==================================================

          /*
           * Generate the transaction idempotency key ONLY
           * after successful PIN authorization.
           */
          const newIdempotencyKey =
            createIdempotencyKey();

          /*
           * Clear the PIN immediately.
           */
          setPaymentPin("");

          setShowPin(false);

          setIdempotencyKey(
            newIdempotencyKey
          );

          /*
           * Move to TransactionProcessingPage.
           *
           * The PIN is NOT passed.
           */
          setShowProcessing(true);
        } catch (error: any) {
          console.error(
            "Payment PIN verification error:",
            error
          );

          setPinError(
            error?.message ||
              "Unable to verify Payment PIN."
          );
        } finally {
          setVerifyingPin(false);
        }
      },
      [
        paymentPin,
        verifyingPin,
        createIdempotencyKey,
      ]
    );

  // ==========================================================
  // PROCESSING PAGE
  // ==========================================================

  if (showProcessing) {
    return (
      <TransactionProcessingPage
        transactionType="bill"

        amount={amount}

        idempotencyKey={
          idempotencyKey
        }

        details={{
          /*
           * Service information
           */
          service:
            normalizedService,

          type:
            normalizedService,

          /*
           * Provider
           */
          provider:
            resolvedProviderName,

          biller: provider,

          biller_code:
            resolvedProviderCode,

          billerCode:
            resolvedProviderCode,

          /*
           * Bill item
           */
          item,

          item_code:
            resolvedItemCode,

          itemCode:
            resolvedItemCode,

          packageName:
            resolvedPackageName,

          /*
           * Customer
           */
          customer,

          customerLabel:
            resolvedCustomerLabel,

          /*
           * Country
           */
          country,

          /*
           * Preserve additional
           * service-specific details.
           *
           * IMPORTANT:
           * Remove any PIN fields before
           * passing them forward.
           */
          ...details,

          paymentPin:
            undefined,

          pin:
            undefined,
        }}

        onDone={async () => {
          if (onDone) {
            await onDone();
            return;
          }

          await onBack();
        }}

        onBack={async () => {
          /*
           * Returning from processing is allowed only
           * through the parent flow.
           */
          await onBack();
        }}
      />
    );
  }

  // ==========================================================
  // PIN SCREEN
  // ==========================================================

  if (showPin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        {/* HEADER */}
        <header className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <Button
                type="button"
                variant="ghost"
                onClick={
                  handleClosePin
                }
                disabled={
                  verifyingPin
                }
                className="text-white hover:bg-white/20 mr-2"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back
              </Button>

              <div className="flex items-center gap-2">

                <ShieldCheck className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Confirm Payment
                </h1>

              </div>

            </div>

          </div>

        </header>

        {/* MAIN */}
        <main className="max-w-md mx-auto px-4 py-8">

          <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8">

            {/* ICON */}

            <div className="text-center">

              <div className="mx-auto w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mb-5">

                <ShieldCheck className="h-10 w-10 text-purple-600" />

              </div>

              <h2 className="text-2xl font-bold text-gray-900">
                Enter Payment PIN
              </h2>

              <p className="text-gray-600 mt-2">
                Enter your Payment PIN to authorize this{" "}
                {serviceName.toLowerCase()} payment.
              </p>

            </div>

            {/* PAYMENT SUMMARY */}

            <div className="mt-7 rounded-xl bg-gray-50 border p-4 space-y-3">

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Service
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {serviceName}
                </span>

              </div>

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Provider
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {resolvedProviderName}
                </span>

              </div>

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  {resolvedCustomerLabel}
                </span>

                <span className="font-semibold text-gray-900 text-right break-all">
                  {customer}
                </span>

              </div>

              {resolvedPackageName && (
                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Package
                  </span>

                  <span className="font-semibold text-gray-900 text-right">
                    {resolvedPackageName}
                  </span>

                </div>
              )}

              <div className="border-t pt-3 flex justify-between gap-4">

                <span className="font-semibold text-gray-900">
                  Amount
                </span>

                <span className="font-bold text-green-700">
                  {formatAmount(amount)}
                </span>

              </div>

            </div>

            {/* PIN */}

            <div className="mt-7">

              <label
                htmlFor="payment-pin"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Payment PIN
              </label>

              <input
                id="payment-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={paymentPin}
                onChange={(event) => {
                  const value =
                    event.target.value.replace(
                      /\D/g,
                      ""
                    );

                  setPaymentPin(
                    value
                  );

                  if (pinError) {
                    setPinError("");
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    void verifyPaymentPin();
                  }
                }}
                disabled={
                  verifyingPin
                }
                placeholder="••••"
                className="w-full h-14 rounded-xl border border-gray-300 bg-white px-4 text-center text-2xl tracking-[0.75em] font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-60"
              />

              {pinError && (
                <p className="mt-2 text-sm text-red-600">
                  {pinError}
                </p>
              )}

            </div>

            {/* SECURITY NOTICE */}

            <div className="mt-5 rounded-xl bg-blue-50 border border-blue-100 p-4">

              <div className="flex gap-3">

                <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />

                <p className="text-sm text-blue-800">
                  Your Payment PIN is used only to
                  authorize this transaction. It is
                  not sent to the bill-payment provider.
                </p>

              </div>

            </div>

            {/* BUTTONS */}

            <div className="grid grid-cols-1 gap-3 mt-7">

              <Button
                type="button"
                onClick={() =>
                  void verifyPaymentPin()
                }
                disabled={
                  verifyingPin ||
                  paymentPin.length !== 4
                }
                className="h-12 bg-purple-600 hover:bg-purple-700 text-base font-semibold"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5 mr-2" />
                    Authorize Payment
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={
                  handleClosePin
                }
                disabled={
                  verifyingPin
                }
                className="h-12"
              >
                Cancel
              </Button>

            </div>

          </div>

        </main>
      </div>
    );
  }

  // ==========================================================
  // REVIEW PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      {/* HEADER */}

      <header className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md">

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

              <Receipt className="h-5 w-5" />

              <h1 className="text-lg sm:text-xl font-bold">
                {serviceName}
              </h1>

            </div>

          </div>

        </div>

      </header>

      {/* MAIN */}

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

        <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8">

          {/* TITLE */}

          <div className="text-center">

            <div className="mx-auto w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">

              <Receipt className="h-8 w-8 text-purple-600" />

            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              Review Payment
            </h2>

            <p className="text-gray-600 mt-2">
              Confirm the details below before
              authorizing your payment.
            </p>

          </div>

          {/* DETAILS */}

          <div className="mt-8 rounded-xl bg-gray-50 border p-4 sm:p-5 space-y-4">

            {/* SERVICE */}

            <div className="flex justify-between gap-4">

              <span className="text-gray-500">
                Service
              </span>

              <span className="font-semibold text-gray-900 text-right">
                {serviceName}
              </span>

            </div>

            {/* PROVIDER */}

            <div className="flex justify-between gap-4">

              <span className="text-gray-500">
                Provider
              </span>

              <span className="font-semibold text-gray-900 text-right">
                {resolvedProviderName}
              </span>

            </div>

            {/* CUSTOMER */}

            <div className="flex justify-between gap-4">

              <span className="text-gray-500">
                {resolvedCustomerLabel}
              </span>

              <span className="font-semibold text-gray-900 text-right break-all">
                {customer}
              </span>

            </div>

            {/* PACKAGE */}

            {resolvedPackageName && (
              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Package
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {resolvedPackageName}
                </span>

              </div>
            )}

            {/* AMOUNT */}

            <div className="border-t pt-4 flex justify-between gap-4">

              <span className="font-semibold text-gray-900">
                Amount
              </span>

              <span className="text-2xl font-bold text-green-700">
                {formatAmount(amount)}
              </span>

            </div>

          </div>

          {/* SECURITY */}

          <div className="mt-5 rounded-xl bg-green-50 border border-green-100 p-4">

            <div className="flex gap-3">

              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />

              <div>

                <p className="font-medium text-green-900">
                  Secure payment
                </p>

                <p className="text-sm text-green-800 mt-1">
                  Your wallet will only be charged after
                  the transaction has been authorized and
                  validated.
                </p>

              </div>

            </div>

          </div>

          {/* CONTINUE */}

          <Button
            type="button"
            onClick={
              handleContinue
            }
            className="w-full h-12 mt-7 bg-purple-600 hover:bg-purple-700 text-base font-semibold"
          >
            Continue to Payment
            <ChevronRight className="h-5 w-5 ml-2" />
          </Button>

          {/* BACK */}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void onBack()
            }
            className="w-full h-12 mt-3"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

        </div>

      </main>
    </div>
  );
};

export default ServicePayment;
