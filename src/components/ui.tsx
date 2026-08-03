import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-[0.95rem] leading-relaxed text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
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
        'rounded-2xl border border-line bg-panel p-5 shadow-panel sm:p-6',
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
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
