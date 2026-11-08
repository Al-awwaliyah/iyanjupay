import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, { useEffect, useState } from "react";
import { Fingerprint, Coins, Sparkles, ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAppSettings } from "@/hooks/useCustomerAppSettings";

type VerificationMethod = "phone" | "email" | null;

const AuthForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { allowNewRegistrations, loading: customerSettingsLoading } = useCustomerAppSettings();

  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(location.pathname !== "/signup");
  const [authTab, setAuthTab] = useState<"signin" | "signup">(
    location.pathname === "/signup" ? "signup" : "signin",
  );

  // ============================================================
  // SIGNUP FIELDS
  // ============================================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Referral code entered by user or received from ?ref=
  const [referralCode, setReferralCode] = useState("");

  // ============================================================
  // SIGN-IN FIELD
  // ============================================================

  const [loginIdentifier, setLoginIdentifier] = useState("");

  // ============================================================
  // VERIFICATION STATE
  // ============================================================

  const [
    verificationDialogOpen,
    setVerificationDialogOpen,
  ] = useState(false);

  const [
    verificationMethod,
    setVerificationMethod,
  ] = useState<VerificationMethod>(null);

  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  // ============================================================
  // ERROR HANDLING HELPERS
  // ============================================================

  const isOnline = (): boolean => {
    return typeof navigator === "undefined"
      ? true
      : navigator.onLine;
  };

  const isNetworkError = (error: unknown): boolean => {
    if (!error) {
      return false;
    }

    const errorObject =
      typeof error === "object"
        ? (error as {
            message?: string;
            name?: string;
            code?: string;
            status?: number;
            context?: Response;
          })
        : null;

    const message = String(
      errorObject?.message ?? error ?? "",
    ).toLowerCase();

    const name = String(
      errorObject?.name ?? "",
    ).toLowerCase();

    const code = String(
      errorObject?.code ?? "",
    ).toLowerCase();

    const status = errorObject?.status;

    if (
      message.includes("failed to fetch") ||
      message.includes("fetch failed") ||
      message.includes("network error") ||
      message.includes("network request failed") ||
      message.includes("networkerror") ||
      message.includes("internet") ||
      message.includes("connection refused") ||
      message.includes("connection reset") ||
      message.includes("connection timed out") ||
      message.includes("timed out") ||
      message.includes("offline") ||
      name.includes("networkerror") ||
      name.includes("typeerror") &&
        message.includes("fetch") ||
      code === "network_error" ||
      code === "err_network"
    ) {
      return true;
    }

    if (
      status === 0 ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return true;
    }

    return false;
  };

  const getEdgeFunctionErrorMessage = async (
    error: unknown,
    fallback: string,
  ): Promise<string> => {
    if (!isOnline()) {
      return "No internet connection. Please check your internet connection and try again.";
    }

    if (isNetworkError(error)) {
      return "Unable to connect to the server. Please check your internet connection and try again.";
    }

    console.error("Technical authentication error:", error);
    return fallback;
  };

  const getGeneralErrorMessage = (
    error: unknown,
    fallback: string,
  ): string => {
    if (!isOnline()) {
      return "No internet connection. Please check your internet connection and try again.";
    }

    if (isNetworkError(error)) {
      return "Unable to connect to the server. Please check your internet connection and try again.";
    }

    console.error("Technical authentication error:", error);
    return fallback;
  };

  // ============================================================
  // PHONE NORMALIZATION
  // ============================================================

  const normalizePhoneNumber = (
    phone: string,
  ) => {
    let cleaned = phone
      .trim()
      .replace(/[\s()-]/g, "");

    // 08012345678 -> +2348012345678
    if (cleaned.startsWith("0")) {
      cleaned = `+234${cleaned.substring(1)}`;
    }

    // 2348012345678 -> +2348012345678
    if (cleaned.startsWith("234")) {
      cleaned = `+${cleaned}`;
    }

    return cleaned;
  };

  // ============================================================
  // REFERRAL CODE NORMALIZATION
  // ============================================================

  const normalizeReferralCode = (
    code: string,
  ) => {
    return code
      .trim()
      .toUpperCase()
      .replace(/\s/g, "")
      .slice(0, 32);
  };

  // ============================================================
  // READ REFERRAL CODE FROM URL
  // ============================================================

  useEffect(() => {
    const params = new URLSearchParams(
      location.search,
    );

    const urlReferral =
      params.get("ref") ||
      params.get("referral") ||
      params.get("referral_code");

    if (urlReferral) {
      const cleanedReferral =
        urlReferral
          .trim()
          .toUpperCase()
          .slice(0, 32);

      setReferralCode(cleanedReferral);

      sessionStorage.setItem(
        "iyanjupay_referral_code",
        cleanedReferral,
      );
    } else {
      const savedReferral =
        sessionStorage.getItem(
          "iyanjupay_referral_code",
        );

      if (savedReferral) {
        setReferralCode(
          savedReferral.toUpperCase(),
        );
      }
    }
  }, [location.pathname, location.search]);

  // ============================================================
  // SIGN UP
  // ============================================================

  const handleSignUp = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!allowNewRegistrations) {
      toast({
        title: "Registration temporarily unavailable",
        description: "New customer registrations have been disabled by IyanjuPay administration.",
        variant: "destructive",
      });
      return;
    }

    if (!fullName.trim()) {
      toast({
        title: "Full name required",
        description:
          "Please enter your full name.",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description:
          "Please enter your phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: "Email required",
        description:
          "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: "Password required",
        description:
          "Please enter your password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description:
          "Your password must contain at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone =
      normalizePhoneNumber(
        phoneNumber,
      );

    if (
      !/^\+234\d{10}$/.test(
        normalizedPhone,
      )
    ) {
      toast({
        title:
          "Invalid Nigerian phone number",
        description:
          "Enter a valid Nigerian number such as +2348012345678.",
        variant: "destructive",
      });
      return;
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedReferral =
      normalizeReferralCode(
        referralCode,
      );

    if (
      normalizedReferral &&
      !/^[A-Z0-9_-]{4,32}$/.test(
        normalizedReferral,
      )
    ) {
      toast({
        title: "Invalid referral code",
        description:
          "Please check the referral code and try again.",
        variant: "destructive",
      });
      return;
    }

    if (!isOnline()) {
      toast({
        title: "No internet connection",
        description:
          "Please check your internet connection and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      if (normalizedReferral) {
        sessionStorage.setItem(
          "iyanjupay_referral_code",
          normalizedReferral,
        );
      }

      const { data, error } =
        await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name:
                fullName.trim(),
              phone_number:
                normalizedPhone,
              referral_code:
                normalizedReferral || null,
            },
          },
        });

      if (error) {
        const message =
          await getEdgeFunctionErrorMessage(
            error,
            "Unable to create your account. Please try again.",
          );

        throw new Error(message);
      }

      if (!data.user) {
        throw new Error(
          "Unable to create your account. Please try again.",
        );
      }

      setVerificationMethod(null);
      setOtp("");
      setPhoneOtpSent(false);
      setVerificationDialogOpen(true);

      toast({
        title: "Account created",
        description:
          normalizedReferral
            ? "Your referral code has been saved. Choose how you want to verify your account."
            : "Choose how you want to verify your IyanjuPay account.",
      });
    } catch (error: unknown) {
      console.error(
        "Signup error:",
        error,
      );

      toast({
        title:
          isNetworkError(error) ||
          !isOnline()
            ? "Connection problem"
            : "Unable to create account",
        description:
          getGeneralErrorMessage(
            error,
            "Something went wrong while creating your account. Please try again.",
          ),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // PHONE OTP - SEND
  // ============================================================

  const handleSendPhoneOTP =
    async () => {
      const normalizedPhone =
        normalizePhoneNumber(
          phoneNumber,
        );

      if (
        !/^\+234\d{10}$/.test(
          normalizedPhone,
        )
      ) {
        toast({
          title:
            "Invalid phone number",
          description:
            "Enter a valid Nigerian phone number.",
          variant: "destructive",
        });
        return;
      }

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { data, error } =
          await supabase.functions.invoke(
            "termii-verify",
            {
              body: {
                action: "send",
                phone:
                  normalizedPhone,
              },
            },
          );

        if (error) {
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Unable to send verification code.",
            );

          throw new Error(
            message,
          );
        }

        if (!data?.success) {
          throw new Error(
            getSafeErrorMessage(data) ||
              getSafeErrorMessage(data) ||
              "Unable to send verification code.",
          );
        }

        setPhoneOtpSent(true);
        setOtp("");

        toast({
          title:
            "Verification code sent",
          description:
            "An 8-digit verification code has been sent to your phone.",
        });
      } catch (error: unknown) {
        console.error(
          "Termii send OTP error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Unable to send code",
          description:
            getGeneralErrorMessage(
              error,
              "Please check your connection and try again.",
            ),
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // PHONE OTP - VERIFY
  // ============================================================

  const handleVerifyPhoneOTP =
    async () => {
      const normalizedPhone =
        normalizePhoneNumber(
          phoneNumber,
        );

      const enteredCode =
        otp.trim();

      if (
        !/^\d{8}$/.test(
          enteredCode,
        )
      ) {
        toast({
          title: "Invalid code",
          description:
            "Enter the 8-digit verification code you received.",
          variant: "destructive",
        });
        return;
      }

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { data, error } =
          await supabase.functions.invoke(
            "termii-verify",
            {
              body: {
                action: "check",
                phone:
                  normalizedPhone,
                code:
                  enteredCode,
              },
            },
          );

        if (error) {
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Invalid verification code.",
            );

          throw new Error(
            message,
          );
        }

        if (!data?.verified) {
          throw new Error(
            getSafeErrorMessage(data) ||
              getSafeErrorMessage(data) ||
              "Invalid verification code.",
          );
        }

        setVerificationDialogOpen(
          false,
        );

        setVerificationMethod(null);
        setOtp("");
        setPhoneOtpSent(false);

        toast({
          title:
            "Phone verified successfully",
          description:
            "Your phone number has been verified. You can now continue.",
        });
      } catch (error: unknown) {
        console.error(
          "Termii verify OTP error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Verification failed",
          description:
            getGeneralErrorMessage(
              error,
              "The 8-digit verification code is incorrect.",
            ),
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // EMAIL OTP - SEND
  // ============================================================

  const handleSendEmailOTP =
    async () => {
      const normalizedEmail =
        email.trim().toLowerCase();

      if (!normalizedEmail) {
        toast({
          title: "Email required",
          description:
            "Your email address is required.",
          variant: "destructive",
        });
        return;
      }

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { error } =
          await supabase.auth.resend({
            type: "signup",
            email:
              normalizedEmail,
          });

        if (error) {
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Unable to send verification code.",
            );

          throw new Error(message);
        }

        sessionStorage.setItem(
          "iyanjupay_signup_email",
          normalizedEmail,
        );

        const normalizedReferral =
          normalizeReferralCode(
            referralCode,
          );

        if (normalizedReferral) {
          sessionStorage.setItem(
            "iyanjupay_referral_code",
            normalizedReferral,
          );
        }

        setVerificationDialogOpen(
          false,
        );

        setVerificationMethod(null);
        setOtp("");
        setPhoneOtpSent(false);

        toast({
          title:
            "Verification code sent",
          description:
            "Check your email for the verification code.",
        });

        navigate(
          "/verify-email-otp",
          {
            state: {
              email:
                normalizedEmail,
              referralCode:
                normalizedReferral ||
                null,
            },
          },
        );
      } catch (error: unknown) {
        console.error(
          "Email OTP send error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Unable to send verification code",
          description:
            getGeneralErrorMessage(
              error,
              "Please check your connection and try again.",
            ),
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // SIGN IN
  // ============================================================

  const handleSignIn = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    const identifier =
      loginIdentifier.trim();

    if (!identifier) {
      toast({
        title:
          "Email or phone required",
        description:
          "Enter your email address or phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title:
          "Password required",
        description:
          "Please enter your password.",
        variant: "destructive",
      });
      return;
    }

    if (!isOnline()) {
      toast({
        title: "No internet connection",
        description:
          "Please check your internet connection and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "login-with-identifier",
          {
            body: {
              identifier,
              password,
            },
          },
        );

      if (error) {
        const message =
          await getEdgeFunctionErrorMessage(
            error,
            "Invalid login credentials.",
          );

        throw new Error(
          message,
        );
      }

      if (
        !data?.success ||
        !data?.session
      ) {
        throw new Error(
          getSafeErrorMessage(data) ||
            getSafeErrorMessage(data) ||
            "Invalid login credentials.",
        );
      }

      if (
        !data.session.access_token ||
        !data.session.refresh_token
      ) {
        throw new Error(
          "Login succeeded, but a valid session could not be established. Please try again.",
        );
      }

      const {
        error: sessionError,
      } =
        await supabase.auth.setSession(
          {
            access_token:
              data.session
                .access_token,

            refresh_token:
              data.session
                .refresh_token,
          },
        );

      if (sessionError) {
        const message =
          await getEdgeFunctionErrorMessage(
            sessionError,
            "Unable to establish your login session.",
          );

        throw new Error(message);
      }

      toast({
        title:
          "Welcome back!",
        description:
          "You have successfully signed in.",
      });
    } catch (error: unknown) {
      console.error(
        "Sign-in error:",
        error,
      );

      toast({
        title:
          isNetworkError(error) ||
          !isOnline()
            ? "Connection problem"
            : "Unable to sign in",
        description:
          getGeneralErrorMessage(
            error,
            "Invalid login credentials. Please check your details and try again.",
          ),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      {showWelcome ? (
        <main className="iyanju-welcome relative min-h-[100svh] overflow-hidden bg-[#f7f7ff] px-5 pb-10 pt-[max(18px,env(safe-area-inset-top))] text-[#10143b]">
          <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />

          <div className="relative mx-auto flex min-h-[calc(100svh-58px)] w-full max-w-[430px] flex-col items-center">
            <div className="flex w-full items-center justify-between px-1 pt-1 text-[10px] font-semibold text-[#171735]">
              <span>9:41</span>
              <div className="flex items-center gap-1.5" aria-label="Device status">
                <span className="inline-flex items-end gap-[2px]"><i className="h-1.5 w-[2px] rounded-sm bg-current" /><i className="h-2 w-[2px] rounded-sm bg-current" /><i className="h-2.5 w-[2px] rounded-sm bg-current" /><i className="h-3 w-[2px] rounded-sm bg-current" /></span>
                <span className="text-[11px]">◔</span>
                <span className="h-2.5 w-4 rounded-[3px] border border-current p-[1px]"><span className="block h-full w-3 rounded-[1px] bg-current" /></span>
              </div>
            </div>

            <section className="flex w-full flex-1 flex-col items-center justify-center pb-5 pt-8 text-center">
              <div className="relative mb-8 flex h-[250px] w-full max-w-[330px] items-center justify-center">
                <div className="absolute bottom-5 h-16 w-64 rounded-[50%] bg-violet-300/35 blur-2xl" />
                <div className="absolute left-7 top-10 h-12 w-12 rounded-full bg-[#f8c35b] shadow-[0_8px_18px_rgba(245,174,55,.25)]">
                  <Coins className="m-3 h-6 w-6 text-[#a45a0a]" />
                </div>
                <div className="absolute right-9 top-16 flex h-9 w-9 items-center justify-center rounded-full bg-[#ffcf70] text-[#a45a0a] shadow-lg">
                  <span className="text-lg font-black">₦</span>
                </div>
                <div className="absolute bottom-7 left-12 h-7 w-7 rounded-full bg-[#d8c9ff]" />
                <div className="absolute bottom-9 right-12 h-5 w-5 rounded-full bg-[#b8a2ff]" />
                <div className="relative h-[145px] w-[208px] rotate-[-8deg] rounded-[27px] bg-gradient-to-br from-[#9a6aff] via-[#5720e8] to-[#2412a9] p-[9px] shadow-[0_25px_35px_rgba(64,28,181,.32)]">
                  <div className="absolute inset-[9px] rounded-[20px] border border-white/20 bg-gradient-to-br from-white/15 to-transparent" />
                  <div className="absolute -right-2 top-6 h-20 w-7 rounded-r-xl bg-gradient-to-b from-[#a88aff] to-[#4b22d0] shadow-md" />
                  <div className="absolute left-5 top-5 h-4 w-4 rounded-full border-2 border-white/60 bg-[#bca8ff] shadow-inner" />
                  <div className="absolute bottom-6 left-6 h-2 w-20 rounded-full bg-white/20" />
                  <div className="absolute bottom-6 right-7 h-8 w-8 rounded-full border border-white/40 bg-gradient-to-br from-[#d5c6ff] to-[#7144e9] shadow-lg" />
                  <div className="absolute -top-5 right-8 h-10 w-10 rounded-full border-[5px] border-[#f9c86b] bg-gradient-to-br from-[#ffe5a4] to-[#f1a82c] shadow-md" />
                </div>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 shadow-lg backdrop-blur">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <span className="text-[11px] font-bold text-[#4a28a8]">Your money, in one place</span>
                </div>
              </div>

              <p className="mb-2 text-[11px] font-bold uppercase tracking-[2.5px] text-violet-600">A smarter way to manage money</p>
              <h1 className="max-w-[310px] text-[30px] font-black leading-[1.08] tracking-[-1.3px] text-[#11143b]">
                Welcome to <span className="bg-gradient-to-r from-[#6415e9] to-[#3150e8] bg-clip-text text-transparent">IyanjuPay</span>
              </h1>
              <p className="mt-3 max-w-[285px] text-[14px] leading-6 text-slate-600">
                Your complete financial companion in one app.
              </p>

              <div className="mt-7 flex items-center gap-2" aria-label="Onboarding page 1 of 3">
                <span className="h-1.5 w-6 rounded-full bg-[#5b16e8]" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
              </div>
            </section>

            <div className="w-full space-y-3 pb-3">
              <Button
                type="button"
                onClick={() => { setAuthTab("signup"); setShowWelcome(false); }}
                disabled={!allowNewRegistrations || customerSettingsLoading}
                className="h-[54px] w-full rounded-2xl bg-gradient-to-r from-[#5b10df] via-[#6411e8] to-[#4010d0] text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(83,20,211,.25)] transition hover:brightness-110"
              >
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setAuthTab("signin"); setShowWelcome(false); }}
                className="h-[52px] w-full rounded-2xl border-violet-200 bg-white/80 text-[14px] font-bold text-[#4d13d2] shadow-sm hover:bg-violet-50"
              >
                Sign In
              </Button>
              {!allowNewRegistrations && !customerSettingsLoading && (
                <p className="pt-1 text-center text-[11px] text-slate-500">New registrations are temporarily unavailable.</p>
              )}
            </div>
          </div>
        </main>
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-[#f7f7ff] p-4">
          <Card className="w-full max-w-md overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_55px_rgba(40,25,110,.12)]">
            <CardHeader className="space-y-3 px-6 pb-3 pt-7 text-center">
              <button
                type="button"
                onClick={() => setShowWelcome(true)}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6b16ed] to-[#202bc9] text-white shadow-lg"
                aria-label="Back to welcome screen"
              >
                <span className="text-[30px] font-black italic leading-none">i</span>
              </button>
              <CardTitle className="text-[25px] font-extrabold tracking-tight text-[#11143b]">
                {authTab === "signin" ? "Welcome Back 👋" : "Create your account"}
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                {authTab === "signin" ? "Sign in to continue" : "Join IyanjuPay and manage your money effortlessly."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-7">
              <Tabs
                key={`${authTab}-${allowNewRegistrations}`}
                value={authTab}
                onValueChange={(value) => setAuthTab(value as "signin" | "signup")}
                className="w-full"
              >
                <TabsList className="mb-5 grid h-11 w-full grid-cols-2 rounded-xl bg-violet-50 p-1">
                  <TabsTrigger value="signin" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                  <TabsTrigger value="signup" disabled={!allowNewRegistrations || customerSettingsLoading} className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-sm">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-identifier">Email Address or Phone Number</Label>
                      <Input id="login-identifier" type="text" value={loginIdentifier} onChange={(e) => setLoginIdentifier(e.target.value)} placeholder="Email or +2348012345678" autoComplete="username" required className="h-12 rounded-xl border-violet-100 focus-visible:ring-violet-500" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input id="signin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="h-12 rounded-xl border-violet-100 focus-visible:ring-violet-500" />
                    </div>
                    <button type="button" onClick={() => navigate("/forgot-password")} disabled={isLoading} className="block w-full text-right text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50">Forgot Password?</button>
                    <Button type="submit" className="h-12 w-full rounded-xl bg-gradient-to-r from-[#5b10df] to-[#4010d0] font-bold text-white shadow-md hover:brightness-110" disabled={isLoading}>
                      {isLoading ? "Signing In..." : "Sign In"}
                    </Button>
                    <div className="relative py-1 text-center text-xs text-slate-400"><span className="bg-white px-3">or continue with</span><div className="absolute left-0 right-0 top-1/2 -z-10 border-t border-slate-100" /></div>
                    <Button type="button" variant="outline" className="h-11 w-full rounded-xl border-violet-100" disabled={isLoading || !("PublicKeyCredential" in window)} onClick={async () => { setIsLoading(true); try { const { error } = await (supabase.auth as any).signInWithPasskey(); if (error) throw error; toast({ title: "Welcome back!", description: "You signed in securely with your device authentication." }); } catch (error: any) { toast({ title: "Biometric sign-in failed", description: getSafeErrorMessage(error) ?? "Biometric authentication was cancelled or unavailable.", variant: "destructive" }); } finally { setIsLoading(false); } }}>
                      <Fingerprint className="mr-2 h-4 w-4" /> Sign in with biometrics
                    </Button>
                    <p className="pt-2 text-center text-xs text-slate-500">Don't have an account? <button type="button" onClick={() => setAuthTab("signup")} disabled={!allowNewRegistrations} className="font-bold text-violet-700 hover:underline">Sign Up</button></p>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  {!allowNewRegistrations && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">New customer registration is temporarily disabled by IyanjuPay administration.</div>}
                  <form onSubmit={handleSignUp} className="space-y-3.5">
                    <div className="space-y-1.5"><Label htmlFor="fullName">Full Name</Label><Input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required className="h-11 rounded-xl border-violet-100" /></div>
                    <div className="space-y-1.5"><Label htmlFor="phoneNumber">Phone Number</Label><Input id="phoneNumber" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+2348012345678" autoComplete="tel" required className="h-11 rounded-xl border-violet-100" /><p className="text-xs text-muted-foreground">Enter a Nigerian number such as +2348012345678.</p></div>
                    <div className="space-y-1.5"><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="h-11 rounded-xl border-violet-100" /></div>
                    <div className="space-y-1.5"><Label htmlFor="signup-password">Password</Label><Input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required className="h-11 rounded-xl border-violet-100" /><p className="text-xs text-muted-foreground">Minimum 6 characters.</p></div>
                    <div className="space-y-1.5"><Label htmlFor="referral-code">Referral Code <span className="font-normal text-muted-foreground">(Optional)</span></Label><Input id="referral-code" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 32))} placeholder="Enter referral code" autoComplete="off" maxLength={32} className="h-11 rounded-xl border-violet-100 font-mono uppercase" />{referralCode ? <p className="text-xs text-green-600">Referral code applied: <span className="font-semibold">{referralCode}</span></p> : <p className="text-xs text-muted-foreground">If someone invited you, enter their referral code here.</p>}</div>
                    <Button type="submit" className="h-12 w-full rounded-xl bg-gradient-to-r from-[#5b10df] to-[#4010d0] font-bold text-white shadow-md hover:brightness-110" disabled={isLoading}>{isLoading ? "Creating Account..." : "Create Account"}</Button>
                    <p className="pt-1 text-center text-xs text-slate-500">Already have an account? <button type="button" onClick={() => setAuthTab("signin")} className="font-bold text-violet-700 hover:underline">Sign In</button></p>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}


      {/* ==========================================================
          VERIFICATION DIALOG
      ========================================================== */}

      <Dialog
        open={
          verificationDialogOpen
        }
        onOpenChange={(open) => {
          if (!otpLoading) {
            setVerificationDialogOpen(
              open,
            );

            if (!open) {
              setVerificationMethod(
                null,
              );

              setOtp("");

              setPhoneOtpSent(
                false,
              );
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Verify Your IyanjuPay Account
            </DialogTitle>

            <DialogDescription>
              Choose how you want to verify your account.
            </DialogDescription>
          </DialogHeader>

          {/* ======================================================
              METHOD SELECTION
          ====================================================== */}

          {!verificationMethod && (
            <div className="space-y-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod(
                    "phone",
                  );

                  setOtp("");

                  setPhoneOtpSent(
                    false,
                  );
                }}
              >
                <span className="text-2xl mr-4">
                  📱
                </span>

                <div className="text-left">
                  <div className="font-semibold">
                    Verify with Phone Number
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Receive an 8-digit verification code by SMS
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod(
                    "email",
                  );
                }}
              >
                <span className="text-2xl mr-4">
                  ✉️
                </span>

                <div className="text-left">
                  <div className="font-semibold">
                    Verify with Email
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Receive a verification code by email
                  </div>
                </div>
              </Button>
            </div>
          )}

          {/* ======================================================
              PHONE VERIFICATION
          ====================================================== */}

          {verificationMethod ===
            "phone" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send an 8-digit
                  verification code to:
                </p>

                <p className="font-semibold mt-1">
                  {normalizePhoneNumber(
                    phoneNumber,
                  )}
                </p>
              </div>

              {!phoneOtpSent ? (
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={
                    handleSendPhoneOTP
                  }
                  disabled={
                    otpLoading
                  }
                >
                  {otpLoading
                    ? "Sending Code..."
                    : "Send Verification Code"}
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone-otp">
                      8-Digit Verification Code
                    </Label>

                    <Input
                      id="phone-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={otp}
                      onChange={(e) =>
                        setOtp(
                          e.target.value
                            .replace(
                              /\D/g,
                              "",
                            )
                            .slice(
                              0,
                              8,
                            ),
                        )
                      }
                      placeholder="Enter 8-digit code"
                      className="text-center text-xl tracking-[0.35em]"
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={
                      handleVerifyPhoneOTP
                    }
                    disabled={
                      otpLoading ||
                      !/^\d{8}$/.test(
                        otp,
                      )
                    }
                  >
                    {otpLoading
                      ? "Verifying..."
                      : "Verify Phone Number"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={
                      handleSendPhoneOTP
                    }
                    disabled={
                      otpLoading
                    }
                  >
                    Resend Code
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setVerificationMethod(
                    null,
                  );

                  setOtp("");

                  setPhoneOtpSent(
                    false,
                  );
                }}
                disabled={
                  otpLoading
                }
              >
                ← Choose another method
              </Button>
            </div>
          )}

          {/* ======================================================
              EMAIL VERIFICATION
          ====================================================== */}

          {verificationMethod ===
            "email" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send a verification code
                  to:
                </p>

                <p className="font-semibold mt-1 break-all">
                  {email.trim()}
                </p>
              </div>

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={
                  handleSendEmailOTP
                }
                disabled={
                  otpLoading
                }
              >
                {otpLoading
                  ? "Sending Code..."
                  : "Send Verification Code"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() =>
                  setVerificationMethod(
                    null,
                  )
                }
                disabled={
                  otpLoading
                }
              >
                ← Choose another method
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AuthForm;
