import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

import {
  Loader2,
  RefreshCw,
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;

  service: {
    title: string;
    type: string;
  } | null;

  walletBalance: number;

  /**
   * The parent handles the actual payment.
   *
   * IMPORTANT:
   * This is Promise<void> so the modal waits for the
   * Flutterwave/Supabase payment process before closing.
   */
  onPurchase: (
    amount: number,
    details: any,
  ) => Promise<void>;
}

interface Biller {
  id?: number | string;
  name?: string;
  biller_code?: string;
  category?: string;
  country?: string;
  country_code?: string;
  logo?: string | null;
  description?: string;
  short_name?: string;
  [key: string]: any;
}

interface BillItem {
  id?: number | string;

  biller_code?: string;

  item_code?: string;

  name?: string;

  short_name?: string;

  biller_name?: string;

  amount?: number | string;

  minimum?: number | string;

  maximum?: number | string;

  fee?: number | string;

  label_name?: string;

  label_name_2?: string;

  is_airtime?: boolean;

  country?: string;

  [key: string]: any;
}

const SERVICE_CATEGORY_MAP: Record<
  string,
  string
> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

const ServiceModal = ({
  isOpen,
  onClose,
  service,
  walletBalance,
  onPurchase,
}: ServiceModalProps) => {
  // ============================================================
  // FORM STATE
  // ============================================================

  const [amount, setAmount] = useState("");

  const [customer, setCustomer] =
    useState("");

  // ============================================================
  // FLUTTERWAVE CATALOGUE
  // ============================================================

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<BillItem[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  // ============================================================
  // LOADING
  // ============================================================

  const [
    loadingBillers,
    setLoadingBillers,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [
    processingPayment,
    setProcessingPayment,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const { toast } =
    useToast();

  // ============================================================
  // SERVICE
  // ============================================================

  const serviceType =
    service?.type ?? "";

  const category = useMemo(
    () =>
      SERVICE_CATEGORY_MAP[
        serviceType
      ] ?? "",
    [serviceType],
  );

  // ============================================================
  // SELECTED BILLER
  // ============================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            String(
              biller.biller_code ?? "",
            ) ===
            selectedBillerCode,
        ) ?? null,
      [
        billers,
        selectedBillerCode,
      ],
    );

  // ============================================================
  // SELECTED ITEM
  // ============================================================

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (item) =>
            String(
              item.item_code ?? "",
            ) ===
            selectedItemCode,
        ) ?? null,
      [
        items,
        selectedItemCode,
      ],
    );

  // ============================================================
  // CUSTOMER LABEL
  // ============================================================

  const customerLabel =
    useMemo(() => {
      if (
        selectedItem?.label_name
      ) {
        return selectedItem.label_name;
      }

      switch (serviceType) {
        case "airtime":
        case "data":
          return "Phone Number";

        case "electricity":
          return "Meter Number";

        case "cable":
          return "Smart Card / Decoder Number";

        case "internet":
          return "Account Number";

        default:
          return "Customer ID";
      }
    }, [
      selectedItem,
      serviceType,
    ]);

  // ============================================================
  // CUSTOMER PLACEHOLDER
  // ============================================================

  const customerPlaceholder =
    useMemo(() => {
      switch (serviceType) {
        case "airtime":
        case "data":
          return "e.g. 08012345678";

        case "electricity":
          return "Enter meter number";

        case "cable":
          return "Enter smart card number";

        case "internet":
          return "Enter account number";

        default:
          return "Enter customer identifier";
      }
    }, [serviceType]);

  // ============================================================
  // RESET FORM
  // ============================================================

  const resetForm = () => {
    setAmount("");
    setCustomer("");

    setBillers([]);
    setItems([]);

    setSelectedBillerCode("");
    setSelectedItemCode("");

    setError("");

    setLoadingBillers(false);
    setLoadingItems(false);
    setProcessingPayment(false);
  };

  // ============================================================
  // RESET WHEN SERVICE CHANGES
  // ============================================================

  useEffect(() => {
    setAmount("");
    setCustomer("");

    setBillers([]);
    setItems([]);

    setSelectedBillerCode("");
    setSelectedItemCode("");

    setError("");

    setProcessingPayment(false);
  }, [serviceType]);

  // ============================================================
  // LOAD BILLERS
  // ============================================================

  const loadBillers = async () => {
    if (!category) {
      return;
    }

    setLoadingBillers(true);
    setError("");

    try {
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          "flutterwave-bills",
          {
            body: {
              action: "billers",
              category,
            },
          },
        );

      if (functionError) {
        console.error(
          "Billers function error:",
          functionError,
        );

        throw new Error(
          functionError.message ||
            "Unable to load bill providers.",
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Unable to load bill providers.",
        );
      }

      const loadedBillers =
        Array.isArray(
          data?.billers,
        )
          ? data.billers
          : [];

      setBillers(
        loadedBillers,
      );

      if (
        loadedBillers.length ===
        0
      ) {
        setError(
          "No providers are currently available for this service.",
        );
      }
    } catch (err: any) {
      console.error(
        "Failed to load billers:",
        err,
      );

      const message =
        err?.message ||
        "Unable to load bill providers.";

      setError(message);

      toast({
        title:
          "Unable to load providers",
        description:
          message,
        variant:
          "destructive",
      });
    } finally {
      setLoadingBillers(false);
    }
  };

  // ============================================================
  // LOAD BILLERS WHEN MODAL OPENS
  // ============================================================

  useEffect(() => {
    if (
      !isOpen ||
      !category
    ) {
      return;
    }

    loadBillers();
  }, [
    isOpen,
    category,
  ]);

  // ============================================================
  // LOAD BILL ITEMS
  // ============================================================

  const loadItems = async (
    billerCode: string,
  ) => {
    if (!billerCode) {
      return;
    }

    setLoadingItems(true);
    setError("");

    setItems([]);
    setSelectedItemCode("");
    setAmount("");

    try {
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          "flutterwave-bills",
          {
            body: {
              action: "items",
              biller_code:
                billerCode,
            },
          },
        );

      if (functionError) {
        console.error(
          "Bill items function error:",
          functionError,
        );

        throw new Error(
          functionError.message ||
            "Unable to load bill packages.",
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Unable to load bill packages.",
        );
      }

      const loadedItems =
        Array.isArray(
          data?.items,
        )
          ? data.items
          : [];

      setItems(
        loadedItems,
      );

      if (
        loadedItems.length ===
        0
      ) {
        setError(
          "No packages are currently available for this provider.",
        );
      }
    } catch (err: any) {
      console.error(
        "Failed to load bill items:",
        err,
      );

      const message =
        err?.message ||
        "Unable to load bill packages.";

      setError(message);

      toast({
        title:
          "Unable to load packages",
        description:
          message,
        variant:
          "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  // ============================================================
  // BILLER CHANGE
  // ============================================================

  const handleBillerChange =
    async (
      value: string,
    ) => {
      setSelectedBillerCode(
        value,
      );

      await loadItems(value);
    };

  // ============================================================
  // ITEM CHANGE
  // ============================================================

  const handleItemChange = (
    value: string,
  ) => {
    setSelectedItemCode(
      value,
    );

    const item =
      items.find(
        (entry) =>
          String(
            entry.item_code ?? "",
          ) === value,
      );

    if (!item) {
      return;
    }

    const itemAmount =
      Number(
        item.amount ?? 0,
      );

    /*
     * Fixed-price packages automatically
     * populate their amount.
     */
    if (
      Number.isFinite(
        itemAmount,
      ) &&
      itemAmount > 0
    ) {
      setAmount(
        String(itemAmount),
      );
    } else {
      setAmount("");
    }
  };

  // ============================================================
  // AMOUNT RULES
  // ============================================================

  const amountNumber =
    Number(amount);

  const itemMinimum =
    Number(
      selectedItem?.minimum ??
        0,
    );

  const itemMaximum =
    Number(
      selectedItem?.maximum ??
        0,
    );

  const fixedItemAmount =
    Number(
      selectedItem?.amount ??
        0,
    );

  const isFixedAmount =
    Number.isFinite(
      fixedItemAmount,
    ) &&
    fixedItemAmount > 0;

  // ============================================================
  // CUSTOMER NORMALISATION
  // ============================================================

  const normalisedCustomer =
    () => {
      let value =
        customer.trim();

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data"
      ) {
        value =
          value.replace(
            /\s+/g,
            "",
          );

        // 08012345678
        if (
          /^0\d{10}$/.test(
            value,
          )
        ) {
          return `+234${value.substring(
            1,
          )}`;
        }

        // 8012345678
        if (
          /^\d{10}$/.test(
            value,
          )
        ) {
          return `+234${value}`;
        }

        // 2348012345678
        if (
          /^234\d{10}$/.test(
            value,
          )
        ) {
          return `+${value}`;
        }

        // +2348012345678
        if (
          /^\+234\d{10}$/.test(
            value,
          )
        ) {
          return value;
        }
      }

      return value;
    };

  // ============================================================
  // VALIDATE FORM
  // ============================================================

  const validateForm =
    () => {
      if (
        !selectedBillerCode
      ) {
        toast({
          title:
            "Select a provider",
          description:
            "Please select a bill provider.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        !selectedItemCode
      ) {
        toast({
          title:
            "Select a package",
          description:
            "Please select a bill package.",
          variant:
            "destructive",
        });

        return false;
      }

      const finalCustomer =
        normalisedCustomer();

      if (!finalCustomer) {
        toast({
          title:
            "Customer information required",
          description:
            `Please enter the ${customerLabel.toLowerCase()}.`,
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // PHONE VALIDATION
      // ========================================================

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data"
      ) {
        if (
          !/^\+234\d{10}$/.test(
            finalCustomer,
          )
        ) {
          toast({
            title:
              "Invalid phone number",
            description:
              "Enter a valid Nigerian phone number.",
            variant:
              "destructive",
          });

          return false;
        }
      }

      // ========================================================
      // AMOUNT
      // ========================================================

      if (
        !Number.isFinite(
          amountNumber,
        ) ||
        amountNumber <= 0
      ) {
        toast({
          title:
            "Invalid amount",
          description:
            "Please enter a valid amount.",
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // FIXED AMOUNT
      // ========================================================

      if (
        isFixedAmount &&
        Math.abs(
          amountNumber -
            fixedItemAmount,
        ) > 0.01
      ) {
        toast({
          title:
            "Invalid amount",
          description:
            `This package costs ₦${fixedItemAmount.toLocaleString()}.`,
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // MINIMUM
      // ========================================================

      if (
        itemMinimum > 0 &&
        amountNumber <
          itemMinimum
      ) {
        toast({
          title:
            "Amount too low",
          description:
            `Minimum amount is ₦${itemMinimum.toLocaleString()}.`,
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // MAXIMUM
      // ========================================================

      if (
        itemMaximum > 0 &&
        amountNumber >
          itemMaximum
      ) {
        toast({
          title:
            "Amount too high",
          description:
            `Maximum amount is ₦${itemMaximum.toLocaleString()}.`,
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // WALLET
      // ========================================================

      if (
        amountNumber >
        Number(
          walletBalance,
        )
      ) {
        toast({
          title:
            "Insufficient Balance",
          description:
            "Please fund your wallet to continue.",
          variant:
            "destructive",
        });

        return false;
      }

      return true;
    };

  // ============================================================
  // PURCHASE
  // ============================================================

  const handlePurchase =
    async () => {
      if (!service) {
        return;
      }

      if (
        processingPayment
      ) {
        return;
      }

      if (!validateForm()) {
        return;
      }

      const finalCustomer =
        normalisedCustomer();

      /*
       * Keep both snake_case and camelCase
       * values because the parent/Edge Function
       * accepts the snake_case values while the
       * existing dashboard may use camelCase.
       */
      const details = {
        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        billerCode:
          selectedBillerCode,

        itemCode:
          selectedItemCode,

        phoneNumber:
          serviceType ===
            "airtime" ||
          serviceType ===
            "data"
            ? finalCustomer
            : "",

        provider:
          selectedBiller?.name ??
          "",

        meterNumber:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        meter_number:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        smartCardNumber:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        smartcardNumber:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        smartcard_number:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        accountNumber:
          serviceType ===
          "internet"
            ? finalCustomer
            : "",

        account_number:
          serviceType ===
          "internet"
            ? finalCustomer
            : "",

        type:
          serviceType,

        country:
          "NG",

        customerLabel,

        item:
          selectedItem,

        biller:
          selectedBiller,
      };

      try {
        setProcessingPayment(
          true,
        );

        setError("");

        /*
         * IMPORTANT:
         *
         * Wait for Dashboard.handlePurchase()
         * to finish.
         *
         * Dashboard.handlePurchase() calls:
         *
         * flutterwave-bills
         *
         * The Edge Function:
         *
         * 1. authenticates user
         * 2. validates bill
         * 3. debits wallet
         * 4. calls Flutterwave
         * 5. refunds if provider rejects
         */
        await onPurchase(
          amountNumber,
          details,
        );

        /*
         * Only reset/close after the parent
         * confirms that the operation completed.
         */
        resetForm();
        onClose();
      } catch (err: any) {
        /*
         * The parent normally handles the error
         * toast, but we keep this guard so that
         * the modal never closes accidentally.
         */
        console.error(
          "Service purchase failed:",
          err,
        );

        setError(
          err?.message ||
            "Unable to complete this payment.",
        );
      } finally {
        setProcessingPayment(
          false,
        );
      }
    };

  // ============================================================
  // CLOSE
  // ============================================================

  const handleClose =
    () => {
      if (
        processingPayment
      ) {
        return;
      }

      resetForm();
      onClose();
    };

  // ============================================================
  // NO SERVICE
  // ============================================================

  if (!service) {
    return null;
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(
        open,
      ) => {
        if (
          !open &&
          !processingPayment
        ) {
          handleClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-center text-green-700">
            {service.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ================================================== */}
          {/* WALLET */}
          {/* ================================================== */}

          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance: ₦
              {Number(
                walletBalance,
              ).toLocaleString()}
            </p>
          </div>

          {/* ================================================== */}
          {/* LOADING BILLERS */}
          {/* ================================================== */}

          {loadingBillers && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />

              Loading providers...
            </div>
          )}

          {/* ================================================== */}
          {/* PROVIDER */}
          {/* ================================================== */}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Provider
              </Label>

              {!loadingBillers &&
                !processingPayment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={
                      loadBillers
                    }
                    className="h-7 px-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />

                    Refresh
                  </Button>
                )}
            </div>

            <Select
              value={
                selectedBillerCode
              }
              onValueChange={
                handleBillerChange
              }
              disabled={
                loadingBillers ||
                processingPayment ||
                billers.length ===
                  0
              }
            >
              <SelectTrigger>
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
                    index,
                  ) => {
                    const code =
                      String(
                        biller.biller_code ??
                          "",
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <SelectItem
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {biller.name ??
                          biller.short_name ??
                          code}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ================================================== */}
          {/* PACKAGE */}
          {/* ================================================== */}

          <div className="space-y-2">
            <Label>
              {serviceType ===
              "airtime"
                ? "Airtime Type"
                : serviceType ===
                    "data"
                  ? "Data Package"
                  : "Bill Package"}
            </Label>

            <Select
              value={
                selectedItemCode
              }
              onValueChange={
                handleItemChange
              }
              disabled={
                loadingItems ||
                processingPayment ||
                !selectedBillerCode ||
                items.length === 0
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingItems
                      ? "Loading packages..."
                      : !selectedBillerCode
                        ? "Select provider first"
                        : "Select package"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                {items.map(
                  (
                    item,
                    index,
                  ) => {
                    const code =
                      String(
                        item.item_code ??
                          "",
                      );

                    if (!code) {
                      return null;
                    }

                    const itemAmount =
                      Number(
                        item.amount ??
                          0,
                      );

                    const hasAmount =
                      Number.isFinite(
                        itemAmount,
                      ) &&
                      itemAmount > 0;

                    return (
                      <SelectItem
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {item.name ??
                          item.short_name ??
                          code}

                        {hasAmount
                          ? ` — ₦${itemAmount.toLocaleString()}`
                          : ""}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ================================================== */}
          {/* CUSTOMER */}
          {/* ================================================== */}

          <div className="space-y-2">
            <Label htmlFor="billCustomer">
              {customerLabel}
            </Label>

            <Input
              id="billCustomer"
              value={customer}
              onChange={(
                e,
              ) =>
                setCustomer(
                  e.target.value,
                )
              }
              placeholder={
                customerPlaceholder
              }
              disabled={
                processingPayment
              }
              inputMode={
                serviceType ===
                    "airtime" ||
                serviceType ===
                    "data" ||
                serviceType ===
                    "electricity" ||
                serviceType ===
                    "cable"
                  ? "numeric"
                  : "text"
              }
            />
          </div>

          {/* ================================================== */}
          {/* AMOUNT */}
          {/* ================================================== */}

          <div className="space-y-2">
            <Label htmlFor="billAmount">
              Amount (₦)
            </Label>

            <Input
              id="billAmount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(
                e,
              ) =>
                setAmount(
                  e.target.value,
                )
              }
              placeholder={
                isFixedAmount
                  ? String(
                      fixedItemAmount,
                    )
                  : "Enter amount"
              }
              disabled={
                isFixedAmount ||
                processingPayment
              }
            />

            {(itemMinimum >
              0 ||
              itemMaximum >
                0) && (
              <p className="text-xs text-gray-500">
                {itemMinimum >
                0
                  ? `Minimum: ₦${itemMinimum.toLocaleString()}`
                  : ""}

                {itemMinimum >
                  0 &&
                itemMaximum >
                  0
                  ? " • "
                  : ""}

                {itemMaximum >
                0
                  ? `Maximum: ₦${itemMaximum.toLocaleString()}`
                  : ""}
              </p>
            )}

            {isFixedAmount && (
              <p className="text-xs text-gray-500">
                Fixed package price: ₦
                {fixedItemAmount.toLocaleString()}
              </p>
            )}
          </div>

          {/* ================================================== */}
          {/* ERROR */}
          {/* ================================================== */}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* ================================================== */}
          {/* PURCHASE */}
          {/* ================================================== */}

          <Button
            onClick={
              handlePurchase
            }
            disabled={
              loadingBillers ||
              loadingItems ||
              processingPayment ||
              !selectedBillerCode ||
              !selectedItemCode ||
              !customer.trim() ||
              !amount
            }
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {processingPayment ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                Processing...
              </>
            ) : (
              <>
                Purchase{" "}
                {service.title}
              </>
            )}
          </Button>

          {processingPayment && (
            <p className="text-xs text-center text-gray-500">
              Please do not close this window
              while your payment is being
              processed.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
