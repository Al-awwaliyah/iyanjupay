import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type BiometricAvailability = {
  available: boolean;
  label: string;
  native: boolean;
  web: boolean;
};

const BIOMETRIC_ENABLED_KEY = "iyanjupay-biometric-enabled";

export function isBiometricEnabled(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true"
  );
}

export function setBiometricEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    BIOMETRIC_ENABLED_KEY,
    String(enabled),
  );
}

export function isNativeBiometricPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isWebAuthnSupported(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.isSecureContext === true &&
    "PublicKeyCredential" in window &&
    !!navigator.credentials
  );
}

async function isWebPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    const checker = (
      window.PublicKeyCredential as typeof PublicKeyCredential & {
        isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
      }
    ).isUserVerifyingPlatformAuthenticatorAvailable;

    if (typeof checker !== "function") {
      return true;
    }

    return await checker.call(window.PublicKeyCredential);
  } catch (error) {
    console.warn(
      "WebAuthn platform authenticator availability check failed:",
      error,
    );

    return false;
  }
}

function labelForType(type: unknown): string {
  if (type === 2) return "Face ID / Face authentication";
  if (type === 1 || type === 3) return "Fingerprint / Touch ID";
  if (type === 5) return "Iris authentication";

  const value = String(type ?? "").toLowerCase();

  if (value.includes("face")) {
    return "Face ID / Face authentication";
  }

  if (
    value.includes("finger") ||
    value.includes("touch")
  ) {
    return "Fingerprint / Touch ID";
  }

  if (value.includes("iris")) {
    return "Iris authentication";
  }

  return "Biometric authentication";
}

export async function hasRegisteredWebBiometric(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    const { data, error } = await (
      supabase.auth as any
    ).passkey.list();

    if (error) {
      console.warn(
        "Unable to list registered passkeys:",
        error,
      );
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.warn(
      "Unable to check registered passkeys:",
      error,
    );

    return false;
  }
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeBiometric } = await import(
        "@capgo/capacitor-native-biometric"
      );

      const result =
        await NativeBiometric.isAvailable({
          useFallback: false,
        });

      return {
        available: Boolean(
          result.isAvailable &&
            result.strongBiometryIsAvailable,
        ),
        native: true,
        web: false,
        label: result.isAvailable
          ? labelForType(result.biometryType)
          : "No supported biometric is enrolled on this device.",
      };
    } catch (error) {
      console.warn(
        "Native biometric availability check failed:",
        error,
      );

      return {
        available: false,
        native: true,
        web: false,
        label:
          "Biometric authentication is unavailable on this device.",
      };
    }
  }

  if (!isWebAuthnSupported()) {
    return {
      available: false,
      native: false,
      web: false,
      label:
        "Biometric authentication requires a supported HTTPS browser.",
    };
  }

  const platformAvailable =
    await isWebPlatformAuthenticatorAvailable();

  if (!platformAvailable) {
    return {
      available: false,
      native: false,
      web: true,
      label:
        "No supported biometric or secure device authenticator is available.",
    };
  }

  return {
    available: true,
    native: false,
    web: true,
    label:
      "Fingerprint, Face ID, Windows Hello, device PIN, or another secure device authenticator",
  };
}

/**
 * Registers a WebAuthn/passkey credential for the currently
 * authenticated user.
 *
 * This is required before PWA biometric sign-in or App Lock
 * can use signInWithPasskey().
 */
export async function registerWebBiometric(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    throw new Error(
      "Web biometric registration is not used by the native IyanjuPay app.",
    );
  }

  if (!isWebAuthnSupported()) {
    throw new Error(
      "This browser does not support biometric authentication or is not using a secure HTTPS context.",
    );
  }

  const available =
    await isWebPlatformAuthenticatorAvailable();

  if (!available) {
    throw new Error(
      "This device does not provide a supported biometric or secure device authenticator.",
    );
  }

  const {
    data,
    error,
  } = await (
    supabase.auth as any
  ).registerPasskey();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "The biometric credential could not be registered.",
    );
  }
}

/**
 * Authenticates the currently signed-in user with the
 * platform's biometric/security authenticator.
 *
 * Native:
 *   @capgo/capacitor-native-biometric
 *
 * PWA:
 *   Supabase WebAuthn/passkey
 */
export async function authenticateWithBiometric(
  reason = "Unlock IyanjuPay",
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { NativeBiometric } = await import(
      "@capgo/capacitor-native-biometric"
    );

    const result =
      await NativeBiometric.isAvailable({
        useFallback: false,
      });

    if (
      !result.isAvailable ||
      !result.strongBiometryIsAvailable
    ) {
      throw new Error(
        "No supported biometric is enrolled on this device.",
      );
    }

    await NativeBiometric.verifyIdentity({
      reason,
      title: "Unlock IyanjuPay",
      subtitle:
        "Verify your identity to continue",
      description:
        "Use your fingerprint or Face ID to unlock IyanjuPay.",
      useFallback: false,
    });

    return;
  }

  if (!isWebAuthnSupported()) {
    throw new Error(
      "This browser does not support biometric authentication or is not using a secure HTTPS context.",
    );
  }

  const credentialExists =
    await hasRegisteredWebBiometric();

  if (!credentialExists) {
    throw new Error(
      "No IyanjuPay biometric credential is registered on this device. Enable Biometric Authentication in Security Settings first.",
    );
  }

  const {
    data,
    error,
  } = await (
    supabase.auth as any
  ).signInWithPasskey();

  if (error) {
    throw error;
  }

  if (!data?.session) {
    throw new Error(
      "Biometric verification completed, but IyanjuPay could not restore your session.",
    );
  }
}

/**
 * PWA passkey sign-in.
 *
 * This is intentionally separate from authenticateWithBiometric()
 * because this function can be used while the user is signed out.
 */
export async function signInWithWebBiometric(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    throw new Error(
      "PWA biometric sign-in is not used by the native IyanjuPay app.",
    );
  }

  if (!isWebAuthnSupported()) {
    throw new Error(
      "This browser does not support biometric authentication or is not using a secure HTTPS context.",
    );
  }

  const {
    data,
    error,
  } = await (
    supabase.auth as any
  ).signInWithPasskey();

  if (error) {
    throw error;
  }

  if (!data?.session) {
    throw new Error(
      "Biometric sign-in did not create an IyanjuPay session.",
    );
  }
}

/**
 * Authorize a transaction using the user's enabled biometric.
 * If biometrics are not enabled, callers should continue with the
 * normal Payment PIN flow.
 *
 * The PIN itself is never stored or recovered from the device.
 */
export async function authorizeTransactionWithBiometric(): Promise<boolean> {
  if (!isBiometricEnabled()) return false;

  await authenticateWithBiometric(
    "Authorize IyanjuPay transaction",
  );

  return true;
}
