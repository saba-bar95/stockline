import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { PageHeader, Surface } from '../components/ui'
import { api, qty, today } from '../lib/api'

type Row = {
  id: number
  date: string
  kind: string
  itemId: string
  qty: number
  note: string
}
type Opt = { id: string; name: string }

export function WriteOffsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [ings, setIngs] = useState<Opt[]>([])
  const [prods, setProds] = useState<Opt[]>([])
  const [resale, setResale] = useState<Opt[]>([])
  const [date, setDate] = useState(today())
  const [kind, setKind] = useState<'Ingredient' | 'Product'>('Ingredient')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('1')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [w, i, p, r] = await Promise.all([
      api<Row[]>('/write-offs'),
      api<Opt[]>('/ingredients'),
      api<Opt[]>('/products'),
      api<Opt[]>('/resale'),
    ])
    setRows(w)
    setIngs(i)
    setProds(p)
    setResale(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const options = kind === 'Ingredient' ? ings : [...prods, ...resale]
  const names = Object.fromEntries([...ings, ...prods, ...resale].map((o) => [o.id, o.name]))

  useEffect(() => {
    if (options[0]) setItemId(options[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ings, prods, resale])

  return (
    <>
      <PageHeader
        title="ჩამოწერა"
        description="გაფუჭებული ან დაკარგული ინგრედიენტი / პროდუქტი."
        actions={
          <ModalForm
            title="ახალი ჩამოწერა"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/write-offs', {
                method: 'POST',
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: Number(q),
                  note,
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
              ტიპი
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'Ingredient' | 'Product')}
              >
                <option value="Ingredient">ინგრედიენტი</option>
                <option value="Product">პროდუქტი</option>
              </select>
            </label>
            <label className="field">
              დასახელება
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
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
              შენიშვნა
              <input value={note} onChange={(e) => setNote(e.target.value)} />
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
              key: 'note',
              label: 'შენიშვნა',
              sortValue: (r) => r.note,
              filterValue: (r) => r.note,
              render: (r) => r.note || '—',
            },
          ]}
        />
      </Surface>
    </>
  )
}
