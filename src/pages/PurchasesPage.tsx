import { useCallback, useEffect, useState } from 'react'
import { DateField } from '../components/DateField'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty, today } from '../lib/api'
import { usePrefs } from '../preferences/PreferencesContext'

type Purchase = {
  id: number
  date: string
  kind: string
  itemId: string
  qty: number
  unitPrice: number
  total: number
}
type Opt = { id: string; name: string }

export function PurchasesPage() {
  const { t, numberLocale } = usePrefs()
  const [rows, setRows] = useState<Purchase[]>([])
  const [ings, setIngs] = useState<Opt[]>([])
  const [resale, setResale] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [kind, setKind] = useState<'Ingredient' | 'Product'>('Ingredient')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('1')
  const [price, setPrice] = useState('0')

  const load = useCallback(async () => {
    const [p, i, r] = await Promise.all([
      api<Purchase[]>('/purchases'),
      api<Opt[]>('/ingredients'),
      api<Opt[]>('/resale'),
    ])
    setRows(p)
    setIngs(i)
    setResale(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const list = kind === 'Ingredient' ? ings : resale
    if (list[0]) setItemId(list[0].id)
  }, [kind, ings, resale])

  const options = kind === 'Ingredient' ? ings : resale
  const names = Object.fromEntries([...ings, ...resale].map((o) => [o.id, o.name]))

  return (
    <>
      <PageHeader
        title={t('purchases.title')}
        description={t('purchases.description')}
        actions={
          <ModalForm
            title={t('purchases.newTitle')}
            triggerLabel={t('common.add')}
            onSubmit={async () => {
              await api('/purchases', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: Number(q),
                  unitPrice: Number(price),
                }),
              })
              load()
            }}
          >
            <div className="field">
              <span>{t('common.date')}</span>
              <DateField value={date} onChange={setDate} required />
            </div>
            <div className="field">
              <span>{t('common.type')}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'Ingredient' | 'Product')}
              >
                <option value="Ingredient">{t('purchases.kindIngredient')}</option>
                <option value="Product">{t('purchases.kindProduct')}</option>
              </select>
            </div>
            <div className="field">
              <span>{t('common.name')}</span>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>{t('common.qty')}</span>
              <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="field">
              <span>{t('common.pricePerUnit')}</span>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
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
              label: t('common.date'),
              sortValue: (r) => r.date,
              filterValue: (r) => r.date,
              render: (r) => r.date,
            },
            {
              key: 'kind',
              label: t('common.type'),
              sortValue: (r) => r.kind,
              filterValue: (r) =>
                r.kind === 'Ingredient'
                  ? t('purchases.kindIngredient')
                  : t('purchases.kindProductShort'),
              render: (r) =>
                r.kind === 'Ingredient'
                  ? t('purchases.kindIngredient')
                  : t('purchases.kindProductShort'),
            },
            {
              key: 'itemId',
              label: t('common.name'),
              sortValue: (r) => names[r.itemId] ?? r.itemId,
              filterValue: (r) => `${r.itemId} ${names[r.itemId] ?? ''}`,
              render: (r) => names[r.itemId] ?? r.itemId,
            },
            {
              key: 'qty',
              label: t('common.qtyShort'),
              title: t('common.qty'),
              align: 'right',
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty, numberLocale),
            },
            {
              key: 'unitPrice',
              label: t('common.price'),
              align: 'right',
              sortValue: (r) => r.unitPrice,
              filterValue: (r) => String(r.unitPrice),
              render: (r) => money(r.unitPrice, numberLocale),
            },
            {
              key: 'total',
              label: t('common.total'),
              align: 'right',
              sortValue: (r) => r.total,
              filterValue: (r) => String(r.total),
              render: (r) => money(r.total, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  )
}
