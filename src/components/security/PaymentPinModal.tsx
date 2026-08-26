import React, { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface PaymentPinModalProps {
  open: boolean;
  onCancel: () => void;
  onVerified: () => void;
  title?: string;
  description?: string;
}

const PaymentPinModal: React.FC<PaymentPinModalProps> = ({
  open,
  onCancel,
  onVerified,
  title = "Enter Payment PIN",
  description = "Enter your 4-digit Payment PIN to authorize this transaction.",
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Reset the modal whenever it opens.
   */
  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setLoading(false);
      setLockedUntil(null);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  /*
   * Keep PIN numeric and limited to 4 digits.
   */
  const handlePinChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value.replace(/\D/g, "").slice(0, 4);

    setPin(value);

    if (error) {
      setError("");
    }
  };

  /*
   * Verify the Payment PIN.
   */
  const handleVerify = async () => {
    if (pin.length !== 4) {
      setError("Enter your 4-digit Payment PIN.");
      return;
    }

    setLoading(true);
    setError("");
    setLockedUntil(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "verify_payment_pin",
        {
          _pin: pin,
        }
      );

      if (rpcError) {
        console.error(
          "Payment PIN verification error:",
          rpcError
        );

        setError(
          rpcError.message ||
            "Unable to verify Payment PIN. Please try again."
        );

        return;
      }

      if (!data?.success) {
        if (data?.locked_until) {
          setLockedUntil(data.locked_until);
        }

        setError(
          data?.message ||
            "Invalid Payment PIN."
        );

        return;
      }

      /*
       * PIN verified successfully.
       */
      setPin("");
      setError("");
      setLockedUntil(null);

      onVerified();
    } catch (err) {
      console.error(
        "Unexpected Payment PIN verification error:",
        err
      );

      setError(
        "Something went wrong while verifying your Payment PIN."
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Allow Enter key to submit.
   */
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();

      if (!loading) {
        handleVerify();
      }
    }
  };

  /*
   * Prevent closing while verification is running.
   */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !loading) {
      onCancel();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>

          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={handlePinChange}
              onKeyDown={handleKeyDown}
              placeholder="••••"
              disabled={loading}
              className="text-center text-2xl tracking-[0.5em]"
              aria-label="Payment PIN"
            />
          </div>

          {error && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}

              {lockedUntil && (
                <div className="mt-1 text-xs">
                  Please try again after the lock expires.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="flex-1"
              onClick={handleVerify}
              disabled={loading || pin.length !== 4}
            >
              {loading ? "Verifying..." : "Verify PIN"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentPinModal;
