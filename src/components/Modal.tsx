import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from './ui'

type Props = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export function Modal({ title, open, onClose, children, wide }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <article
        className={cn(
          'max-h-[min(90vh,840px)] w-full overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6',
          wide ? 'max-w-4xl' : 'max-w-md',
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h3>
          <Button variant="ghost" size="sm" aria-label="დახურვა" onClick={onClose} className="px-2">
            ✕
          </Button>
        </header>
        <div>{children}</div>
      </article>
    </div>
  )
}
