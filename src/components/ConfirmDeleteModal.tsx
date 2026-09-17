import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  itemName?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  itemName,
  description,
  confirmLabel = 'Ta bort',
  cancelLabel = 'Avbryt',
  isDeleting = false,
  onConfirm,
  onClose,
}) => {
  return (
    <ModalShell
      active={isOpen}
      backdropId="confirm-delete-modal-overlay"
      backdropClassName="z-70 p-4 overflow-y-auto animate-in fade-in duration-150"
      dialogId="confirm-delete-modal-card"
      dialogClassName="rounded-3xl p-6"
      titleId="confirm-delete-title"
      title={title}
      closeButtonId="close-confirm-delete-modal-btn"
      icon={<AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
      headerDivider={false}
      preventClose={isDeleting}
      onClose={onClose}
    >
      {(requestClose) => (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {description || (
              <>
                Är du säker på att du vill ta bort{' '}
                {itemName ? <span className="font-semibold text-slate-900 dark:text-slate-200">&quot;{itemName}&quot;</span> : 'detta'}?{' '}
                Detta kan inte ångras.
              </>
            )}
          </p>
          <div className="mt-4 flex gap-2.5 pt-2">
            <button
              id="cancel-confirm-delete-btn"
              type="button"
              disabled={isDeleting}
              onClick={requestClose}
              className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-2xl transition active:scale-98 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              id="action-confirm-delete-btn"
              type="button"
              disabled={isDeleting}
              onClick={onConfirm}
              className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-sm active:scale-98 disabled:opacity-60"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Tar bort...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{confirmLabel}</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
};
