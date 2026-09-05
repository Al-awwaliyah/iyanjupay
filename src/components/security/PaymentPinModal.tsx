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
    <>
      <style>{`
        /* =====================================================
           PAYMENT PIN MODAL
           LIGHT / NORMAL / BLUE THEME
           White background + dark text
           ===================================================== */

        .payment-pin-dialog {
          background-color: #ffffff !important;
          border-color: #e5e7eb !important;
          color: #111827 !important;
        }

        .payment-pin-dialog-title {
          color: #111827 !important;
        }

        .payment-pin-dialog-description {
          color: #4b5563 !important;
        }

        .payment-pin-input {
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          color: #111827 !important;
          caret-color: #111827 !important;
        }

        .payment-pin-input::placeholder {
          color: #9ca3af !important;
          opacity: 1 !important;
        }

        .payment-pin-input:focus {
          border-color: #818cf8 !important;
          box-shadow:
            0 0 0 2px
            rgba(129, 140, 248, 0.15) !important;
        }

        .payment-pin-cancel {
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          color: #111827 !important;
        }

        .payment-pin-cancel:hover {
          background-color: #f3f4f6 !important;
          color: #111827 !important;
        }

        /* =====================================================
           BLUE THEME
           Keep modal white and text dark
           ===================================================== */

        html[data-iyanjupay-theme="blue"]
          .payment-pin-dialog {
          background-color: #ffffff !important;
          border-color: #dbeafe !important;
          color: #111827 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .payment-pin-dialog-title {
          color: #111827 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .payment-pin-dialog-description {
          color: #4b5563 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .payment-pin-input {
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          color: #111827 !important;
          caret-color: #111827 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .payment-pin-cancel {
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          color: #111827 !important;
        }

        /* =====================================================
           DARK THEME
           Dark background + white text
           ===================================================== */

        html[data-iyanjupay-theme="dark"]
          .payment-pin-dialog {
          background-color: #111827 !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-dialog-title {
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-dialog-description {
          color: #cbd5e1 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          caret-color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-input::placeholder {
          color: #64748b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-input:focus {
          border-color: #818cf8 !important;
          box-shadow:
            0 0 0 2px
            rgba(129, 140, 248, 0.2) !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-cancel {
          background-color: #111827 !important;
          border-color: #475569 !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-cancel:hover {
          background-color: #1e293b !important;
          color: #ffffff !important;
        }

        /*
         * Error messages remain readable in both themes.
         */

        html[data-iyanjupay-theme="dark"]
          .payment-pin-error {
          background-color: rgba(127, 29, 29, 0.28) !important;
          border-color: rgba(248, 113, 113, 0.35) !important;
          color: #fca5a5 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .payment-pin-lock-message {
          color: #cbd5e1 !important;
        }
      `}</style>

      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
      >
        <DialogContent
          className="payment-pin-dialog sm:max-w-md"
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
            <DialogTitle className="payment-pin-dialog-title">
              {title}
            </DialogTitle>

            <DialogDescription className="payment-pin-dialog-description">
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
                className="payment-pin-input text-center text-2xl tracking-[0.5em]"
                aria-label="Payment PIN"
              />
            </div>

            {error && (
              <div
                className="payment-pin-error rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {error}

                {lockedUntil && (
                  <div className="payment-pin-lock-message mt-1 text-xs">
                    Please try again after the lock expires.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="payment-pin-cancel flex-1"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </Button>

              <Button
                type="button"
                className="flex-1 text-white"
                onClick={handleVerify}
                disabled={
                  loading ||
                  pin.length !== 4
                }
              >
                {loading
                  ? "Verifying..."
                  : "Verify PIN"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PaymentPinModal;
