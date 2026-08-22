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

const PWAInstallPrompt = () => {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<
    "android" | "ios" | "other" | null
  >(null);

  const [
    deferredPrompt,
    setDeferredPrompt,
  ] = useState<BeforeInstallPromptEvent | null>(null);

  const [isInstalled, setIsInstalled] =
    useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia(
        "(display-mode: standalone)",
      ).matches ||
      Boolean(
        (window.navigator as Navigator & {
          standalone?: boolean;
        }).standalone,
      );

    if (isStandalone) {
      setIsInstalled(true);
      setOpen(false);
      return;
    }

    const userAgent =
      window.navigator.userAgent ||
      "";

    const isIOS =
      /iPhone|iPad|iPod/i.test(
        userAgent,
      ) ||
      (
        /Macintosh/i.test(userAgent) &&
        "ontouchend" in document
      );

    const isAndroid =
      /Android/i.test(userAgent);

    if (isIOS) {
      setPlatform("ios");
      setOpen(true);
    } else if (isAndroid) {
      setPlatform("android");
    } else {
      setPlatform("other");
    }

    const handleBeforeInstallPrompt = (
      event: Event,
    ) => {
      event.preventDefault();

      const installEvent =
        event as BeforeInstallPromptEvent;

      setDeferredPrompt(installEvent);

      // Android / Chromium can use the real
      // native installation prompt.
      if (isAndroid) {
        setPlatform("android");
        setOpen(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );

    window.addEventListener(
      "appinstalled",
      handleAppInstalled,
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );

      window.removeEventListener(
        "appinstalled",
        handleAppInstalled,
      );
    };
  }, []);

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      const result =
        await deferredPrompt.prompt();

      console.log(
        "PWA install result:",
        result.outcome,
      );

      setDeferredPrompt(null);
      setOpen(false);
    } catch (error) {
      console.error(
        "PWA installation failed:",
        error,
      );
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  if (isInstalled || !platform) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        {/* Header */}
        <div className="bg-[#082A63] px-6 py-6 text-white">
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
        </div>

        {/* Gold accent */}
        <div className="h-1 bg-[#F4B400]" />

        {/* Content */}
        <div className="px-6 py-6 space-y-5">

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

              <Button
                type="button"
                onClick={
                  handleAndroidInstall
                }
                disabled={!deferredPrompt}
                className="w-full bg-[#082A63] hover:bg-[#061F49] text-white h-12"
              >
                <Download className="h-4 w-4 mr-2" />
                Install IyanjuPay
              </Button>

              {!deferredPrompt && (
                <p className="text-xs text-center text-gray-500">
                  Your browser has not made the
                  installation option available yet.
                </p>
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
                    On your iPhone or iPad, follow
                    these simple steps:
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
                        Use the Share icon in Safari.
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
                        Scroll down in the Share menu
                        and choose Add to Home Screen.
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
                      home screen like an app.
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

          {platform === "other" && (
            <>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm text-[#082A63] leading-6">
                  IyanjuPay can be installed on supported
                  browsers. Look for the Install option in
                  your browser's address bar or menu.
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
