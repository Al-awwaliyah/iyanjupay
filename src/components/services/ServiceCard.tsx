import React from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  title: string;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
  available?: boolean;
}

const ServiceCard = ({
  title,
  icon: Icon,
  onClick,
  color,
  available = true,
}: ServiceCardProps) => {
  const isUnavailable = !available;

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (isUnavailable) return;

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
      role={isUnavailable ? undefined : "button"}
      tabIndex={isUnavailable ? -1 : 0}
      aria-label={title}
      aria-disabled={isUnavailable}
      className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#082A63]/25 focus:ring-offset-1 sm:p-4"
      onClick={
        isUnavailable ? undefined : onClick
      }
      onKeyDown={handleKeyDown}
    >
      <CardContent className="flex h-full flex-col items-center justify-center p-0 text-center">
        {/* Service Icon */}

        <div
          className={[
            "mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105",
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

        <h3 className="min-h-[2.1em] break-words text-center text-[11px] font-bold leading-tight tracking-tight text-slate-900 sm:text-xs">
          {(() => {
            // Names as long as (or longer than) "Internet Service" are shown
            // on two lines: <p>Internet<br/>Service</p>.
            const text = title.replace(/\s+/g, " ").trim();
            if (text.length < 16 || !text.includes(" ")) return text;

            const middle = text.length / 2;
            let best = -1;
            for (let i = 0; i < text.length; i++) {
              if (text[i] !== " ") continue;
              if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
            }

            return (
              <>
                {text.slice(0, best)}
                <br />
                {text.slice(best + 1)}
              </>
            );
          })()}
        </h3>
      </CardContent>
    </Card>
  );
};

export default ServiceCard;
