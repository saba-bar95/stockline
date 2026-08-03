import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty, today } from '../lib/api'

type Sale = {
  id: number
  date: string
  source: string
  itemId: string
  qty: number
  unitPrice: number
  revenue: number
}
type Opt = { id: string; name: string }

export function SalesPage() {
  const [rows, setRows] = useState<Sale[]>([])
  const [products, setProducts] = useState<Opt[]>([])
  const [resale, setResale] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [source, setSource] = useState<'manufactured' | 'resale'>('manufactured')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('1')
  const [price, setPrice] = useState('0')

  const load = useCallback(async () => {
    const [s, p, r] = await Promise.all([
      api<Sale[]>('/sales'),
      api<Opt[]>('/products'),
      api<Opt[]>('/resale'),
    ])
    setRows(s)
    setProducts(p)
    setResale(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const list = source === 'manufactured' ? products : resale
    if (list[0]) setItemId(list[0].id)
  }, [source, products, resale])

  const options = source === 'manufactured' ? products : resale

  return (
    <>
      <section className="hero-panel">
        <h1>გაყიდვები</h1>
        <p>ნაწარმოები ან შესყიდული — შემოსავალი და COGS მოგება/ზარალში ჩანს.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი გაყიდვა"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/sales', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  source,
                  itemId,
                  qty: Number(q),
                  unitPrice: Number(price),
                }),
              })
              load()
            }}
          >
            <label>
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              წყარო
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as 'manufactured' | 'resale')}
              >
                <option value="manufactured">ნაწარმოები</option>
                <option value="resale">შესყიდული</option>
              </select>
            </label>
            <label>
              პროდუქტი
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              რაოდენობა
              <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label>
              გაყიდვის ფასი
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </ModalForm>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>თარიღი</th>
                <th>წყარო</th>
                <th>ID</th>
                <th>რაოდ.</th>
                <th>ფასი</th>
                <th>შემოსავალი</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.source}</td>
                  <td>{r.itemId}</td>
                  <td>{qty(r.qty)}</td>
                  <td>{money(r.unitPrice)}</td>
                  <td>{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
