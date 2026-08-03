import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
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

  const empNames = Object.fromEntries(emps.map((e) => [e.id, e.name]))

  return (
    <>
      <PageHeader
        title="თანამშრომლები და ხელფასები"
        description="ხელფასი შედის დღიურ ზედნადების პულში და წარმოებაზე ნაწილდება."
      />
      <div className="space-y-6">
        <Surface title="თანამშრომლები">
          <div className="mb-4">
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
              <label className="field">
                სახელი
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                დღიური განაკვეთი
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
              </label>
            </ModalForm>
          </div>
          <DataTable
            rows={emps}
            rowKey={(r) => r.id}
            defaultSortKey="name"
            columns={[
              {
                key: 'id',
                label: 'ID',
                sortValue: (r) => r.id,
                filterValue: (r) => r.id,
                render: (r) => <span className="mono">{r.id}</span>,
              },
              {
                key: 'name',
                label: 'სახელი',
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
                render: (r) => r.name,
              },
              {
                key: 'dailyRate',
                label: 'განაკვეთი',
                align: 'right',
                sortValue: (r) => r.dailyRate,
                filterValue: (r) => String(r.dailyRate),
                render: (r) => money(r.dailyRate),
              },
              {
                key: 'status',
                label: 'სტატუსი',
                sortValue: (r) => r.status,
                filterValue: (r) => r.status,
                render: (r) => r.status,
              },
            ]}
          />
        </Surface>

        <Surface title="ხელფასის ჩანაწერები">
          <div className="mb-4">
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
              <label className="field">
                თარიღი
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                თანამშრომელი
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                თანხა
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
            </ModalForm>
          </div>
          <DataTable
            rows={pays}
            rowKey={(r) => r.id}
            defaultSortKey="date"
            defaultSortDir="desc"
            columns={[
              {
                key: 'date',
                label: 'თარიღი',
                sortValue: (r) => r.date,
                filterValue: (r) => r.date,
                render: (r) => r.date,
              },
              {
                key: 'employeeId',
                label: 'თანამშრომელი',
                sortValue: (r) => empNames[r.employeeId] ?? r.employeeId,
                filterValue: (r) => `${r.employeeId} ${empNames[r.employeeId] ?? ''}`,
                render: (r) => empNames[r.employeeId] ?? r.employeeId,
              },
              {
                key: 'amount',
                label: 'თანხა',
                align: 'right',
                sortValue: (r) => r.amount,
                filterValue: (r) => String(r.amount),
                render: (r) => money(r.amount),
              },
            ]}
          />
        </Surface>
      </div>
    </>
  )
}
