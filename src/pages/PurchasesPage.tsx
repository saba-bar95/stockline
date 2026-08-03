import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty, today } from '../lib/api'

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
        title="შესყიდვები"
        description="ინგრედიენტი ან შესყიდული პროდუქტი — ნაშთი და საშუალო ფასი აქედან იზრდება."
        actions={
          <ModalForm
            title="ახალი შესყიდვა"
            triggerLabel="დამატება"
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
            <label className="field">
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="field">
              ტიპი
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'Ingredient' | 'Product')}
              >
                <option value="Ingredient">ინგრედიენტი</option>
                <option value="Product">შესყიდული პროდუქტი</option>
              </select>
            </label>
            <label className="field">
              დასახელება
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              რაოდენობა
              <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="field">
              ფასი / ერთ.
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
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
              key: 'kind',
              label: 'ტიპი',
              sortValue: (r) => r.kind,
              filterValue: (r) => r.kind,
              render: (r) => (r.kind === 'Ingredient' ? 'ინგრედიენტი' : 'პროდუქტი'),
            },
            {
              key: 'itemId',
              label: 'დასახელება',
              sortValue: (r) => names[r.itemId] ?? r.itemId,
              filterValue: (r) => `${r.itemId} ${names[r.itemId] ?? ''}`,
              render: (r) => names[r.itemId] ?? r.itemId,
            },
            {
              key: 'qty',
              label: 'რაოდ.',
              title: 'რაოდენობა',
              align: 'right',
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty),
            },
            {
              key: 'unitPrice',
              label: 'ფასი',
              align: 'right',
              sortValue: (r) => r.unitPrice,
              filterValue: (r) => String(r.unitPrice),
              render: (r) => money(r.unitPrice),
            },
            {
              key: 'total',
              label: 'ჯამი',
              align: 'right',
              sortValue: (r) => r.total,
              filterValue: (r) => String(r.total),
              render: (r) => money(r.total),
            },
          ]}
        />
      </Surface>
    </>
  )
}
