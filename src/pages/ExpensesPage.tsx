import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
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
      <PageHeader
        title="ზედნადები ხარჯები"
        description="იჯარა და კომუნალური თვის დღეებზე ნაწილდება; სხვა ხარჯები და ხელფასი — დღიურ პულში."
        actions={
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
            <label className="field">
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              ტიპი
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>ქირა</option>
                <option>კომუნალური</option>
                <option>სხვა</option>
              </select>
            </label>
            <label className="field">
              დასახელება
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              GEL
              <input type="number" step="any" value={gel} onChange={(e) => setGel(e.target.value)} />
            </label>
            <label className="field">
              USD (იჯარისთვის)
              <input type="number" step="any" value={usd} onChange={(e) => setUsd(e.target.value)} />
            </label>
            <label className="field">
              კურსი
              <input
                type="number"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
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
              key: 'type',
              label: 'ტიპი',
              sortValue: (r) => r.type,
              filterValue: (r) => r.type,
              render: (r) => r.type,
            },
            {
              key: 'name',
              label: 'სახელი',
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: 'gel',
              label: 'GEL',
              align: 'right',
              sortValue: (r) => r.gel,
              filterValue: (r) => String(r.gel),
              render: (r) => money(r.gel),
            },
            {
              key: 'usd',
              label: 'USD',
              align: 'right',
              sortValue: (r) => r.usd,
              filterValue: (r) => String(r.usd),
              render: (r) => money(r.usd),
            },
            {
              key: 'rate',
              label: 'კურსი',
              align: 'right',
              sortValue: (r) => r.rate,
              filterValue: (r) => String(r.rate),
              render: (r) => money(r.rate),
            },
          ]}
        />
      </Surface>
    </>
  )
}
