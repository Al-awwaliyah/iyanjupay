import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Loader2,
  User,
  Building2,
  Search,
  ShieldCheck,
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

import PaymentPinModal from "@/components/security/PaymentPinModal";
import TransactionProcessingPage from "@/pages/TransactionProcessing";

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

interface ProcessingTransfer {
  transferType: "iyanjupay" | "bank";
  amount: number;
  details: any;
  idempotencyKey: string;
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
  const { toast } = useToast();

  // ==========================================================
  // PROCESSING PAGE
  // ==========================================================

  const [processingTransfer, setProcessingTransfer] =
    useState<ProcessingTransfer | null>(null);

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

  /**
   * Whether the authenticated user has a Payment PIN.
   */
  const [hasPaymentPin, setHasPaymentPin] =
    useState<boolean | null>(null);

  /**
   * Loading state while checking PIN existence.
   */
  const [checkingPaymentPin, setCheckingPaymentPin] =
    useState(false);

  /**
   * Create Payment PIN dialog.
   */
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

  /**
   * This stores the transfer action that was waiting
   * for the user to create a PIN.
   */
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
  // CHECK PAYMENT PIN
  // ==========================================================

  const checkPaymentPin = async (): Promise<boolean> => {
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
          title: "Unable to check Payment PIN",
          description:
            error.message ||
            "Please try again.",
          variant: "destructive",
        });

        return false;
      }

      /**
       * Supabase RPC may return:
       *
       * true
       *
       * or:
       *
       * { has_payment_pin: true }
       *
       * Support both formats.
       */
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
        title: "Unable to check Payment PIN",
        description:
          error?.message ||
          "Please try again.",
        variant: "destructive",
      });

      return false;
    } finally {
      setCheckingPaymentPin(false);
    }
  };

  /**
   * Check Payment PIN when the page loads.
   */
  useEffect(() => {
    checkPaymentPin();
  }, []);

  /**
   * Focus create-PIN input when dialog opens.
   */
  useEffect(() => {
    if (!createPinOpen) {
      return;
    }

    setTimeout(() => {
      createPinInputRef.current?.focus();
    }, 100);
  }, [createPinOpen]);

  // ==========================================================
  // FILTER BANKS
  // ==========================================================

  const filteredBanks = banks.filter(
    (bankItem) =>
      bankItem.name
        .toLowerCase()
        .includes(
          bankSearch.trim().toLowerCase()
        )
  );

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
            data?.error ||
              "Unable to load banks."
          );
        }

        setBanks(data.banks);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        console.error(
          "Bank loading error:",
          error
        );

        toast({
          title: "Unable to load banks",
          description:
            error?.message ||
            "Please try again later.",
          variant: "destructive",
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
  }, [toast]);

  // ==========================================================
  // RESOLVE BANK ACCOUNT
  // ==========================================================

  useEffect(() => {
    if (transferType !== "bank") {
      return;
    }

    const cleanAccountNumber =
      accountNumber.replace(/\D/g, "");

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

    const requestId =
      ++resolveRequestRef.current;

    const timeout =
      window.setTimeout(async () => {
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
                  account_bank: bank,
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
              error.message ||
              "Unable to verify bank account.";

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

          if (
            !data?.success ||
            !data?.account
          ) {
            throw new Error(
              data?.error ||
                "Bank account could not be verified."
            );
          }

          setResolvedAccount({
            account_number:
              data.account.account_number,
            account_name:
              data.account.account_name,
            bank_code:
              data.account.bank_code,
          });

          toast({
            title: "Account verified",
            description:
              data.account.account_name,
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

          setResolvedAccount(null);

          toast({
            title:
              "Account verification failed",
            description:
              error?.message ||
              "We could not verify this bank account.",
            variant: "destructive",
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
      !/^\d{8}$/.test(cleanWalletId)
    ) {
      iyanjuPayResolveRequestRef.current++;

      setResolvedIyanjuPayRecipient(null);
      setResolvingIyanjuPayRecipient(false);

      return;
    }

    const requestId =
      ++iyanjuPayResolveRequestRef.current;

    const timeout =
      window.setTimeout(async () => {
        setResolvingIyanjuPayRecipient(true);
        setResolvedIyanjuPayRecipient(null);

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
              error.message ||
              "Unable to verify recipient.";

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

          if (
            !data?.success ||
            !data?.recipient
          ) {
            throw new Error(
              data?.error ||
                data?.message ||
                "IyanjuPay Wallet ID could not be verified."
            );
          }

          setResolvedIyanjuPayRecipient({
            wallet_id:
              data.recipient.wallet_id,
            name:
              data.recipient.name,
            full_name:
              data.recipient.full_name ??
              null,
            nickname:
              data.recipient.nickname ??
              null,
          });

          toast({
            title: "Recipient verified",
            description:
              data.recipient.name,
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

          setResolvedIyanjuPayRecipient(null);

          toast({
            title:
              "Wallet ID verification failed",
            description:
              error?.message ||
              "We could not find this IyanjuPay Wallet ID.",
            variant: "destructive",
          });
        } finally {
          if (
            requestId ===
            iyanjuPayResolveRequestRef.current
          ) {
            setResolvingIyanjuPayRecipient(false);
          }
        }
      }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    iyanjupayWalletId,
    transferType,
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
    setResolvedIyanjuPayRecipient(null);
    setResolvingIyanjuPayRecipient(false);
    setIyanjuPayTransferring(false);

    setBank("");
    setBankSearch("");
    setAccountNumber("");

    setResolvedAccount(null);
    setResolving(false);

    setPaymentPinOpen(false);
    setPendingBankTransfer(null);
    setProcessingTransfer(null);
  };

  // ==========================================================
  // CREATE PAYMENT PIN
  // ==========================================================

  const handleCreatePin = async () => {
    setCreatePinError("");

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
          error.message ||
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

      /**
       * PIN successfully created.
       */
      setHasPaymentPin(true);

      setNewPin("");
      setConfirmPin("");
      setCreatePinError("");

      setCreatePinOpen(false);

      toast({
        title: "Payment PIN created",
        description:
          "Your Payment PIN has been created successfully.",
      });

      /**
       * If a transfer was waiting for PIN creation,
       * immediately continue to PIN authorization.
       */
      if (pendingPinAction) {
        setPendingPinAction(false);

        setTimeout(() => {
          setPaymentPinOpen(true);
        }, 150);
      }
    } catch (error: any) {
      console.error(
        "Unexpected create Payment PIN error:",
        error
      );

      setCreatePinError(
        error?.message ||
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

    /**
     * The transfer is cancelled if the user
     * chooses not to create a PIN.
     */
    setPendingPinAction(false);
  };

  // ==========================================================
  // PREPARE TRANSFER
  // ==========================================================

  const handleTransfer = async () => {
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
        variant: "destructive",
      });

      return;
    }

    // --------------------------------------------------------
    // IYANJUPAY
    // --------------------------------------------------------

    if (transferType === "iyanjupay") {
      const walletId =
        iyanjupayWalletId.trim();

      if (
        !/^\d{8}$/.test(walletId)
      ) {
        toast({
          title: "Invalid Wallet ID",
          description:
            "IyanjuPay Wallet ID must be exactly 8 digits.",
          variant: "destructive",
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
          variant: "destructive",
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
          variant: "destructive",
        });

        return;
      }

      /**
       * ======================================================
       * PAYMENT PIN CHECK
       * ======================================================
       *
       * Before opening the PIN verification modal,
       * verify that the user actually has a PIN.
       */

      const pinExists =
        hasPaymentPin !== null
          ? hasPaymentPin
          : await checkPaymentPin();

      if (!pinExists) {
        /**
         * Store the fact that this transfer should continue
         * after PIN creation.
         */
        setPendingPinAction(true);

        setCreatePinError("");
        setNewPin("");
        setConfirmPin("");

        setCreatePinOpen(true);

        return;
      }

      /**
       * PIN exists.
       *
       * Ask the user to authorize the transfer.
       */
      setPaymentPinOpen(true);

      return;
    }

    // --------------------------------------------------------
    // BANK
    // --------------------------------------------------------

    const fee = BANK_TRANSFER_FEE;

    const total =
      transferAmountValue + fee;

    if (total > walletBalance) {
      toast({
        title:
          "Insufficient Balance",
        description:
          `You need ₦${total.toLocaleString()} to complete this transfer.`,
        variant: "destructive",
      });

      return;
    }

    if (!resolvedAccount) {
      toast({
        title:
          "Account not verified",
        description:
          "Please enter a valid 10-digit account number and wait for verification.",
        variant: "destructive",
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
        "Bank",

      bankCode:
        resolvedAccount.bank_code,

      accountNumber:
        resolvedAccount.account_number,

      narration:
        narration.trim() ||
        "Bank transfer",

      type: "transfer",

      transferAmount:
        transferAmountValue,

      fee,

      totalCharged: total,
    };

    /**
     * Store the validated bank transfer.
     * Nothing is executed yet.
     */
    setPendingBankTransfer({
      amount:
        transferAmountValue,
      details,
    });

    /**
     * ======================================================
     * PAYMENT PIN CHECK
     * ======================================================
     */

    const pinExists =
      hasPaymentPin !== null
        ? hasPaymentPin
        : await checkPaymentPin();

    if (!pinExists) {
      setPendingPinAction(true);

      setCreatePinError("");
      setNewPin("");
      setConfirmPin("");

      setCreatePinOpen(true);

      return;
    }

    /**
     * PIN exists.
     */
    setPaymentPinOpen(true);
  };

  // ==========================================================
  // PAYMENT PIN VERIFIED
  // ==========================================================

  const handlePaymentPinVerified =
    async () => {
      /**
       * Close PIN modal immediately.
       */
      setPaymentPinOpen(false);

      /**
       * Prevent accidental second submission.
       */
      if (processingTransfer) {
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

        /**
         * Move to processing page.
         *
         * TransactionProcessingPage executes
         * the actual Edge Function.
         */
        setProcessingTransfer({
          transferType:
            "iyanjupay",

          amount:
            transferAmountValue,

          details,

          idempotencyKey,
        });

        return;
      }

      // ------------------------------------------------------
      // BANK
      // ------------------------------------------------------

      if (pendingBankTransfer) {
        const {
          amount:
            transferAmountValue,
          details,
        } = pendingBankTransfer;

        const idempotencyKey =
          `bank_${crypto.randomUUID()}`;

        /**
         * Clear immediately so the same
         * transfer cannot be submitted twice.
         */
        setPendingBankTransfer(null);

        /**
         * Move to processing page.
         */
        setProcessingTransfer({
          transferType:
            "bank",

          amount:
            transferAmountValue,

          details,

          idempotencyKey,
        });
      }
    };

  // ==========================================================
  // PAYMENT PIN CANCEL
  // ==========================================================

  const handlePaymentPinCancel =
    () => {
      setPaymentPinOpen(false);
      setPendingBankTransfer(null);
      setPendingPinAction(false);
    };

  // ==========================================================
  // PROCESSING DONE
  // ==========================================================

  const handleProcessingDone =
    async () => {
      setProcessingTransfer(null);

      /**
       * Refresh wallet/dashboard data.
       */
      if (onTransferSuccess) {
        try {
          await onTransferSuccess();
        } catch (error) {
          console.error(
            "Wallet refresh after transfer:",
            error
          );
        }
      }

      /**
       * Return to Dashboard.
       */
      handleBack();
    };

  // ==========================================================
  // PROCESSING BACK
  // ==========================================================

  const handleProcessingBack =
    () => {
      setProcessingTransfer(null);
    };

  // ==========================================================
  // BACK
  // ==========================================================

  const handleBack = () => {
    resolveRequestRef.current++;
    iyanjuPayResolveRequestRef.current++;

    setPaymentPinOpen(false);
    setCreatePinOpen(false);

    setPendingBankTransfer(null);
    setPendingPinAction(false);

    setProcessingTransfer(null);

    setTransferType("iyanjupay");

    setAmount("");
    setNarration("");

    setIyanjuPayWalletId("");

    setResolvedIyanjuPayRecipient(
      null
    );

    setResolvingIyanjuPayRecipient(
      false
    );

    setIyanjuPayTransferring(false);

    setBank("");
    setBankSearch("");
    setAccountNumber("");

    setResolvedAccount(null);
    setResolving(false);

    onBack();
  };

  // ==========================================================
  // PROCESSING SCREEN
  // ==========================================================

  if (processingTransfer) {
    return (
      <TransactionProcessingPage
        transferType={
          processingTransfer.transferType
        }
        amount={
          processingTransfer.amount
        }
        details={
          processingTransfer.details
        }
        idempotencyKey={
          processingTransfer.idempotencyKey
        }
        onDone={
          handleProcessingDone
        }
        onBack={
          handleProcessingBack
        }
      />
    );
  }

  // ==========================================================
  // DISABLED
  // ==========================================================

  const isTransferDisabled =
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
    (transferType === "bank" &&
      (
        !resolvedAccount ||
        resolving
      ));

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        {/* HEADER */}

        <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center h-16">

              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="text-white hover:bg-white/20 mr-2"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Send className="h-5 w-5" />

                <h1 className="text-lg sm:text-xl font-bold">
                  Send Money
                </h1>
              </div>

            </div>
          </div>
        </header>

        {/* CONTENT */}

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-12">

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Send Money
            </h2>

            <p className="text-gray-600 mt-1">
              Send money securely to an IyanjuPay user or bank account.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6 space-y-6">

            {/* TRANSFER TYPE */}

            <div className="space-y-2">
              <Label>
                Send Money To
              </Label>

              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">

                <Button
                  type="button"
                  variant={
                    transferType ===
                    "iyanjupay"
                      ? "default"
                      : "ghost"
                  }
                  onClick={() =>
                    handleTransferTypeChange(
                      "iyanjupay"
                    )
                  }
                  className={
                    transferType ===
                    "iyanjupay"
                      ? "bg-green-600 hover:bg-green-700"
                      : ""
                  }
                >
                  <User className="h-4 w-4 mr-2" />
                  IyanjuPay User
                </Button>

                <Button
                  type="button"
                  variant={
                    transferType ===
                    "bank"
                      ? "default"
                      : "ghost"
                  }
                  onClick={() =>
                    handleTransferTypeChange(
                      "bank"
                    )
                  }
                  className={
                    transferType ===
                    "bank"
                      ? "bg-green-600 hover:bg-green-700"
                      : ""
                  }
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Bank Account
                </Button>

              </div>
            </div>

            {/* BALANCE */}

            <div className="bg-green-50 border border-green-100 p-4 rounded-xl">

              <p className="text-sm text-green-700">
                Available Wallet Balance
              </p>

              <p className="text-2xl font-bold text-green-800 mt-1">
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

            {/* IYANJUPAY */}

            {transferType ===
              "iyanjupay" && (
              <div className="space-y-4">

                <div className="space-y-2">

                  <Label htmlFor="iyanjupayWalletId">
                    Recipient Wallet ID
                  </Label>

                  <Input
                    id="iyanjupayWalletId"
                    value={
                      iyanjupayWalletId
                    }
                    onChange={(e) => {
                      const value =
                        e.target.value.replace(
                          /\D/g,
                          ""
                        );

                      iyanjuPayResolveRequestRef.current++;

                      setIyanjuPayWalletId(
                        value.slice(
                          0,
                          8
                        )
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
                  />

                  <p className="text-xs text-gray-500">
                    Enter the recipient's 8-digit IyanjuPay Wallet ID.
                  </p>

                  {iyanjupayWalletId.length >
                    0 &&
                    iyanjupayWalletId.length <
                      8 && (
                    <p className="text-xs text-orange-600">
                      Wallet ID must contain exactly 8 digits.
                    </p>
                  )}

                  {resolvingIyanjuPayRecipient &&
                    iyanjupayWalletId.length ===
                      8 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />

                        <p className="text-sm text-blue-700">
                          Verifying recipient...
                        </p>
                      </div>
                    </div>
                  )}

                  {!resolvingIyanjuPayRecipient &&
                    resolvedIyanjuPayRecipient && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <div className="flex items-start gap-3">

                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />

                        <div className="min-w-0">

                          <p className="text-xs text-green-700 font-medium">
                            VERIFIED RECIPIENT
                          </p>

                          <p className="font-semibold text-gray-900 mt-1 break-words">
                            {
                              resolvedIyanjuPayRecipient.name
                            }
                          </p>

                          <p className="text-sm text-gray-600">
                            Wallet ID:{" "}
                            {
                              resolvedIyanjuPayRecipient.wallet_id
                            }
                          </p>

                        </div>

                      </div>
                    </div>
                  )}

                  {!resolvingIyanjuPayRecipient &&
                    iyanjupayWalletId.length ===
                      8 &&
                    !resolvedIyanjuPayRecipient && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm text-red-700">
                        Wallet ID could not be verified. Please check the recipient's Wallet ID.
                      </p>
                    </div>
                  )}

                </div>

              </div>
            )}

            {/* BANK */}

            {transferType ===
              "bank" && (
              <div className="space-y-5">

                <div className="space-y-2">

                  <Label htmlFor="bank">
                    Recipient Bank
                  </Label>

                  <Select
                    value={bank}
                    onValueChange={(value) => {
                      resolveRequestRef.current++;

                      setBank(value);
                      setResolvedAccount(null);
                      setResolving(false);
                      setBankSearch("");
                    }}
                    disabled={
                      banksLoading
                    }
                  >

                    <SelectTrigger id="bank">
                      <SelectValue
                        placeholder={
                          banksLoading
                            ? "Loading banks..."
                            : "Select bank"
                        }
                      />
                    </SelectTrigger>

                    <SelectContent>

                      <div
                        className="sticky top-0 z-10 bg-white p-2 border-b"
                        onPointerDown={(e) =>
                          e.stopPropagation()
                        }
                        onKeyDown={(e) =>
                          e.stopPropagation()
                        }
                      >
                        <div className="relative">

                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

                          <Input
                            value={
                              bankSearch
                            }
                            onChange={(e) =>
                              setBankSearch(
                                e.target.value
                              )
                            }
                            onKeyDown={(e) =>
                              e.stopPropagation()
                            }
                            placeholder="Search bank name..."
                            className="pl-9"
                            autoComplete="off"
                          />

                        </div>
                      </div>

                      {banksLoading ? (
                        <div className="flex items-center justify-center gap-2 p-4 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading banks...
                        </div>
                      ) : filteredBanks.length >
                        0 ? (
                        filteredBanks.map(
                          (
                            bankItem
                          ) => (
                            <SelectItem
                              key={
                                bankItem.code
                              }
                              value={
                                bankItem.code
                              }
                            >
                              {
                                bankItem.name
                              }
                            </SelectItem>
                          )
                        )
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500">
                          No bank found.
                        </div>
                      )}

                    </SelectContent>
                  </Select>

                </div>

                <div className="space-y-2">

                  <Label htmlFor="accountNumber">
                    Account Number
                  </Label>

                  <Input
                    id="accountNumber"
                    value={
                      accountNumber
                    }
                    onChange={(e) => {
                      const value =
                        e.target.value.replace(
                          /\D/g,
                          ""
                        );

                      resolveRequestRef.current++;

                      setAccountNumber(
                        value.slice(
                          0,
                          10
                        )
                      );

                      setResolvedAccount(
                        null
                      );

                      setResolving(false);
                    }}
                    placeholder="Enter 10-digit account number"
                    maxLength={10}
                    inputMode="numeric"
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
                    accountNumber.length >
                      0 &&
                    accountNumber.length <
                      10 && (
                    <p className="text-xs text-gray-500">
                      Enter all 10 digits to automatically verify the account.
                    </p>
                  )}

                </div>

                {resolvedAccount && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">

                    <div className="flex items-start gap-3">

                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />

                      <div className="min-w-0">

                        <p className="text-xs text-green-700 font-medium">
                          VERIFIED ACCOUNT
                        </p>

                        <p className="font-semibold text-gray-900 mt-1 break-words">
                          {
                            resolvedAccount.account_name
                          }
                        </p>

                        <p className="text-sm text-gray-600">
                          {
                            resolvedAccount.account_number
                          }
                        </p>

                      </div>

                    </div>

                  </div>
                )}

              </div>
            )}

            {/* AMOUNT */}

            <div className="space-y-2">

              <Label htmlFor="amount">
                Amount (₦)
              </Label>

              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) =>
                  setAmount(
                    e.target.value
                  )
                }
                placeholder="Enter amount"
                min="1"
                step="0.01"
              />

            </div>

            {/* FEE SUMMARY */}

            {transferAmount > 0 && (
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">

                <div className="flex justify-between text-sm">

                  <span className="text-gray-600">
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

                  <span className="text-gray-600">
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

                {transferType ===
                  "bank" && (
                  <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                    <p className="text-xs text-yellow-800">
                      A ₦10 IyanjuPay transfer fee will be deducted from your wallet in addition to the transfer amount.
                    </p>
                  </div>
                )}

                {transferType ===
                  "iyanjupay" && (
                  <div className="rounded-md bg-green-50 border border-green-200 p-3">
                    <p className="text-xs text-green-800">
                      IyanjuPay-to-IyanjuPay transfers are completely free. No transfer fee will be deducted.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* INSUFFICIENT */}

            {hasInsufficientBalance && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">
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

            {/* NARRATION */}

            <div className="space-y-2">

              <Label htmlFor="narration">
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
              />

            </div>

            {/* SEND */}

            <Button
              type="button"
              onClick={
                handleTransfer
              }
              disabled={
                isTransferDisabled
              }
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-base font-semibold"
            >
              {checkingPaymentPin ? (
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
                  <Send className="h-4 w-4 mr-2" />

                  Send ₦
                  {transferAmount > 0
                    ? transferAmount.toLocaleString(
                        "en-NG"
                      )
                    : "Money"}
                </>
              )}
            </Button>

          </div>
        </main>
      </div>

      {/* ======================================================
          CREATE PAYMENT PIN
          ====================================================== */}

      <Dialog
        open={createPinOpen}
        onOpenChange={(open) => {
          if (!open && !creatingPin) {
            handleCreatePinCancel();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
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
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Create Payment PIN
            </DialogTitle>

            <DialogDescription>
              You need a 4-digit Payment PIN before you can make payments or transfers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                Your Payment PIN is used to authorize transactions securely. Do not share it with anyone.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPaymentPin">
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
                      .replace(/\D/g, "")
                      .slice(0, 4);

                  setNewPin(value);

                  if (createPinError) {
                    setCreatePinError("");
                  }
                }}
                placeholder="••••"
                disabled={creatingPin}
                className="text-center text-2xl tracking-[0.5em]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPaymentPin">
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
                      .replace(/\D/g, "")
                      .slice(0, 4);

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
                className="text-center text-2xl tracking-[0.5em]"
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
              onClick={
                handleCreatePinCancel
              }
              disabled={creatingPin}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={
                handleCreatePin
              }
              disabled={
                creatingPin ||
                newPin.length !== 4 ||
                confirmPin.length !== 4
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

      {/* ======================================================
          PAYMENT PIN VERIFICATION
          ====================================================== */}

      <PaymentPinModal
        open={paymentPinOpen}
        onCancel={
          handlePaymentPinCancel
        }
        onVerified={
          handlePaymentPinVerified
        }
        title="Authorize Transfer"
        description="Enter your 4-digit Payment PIN to authorize this transfer."
      />
    </>
  );
};

export default SendMoneyPage;
