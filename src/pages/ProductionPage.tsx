import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, formatApiError, money, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Run = {
  id: number;
  date: string;
  productId: string;
  productName: string;
  qty: number;
  ingredientCost: number;
  overheadCost: number;
  fullCost: number;
  unitCost: number;
};
type Opt = { id: string; name: string };

export function ProductionPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Run[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("1");

  const [editing, setEditing] = useState<Run | null>(null);
  const [editDate, setEditDate] = useState(today());
  const [editProductId, setEditProductId] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    try {
      const rP = api<Run[]>("/production").then((r) => {
        setRows(r);
        setLoading(false);
      });
      const pP = api<Opt[]>("/products?minimal=1").then((p) => {
        setProducts(p);
        if (!productId && p[0]) setProductId(p[0].id);
      });
      await Promise.all([rP, pP]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageCount = usePageCount("production", loading ? null : rows.length);

  function openEdit(row: Run) {
    setEditing(row);
    setEditDate(row.date);
    setEditProductId(row.productId);
    setEditQty(String(row.qty));
    setEditErr("");
    setDeleteErr("");
    setPendingDelete(null);
  }

  function closeEdit() {
    if (editBusy || deleting) return;
    setEditing(null);
    setEditErr("");
    setPendingDelete(null);
    setDeleteErr("");
  }

  async function saveEdit() {
    if (!editing || editBusy || deleting) return;
    const qtyNum = Number(editQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/production/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editDate,
          productId: editProductId,
          qty: qtyNum,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setEditErr(formatApiError(e, t));
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await api(`/production/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      setEditing(null);
      await load();
    } catch (e) {
      setDeleteErr(formatApiError(e, t));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("production.title")}
        description={t("production.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("production.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/production", {
                method: "POST",
                body: JSON.stringify({ date, productId, qty: Number(q) }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} />
            </div>
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
            <label className="field">
              {t("common.qty")}
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
          loading={loading}
          rowKey={(r) => r.id}
          defaultSortKey="date"
          defaultSortDir="desc"
          columns={[
            {
              key: "date",
              label: t("common.date"),
              sortValue: (r) => r.date,
              filterValue: (r) => r.date,
              render: (r) => r.date,
            },
            {
              key: "productName",
              label: t("common.product"),
              sortValue: (r) => r.productName,
              filterValue: (r) => `${r.productName} ${r.productId}`,
              render: (r) => r.productName,
            },
            {
              key: "qty",
              label: t("common.qtyShort"),
              title: t("common.qty"),
              align: "right",
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty, numberLocale),
            },
            {
              key: "unitCost",
              label: t("production.unitCost"),
              title: t("production.unitCostFull"),
              align: "right",
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost, numberLocale),
            },
            {
              key: "ingredientCost",
              label: t("production.ingTotal"),
              title: t("production.ingTotalFull"),
              align: "right",
              sortValue: (r) => r.ingredientCost,
              filterValue: (r) => String(r.ingredientCost),
              render: (r) => money(r.ingredientCost, numberLocale),
            },
            {
              key: "overheadCost",
              label: t("production.overhead"),
              title: t("production.overheadFull"),
              align: "right",
              sortValue: (r) => r.overheadCost,
              filterValue: (r) => String(r.overheadCost),
              render: (r) => money(r.overheadCost, numberLocale),
            },
            {
              key: "fullCost",
              label: t("production.fullCost"),
              title: t("production.fullCostFull"),
              align: "right",
              sortValue: (r) => r.fullCost,
              filterValue: (r) => String(r.fullCost),
              render: (r) => money(r.fullCost, numberLocale),
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
                  className="min-w-22"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(r);
                  }}
                >
                  {t("common.edit")}
                </Button>
              ),
            },
          ]}
        />
      </Surface>

      <Modal
        title={t("production.editTitle")}
        open={Boolean(editing)}
        onClose={closeEdit}
        listenKeys={!pendingDelete}
      >
        <form
          noValidate
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <div className="field">
            <span>{t("common.date")}</span>
            <DateField value={editDate} onChange={setEditDate} required />
          </div>
          <div className="field">
            <span>{t("common.product")}</span>
            <SelectField
              value={editProductId}
              onChange={setEditProductId}
              required
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </div>
          <label className="field">
            {t("common.qty")}
            <input
              type="number"
              step="any"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              required
            />
          </label>
          {editErr ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
            >
              {editErr}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={editBusy || deleting}
              onClick={() => {
                if (!editing) return;
                setDeleteErr("");
                setPendingDelete(editing);
              }}
            >
              {t("common.delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEdit}
                disabled={editBusy || deleting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editBusy || deleting}>
                {editBusy ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        stacked
        title={t("production.deleteTitle")}
        message={
          <div className="space-y-3">
            <p>{t("production.deleteConfirm")}</p>
            <p className="rounded-xl border border-amber/35 bg-amber/10 px-3.5 py-3 text-sm text-ink-soft">
              {t("production.deleteWarn")}
            </p>
          </div>
        }
        error={deleteErr}
        busy={deleting}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteErr("");
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
