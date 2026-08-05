import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { formatApiError } from "../lib/api";
import { useT } from "../preferences/PreferencesContext";
import { Modal } from "./Modal";
import { Button } from "./ui";

type Props = {
  title: string;
  triggerLabel: string;
  children: ReactNode;
  onSubmit: () => Promise<void> | void;
};

export function ModalForm({ title, triggerLabel, children, onSubmit }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) setErr("");
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setErr("");

    if (!form.checkValidity()) {
      const invalid = form.querySelector(":invalid") as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      invalid?.focus();
      setErr(t("common.formInvalid"));
      return;
    }

    setBusy(true);
    try {
      await onSubmit();
      setOpen(false);
    } catch (ex) {
      setErr(formatApiError(ex, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{triggerLabel}</Button>
      <Modal title={title} open={open} onClose={() => setOpen(false)}>
        <form noValidate onSubmit={handleSubmit} className="space-y-1">
          {children}
          {err ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
            >
              {err}
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.add")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
