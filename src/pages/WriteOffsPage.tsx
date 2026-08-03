import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, qty, today } from '../lib/api'

type Row = {
  id: number
  date: string
  kind: string
  itemId: string
  qty: number
  note: string
}
type Opt = { id: string; name: string }

export function WriteOffsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [ings, setIngs] = useState<Opt[]>([])
  const [prods, setProds] = useState<Opt[]>([])
  const [resale, setResale] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [kind, setKind] = useState<'Ingredient' | 'Product'>('Ingredient')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('1')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [w, i, p, r] = await Promise.all([
      api<Row[]>('/write-offs'),
      api<Opt[]>('/ingredients'),
      api<Opt[]>('/products'),
      api<Opt[]>('/resale'),
    ])
    setRows(w)
    setIngs(i)
    setProds(p)
    setResale(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const options =
    kind === 'Ingredient' ? ings : [...prods, ...resale]

  useEffect(() => {
    if (options[0]) setItemId(options[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ings, prods, resale])

  return (
    <>
      <section className="hero-panel">
        <h1>ჩამოწერა</h1>
        <p>გაფუჭებული ან დაკარგული ინგრედიენტი / პროდუქტი.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი ჩამოწერა"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/write-offs', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: Number(q),
                  note,
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
              ტიპი
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'Ingredient' | 'Product')}
              >
                <option value="Ingredient">ინგრედიენტი</option>
                <option value="Product">პროდუქტი</option>
              </select>
            </label>
            <label>
              დასახელება
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
              შენიშვნა
              <input value={note} onChange={(e) => setNote(e.target.value)} />
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
                <th>შენიშვნა</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.kind}</td>
                  <td>{r.itemId}</td>
                  <td>{qty(r.qty)}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
