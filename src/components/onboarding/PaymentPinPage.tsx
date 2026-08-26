import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Step = "create" | "confirm";

const PaymentPinPage = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("create");

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handlePinChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 4);

    if (step === "create") {
      setPin(digitsOnly);
    } else {
      setConfirmPin(digitsOnly);
    }

    setError("");
  };

  const handleContinue = async () => {
    setError("");
    setSuccess("");

    if (step === "create") {
      if (pin.length !== 4) {
        setError("Payment PIN must be exactly 4 digits.");
        return;
      }

      setStep("confirm");
      return;
    }

    if (confirmPin.length !== 4) {
      setError("Please enter your 4-digit PIN again.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setLoading(true);

    try {
      /*
       * Confirm that the user is authenticated.
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Your session has expired. Please log in again.");
      }

      /*
       * Create the payment PIN through the protected RPC.
       *
       * The PIN itself is sent to PostgreSQL only for hashing.
       * We never store the plaintext PIN.
       */
      const { data, error: pinError } = await supabase.rpc(
        "create_payment_pin",
        {
          _pin: pin,
        }
      );

      if (pinError) {
        throw pinError;
      }

      if (!data?.success) {
        throw new Error(
          data?.message || "Unable to create your payment PIN."
        );
      }

      setSuccess("Payment PIN created successfully.");

      /*
       * Give the user a moment to see the success state,
       * then continue to the dashboard.
       */
      setTimeout(() => {
        navigate("/dashboard", {
          replace: true,
        });
      }, 800);
    } catch (err) {
      console.error("Payment PIN creation error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your payment PIN. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (loading) return;

    if (step === "confirm") {
      setStep("create");
      setConfirmPin("");
      setError("");
      return;
    }

    navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            {step === "create"
              ? "Create your Payment PIN"
              : "Confirm your Payment PIN"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === "create" ? (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Create a 4-digit PIN you'll use to authorize transactions
                  on IyanjuPay.
                </p>

                <p className="text-sm text-muted-foreground">
                  Keep your PIN private. Never share it with anyone.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="payment-pin"
                  className="text-sm font-medium"
                >
                  Payment PIN
                </label>

                <Input
                  id="payment-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em]"
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Enter your PIN again to confirm that it was entered
                  correctly.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirm-payment-pin"
                  className="text-sm font-medium"
                >
                  Confirm Payment PIN
                </label>

                <Input
                  id="confirm-payment-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em]"
                  disabled={loading}
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleBack}
              disabled={loading}
            >
              Back
            </Button>

            <Button
              type="button"
              className="flex-1"
              onClick={handleContinue}
              disabled={loading}
            >
              {loading
                ? "Creating..."
                : step === "create"
                  ? "Continue"
                  : "Create PIN"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentPinPage;
