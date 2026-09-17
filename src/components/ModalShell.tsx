import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface ModalShellProps {
  active?: boolean;
  backdropClassName?: string;
  backdropId: string;
  children: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
  dialogClassName: string;
  dialogId?: string;
  titleId: string;
  title: string;
  closeButtonId: string;
  icon?: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerDivider?: boolean;
  preventClose?: boolean;
  onClose: () => void;
}

const backdropBase = 'modal-backdrop fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs';
const dialogBase = 'w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-900 dark:text-slate-100 my-auto transition-colors';

export const ModalShell: React.FC<ModalShellProps> = ({
  active = true,
  backdropClassName = '',
  backdropId,
  children,
  dialogClassName,
  dialogId,
  titleId,
  title,
  closeButtonId,
  icon,
  eyebrow,
  subtitle,
  headerDivider = true,
  preventClose = false,
  onClose,
}) => {
  const requestClose = () => {
    if (!preventClose) onClose();
  };
  const dialogRef = useDialogAccessibility(requestClose, preventClose, active);
  if (!active) return null;

  const dialog = (
    <div
      id={backdropId}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`${backdropBase} ${backdropClassName}`}
    >
      <div
        id={dialogId}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={preventClose || undefined}
        tabIndex={-1}
        className={`${dialogBase} ${dialogClassName}`}
      >
        <div className={`mb-3 flex shrink-0 items-start justify-between gap-3 ${headerDivider ? 'border-b border-slate-200 pb-3 dark:border-slate-800' : ''}`}>
          <div className="flex min-w-0 items-start gap-2">
            {icon && <span aria-hidden="true" className="mt-0.5 shrink-0">{icon}</span>}
            <div className="min-w-0">
              {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{eyebrow}</div>}
              <h3 id={titleId} className="break-words text-base font-bold leading-snug text-slate-900 dark:text-white">{title}</h3>
              {subtitle && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
            </div>
          </div>
          <button
            id={closeButtonId}
            type="button"
            aria-label="Stäng"
            title="Stäng"
            disabled={preventClose}
            onClick={requestClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:text-slate-900 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="contents" inert={preventClose}>
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
