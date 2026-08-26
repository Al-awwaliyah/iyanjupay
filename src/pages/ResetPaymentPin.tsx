import React, {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

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


const AUTHORIZATION_KEY =
  "iyanjupay_payment_pin_reset_authorization";

const AUTHORIZATION_EXPIRES_KEY =
  "iyanjupay_payment_pin_reset_authorization_expires_at";


type PinFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};


const PinField = ({
  label,
  value,
  onChange,
  disabled = false,
}: PinFieldProps) => {

  const [
    visible,
    setVisible,
  ] = useState(false);


  const handleChange =
    (
      event:
        React.ChangeEvent<HTMLInputElement>
    ) => {

      const value =
        event.target.value
          .replace(/\D/g, "")
          .slice(0, 4);

      onChange(value);
    };


  return (
    <div className="space-y-2">

      <Label>{label}</Label>

      <div className="relative">

        <Input
          type={
            visible
              ? "text"
              : "password"
          }
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder="••••"
          className="pr-12 text-center text-lg tracking-[0.5em]"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() =>
            setVisible(
              current => !current
            )
          }
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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


const ResetPaymentPin =
  () => {

    const navigate =
      useNavigate();

    const { toast } =
      useToast();


    const [
      authorization,
      setAuthorization,
    ] = useState("");


    const [
      newPin,
      setNewPin,
    ] = useState("");


    const [
      confirmPin,
      setConfirmPin,
    ] = useState("");


    const [
      processing,
      setProcessing,
    ] = useState(false);


    const [
      success,
      setSuccess,
    ] = useState(false);


    // ========================================================
    // LOAD AUTHORIZATION
    // ========================================================

    useEffect(() => {

      const token =
        sessionStorage.getItem(
          AUTHORIZATION_KEY
        );


      if (!token) {

        toast({
          title:
            "Reset authorization missing",
          description:
            "Please verify your recovery code again.",
          variant:
            "destructive",
        });

        navigate(
          "/payment-pin",
          {
            replace: true,
          }
        );

        return;
      }


      const expiresAt =
        sessionStorage.getItem(
          AUTHORIZATION_EXPIRES_KEY
        );


      if (
        expiresAt &&
        new Date(
          expiresAt
        ).getTime() <= Date.now()
      ) {

        sessionStorage.removeItem(
          AUTHORIZATION_KEY
        );

        sessionStorage.removeItem(
          AUTHORIZATION_EXPIRES_KEY
        );

        toast({
          title:
            "Reset authorization expired",
          description:
            "Please request a new Payment PIN reset code.",
          variant:
            "destructive",
        });

        navigate(
          "/payment-pin",
          {
            replace: true,
          }
        );

        return;
      }


      setAuthorization(
        token
      );

    }, [
      navigate,
      toast,
    ]);


    // ========================================================
    // RESET PIN
    // ========================================================

    const handleReset =
      async () => {

        if (processing) {
          return;
        }


        if (
          !authorization
        ) {

          toast({
            title:
              "Authorization missing",
            description:
              "Please verify your recovery code again.",
            variant:
              "destructive",
          });

          return;
        }


        if (
          !/^\d{4}$/.test(
            newPin
          )
        ) {

          toast({
            title:
              "Invalid Payment PIN",
            description:
              "Your new Payment PIN must contain exactly 4 digits.",
            variant:
              "destructive",
          });

          return;
        }


        if (
          newPin !== confirmPin
        ) {

          toast({
            title:
              "PINs do not match",
            description:
              "The new PIN and confirmation PIN must match.",
            variant:
              "destructive",
          });

          return;
        }


        try {

          setProcessing(true);


          // ----------------------------------------------------
          // Verify current authentication
          // ----------------------------------------------------

          const {
            data: {
              user,
            },
            error:
              userError,
          } =
            await supabase.auth.getUser();


          if (
            userError ||
            !user
          ) {

            throw new Error(
              "Your login session has expired. Please sign in again."
            );
          }


          // ----------------------------------------------------
          // Call secure RPC
          // ----------------------------------------------------

          const {
            data,
            error,
          } =
            await supabase.rpc(
              "reset_payment_pin",
              {
                _authorization:
                  authorization,

                _new_pin:
                  newPin,
              }
            );


          if (error) {

            console.error(
              "Payment PIN reset RPC error:",
              error
            );

            throw new Error(
              error.message ||
                "Unable to reset Payment PIN."
            );
          }


          if (
            !data ||
            data.success !== true
          ) {

            throw new Error(
              data?.message ||
                "Unable to reset Payment PIN."
            );
          }


          // ----------------------------------------------------
          // Clear sensitive values
          // ----------------------------------------------------

          setNewPin("");
          setConfirmPin("");

          sessionStorage.removeItem(
            AUTHORIZATION_KEY
          );

          sessionStorage.removeItem(
            AUTHORIZATION_EXPIRES_KEY
          );


          setAuthorization("");
          setSuccess(true);


          toast({
            title:
              "Payment PIN reset successfully",
            description:
              "Your new Payment PIN is now active.",
          });

        } catch (error: any) {

          console.error(
            "Payment PIN reset failed:",
            error
          );

          toast({
            title:
              "Payment PIN reset failed",
            description:
              error?.message ||
              "Unable to reset your Payment PIN.",
            variant:
              "destructive",
          });

        } finally {

          setProcessing(false);

        }
      };


    // ========================================================
    // BACK
    // ========================================================

    const handleBack =
      () => {

        if (processing) {
          return;
        }

        navigate(
          "/payment-pin",
          {
            replace: true,
          }
        );
      };


    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        <div className="max-w-md mx-auto px-4 py-8">

          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={processing}
            className="mb-6 text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>


          <Card className="shadow-lg">

            <CardHeader>

              <div className="flex items-center gap-3">

                <div className="w-11 h-11 rounded-full bg-purple-100 flex items-center justify-center">
                  <LockKeyhole className="h-6 w-6 text-purple-600" />
                </div>

                <div>

                  <CardTitle>
                    Reset Payment PIN
                  </CardTitle>

                  <CardDescription>
                    Create a new 4-digit Payment PIN.
                  </CardDescription>

                </div>

              </div>

            </CardHeader>


            <CardContent className="space-y-6">

              {success ? (

                <div className="rounded-lg border border-green-200 bg-green-50 p-5">

                  <div className="flex items-start gap-3">

                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />

                    <div>

                      <p className="font-semibold text-green-800">
                        Payment PIN reset successfully
                      </p>

                      <p className="text-sm text-green-700 mt-1">
                        Your new Payment PIN is now active.
                      </p>

                      <Button
                        type="button"
                        className="mt-4 bg-green-600 hover:bg-green-700"
                        onClick={() =>
                          navigate(
                            "/payment-pin",
                            {
                              replace: true,
                            }
                          )
                        }
                      >
                        Continue
                      </Button>

                    </div>

                  </div>

                </div>

              ) : (

                <>

                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">

                    <div className="flex items-start gap-3">

                      <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5" />

                      <div>

                        <p className="text-sm font-medium text-blue-900">
                          Recovery verified
                        </p>

                        <p className="text-sm text-blue-700 mt-1">
                          Create your new Payment PIN below.
                        </p>

                      </div>

                    </div>

                  </div>


                  <PinField
                    label="New Payment PIN"
                    value={newPin}
                    onChange={setNewPin}
                    disabled={processing}
                  />


                  <PinField
                    label="Confirm New Payment PIN"
                    value={confirmPin}
                    onChange={setConfirmPin}
                    disabled={processing}
                  />


                  <Button
                    type="button"
                    onClick={handleReset}
                    disabled={
                      processing ||
                      !authorization ||
                      newPin.length !== 4 ||
                      confirmPin.length !== 4
                    }
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >

                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Resetting PIN...
                      </>
                    ) : (
                      <>
                        <LockKeyhole className="h-4 w-4 mr-2" />
                        Reset Payment PIN
                      </>
                    )}

                  </Button>


                  <p className="text-xs text-gray-500 text-center">
                    Never share your Payment PIN with anyone.
                  </p>

                </>

              )}

            </CardContent>

          </Card>

        </div>

      </div>
    );
  };


export default ResetPaymentPin;
