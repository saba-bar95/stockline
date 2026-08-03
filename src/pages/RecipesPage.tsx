import { useCallback, useEffect, useState } from 'react'
import { ModalForm } from '../components/ModalForm'
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
      <section className="hero-panel">
        <h1>რეცეპტები</h1>
        <p>1 ერთეულ პროდუქტზე რამდენი ინგრედიენტი სჭირდება.</p>
      </section>
      <section className="panel">
        <div className="row-actions">
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
            <label>
              პროდუქტი
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ინგრედიენტი
              <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} required>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
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
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>პროდუქტი</th>
                <th>ინგრედიენტი</th>
                <th>რაოდენობა</th>
                <th>ერთეული</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.productName}</td>
                  <td>{l.ingredientName}</td>
                  <td>{qty(l.qty)}</td>
                  <td>{l.unit}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary outline"
                      onClick={async () => {
                        await api(`/recipes/${l.id}`, { method: 'DELETE' })
                        load()
                      }}
                    >
                      წაშლა
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
