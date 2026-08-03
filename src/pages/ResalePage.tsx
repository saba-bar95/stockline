import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
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
      <PageHeader
        title="შესყიდული პროდუქცია"
        description="მზა პროდუქტები, რომლებსაც არ ამზადებ — ყიდულობ და ხელახლა ყიდი."
        actions={
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
            <label className="field">
              დასახელება
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              ერთეული
              <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </label>
            <label className="field">
              კატეგორია
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
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
              label: 'დასახელება',
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: 'unit',
              label: 'ერთეული',
              sortValue: (r) => r.unit,
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: 'category',
              label: 'კატეგორია',
              sortValue: (r) => r.category,
              filterValue: (r) => r.category,
              render: (r) => r.category || '—',
            },
            {
              key: 'unitCost',
              label: 'თვითღირ.',
              title: 'თვითღირებულება',
              align: 'right',
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost),
            },
            {
              key: 'stock',
              label: 'ნაშთი',
              align: 'right',
              sortValue: (r) => r.stock,
              filterValue: (r) => String(r.stock),
              render: (r) => qty(r.stock),
            },
            {
              key: 'stockValue',
              label: 'ნაშთის ღირ.',
              title: 'ნაშთის ღირებულება',
              align: 'right',
              sortValue: (r) => r.stockValue,
              filterValue: (r) => String(r.stockValue),
              render: (r) => money(r.stockValue),
            },
          ]}
        />
      </Surface>
    </>
  )
}
