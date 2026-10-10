"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
}) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`.trim()}
      type={type}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  onClick,
  pressed,
  expanded,
  className = "",
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`.trim()}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <Icon name={icon} size={19} />
    </button>
  );
}

export function Card({
  children,
  className = "",
  as: Element = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return <Element className={`card ${className}`.trim()}>{children}</Element>;
}

export function StatusBadge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  icon?: IconName;
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {icon ? <Icon name={icon} size={13} /> : null}
      <span>{children}</span>
    </span>
  );
}

export function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = "file",
  action,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon name={icon} size={25} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "This view could not be loaded",
  description = "Check your connection and try again. No changes have been made.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-panel__icon"><Icon name="alert" size={20} /></span>
      <div className="state-panel__body">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function InlineAlert({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const iconName: Record<typeof tone, IconName> = {
    info: "activity",
    success: "check",
    warning: "alert",
    danger: "alert",
  };
  return (
    <div className={`inline-alert inline-alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={iconName[tone]} size={18} />
      <div>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 ? <Icon name="chevron-right" size={14} /> : null}
            {item.href && index < items.length - 1
              ? <Link href={item.href}>{item.label}</Link>
              : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </div>
  );
}


export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p className="field-error" id={id} role="alert">{message}</p>;
}

type FieldBaseProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
};

export function TextField({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
  ...inputProps
}: FieldBaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "aria-describedby" | "aria-invalid">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}{required ? <span className="form-required" aria-hidden="true"> *</span> : null}</label>
      <input
        {...inputProps}
        id={id}
        required={required}
        className={`form-control ${error ? "form-control--invalid" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {hint ? <p className="form-hint" id={hintId}>{hint}</p> : null}
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
  ...textareaProps
}: FieldBaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className" | "aria-describedby" | "aria-invalid">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}{required ? <span className="form-required" aria-hidden="true"> *</span> : null}</label>
      <textarea
        {...textareaProps}
        id={id}
        required={required}
        className={`form-control form-control--textarea ${error ? "form-control--invalid" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {hint ? <p className="form-hint" id={hintId}>{hint}</p> : null}
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  required = false,
  options,
  placeholder,
  className = "",
  ...selectProps
}: FieldBaseProps & {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "aria-describedby" | "aria-invalid">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}{required ? <span className="form-required" aria-hidden="true"> *</span> : null}</label>
      <select
        {...selectProps}
        id={id}
        required={required}
        className={`form-control form-control--select ${error ? "form-control--invalid" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
      {hint ? <p className="form-hint" id={hintId}>{hint}</p> : null}
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </div>
  );
}

export type DataColumn<Row> = {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
};

export function DataTable<Row extends object>({
  rows,
  columns,
  rowKey,
  caption,
  loading = false,
  error,
  onRetry,
  emptyTitle = "No records yet",
  emptyDescription = "Records will appear here when data is available.",
}: {
  rows: Row[];
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  caption: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (loading) return <LoadingState label={`Loading ${caption.toLowerCase()}`} />;
  if (error) return <ErrorState title={`Unable to load ${caption.toLowerCase()}`} description={error} onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="data-table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column.key} className={`data-table__align--${column.align ?? "start"}`}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={`data-table__align--${column.align ?? "start"}`}>
                  {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaginationControls({
  offset,
  limit,
  visibleCount,
  total,
  hasMore,
  onPageChange,
}: {
  offset: number;
  limit: number;
  visibleCount: number;
  total?: number;
  hasMore: boolean;
  onPageChange: (nextOffset: number) => void;
}) {
  const first = visibleCount === 0 ? 0 : offset + 1;
  const last = total === undefined ? offset + visibleCount : Math.min(offset + visibleCount, total);
  return (
    <nav className="pagination-controls" aria-label="Table pagination">
      <p>{total === undefined ? `Showing ${first}–${last}` : `Showing ${first}–${last} of ${total}`}</p>
      <div>
        <Button variant="secondary" size="sm" disabled={offset <= 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          <Icon name="chevron-right" size={14} className="pagination-controls__previous" /> Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => onPageChange(offset + limit)}>
          Next <Icon name="chevron-right" size={14} />
        </Button>
      </div>
    </nav>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="confirm-dialog__icon"><Icon name={danger ? "alert" : "shield"} size={23} /></div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} className="button button--secondary" type="button" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button className={`button ${danger ? "button--danger" : "button--primary"}`} type="button" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? <><span className="button-spinner" aria-hidden="true" /> Working…</> : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ToastRegion({
  message,
  tone = "success",
  onDismiss,
}: {
  message: string;
  tone?: "success" | "error" | "info";
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className={`toast toast--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <Icon name={tone === "success" ? "check" : tone === "error" ? "alert" : "activity"} size={18} />
      <span>{message}</span>
      <button className="toast__close" aria-label="Dismiss notification" onClick={onDismiss} type="button"><Icon name="close" size={16} /></button>
    </div>
  );
}
