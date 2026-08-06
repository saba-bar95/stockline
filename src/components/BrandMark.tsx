import { cn } from "../lib/cn";

/** Upright Stockline mark — materials compose a finished product. */
export function BrandMark({
  className,
  title = "Stockline",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <rect width="48" height="48" rx="12" fill="#10221e" />
      <rect x="14" y="10" width="20" height="14" rx="2.5" fill="#2dd4bf" />
      <rect
        x="18"
        y="14"
        width="12"
        height="2.5"
        rx="1.25"
        fill="#10221e"
        opacity="0.35"
      />
      <rect
        x="11"
        y="28"
        width="7"
        height="7"
        rx="1.5"
        fill="#2dd4bf"
        opacity="0.55"
      />
      <rect
        x="20.5"
        y="28"
        width="7"
        height="7"
        rx="1.5"
        fill="#2dd4bf"
        opacity="0.75"
      />
      <rect
        x="30"
        y="28"
        width="7"
        height="7"
        rx="1.5"
        fill="#2dd4bf"
        opacity="0.55"
      />
      <rect
        x="13.5"
        y="24"
        width="2"
        height="4"
        rx="1"
        fill="#14b8a6"
        opacity="0.7"
      />
      <rect x="23" y="24" width="2" height="4" rx="1" fill="#14b8a6" />
      <rect
        x="32.5"
        y="24"
        width="2"
        height="4"
        rx="1"
        fill="#14b8a6"
        opacity="0.7"
      />
      <rect x="10" y="38" width="28" height="3" rx="1.5" fill="#14b8a6" />
    </svg>
  );
}

export function BrandWordmark({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("size-8", markClassName)} />
      <span
        className={cn(
          "font-display font-semibold tracking-tight uppercase",
          textClassName,
        )}
      >
        Stockline
      </span>
    </span>
  );
}
