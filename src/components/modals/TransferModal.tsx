import React, { useEffect, useState } from 'react';
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

  const { toast } = useToast();

  // ------------------------------------------------------------
  // Load banks
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const loadBanks = async () => {
      setBanksLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke(
          "flutterwave-banks"
        );

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
  // Reset resolved account when bank/account changes
  // ------------------------------------------------------------

  useEffect(() => {
    setResolvedAccount(null);
  }, [bank, accountNumber]);

  // ------------------------------------------------------------
  // Resolve bank account
  // ------------------------------------------------------------

  const handleResolveAccount = async () => {
    const cleanAccountNumber = accountNumber.replace(/\D/g, "");

    if (!bank) {
      toast({
        title: "Select a bank",
        description:
          "Please select the recipient's bank first.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{10}$/.test(cleanAccountNumber)) {
      toast({
        title: "Invalid account number",
        description:
          "Enter the recipient's 10-digit account number.",
        variant: "destructive",
      });
      return;
    }

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

      if (error) {
        console.error(
          "Resolve account function error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to resolve bank account"
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
        description: data.account.account_name,
      });
    } catch (error: any) {
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
      setResolving(false);
    }
  };

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
        title: "Verify account first",
        description:
          "Please resolve and verify the recipient's bank account.",
        variant: "destructive",
      });
      return;
    }

    const selectedBank = banks.find(
      (item) => item.code === resolvedAccount.bank_code
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
    setAmount('');
    setBank('');
    setAccountNumber('');
    setNarration('');
    setResolvedAccount(null);
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
              onValueChange={setBank}
              disabled={banksLoading || resolving}
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

                setAccountNumber(
                  value.slice(0, 10)
                );
              }}
              placeholder="Enter 10-digit account number"
              maxLength={10}
              inputMode="numeric"
            />
          </div>

          {/* Resolve Button */}
          <Button
            type="button"
            onClick={handleResolveAccount}
            disabled={
              resolving ||
              !bank ||
              accountNumber.length !== 10
            }
            variant="outline"
            className="w-full"
          >
            {resolving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying Account...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Resolve Account
              </>
            )}
          </Button>

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
            <Send className="h-4 w-4 mr-2" />
            Send Money
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferModal;
