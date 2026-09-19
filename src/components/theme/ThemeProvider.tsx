import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Moon, Palette, Sun } from "lucide-react";

export type IyanjuPayTheme =
  | "light"
  | "blue"
  | "dark";

const STORAGE_KEY =
  "iyanjupay-dashboard-theme";

const DEFAULT_THEME: IyanjuPayTheme =
  "dark";

export const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "blue", label: "Blue", icon: Palette },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies ReadonlyArray<{
  value: IyanjuPayTheme;
  label: string;
  icon: typeof Sun;
}>;

type ThemeContextValue = {
  theme: IyanjuPayTheme;
  setTheme: (theme: IyanjuPayTheme) => void;
};

const ThemeContext =
  createContext<ThemeContextValue | undefined>(
    undefined
  );

function isValidTheme(
  value: string | null
): value is IyanjuPayTheme {
  return (
    value === "light" ||
    value === "blue" ||
    value === "dark"
  );
}

function getStoredTheme(): IyanjuPayTheme {
  if (
    typeof window === "undefined"
  ) {
    return DEFAULT_THEME;
  }

  const saved =
    window.localStorage.getItem(
      STORAGE_KEY
    );

  return isValidTheme(saved)
    ? saved
    : DEFAULT_THEME;
}

function applyTheme(
  theme: IyanjuPayTheme
) {
  if (
    typeof document === "undefined"
  ) {
    return;
  }

  const html =
    document.documentElement;

  html.dataset.iyanjupayTheme =
    theme;

  html.classList.remove(
    "iyanjupay-theme-light",
    "iyanjupay-theme-blue",
    "iyanjupay-theme-dark"
  );

  html.classList.add(
    `iyanjupay-theme-${theme}`
  );

  document.body.dataset.iyanjupayTheme =
    theme;
}


export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    theme,
    setThemeState,
  ] = useState<IyanjuPayTheme>(
    getStoredTheme
  );

  const setTheme = useCallback(
    (nextTheme: IyanjuPayTheme) => {
      setThemeState(nextTheme);

      if (
        typeof window !== "undefined"
      ) {
        window.localStorage.setItem(
          STORAGE_KEY,
          nextTheme
        );
      }

      applyTheme(nextTheme);

      /*
       * Allows any legacy component that still listens for the
       * Dashboard theme event to react immediately.
       */
      window.dispatchEvent(
        new CustomEvent(
          "iyanjupay-theme-change",
          {
            detail: {
              theme: nextTheme,
            },
          }
        )
      );
    },
    []
  );

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      // Remove all user-theme state when leaving the user dashboard.
      // Admin routes intentionally do not use ThemeProvider/global theme state.
      if (typeof document === "undefined") return;

      const html = document.documentElement;
      html.removeAttribute("data-iyanjupay-theme");
      html.classList.remove(
        "iyanjupay-theme-light",
        "iyanjupay-theme-blue",
        "iyanjupay-theme-dark",
      );
      document.body.removeAttribute("data-iyanjupay-theme");
    };
  }, []);

  /*
   * Keep multiple browser tabs/windows synchronized.
   */
  useEffect(() => {
    const handleStorage = (
      event: StorageEvent
    ) => {
      if (
        event.key !== STORAGE_KEY
      ) {
        return;
      }

      if (
        isValidTheme(event.newValue)
      ) {
        setThemeState(event.newValue);
        applyTheme(event.newValue);
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider
      value={value}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context =
    useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme must be used inside ThemeProvider"
    );
  }

  return context;
}

export default ThemeProvider;
