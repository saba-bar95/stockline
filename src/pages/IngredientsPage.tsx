import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, qty } from '../lib/api'

type Row = {
  id: string
  name: string
  unit: string
  category: string
  avgCost: number
  stock: number
}

export function IngredientsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('კგ')
  const [category, setCategory] = useState('')

  const load = useCallback(() => {
    api<Row[]>('/ingredients').then(setRows)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <section className="hero-panel">
        <h1>ინგრედიენტები</h1>
        <p>ნედლეული — ნაშთი და საშუალო ფასი ითვლება შესყიდვებიდან / წარმოებიდან / ჩამოწერიდან.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი ინგრედიენტი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/ingredients', {
                method: 'POST',
                body: JSON.stringify({ name, unit, category }),
              })
              setName('')
              setCategory('')
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
                <option>კგ</option>
                <option>ც</option>
                <option>ლ</option>
                <option>გ</option>
              </select>
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
                <th>კატეგორია</th>
                <th>საშ. ფასი</th>
                <th>ნაშთი</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    ჯერ ცარიელია — დაამატე პირველი ინგრედიენტი
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.unit}</td>
                  <td>{r.category}</td>
                  <td>{money(r.avgCost)}</td>
                  <td>{qty(r.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
