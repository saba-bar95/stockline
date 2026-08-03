import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './ui'

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
    if (!open) setErr('')
  }, [open])

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
      <Button onClick={() => setOpen(true)}>{triggerLabel}</Button>
      <Modal title={title} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-1">
          {children}
          {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              გაუქმება
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'ინახება…' : 'დამატება'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
