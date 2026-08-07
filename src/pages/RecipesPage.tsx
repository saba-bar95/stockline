import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import {
  RecipeProductModal,
  type RecipeLineRow,
} from "../components/RecipeProductModal";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Opt = { id: string; name: string; unit?: string };

type ProductRecipeRow = {
  productId: string;
  productName: string;
  lineCount: number;
};

export function RecipesPage() {
  const { t } = usePrefs();
  const [lines, setLines] = useState<RecipeLineRow[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [ingredients, setIngredients] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [qtyVal, setQtyVal] = useState("1");
  const [viewProductId, setViewProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rP = api<RecipeLineRow[]>("/recipes").then((r) => {
        setLines(r);
        setLoading(false);
      });
      const pP = api<Opt[]>("/products?minimal=1").then((p) => {
        setProducts(p);
        if (!productId && p[0]) setProductId(p[0].id);
      });
      const iP = api<Opt[]>("/ingredients?minimal=1").then((i) => {
        setIngredients(i);
        if (!ingredientId && i[0]) setIngredientId(i[0].id);
      });
      await Promise.all([rP, pP, iP]);
    } finally {
      setLoading(false);
    }
  }, [productId, ingredientId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productRows = useMemo<ProductRecipeRow[]>(() => {
    const counts = new Map<string, number>();
    const names = new Map<string, string>();
    for (const line of lines) {
      counts.set(line.productId, (counts.get(line.productId) ?? 0) + 1);
      if (!names.has(line.productId)) {
        names.set(line.productId, line.productName);
      }
    }
    return [...counts.entries()]
      .map(([productId, lineCount]) => ({
        productId,
        productName:
          names.get(productId) ??
          products.find((p) => p.id === productId)?.name ??
          productId,
        lineCount,
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "ka"));
  }, [lines, products]);

  const viewProductName =
    productRows.find((p) => p.productId === viewProductId)?.productName ??
    products.find((p) => p.id === viewProductId)?.name ??
    "";

  const viewProductUnit =
    lines.find((l) => l.productId === viewProductId)?.productUnit ??
    products.find((p) => p.id === viewProductId)?.unit ??
    "";

  const pageCount = usePageCount("recipes", loading ? null : productRows.length);

  return (
    <>
      <PageHeader
        title={t("recipes.title")}
        description={t("recipes.description")}
        count={pageCount}
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
          rows={productRows}
          loading={loading}
          rowKey={(r) => r.productId}
          onRowClick={(r) => setViewProductId(r.productId)}
          defaultSortKey="productName"
          emptyText={t("recipes.empty")}
          columns={[
            {
              key: "productName",
              label: t("common.product"),
              sortValue: (r) => r.productName,
              filterValue: (r) => r.productName,
              render: (r) => r.productName,
            },
            {
              key: "lineCount",
              label: t("recipes.lines"),
              title: t("recipes.linesFull"),
              align: "right",
              sortValue: (r) => r.lineCount,
              filterValue: (r) => String(r.lineCount),
              render: (r) => r.lineCount,
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewProductId(r.productId);
                  }}
                >
                  {t("common.details")}
                </Button>
              ),
            },
          ]}
        />
      </Surface>
      <RecipeProductModal
        productId={viewProductId}
        productName={viewProductName}
        productUnit={viewProductUnit}
        lines={lines}
        onClose={() => setViewProductId(null)}
        onChanged={load}
      />
    </>
  );
}
