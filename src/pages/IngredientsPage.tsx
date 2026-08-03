import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { IngredientHistoryModal } from '../components/IngredientHistoryModal'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty } from '../lib/api'

type Row = {
  id: string
  name: string
  unit: string
  category: string
  avgCost: number
  stock: number
  lastPurchaseDate: string | null
}

export function IngredientsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('კგ')
  const [category, setCategory] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Row[]>('/ingredients').then(setRows)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <PageHeader
        title="ინგრედიენტები"
        description="ნედლეული — ორჯერ დააკლიკე სტრიქონს მოძრაობის ისტორიისთვის (შესყიდვა, წარმოება, ჩამოწერა)."
        actions={
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
            <label className="field">
              დასახელება
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              ერთეული
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>კგ</option>
                <option>ც</option>
                <option>ლ</option>
                <option>გ</option>
              </select>
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
          onRowDoubleClick={(r) => setHistoryId(r.id)}
          defaultSortKey="name"
          emptyText="ჯერ ცარიელია — დაამატე პირველი ინგრედიენტი"
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
              key: 'lastPurchaseDate',
              label: 'ბოლო შესყ.',
              title: 'ბოლო შესყიდვის თარიღი',
              sortValue: (r) => r.lastPurchaseDate ?? '',
              filterValue: (r) => r.lastPurchaseDate ?? '',
              render: (r) => r.lastPurchaseDate ?? '—',
            },
            {
              key: 'avgCost',
              label: 'საშ. ფასი',
              title: 'საშუალო შესყიდვის ფასი',
              align: 'right',
              sortValue: (r) => r.avgCost,
              filterValue: (r) => String(r.avgCost),
              render: (r) => money(r.avgCost),
            },
            {
              key: 'stock',
              label: 'ნაშთი',
              align: 'right',
              sortValue: (r) => r.stock,
              filterValue: (r) => String(r.stock),
              render: (r) => qty(r.stock),
            },
          ]}
        />
      </Surface>
      <IngredientHistoryModal ingredientId={historyId} onClose={() => setHistoryId(null)} />
    </>
  )
}
