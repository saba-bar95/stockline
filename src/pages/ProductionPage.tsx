import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, money, qty, today } from '../lib/api'

type Run = {
  id: number
  date: string
  productId: string
  productName: string
  qty: number
  ingredientCost: number
  overheadCost: number
  fullCost: number
  unitCost: number
}
type Opt = { id: string; name: string }

export function ProductionPage() {
  const [rows, setRows] = useState<Run[]>([])
  const [products, setProducts] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [productId, setProductId] = useState('')
  const [q, setQ] = useState('1')

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([api<Run[]>('/production'), api<Opt[]>('/products')])
    setRows(r)
    setProducts(p)
    if (!productId && p[0]) setProductId(p[0].id)
  }, [productId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader
        title="წარმოება"
        description="დღიური რაოდენობა — ინგრედიენტები იკლებს რეცეპტის მიხედვით; ზედნადები იმ დღის პულიდან ნაწილდება."
        actions={
          <ModalForm
            title="ახალი წარმოება"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/production', {
                method: 'POST',
                body: JSON.stringify({ date, productId, qty: Number(q) }),
              })
              load()
            }}
          >
            <label className="field">
              თარიღი
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              პროდუქტი
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              რაოდენობა
              <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} />
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
              key: 'productName',
              label: 'პროდუქტი',
              sortValue: (r) => r.productName,
              filterValue: (r) => `${r.productName} ${r.productId}`,
              render: (r) => r.productName,
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
              key: 'unitCost',
              label: 'ერთ. თვით.',
              title: 'ინგრედიენტის თვითღირებულება / ერთეული (სნეპშოტი)',
              align: 'right',
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost),
            },
            {
              key: 'ingredientCost',
              label: 'ინგრედ. სულ',
              title: 'ინგრედიენტის ღირებულება სულ',
              align: 'right',
              sortValue: (r) => r.ingredientCost,
              filterValue: (r) => String(r.ingredientCost),
              render: (r) => money(r.ingredientCost),
            },
            {
              key: 'overheadCost',
              label: 'ზედნადები',
              title: 'განაწილებული ზედნადები',
              align: 'right',
              sortValue: (r) => r.overheadCost,
              filterValue: (r) => String(r.overheadCost),
              render: (r) => money(r.overheadCost),
            },
            {
              key: 'fullCost',
              label: 'სრული ღირ.',
              title: 'სრული თვითღირებულება',
              align: 'right',
              sortValue: (r) => r.fullCost,
              filterValue: (r) => String(r.fullCost),
              render: (r) => money(r.fullCost),
            },
          ]}
        />
      </Surface>
    </>
  )
}
