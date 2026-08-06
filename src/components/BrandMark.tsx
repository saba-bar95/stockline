import { cn } from "../lib/cn";

/** Upright Stockline mark — no italic / slant. */
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
      <path
        d="M12 34V14h4.2l5.8 12.6L27.8 14H32v20h-3.6V21.2L23.2 34h-3.4l-5.2-12.8V34H12z"
        fill="#2dd4bf"
      />
      <path d="M34 34V14h3.6v20H34z" fill="#2dd4bf" />
      <rect x="12" y="37" width="24" height="2.5" rx="1.25" fill="#14b8a6" />
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
