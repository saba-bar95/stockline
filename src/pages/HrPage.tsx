import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, formatApiError, money, today } from "../lib/api";
import { isEmployeeActive, statusLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Emp = {
  id: string;
  name: string;
  position: string;
  dailyRate: number;
  status: string;
};
type Pay = { id: number; date: string; employeeId: string; amount: number };

export function HrPage() {
  const { t, locale, numberLocale } = usePrefs();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [rate, setRate] = useState("50");
  const [date, setDate] = useState(today());
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("50");

  const [editing, setEditing] = useState<Emp | null>(null);
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editStatus, setEditStatus] = useState("აქტიური");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  const [editingPay, setEditingPay] = useState<Pay | null>(null);
  const [editPayDate, setEditPayDate] = useState(today());
  const [editPayEmployeeId, setEditPayEmployeeId] = useState("");
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayBusy, setEditPayBusy] = useState(false);
  const [editPayErr, setEditPayErr] = useState("");
  const [pendingPayDelete, setPendingPayDelete] = useState<Pay | null>(null);
  const [deletingPay, setDeletingPay] = useState(false);
  const [deletePayErr, setDeletePayErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api<Emp[]>("/employees"),
        api<Pay[]>("/payroll"),
      ]);
      setEmps(e);
      setPays(p);
      const active = e.filter((row) => isEmployeeActive(row.status));
      if (!employeeId || !active.some((row) => row.id === employeeId)) {
        setEmployeeId(active[0]?.id ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
  const activeEmps = emps.filter((e) => isEmployeeActive(e.status));

  function empLabel(id: string) {
    const emp = empById[id];
    if (!emp) return id;
    return emp.position ? `${emp.name} · ${emp.position}` : emp.name;
  }

  const pageCount = usePageCount("hr", loading ? null : emps.length);

  function openEdit(row: Emp) {
    setEditing(row);
    setEditName(row.name);
    setEditPosition(row.position ?? "");
    setEditRate(String(row.dailyRate));
    setEditStatus(isEmployeeActive(row.status) ? "აქტიური" : "არააქტიური");
    setEditErr("");
  }

  function closeEdit() {
    if (editBusy) return;
    setEditing(null);
    setEditErr("");
  }

  async function saveEdit() {
    if (!editing || editBusy) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    const dailyRate = Number(editRate);
    if (!Number.isFinite(dailyRate) || dailyRate < 0) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/employees/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          position: editPosition.trim(),
          dailyRate,
          status: editStatus,
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

  function payEmpOptions(currentId?: string) {
    const list = [...activeEmps];
    if (currentId && !list.some((e) => e.id === currentId) && empById[currentId]) {
      list.push(empById[currentId]!);
    }
    return list.map((e) => ({
      value: e.id,
      label: e.position ? `${e.name} · ${e.position}` : e.name,
    }));
  }

  function openEditPay(row: Pay) {
    setEditingPay(row);
    setEditPayDate(row.date);
    setEditPayEmployeeId(row.employeeId);
    setEditPayAmount(String(row.amount));
    setEditPayErr("");
    setDeletePayErr("");
    setPendingPayDelete(null);
  }

  function closeEditPay() {
    if (editPayBusy || deletingPay) return;
    setEditingPay(null);
    setEditPayErr("");
    setPendingPayDelete(null);
    setDeletePayErr("");
  }

  async function saveEditPay() {
    if (!editingPay || editPayBusy || deletingPay) return;
    const amountNum = Number(editPayAmount);
    if (!editPayEmployeeId || !Number.isFinite(amountNum) || amountNum <= 0) {
      setEditPayErr(t("common.formInvalid"));
      return;
    }
    setEditPayBusy(true);
    setEditPayErr("");
    try {
      await api(`/payroll/${editingPay.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editPayDate,
          employeeId: editPayEmployeeId,
          amount: amountNum,
        }),
      });
      setEditingPay(null);
      await load();
    } catch (e) {
      setEditPayErr(formatApiError(e, t));
    } finally {
      setEditPayBusy(false);
    }
  }

  async function confirmDeletePay() {
    if (!pendingPayDelete || deletingPay) return;
    setDeletingPay(true);
    setDeletePayErr("");
    try {
      await api(`/payroll/${pendingPayDelete.id}`, { method: "DELETE" });
      setPendingPayDelete(null);
      setEditingPay(null);
      await load();
    } catch (e) {
      setDeletePayErr(formatApiError(e, t));
    } finally {
      setDeletingPay(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("hr.title")}
        description={t("hr.description")}
        count={pageCount}
      />
      <div className="space-y-6">
        <Surface title={t("hr.employees")}>
          <div className="mb-4">
            <ModalForm
              title={t("hr.newEmployee")}
              triggerLabel={t("hr.addEmployee")}
              onSubmit={async () => {
                await api("/employees", {
                  method: "POST",
                  body: JSON.stringify({
                    name,
                    position,
                    dailyRate: Number(rate),
                  }),
                });
                setName("");
                setPosition("");
                load();
              }}
            >
              <label className="field">
                {t("common.nameShort")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                {t("common.position")}
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </label>
              <label className="field">
                {t("common.dailyRate")}
                <input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </label>
            </ModalForm>
          </div>
          <DataTable
            rows={emps}
            loading={loading}
            rowKey={(r) => r.id}
            defaultSortKey="name"
            onRowClick={openEdit}
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
                label: t("common.nameShort"),
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
                render: (r) => r.name,
              },
              {
                key: "position",
                label: t("common.position"),
                sortValue: (r) => r.position ?? "",
                filterValue: (r) => r.position ?? "",
                render: (r) => r.position || "—",
              },
              {
                key: "dailyRate",
                label: t("common.dailyRateShort"),
                align: "right",
                sortValue: (r) => r.dailyRate,
                filterValue: (r) => String(r.dailyRate),
                render: (r) => money(r.dailyRate, numberLocale),
              },
              {
                key: "status",
                label: t("common.status"),
                sortValue: (r) => r.status,
                filterValue: (r) => statusLabel(locale, r.status),
                render: (r) => statusLabel(locale, r.status),
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

        <Surface title={t("hr.payroll")}>
          <div className="mb-4">
            <ModalForm
              title={t("hr.payrollTitle")}
              triggerLabel={t("hr.addPayroll")}
              onSubmit={async () => {
                await api("/payroll", {
                  method: "POST",
                  body: JSON.stringify({
                    date,
                    employeeId,
                    amount: Number(amount),
                  }),
                });
                load();
              }}
            >
              <div className="field">
                <span>{t("common.date")}</span>
                <DateField value={date} onChange={setDate} />
              </div>
              <div className="field">
                <span>{t("common.employee")}</span>
                <SelectField
                  value={employeeId}
                  onChange={setEmployeeId}
                  required
                  options={payEmpOptions()}
                />
              </div>
              <label className="field">
                {t("common.amount")}
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </ModalForm>
          </div>
          <DataTable
            rows={pays}
            loading={loading}
            rowKey={(r) => r.id}
            defaultSortKey="date"
            defaultSortDir="desc"
            onRowClick={openEditPay}
            columns={[
              {
                key: "date",
                label: t("common.date"),
                sortValue: (r) => r.date,
                filterValue: (r) => r.date,
                render: (r) => r.date,
              },
              {
                key: "employeeId",
                label: t("common.employee"),
                sortValue: (r) => empById[r.employeeId]?.name ?? r.employeeId,
                filterValue: (r) => empLabel(r.employeeId),
                render: (r) => empById[r.employeeId]?.name ?? r.employeeId,
              },
              {
                key: "position",
                label: t("common.position"),
                sortValue: (r) => empById[r.employeeId]?.position ?? "",
                filterValue: (r) => empById[r.employeeId]?.position ?? "",
                render: (r) => empById[r.employeeId]?.position || "—",
              },
              {
                key: "amount",
                label: t("common.amount"),
                align: "right",
                sortValue: (r) => r.amount,
                filterValue: (r) => String(r.amount),
                render: (r) => money(r.amount, numberLocale),
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
                      openEditPay(r);
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                ),
              },
            ]}
          />
        </Surface>
      </div>

      <Modal
        title={t("hr.editEmployee")}
        open={Boolean(editing)}
        onClose={closeEdit}
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
            {t("common.nameShort")}
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            {t("common.position")}
            <input
              value={editPosition}
              onChange={(e) => setEditPosition(e.target.value)}
            />
          </label>
          <label className="field">
            {t("common.dailyRate")}
            <input
              type="number"
              value={editRate}
              onChange={(e) => setEditRate(e.target.value)}
            />
          </label>
          <div className="field">
            <span>{t("common.status")}</span>
            <SelectField
              value={editStatus}
              onChange={setEditStatus}
              searchable={false}
              required
              options={[
                { value: "აქტიური", label: t("hr.statusActive") },
                { value: "არააქტიური", label: t("hr.statusInactive") },
              ]}
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
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeEdit}
              disabled={editBusy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={editBusy}>
              {editBusy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={t("hr.editPayroll")}
        open={Boolean(editingPay)}
        onClose={closeEditPay}
        listenKeys={!pendingPayDelete}
      >
        <form
          noValidate
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEditPay();
          }}
        >
          <div className="field">
            <span>{t("common.date")}</span>
            <DateField value={editPayDate} onChange={setEditPayDate} required />
          </div>
          <div className="field">
            <span>{t("common.employee")}</span>
            <SelectField
              value={editPayEmployeeId}
              onChange={setEditPayEmployeeId}
              required
              options={payEmpOptions(editingPay?.employeeId)}
            />
          </div>
          <label className="field">
            {t("common.amount")}
            <input
              type="number"
              value={editPayAmount}
              onChange={(e) => setEditPayAmount(e.target.value)}
              required
            />
          </label>
          {editPayErr ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
            >
              {editPayErr}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={editPayBusy || deletingPay}
              onClick={() => {
                if (!editingPay) return;
                setDeletePayErr("");
                setPendingPayDelete(editingPay);
              }}
            >
              {t("common.delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEditPay}
                disabled={editPayBusy || deletingPay}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editPayBusy || deletingPay}>
                {editPayBusy ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingPayDelete)}
        stacked
        title={t("hr.deletePayroll")}
        message={t("hr.deletePayrollConfirm")}
        error={deletePayErr}
        busy={deletingPay}
        onCancel={() => {
          if (deletingPay) return;
          setPendingPayDelete(null);
          setDeletePayErr("");
        }}
        onConfirm={() => void confirmDeletePay()}
      />
    </>
  );
}
