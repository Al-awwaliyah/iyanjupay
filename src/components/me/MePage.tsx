import React, {
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  ArrowLeft,
  User,
  History,
  MessageCircle,
  HelpCircle,
  CreditCard,
  LogOut,
  LockKeyhole,
  Loader2,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MePageProps {
  onBack: () => void;
  onProfileClick: () => void;
  onHistoryClick: () => void;
  onCustomerServiceClick: () => void;
  onSupportClick: () => void;
  onTransactionLimitClick: () => void;
}

type PinMode =
  | "menu"
  | "change"
  | "reset";

const MePage = ({
  onBack,
  onProfileClick,
  onHistoryClick,
  onCustomerServiceClick,
  onSupportClick,
  onTransactionLimitClick,
}: MePageProps) => {
  const { user, signOut } = useAuth();

  const { toast } = useToast();

  // ============================================================
  // PAYMENT PIN STATE
  // ============================================================

  const [pinDialogOpen, setPinDialogOpen] =
    useState(false);

  const [pinMode, setPinMode] =
    useState<PinMode>("menu");

  const [currentPin, setCurrentPin] =
    useState("");

  const [newPin, setNewPin] =
    useState("");

  const [confirmPin, setConfirmPin] =
    useState("");

  const [showCurrentPin, setShowCurrentPin] =
    useState(false);

  const [showNewPin, setShowNewPin] =
    useState(false);

  const [showConfirmPin, setShowConfirmPin] =
    useState(false);

  const [changingPin, setChangingPin] =
    useState(false);

  // ============================================================
  // RESET FORM
  // ============================================================

  const resetPinForm = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");

    setShowCurrentPin(false);
    setShowNewPin(false);
    setShowConfirmPin(false);

    setChangingPin(false);
  };

  // ============================================================
  // OPEN PAYMENT PIN
  // ============================================================

  const openPaymentPin = () => {
    resetPinForm();
    setPinMode("menu");
    setPinDialogOpen(true);
  };

  // ============================================================
  // CLOSE PAYMENT PIN
  // ============================================================

  const closePaymentPin = () => {
    if (changingPin) {
      return;
    }

    resetPinForm();
    setPinDialogOpen(false);
  };

  // ============================================================
  // CHANGE PIN
  // ============================================================

  const handleChangePin = async () => {
    if (changingPin) {
      return;
    }

    /*
     * Current PIN
     */
    if (!/^\d{4}$/.test(currentPin)) {
      toast({
        title: "Invalid current PIN",
        description:
          "Your current PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    /*
     * New PIN
     */
    if (!/^\d{4}$/.test(newPin)) {
      toast({
        title: "Invalid new PIN",
        description:
          "Your new PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    /*
     * Confirm PIN
     */
    if (newPin !== confirmPin) {
      toast({
        title: "PINs do not match",
        description:
          "The new PIN and confirmation PIN must be identical.",
        variant: "destructive",
      });

      return;
    }

    /*
     * Prevent same PIN
     */
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
      setChangingPin(true);

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
          "Change payment PIN RPC error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to change payment PIN."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.message ||
            "Unable to change payment PIN."
        );
      }

      toast({
        title:
          "Payment PIN changed",
        description:
          "Your payment PIN has been changed successfully.",
      });

      resetPinForm();

      setPinMode("menu");

    } catch (err: any) {
      console.error(
        "Change payment PIN failed:",
        err
      );

      toast({
        title:
          "Unable to change PIN",
        description:
          err?.message ||
          "Something went wrong while changing your payment PIN.",
        variant:
          "destructive",
      });
    } finally {
      setChangingPin(false);
    }
  };

  // ============================================================
  // RESET PIN
  // ============================================================

  const handleResetPinClick = () => {
    /*
     * IMPORTANT:
     *
     * Do not reset the PIN directly from the frontend.
     *
     * This screen will later connect to the secure
     * PIN-recovery verification flow.
     */
    setPinMode("reset");
  };

  // ============================================================
  // CLEANUP
  // ============================================================

  useEffect(() => {
    if (!pinDialogOpen) {
      resetPinForm();
      setPinMode("menu");
    }
  }, [pinDialogOpen]);

  // ============================================================
  // MENU ITEMS
  // ============================================================

  const menuItems = [
    {
      icon: User,
      title: "Profile",
      description:
        "Manage your personal information",
      onClick: onProfileClick,
    },
    {
      icon: History,
      title: "Transaction History",
      description:
        "View all your transactions",
      onClick: onHistoryClick,
    },
    {
      icon: LockKeyhole,
      title: "Payment PIN",
      description:
        "Change or reset your payment PIN",
      onClick: openPaymentPin,
    },
    {
      icon: MessageCircle,
      title: "Customer Service",
      description:
        "Get help and support",
      onClick:
        onCustomerServiceClick,
    },
    {
      icon: HelpCircle,
      title: "Support",
      description:
        "FAQs and help center",
      onClick:
        onSupportClick,
    },
    {
      icon: CreditCard,
      title: "Transaction Limit",
      description:
        "View and manage limits",
      onClick:
        onTransactionLimitClick,
    },
  ];

  // ============================================================
  // PIN INPUT
  // ============================================================

  const PinInput = ({
    id,
    label,
    value,
    onChange,
    visible,
    onToggleVisibility,
    disabled,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (
      value: string
    ) => void;
    visible: boolean;
    onToggleVisibility: () => void;
    disabled?: boolean;
  }) => {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>
          {label}
        </Label>

        <div className="relative">
          <Input
            id={id}
            type={
              visible
                ? "text"
                : "password"
            }
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={value}
            onChange={(event) => {
              const digits =
                event.target.value.replace(
                  /\D/g,
                  ""
                );

              onChange(
                digits.slice(0, 4)
              );
            }}
            disabled={disabled}
            placeholder="••••"
            className="pr-10 tracking-[0.4em]"
          />

          <button
            type="button"
            onClick={
              onToggleVisibility
            }
            disabled={disabled}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label={
              visible
                ? "Hide PIN"
                : "Show PIN"
            }
          >
            {visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">

          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <h1 className="text-2xl font-bold text-gray-900">
            Me
          </h1>

        </div>

        {/* User Info Card */}
        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">
          <CardContent className="p-6">

            <div className="flex items-center gap-4">

              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <User className="h-8 w-8" />
              </div>

              <div className="min-w-0">

                <h3 className="text-xl font-bold truncate">
                  {user?.email || "User"}
                </h3>

                <p className="text-purple-100">
                  Member since{" "}
                  {user?.created_at
                    ? new Date(
                        user.created_at
                      ).getFullYear()
                    : "—"}
                </p>

              </div>

            </div>

          </CardContent>
        </Card>

        {/* Menu Items */}
        <div className="space-y-3">

          {menuItems.map(
            (item, index) => {
              const Icon =
                item.icon;

              return (
                <Card
                  key={index}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={
                    item.onClick
                  }
                >
                  <CardContent className="p-4">

                    <div className="flex items-center gap-4">

                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                        <Icon className="h-6 w-6 text-purple-600" />
                      </div>

                      <div className="flex-1 min-w-0">

                        <h4 className="font-semibold text-gray-900">
                          {item.title}
                        </h4>

                        <p className="text-sm text-gray-600">
                          {item.description}
                        </p>

                      </div>

                      <div className="text-gray-400 text-xl">
                        →
                      </div>

                    </div>

                  </CardContent>
                </Card>
              );
            }
          )}

        </div>

        {/* Logout */}
        <Card className="mt-6 border-red-200">
          <CardContent className="p-4">

            <Button
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>

          </CardContent>
        </Card>

      </div>

      {/* ======================================================
          PAYMENT PIN DIALOG
          ====================================================== */}

      <Dialog
        open={pinDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePaymentPin();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">

          {/* ==================================================
              PIN MENU
              ================================================== */}

          {pinMode === "menu" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">
                  Payment PIN
                </DialogTitle>

                <DialogDescription className="text-center">
                  Manage the PIN used to authorize
                  payments and transactions.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">

                <Button
                  type="button"
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  onClick={() =>
                    setPinMode("change")
                  }
                >
                  <LockKeyhole className="h-4 w-4 mr-2" />
                  Change Payment PIN
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={
                    handleResetPinClick
                  }
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Forgot Payment PIN?
                </Button>

              </div>
            </>
          )}

          {/* ==================================================
              CHANGE PIN
              ================================================== */}

          {pinMode === "change" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Change Payment PIN
                </DialogTitle>

                <DialogDescription>
                  Enter your current PIN and
                  choose a new 4-digit PIN.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">

                <PinInput
                  id="currentPaymentPin"
                  label="Current PIN"
                  value={currentPin}
                  onChange={
                    setCurrentPin
                  }
                  visible={
                    showCurrentPin
                  }
                  onToggleVisibility={() =>
                    setShowCurrentPin(
                      (value) =>
                        !value
                    )
                  }
                  disabled={
                    changingPin
                  }
                />

                <PinInput
                  id="newPaymentPin"
                  label="New PIN"
                  value={newPin}
                  onChange={setNewPin}
                  visible={showNewPin}
                  onToggleVisibility={() =>
                    setShowNewPin(
                      (value) =>
                        !value
                    )
                  }
                  disabled={
                    changingPin
                  }
                />

                <PinInput
                  id="confirmPaymentPin"
                  label="Confirm New PIN"
                  value={confirmPin}
                  onChange={
                    setConfirmPin
                  }
                  visible={
                    showConfirmPin
                  }
                  onToggleVisibility={() =>
                    setShowConfirmPin(
                      (value) =>
                        !value
                    )
                  }
                  disabled={
                    changingPin
                  }
                />

                <div className="flex gap-2 pt-2">

                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={
                      changingPin
                    }
                    onClick={() => {
                      resetPinForm();
                      setPinMode(
                        "menu"
                      );
                    }}
                  >
                    Back
                  </Button>

                  <Button
                    type="button"
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={
                      changingPin ||
                      currentPin.length !==
                        4 ||
                      newPin.length !==
                        4 ||
                      confirmPin.length !==
                        4
                    }
                    onClick={
                      handleChangePin
                    }
                  >
                    {changingPin ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      "Change PIN"
                    )}
                  </Button>

                </div>

              </div>
            </>
          )}

          {/* ==================================================
              RESET PIN
              ================================================== */}

          {pinMode === "reset" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Reset Payment PIN
                </DialogTitle>

                <DialogDescription>
                  To protect your account, you
                  must verify your identity before
                  creating a new payment PIN.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">
                    PIN reset requires identity
                    verification. Your existing
                    payment PIN will not be replaced
                    until verification is completed.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPinMode(
                      "menu"
                    );
                  }}
                >
                  Back
                </Button>

              </div>
            </>
          )}

        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MePage;
