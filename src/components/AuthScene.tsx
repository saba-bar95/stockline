import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

const PARTICLES = [
  { x: 8, y: 18, size: 6, delay: 0, dur: 14 },
  { x: 22, y: 72, size: 4, delay: 2, dur: 18 },
  { x: 78, y: 24, size: 5, delay: 1, dur: 16 },
  { x: 88, y: 68, size: 7, delay: 3, dur: 20 },
  { x: 52, y: 12, size: 3, delay: 4, dur: 12 },
  { x: 64, y: 82, size: 5, delay: 1.5, dur: 17 },
  { x: 14, y: 48, size: 4, delay: 2.5, dur: 15 },
  { x: 92, y: 42, size: 3, delay: 0.5, dur: 13 },
] as const;

/** Soft abstract flow: materials → composition → product → value. Industry-neutral. */
function AuthAbstractArt({ theme }: { theme: "light" | "dark" }) {
  const stroke =
    theme === "dark" ? "rgb(45 212 191 / 0.28)" : "rgb(15 118 110 / 0.22)";
  const strokeSoft =
    theme === "dark" ? "rgb(45 212 191 / 0.14)" : "rgb(15 118 110 / 0.12)";
  const fill =
    theme === "dark" ? "rgb(45 212 191 / 0.35)" : "rgb(15 118 110 / 0.28)";
  const fillSoft =
    theme === "dark" ? "rgb(251 191 36 / 0.28)" : "rgb(180 83 9 / 0.2)";
  const bead =
    theme === "dark" ? "rgb(45 212 191 / 0.85)" : "rgb(15 118 110 / 0.75)";
  const beadAmber =
    theme === "dark" ? "rgb(251 191 36 / 0.9)" : "rgb(180 83 9 / 0.7)";
  const line =
    theme === "dark" ? "rgb(255 255 255 / 0.06)" : "rgb(16 34 30 / 0.06)";

  const flowMain = "M80 620 C 320 560, 420 420, 620 380 S 980 300, 1280 240";
  const flowMid = "M120 720 C 360 680, 480 540, 700 500 S 1020 420, 1320 360";
  const flowTop = "M60 500 C 280 480, 400 340, 580 300 S 920 220, 1200 180";

  const nodes = [
    [180, 590],
    [420, 470],
    [620, 380],
    [860, 320],
    [1120, 260],
  ] as const;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="authFlow" x1="0" y1="0" x2="1" y2="0.2">
          <stop
            offset="0%"
            stopColor={theme === "dark" ? "#2dd4bf" : "#0f766e"}
            stopOpacity="0"
          />
          <stop
            offset="45%"
            stopColor={theme === "dark" ? "#2dd4bf" : "#0f766e"}
            stopOpacity="0.55"
          />
          <stop
            offset="100%"
            stopColor={theme === "dark" ? "#fbbf24" : "#b45309"}
            stopOpacity="0.4"
          />
        </linearGradient>
      </defs>

      <g className="auth-grid-drift">
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={60 + i * 70}
            x2="1440"
            y2={60 + i * 70}
            stroke={line}
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <line
            key={`v-${i}`}
            x1={40 + i * 90}
            y1="0"
            x2={40 + i * 90}
            y2="900"
            stroke={line}
            strokeWidth="1"
          />
        ))}
      </g>

      {/* Base flow paths */}
      <path
        d={flowMain}
        fill="none"
        stroke="url(#authFlow)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="auth-flow-pulse"
      />
      <path
        d={flowMid}
        fill="none"
        stroke={strokeSoft}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d={flowTop}
        fill="none"
        stroke={strokeSoft}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Moving dashed overlays */}
      <path
        d={flowMain}
        fill="none"
        stroke={bead}
        strokeWidth="2"
        strokeLinecap="round"
        className="auth-flow-dash auth-flow-dash-a"
      />
      <path
        d={flowMid}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        className="auth-flow-dash auth-flow-dash-b"
      />
      <path
        d={flowTop}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        className="auth-flow-dash auth-flow-dash-c"
      />

      {/* Traveling beads along flows */}
      <circle r="5" fill={bead}>
        <animateMotion dur="14s" repeatCount="indefinite" path={flowMain} />
      </circle>
      <circle r="3.5" fill={beadAmber}>
        <animateMotion
          dur="14s"
          begin="4.5s"
          repeatCount="indefinite"
          path={flowMain}
        />
      </circle>
      <circle r="4" fill={bead} opacity="0.7">
        <animateMotion dur="18s" repeatCount="indefinite" path={flowMid} />
      </circle>
      <circle r="3" fill={beadAmber} opacity="0.75">
        <animateMotion
          dur="16s"
          begin="2s"
          repeatCount="indefinite"
          path={flowTop}
        />
      </circle>

      {/* Composition layers — staggered float */}
      <g className="auth-abstract-drift">
        <rect
          x="980"
          y="480"
          width="220"
          height="36"
          rx="10"
          fill={fill}
          className="auth-layer auth-layer-1"
        />
        <rect
          x="1000"
          y="528"
          width="180"
          height="36"
          rx="10"
          fill={fill}
          className="auth-layer auth-layer-2"
        />
        <rect
          x="1020"
          y="576"
          width="140"
          height="36"
          rx="10"
          fill={fill}
          className="auth-layer auth-layer-3"
        />
        <rect
          x="1040"
          y="640"
          width="100"
          height="10"
          rx="5"
          fill={fillSoft}
          className="auth-layer auth-layer-4"
        />
      </g>

      {/* Floating mini blocks */}
      <rect
        x="220"
        y="210"
        width="56"
        height="18"
        rx="6"
        fill={fill}
        className="auth-float-block auth-float-block-a"
      />
      <rect
        x="310"
        y="248"
        width="40"
        height="14"
        rx="5"
        fill={fillSoft}
        className="auth-float-block auth-float-block-b"
      />
      <rect
        x="1280"
        y="560"
        width="48"
        height="16"
        rx="5"
        fill={fill}
        className="auth-float-block auth-float-block-c"
      />

      {/* Nodes with pulse rings */}
      {nodes.map(([cx, cy], i) => (
        <g key={i} className={`auth-node auth-node-${i}`}>
          <circle
            cx={cx}
            cy={cy}
            r="18"
            fill={i === 4 ? fillSoft : fill}
            opacity="0.22"
          />
          <circle cx={cx} cy={cy} r="7" fill={i === 4 ? fillSoft : fill} />
          <circle
            cx={cx}
            cy={cy}
            r="28"
            fill="none"
            stroke={i === 4 ? fillSoft : stroke}
            strokeWidth="1"
            className="auth-node-ring"
          />
          <circle
            cx={cx}
            cy={cy}
            r="28"
            fill="none"
            stroke={i === 4 ? fillSoft : stroke}
            strokeWidth="1"
            className="auth-node-ring auth-node-ring-delay"
          />
        </g>
      ))}
    </svg>
  );
}

