import type { HTMLAttributes } from "react";
import AppLoader from "@/components/shared/AppLoader";

interface LoaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  /** Paint every spoke one colour (defaults to the current text colour at size "xs", for buttons). */
  color?: string;
}

const SIZES = { xs: 16, sm: 40, md: 56, lg: 72 } as const;

/** Spoke loader from the design system, optionally with a title and subtitle underneath. */
const Loader = ({
  title = "Wait for a moment...",
  subtitle = "Please wait while we prepare everything for you",
  size = "md",
  showText = true,
  color,
  className,
  ...props
}: LoaderProps) => {
  const px = SIZES[size];
  const spokeColor = color ?? (size === "xs" ? "currentColor" : undefined);

  if (!showText) {
    return (
      <span className={`inline-flex items-center justify-center ${className ?? ""}`} {...props}>
        <AppLoader size={px} color={spokeColor} label={title} />
      </span>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 p-8 text-center ${className ?? ""}`}
      role="status"
      {...props}
    >
      <AppLoader size={px} color={spokeColor} />
      <div className="space-y-1 max-w-64">
        <p className="text-sm font-semibold text-ink tracking-tight">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
};

export default Loader;
