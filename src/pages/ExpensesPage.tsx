import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, today } from '../lib/api'

type Row = {
  id: number
  date: string
  type: string
  name: string
  gel: number
  usd: number
  rate: number
}

export function ExpensesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [date, setDate] = useState(today())
  const [type, setType] = useState('სხვა')
  const [name, setName] = useState('')
  const [gel, setGel] = useState('0')
  const [usd, setUsd] = useState('0')
  const [rate, setRate] = useState('2.7')

  const load = useCallback(() => api<Row[]>('/expenses').then(setRows), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <section className="hero-panel">
        <h1>ზედნადები ხარჯები</h1>
        <p>
          იჯარა და კომუნალური თვის დღეებზე ნაწილდება; სხვა ხარჯები და ხელფასი — დღიურ პულში.
        </p>
      </section>
      <section className="panel">
        <div className="row-actions">
          <ModalForm
            title="ახალი ხარჯი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/expenses', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  type,
                  name: name || type,
                  gel: Number(gel),
                  usd: Number(usd),
                  rate: Number(rate),
                }),
              })
              setName('')
              load()
            }}
          >
            <label>
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              ტიპი
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>ქირა</option>
                <option>კომუნალური</option>
                <option>სხვა</option>
              </select>
            </label>
            <label>
              დასახელება
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              GEL
              <input type="number" step="any" value={gel} onChange={(e) => setGel(e.target.value)} />
            </label>
            <label>
              USD (იჯარისთვის)
              <input type="number" step="any" value={usd} onChange={(e) => setUsd(e.target.value)} />
            </label>
            <label>
              კურსი
              <input
                type="number"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
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
                <th>სახელი</th>
                <th>GEL</th>
                <th>USD</th>
                <th>კურსი</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.type}</td>
                  <td>{r.name}</td>
                  <td>{money(r.gel)}</td>
                  <td>{money(r.usd)}</td>
                  <td>{money(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