type AuthSceneProps = {
  theme: "light" | "dark";
  children: ReactNode;
};

export function AuthScene({ theme, children }: AuthSceneProps) {
  return (
    <div className="auth-page relative flex min-h-screen overflow-hidden text-ink">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "absolute inset-0",
            theme === "dark"
              ? "bg-[linear-gradient(145deg,#071411_0%,#0c1f1a_42%,#10221e_100%)]"
              : "bg-[linear-gradient(145deg,#f3f7f5_0%,#e8f0ed_45%,#dce8e4_100%)]",
          )}
        />

        <div className="auth-mesh auth-mesh-a absolute -left-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full bg-teal/25 blur-[100px]" />
        <div className="auth-mesh auth-mesh-b absolute -bottom-1/4 -right-1/4 h-[60vh] w-[60vh] rounded-full bg-amber/20 blur-[90px]" />
        <div className="auth-mesh auth-mesh-c absolute left-1/2 top-1/3 h-[40vh] w-[40vh] -translate-x-1/2 rounded-full bg-teal-deep/15 blur-[80px]" />

        <AuthAbstractArt theme={theme} />

        <div
          className={cn(
            "absolute inset-0",
            theme === "dark"
              ? "bg-[radial-gradient(ellipse_70%_55%_at_20%_40%,rgb(6_12_10/0.15),transparent_70%),linear-gradient(90deg,rgb(6_12_10/0.55)_0%,transparent_55%)]"
              : "bg-[radial-gradient(ellipse_70%_55%_at_20%_40%,rgb(243_247_245/0.35),transparent_70%),linear-gradient(90deg,rgb(243_247_245/0.65)_0%,transparent_55%)]",
          )}
        />

        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="auth-particle absolute rounded-full bg-teal/40 shadow-[0_0_12px_rgb(15_118_110/0.35)]"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full flex-col">{children}</div>
    </div>
  );
}

type AuthHeroProps = {
  headlineLead: string;
  headlineLeadSignIn: string;
  headlineLeadSignUp: string;
  headlineTail: string;
  mode: "sign-in" | "sign-up";
  blurb: string;
  tagline: string;
};

const headlineFill =
  "auth-shimmer font-ge bg-gradient-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent";

export function AuthHero({
  headlineLead,
  headlineLeadSignIn,
  headlineLeadSignUp,
  headlineTail,
  mode,
  blurb,
  tagline,
}: AuthHeroProps) {
  const [canAnimate, setCanAnimate] = useState(false);
  const leadMeasure =
    headlineLeadSignIn.length >= headlineLeadSignUp.length
      ? headlineLeadSignIn
      : headlineLeadSignUp;
  const swapClass =
    mode === "sign-up" ? "auth-headline-from-right" : "auth-headline-from-left";

  useEffect(() => {
    setCanAnimate(true);
  }, []);

  return (
    <div className="hidden lg:block">
      <h1
        className="auth-hero-enter font-pl text-[3rem] leading-[1.08] font-semibold tracking-tight"
        aria-label={`${headlineLead} ${headlineTail}`}
      >
        <span className="auth-headline-stack">
          <span className="auth-headline-lead">
            <span
              className={cn("auth-headline-lead-measure", headlineFill)}
              aria-hidden
            >
              {leadMeasure}
            </span>
            <span
              key={`${mode}-${headlineLead}`}
              className={cn("auth-headline-word", canAnimate && swapClass)}
            >
              <span className={headlineFill}>{headlineLead}</span>
            </span>
          </span>
          <span className={cn("auth-headline-tail", headlineFill)}>
            {headlineTail}
          </span>
        </span>
      </h1>

      <p className="auth-hero-enter auth-hero-delay mt-6 max-w-md text-base leading-relaxed text-ink-soft">
        {blurb}
      </p>

      <div className="auth-hero-enter auth-hero-delay-2 mt-10 flex items-center gap-3">
        <div className="h-px w-24 bg-linear-to-r from-teal to-transparent" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          {tagline}
        </span>
      </div>
    </div>
  );
}

export function AuthGlassCard({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "auth-glass-card relative w-full rounded-2xl p-6 sm:p-8",
        className,
      )}
      {...props}
    >
      <div
        className="auth-card-glow pointer-events-none absolute inset-0 rounded-2xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}
