import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Loader2,
  User,
  Building2,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";
import { useCustomerAppSettings } from "@/hooks/useCustomerAppSettings";

import PaymentPinModal from "@/components/security/PaymentPinModal";

interface SendMoneyPageProps {
  onBack: () => void;

  walletBalance: number;

  onTransfer: (
    amount: number,
    details: any
  ) => Promise<void>;

  onTransferSuccess?: () =>
    | Promise<void>
    | void;
}

interface Bank {
  name: string;
  code: string;
}

interface ResolvedAccount {
  account_number: string;
  account_name: string;
  bank_code: string;
}

interface ResolvedIyanjuPayRecipient {
  wallet_id: string;
  name: string;
  full_name?: string | null;
  nickname?: string | null;
}

interface PendingBankTransfer {
  amount: number;
  details: any;
}

type TransferType =
  | "iyanjupay"
  | "bank";

/**
 * ============================================================
 * TRANSFER FEES
 * ============================================================
 */

const IYANJUPAY_TRANSFER_FEE = 0;
const BANK_TRANSFER_FEE = 10;

/**
 * ============================================================
 * SEND MONEY PAGE
 * ============================================================
 */

const SendMoneyPage = ({
  onBack,
  walletBalance,
  onTransfer,
  onTransferSuccess,
}: SendMoneyPageProps) => {
  const { allowTransfers } = useCustomerAppSettings();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ==========================================================
  // CONNECTION
  // ==========================================================

  const [isOnline, setIsOnline] =
    useState<boolean>(
      typeof navigator !== "undefined"
        ? navigator.onLine
        : true
    );

  // ==========================================================
  // TRANSFER TYPE
  // ==========================================================

  const [transferType, setTransferType] =
    useState<TransferType>("iyanjupay");

  // ==========================================================
  // GENERAL TRANSFER
  // ==========================================================

  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");

  // ==========================================================
  // PAYMENT PIN
  // ==========================================================

  const [paymentPinOpen, setPaymentPinOpen] =
    useState(false);

  const [
    pendingBankTransfer,
    setPendingBankTransfer,
  ] = useState<PendingBankTransfer | null>(null);

  const [hasPaymentPin, setHasPaymentPin] =
    useState<boolean | null>(null);

  const [checkingPaymentPin, setCheckingPaymentPin] =
    useState(false);

  const [createPinOpen, setCreatePinOpen] =
    useState(false);

  const [newPin, setNewPin] =
    useState("");

  const [confirmPin, setConfirmPin] =
    useState("");

  const [createPinError, setCreatePinError] =
    useState("");

  const [creatingPin, setCreatingPin] =
    useState(false);

  const [pendingPinAction, setPendingPinAction] =
    useState(false);

  const createPinInputRef =
    useRef<HTMLInputElement>(null);

  // ==========================================================
  // IYANJUPAY
  // ==========================================================

  const [
    iyanjupayWalletId,
    setIyanjuPayWalletId,
  ] = useState("");

  const [
    iyanjupayTransferring,
    setIyanjuPayTransferring,
  ] = useState(false);

  const [
    resolvedIyanjuPayRecipient,
    setResolvedIyanjuPayRecipient,
  ] = useState<ResolvedIyanjuPayRecipient | null>(
    null
  );

  const [
    resolvingIyanjuPayRecipient,
    setResolvingIyanjuPayRecipient,
  ] = useState(false);

  const iyanjuPayResolveRequestRef =
    useRef(0);

  // ==========================================================
  // BANK
  // ==========================================================

  const [bank, setBank] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [accountNumber, setAccountNumber] =
    useState("");

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] =
    useState(false);

  const [
    resolvedAccount,
    setResolvedAccount,
  ] = useState<ResolvedAccount | null>(null);

  const [resolving, setResolving] =
    useState(false);

  const resolveRequestRef = useRef(0);

  // ==========================================================
  // CONNECTION MONITORING
  // ==========================================================

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);

      toast({
        title: "Internet connection restored",
        description:
          "You are back online.",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);

      toast({
        title: "No internet connection",
        description:
          "Please reconnect to the internet before continuing.",
        variant: "destructive",
      });
    };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, [toast]);

  // ==========================================================
  // CHECK PAYMENT PIN
  // ==========================================================

  const checkPaymentPin = async (): Promise<boolean> => {
    if (!isOnline) {
      toast({
        title: "No internet connection",
        description:
          "Please reconnect to the internet and try again.",
        variant: "destructive",
      });

      return false;
    }

    setCheckingPaymentPin(true);

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "has_payment_pin"
      );

      if (error) {
        console.error(
          "Payment PIN status check failed:",
          error
        );

        toast({
          title:
            "Unable to check Payment PIN",
          description:
            getSafeErrorMessage(error) ||
            "Please try again.",
          variant: "destructive",
        });

        return false;
      }

      const exists =
        typeof data === "boolean"
          ? data
          : Boolean(
              data?.has_payment_pin
            );

      setHasPaymentPin(exists);

      return exists;
    } catch (error: any) {
      console.error(
        "Unexpected Payment PIN status error:",
        error
      );

      toast({
        title:
          "Unable to check Payment PIN",
        description:
          getSafeErrorMessage(error) ||
          "Please try again.",
        variant: "destructive",
      });

      return false;
    } finally {
      setCheckingPaymentPin(false);
    }
  };

  // ==========================================================
  // CHECK PAYMENT PIN ON PAGE LOAD
  // ==========================================================

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    checkPaymentPin();
  }, [isOnline]);

  // ==========================================================
  // FOCUS CREATE PIN
  // ==========================================================

  useEffect(() => {
    if (!createPinOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      createPinInputRef.current?.focus();
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [createPinOpen]);

  // ==========================================================
  // FILTER BANKS
  // ==========================================================

  const filteredBanks = banks.filter(
    (bankItem) =>
      bankItem.name
        .toLowerCase()
        .includes(
          bankSearch
            .trim()
            .toLowerCase()
        )
  );

  // ==========================================================
  // SELECTED BANK NAME
  // ==========================================================

  const selectedBankName =
    banks.find(
      (item) =>
        item.code === bank
    )?.name || "";

  // ==========================================================
  // TRANSFER PRICING
  // ==========================================================

  const transferAmount =
    Number(amount) || 0;

  const transferFee =
    transferType === "iyanjupay"
      ? IYANJUPAY_TRANSFER_FEE
      : transferAmount > 0
        ? BANK_TRANSFER_FEE
        : 0;

  const totalCharged =
    transferAmount + transferFee;

  const hasInsufficientBalance =
    transferAmount > 0 &&
    totalCharged > walletBalance;

  // ==========================================================
  // LOAD BANKS
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const loadBanks = async () => {
      if (!isOnline) {
        return;
      }

      setBanksLoading(true);

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "flutterwave-banks"
          );

        if (cancelled) {
          return;
        }

        if (error) {
          throw error;
        }

        if (
          !data?.success ||
          !Array.isArray(data?.banks)
        ) {
          throw new Error(
            getSafeErrorMessage(data) ||
              "Unable to load banks."
          );
        }

        const normalizedBanks =
          data.banks
            .filter(
              (item: any) =>
                item &&
                item.name &&
                item.code
            )
            .map(
              (item: any) => ({
                name:
                  String(
                    item.name
                  ).trim(),
                code:
                  String(
                    item.code
                  ).trim(),
              })
            )
            .sort(
              (
                a: Bank,
                b: Bank
              ) =>
                a.name.localeCompare(
                  b.name
                )
            );

        setBanks(normalizedBanks);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        console.error(
          "Bank loading error:",
          error
        );

        toast({
          title:
            "Unable to load banks",
          description:
            !isOnline
              ? "Please check your internet connection."
              : getSafeErrorMessage(error) ||
                "Please try again later.",
          variant:
            "destructive",
        });
      } finally {
        if (!cancelled) {
          setBanksLoading(false);
        }
      }
    };

    loadBanks();

    return () => {
      cancelled = true;
    };
  }, [isOnline, toast]);

  // ==========================================================
  // RESOLVE BANK ACCOUNT
  // ==========================================================

  useEffect(() => {
    if (transferType !== "bank") {
      return;
    }

    const cleanAccountNumber =
      accountNumber.replace(
        /\D/g,
        ""
      );

    if (
      !bank ||
      !/^\d{10}$/.test(
        cleanAccountNumber
      )
    ) {
      setResolvedAccount(null);
      setResolving(false);
      return;
    }

    if (!isOnline) {
      setResolvedAccount(null);
      setResolving(false);
      return;
    }

    const requestId =
      ++resolveRequestRef.current;

    const timeout =
      window.setTimeout(async () => {
        if (!navigator.onLine) {
          setResolving(false);

          toast({
            title:
              "No internet connection",
            description:
              "Reconnect to the internet to verify the account.",
            variant:
              "destructive",
          });

          return;
        }

        setResolving(true);
        setResolvedAccount(null);

        try {
          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "resolve-bank-account",
              {
                body: {
                  account_number:
                    cleanAccountNumber,

                  account_bank:
                    bank,
                },
              }
            );

          if (
            requestId !==
            resolveRequestRef.current
          ) {
            return;
          }

          if (error) {
            let message =
              getSafeErrorMessage(error) ||
              "Unable to verify bank account.";

            try {
              if (
                error.context &&
                typeof error
                  .context
                  .json ===
                  "function"
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

            throw new Error(
              message
            );
          }

          if (
            !data?.success ||
            !data?.account
          ) {
            throw new Error(
              getSafeErrorMessage(data) ||
                "Bank account could not be verified."
            );
          }

          setResolvedAccount({
            account_number:
              data.account
                .account_number,

            account_name:
              data.account
                .account_name,

            bank_code:
              data.account
                .bank_code,
          });

          toast({
            title:
              "Account verified",
            description:
              data.account
                .account_name,
          });
        } catch (error: any) {
          if (
            requestId !==
            resolveRequestRef.current
          ) {
            return;
          }

          console.error(
            "Account resolution failed:",
            error
          );

          setResolvedAccount(
            null
          );

          toast({
            title:
              "Account verification failed",

            description:
              !navigator.onLine
                ? "Your internet connection was lost. Please reconnect and try again."
                : getSafeErrorMessage(error) ||
                  "We could not verify this bank account.",

            variant:
              "destructive",
          });
        } finally {
          if (
            requestId ===
            resolveRequestRef.current
          ) {
            setResolving(false);
          }
        }
      }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    accountNumber,
    bank,
    transferType,
    isOnline,
    toast,
  ]);

  // ==========================================================
  // RESOLVE IYANJUPAY RECIPIENT
  // ==========================================================

  useEffect(() => {
    if (transferType !== "iyanjupay") {
      return;
    }

    const cleanWalletId =
      iyanjupayWalletId.replace(
        /\D/g,
        ""
      );

    if (
      !/^\d{8}$/.test(
        cleanWalletId
      )
    ) {
      iyanjuPayResolveRequestRef.current++;

      setResolvedIyanjuPayRecipient(
        null
      );

      setResolvingIyanjuPayRecipient(
        false
      );

      return;
    }

    if (!isOnline) {
      setResolvedIyanjuPayRecipient(
        null
      );

      setResolvingIyanjuPayRecipient(
        false
      );

      return;
    }

    const requestId =
      ++iyanjuPayResolveRequestRef.current;

    const timeout =
      window.setTimeout(async () => {
        if (!navigator.onLine) {
          setResolvingIyanjuPayRecipient(
            false
          );

          return;
        }

        setResolvingIyanjuPayRecipient(
          true
        );

        setResolvedIyanjuPayRecipient(
          null
        );

        try {
          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "resolve-iyanjupay-recipient",
              {
                body: {
                  wallet_id:
                    cleanWalletId,
                },
              }
            );

          if (
            requestId !==
            iyanjuPayResolveRequestRef.current
          ) {
            return;
          }

          if (error) {
            let message =
              getSafeErrorMessage(error) ||
              "Unable to verify recipient.";

            try {
              if (
                error.context &&
                typeof error
                  .context
                  .json ===
                  "function"
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

            throw new Error(
              message
            );
          }

          if (
            !data?.success ||
            !data?.recipient
          ) {
            throw new Error(
              getSafeErrorMessage(data) ||
                getSafeErrorMessage(data) ||
                "IyanjuPay Wallet ID could not be verified."
            );
          }

          setResolvedIyanjuPayRecipient({
            wallet_id:
              data.recipient
                .wallet_id,

            name:
              data.recipient
                .name,

            full_name:
              data.recipient
                .full_name ??
              null,

            nickname:
              data.recipient
                .nickname ??
              null,
          });

          toast({
            title:
              "Recipient verified",
            description:
              data.recipient
                .name,
          });
        } catch (error: any) {
          if (
            requestId !==
            iyanjuPayResolveRequestRef.current
          ) {
            return;
          }

          console.error(
            "IyanjuPay recipient verification failed:",
            error
          );

          setResolvedIyanjuPayRecipient(
            null
          );

          toast({
            title:
              "Wallet ID verification failed",

            description:
              !navigator.onLine
                ? "Your internet connection was lost. Please reconnect and try again."
                : getSafeErrorMessage(error) ||
                  "We could not find this IyanjuPay Wallet ID.",

            variant:
              "destructive",
          });
        } finally {
          if (
            requestId ===
            iyanjuPayResolveRequestRef.current
          ) {
            setResolvingIyanjuPayRecipient(
              false
            );
          }
        }
      }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    iyanjupayWalletId,
    transferType,
    isOnline,
    toast,
  ]);

  // ==========================================================
  // CHANGE TRANSFER TYPE
  // ==========================================================

  const handleTransferTypeChange = (
    type: TransferType
  ) => {
    resolveRequestRef.current++;
    iyanjuPayResolveRequestRef.current++;

    setTransferType(type);

    setAmount("");
    setNarration("");

    setIyanjuPayWalletId("");
    setResolvedIyanjuPayRecipient(
      null
    );

    setResolvingIyanjuPayRecipient(
      false
    );

    setIyanjuPayTransferring(
      false
    );

    setBank("");
    setBankSearch("");
    setAccountNumber("");

    setResolvedAccount(null);
    setResolving(false);

    setPaymentPinOpen(false);
    setPendingBankTransfer(
      null
    );

  };

  // ==========================================================
  // CREATE PAYMENT PIN
  // ==========================================================

  const handleCreatePin = async () => {
    setCreatePinError("");

    if (!isOnline) {
      setCreatePinError(
        "No internet connection. Please reconnect and try again."
      );

      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      setCreatePinError(
        "Payment PIN must be exactly 4 digits."
      );

      return;
    }

    if (!/^\d{4}$/.test(confirmPin)) {
      setCreatePinError(
        "Confirm your 4-digit Payment PIN."
      );

      return;
    }

    if (newPin !== confirmPin) {
      setCreatePinError(
        "Payment PINs do not match."
      );

      return;
    }

    setCreatingPin(true);

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "create_payment_pin",
        {
          _pin: newPin,
        }
      );

      if (error) {
        console.error(
          "Create Payment PIN error:",
          error
        );

        setCreatePinError(
          getSafeErrorMessage(error) ||
            "Unable to create Payment PIN."
        );

        return;
      }

      if (
        data &&
        typeof data === "object" &&
        data.success === false
      ) {
        setCreatePinError(
          data.message ||
            "Unable to create Payment PIN."
        );

        return;
      }

      setHasPaymentPin(true);

      setNewPin("");
      setConfirmPin("");
      setCreatePinError("");

      setCreatePinOpen(false);

      toast({
        title:
          "Payment PIN created",
        description:
          "Your Payment PIN has been created successfully.",
      });

      if (pendingPinAction) {
        setPendingPinAction(false);

        setTimeout(() => {
          if (navigator.onLine) {
            setPaymentPinOpen(true);
          }
        }, 150);
      }
    } catch (error: any) {
      console.error(
        "Unexpected create Payment PIN error:",
        error
      );

      setCreatePinError(
        !navigator.onLine
          ? "Your internet connection was lost. Please reconnect and try again."
          : getSafeErrorMessage(error) ||
              "Something went wrong while creating your Payment PIN."
      );
    } finally {
      setCreatingPin(false);
    }
  };

  // ==========================================================
  // CREATE PIN CANCEL
  // ==========================================================

  const handleCreatePinCancel = () => {
    if (creatingPin) {
      return;
    }

    setCreatePinOpen(false);

    setNewPin("");
    setConfirmPin("");
    setCreatePinError("");

    setPendingPinAction(false);
  };

  // ==========================================================
  // PREPARE TRANSFER
  // ==========================================================

  const handleTransfer = async () => {
    if (!isOnline) {
      toast({
        title:
          "No internet connection",
        description:
          "Please reconnect to the internet before making a transfer.",
        variant:
          "destructive",
      });

      return;
    }

    const transferAmountValue =
      Number(amount);

    if (
      !Number.isFinite(
        transferAmountValue
      ) ||
      transferAmountValue <= 0
    ) {
      toast({
        title: "Invalid amount",
        description:
          "Please enter a valid transfer amount.",
        variant:
          "destructive",
      });

      return;
    }

    // --------------------------------------------------------
    // IYANJUPAY
    // --------------------------------------------------------

    if (
      transferType ===
      "iyanjupay"
    ) {
      const walletId =
        iyanjupayWalletId.trim();

      if (
        !/^\d{8}$/.test(
          walletId
        )
      ) {
        toast({
          title:
            "Invalid Wallet ID",
          description:
            "IyanjuPay Wallet ID must be exactly 8 digits.",
          variant:
            "destructive",
        });

        return;
      }

      if (
        !resolvedIyanjuPayRecipient ||
        resolvedIyanjuPayRecipient.wallet_id !==
          walletId
      ) {
        toast({
          title:
            "Recipient not verified",
          description:
            "Please enter a valid IyanjuPay Wallet ID and wait for the recipient name to be verified.",
          variant:
            "destructive",
        });

        return;
      }

      if (
        transferAmountValue >
        walletBalance
      ) {
        toast({
          title:
            "Insufficient Balance",
          description:
            `You need ₦${transferAmountValue.toLocaleString()} to complete this transfer.`,
          variant:
            "destructive",
        });

        return;
      }

      // Always refresh PIN status before deciding whether the user must create one.
      // This prevents a stale false value from reopening the Create PIN flow after a PIN exists.
      const pinExists = await checkPaymentPin();

      if (!pinExists) {
        setPendingPinAction(true);

        setCreatePinError("");
        setNewPin("");
        setConfirmPin("");

        setCreatePinOpen(true);

        return;
      }

      setPaymentPinOpen(true);

      return;
    }

    // --------------------------------------------------------
    // BANK
    // --------------------------------------------------------

    const fee =
      BANK_TRANSFER_FEE;

    const total =
      transferAmountValue +
      fee;

    if (
      total >
      walletBalance
    ) {
      toast({
        title:
          "Insufficient Balance",
        description:
          `You need ₦${total.toLocaleString()} to complete this transfer.`,
        variant:
          "destructive",
      });

      return;
    }

    if (!bank) {
      toast({
        title:
          "Select a bank",
        description:
          "Please search for and select the recipient's bank.",
        variant:
          "destructive",
      });

      return;
    }

    if (!resolvedAccount) {
      toast({
        title:
          "Account not verified",
        description:
          "Please enter a valid 10-digit account number and wait for verification.",
        variant:
          "destructive",
      });

      return;
    }

    const selectedBank =
      banks.find(
        (item) =>
          item.code ===
          resolvedAccount.bank_code
      );

    const details = {
      recipient:
        resolvedAccount.account_name,

      bank:
        selectedBank?.name ||
        selectedBankName ||
        "Bank",

      bankCode:
        resolvedAccount.bank_code,

      accountNumber:
        resolvedAccount.account_number,

      narration:
        narration.trim() ||
        "Bank transfer",

      type:
        "transfer",

      transferAmount:
        transferAmountValue,

      fee,

      totalCharged:
        total,
    };

    setPendingBankTransfer({
      amount:
        transferAmountValue,

      details,
    });

    // Always refresh PIN status before deciding whether the user must create one.
    // This prevents a stale false value from reopening the Create PIN flow after a PIN exists.
    const pinExists = await checkPaymentPin();

    if (!pinExists) {
      setPendingPinAction(true);

      setCreatePinError("");
      setNewPin("");
      setConfirmPin("");

      setCreatePinOpen(true);

      return;
    }

    setPaymentPinOpen(true);
  };

  // ==========================================================
  // PAYMENT PIN VERIFIED
  // ==========================================================

  const handlePaymentPinVerified =
    async () => {
      setPaymentPinOpen(false);

      if (!isOnline) {
        toast({
          title:
            "No internet connection",
          description:
            "Please reconnect before authorizing the transfer.",
          variant:
            "destructive",
        });

        return;
      }

      // ------------------------------------------------------
      // IYANJUPAY
      // ------------------------------------------------------

      if (
        transferType ===
        "iyanjupay"
      ) {
        const transferAmountValue =
          Number(amount);

        if (
          !resolvedIyanjuPayRecipient
        ) {
          toast({
            title:
              "Recipient unavailable",
            description:
              "The recipient could not be confirmed. Please try again.",
            variant:
              "destructive",
          });

          return;
        }

        const idempotencyKey =
          `iyanjupay_${crypto.randomUUID()}`;

        const details = {
          wallet_id:
            iyanjupayWalletId.trim(),

          recipientWalletId:
            iyanjupayWalletId.trim(),

          recipient:
            resolvedIyanjuPayRecipient.name,

          recipientName:
            resolvedIyanjuPayRecipient.name,

          narration:
            narration.trim() ||
            "IyanjuPay transfer",

          type:
            "iyanjupay",

          transferAmount:
            transferAmountValue,

          fee:
            IYANJUPAY_TRANSFER_FEE,

          totalCharged:
            transferAmountValue,
        };

        navigate("/transaction-processing", {
          state: {
            transactionType: "iyanjupay",
            transferType: "iyanjupay",
            amount: transferAmountValue,
            details,
            idempotencyKey,
          },
        });

        return;
      }

      // ------------------------------------------------------
      // BANK
      // ------------------------------------------------------

      if (
        pendingBankTransfer
      ) {
        const {
          amount:
            transferAmountValue,

          details,
        } =
          pendingBankTransfer;

        const idempotencyKey =
          `bank_${crypto.randomUUID()}`;

        setPendingBankTransfer(
          null
        );

        navigate("/transaction-processing", {
          state: {
            transactionType: "bank",
            transferType: "bank",
            amount: transferAmountValue,
            details,
            idempotencyKey,
          },
        });
      }
    };

  // ==========================================================
  // PAYMENT PIN CANCEL
  // ==========================================================

  const handlePaymentPinCancel =
    () => {
      setPaymentPinOpen(false);
      setPendingBankTransfer(
        null
      );
      setPendingPinAction(false);
    };

  // ==========================================================
  // BACK
  // ==========================================================

  const handleBack = () => {
    resolveRequestRef.current++;
    iyanjuPayResolveRequestRef.current++;

    setPaymentPinOpen(false);
    setCreatePinOpen(false);

    setPendingBankTransfer(
      null
    );

    setPendingPinAction(false);

    setTransferType(
      "iyanjupay"
    );

    setAmount("");
    setNarration("");

    setIyanjuPayWalletId("");

    setResolvedIyanjuPayRecipient(
      null
    );

    setResolvingIyanjuPayRecipient(
      false
    );

    setIyanjuPayTransferring(
      false
    );

    setBank("");
    setBankSearch("");
    setAccountNumber("");

    setResolvedAccount(
      null
    );

    setResolving(false);

    onBack();
  };

  // ==========================================================
  // ADMIN CONTROL: TRANSFERS
  // ==========================================================

  if (!allowTransfers) {
    return (
      <div className="iyanjupay-dashboard min-h-screen bg-background px-4 py-6 text-foreground">
        <div className="mx-auto max-w-lg">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10" />
            <h2 className="text-lg font-bold">Transfers temporarily unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Transfers have been temporarily disabled by IyanjuPay administration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // DISABLED
  // ==========================================================

  const isTransferDisabled =
    !isOnline ||
    !amount ||
    transferAmount <= 0 ||
    hasInsufficientBalance ||
    iyanjupayTransferring ||
    paymentPinOpen ||
    createPinOpen ||
    checkingPaymentPin ||
    (transferType ===
      "iyanjupay" &&
      (
        !/^\d{8}$/.test(
          iyanjupayWalletId.trim()
        ) ||
        resolvingIyanjuPayRecipient ||
        !resolvedIyanjuPayRecipient
      )) ||
    (transferType ===
      "bank" &&
      (
        !bank ||
        !resolvedAccount ||
        resolving
      ));

  // ==========================================================
  // BANK PICKER PAGE
  // ==========================================================

  if (bankPickerOpen) {
    return (
      <div className="send-money-page min-h-[100dvh] bg-[#f7f5ff] text-slate-900">
        <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/95 text-slate-900 shadow-sm backdrop-blur">
          <div className="mx-auto max-w-md px-4">
            <div className="relative flex h-14 items-center justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBankPickerOpen(false)}
                aria-label="Back to Send Money"
                className="absolute left-0 h-10 w-10 rounded-full p-0 text-slate-700 hover:bg-violet-50"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-base font-bold tracking-tight">Select Bank</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-md flex-col px-4 pb-8 pt-5">
          <div className="mb-5">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Recipient's Bank
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Search and select the bank linked to the account.
            </p>
          </div>

          <div className="sticky top-14 z-20 mb-4 bg-[#f7f5ff] pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Search bank name..."
                className="send-money-input h-12 rounded-xl border-[#e3def3] bg-white pl-11 pr-4 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-[#5b18d5]"
                autoComplete="off"
                autoFocus
                aria-label="Search banks"
              />
            </div>
            {!banksLoading && isOnline && (
              <p className="mt-2 px-1 text-xs text-slate-500">
                {filteredBanks.length} {filteredBanks.length === 1 ? "bank" : "banks"} found
              </p>
            )}
          </div>

          <div className="flex-1 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_rgba(48,24,120,0.06)]">
            {banksLoading ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                <span>Loading banks...</span>
              </div>
            ) : !isOnline ? (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <WifiOff className="mb-3 h-9 w-9 text-red-300" />
                <p className="text-sm font-semibold text-gray-800">No internet connection</p>
                <p className="mt-1 text-xs text-gray-500">Reconnect to load the bank list.</p>
              </div>
            ) : filteredBanks.length > 0 ? (
              <div className="max-h-[calc(100dvh-245px)] overflow-y-auto overscroll-contain">
                {filteredBanks.map((bankItem) => {
                  const isSelected = bankItem.code === bank;
                  return (
                    <button
                      key={bankItem.code}
                      type="button"
                      onClick={() => {
                        resolveRequestRef.current++;
                        setBank(bankItem.code);
                        setResolvedAccount(null);
                        setResolving(false);
                        setBankSearch("");
                        setBankPickerOpen(false);
                      }}
                      className={`flex min-h-[64px] w-full items-center gap-3 border-b border-violet-50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-violet-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b18d5] ${isSelected ? "bg-violet-50" : "bg-white"}`}
                      aria-pressed={isSelected}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {bankItem.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          Select bank
                        </span>
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <Building2 className="mb-3 h-9 w-9 text-slate-300" />
                <p className="text-sm font-semibold text-gray-800">No bank found</p>
                <p className="mt-1 text-xs text-gray-500">Try another bank name.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <>
      

      <div
        className="
          send-money-page
          min-h-screen
          bg-[#f7f5ff] text-slate-900
        "
      >
        {!isOnline && (
          <div className="sticky top-0 z-50 bg-red-600 text-white">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5">
              <div className="flex items-center justify-center gap-2 text-sm font-medium">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span>
                  No internet connection. Reconnect to continue.
                </span>
              </div>
            </div>
          </div>
        )}

        <header className="send-money-gradient-header sticky top-0 z-30 border-b border-violet-100 bg-white/95 text-slate-900 shadow-sm backdrop-blur">
          <div className="mx-auto max-w-md px-4">
            <div className="relative flex h-14 items-center justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                aria-label="Go back"
                className="absolute left-0 h-10 w-10 rounded-full p-0 text-slate-700 hover:bg-violet-50"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-base font-bold tracking-tight">Send Money</h1>
              <div className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-md px-4 pb-10 pt-5">
          <div className="mb-5">
            <h2 className="send-money-heading text-xl font-bold tracking-tight text-slate-900">
              Select Recipient
            </h2>
            <p className="send-money-description mt-1 text-sm text-slate-500">
              Choose where you want to send money.
            </p>
          </div>

          <div className="send-money-content-card space-y-5 rounded-[26px] border border-violet-100 bg-white p-4 shadow-[0_12px_35px_rgba(48,24,120,0.08)] sm:p-5">
            <div className="space-y-2">
              <Label className="send-money-label text-sm font-semibold text-slate-800">
                Recipient Type
              </Label>

              <div className="send-money-type-switcher grid grid-cols-2 gap-1 rounded-full bg-[#f0edfb] p-1">
                <Button
                  type="button"
                  variant={
                    transferType === "iyanjupay"
                      ? "default"
                      : "ghost"
                  }
                  onClick={() =>
                    handleTransferTypeChange(
                      "iyanjupay"
                    )
                  }
                  className={
                    transferType === "iyanjupay"
                      ? "h-10 rounded-full bg-[#4b12d1] text-white shadow-md hover:bg-[#3d0db4]"
                      : "h-10 rounded-full text-slate-600 hover:bg-violet-50"
                  }
                >
                  <User className="h-4 w-4 mr-2" />
                  IyanjuPay User
                </Button>

                <Button
                  type="button"
                  variant={
                    transferType === "bank"
                      ? "default"
                      : "ghost"
                  }
                  onClick={() =>
                    handleTransferTypeChange(
                      "bank"
                    )
                  }
                  className={
                    transferType === "bank"
                      ? "h-10 rounded-full bg-[#4b12d1] text-white shadow-md hover:bg-[#3d0db4]"
                      : "h-10 rounded-full text-slate-600 hover:bg-violet-50"
                  }
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Bank Account
                </Button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#6417dc] via-[#4b13c8] to-[#271078] p-4 text-white shadow-[0_10px_24px_rgba(75,19,200,0.24)]">
              <div className="pointer-events-none absolute -right-7 -top-10 h-32 w-32 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-1 -bottom-12 h-28 w-28 rounded-full bg-white/5" />
              <p className="relative text-xs font-medium text-violet-100">
                Available Balance
              </p>

              <p className="relative mt-1 text-2xl font-bold tracking-tight text-white">
                ₦
                {walletBalance.toLocaleString(
                  "en-NG",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </p>
            </div>

            {transferType === "iyanjupay" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="iyanjupayWalletId"
                    className="send-money-label text-sm font-semibold text-slate-800"
                  >
                    Recipient Wallet ID
                  </Label>

                  <Input
                    id="iyanjupayWalletId"
                    value={iyanjupayWalletId}
                    onChange={(e) => {
                      const value =
                        e.target.value.replace(
                          /\D/g,
                          ""
                        );

                      iyanjuPayResolveRequestRef.current++;

                      setIyanjuPayWalletId(
                        value.slice(0, 8)
                      );

                      setResolvedIyanjuPayRecipient(
                        null
                      );

                      setResolvingIyanjuPayRecipient(
                        false
                      );
                    }}
                    placeholder="Enter 8-digit Wallet ID"
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={8}
                    disabled={!isOnline}
                    className="send-money-input h-12 rounded-xl border-[#e3def3] bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#5b18d5]"
                  />

                  <p className="send-money-muted text-xs">
                    Enter the recipient's 8-digit IyanjuPay Wallet ID.
                  </p>

                  {iyanjupayWalletId.length > 0 &&
                    iyanjupayWalletId.length < 8 && (
                      <p className="text-xs text-orange-600">
                        Wallet ID must contain exactly 8 digits.
                      </p>
                    )}

                  {resolvingIyanjuPayRecipient &&
                    iyanjupayWalletId.length === 8 && (
                      <div className="send-money-verifying rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                          <p className="send-money-verifying-text text-sm text-blue-700">
                            Verifying recipient...
                          </p>
                        </div>
                      </div>
                    )}

                  {!resolvingIyanjuPayRecipient &&
                    resolvedIyanjuPayRecipient && (
                      <div className="send-money-verified rounded-2xl border border-emerald-100 bg-[#f1fbf6] p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />

                          <div className="min-w-0">
                            <p className="send-money-verified-title text-xs text-green-700 font-medium">
                              VERIFIED RECIPIENT
                            </p>

                            <p className="send-money-verified-name font-semibold text-gray-900 mt-1 break-words">
                              {resolvedIyanjuPayRecipient.name}
                            </p>

                            <p className="send-money-verified-muted text-sm text-gray-600">
                              Wallet ID:{" "}
                              {resolvedIyanjuPayRecipient.wallet_id}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  {!resolvingIyanjuPayRecipient &&
                    iyanjupayWalletId.length === 8 &&
                    !resolvedIyanjuPayRecipient &&
                    isOnline && (
                      <div className="send-money-warning rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="send-money-warning-text text-sm text-red-700">
                          Wallet ID could not be verified. Please check the recipient's Wallet ID.
                        </p>
                      </div>
                    )}
                </div>
              </div>
            )}

            {transferType === "bank" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="bank"
                    className="send-money-label text-sm font-semibold text-slate-800"
                  >
                    Recipient Bank
                  </Label>

                  <button
                    type="button"
                    id="bank"
                    onClick={() => {
                      setBankSearch("");
                      setBankPickerOpen(true);
                    }}
                    className="send-money-input flex h-12 w-full items-center justify-between rounded-xl border border-[#e3def3] bg-white px-3 text-left text-slate-900 transition-colors hover:border-[#5b18d5]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b18d5]"
                    aria-label="Search and select recipient bank"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className={selectedBankName ? "truncate text-gray-900" : "truncate text-gray-500"}>
                        {selectedBankName ||
                          (banksLoading
                            ? "Loading banks..."
                            : "Search and select your bank")}
                      </span>
                    </span>
                    <Search className="ml-3 h-4 w-4 shrink-0 text-gray-400" />
                  </button>
                  <p className="send-money-muted text-xs">
                    Tap to open the bank list and search for the recipient's bank.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="accountNumber"
                    className="send-money-label text-sm font-semibold text-slate-800"
                  >
                    Account Number
                  </Label>

                  <Input
                    id="accountNumber"
                    value={accountNumber}
                    onChange={(e) => {
                      const value =
                        e.target.value.replace(
                          /\D/g,
                          ""
                        );

                      resolveRequestRef.current++;

                      setAccountNumber(
                        value.slice(0, 10)
                      );

                      setResolvedAccount(null);
                      setResolving(false);
                    }}
                    placeholder="Enter 10-digit account number"
                    maxLength={10}
                    inputMode="numeric"
                    disabled={!isOnline}
                    className="send-money-input h-12 rounded-xl border-[#e3def3] bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#5b18d5]"
                  />

                  {resolving && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        Verifying account...
                      </span>
                    </div>
                  )}

                  {!resolving &&
                    accountNumber.length > 0 &&
                    accountNumber.length < 10 && (
                      <p className="send-money-muted text-xs">
                        Enter all 10 digits to automatically verify the account.
                      </p>
                    )}
                </div>

                {resolvedAccount && (
                  <div className="send-money-verified rounded-2xl border border-emerald-100 bg-[#f1fbf6] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />

                      <div className="min-w-0">
                        <p className="send-money-verified-title text-xs text-green-700 font-medium">
                          VERIFIED ACCOUNT
                        </p>

                        <p className="send-money-verified-name font-semibold text-gray-900 mt-1 break-words">
                          {resolvedAccount.account_name}
                        </p>

                        <p className="send-money-verified-muted text-sm text-gray-600">
                          {resolvedAccount.account_number}
                        </p>

                        {selectedBankName && (
                          <p className="send-money-verified-muted text-sm text-gray-600 mt-0.5">
                            {selectedBankName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="amount"
                className="send-money-label text-sm font-semibold text-slate-800"
              >
                Amount (₦)
              </Label>

              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value)
                }
                placeholder="Enter amount"
                min="1"
                step="0.01"
                disabled={!isOnline}
                className="send-money-input h-12 rounded-xl border-[#e3def3] bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#5b18d5]"
              />
            </div>

            {transferAmount > 0 && (
              <div className="send-money-summary space-y-3 rounded-2xl border border-violet-100 bg-[#faf9ff] p-4">
                <div className="flex justify-between text-sm">
                  <span className="send-money-summary-muted">
                    Transfer amount
                  </span>

                  <span className="font-medium">
                    ₦
                    {transferAmount.toLocaleString(
                      "en-NG",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="send-money-summary-muted">
                    Transfer fee
                  </span>

                  <span className="font-medium">
                    ₦
                    {transferFee.toLocaleString(
                      "en-NG",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </span>
                </div>

                <div className="border-t pt-3 flex justify-between">
                  <span className="font-semibold">
                    Total to be deducted
                  </span>

                  <span className="font-bold text-green-700">
                    ₦
                    {totalCharged.toLocaleString(
                      "en-NG",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </span>
                </div>

                {transferType === "bank" && (
                  <div className="send-money-bank-fee-info rounded-md bg-yellow-50 border border-yellow-200 p-3">
                    <p className="send-money-bank-fee-info-text text-xs text-yellow-800">
                      A ₦10 IyanjuPay transfer fee will be deducted from your wallet in addition to the transfer amount.
                    </p>
                  </div>
                )}

                {transferType === "iyanjupay" && (
                  <div className="send-money-free-info rounded-md bg-violet-50 border border-green-200 p-3">
                    <p className="send-money-free-info-text text-xs text-green-800">
                      IyanjuPay-to-IyanjuPay transfers are completely free. No transfer fee will be deducted.
                    </p>
                  </div>
                )}
              </div>
            )}

            {hasInsufficientBalance && (
              <div className="send-money-warning rounded-md bg-red-50 border border-red-200 p-3">
                <p className="send-money-warning-text text-sm text-red-700">
                  Insufficient wallet balance.
                  You need ₦
                  {totalCharged.toLocaleString(
                    "en-NG",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}{" "}
                  to complete this transfer.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="narration"
                className="send-money-label text-sm font-semibold text-slate-800"
              >
                Narration (Optional)
              </Label>

              <Input
                id="narration"
                value={narration}
                onChange={(e) =>
                  setNarration(
                    e.target.value
                  )
                }
                placeholder="Enter transaction description"
                disabled={!isOnline}
                className="send-money-input h-12 rounded-xl border-[#e3def3] bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#5b18d5]"
              />
            </div>

            <Button
              type="button"
              onClick={handleTransfer}
              disabled={isTransferDisabled}
              className="send-money-gradient-button h-12 w-full rounded-full bg-gradient-to-r from-[#6515d8] to-[#4510c6] text-base font-semibold text-white shadow-[0_8px_18px_rgba(75,19,200,0.22)] hover:from-[#5710c5] hover:to-[#390da9]"
            >
              {!isOnline ? (
                <>
                  <WifiOff className="h-4 w-4 mr-2" />
                  No Internet Connection
                </>
              ) : checkingPaymentPin ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking Payment PIN...
                </>
              ) : iyanjupayTransferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing transfer...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Continue
                </>
              )}
            </Button>
          </div>
        </main>
      </div>

      <Dialog
        open={createPinOpen}
        onOpenChange={(open) => {
          if (!open && !creatingPin) {
            handleCreatePinCancel();
          }
        }}
      >
        <DialogContent
          className="send-money-dialog sm:max-w-md"
          onInteractOutside={(event) => {
            if (creatingPin) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (creatingPin) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="send-money-dialog-title flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Create Payment PIN
            </DialogTitle>

            <DialogDescription className="send-money-dialog-description">
              You need a 4-digit Payment PIN before you can make payments or transfers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="send-money-pin-info rounded-lg border p-3">
              <p className="send-money-pin-info-text text-sm">
                Your Payment PIN is used to authorize transactions securely. Do not share it with anyone.
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="newPaymentPin"
                className="send-money-dialog-label"
              >
                Create 4-digit PIN
              </Label>

              <Input
                ref={createPinInputRef}
                id="newPaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={newPin}
                onChange={(e) => {
                  const value =
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        4
                      );

                  setNewPin(value);

                  if (createPinError) {
                    setCreatePinError("");
                  }
                }}
                placeholder="••••"
                disabled={creatingPin}
                className="send-money-dialog-input text-center text-2xl tracking-[0.5em]"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPaymentPin"
                className="send-money-dialog-label"
              >
                Confirm Payment PIN
              </Label>

              <Input
                id="confirmPaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  const value =
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        4
                      );

                  setConfirmPin(value);

                  if (createPinError) {
                    setCreatePinError("");
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !creatingPin
                  ) {
                    e.preventDefault();
                    handleCreatePin();
                  }
                }}
                placeholder="••••"
                disabled={creatingPin}
                className="send-money-dialog-input text-center text-2xl tracking-[0.5em]"
              />
            </div>

            {createPinError && (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {createPinError}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleCreatePinCancel}
              disabled={creatingPin}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="flex-1 bg-violet-600 hover:bg-blue-700 text-white"
              onClick={handleCreatePin}
              disabled={
                creatingPin ||
                newPin.length !== 4 ||
                confirmPin.length !== 4 ||
                !isOnline
              }
            >
              {creatingPin ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create PIN"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentPinModal
        open={paymentPinOpen}
        onCancel={handlePaymentPinCancel}
        onVerified={handlePaymentPinVerified}
        title="Authorize Transfer"
        description="Enter your 4-digit Payment PIN to authorize this transfer."
      />
    </>
  );
};

export default SendMoneyPage;
