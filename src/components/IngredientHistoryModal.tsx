import { useEffect, useState } from 'react'
import { api, money, qty } from '../lib/api'
import { DataTable } from './DataTable'
import { Modal } from './Modal'

type Movement = {
  date: string
  type: string
  qty: number
  unitPrice: number
  total: number
  note: string
}

type HistoryPayload = {
  ingredient: {
    id: string
    name: string
    unit: string
    category: string
    avgCost: number
    stock: number
    lastPurchaseDate: string | null
  }
  movements: Movement[]
}

type Props = {
  ingredientId: string | null
  onClose: () => void
}

export function IngredientHistoryModal({ ingredientId, onClose }: Props) {
  const [data, setData] = useState<HistoryPayload | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!ingredientId) {
      setData(null)
      return
    }
    setErr('')
    api<HistoryPayload>(`/ingredients/${ingredientId}/history`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'შეცდომა'))
  }, [ingredientId])

  const ing = data?.ingredient

  return (
    <Modal
      title={ing ? `${ing.name} — მოძრაობის ისტორია` : 'მოძრაობის ისტორია'}
      open={!!ingredientId}
      onClose={onClose}
      wide
    >
      {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
      {!data && !err ? <p className="text-ink-muted italic">იტვირთება…</p> : null}
      {ing && data ? (
        <>
          <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            <span>
              ID: <strong className="mono text-ink">{ing.id}</strong>
            </span>
            <span>
              ერთეული: <strong className="text-ink">{ing.unit}</strong>
            </span>
            <span>
              კატეგორია: <strong className="text-ink">{ing.category || '—'}</strong>
            </span>
            <span>
              საშ. ფასი: <strong className="text-ink">{money(ing.avgCost)}</strong>
            </span>
            <span>
              ნაშთი: <strong className="text-ink">{qty(ing.stock)}</strong>
            </span>
            <span>
              ბოლო შესყიდვა: <strong className="text-ink">{ing.lastPurchaseDate ?? '—'}</strong>
            </span>
          </div>
          <DataTable
            rows={data.movements}
            rowKey={(r, i) => `${r.date}-${r.type}-${r.qty}-${i}`}
            defaultSortKey="date"
            defaultSortDir="desc"
            emptyText="მოძრაობები არ არის"
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
                title: 'შესყიდვა / წარმოება / ჩამოწერა',
                sortValue: (r) => r.type,
                filterValue: (r) => r.type,
                render: (r) => r.type,
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
                title: 'ერთეულის ფასი',
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
              {
                key: 'note',
                label: 'შენიშვნა',
                sortValue: (r) => r.note,
                filterValue: (r) => r.note,
                render: (r) => r.note || '—',
              },
            ]}
          />
        </>
      ) : null}
    </Modal>
  )
}
