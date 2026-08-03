import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty } from '../lib/api'

type Row = {
  id: string
  name: string
  unit: string
  category: string
  unitCost: number
  stock: number
  stockValue: number
}

export function ResalePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('ც')
  const [category, setCategory] = useState('')

  const load = useCallback(() => api<Row[]>('/resale').then(setRows), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <section className="hero-panel">
        <h1>შესყიდული პროდუქცია</h1>
        <p>მზა პროდუქტები, რომლებსაც არ ამზადებ — ყიდულობ და ხელახლა ყიდი.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი შესყიდული პროდუქტი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/resale', {
                method: 'POST',
                body: JSON.stringify({ name, unit, category }),
              })
              setName('')
              load()
            }}
          >
            <label>
              დასახელება
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              ერთეული
              <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </label>
            <label>
              კატეგორია
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
          </ModalForm>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>დასახელება</th>
                <th>ერთეული</th>
                <th>თვითღირ.</th>
                <th>ნაშთი</th>
                <th>ნაშთის ღირ.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.unit}</td>
                  <td>{money(r.unitCost)}</td>
                  <td>{qty(r.stock)}</td>
                  <td>{money(r.stockValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
