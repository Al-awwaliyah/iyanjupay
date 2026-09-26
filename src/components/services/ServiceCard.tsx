import React from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
  comingSoon?: boolean;
  available?: boolean;
}

const ServiceCard = ({
  title,
  description,
  icon: Icon,
  onClick,
  color,
  comingSoon = false,
  available = true,
}: ServiceCardProps) => {
  const isComingSoon =
    comingSoon || !available;

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (isComingSoon) return;

    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role={
        isComingSoon
          ? undefined
          : "button"
      }
      tabIndex={
        isComingSoon ? -1 : 0
      }
      aria-label={
        isComingSoon
          ? `${title}, coming soon`
          : title
      }
      aria-disabled={isComingSoon}
      className={[
        "group relative h-full overflow-hidden",
        "rounded-2xl border bg-white",
        "transition-all duration-200",
        isComingSoon
          ? [
              "cursor-default",
              "border-slate-200",
              "opacity-75",
            ].join(" ")
          : [
              "cursor-pointer",
              "border-slate-200",
              "hover:-translate-y-0.5",
              "hover:border-slate-300",
              "hover:shadow-lg",
              "focus:outline-none",
              "focus:ring-2",
              "focus:ring-[#082A63]/25",
              "focus:ring-offset-1",
            ].join(" "),
      ].join(" ")}
      onClick={
        isComingSoon
          ? undefined
          : onClick
      }
      onKeyDown={handleKeyDown}
    >
      <CardContent className="relative flex h-full min-h-[96px] flex-col items-center justify-center p-3 text-center sm:min-h-[104px] sm:p-4">
        {/* Coming Soon Badge */}

        {isComingSoon && (
          <div className="absolute right-2 top-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-slate-500 sm:right-2.5 sm:top-2.5 sm:px-2 sm:text-[8px]">
            Coming Soon
          </div>
        )}

        {/* Service Icon */}

        <div
          className={[
            "mb-2.5 flex h-10 w-10 shrink-0",
            "items-center justify-center",
            "rounded-xl shadow-sm",
            "transition-all duration-200",
            isComingSoon
              ? "grayscale"
              : [
                  "group-hover:scale-105",
                  "group-hover:shadow-md",
                ].join(" "),
            color,
          ].join(" ")}
        >
          <Icon
            className="h-[18px] w-[18px] text-white sm:h-5 sm:w-5"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>

        {/* Service Name */}

        <h3 className="mt-2 line-clamp-1 text-[11px] font-bold leading-tight tracking-tight text-slate-700 sm:text-xs">
          {title}
        </h3>

      </CardContent>
    </Card>
  );
};

export default ServiceCard;
