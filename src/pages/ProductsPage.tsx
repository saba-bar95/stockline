import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { ProductHistoryModal } from "../components/ProductHistoryModal";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, formatApiError, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Row = {
  id: string;
  name: string;
  unit: string;
  qtyIn: number | null;
  unitCost: number | null;
  ohUnitCost: number | null;
  ohTotal: number | null;
  fullUnitCost: number | null;
  fullTotal: number | null;
  stock: number | null;
  stockValue: number | null;
  canDelete?: boolean;
  metricsPending?: boolean;
};

const UNIT_OPTIONS = [
  { value: "kg", labelKey: "units.kg" as const },
  { value: "l", labelKey: "units.l" as const },
  { value: "pc", labelKey: "units.pc" as const },
];

export function ProductsPage() {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("kg");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    try {
      const bare = await api<Array<Pick<Row, "id" | "name" | "unit">>>(
        "/products?minimal=1",
      );
      setRows(
        bare.map((r) => ({
          ...r,
          qtyIn: null,
          unitCost: null,
          ohUnitCost: null,
          ohTotal: null,
          fullUnitCost: null,
          fullTotal: null,
          stock: null,
          stockValue: null,
          metricsPending: true,
        })),
      );
      setLoading(false);
      setRows(await api<Row[]>("/products"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const pageCount = usePageCount("products", loading ? null : rows.length);

  function openEdit(row: Row) {
    setEditing(row);
    setEditName(row.name);
    setEditUnit(row.unit);
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
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/products/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed, unit: editUnit }),
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
      await api(`/products/${pendingDelete.id}`, { method: "DELETE" });
      if (historyId === pendingDelete.id) setHistoryId(null);
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
        title={t("products.title")}
        description={t("products.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("products.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/products", {
                method: "POST",
                body: JSON.stringify({ name, unit }),
              });
              setName("");
              load();
            }}
          >
            <label className="field">
              {t("common.name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <div className="field">
              <span>{t("common.unit")}</span>
              <SelectField
                value={unit}
                onChange={setUnit}
                searchable={false}
                options={UNIT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.labelKey),
                }))}
              />
            </div>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => setHistoryId(r.id)}
          defaultSortKey="name"
          columns={[
            {
              key: "id",
              label: "ID",
              sortValue: (r) => r.id,
              filterValue: (r) => r.id,
              render: (r) => <span className="mono">{r.id}</span>,
            },
            {
              key: "name",
              label: t("common.name"),
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: "unit",
              label: t("common.unitShort"),
              title: t("common.unit"),
              sortValue: (r) => r.unit,
              filterValue: (r) => unitLabel(locale, r.unit),
              render: (r) => unitLabel(locale, r.unit),
            },
            {
              key: "unitCost",
              label: t("products.ingPerUnit"),
              title: t("products.ingPerUnitFull"),
              align: "right",
              sortValue: (r) => r.unitCost ?? -1,
              filterValue: (r) => String(r.unitCost ?? ""),
              render: (r) =>
                r.metricsPending || r.unitCost == null
                  ? "…"
                  : money(r.unitCost, numberLocale),
            },
            {
              key: "ohTotal",
              label: t("products.ohTotal"),
              title: t("products.ohTotalFull"),
              align: "right",
              sortValue: (r) => r.ohTotal ?? -1,
              filterValue: (r) => String(r.ohTotal ?? ""),
              render: (r) =>
                r.metricsPending || r.ohTotal == null
                  ? "…"
                  : money(r.ohTotal, numberLocale),
            },
            {
              key: "fullUnitCost",
              label: t("products.fullUnit"),
              title: t("products.fullUnitFull"),
              align: "right",
              sortValue: (r) => r.fullUnitCost ?? -1,
              filterValue: (r) => String(r.fullUnitCost ?? ""),
              render: (r) =>
                r.metricsPending || r.fullUnitCost == null
                  ? "…"
                  : money(r.fullUnitCost, numberLocale),
            },
            {
              key: "stock",
              label: t("common.stock"),
              align: "right",
              sortValue: (r) => r.stock ?? -1,
              filterValue: (r) => String(r.stock ?? ""),
              render: (r) =>
                r.metricsPending || r.stock == null
                  ? "…"
                  : qty(r.stock, numberLocale, qtyDecimals),
            },
            {
              key: "stockValue",
              label: t("products.stockValue"),
              title: t("products.stockValueFull"),
              align: "right",
              sortValue: (r) => r.stockValue ?? -1,
              filterValue: (r) => String(r.stockValue ?? ""),
              render: (r) =>
                r.metricsPending || r.stockValue == null
                  ? "…"
                  : money(r.stockValue, numberLocale),
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
        title={t("products.editTitle")}
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
          {editing ? (
            <p className="mb-3 text-sm text-ink-muted">
              ID: <strong className="mono text-ink">{editing.id}</strong>
            </p>
          ) : null}
          <label className="field">
            {t("common.name")}
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </label>
          <div className="field">
            <span>{t("common.unit")}</span>
            <SelectField
              value={editUnit}
              onChange={setEditUnit}
              searchable={false}
              options={UNIT_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
            />
          </div>
          {editErr ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
            >
              {editErr}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            {editing?.canDelete ? (
              <Button
                type="button"
                variant="danger"
                disabled={editBusy || deleting || editing.metricsPending}
                onClick={() => {
                  if (!editing) return;
                  setDeleteErr("");
                  setPendingDelete(editing);
                }}
              >
                {t("common.delete")}
              </Button>
            ) : (
              <span />
            )}
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
        title={t("products.deleteTitle")}
        message={t("products.deleteConfirm", {
          name: pendingDelete?.name ?? "",
        })}
        error={deleteErr}
        busy={deleting}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteErr("");
        }}
        onConfirm={() => void confirmDelete()}
      />

      <ProductHistoryModal
        productId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </>
  );
}
