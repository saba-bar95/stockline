import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty } from '../lib/api'

type Row = {
  id: string
  name: string
  unit: string
  unitCost: number
  stock: number
  stockValue: number
  recommendedPrice: number
}

export function ProductsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('ც')

  const load = useCallback(() => api<Row[]>('/products').then(setRows), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <section className="hero-panel">
        <h1>პროდუქცია</h1>
        <p>მხოლოდ ნაწარმოები პროდუქტები — რეცეპტი + წარმოება. შესყიდული ცალკე გვერდზეა.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი პროდუქტი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/products', { method: 'POST', body: JSON.stringify({ name, unit }) })
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
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>ც</option>
                <option>კგ</option>
                <option>ლ</option>
              </select>
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
                <th>თვითღირ. / ერთ.</th>
                <th>ნაშთი</th>
                <th>ნაშთის ღირ.</th>
                <th>რეკ. ფასი 3×</th>
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
                  <td>{money(r.recommendedPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
