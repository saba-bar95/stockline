import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'header-enter relative mb-7 rounded-2xl border border-line bg-gradient-to-br from-panel via-panel to-teal-soft/35 p-5 shadow-panel sm:p-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
        <div className="absolute -top-16 -right-10 size-44 rounded-full bg-teal/10 blur-2xl" />
        <div className="absolute -bottom-20 left-10 size-40 rounded-full bg-amber/10 blur-2xl" />
      </div>

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div
            className="h-1 w-14 origin-left rounded-full bg-gradient-to-r from-teal via-teal-deep to-amber/70"
            style={{ animation: 'accent-draw 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
          />
          <h1 className="font-display text-[2.05rem] leading-[1.05] font-semibold tracking-tight text-gradient-heading sm:text-[2.35rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-[0.95rem] leading-relaxed text-ink-soft/90">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}

export function Surface({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <section
      className={cn(
        'surface-enter rounded-2xl border border-line bg-panel p-5 shadow-panel sm:p-6',
        className,
      )}
    >
      {title ? (
        <div className="mb-5 flex items-center gap-3">
          <span
            className="inline-block size-1.5 rounded-full bg-gradient-to-br from-teal to-amber"
            aria-hidden
          />
          <h2 className="font-display text-xl font-semibold tracking-tight text-gradient-heading">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: BtnProps) {
  return (
    <button
      type={type}
      className={cn(
        'btn-press inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-[0.95rem]',
        variant === 'primary' &&
          'bg-teal text-white shadow-sm hover:bg-teal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal',
        variant === 'secondary' &&
          'border border-line-strong bg-panel text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal',
        variant === 'ghost' && 'text-ink-soft hover:bg-teal-soft hover:text-teal-deep',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        className,
      )}
      {...props}
    />
  )
}
