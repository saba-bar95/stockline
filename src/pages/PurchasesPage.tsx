import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty, today } from '../lib/api'

type Purchase = {
  id: number
  date: string
  kind: string
  itemId: string
  qty: number
  unitPrice: number
  total: number
}
type Opt = { id: string; name: string }

export function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([])
  const [ings, setIngs] = useState<Opt[]>([])
  const [resale, setResale] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [kind, setKind] = useState<'Ingredient' | 'Product'>('Ingredient')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('1')
  const [price, setPrice] = useState('0')

  const load = useCallback(async () => {
    const [p, i, r] = await Promise.all([
      api<Purchase[]>('/purchases'),
      api<Opt[]>('/ingredients'),
      api<Opt[]>('/resale'),
    ])
    setRows(p)
    setIngs(i)
    setResale(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const list = kind === 'Ingredient' ? ings : resale
    if (list[0]) setItemId(list[0].id)
  }, [kind, ings, resale])

  const options = kind === 'Ingredient' ? ings : resale

  return (
    <>
      <section className="hero-panel">
        <h1>შესყიდვები</h1>
        <p>ინგრედიენტი ან შესყიდული პროდუქტი — ნაშთი და საშუალო ფასი აქედან იზრდება.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი შესყიდვა"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/purchases', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  kind,
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
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              ტიპი
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'Ingredient' | 'Product')}
              >
                <option value="Ingredient">ინგრედიენტი</option>
                <option value="Product">შესყიდული პროდუქტი</option>
              </select>
            </label>
            <label>
              დასახელება
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
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
              ფასი / ერთ.
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
                <th>ტიპი</th>
                <th>ID</th>
                <th>რაოდ.</th>
                <th>ფასი</th>
                <th>ჯამი</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.kind}</td>
                  <td>{r.itemId}</td>
                  <td>{qty(r.qty)}</td>
                  <td>{money(r.unitPrice)}</td>
                  <td>{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
