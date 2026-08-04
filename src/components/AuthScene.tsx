import { useCallback, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Ingredients on rustic wood — no people (Magnific-style flat lays). */
const PHOTOS = [
  'https://images.unsplash.com/photo-1498837167922-ddd27525b352?auto=format&fit=crop&w=2400&q=85',
  'https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=2400&q=85',
  'https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=2400&q=85',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=2400&q=85',
]

const PARTICLES = [
  { x: 8, y: 18, size: 6, delay: 0, dur: 14 },
  { x: 22, y: 72, size: 4, delay: 2, dur: 18 },
  { x: 78, y: 24, size: 5, delay: 1, dur: 16 },
  { x: 88, y: 68, size: 7, delay: 3, dur: 20 },
  { x: 52, y: 12, size: 3, delay: 4, dur: 12 },
  { x: 64, y: 82, size: 5, delay: 1.5, dur: 17 },
  { x: 14, y: 48, size: 4, delay: 2.5, dur: 15 },
  { x: 92, y: 42, size: 3, delay: 0.5, dur: 13 },
] as const

type AuthSceneProps = {
  theme: 'light' | 'dark'
  children: ReactNode
}

export function AuthScene({ theme, children }: AuthSceneProps) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [photoReady, setPhotoReady] = useState(false)

  const onPhotoError = useCallback(() => {
    setPhotoIdx((i) => (i + 1 < PHOTOS.length ? i + 1 : i))
    setPhotoReady(false)
  }, [])

  return (
    <div className="auth-page relative flex min-h-screen overflow-hidden text-ink">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-mesh auth-mesh-a absolute -left-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full bg-teal/25 blur-[100px]" />
        <div className="auth-mesh auth-mesh-b absolute -bottom-1/4 -right-1/4 h-[60vh] w-[60vh] rounded-full bg-amber/20 blur-[90px]" />
        <div className="auth-mesh auth-mesh-c absolute left-1/2 top-1/3 h-[40vh] w-[40vh] -translate-x-1/2 rounded-full bg-teal-deep/15 blur-[80px]" />

        <div className="absolute inset-0 scale-[1.06]">
          <img
            key={PHOTOS[photoIdx]}
            src={PHOTOS[photoIdx]}
            alt=""
            className={cn(
              'h-full w-full object-cover transition-opacity duration-1000',
              photoReady ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setPhotoReady(true)}
            onError={onPhotoError}
            draggable={false}
            decoding="async"
          />
        </div>

        <div
          className={cn(
            'absolute inset-0',
            theme === 'dark'
              ? 'bg-[linear-gradient(125deg,rgb(6_12_10/0.88)_0%,rgb(6_12_10/0.62)_42%,rgb(6_12_10/0.35)_68%,rgb(6_12_10/0.55)_100%)]'
              : 'bg-[linear-gradient(125deg,rgb(243_247_245/0.88)_0%,rgb(243_247_245/0.72)_42%,rgb(243_247_245/0.4)_68%,rgb(243_247_245/0.28)_100%)]',
          )}
        />
        <div
          className={cn(
            'absolute inset-0 mix-blend-soft-light',
            theme === 'dark'
              ? 'bg-[radial-gradient(ellipse_80%_60%_at_70%_50%,rgb(45_212_191/0.18),transparent)]'
              : 'bg-[radial-gradient(ellipse_80%_60%_at_70%_50%,rgb(15_118_110/0.14),transparent)]',
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

        <div className="auth-steam auth-steam-1 absolute bottom-[18%] left-[12%] h-32 w-32 opacity-30" />
        <div className="auth-steam auth-steam-2 absolute bottom-[22%] right-[18%] h-40 w-40 opacity-25" />
        <div className="auth-steam auth-steam-3 absolute top-[30%] right-[8%] h-24 w-24 opacity-20" />
      </div>

      <div className="relative z-10 flex w-full flex-col">{children}</div>
    </div>
  )
}

type AuthHeroProps = {
  headline: string
  blurb: string
}

export function AuthHero({ headline, blurb }: AuthHeroProps) {
  return (
    <div className="hidden lg:block">
      <h1 className="auth-hero-enter font-pl text-[3rem] leading-[1.08] font-semibold tracking-tight">
        <span className="auth-shimmer font-ge bg-gradient-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent">
          {headline}
        </span>
      </h1>

      <p className="auth-hero-enter auth-hero-delay mt-6 max-w-md text-base leading-relaxed text-ink-soft">
        {blurb}
      </p>

      <div className="auth-hero-enter auth-hero-delay-2 mt-10 flex items-center gap-3">
        <div className="h-px w-24 bg-gradient-to-r from-teal to-transparent" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">mise en place</span>
      </div>
    </div>
  )
}

export function AuthGlassCard({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('auth-glass-card relative rounded-2xl p-6 sm:p-8', className)} {...props}>
      <div className="auth-card-glow pointer-events-none absolute inset-0 rounded-2xl" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  )
}
