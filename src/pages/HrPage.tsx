import { useCallback, useEffect, useState } from "react";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { PageHeader, Surface } from "../components/ui";
import { api, money, today } from "../lib/api";
import { statusLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";

type Emp = { id: string; name: string; dailyRate: number; status: string };
type Pay = { id: number; date: string; employeeId: string; amount: number };

export function HrPage() {
  const { t, locale, numberLocale } = usePrefs();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("50");
  const [date, setDate] = useState(today());
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("50");

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([
      api<Emp[]>("/employees"),
      api<Pay[]>("/payroll"),
    ]);
    setEmps(e);
    setPays(p);
    if (!employeeId && e[0]) setEmployeeId(e[0].id);
  }, [employeeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empNames = Object.fromEntries(emps.map((e) => [e.id, e.name]));

  return (
    <>
      <PageHeader title={t("hr.title")} description={t("hr.description")} />
      <div className="space-y-6">
        <Surface title={t("hr.employees")}>
          <div className="mb-4">
            <ModalForm
              title={t("hr.newEmployee")}
              triggerLabel={t("hr.addEmployee")}
              onSubmit={async () => {
                await api("/employees", {
                  method: "POST",
                  body: JSON.stringify({ name, dailyRate: Number(rate) }),
                });
                setName("");
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
            rowKey={(r) => r.id}
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
                label: t("common.nameShort"),
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
                render: (r) => r.name,
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
              <label className="field">
                {t("common.employee")}
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
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
                key: "employeeId",
                label: t("common.employee"),
                sortValue: (r) => empNames[r.employeeId] ?? r.employeeId,
                filterValue: (r) =>
                  `${r.employeeId} ${empNames[r.employeeId] ?? ""}`,
                render: (r) => empNames[r.employeeId] ?? r.employeeId,
              },
              {
                key: "amount",
                label: t("common.amount"),
                align: "right",
                sortValue: (r) => r.amount,
                filterValue: (r) => String(r.amount),
                render: (r) => money(r.amount, numberLocale),
              },
            ]}
          />
        </Surface>
      </div>
    </>
  );
}
