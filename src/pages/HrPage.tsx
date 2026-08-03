import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, money, today } from '../lib/api'

type Emp = { id: string; name: string; dailyRate: number; status: string }
type Pay = { id: number; date: string; employeeId: string; amount: number }

export function HrPage() {
  const [emps, setEmps] = useState<Emp[]>([])
  const [pays, setPays] = useState<Pay[]>([])
  const [name, setName] = useState('')
  const [rate, setRate] = useState('50')
  const [date, setDate] = useState(today())
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('50')

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([api<Emp[]>('/employees'), api<Pay[]>('/payroll')])
    setEmps(e)
    setPays(p)
    if (!employeeId && e[0]) setEmployeeId(e[0].id)
  }, [employeeId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section className="hero-panel">
        <h1>თანამშრომლები და ხელფასები</h1>
        <p>ხელფასი შედის დღიურ ზედნადების პულში და წარმოებაზე ნაწილდება.</p>
      </section>
      <section className="panel">
        <h2>თანამშრომლები</h2>
        <div className="row-actions">
          <ModalForm
            title="ახალი თანამშრომელი"
            triggerLabel="თანამშრომლის დამატება"
            onSubmit={async () => {
              await api('/employees', {
                method: 'POST',
                body: JSON.stringify({ name, dailyRate: Number(rate) }),
              })
              setName('')
              load()
            }}
          >
            <label>
              სახელი
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              დღიური განაკვეთი
              <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
          </ModalForm>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>სახელი</th>
                <th>განაკვეთი</th>
                <th>სტატუსი</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{e.name}</td>
                  <td>{money(e.dailyRate)}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>ხელფასის ჩანაწერები</h2>
        <div className="row-actions">
          <ModalForm
            title="ხელფასი"
            triggerLabel="ხელფასის დამატება"
            onSubmit={async () => {
              await api('/payroll', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  employeeId,
                  amount: Number(amount),
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
              თანამშრომელი
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              თანხა
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </ModalForm>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>თარიღი</th>
                <th>თანამშრომელი</th>
                <th>თანხა</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td>{p.employeeId}</td>
                  <td>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
