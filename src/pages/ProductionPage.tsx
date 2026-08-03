import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty, today } from '../lib/api'

type Run = {
  id: number
  date: string
  productId: string
  productName: string
  qty: number
  ingredientCost: number
  unitCost: number
}
type Opt = { id: string; name: string }

export function ProductionPage() {
  const [rows, setRows] = useState<Run[]>([])
  const [products, setProducts] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [productId, setProductId] = useState('')
  const [q, setQ] = useState('1')

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([api<Run[]>('/production'), api<Opt[]>('/products')])
    setRows(r)
    setProducts(p)
    if (!productId && p[0]) setProductId(p[0].id)
  }, [productId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section className="hero-panel">
        <h1>წარმოება</h1>
        <p>დღიური რაოდენობა — ინგრედიენტები იკლებს რეცეპტის მიხედვით; ზედნადები იმ დღის პულიდან ნაწილდება.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი წარმოება"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/production', {
                method: 'POST',
                body: JSON.stringify({ date, productId, qty: Number(q) }),
              })
              load()
            }}
          >
            <label>
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              პროდუქტი
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              რაოდენობა
              <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </ModalForm>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>თარიღი</th>
                <th>პროდუქტი</th>
                <th>რაოდ.</th>
                <th>ინგრედ. ღირ.</th>
                <th>ერთ. თვითღირ.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.productName}</td>
                  <td>{qty(r.qty)}</td>
                  <td>{money(r.ingredientCost)}</td>
                  <td>{money(r.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
