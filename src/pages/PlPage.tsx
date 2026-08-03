import { useEffect, useState } from 'react'
import { PageHeader, Surface } from '../components/ui'
import { api, money } from '../lib/api'
import { cn } from '../lib/cn'

type Block = {
  revenue: number
  cogs: number
  gross: number
  writeOffCost: number
  ohTotal: number
  allocated: number
  unallocated: number
  net: number
}

type Pl = { day: Block; week: Block; month: Block }

function Card({ title, block }: { title: string; block: Block }) {
  const positive = block.net >= 0
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-br from-white to-teal-soft/40 p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{title}</div>
      <div
        className={cn(
          'mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums',
          positive ? 'text-teal-deep' : 'text-danger',
        )}
      >
        {money(block.net)} ₾
      </div>
      <p className="mt-1 text-sm text-ink-muted">წმინდა მოგება</p>
      <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
        <p>
          შემოსავალი <span className="font-medium text-ink tabular-nums">{money(block.revenue)}</span>
        </p>
        <p>
          თვითღირ. <span className="font-medium text-ink tabular-nums">{money(block.cogs)}</span>
        </p>
        <p>
          ზედნადები <span className="font-medium text-ink tabular-nums">{money(block.ohTotal)}</span>
        </p>
        <p>
          გაუნაწილებელი{' '}
          <span className="font-medium text-ink tabular-nums">{money(block.unallocated)}</span>
        </p>
      </div>
    </div>
  )
}

export function PlPage() {
  const [data, setData] = useState<Pl | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api<Pl>('/pl')
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [])

  return (
    <>
      <PageHeader
        title="მოგება / ზარალი"
        description="დღე · კვირა · თვე — შემოსავალი, თვითღირებულება, ზედნადები და გაუნაწილებელი პული, როგორც Excel-ში."
      />
      {err ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <Surface>
        {!data ? (
          <p className="py-8 text-center text-ink-muted italic">იტვირთება…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="დღეს" block={data.day} />
            <Card title="ამ კვირას" block={data.week} />
            <Card title="ამ თვეს" block={data.month} />
          </div>
        )}
      </Surface>
    </>
  )
}
