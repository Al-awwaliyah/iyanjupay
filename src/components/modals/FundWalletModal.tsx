import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Loader2, Building2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VirtualAccount {
  bank_name: string;
  account_number: string;
  account_name: string;
  provider: string;
  is_permanent: boolean;
  status: string;
}

const FundWalletModal = ({
  isOpen,
  onClose,
}: FundWalletModalProps) => {
  const { toast } = useToast();

  const [account, setAccount] = useState<VirtualAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [kycRequired, setKycRequired] = useState(false);

  const loadVirtualAccount = async () => {
    setLoading(true);
    setKycRequired(false);

    try {
      const { data, error } = await supabase.functions.invoke(
        "flutterwave-virtual-account"
      );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        if (data?.code === "KYC_REQUIRED") {
          setKycRequired(true);
          return;
        }

        throw new Error(
          data?.error || "Unable to get your dedicated bank account"
        );
      }

      if (data.account) {
        setAccount(data.account);
      }
    } catch (error: any) {
      console.error("Virtual account error:", error);

      toast({
        title: "Unable to load account",
        description:
          error?.message ||
          "We couldn't retrieve your dedicated bank account.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVirtualAccount();
    } else {
      setAccount(null);
      setKycRequired(false);
    }
  }, [isOpen]);

  const copyToClipboard = async (
    text: string,
    label: string
  ) => {
    try {
      await navigator.clipboard.writeText(text);

      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: `Unable to copy ${label.toLowerCase()}.`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            Fund Your Wallet
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm text-gray-500">
              Getting your dedicated bank account...
            </p>
          </div>
        ) : kycRequired ? (
          <div className="py-6 space-y-4 text-center">
            <ShieldCheck className="h-12 w-12 mx-auto" />

            <div>
              <h3 className="font-semibold text-lg">
                KYC Verification Required
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                Please complete your BVN or NIN verification before
                we can create your dedicated bank account.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={onClose}
            >
              Complete KYC
            </Button>
          </div>
        ) : account ? (
          <div className="space-y-5">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50">
                  <Building2 className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="font-semibold">
                    Your Dedicated Bank Account
                  </h3>

                  <p className="text-xs text-gray-500">
                    Transfer money to this account to fund your wallet
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Bank
                  </p>

                  <p className="font-semibold">
                    {account.bank_name}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Account Name
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {account.account_name}
                    </p>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          account.account_name,
                          "Account name"
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Account Number
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xl font-bold tracking-wide">
                      {account.account_number}
                    </p>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          account.account_number,
                          "Account number"
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-700">
                Transfer money from any Nigerian bank to this
                dedicated account. Once the transfer is confirmed,
                your wallet will be credited automatically.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">
              Your dedicated bank account could not be loaded.
            </p>

            <Button
              className="mt-4"
              onClick={loadVirtualAccount}
            >
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FundWalletModal;
