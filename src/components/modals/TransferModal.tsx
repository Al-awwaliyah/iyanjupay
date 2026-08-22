import React, {
  useEffect,
  useRef,
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
  Send,
  CheckCircle2,
  Loader2,
  User,
  Building2,
} from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;

  onTransfer: (
    amount: number,
    details: any
  ) => Promise<void>;

  onTransferSuccess?: () => Promise<void> | void;
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

type TransferType =
  | "iyanjupay"
  | "bank";

/**
 * ============================================================
 * TRANSFER FEES
 * ============================================================
 *
 * IyanjuPay → IyanjuPay
 * Fee = ₦0
 *
 * Bank transfer
 * Fee = ₦10
 */
const IYANJUPAY_TRANSFER_FEE = 0;
const BANK_TRANSFER_FEE = 10;

const TransferModal = ({
  isOpen,
  onClose,
  walletBalance,
  onTransfer,
  onTransferSuccess,
}: TransferModalProps) => {
  const [transferType, setTransferType] =
    useState<TransferType>("iyanjupay");

  const [amount, setAmount] =
    useState("");

  const [narration, setNarration] =
    useState("");

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

  // ==========================================================
  // BANK
  // ==========================================================

  const [bank, setBank] =
    useState("");

  const [accountNumber, setAccountNumber] =
    useState("");

  const [banks, setBanks] =
    useState<Bank[]>([]);

  const [banksLoading, setBanksLoading] =
    useState(false);

  const [
    resolvedAccount,
    setResolvedAccount,
  ] = useState<ResolvedAccount | null>(null);

  const [resolving, setResolving] =
    useState(false);

  const resolveRequestRef =
    useRef(0);

  const { toast } =
    useToast();

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
    transferAmount +
    transferFee;

  const hasInsufficientBalance =
    transferAmount > 0 &&
    totalCharged >
      walletBalance;

  // ==========================================================
  // LOAD BANKS
  // ==========================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
        console.error(
          "Bank loading error:",
          error
        );

        toast({
          title:
            "Unable to load banks",
          description:
            error?.message ||
            "Please try again later.",
          variant:
            "destructive",
        });
      } finally {
        setBanksLoading(false);
      }
    };

    loadBanks();
  }, [
    isOpen,
    toast,
  ]);

  // ==========================================================
  // RESOLVE BANK ACCOUNT
  // ==========================================================

  useEffect(() => {
    if (
      !isOpen ||
      transferType !== "bank"
    ) {
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

    const requestId =
      ++resolveRequestRef.current;

    const timeout =
      window.setTimeout(
        async () => {
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
              throw new Error(
                error.message ||
                  "Unable to verify bank account."
              );
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
              title:
                "Account verified",

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

            toast({
              title:
                "Account verification failed",

              description:
                error?.message ||
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
        },
        600
      );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    accountNumber,
    bank,
    isOpen,
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

    setTransferType(type);

    setAmount("");
    setNarration("");

    setIyanjuPayWalletId("");

    setIyanjuPayTransferring(false);

    setBank("");
    setAccountNumber("");

    setResolvedAccount(null);
    setResolving(false);
  };

  // ==========================================================
  // IYANJUPAY TRANSFER
  // ==========================================================

  const handleIyanjuPayTransfer =
    async (
      transferAmount: number
    ) => {
      const walletId =
        iyanjupayWalletId.trim();

      // --------------------------------------------------------
      // WALLET ID
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // AMOUNT
      // --------------------------------------------------------

      if (
        !Number.isFinite(
          transferAmount
        ) ||
        transferAmount <= 0
      ) {
        toast({
          title:
            "Invalid amount",

          description:
            "Please enter a valid transfer amount.",

          variant:
            "destructive",
        });

        return;
      }

      // --------------------------------------------------------
      // BALANCE
      // --------------------------------------------------------

      if (
        transferAmount >
        walletBalance
      ) {
        toast({
          title:
            "Insufficient Balance",

          description:
            `You need ₦${transferAmount.toLocaleString()} to complete this transfer.`,

          variant:
            "destructive",
        });

        return;
      }

      try {
        setIyanjuPayTransferring(true);

        const idempotencyKey =
          `iyanjupay_${crypto.randomUUID()}`;

        toast({
          title:
            "Processing transfer",

          description:
            "Please wait while we send the money.",
        });

        // ======================================================
        // IYANJUPAY EDGE FUNCTION
        // ======================================================

        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "iyanjuPay-transfer",
            {
              body: {
                wallet_id:
                  walletId,

                amount:
                  transferAmount,

                narration:
                  narration.trim() ||
                  "IyanjuPay transfer",

                idempotency_key:
                  idempotencyKey,
              },
            }
          );

        console.log(
          "IyanjuPay transfer response:",
          data
        );

        if (error) {
          console.error(
            "IyanjuPay transfer function error:",
            error
          );

          let message =
            error.message ||
            "Unable to process IyanjuPay transfer.";

          try {
            if (
              error.context &&
              typeof error.context.json ===
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

          throw new Error(message);
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "IyanjuPay transfer failed."
          );
        }

        // ======================================================
        // REFRESH WALLET
        // ======================================================

        if (onTransferSuccess) {
          await onTransferSuccess();
        }

        // ======================================================
        // SUCCESS
        // ======================================================

        toast({
          title:
            "Transfer Successful",

          description:
            data?.message ||
            `₦${transferAmount.toLocaleString()} sent successfully.`,
        });

        console.log(
          "IyanjuPay transfer completed:",
          {
            reference:
              data?.reference,

            transaction_id:
              data?.transaction_id,

            credit_transaction_id:
              data?.credit_transaction_id,

            amount:
              data?.amount,

            fee:
              data?.fee,

            total_charged:
              data?.total_charged,

            recipient_wallet_id:
              data?.recipient_wallet_id,
          }
        );

        handleClose();
      } catch (error: any) {
        console.error(
          "IyanjuPay transfer failed:",
          error
        );

        toast({
          title:
            "Transfer Failed",

          description:
            error?.message ||
            "Unable to complete IyanjuPay transfer.",

          variant:
            "destructive",
        });
      } finally {
        setIyanjuPayTransferring(false);
      }
    };

  // ==========================================================
  // MAIN TRANSFER HANDLER
  // ==========================================================

  const handleTransfer =
    async () => {
      const transferAmount =
        Number(amount);

      // --------------------------------------------------------
      // AMOUNT
      // --------------------------------------------------------

      if (
        !Number.isFinite(
          transferAmount
        ) ||
        transferAmount <= 0
      ) {
        toast({
          title:
            "Invalid amount",

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
        await handleIyanjuPayTransfer(
          transferAmount
        );

        return;
      }

      // --------------------------------------------------------
      // BANK BALANCE
      // --------------------------------------------------------

      const fee =
        BANK_TRANSFER_FEE;

      const total =
        transferAmount +
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

      // --------------------------------------------------------
      // BANK ACCOUNT
      // --------------------------------------------------------

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
          "Bank",

        bankCode:
          resolvedAccount.bank_code,

        accountNumber:
          resolvedAccount.account_number,

        narration,

        type:
          "transfer",

        transferAmount,

        fee,

        totalCharged:
          total,
      };

      // ======================================================
      // WAIT FOR BANK TRANSFER
      // ======================================================

      try {
        await onTransfer(
          transferAmount,
          details
        );

        if (onTransferSuccess) {
          await onTransferSuccess();
        }

        handleClose();
      } catch (error: any) {
        console.error(
          "Bank transfer failed:",
          error
        );

        toast({
          title:
            "Transfer Failed",

          description:
            error?.message ||
            "Unable to complete bank transfer.",

          variant:
            "destructive",
        });
      }
    };

  // ==========================================================
  // CLOSE / RESET
  // ==========================================================

  const handleClose =
    () => {
      resolveRequestRef.current++;

      setTransferType(
        "iyanjupay"
      );

      setAmount("");
      setNarration("");

      setIyanjuPayWalletId("");

      setIyanjuPayTransferring(false);

      setBank("");
      setAccountNumber("");

      setResolvedAccount(null);
      setResolving(false);

      onClose();
    };

  // ==========================================================
  // DISABLED
  // ==========================================================

  const isTransferDisabled =
    !amount ||
    transferAmount <= 0 ||
    hasInsufficientBalance ||
    iyanjupayTransferring ||
    (transferType ===
      "iyanjupay" &&
      !/^\d{8}$/.test(
        iyanjupayWalletId.trim()
      )) ||
    (transferType === "bank" &&
      (!resolvedAccount ||
        resolving));

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="text-center text-green-700 flex items-center justify-center gap-2">
            <Send className="h-5 w-5" />

            Transfer Money
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ================================================== */}
          {/* TRANSFER TYPE */}
          {/* ================================================== */}

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

          {/* ================================================== */}
          {/* BALANCE */}
          {/* ================================================== */}

          <div className="bg-green-50 p-3 rounded-lg">

            <p className="text-sm text-green-700">

              Wallet Balance: ₦
              {walletBalance.toLocaleString(
                undefined,
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}

            </p>

          </div>

          {/* ================================================== */}
          {/* IYANJUPAY USER */}
          {/* ================================================== */}

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

                    setIyanjuPayWalletId(
                      value.slice(
                        0,
                        8
                      )
                    );
                  }}
                  placeholder="Enter 8-digit Wallet ID"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={8}
                />

                <p className="text-xs text-gray-500">
                  Enter the recipient's
                  8-digit IyanjuPay Wallet ID.
                </p>

                {iyanjupayWalletId.length >
                  0 &&
                  iyanjupayWalletId.length <
                    8 && (
                    <p className="text-xs text-orange-600">
                      Wallet ID must contain
                      exactly 8 digits.
                    </p>
                  )}

                {iyanjupayWalletId.length ===
                  8 && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">

                    <div className="flex items-center gap-2">

                      <CheckCircle2 className="h-4 w-4 text-green-600" />

                      <p className="text-sm text-green-700">
                        Wallet ID format is valid.
                      </p>

                    </div>

                  </div>
                )}

              </div>

            </div>
          )}

          {/* ================================================== */}
          {/* BANK */}
          {/* ================================================== */}

          {transferType ===
            "bank" && (
            <div className="space-y-4">

              <div className="space-y-2">

                <Label htmlFor="bank">
                  Recipient Bank
                </Label>

                <Select
                  value={bank}
                  onValueChange={(value) => {
                    resolveRequestRef.current++;

                    setBank(value);

                    setResolvedAccount(
                      null
                    );

                    setResolving(false);
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

                    {banks.map(
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
                      Enter all 10 digits to
                      automatically verify
                      the account.
                    </p>
                  )}

              </div>

              {resolvedAccount && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">

                  <div className="flex items-start gap-3">

                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />

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

          {/* ================================================== */}
          {/* AMOUNT */}
          {/* ================================================== */}

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

          {/* ================================================== */}
          {/* FEE */}
          {/* ================================================== */}

          {transferAmount > 0 && (
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">

              <div className="flex justify-between text-sm">

                <span className="text-gray-600">
                  Transfer amount
                </span>

                <span className="font-medium">
                  ₦
                  {transferAmount.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </span>

              </div>

              <div className="flex justify-between text-sm">

                <span className="text-gray-600">
                  IyanjuPay transfer fee
                </span>

                <span className="font-medium">
                  ₦
                  {transferFee.toLocaleString(
                    undefined,
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
                    undefined,
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
                    A ₦10 IyanjuPay transfer
                    fee will be deducted from
                    your wallet in addition to
                    the transfer amount.
                  </p>

                </div>
              )}

              {transferType ===
                "iyanjupay" && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3">

                  <p className="text-xs text-green-800">
                    IyanjuPay-to-IyanjuPay
                    transfers are completely
                    free. No transfer fee will
                    be deducted.
                  </p>

                </div>
              )}

            </div>
          )}

          {/* ================================================== */}
          {/* INSUFFICIENT BALANCE */}
          {/* ================================================== */}

          {hasInsufficientBalance && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">

              <p className="text-sm text-red-700">

                Insufficient wallet balance.
                You need ₦
                {totalCharged.toLocaleString(
                  undefined,
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}{" "}
                to complete this transfer.

              </p>

            </div>
          )}

          {/* ================================================== */}
          {/* NARRATION */}
          {/* ================================================== */}

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

          {/* ================================================== */}
          {/* SEND */}
          {/* ================================================== */}

          <Button
            onClick={
              handleTransfer
            }
            disabled={
              isTransferDisabled
            }
            className="w-full bg-green-600 hover:bg-green-700"
          >

            {iyanjupayTransferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                Processing transfer...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />

                Send ₦
                {transferAmount > 0
                  ? transferAmount.toLocaleString()
                  : "Money"}
              </>
            )}

          </Button>

        </div>

      </DialogContent>
    </Dialog>
  );
};

export default TransferModal;
