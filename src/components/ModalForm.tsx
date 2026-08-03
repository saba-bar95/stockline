import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

type Props = {
  title: string
  triggerLabel: string
  children: ReactNode
  onSubmit: () => Promise<void> | void
}

export function ModalForm({ title, triggerLabel, children, onSubmit }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await onSubmit()
      setOpen(false)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'შეცდომა')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open && (
        <dialog open>
          <article>
            <header>
              <button
                type="button"
                aria-label="Close"
                className="close"
                onClick={() => setOpen(false)}
              />
              <h3 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>{title}</h3>
            </header>
            <form onSubmit={handleSubmit}>
              {children}
              {err && <p style={{ color: '#8a2e1f' }}>{err}</p>}
              <footer style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  გაუქმება
                </button>
                <button type="submit" aria-busy={busy}>
                  დამატება
                </button>
              </footer>
            </form>
          </article>
        </dialog>
      )}
    </>
  )
}
