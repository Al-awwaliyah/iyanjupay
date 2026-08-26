import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PaymentPinPageProps {
  onBack: () => void;
}

type PinFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const PinField = ({
  label,
  value,
  onChange,
  placeholder = "••••",
  disabled = false,
}: PinFieldProps) => {
  const [visible, setVisible] = useState(false);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const nextValue = event.target.value
      .replace(/\D/g, "")
      .slice(0, 4);

    onChange(nextValue);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-12 text-center tracking-[0.5em] text-lg"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() =>
            setVisible((current) => !current)
          }
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          aria-label={
            visible ? "Hide PIN" : "Show PIN"
          }
        >
          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Enter exactly 4 digits.
      </p>
    </div>
  );
};

const PaymentPinPage = ({
  onBack,
}: PaymentPinPageProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentPin, setCurrentPin] =
    useState("");

  const [newPin, setNewPin] =
    useState("");

  const [confirmPin, setConfirmPin] =
    useState("");

  const [processing, setProcessing] =
    useState(false);

  const [resetProcessing, setResetProcessing] =
    useState(false);

  const [success, setSuccess] =
    useState(false);

  /*
   * ============================================================
   * CHANGE PAYMENT PIN
   * ============================================================
   */

  const handleChangePin = async () => {
    if (processing || resetProcessing) {
      return;
    }

    if (!/^\d{4}$/.test(currentPin)) {
      toast({
        title: "Invalid current PIN",
        description:
          "Your current payment PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      toast({
        title: "Invalid new PIN",
        description:
          "Your new payment PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: "PINs do not match",
        description:
          "The new PIN and confirmation PIN must be identical.",
        variant: "destructive",
      });

      return;
    }

    if (currentPin === newPin) {
      toast({
        title: "Choose a different PIN",
        description:
          "Your new PIN must be different from your current PIN.",
        variant: "destructive",
      });

      return;
    }

    try {
      setProcessing(true);
      setSuccess(false);

      const {
        data,
        error,
      } = await supabase.rpc(
        "change_payment_pin",
        {
          _current_pin: currentPin,
          _new_pin: newPin,
        }
      );

      if (error) {
        console.error(
          "Change payment PIN error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to change payment PIN."
        );
      }

      if (
        !data ||
        data.success !== true
      ) {
        throw new Error(
          data?.message ||
            "Unable to change payment PIN."
        );
      }

      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");

      setSuccess(true);

      toast({
        title: "Payment PIN changed",
        description:
          "Your payment PIN has been changed successfully.",
      });
    } catch (err: any) {
      console.error(
        "Payment PIN change failed:",
        err
      );

      toast({
        title: "Unable to change PIN",
        description:
          err?.message ||
          "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  /*
   * ============================================================
   * RESET PAYMENT PIN
   * ============================================================
   *
   * Custom recovery flow:
   *
   * PaymentPinPage
   *       ↓
   * payment-pin-reset-request
   *       ↓
   * Brevo SMTP
   *       ↓
   * VerifyPaymentPinResetOtp
   *
   * The email is obtained from the authenticated
   * Supabase session/server.
   *
   * We do NOT use:
   *
   * resetPasswordForEmail()
   *
   * and we do NOT depend on:
   *
   * auth.jwt().amr = recovery
   *
   * ============================================================
   */

  const handleResetPaymentPin = async () => {
    if (
      processing ||
      resetProcessing
    ) {
      return;
    }

    setResetProcessing(true);

    try {
      /*
       * --------------------------------------------------------
       * Confirm the user is authenticated.
       * --------------------------------------------------------
       */

      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(
          "Get authenticated user error:",
          userError
        );

        throw new Error(
          "Unable to verify your account."
        );
      }

      if (!user) {
        toast({
          title: "Authentication required",
          description:
            "Please sign in before resetting your Payment PIN.",
          variant: "destructive",
        });

        return;
      }

      /*
       * --------------------------------------------------------
       * Email must exist.
       *
       * The Edge Function will independently verify the
       * authenticated user and use the server-side email.
       * --------------------------------------------------------
       */

      const email =
        user.email
          ?.trim()
          .toLowerCase();

      if (!email) {
        toast({
          title: "Email unavailable",
          description:
            "Your account does not have a usable email address for Payment PIN recovery.",
          variant: "destructive",
        });

        return;
      }

      /*
       * --------------------------------------------------------
       * Request custom PIN reset OTP.
       * --------------------------------------------------------
       */

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "payment-pin-reset-request",
          {
            body: {},
          }
        );

      if (error) {
        console.error(
          "Payment PIN reset request error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to send the Payment PIN reset code."
        );
      }

      if (
        !data ||
        data.success !== true
      ) {
        throw new Error(
          data?.message ||
            "Unable to send the Payment PIN reset code."
        );
      }

      /*
       * --------------------------------------------------------
       * Store email only for display on OTP page.
       *
       * It is NOT authentication.
       * --------------------------------------------------------
       */

      sessionStorage.setItem(
        "iyanjupay_payment_pin_reset_email",
        email
      );

      toast({
        title: "Reset code sent",
        description:
          "A 6-digit Payment PIN reset code has been sent to your email.",
      });

      navigate(
        "/verify-payment-pin-reset",
        {
          replace: true,
        }
      );
    } catch (error: any) {
      console.error(
        "Payment PIN reset request failed:",
        error
      );

      toast({
        title:
          "Unable to start PIN reset",
        description:
          error?.message ||
          "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetProcessing(false);
    }
  };

  /*
   * ============================================================
   * BACK
   * ============================================================
   */

  const handleBack = () => {
    if (
      processing ||
      resetProcessing
    ) {
      return;
    }

    onBack();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* HEADER */}

        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={
              processing ||
              resetProcessing
            }
            className="text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <h1 className="text-2xl font-bold text-gray-900">
            Payment PIN
          </h1>
        </div>

        {/* SECURITY CARD */}

        <Card className="mb-6 border-0 shadow-md">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">

              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-6 w-6 text-purple-600" />
              </div>

              <div>
                <h2 className="font-semibold text-gray-900">
                  Keep your payment PIN secure
                </h2>

                <p className="text-sm text-gray-600 mt-1">
                  Your payment PIN is required to
                  authorize wallet payments and
                  should never be shared with anyone.
                </p>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* CHANGE PIN */}

        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <LockKeyhole className="h-5 w-5 text-purple-600" />
              </div>

              <div>
                <CardTitle>
                  Change Payment PIN
                </CardTitle>

                <CardDescription>
                  Enter your current PIN and choose
                  a new 4-digit PIN.
                </CardDescription>
              </div>

            </div>
          </CardHeader>

          <CardContent className="space-y-5">

            <PinField
              label="Current Payment PIN"
              value={currentPin}
              onChange={setCurrentPin}
              disabled={
                processing ||
                resetProcessing
              }
            />

            <PinField
              label="New Payment PIN"
              value={newPin}
              onChange={setNewPin}
              disabled={
                processing ||
                resetProcessing
              }
            />

            <PinField
              label="Confirm New Payment PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              disabled={
                processing ||
                resetProcessing
              }
            />

            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">

                  <CheckCircle2 className="h-5 w-5 text-green-600" />

                  <div>
                    <p className="font-medium text-green-800">
                      Payment PIN changed successfully
                    </p>

                    <p className="text-sm text-green-700 mt-1">
                      Your new PIN is now active.
                    </p>
                  </div>

                </div>
              </div>
            )}

            <Button
              type="button"
              onClick={handleChangePin}
              disabled={
                processing ||
                resetProcessing ||
                currentPin.length !== 4 ||
                newPin.length !== 4 ||
                confirmPin.length !== 4
              }
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing PIN...
                </>
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4 mr-2" />
                  Change Payment PIN
                </>
              )}
            </Button>

          </CardContent>
        </Card>

        {/* RESET PIN */}

        <Card className="mt-4 shadow-md">
          <CardContent className="p-5">

            <div className="flex items-start gap-4">

              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <RotateCcw className="h-5 w-5 text-orange-600" />
              </div>

              <div className="flex-1">

                <h3 className="font-semibold text-gray-900">
                  Forgot your Payment PIN?
                </h3>

                <p className="text-sm text-gray-600 mt-1">
                  Reset your PIN using a secure
                  verification code sent to your
                  account email.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  disabled={
                    processing ||
                    resetProcessing
                  }
                  onClick={
                    handleResetPaymentPin
                  }
                >
                  {resetProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending reset code...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset Payment PIN
                    </>
                  )}
                </Button>

              </div>

            </div>

          </CardContent>
        </Card>

        {/* SECURITY NOTICE */}

        <div className="mt-5 rounded-lg bg-gray-50 border p-4">
          <p className="text-xs text-gray-500 text-center">
            IyanjuPay will never ask you to disclose
            your payment PIN to customer service,
            support staff, or any other person.
          </p>
        </div>

      </div>
    </div>
  );
};

export default PaymentPinPage;
