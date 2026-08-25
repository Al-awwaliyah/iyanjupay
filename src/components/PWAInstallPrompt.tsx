import React, {
  useEffect,
  useState,
} from "react";

import {
  Download,
  Share,
  PlusSquare,
  Smartphone,
  X,
  MoreVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent
  extends Event {
  prompt: () => Promise<{
    outcome:
      | "accepted"
      | "dismissed";
    platform: string;
  }>;

  userChoice: Promise<{
    outcome:
      | "accepted"
      | "dismissed";
    platform: string;
  }>;
}

const PWAInstallPrompt = () => {
  const [open, setOpen] =
    useState(false);

  const [
    platform,
    setPlatform,
  ] = useState<
    "android" | "ios" | "other" | null
  >(null);

  const [
    deferredPrompt,
    setDeferredPrompt,
  ] =
    useState<BeforeInstallPromptEvent | null>(
      null
    );

  const [
    isInstalled,
    setIsInstalled,
  ] = useState(false);

  const [
    androidNativeReady,
    setAndroidNativeReady,
  ] = useState(false);

  // ============================================================
  // DETECT PLATFORM + PWA INSTALL STATE
  // ============================================================

  useEffect(() => {
    const detectPlatform =
      () => {
        const mediaQuery =
          window.matchMedia(
            "(display-mode: standalone)"
          );

        const navigatorWithStandalone =
          window.navigator as Navigator & {
            standalone?: boolean;
          };

        const isStandalone =
          mediaQuery.matches ||
          Boolean(
            navigatorWithStandalone.standalone
          );

        if (isStandalone) {
          setIsInstalled(true);
          setOpen(false);
          return;
        }

        const userAgent =
          window.navigator.userAgent ||
          "";

        // ------------------------------------------------------
        // iOS
        // ------------------------------------------------------

        const isIOS =
          /iPhone|iPad|iPod/i.test(
            userAgent
          ) ||
          (
            /Macintosh/i.test(
              userAgent
            ) &&
            "ontouchend" in document
          );

        // ------------------------------------------------------
        // Android
        // ------------------------------------------------------

        const isAndroid =
          /Android/i.test(
            userAgent
          );

        if (isIOS) {
          setPlatform("ios");

          /**
           * Show IyanjuPay's installation
           * guide immediately.
           */
          setOpen(true);

          return;
        }

        if (isAndroid) {
          setPlatform("android");

          /**
           * Show our installation dialog
           * immediately.
           *
           * The native Chrome installation
           * prompt may arrive slightly later.
           */
          setOpen(true);

          return;
        }

        // ------------------------------------------------------
        // Desktop / Other
        // ------------------------------------------------------

        setPlatform("other");

        /**
         * We don't automatically force the
         * installation dialog on desktop.
         */
        setOpen(false);
      };

    detectPlatform();

    // ----------------------------------------------------------
    // Listen for changes in display mode
    // ----------------------------------------------------------

    const mediaQuery =
      window.matchMedia(
        "(display-mode: standalone)"
      );

    const handleDisplayModeChange =
      (event: MediaQueryListEvent) => {
        if (event.matches) {
          setIsInstalled(true);
          setOpen(false);
        }
      };

    mediaQuery.addEventListener(
      "change",
      handleDisplayModeChange
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        handleDisplayModeChange
      );
    };
  }, []);

  // ============================================================
  // ANDROID BEFORE INSTALL PROMPT
  // ============================================================

  useEffect(() => {
    const handleBeforeInstallPrompt =
      (event: Event) => {
        console.log(
          "IyanjuPay beforeinstallprompt fired."
        );

        /**
         * Stop Chrome from automatically
         * displaying its own mini-infobar.
         */
        event.preventDefault();

        const installEvent =
          event as BeforeInstallPromptEvent;

        setDeferredPrompt(
          installEvent
        );

        setAndroidNativeReady(
          true
        );

        /**
         * Ensure our IyanjuPay dialog
         * is visible.
         */
        setPlatform("android");
        setOpen(true);
      };

    const handleAppInstalled =
      () => {
        console.log(
          "IyanjuPay PWA installed."
        );

        setIsInstalled(true);
        setOpen(false);
        setDeferredPrompt(null);
        setAndroidNativeReady(
          false
        );
      };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleAppInstalled
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleAppInstalled
      );
    };
  }, []);

  // ============================================================
  // ANDROID INSTALL
  // ============================================================

  const handleAndroidInstall =
    async () => {
      /**
       * If Chrome has provided the real
       * installation event, use it.
       */
      if (deferredPrompt) {
        try {
          const result =
            await deferredPrompt.prompt();

          console.log(
            "IyanjuPay installation result:",
            result.outcome
          );

          const choice =
            await deferredPrompt.userChoice;

          console.log(
            "IyanjuPay user choice:",
            choice.outcome
          );

          setDeferredPrompt(null);

          if (
            choice.outcome ===
            "accepted"
          ) {
            setOpen(false);
          }

          return;
        } catch (error) {
          console.error(
            "Native PWA installation failed:",
            error
          );
        }
      }

      /**
       * If Chrome hasn't exposed
       * beforeinstallprompt yet, the
       * browser must be used manually.
       */
      console.log(
        "Native Android installation prompt is not available yet."
      );
    };

  // ============================================================
  // CLOSE
  // ============================================================

  const handleClose = () => {
    setOpen(false);
  };

  // ============================================================
  // ALREADY INSTALLED
  // ============================================================

  if (isInstalled) {
    return null;
  }

  if (!platform) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent
        className="
          sm:max-w-md
          overflow-hidden
          p-0
          max-h-[90vh]
          overflow-y-auto
        "
      >

        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="bg-[#082A63] px-6 py-6 text-white">

          <div className="flex items-center gap-3">

            <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">

              <span className="text-[#082A63] font-bold text-lg">
                IP
              </span>

            </div>

            <div className="flex-1">

              <DialogTitle className="text-white text-xl">
                Install IyanjuPay
              </DialogTitle>

              <DialogDescription className="text-blue-100 mt-1">
                Get faster access from your
                home screen.
              </DialogDescription>

            </div>

          </div>

        </div>

        {/* ====================================================
            GOLD ACCENT
        ==================================================== */}

        <div className="h-1 bg-[#F4B400]" />

        {/* ====================================================
            CONTENT
        ==================================================== */}

        <div className="px-6 py-6 space-y-5">

          {/* ==================================================
              ANDROID
          ================================================== */}

          {platform === "android" && (
            <>
              <div className="flex items-start gap-3">

                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">

                  <Download className="h-5 w-5 text-[#082A63]" />

                </div>

                <div>

                  <h3 className="font-semibold text-[#082A63]">
                    Install IyanjuPay
                  </h3>

                  <p className="text-sm text-gray-600 mt-1 leading-6">
                    Add IyanjuPay to your Android
                    home screen for faster access,
                    just like a normal app.
                  </p>

                </div>

              </div>

              {/* ==============================================
                  NATIVE INSTALL BUTTON
              ============================================== */}

              <Button
                type="button"
                onClick={
                  handleAndroidInstall
                }
                className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
              >
                <Download className="h-4 w-4 mr-2" />

                {androidNativeReady
                  ? "Install IyanjuPay"
                  : "Install IyanjuPay"}
              </Button>

              {/* ==============================================
                  MANUAL ANDROID GUIDE
              ============================================== */}

              {!androidNativeReady && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 space-y-4">

                  <p className="text-sm font-semibold text-[#082A63]">
                    If the Install button does
                    not open the Android prompt:
                  </p>

                  <div className="flex items-start gap-3">

                    <div className="h-8 w-8 rounded-full bg-[#F4B400] text-[#082A63] flex items-center justify-center font-bold shrink-0">
                      1
                    </div>

                    <div>
                      <p className="font-semibold text-gray-900">
                        Open the browser menu
                      </p>

                      <p className="text-sm text-gray-600 mt-1 leading-6">
                        In Chrome, tap the
                        three-dot menu at the
                        top-right.
                      </p>
                    </div>

                  </div>

                  <div className="flex items-start gap-3">

                    <div className="h-8 w-8 rounded-full bg-[#F4B400] text-[#082A63] flex items-center justify-center font-bold shrink-0">
                      2
                    </div>

                    <div>
                      <p className="font-semibold text-gray-900">
                        Choose Install app
                      </p>

                      <p className="text-sm text-gray-600 mt-1 leading-6">
                        Look for "Install app"
                        or "Add to Home screen".
                      </p>
                    </div>

                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MoreVertical className="h-4 w-4" />

                    <span>
                      The exact wording depends
                      on your Android browser.
                    </span>
                  </div>

                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={
                  handleClose
                }
                className="w-full"
              >
                Maybe Later
              </Button>
            </>
          )}

          {/* ==================================================
              IOS
          ================================================== */}

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
                    Follow these steps on your
                    iPhone or iPad.
                  </p>

                </div>

              </div>

              {/* ==============================================
                  IOS STEP 1
              ============================================== */}

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
                        In Safari, tap the
                        Share icon.
                      </span>

                    </div>

                  </div>

                </div>

              </div>

              {/* ==============================================
                  IOS STEP 2
              ============================================== */}

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
                        Scroll through the
                        Share menu and select
                        Add to Home Screen.
                      </span>

                    </div>

                  </div>

                </div>

              </div>

              {/* ==============================================
                  IOS STEP 3
              ============================================== */}

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
                      IyanjuPay will appear on
                      your iPhone home screen
                      like an installed app.
                    </p>

                  </div>

                </div>

              </div>

              {/* ==============================================
                  IOS NOTE
              ============================================== */}

              <div className="rounded-xl bg-blue-50 p-4">

                <p className="text-sm text-[#082A63] leading-6">
                  <strong>Tip:</strong> For the
                  most reliable Add to Home Screen
                  experience, open IyanjuPay in
                  Safari on your iPhone or iPad.
                </p>

              </div>

              <Button
                type="button"
                onClick={
                  handleClose
                }
                className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
              >
                Got It
              </Button>
            </>
          )}

          {/* ==================================================
              OTHER
          ================================================== */}

          {platform === "other" && (
            <>
              <div className="rounded-xl bg-blue-50 p-4">

                <p className="text-sm text-[#082A63] leading-6">
                  IyanjuPay can be installed on
                  supported browsers. Look for
                  the Install option in your
                  browser's address bar or menu.
                </p>

              </div>

              <Button
                type="button"
                onClick={
                  handleClose
                }
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
