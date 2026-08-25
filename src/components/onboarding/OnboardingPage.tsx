import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Loader2,
  UserRound,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userEmail, setUserEmail] = useState("");

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [nin, setNin] = useState("");

  // ==========================================================
  // LOAD AUTHENTICATED USER + EXISTING PROFILE
  // ==========================================================

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          navigate("/", { replace: true });
          return;
        }

        setUserEmail(user.email ?? "");

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select(
              `
                id,
                full_name,
                phone_number,
                nickname,
                gender,
                date_of_birth,
                email,
                address,
                nin,
                bvn_verified
              `,
            )
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (profile) {
          setFullName(profile.full_name ?? "");
          setPhoneNumber(profile.phone_number ?? "");
          setNickname(profile.nickname ?? "");
          setGender(profile.gender ?? "");
          setDateOfBirth(profile.date_of_birth ?? "");
          setAddress(profile.address ?? "");
          setNin(profile.nin ?? "");
        }
      } catch (error: any) {
        console.error(
          "Onboarding profile loading error:",
          error,
        );

        toast({
          title: "Unable to load your profile",
          description:
            error?.message ||
            "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate, toast]);

  // ==========================================================
  // PROFILE VALIDATION
  // ==========================================================

  const normalizedFullName = fullName.trim();
  const normalizedPhone = phoneNumber.trim();
  const normalizedNickname = nickname.trim();
  const normalizedAddress = address.trim();
  const normalizedNin = nin.replace(/\D/g, "");

  const isValidNin =
    normalizedNin.length === 11;

  const isProfileComplete =
    normalizedFullName.length >= 2 &&
    normalizedPhone.length >= 7 &&
    normalizedNickname.length >= 2 &&
    Boolean(gender) &&
    Boolean(dateOfBirth) &&
    normalizedAddress.length >= 5 &&
    isValidNin;

  // ==========================================================
  // SAVE PROFILE
  // ==========================================================

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!isProfileComplete) {
      toast({
        title: "Complete your profile",
        description:
          "Please fill in all required information correctly.",
        variant: "destructive",
      });

      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          "Your session has expired. Please sign in again.",
        );
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: normalizedFullName,
          phone_number: normalizedPhone,
          nickname: normalizedNickname,
          gender,
          date_of_birth: dateOfBirth,
          email: user.email ?? userEmail,
          address: normalizedAddress,
          nin: normalizedNin,
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Profile saved",
        description:
          "Your personal information has been saved successfully.",
      });

      // ------------------------------------------------------
      // NEXT PHASE: BVN VERIFICATION
      // ------------------------------------------------------
      navigate("/onboarding/bvn", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Profile completion error:",
        error,
      );

      toast({
        title: "Unable to save profile",
        description:
          error?.message ||
          "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />

          <p className="text-sm text-gray-600">
            Loading your account...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <UserRound className="h-6 w-6 text-green-600" />
          </div>

          <CardTitle className="text-2xl font-bold text-[#082A63]">
            Complete Your Profile
          </CardTitle>

          <CardDescription>
            Please provide your personal information to
            continue setting up your IyanjuPay account.
          </CardDescription>

          {userEmail && (
            <p className="pt-2 text-sm font-medium text-gray-600 break-all">
              {userEmail}
            </p>
          )}
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* FULL NAME */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-full-name">
                Full Name
              </Label>

              <Input
                id="onboarding-full-name"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </div>

            {/* PHONE */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-phone">
                Phone Number
              </Label>

              <Input
                id="onboarding-phone"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(
                    e.target.value,
                  )
                }
                placeholder="Enter your phone number"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </div>

            {/* NICKNAME */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-nickname">
                Nickname
              </Label>

              <Input
                id="onboarding-nickname"
                value={nickname}
                onChange={(e) =>
                  setNickname(e.target.value)
                }
                placeholder="What should we call you?"
                autoComplete="nickname"
                required
              />
            </div>

            {/* GENDER */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-gender">
                Gender
              </Label>

              <select
                id="onboarding-gender"
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">
                  Select gender
                </option>

                <option value="male">
                  Male
                </option>

                <option value="female">
                  Female
                </option>
              </select>
            </div>

            {/* DATE OF BIRTH */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-dob">
                Date of Birth
              </Label>

              <Input
                id="onboarding-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) =>
                  setDateOfBirth(
                    e.target.value,
                  )
                }
                required
              />
            </div>

            {/* ADDRESS */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-address">
                Residential Address
              </Label>

              <Input
                id="onboarding-address"
                value={address}
                onChange={(e) =>
                  setAddress(e.target.value)
                }
                placeholder="Enter your residential address"
                autoComplete="street-address"
                required
              />
            </div>

            {/* NIN */}

            <div className="space-y-2">
              <Label htmlFor="onboarding-nin">
                NIN
              </Label>

              <Input
                id="onboarding-nin"
                value={nin}
                onChange={(e) => {
                  const value =
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11);

                  setNin(value);
                }}
                placeholder="Enter your 11-digit NIN"
                inputMode="numeric"
                maxLength={11}
                autoComplete="off"
                required
              />

              <p className="text-xs text-gray-500">
                Your NIN must contain exactly 11
                digits.
              </p>

              {nin.length === 11 && (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  NIN format is valid.
                </div>
              )}
            </div>

            {/* SUBMIT */}

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={
                saving ||
                !isProfileComplete
              }
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving profile...
                </>
              ) : (
                "Continue to BVN Verification"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingPage;
