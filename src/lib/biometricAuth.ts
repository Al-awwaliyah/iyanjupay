import { Capacitor } from "@capacitor/core";

export type BiometricAvailability = {
  available: boolean;
  label: string;
};

const BIOMETRIC_ENABLED_KEY = "iyanjupay-biometric-enabled";

export function isBiometricEnabled(): boolean {
  return typeof window !== "undefined" &&
    window.localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true";
}

export function setBiometricEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
}

function labelForType(type: unknown): string {
  const value = String(type ?? "").toLowerCase();
  if (value.includes("face")) return "Face ID / Face authentication";
  if (value.includes("finger") || value.includes("touch")) return "Fingerprint / Touch ID";
  if (value.includes("iris")) return "Iris authentication";
  if (value.includes("multiple")) return "Biometric authentication";
  return "Biometric authentication";
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      label: "Native biometric authentication is available in the IyanjuPay mobile app.",
    };
  }

  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    const strong = Boolean(result.isAvailable && result.strongBiometryIsAvailable);

    return {
      available: strong,
      label: strong
        ? labelForType(result.biometryType)
        : result.isAvailable
          ? "A device credential is available, but a strong biometric is not enrolled."
          : "No supported biometric is enrolled on this device.",
    };
  } catch (error) {
    console.warn("Biometric availability check failed:", error);
    return {
      available: false,
      label: "Biometric authentication is unavailable on this device.",
    };
  }
}

export async function authenticateWithBiometric(reason = "Unlock IyanjuPay"): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Native biometric authentication is only available in the IyanjuPay mobile app.");
  }

  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  const result = await NativeBiometric.isAvailable({ useFallback: false });

  if (!result.isAvailable || !result.strongBiometryIsAvailable) {
    throw new Error("No supported strong biometric is enrolled on this device.");
  }

  await NativeBiometric.verifyIdentity({
    reason,
    title: "Unlock IyanjuPay",
    subtitle: "Verify your identity to continue",
    description: "Use your fingerprint or Face ID to unlock IyanjuPay.",
    useFallback: false,
    maxAttempts: 5,
  });
}
