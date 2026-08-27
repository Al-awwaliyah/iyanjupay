import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wifi,
  Zap,
  Tv,
  Globe,
  Receipt,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";

import PaymentPinModal from "@/components/wallet/PaymentPinModal";
import TransactionProcessingPage from "@/pages/TransactionProcessing";

// ============================================================
// TYPES
// ============================================================

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

interface ServiceInfo {
  title: string;
  type: BillService;
}

interface ServicePaymentProps {
  service: ServiceInfo | null;

  walletBalance: number;

  onBack: () => void;

  /*
   * Kept for compatibility with the existing parent.
   *
   * TransactionProcessingPage now performs the actual
   * transaction, so this callback is no longer used to
   * execute the payment.
   */
  onPurchase: (
    amount: number,
    details: any
  ) => Promise<void> | void;
}

// ============================================================
// CATALOGUE TYPES
// ============================================================

interface Biller {
  id?: string;
  code?: string;
  name?: string;
  short_name?: string;
  category?: string;
  service?: string;
  [key: string]: any;
}

interface BillItem {
  id?: string;
  code?: string;
  item_code?: string;
  name?: string;
  short_name?: string;
  amount?: number;
  price?: number;
  variation_amount?: number;
  biller_code?: string;
  [key: string]: any;
}

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  const { toast } = useToast();

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    service?.type ?? "airtime";

  const serviceTitle =
    service?.title ??
    "Bill Payment";

  // ==========================================================
  // CATALOGUE
  // ==========================================================

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<BillItem[]>([]);

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [catalogueError, setCatalogueError] =
    useState("");

  // ==========================================================
  // FORM
  // ==========================================================

  const [selectedBillerCode, setSelectedBillerCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [amountInput, setAmountInput] =
    useState("");

  // ==========================================================
  // REVIEW
  // ==========================================================

  const [showReview, setShowReview] =
    useState(false);

  const [reviewDetails, setReviewDetails] =
    useState<any>(null);

  // ==========================================================
  // PIN
  // ==========================================================

  const [showPinModal, setShowPinModal] =
    useState(false);

  // ==========================================================
  // PROCESSING
  // ==========================================================

  const [processingDetails, setProcessingDetails] =
    useState<any>(null);

  const [processingAmount, setProcessingAmount] =
    useState<number | null>(null);

  const [processingIdempotencyKey, setProcessingIdempotencyKey] =
    useState("");

  // ==========================================================
  // LOAD BILLERS
  // ==========================================================

  const loadBillers =
    useCallback(
      async () => {
        if (!serviceType) {
          return;
        }

        setLoadingBillers(true);
        setCatalogueError("");

        try {
          const {
            data,
            error,
          } = await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action: "billers",
                service: serviceType,
                country: "NG",
              },
            }
          );

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "No biller response was received."
            );
          }

          const response =
            data as any;

          if (
            response.success === false
          ) {
            throw new Error(
              response.error ||
                response.message ||
                "Unable to load billers."
            );
          }

          const list =
            response.billers ??
            response.data?.billers ??
            response.data ??
            [];

          setBillers(
            Array.isArray(list)
              ? list
              : []
          );
        } catch (error: any) {
          console.error(
            "Failed to load billers:",
            error
          );

          setCatalogueError(
            error?.message ||
              "Unable to load available providers."
          );

          setBillers([]);
        } finally {
          setLoadingBillers(false);
        }
      },
      [serviceType]
    );

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems =
    useCallback(
      async () => {
        if (
          !selectedBillerCode ||
          serviceType === "airtime"
        ) {
          setItems([]);
          return;
        }

        setLoadingItems(true);
        setCatalogueError("");

        try {
          const {
            data,
            error,
          } = await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action: "items",
                service: serviceType,
                biller_code:
                  selectedBillerCode,
                country: "NG",
              },
            }
          );

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "No package response was received."
            );
          }

          const response =
            data as any;

          if (
            response.success === false
          ) {
            throw new Error(
              response.error ||
                response.message ||
                "Unable to load packages."
            );
          }

          const list =
            response.items ??
            response.data?.items ??
            response.data ??
            [];

          setItems(
            Array.isArray(list)
              ? list
              : []
          );
        } catch (error: any) {
          console.error(
            "Failed to load bill items:",
            error
          );

          setCatalogueError(
            error?.message ||
              "Unable to load available packages."
          );

          setItems([]);
        } finally {
          setLoadingItems(false);
        }
      },
      [
        selectedBillerCode,
        serviceType,
      ]
    );

  // ==========================================================
  // INITIAL BILLERS
  // ==========================================================

  useEffect(() => {
    void loadBillers();
  }, [loadBillers]);

  // ==========================================================
  // BILLER CHANGE
  // ==========================================================

  useEffect(() => {
    setSelectedItemCode("");
    setItems([]);

    if (
      selectedBillerCode &&
      serviceType !== "airtime"
    ) {
      void loadItems();
    }
  }, [
    selectedBillerCode,
    serviceType,
    loadItems,
  ]);

  // ==========================================================
  // RESET WHEN SERVICE CHANGES
  // ==========================================================

  useEffect(() => {
    setSelectedBillerCode("");
    setSelectedItemCode("");
    setCustomer("");
    setAmountInput("");
    setItems([]);
    setBillers([]);
    setShowReview(false);
    setReviewDetails(null);
    setProcessingDetails(null);
    setProcessingAmount(null);
    setProcessingIdempotencyKey("");
  }, [serviceType]);

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            String(
              biller.code ??
                biller.id ??
                ""
            ) ===
            selectedBillerCode
        ),
      [
        billers,
        selectedBillerCode,
      ]
    );

  // ==========================================================
  // SELECTED ITEM
  // ==========================================================

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (item) =>
            String(
              item.item_code ??
                item.code ??
                item.id ??
                ""
            ) ===
            selectedItemCode
        ),
      [
        items,
        selectedItemCode,
      ]
    );

  // ==========================================================
  // SERVICE ICON
  // ==========================================================

  const ServiceIcon =
    serviceType === "airtime"
      ? Smartphone
      : serviceType === "data"
        ? Wifi
        : serviceType === "electricity"
          ? Zap
          : serviceType === "cable"
            ? Tv
            : Globe;

  // ==========================================================
  // CUSTOMER LABEL
  // ==========================================================

  const customerLabel =
    serviceType === "airtime" ||
    serviceType === "data"
      ? "Phone Number"
      : serviceType === "electricity"
        ? "Meter Number"
        : serviceType === "cable"
          ? "Smart Card / Decoder Number"
          : serviceType === "internet"
            ? "Account Number"
            : "Customer";

  // ==========================================================
  // CUSTOMER PLACEHOLDER
  // ==========================================================

  const customerPlaceholder =
    serviceType === "airtime" ||
    serviceType === "data"
      ? "08012345678"
      : serviceType === "electricity"
        ? "Enter meter number"
        : serviceType === "cable"
          ? "Enter smart card number"
          : serviceType === "internet"
            ? "Enter account number"
            : "Enter customer number";

  // ==========================================================
  // PROVIDER NAME
  // ==========================================================

  const providerName =
    selectedBiller?.name ||
    selectedBiller?.short_name ||
    "Provider";

  // ==========================================================
  // PACKAGE NAME
  // ==========================================================

  const packageName =
    selectedItem?.name ||
    selectedItem?.short_name ||
    "";

  // ==========================================================
  // PROVIDER PRICE
  // ==========================================================

  const providerPrice =
    Number(
      selectedItem?.variation_amount ??
        selectedItem?.amount ??
        selectedItem?.price ??
        0
    );

  // ==========================================================
  // AMOUNT
  // ==========================================================

  /*
   * Data:
   *
   * Provider price + ₦50 IyanjuPay markup.
   *
   * Other services:
   *
   * User-entered amount.
   */

  const providerAmount =
    serviceType === "data"
      ? providerPrice
      : Number(
          amountInput.replace(
            /,/g,
            ""
          )
        );

  const markup =
    serviceType === "data"
      ? 50
      : 0;

  const finalAmount =
    providerAmount + markup;

  // ==========================================================
  // FORM VALIDATION
  // ==========================================================

  const validateForm =
    (): string | null => {
      if (
        !serviceType
      ) {
        return "Please select a service.";
      }

      if (
        !selectedBillerCode
      ) {
        return "Please select a provider.";
      }

      if (
        serviceType !== "airtime" &&
        !selectedItemCode
      ) {
        return "Please select a package.";
      }

      if (!customer.trim()) {
        return `${customerLabel} is required.`;
      }

      if (
        (
          serviceType === "airtime" ||
          serviceType === "data"
        ) &&
        !/^0\d{10}$/.test(
          customer.trim()
        )
      ) {
        return "Enter a valid 11-digit Nigerian phone number.";
      }

      if (
        (
          serviceType === "electricity" ||
          serviceType === "cable" ||
          serviceType === "internet"
        ) &&
        customer.trim().length < 4
      ) {
        return `Enter a valid ${customerLabel.toLowerCase()}.`;
      }

      if (
        !Number.isFinite(
          finalAmount
        ) ||
        finalAmount <= 0
      ) {
        return "Enter a valid payment amount.";
      }

      if (
        finalAmount >
        walletBalance
      ) {
        return "Insufficient wallet balance.";
      }

      return null;
    };

  // ==========================================================
  // OPEN REVIEW
  // ==========================================================

  const handleContinue =
    () => {
      const validationError =
        validateForm();

      if (validationError) {
        toast({
          title: "Invalid payment",
          description:
            validationError,
          variant:
            "destructive",
        });

        return;
      }

      const details = {
        service:
          serviceType,

        type:
          serviceType,

        biller_code:
          selectedBillerCode,

        billerCode:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        itemCode:
          selectedItemCode,

        customer:
          customer.trim(),

        customerLabel,

        provider:
          providerName,

        biller:
          selectedBiller,

        item:
          selectedItem,

        packageName:
          packageName,

        providerAmount,

        markup,

        country:
          "NG",
      };

      setReviewDetails(
        details
      );

      setShowReview(true);
    };

  // ==========================================================
  // AUTHORIZE PAYMENT
  // ==========================================================

  const handleAuthorize =
    () => {
      if (
        !reviewDetails ||
        !finalAmount
      ) {
        return;
      }

      /*
       * PIN verification is handled by
       * PaymentPinModal.
       *
       * TransactionProcessingPage receives
       * the transaction only after PIN
       * authorization succeeds.
       */
      setShowPinModal(true);
    };

  // ==========================================================
  // PIN VERIFIED
  // ==========================================================

  const handlePinVerified =
    () => {
      setShowPinModal(false);

      if (
        !reviewDetails ||
        !finalAmount
      ) {
        return;
      }

      /*
       * Generate ONE idempotency key.
       *
       * This same key is retained throughout
       * the transaction processing lifecycle.
       */
      const idempotencyKey =
        crypto.randomUUID();

      setProcessingDetails(
        reviewDetails
      );

      setProcessingAmount(
        finalAmount
      );

      setProcessingIdempotencyKey(
        idempotencyKey
      );
    };

  // ==========================================================
  // PROCESSING PAGE
  // ==========================================================

  if (
    processingDetails &&
    processingAmount !== null &&
    processingIdempotencyKey
  ) {
    return (
      <TransactionProcessingPage
        transactionType="bill"
        amount={
          processingAmount
        }
        details={
          processingDetails
        }
        idempotencyKey={
          processingIdempotencyKey
        }
        onDone={
          async () => {
            /*
             * Keep parent compatibility.
             *
             * The actual transaction has already
             * been executed by TransactionProcessingPage.
             */
            setProcessingDetails(
              null
            );

            setProcessingAmount(
              null
            );

            setProcessingIdempotencyKey(
              ""
            );

            setReviewDetails(
              null
            );

            setShowReview(
              false
            );

            await onPurchase(
              processingAmount,
              processingDetails
            );
          }
        }
        onBack={
          () => {
            setProcessingDetails(
              null
            );

            setProcessingAmount(
              null
            );

            setProcessingIdempotencyKey(
              ""
            );
          }
        }
      />
    );
  }

  // ==========================================================
  // PIN MODAL
  // ==========================================================

  if (
    showPinModal
  ) {
    return (
      <PaymentPinModal
        open={true}
        onClose={() =>
          setShowPinModal(false)
        }
        onSuccess={
          handlePinVerified
        }
        amount={
          finalAmount
        }
      />
    );
  }

  // ==========================================================
  // REVIEW PAGE
  // ==========================================================

  if (
    showReview &&
    reviewDetails
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        <header className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md">

          <div className="max-w-3xl mx-auto px-4 sm:px-6">

            <div className="flex items-center h-16">

              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setShowReview(false)
                }
                className="text-white hover:bg-white/20 mr-2"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back
              </Button>

              <div className="flex items-center gap-2">

                <Receipt className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Review Payment
                </h1>

              </div>

            </div>

          </div>

        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">

          <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8">

            <div className="text-center">

              <div className="mx-auto w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">

                <ServiceIcon className="h-8 w-8 text-purple-600" />

              </div>

              <h2 className="text-2xl font-bold text-gray-900">
                Confirm {serviceTitle}
              </h2>

              <p className="text-gray-500 mt-2">
                Review the payment details before authorization.
              </p>

            </div>

            <div className="mt-8 rounded-xl bg-gray-50 border p-4 space-y-4">

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Service
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {serviceTitle}
                </span>

              </div>

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  Provider
                </span>

                <span className="font-semibold text-gray-900 text-right">
                  {providerName}
                </span>

              </div>

              <div className="flex justify-between gap-4">

                <span className="text-gray-500">
                  {customerLabel}
                </span>

                <span className="font-semibold text-gray-900 text-right break-all">
                  {customer}
                </span>

              </div>

              {packageName && (
                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Package
                  </span>

                  <span className="font-semibold text-gray-900 text-right">
                    {packageName}
                  </span>

                </div>
              )}

              {serviceType === "data" && (
                <>
                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Provider Amount
                    </span>

                    <span className="font-semibold text-gray-900">
                      ₦
                      {providerAmount.toLocaleString(
                        "en-NG",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="text-gray-500">
                      Service Fee
                    </span>

                    <span className="font-semibold text-gray-900">
                      ₦50.00
                    </span>

                  </div>
                </>
              )}

              {serviceType !== "data" && (
                <div className="flex justify-between gap-4">

                  <span className="text-gray-500">
                    Amount
                  </span>

                  <span className="font-semibold text-gray-900">
                    ₦
                    {providerAmount.toLocaleString(
                      "en-NG",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </span>

                </div>
              )}

              <div className="border-t pt-4 flex justify-between gap-4">

                <span className="font-bold text-gray-900">
                  Total
                </span>

                <span className="text-xl font-bold text-green-700">
                  ₦
                  {finalAmount.toLocaleString(
                    "en-NG",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </span>

              </div>

            </div>

            <div className="mt-5 rounded-xl bg-blue-50 border border-blue-200 p-4">

              <div className="flex gap-3">

                <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />

                <p className="text-sm text-blue-800">
                  Your payment PIN will authorize this transaction.
                  The PIN is never sent to the bill-payment service.
                </p>

              </div>

            </div>

            <Button
              type="button"
              onClick={
                handleAuthorize
              }
              className="w-full h-12 mt-7 bg-green-600 hover:bg-green-700 text-base font-semibold"
            >
              <ShieldCheck className="h-5 w-5 mr-2" />
              Authorize Payment
            </Button>

          </div>

        </main>

      </div>
    );
  }

  // ==========================================================
  // PAYMENT FORM
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      <header className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md">

        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <div className="flex items-center h-16">

            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className="text-white hover:bg-white/20 mr-2"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-2">

              <ServiceIcon className="h-5 w-5" />

              <h1 className="text-lg sm:text-xl font-bold">
                {serviceTitle}
              </h1>

            </div>

          </div>

        </div>

      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8">

          <div className="text-center mb-7">

            <div className="mx-auto w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">

              <ServiceIcon className="h-8 w-8 text-purple-600" />

            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              {serviceTitle}
            </h2>

            <p className="text-gray-500 mt-1">
              Complete the details below.
            </p>

          </div>

          {catalogueError && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-200 p-4">

              <p className="text-sm text-red-700">
                {catalogueError}
              </p>

            </div>
          )}

          <div className="space-y-5">

            {/* PROVIDER */}

            <div className="space-y-2">

              <Label>
                Provider
              </Label>

              <Select
                value={
                  selectedBillerCode
                }
                onValueChange={
                  setSelectedBillerCode
                }
                disabled={
                  loadingBillers
                }
              >

                <SelectTrigger className="h-12">

                  <SelectValue
                    placeholder={
                      loadingBillers
                        ? "Loading providers..."
                        : "Select provider"
                    }
                  />

                </SelectTrigger>

                <SelectContent>

                  {billers.map(
                    (
                      biller,
                      index
                    ) => {

                      const code =
                        String(
                          biller.code ??
                            biller.id ??
                            index
                        );

                      return (
                        <SelectItem
                          key={code}
                          value={code}
                        >
                          {biller.name ??
                            biller.short_name ??
                            "Provider"}
                        </SelectItem>
                      );
                    }
                  )}

                </SelectContent>

              </Select>

            </div>

            {/* PACKAGE */}

            {serviceType !==
              "airtime" && (
              <div className="space-y-2">

                <Label>
                  Package
                </Label>

                <Select
                  value={
                    selectedItemCode
                  }
                  onValueChange={
                    setSelectedItemCode
                  }
                  disabled={
                    !selectedBillerCode ||
                    loadingItems
                  }
                >

                  <SelectTrigger className="h-12">

                    <SelectValue
                      placeholder={
                        !selectedBillerCode
                          ? "Select provider first"
                          : loadingItems
                            ? "Loading packages..."
                            : "Select package"
                      }
                    />

                  </SelectTrigger>

                  <SelectContent>

                    {items.map(
                      (
                        item,
                        index
                      ) => {

                        const code =
                          String(
                            item.item_code ??
                              item.code ??
                              item.id ??
                              index
                          );

                        const price =
                          Number(
                            item.variation_amount ??
                              item.amount ??
                              item.price ??
                              0
                          );

                        return (
                          <SelectItem
                            key={code}
                            value={code}
                          >
                            <div className="flex justify-between gap-5">

                              <span>
                                {item.name ??
                                  item.short_name ??
                                  "Package"}
                              </span>

                              {price >
                                0 && (
                                <span>
                                  ₦
                                  {price.toLocaleString(
                                    "en-NG"
                                  )}
                                </span>
                              )}

                            </div>
                          </SelectItem>
                        );
                      }
                    )}

                  </SelectContent>

                </Select>

              </div>
            )}

            {/* CUSTOMER */}

            <div className="space-y-2">

              <Label htmlFor="customer">
                {customerLabel}
              </Label>

              <Input
                id="customer"
                value={
                  customer
                }
                onChange={(event) =>
                  setCustomer(
                    event.target.value
                  )
                }
                placeholder={
                  customerPlaceholder
                }
                inputMode={
                  "numeric"
                }
                className="h-12"
              />

            </div>

            {/* AMOUNT */}

            {serviceType !==
              "data" && (
              <div className="space-y-2">

                <Label htmlFor="amount">
                  Amount
                </Label>

                <Input
                  id="amount"
                  value={
                    amountInput
                  }
                  onChange={(event) =>
                    setAmountInput(
                      event.target.value
                    )
                  }
                  placeholder="Enter amount"
                  inputMode="decimal"
                  className="h-12"
                />

              </div>
            )}

            {/* DATA PRICE */}

            {serviceType ===
              "data" &&
              selectedItem && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">

                  <div className="flex justify-between">

                    <span className="text-blue-700">
                      Package price
                    </span>

                    <span className="font-semibold text-blue-900">
                      ₦
                      {providerAmount.toLocaleString(
                        "en-NG",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>

                  </div>

                  <div className="flex justify-between mt-2">

                    <span className="text-blue-700">
                      Service fee
                    </span>

                    <span className="font-semibold text-blue-900">
                      ₦50.00
                    </span>

                  </div>

                  <div className="border-t border-blue-200 mt-3 pt-3 flex justify-between">

                    <span className="font-bold text-blue-900">
                      Total
                    </span>

                    <span className="font-bold text-green-700">
                      ₦
                      {finalAmount.toLocaleString(
                        "en-NG",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>

                  </div>

                </div>
              )}

            {/* WALLET BALANCE */}

            <div className="rounded-xl bg-gray-50 border p-4">

              <div className="flex justify-between">

                <span className="text-gray-500">
                  Wallet balance
                </span>

                <span className="font-semibold text-gray-900">
                  ₦
                  {walletBalance.toLocaleString(
                    "en-NG",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </span>

              </div>

            </div>

            <Button
              type="button"
              onClick={
                handleContinue
              }
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-base font-semibold"
            >
              Continue
            </Button>

          </div>

        </div>

      </main>

    </div>
  );
};

export default ServicePayment;
