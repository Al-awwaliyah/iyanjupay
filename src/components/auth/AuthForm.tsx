import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, { useEffect, useState } from "react";
import { Fingerprint, Eye, EyeOff } from "lucide-react";
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

  // Show the welcome screen on the main auth entry route. Direct /signup links
  // continue to open the existing registration form without an extra step.
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(
    location.pathname !== "/signup",
  );

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  // DETERMINE INITIAL TAB
  // ============================================================

  const initialTab =
    location.pathname === "/signup"
      ? "signup"
      : "signin";

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
      {showWelcomeScreen ? (
        <main className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,_#eee8ff_0%,_#f8f7ff_48%,_#ffffff_100%)] px-5 py-8 sm:px-6">
          <div className="pointer-events-none absolute -right-24 top-20 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-10 h-64 w-64 rounded-full bg-purple-200/30 blur-3xl" />
          <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center text-center">
            <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-[#6816e8] to-[#3510b9] text-3xl font-black italic text-white shadow-[0_12px_30px_rgba(88,25,210,0.28)]">
              i
            </div>

            <div className="relative mb-8 flex h-64 w-full max-w-[320px] items-center justify-center">
              <div className="absolute left-5 top-8 h-16 w-16 rounded-full bg-violet-200/70 blur-sm" />
              <div className="absolute bottom-7 right-5 h-20 w-20 rounded-full bg-purple-200/70 blur-sm" />
              <div className="absolute left-8 top-10 flex h-12 w-12 rotate-[-14deg] items-center justify-center rounded-2xl bg-white text-2xl shadow-lg">₦</div>
              <div className="absolute right-8 top-6 flex h-11 w-11 rotate-[12deg] items-center justify-center rounded-full border-4 border-white bg-[#f5c84c] text-lg font-extrabold text-amber-900 shadow-lg">₦</div>
              <div className="absolute bottom-8 left-12 flex h-10 w-10 rotate-[10deg] items-center justify-center rounded-full border-4 border-white bg-[#f5c84c] text-base font-extrabold text-amber-900 shadow-lg">₦</div>
              <div className="relative z-10 w-[245px] rotate-[-5deg] rounded-[2rem] bg-gradient-to-br from-[#7c35ed] via-[#5b18d7] to-[#3510a9] p-5 text-left shadow-[0_24px_55px_rgba(76,29,149,0.30)]">
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-sm font-bold tracking-wide text-white">IyanjuPay</span>
                  <span className="h-7 w-9 rounded-md border border-white/40 bg-white/15" />
                </div>
                <div className="mb-2 text-xs font-medium text-violet-100">Available balance</div>
                <div className="text-2xl font-extrabold tracking-wide text-white">₦25,000.00</div>
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-white/80" />
                    <span className="h-2 w-2 rounded-full bg-white/80" />
                    <span className="h-2 w-2 rounded-full bg-white/80" />
                    <span className="h-2 w-2 rounded-full bg-white/80" />
                  </div>
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-violet-100">SIMPLE • SECURE</span>
                </div>
              </div>
              <div className="absolute bottom-5 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-[#f5c84c] text-2xl font-black text-amber-900 shadow-xl">₦</div>
            </div>

            <div className="max-w-sm">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-violet-700">Welcome to IyanjuPay</p>
              <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                Your money, <span className="text-violet-700">made effortless.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-slate-500">
                Send, receive, pay bills and manage your money with a simple and secure experience.
              </p>
            </div>

            <div className="mt-9 w-full max-w-sm space-y-3">
              <Button
                type="button"
                onClick={() => { setShowWelcomeScreen(false); navigate("/signup"); }}
                disabled={!allowNewRegistrations || customerSettingsLoading}
                className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#6816e8] to-[#3510b9] text-base font-bold text-white shadow-[0_12px_25px_rgba(79,25,202,0.24)] hover:brightness-110"
              >
                Get Started
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowWelcomeScreen(false)}
                className="h-12 w-full rounded-2xl border-violet-200 bg-white/80 text-base font-bold text-violet-800 hover:bg-violet-50"
              >
                Sign In
              </Button>
            </div>
            <p className="mt-7 text-xs font-medium text-slate-400">Simple. Secure. Seamless.</p>
          </section>
        </main>
      ) : (
      <main className="min-h-screen w-full bg-[radial-gradient(ellipse_at_top,_#eee8ff_0%,_#f8f7ff_42%,_#ffffff_100%)] px-4 py-8 sm:px-6 sm:py-12">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
          <header className="mb-7 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#6816e8] to-[#3510b9] text-3xl font-black italic text-white shadow-[0_12px_30px_rgba(88,25,210,0.28)]">
              i
            </div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-violet-700">
              Welcome Back 👋
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
              Sign in to continue
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Your money, made effortless.
            </p>
          </header>

          <Card className="overflow-hidden rounded-[1.75rem] border border-violet-100/80 bg-white/95 shadow-[0_18px_55px_rgba(48,24,112,0.10)]">
            <CardContent className="p-5 sm:p-7">
              <Tabs
                key={`${location.pathname === "/signup" ? "signup" : "signin"}-${allowNewRegistrations}`}
                defaultValue={location.pathname === "/signup" && allowNewRegistrations ? "signup" : "signin"}
                className="w-full"
              >
                <TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-xl bg-violet-50 p-1">
                  <TabsTrigger value="signin" className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-sm">
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="signup" disabled={!allowNewRegistrations || customerSettingsLoading} className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-sm">
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-0">
                  <form onSubmit={handleSignIn} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="login-identifier" className="text-sm font-semibold text-slate-700">
                        Email Address or Phone Number
                      </Label>
                      <Input
                        id="login-identifier"
                        type="text"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="Enter email or phone number"
                        autoComplete="username"
                        required
                        className="h-12 rounded-xl border-violet-100 bg-white px-4 focus-visible:ring-violet-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signin-password" className="text-sm font-semibold text-slate-700">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          className="h-12 rounded-xl border-violet-100 bg-white px-4 pr-12 focus-visible:ring-violet-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition-colors hover:text-violet-700"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="-mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => navigate("/forgot-password")}
                        disabled={isLoading}
                        className="text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline disabled:opacity-50"
                      >
                        Forgot Password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="h-12 w-full rounded-xl bg-gradient-to-r from-[#5b10df] to-[#3510c8] text-base font-bold text-white shadow-[0_8px_20px_rgba(79,25,202,0.22)] transition hover:brightness-110"
                    >
                      {isLoading ? "Signing In..." : "Sign In"}
                    </Button>

                    <div className="relative py-1 text-center">
                      <span className="relative z-10 bg-white px-3 text-xs text-slate-400">or continue with</span>
                      <div className="absolute inset-x-0 top-1/2 border-t border-slate-100" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={isLoading || !("PublicKeyCredential" in window)}
                      onClick={async () => {
                        setIsLoading(true);
                        try {
                          const { error } = await (supabase.auth as any).signInWithPasskey();
                          if (error) throw error;
                          toast({ title: "Welcome back!", description: "You signed in securely with your device authentication." });
                        } catch (error: any) {
                          toast({ title: "Biometric sign-in failed", description: getSafeErrorMessage(error) ?? "Biometric authentication was cancelled or unavailable.", variant: "destructive" });
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      className="h-11 w-full rounded-xl border-violet-100 font-semibold text-slate-700 hover:bg-violet-50"
                    >
                      <Fingerprint className="mr-2 h-4 w-4 text-violet-700" />
                      Sign in with biometrics
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0">
                  {!allowNewRegistrations && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      New customer registration is temporarily disabled by IyanjuPay administration.
                    </div>
                  )}
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-sm font-semibold text-slate-700">Full Name</Label>
                      <Input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required className="h-12 rounded-xl border-violet-100" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber" className="text-sm font-semibold text-slate-700">Phone Number</Label>
                      <Input id="phoneNumber" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+2348012345678" autoComplete="tel" required className="h-12 rounded-xl border-violet-100" />
                      <p className="text-xs text-slate-500">Enter a Nigerian number such as +2348012345678.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-sm font-semibold text-slate-700">Email Address</Label>
                      <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="h-12 rounded-xl border-violet-100" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="text-sm font-semibold text-slate-700">Password</Label>
                      <div className="relative">
                        <Input id="signup-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required className="h-12 rounded-xl border-violet-100 pr-12" />
                        <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-violet-700">
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">Minimum 6 characters.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="referral-code" className="text-sm font-semibold text-slate-700">Referral Code <span className="font-normal text-slate-400">(Optional)</span></Label>
                      <Input id="referral-code" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 32))} placeholder="Enter referral code" autoComplete="off" maxLength={32} className="h-12 rounded-xl border-violet-100 font-mono uppercase" />
                      {referralCode ? <p className="text-xs text-green-600">Referral code applied: <span className="font-semibold">{referralCode}</span></p> : <p className="text-xs text-slate-500">If someone invited you, enter their referral code here.</p>}
                    </div>
                    <Button type="submit" disabled={isLoading || !allowNewRegistrations || customerSettingsLoading} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#5b10df] to-[#3510c8] text-base font-bold text-white shadow-md hover:brightness-110">
                      {isLoading ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <p className="mt-6 text-center text-xs text-slate-400">
            Secure access to your IyanjuPay account.
          </p>
        </section>
      </main>
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
