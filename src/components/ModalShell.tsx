import React from 'react';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface ModalShellProps {
  active?: boolean;
  backdropClassName?: string;
  backdropId: string;
  children: React.ReactNode;
  dialogClassName: string;
  dialogId?: string;
  titleId: string;
  preventClose?: boolean;
  onClose: () => void;
}

const backdropBase = 'fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs';
const dialogBase = 'w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-900 dark:text-slate-100 my-auto transition-colors';

export const ModalShell: React.FC<ModalShellProps> = ({
  active = true,
  backdropClassName = '',
  backdropId,
  children,
  dialogClassName,
  dialogId,
  titleId,
  preventClose = false,
  onClose,
}) => {
  const dialogRef = useDialogAccessibility(onClose, preventClose, active);
  if (!active) return null;

  return (
    <div
      id={backdropId}
      onClick={(event) => {
        if (event.target === event.currentTarget && !preventClose) onClose();
      }}
      className={`${backdropBase} ${backdropClassName}`}
    >
      <div
        id={dialogId}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${dialogBase} ${dialogClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
