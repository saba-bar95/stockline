import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ModalForm } from '../components/ModalForm'
import { Button, PageHeader, Surface } from '../components/ui'
import { api, qty } from '../lib/api'

type Line = {
  id: number
  productId: string
  ingredientId: string
  qty: number
  productName: string
  ingredientName: string
  unit: string
}
type Opt = { id: string; name: string }

export function RecipesPage() {
  const [lines, setLines] = useState<Line[]>([])
  const [products, setProducts] = useState<Opt[]>([])
  const [ingredients, setIngredients] = useState<Opt[]>([])
  const [productId, setProductId] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [qtyVal, setQtyVal] = useState('1')

  const load = useCallback(async () => {
    const [r, p, i] = await Promise.all([
      api<Line[]>('/recipes'),
      api<Opt[]>('/products'),
      api<Opt[]>('/ingredients'),
    ])
    setLines(r)
    setProducts(p)
    setIngredients(i)
    if (!productId && p[0]) setProductId(p[0].id)
    if (!ingredientId && i[0]) setIngredientId(i[0].id)
  }, [productId, ingredientId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader
        title="რეცეპტები"
        description="1 ერთეულ პროდუქტზე რამდენი ინგრედიენტი სჭირდება."
        actions={
          <ModalForm
            title="რეცეპტის ხაზი"
            triggerLabel="დამატება"
            onSubmit={async () => {
              await api('/recipes', {
                method: 'POST',
                body: JSON.stringify({
                  productId,
                  ingredientId,
                  qty: Number(qtyVal),
                }),
              })
              load()
            }}
          >
            <label className="field">
              პროდუქტი
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              ინგრედიენტი
              <select
                value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}
                required
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              რაოდენობა
              <input
                type="number"
                step="any"
                min="0"
                value={qtyVal}
                onChange={(e) => setQtyVal(e.target.value)}
                required
              />
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={lines}
          rowKey={(r) => r.id}
          defaultSortKey="productName"
          columns={[
            {
              key: 'productName',
              label: 'პროდუქტი',
              sortValue: (r) => r.productName,
              filterValue: (r) => r.productName,
              render: (r) => r.productName,
            },
            {
              key: 'ingredientName',
              label: 'ინგრედიენტი',
              sortValue: (r) => r.ingredientName,
              filterValue: (r) => r.ingredientName,
              render: (r) => r.ingredientName,
            },
            {
              key: 'qty',
              label: 'რაოდენობა',
              align: 'right',
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty),
            },
            {
              key: 'unit',
              label: 'ერთეული',
              sortValue: (r) => r.unit,
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: 'actions',
              label: '',
              sortable: false,
              filterable: false,
              render: (r) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api(`/recipes/${r.id}`, { method: 'DELETE' })
                    load()
                  }}
                >
                  წაშლა
                </Button>
              ),
            },
          ]}
        />
      </Surface>
    </>
  )
}
