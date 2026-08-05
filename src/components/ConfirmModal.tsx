import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { Button, Spinner } from "./ui";
import { useT } from "../preferences/PreferencesContext";

type Props = {
  open: boolean;
  title: string;
  message: ReactNode;
  error?: string;
  confirmLabel?: string;
  busy?: boolean;
  stacked?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Styled replace for window.confirm — danger confirm by default. */
export function ConfirmModal({
  open,
  title,
  message,
  error,
  confirmLabel,
  busy = false,
  stacked = false,
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      stacked={stacked}
    >
      <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={onConfirm}
          className="min-w-24"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5 border-white/30 border-t-white" />
              {t("common.deleting")}
            </span>
          ) : (
            (confirmLabel ?? t("common.delete"))
          )}
        </Button>
      </div>
    </Modal>
  );
}
