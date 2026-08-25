import React, { useEffect, useState } from "react";

import {
  Download,
  Share,
  PlusSquare,
  Smartphone,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;

  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type Platform =
  | "android"
  | "ios"
  | "other"
  | null;

const PWAInstallPrompt = () => {
  const [open, setOpen] =
    useState(false);

  const [platform, setPlatform] =
    useState<Platform>(null);

  const [
    deferredPrompt,
    setDeferredPrompt,
  ] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  const [
    isInstalled,
    setIsInstalled,
  ] = useState(false);

  useEffect(() => {
    let mounted = true;

    // ============================================================
    // CHECK IF ALREADY INSTALLED
    // ============================================================

    const checkInstalled = () => {
      const standalone =
        window.matchMedia(
          "(display-mode: standalone)"
        ).matches;

      const fullscreen =
        window.matchMedia(
          "(display-mode: fullscreen)"
        ).matches;

      const minimalUi =
        window.matchMedia(
          "(display-mode: minimal-ui)"
        ).matches;

      const iosStandalone =
        Boolean(
          (
            window.navigator as Navigator & {
              standalone?: boolean;
            }
          ).standalone
        );

      return (
        standalone ||
        fullscreen ||
        minimalUi ||
        iosStandalone
      );
    };

    if (checkInstalled()) {
      setIsInstalled(true);
      setOpen(false);
      return;
    }

    // ============================================================
    // DETECT DEVICE
    // ============================================================

    const userAgent =
      window.navigator.userAgent ||
      "";

    const isIOS =
      /iPhone|iPad|iPod/i.test(
        userAgent
      ) ||
      (
        /Macintosh/i.test(userAgent) &&
        "ontouchend" in document
      );

    const isAndroid =
      /Android/i.test(userAgent);

    if (isIOS) {
      setPlatform("ios");

      // Show our iOS instructions immediately.
      setOpen(true);
    } else if (isAndroid) {
      setPlatform("android");

      // IMPORTANT:
      // Show our custom install dialog even
      // before beforeinstallprompt fires.
      setOpen(true);
    } else {
      setPlatform("other");

      // Desktop browsers can also support
      // PWA installation.
      setOpen(true);
    }

    // ============================================================
    // ANDROID / CHROME INSTALL PROMPT
    // ============================================================

    const handleBeforeInstallPrompt = (
      event: Event
    ) => {
      event.preventDefault();

      const installEvent =
        event as BeforeInstallPromptEvent;

      if (!mounted) {
        return;
      }

      setDeferredPrompt(
        installEvent
      );

      // Make sure Android dialog is visible.
      if (isAndroid) {
        setPlatform("android");
        setOpen(true);
      }
    };

    // ============================================================
    // APP INSTALLED
    // ============================================================

    const handleAppInstalled = () => {
      if (!mounted) {
        return;
      }

      console.log(
        "IyanjuPay installed successfully."
      );

      setIsInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
    };

    // ============================================================
    // DISPLAY MODE CHANGE
    // ============================================================

    const mediaQuery =
      window.matchMedia(
        "(display-mode: standalone)"
      );

    const handleDisplayModeChange = () => {
      if (checkInstalled()) {
        setIsInstalled(true);
        setOpen(false);
      }
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleAppInstalled
    );

    mediaQuery.addEventListener?.(
      "change",
      handleDisplayModeChange
    );

    return () => {
      mounted = false;

      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleAppInstalled
      );

      mediaQuery.removeEventListener?.(
        "change",
        handleDisplayModeChange
      );
    };
  }, []);

  // ============================================================
  // ANDROID INSTALL
  // ============================================================

  const handleAndroidInstall =
    async () => {
      if (!deferredPrompt) {
        return;
      }

      try {
        const promptEvent =
          deferredPrompt;

        // Clear first to prevent
        // duplicate invocation.
        setDeferredPrompt(null);

        const result =
          await promptEvent.prompt();

        console.log(
          "IyanjuPay install result:",
          result.outcome
        );

        if (
          result.outcome ===
          "accepted"
        ) {
          setOpen(false);
        }
      } catch (error) {
        console.error(
          "PWA installation failed:",
          error
        );
      }
    };

  // ============================================================
  // CLOSE
  // ============================================================

  const handleClose = () => {
    setOpen(false);
  };

  // ============================================================
  // DON'T RENDER WHEN INSTALLED
  // ============================================================

  if (
    isInstalled ||
    !platform
  ) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="bg-[#082A63] px-6 py-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                <span className="text-[#082A63] font-bold text-lg">
                  IP
                </span>
              </div>

              <div>
                <DialogTitle className="text-white text-xl">
                  Install IyanjuPay
                </DialogTitle>

                <DialogDescription className="text-blue-100 mt-1">
                  Get faster access from your home screen.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Gold accent */}

        <div className="h-1 bg-[#F4B400]" />

        {/* ======================================================
            CONTENT
        ====================================================== */}

        <div className="px-6 py-6 space-y-5">

          {/* ====================================================
              ANDROID
          ==================================================== */}

          {platform === "android" && (
            <>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Download className="h-5 w-5 text-[#082A63]" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#082A63]">
                    Install the IyanjuPay app
                  </h3>

                  <p className="text-sm text-gray-600 mt-1 leading-6">
                    Install IyanjuPay on your Android
                    device for quick access from your
                    home screen.
                  </p>
                </div>
              </div>

              {/* Native install available */}

              {deferredPrompt ? (
                <Button
                  type="button"
                  onClick={
                    handleAndroidInstall
                  }
                  className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
                >
                  <Download className="h-4 w-4 mr-2" />

                  Install IyanjuPay
                </Button>
              ) : (
                <>
                  <div className="rounded-xl bg-blue-50 p-4">
                    <p className="text-sm text-[#082A63] leading-6">
                      To install IyanjuPay, open your
                      browser menu and select
                      <strong>
                        {" "}Install app
                      </strong>
                      {" "}or
                      <strong>
                        {" "}Add to Home screen
                      </strong>
                      .
                    </p>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border p-4">
                    <Smartphone className="h-5 w-5 text-[#082A63]" />

                    <p className="text-sm text-gray-600">
                      If your browser displays an
                      install icon in the address bar,
                      tap it to install IyanjuPay.
                    </p>
                  </div>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                className="w-full"
              >
                Maybe Later
              </Button>
            </>
          )}

          {/* ====================================================
              IOS
          ==================================================== */}

          {platform === "ios" && (
            <>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Smartphone className="h-5 w-5 text-[#082A63]" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#082A63]">
                    Add IyanjuPay to your Home Screen
                  </h3>

                  <p className="text-sm text-gray-600 mt-1 leading-6">
                    Follow these simple steps on your
                    iPhone or iPad.
                  </p>
                </div>
              </div>

              {/* Step 1 */}

              <div className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#F4B400] text-[#082A63] flex items-center justify-center font-bold shrink-0">
                    1
                  </div>

                  <div>
                    <p className="font-semibold text-gray-900">
                      Tap the Share button
                    </p>

                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                      <Share className="h-4 w-4 text-[#082A63]" />

                      <span>
                        Tap the Share icon in Safari.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}

              <div className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#F4B400] text-[#082A63] flex items-center justify-center font-bold shrink-0">
                    2
                  </div>

                  <div>
                    <p className="font-semibold text-gray-900">
                      Select "Add to Home Screen"
                    </p>

                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                      <PlusSquare className="h-4 w-4 text-[#082A63]" />

                      <span>
                        Scroll down and select
                        Add to Home Screen.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}

              <div className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#F4B400] text-[#082A63] flex items-center justify-center font-bold shrink-0">
                    3
                  </div>

                  <div>
                    <p className="font-semibold text-gray-900">
                      Tap "Add"
                    </p>

                    <p className="text-sm text-gray-600 mt-2 leading-6">
                      IyanjuPay will appear on your
                      Home Screen and open like an app.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleClose}
                className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
              >
                Got It
              </Button>
            </>
          )}

          {/* ====================================================
              DESKTOP / OTHER
          ==================================================== */}

          {platform === "other" && (
            <>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm text-[#082A63] leading-6">
                  IyanjuPay can be installed on supported
                  browsers. Look for the Install option in
                  your browser's address bar or browser menu.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleClose}
                className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
              >
                Continue
              </Button>
            </>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PWAInstallPrompt;
