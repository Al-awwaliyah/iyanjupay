import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type IyanjuPayTheme =
  | "light"
  | "blue"
  | "dark";

const STORAGE_KEY =
  "iyanjupay-dashboard-theme";

const DEFAULT_THEME: IyanjuPayTheme =
  "light";

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

function installGlobalThemeStyles() {
  if (
    typeof document === "undefined"
  ) {
    return () => {};
  }

  const STYLE_ID =
    "iyanjupay-global-theme-styles";

  const existing =
    document.getElementById(
      STYLE_ID
    );

  if (existing) {
    return () => {};
  }

  const style =
    document.createElement("style");

  style.id = STYLE_ID;

  style.textContent = `
    /*
     * ============================================================
     * IYANJUPAY GLOBAL THEME
     * ============================================================
     *
     * The theme is attached to <html> so it survives route changes.
     * Individual pages do NOT need their own theme state.
     */

    html {
      background: #f7f8fc;
    }

    body {
      background: #f7f8fc;
      color: #0f172a;
      transition:
        background-color 180ms ease,
        color 180ms ease;
    }

    /*
     * ------------------------------------------------------------
     * LIGHT
     * ------------------------------------------------------------
     */

    html.iyanjupay-theme-light,
    html[data-iyanjupay-theme="light"] {
      background: #f7f8fc;
    }

    html.iyanjupay-theme-light body,
    html[data-iyanjupay-theme="light"] body {
      background: #f7f8fc;
      color: #0f172a;
    }

    /*
     * ------------------------------------------------------------
     * BLUE
     * ------------------------------------------------------------
     */

    html.iyanjupay-theme-blue,
    html[data-iyanjupay-theme="blue"] {
      background: #f4f8ff;
    }

    html.iyanjupay-theme-blue body,
    html[data-iyanjupay-theme="blue"] body {
      background: #f4f8ff;
      color: #0f172a;
    }

    /*
     * Blue theme backgrounds
     */

    html.iyanjupay-theme-blue .bg-slate-50,
    html[data-iyanjupay-theme="blue"] .bg-slate-50 {
      background-color: #f4f8ff !important;
    }

    html.iyanjupay-theme-blue .bg-purple-50,
    html[data-iyanjupay-theme="blue"] .bg-purple-50 {
      background-color: #dbeafe !important;
    }

    html.iyanjupay-theme-blue .text-purple-700,
    html.iyanjupay-theme-blue .text-purple-600,
    html[data-iyanjupay-theme="blue"] .text-purple-700,
    html[data-iyanjupay-theme="blue"] .text-purple-600 {
      color: #1d4ed8 !important;
    }

    html.iyanjupay-theme-blue .bg-purple-600,
    html[data-iyanjupay-theme="blue"] .bg-purple-600 {
      background-color: #2563eb !important;
    }

    html.iyanjupay-theme-blue [class*="hover:bg-purple-700"]:hover,
    html[data-iyanjupay-theme="blue"] [class*="hover:bg-purple-700"]:hover {
      background-color: #1d4ed8 !important;
    }

    /*
     * ------------------------------------------------------------
     * DARK
     * ------------------------------------------------------------
     */

    html.iyanjupay-theme-dark,
    html[data-iyanjupay-theme="dark"] {
      background: #090d18;
    }

    html.iyanjupay-theme-dark body,
    html[data-iyanjupay-theme="dark"] body {
      background: #090d18;
      color: #f8fafc;
    }

    /*
     * White surfaces become dark surfaces.
     */

    html.iyanjupay-theme-dark .bg-white,
    html[data-iyanjupay-theme="dark"] .bg-white {
      background-color: #111827 !important;
    }

    /*
     * Slate backgrounds.
     */

    html.iyanjupay-theme-dark .bg-slate-50,
    html[data-iyanjupay-theme="dark"] .bg-slate-50 {
      background-color: #090d18 !important;
    }

    html.iyanjupay-theme-dark .bg-slate-100,
    html[data-iyanjupay-theme="dark"] .bg-slate-100 {
      background-color: #1e293b !important;
    }

    /*
     * Borders.
     */

    html.iyanjupay-theme-dark [class*="border-slate-200"],
    html[data-iyanjupay-theme="dark"] [class*="border-slate-200"] {
      border-color: #334155 !important;
    }

    html.iyanjupay-theme-dark [class*="border-slate-300"],
    html[data-iyanjupay-theme="dark"] [class*="border-slate-300"] {
      border-color: #475569 !important;
    }

    /*
     * Slate text.
     */

    html.iyanjupay-theme-dark .text-slate-950,
    html.iyanjupay-theme-dark .text-slate-900,
    html[data-iyanjupay-theme="dark"] .text-slate-950,
    html[data-iyanjupay-theme="dark"] .text-slate-900 {
      color: #f8fafc !important;
    }

    html.iyanjupay-theme-dark .text-slate-800,
    html[data-iyanjupay-theme="dark"] .text-slate-800 {
      color: #f1f5f9 !important;
    }

    html.iyanjupay-theme-dark .text-slate-700,
    html[data-iyanjupay-theme="dark"] .text-slate-700 {
      color: #e2e8f0 !important;
    }

    html.iyanjupay-theme-dark .text-slate-600,
    html[data-iyanjupay-theme="dark"] .text-slate-600 {
      color: #cbd5e1 !important;
    }

    html.iyanjupay-theme-dark .text-slate-500,
    html[data-iyanjupay-theme="dark"] .text-slate-500 {
      color: #94a3b8 !important;
    }

    html.iyanjupay-theme-dark .text-slate-400,
    html[data-iyanjupay-theme="dark"] .text-slate-400 {
      color: #64748b !important;
    }

    /*
     * Hover states.
     */

    html.iyanjupay-theme-dark [class*="hover:bg-slate-50"]:hover,
    html[data-iyanjupay-theme="dark"] [class*="hover:bg-slate-50"]:hover {
      background-color: #1e293b !important;
    }

    html.iyanjupay-theme-dark [class*="hover:bg-slate-100"]:hover,
    html[data-iyanjupay-theme="dark"] [class*="hover:bg-slate-100"]:hover {
      background-color: #334155 !important;
    }

    /*
     * Purple service surfaces.
     */

    html.iyanjupay-theme-dark .bg-purple-50,
    html[data-iyanjupay-theme="dark"] .bg-purple-50 {
      background-color: #312e81 !important;
    }

    html.iyanjupay-theme-dark .text-purple-700,
    html.iyanjupay-theme-dark .text-purple-600,
    html[data-iyanjupay-theme="dark"] .text-purple-700,
    html[data-iyanjupay-theme="dark"] .text-purple-600 {
      color: #c4b5fd !important;
    }

    /*
     * Other common service surfaces.
     */

    html.iyanjupay-theme-dark .bg-blue-50,
    html[data-iyanjupay-theme="dark"] .bg-blue-50 {
      background-color: #172554 !important;
    }

    html.iyanjupay-theme-dark .bg-emerald-50,
    html[data-iyanjupay-theme="dark"] .bg-emerald-50 {
      background-color: #052e2b !important;
    }

    html.iyanjupay-theme-dark .bg-orange-50,
    html[data-iyanjupay-theme="dark"] .bg-orange-50 {
      background-color: #431407 !important;
    }

    /*
     * Inputs/selects/textareas.
     *
     * These rules help pages that use standard Tailwind form
     * classes without requiring page-by-page modifications.
     */

    html.iyanjupay-theme-dark input.bg-white,
    html.iyanjupay-theme-dark select.bg-white,
    html.iyanjupay-theme-dark textarea.bg-white,
    html[data-iyanjupay-theme="dark"] input.bg-white,
    html[data-iyanjupay-theme="dark"] select.bg-white,
    html[data-iyanjupay-theme="dark"] textarea.bg-white {
      background-color: #111827 !important;
      color: #f8fafc !important;
    }

    html.iyanjupay-theme-dark input,
    html.iyanjupay-theme-dark select,
    html.iyanjupay-theme-dark textarea,
    html[data-iyanjupay-theme="dark"] input,
    html[data-iyanjupay-theme="dark"] select,
    html[data-iyanjupay-theme="dark"] textarea {
      color-scheme: dark;
    }

    /*
     * Placeholder text.
     */

    html.iyanjupay-theme-dark input::placeholder,
    html.iyanjupay-theme-dark textarea::placeholder,
    html[data-iyanjupay-theme="dark"] input::placeholder,
    html[data-iyanjupay-theme="dark"] textarea::placeholder {
      color: #64748b;
    }

    /*
     * Global smooth transition for major surfaces.
     */

    html.iyanjupay-theme-dark *,
    html.iyanjupay-theme-blue *,
    html.iyanjupay-theme-light *,
    html[data-iyanjupay-theme="dark"] *,
    html[data-iyanjupay-theme="blue"] *,
    html[data-iyanjupay-theme="light"] * {
      transition-property:
        background-color,
        border-color,
        color,
        box-shadow;
      transition-duration: 180ms;
      transition-timing-function: ease;
    }

    /*
     * Do not animate transforms/animations that components use
     * for menus, dialogs, sheets, etc.
     */

    html.iyanjupay-theme-dark [data-radix-popper-content-wrapper] *,
    html.iyanjupay-theme-blue [data-radix-popper-content-wrapper] *,
    html.iyanjupay-theme-light [data-radix-popper-content-wrapper] *,
    html[data-iyanjupay-theme] [data-radix-popper-content-wrapper] * {
      transition-property:
        background-color,
        border-color,
        color,
        box-shadow;
    }
  `;

  document.head.appendChild(style);

  return () => {
    style.remove();
  };
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
    const cleanupStyles =
      installGlobalThemeStyles();

    applyTheme(theme);

    return cleanupStyles;
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
