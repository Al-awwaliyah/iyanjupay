import React from "react";
import { ArrowUpRight, LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DashboardActionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  onClick: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  className?: string;
  showArrow?: boolean;
}

/**
 * IyanjuPay dashboard action primitive.
 *
 * Quick Actions and Payment Services intentionally share this
 * exact component so the dashboard has one visual language.
 */
export default function DashboardActionCard({
  title,
  description,
  icon: Icon,
  iconClassName = "bg-primary/10 text-primary",
  onClick,
  disabled = false,
  comingSoon = false,
  className,
  showArrow = true,
}: DashboardActionCardProps) {
  const unavailable = disabled || comingSoon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={unavailable}
      aria-label={
        comingSoon
          ? `${title}, coming soon`
          : title
      }
      className={cn(
        "group relative flex min-h-[116px] w-full flex-col items-center justify-center",
        "rounded-2xl border border-border/80 bg-card px-3 py-3.5 text-center",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
        "active:scale-[0.98]",
        unavailable && "cursor-default opacity-55 hover:translate-y-0 hover:shadow-none",
        className,
      )}
    >
      {comingSoon && (
        <span className="absolute right-2 top-2 rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      )}

      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl",
          "transition-transform duration-200 group-hover:scale-105",
          comingSoon && "grayscale",
          iconClassName,
        )}
      >
        <Icon
          className="h-[19px] w-[19px]"
          strokeWidth={2.1}
          aria-hidden="true"
        />
      </span>

      <span className="mt-2.5 line-clamp-1 text-xs font-bold tracking-tight text-foreground">
        {title}
      </span>

      {description && (
        <span className="mt-1 line-clamp-2 max-w-[165px] text-[10px] leading-[1.35] text-muted-foreground">
          {description}
        </span>
      )}

      {showArrow && !unavailable && (
        <span className="mt-1.5 flex items-center gap-0.5 text-[9px] font-semibold text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          Open
          <ArrowUpRight className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
