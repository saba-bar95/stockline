import { useEffect, useState } from 'react'
import { api, money } from '../lib/api'

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
  return (
    <div className="kpi">
      <div className="label">{title}</div>
      <div className="value">{money(block.net)} ₾</div>
      <div className="muted">წმინდა მოგება</div>
      <hr />
      <small>
        შემოსავალი {money(block.revenue)} · თვითღირ. {money(block.cogs)}
        <br />
        ზედნადები {money(block.ohTotal)} · გაუნაწილებელი {money(block.unallocated)}
      </small>
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
      <section className="hero-panel">
        <h1>მოგება / ზარალი</h1>
        <p>
          დღე · კვირა · თვე — შემოსავალი, თვითღირებულება, ზედნადები და გაუნაწილებელი პული, როგორც
          Excel-ში.
        </p>
      </section>
      {err && <p className="toast error">{err}</p>}
      <section className="panel">
        {!data ? (
          <p className="empty">იტვირთება…</p>
        ) : (
          <div className="grid-kpi">
            <Card title="დღეს" block={data.day} />
            <Card title="ამ კვირას" block={data.week} />
            <Card title="ამ თვეს" block={data.month} />
          </div>
        )}
      </section>
    </>
  )
}
