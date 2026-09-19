import { useEffect, useState } from "react"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const [sonnerTheme, setSonnerTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.iyanjupayTheme === "dark"
      ? "dark"
      : "light"
  )

  useEffect(() => {
    const syncTheme = () => {
      setSonnerTheme(
        document.documentElement.dataset.iyanjupayTheme === "dark"
          ? "dark"
          : "light"
      )
    }

    window.addEventListener("iyanjupay-theme-change", syncTheme)
    return () => window.removeEventListener("iyanjupay-theme-change", syncTheme)
  }, [])

  return (
    <Sonner
      theme={sonnerTheme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
