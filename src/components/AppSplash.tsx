import React, { useEffect, useState } from "react";

interface AppSplashProps {
  children: React.ReactNode;
}

const AppSplash = ({ children }: AppSplashProps) => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <img
            src="/og-image.jpg"
            alt="IyanjuPay"
            className="h-24 w-24 object-contain animate-pulse"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppSplash;
