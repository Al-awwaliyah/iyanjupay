import React, { useEffect, useRef, useState } from 'react';
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
import { useToast } from "@/hooks/use-toast";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onTransfer: (amount: number, details: any) => void;
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

const TransferModal = ({
  isOpen,
  onClose,
  walletBalance,
  onTransfer,
}: TransferModalProps) => {
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [narration, setNarration] = useState('');

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);

  const [resolvedAccount, setResolvedAccount] =
    useState<ResolvedAccount | null>(null);

  const [resolving, setResolving] = useState(false);

  // Used to prevent an older Flutterwave response from
  // overwriting a newer bank/account selection.
  const resolveRequestRef = useRef(0);

  const { toast } = useToast();

  // ------------------------------------------------------------
  // Load banks
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const loadBanks = async () => {
      setBanksLoading(true);

      try {
        const { data, error } =
          await supabase.functions.invoke("flutterwave-banks");

        if (error) {
          throw error;
        }

        if (!data?.success || !Array.isArray(data?.banks)) {
          throw new Error(
            data?.error || "Unable to load banks"
          );
        }

        setBanks(data.banks);
      } catch (error: any) {
        console.error("Bank loading error:", error);

        toast({
          title: "Unable to load banks",
          description:
            error?.message ||
            "Please try again later.",
          variant: "destructive",
        });
      } finally {
        setBanksLoading(false);
      }
    };

    loadBanks();
  }, [isOpen, toast]);

  // ------------------------------------------------------------
  // Automatically resolve account
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const cleanAccountNumber =
      accountNumber.replace(/\D/g, "");

    // Do not resolve until both bank and account number
    // are ready.
    if (
      !bank ||
      !/^\d{10}$/.test(cleanAccountNumber)
    ) {
      setResolvedAccount(null);
      setResolving(false);
      return;
    }

    const requestId = ++resolveRequestRef.current;

    // Small debounce so Flutterwave is not called
    // immediately on every input update.
    const timeout = window.setTimeout(async () => {
      setResolving(true);
      setResolvedAccount(null);

      try {
        const { data, error } =
          await supabase.functions.invoke(
            "resolve-bank-account",
            {
              body: {
                account_number: cleanAccountNumber,
                account_bank: bank,
              },
            }
          );

        // Ignore response if a newer request has started.
        if (requestId !== resolveRequestRef.current) {
          return;
        }

        if (error) {
          console.error(
            "Resolve account function error:",
            error
          );

          throw new Error(
            error.message ||
              "Unable to verify bank account"
          );
        }

        if (!data?.success || !data?.account) {
          throw new Error(
            data?.error ||
              "Bank account could not be verified"
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
        // Ignore errors from stale requests.
        if (requestId !== resolveRequestRef.current) {
          return;
        }

        console.error(
          "Account resolution failed:",
          error
        );

        toast({
          title: "Account verification failed",
          description:
            error?.message ||
            "We could not verify this bank account.",
          variant: "destructive",
        });
      } finally {
        if (requestId === resolveRequestRef.current) {
          setResolving(false);
        }
      }
    }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accountNumber, bank, isOpen, toast]);

  // ------------------------------------------------------------
  // Transfer
  // ------------------------------------------------------------

  const handleTransfer = () => {
    const transferAmount = Number(amount);

    if (
      !Number.isFinite(transferAmount) ||
      transferAmount <= 0
    ) {
      toast({
        title: "Invalid amount",
        description:
          "Please enter a valid transfer amount.",
        variant: "destructive",
      });
      return;
    }

    if (transferAmount > walletBalance) {
      toast({
        title: "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!resolvedAccount) {
      toast({
        title: "Account not verified",
        description:
          "Please enter a valid 10-digit account number and wait for verification.",
        variant: "destructive",
      });
      return;
    }

    const selectedBank = banks.find(
      (item) =>
        item.code === resolvedAccount.bank_code
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

      type: "transfer",
    };

    onTransfer(transferAmount, details);

    handleClose();
  };

  // ------------------------------------------------------------
  // Close/reset
  // ------------------------------------------------------------

  const handleClose = () => {
    // Invalidate any request currently in flight.
    resolveRequestRef.current++;

    setAmount('');
    setBank('');
    setAccountNumber('');
    setNarration('');
    setResolvedAccount(null);
    setResolving(false);

    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700 flex items-center justify-center gap-2">
            <Send className="h-5 w-5" />
            Transfer Money
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Wallet Balance */}
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance: ₦
              {walletBalance.toLocaleString()}
            </p>
          </div>

          {/* Bank */}
          <div className="space-y-2">
            <Label htmlFor="bank">
              Recipient Bank
            </Label>

            <Select
              value={bank}
              onValueChange={(value) => {
                // Invalidate previous resolution.
                resolveRequestRef.current++;

                setBank(value);
                setResolvedAccount(null);
                setResolving(false);
              }}
              disabled={banksLoading}
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
                {banks.map((bankItem) => (
                  <SelectItem
                    key={bankItem.code}
                    value={bankItem.code}
                  >
                    {bankItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">
              Account Number
            </Label>

            <Input
              id="accountNumber"
              value={accountNumber}
              onChange={(e) => {
                const value =
                  e.target.value.replace(/\D/g, "");

                // Invalidate previous resolution whenever
                // account number changes.
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
            />

            {/* Automatic verification status */}
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
                <p className="text-xs text-gray-500">
                  Enter all 10 digits to automatically
                  verify the account.
                </p>
              )}
          </div>

          {/* Resolved Account */}
          {resolvedAccount && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />

                <div className="min-w-0">
                  <p className="text-xs text-green-700 font-medium">
                    VERIFIED ACCOUNT
                  </p>

                  <p className="font-semibold text-gray-900 mt-1 break-words">
                    {resolvedAccount.account_name}
                  </p>

                  <p className="text-sm text-gray-600">
                    {resolvedAccount.account_number}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
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
            />
          </div>

          {/* Narration */}
          <div className="space-y-2">
            <Label htmlFor="narration">
              Narration (Optional)
            </Label>

            <Input
              id="narration"
              value={narration}
              onChange={(e) =>
                setNarration(e.target.value)
              }
              placeholder="Enter transaction description"
            />
          </div>

          {/* Send */}
          <Button
            onClick={handleTransfer}
            disabled={
              !resolvedAccount ||
              !amount ||
              resolving
            }
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {resolving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying Account...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Money
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferModal;
