import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty } from '../lib/api'
import { usePrefs } from '../preferences/PreferencesContext'

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
  const { t, numberLocale } = usePrefs()
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('კგ')
  const [category, setCategory] = useState('')

  const load = useCallback(() => api<Row[]>('/resale').then(setRows), [])
  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const c = r.category.trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ka'))
  }, [rows])

  return (
    <>
      <PageHeader
        title={t('resale.title')}
        description={t('resale.description')}
        actions={
          <ModalForm
            title={t('resale.newTitle')}
            triggerLabel={t('common.add')}
            onSubmit={async () => {
              await api('/resale', {
                method: 'POST',
                body: JSON.stringify({ name, unit, category }),
              })
              setName('')
              setCategory('')
              load()
            }}
          >
            <label className="field">
              {t('common.name')}
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              {t('common.unit')}
              <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </label>
            <label className="field">
              {t('common.category')}
              <input
                list="resale-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t('ingredients.categoryHint')}
              />
              <datalist id="resale-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
              label: t('common.name'),
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: 'unit',
              label: t('common.unit'),
              sortValue: (r) => r.unit,
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: 'category',
              label: t('common.category'),
              sortValue: (r) => r.category,
              filterValue: (r) => r.category,
              render: (r) => r.category || '—',
            },
            {
              key: 'unitCost',
              label: t('resale.unitCost'),
              title: t('resale.unitCostFull'),
              align: 'right',
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost, numberLocale),
            },
            {
              key: 'stock',
              label: t('common.stock'),
              align: 'right',
              sortValue: (r) => r.stock,
              filterValue: (r) => String(r.stock),
              render: (r) => qty(r.stock, numberLocale),
            },
            {
              key: 'stockValue',
              label: t('resale.stockValue'),
              title: t('resale.stockValueFull'),
              align: 'right',
              sortValue: (r) => r.stockValue,
              filterValue: (r) => String(r.stockValue),
              render: (r) => money(r.stockValue, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  )
}
