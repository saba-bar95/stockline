import { Modal } from "./Modal";
import { Button, Spinner } from "./ui";
import { useT } from "../preferences/PreferencesContext";

type Props = {
  open: boolean;
  title: string;
  message: string;
  error?: string;
  confirmLabel?: string;
  busy?: boolean;
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
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  return (
    <Modal open={open} onClose={busy ? () => {} : onCancel} title={title}>
      <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
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
