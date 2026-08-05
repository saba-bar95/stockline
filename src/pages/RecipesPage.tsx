import { useCallback, useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";

type Line = {
  id: number;
  productId: string;
  ingredientId: string;
  qty: number;
  productName: string;
  ingredientName: string;
  unit: string;
};
type Opt = { id: string; name: string };

export function RecipesPage() {
  const { t, locale, numberLocale } = usePrefs();
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [ingredients, setIngredients] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [qtyVal, setQtyVal] = useState("1");

  const load = useCallback(async () => {
    try {
      const [r, p, i] = await Promise.all([
        api<Line[]>("/recipes"),
        api<Opt[]>("/products"),
        api<Opt[]>("/ingredients"),
      ]);
      setLines(r);
      setProducts(p);
      setIngredients(i);
      if (!productId && p[0]) setProductId(p[0].id);
      if (!ingredientId && i[0]) setIngredientId(i[0].id);
    } finally {
      setLoading(false);
    }
  }, [productId, ingredientId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title={t("recipes.title")}
        description={t("recipes.description")}
        actions={
          <ModalForm
            title={t("recipes.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/recipes", {
                method: "POST",
                body: JSON.stringify({
                  productId,
                  ingredientId,
                  qty: Number(qtyVal),
                }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.product")}</span>
              <SelectField
                value={productId}
                onChange={setProductId}
                required
                options={products.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            </div>
            <div className="field">
              <span>{t("common.ingredient")}</span>
              <SelectField
                value={ingredientId}
                onChange={setIngredientId}
                required
                options={ingredients.map((i) => ({
                  value: i.id,
                  label: i.name,
                }))}
              />
            </div>
            <label className="field">
              {t("common.qty")}
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
          loading={loading}
          rowKey={(r) => r.id}
          defaultSortKey="productName"
          columns={[
            {
              key: "productName",
              label: t("common.product"),
              sortValue: (r) => r.productName,
              filterValue: (r) => r.productName,
              render: (r) => r.productName,
            },
            {
              key: "ingredientName",
              label: t("common.ingredient"),
              sortValue: (r) => r.ingredientName,
              filterValue: (r) => r.ingredientName,
              render: (r) => r.ingredientName,
            },
            {
              key: "qty",
              label: t("common.qty"),
              align: "right",
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty, numberLocale),
            },
            {
              key: "unit",
              label: t("common.unit"),
              sortValue: (r) => r.unit,
              filterValue: (r) => unitLabel(locale, r.unit),
              render: (r) => unitLabel(locale, r.unit),
            },
            {
              key: "actions",
              label: "",
              sortable: false,
              filterable: false,
              render: (r) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api(`/recipes/${r.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  {t("common.delete")}
                </Button>
              ),
            },
          ]}
        />
      </Surface>
    </>
  );
}
