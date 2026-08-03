import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty } from '../lib/api'

type Row = {
  id: string
  name: string
  unit: string
  qtyIn: number
  unitCost: number
  ohUnitCost: number
  ohTotal: number
  fullUnitCost: number
  fullTotal: number
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
      <PageHeader
        title="პროდუქცია"
        description="ნაწარმოები პროდუქტები — თვითღირებულება Excel-ის ლოგიკით (ინგრედიენტი + ზედნადები)."
        actions={
          <ModalForm
            title="ახალი პროდუქტი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/products', { method: 'POST', body: JSON.stringify({ name, unit }) })
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
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>ც</option>
                <option>კგ</option>
                <option>ლ</option>
              </select>
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
              label: 'ერთ.',
              title: 'ერთეული',
              sortValue: (r) => r.unit,
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: 'unitCost',
              label: 'ინგრ./ერთ.',
              title: 'ინგრედიენტის თვითღირებულება / ერთეული',
              align: 'right',
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost),
            },
            {
              key: 'ohTotal',
              label: 'ზედნ. სულ',
              title: 'ზედნადები სულ',
              align: 'right',
              sortValue: (r) => r.ohTotal,
              filterValue: (r) => String(r.ohTotal),
              render: (r) => money(r.ohTotal),
            },
            {
              key: 'fullUnitCost',
              label: 'სრული თვით.',
              title: 'სრული თვითღირებულება / ერთეული',
              align: 'right',
              sortValue: (r) => r.fullUnitCost,
              filterValue: (r) => String(r.fullUnitCost),
              render: (r) => money(r.fullUnitCost),
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
            {
              key: 'recommendedPrice',
              label: 'რეკ. 3×',
              title: 'რეკომენდებული ფასი (3× სრული თვითღირებულება)',
              align: 'right',
              sortValue: (r) => r.recommendedPrice,
              filterValue: (r) => String(r.recommendedPrice),
              render: (r) => money(r.recommendedPrice),
            },
          ]}
        />
      </Surface>
    </>
  )
}
