import { useCallback, useEffect, useState } from "react";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { PageHeader, Surface } from "../components/ui";
import { api, money, today } from "../lib/api";
import { expenseTypeLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Row = {
  id: number;
  date: string;
  type: string;
  name: string;
  gel: number;
  usd: number;
  rate: number;
};

export function ExpensesPage() {
  const { t, locale, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [type, setType] = useState("სხვა");
  const [name, setName] = useState("");
  const [gel, setGel] = useState("0");
  const [usd, setUsd] = useState("0");
  const [rate, setRate] = useState("2.7");

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>("/expenses"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const pageCount = usePageCount("expenses", loading ? null : rows.length);

  return (
    <>
      <PageHeader
        title={t("expenses.title")}
        description={t("expenses.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("expenses.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              if (!date) throw new Error(t("common.dateRequired"));
              const gelNum = Number(gel);
              const usdNum = Number(usd);
              const rateNum = Number(rate);
              const gelOk = Number.isFinite(gelNum) && gelNum > 0;
              const usdOk = Number.isFinite(usdNum) && usdNum > 0;
              if (!gelOk && !usdOk) {
                throw new Error(t("common.expenseAmountRequired"));
              }
              await api("/expenses", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  type,
                  name: name || type,
                  gel: Number.isFinite(gelNum) ? gelNum : 0,
                  usd: Number.isFinite(usdNum) ? usdNum : 0,
                  rate: Number.isFinite(rateNum) ? rateNum : 0,
                }),
              });
              setName("");
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} required />
            </div>
            <div className="field">
              <span>{t("common.type")}</span>
              <SelectField
                value={type}
                onChange={setType}
                searchable={false}
                options={[
                  { value: "ქირა", label: t("expenses.typeRent") },
                  { value: "კომუნალური", label: t("expenses.typeUtilities") },
                  { value: "სხვა", label: t("expenses.typeOther") },
                ]}
              />
            </div>
            <label className="field">
              {t("common.name")}
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              GEL
              <input
                type="number"
                step="any"
                value={gel}
                onChange={(e) => setGel(e.target.value)}
              />
            </label>
            <label className="field">
              {t("expenses.usdForRent")}
              <input
                type="number"
                step="any"
                value={usd}
                onChange={(e) => setUsd(e.target.value)}
              />
            </label>
            <label className="field">
              {t("common.rate")}
              <input
                type="number"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
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
              key: "type",
              label: t("common.type"),
              sortValue: (r) => r.type,
              filterValue: (r) => expenseTypeLabel(locale, r.type),
              render: (r) => expenseTypeLabel(locale, r.type),
            },
            {
              key: "name",
              label: t("common.nameShort"),
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: "gel",
              label: "GEL",
              align: "right",
              sortValue: (r) => r.gel,
              filterValue: (r) => String(r.gel),
              render: (r) => money(r.gel, numberLocale),
            },
            {
              key: "usd",
              label: "USD",
              align: "right",
              sortValue: (r) => r.usd,
              filterValue: (r) => String(r.usd),
              render: (r) => money(r.usd, numberLocale),
            },
            {
              key: "rate",
              label: t("common.rate"),
              align: "right",
              sortValue: (r) => r.rate,
              filterValue: (r) => String(r.rate),
              render: (r) => money(r.rate, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  );
}
