import { useEffect, useRef } from 'react';
import { registerDialogHistory } from '../utils/dialogHistory';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const openDialogs: HTMLDivElement[] = [];
let originalOverflow = '';

export function useDialogAccessibility(onClose: () => void, preventClose = false, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);
  onCloseRef.current = onClose;
  preventCloseRef.current = preventClose;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const unregisterHistory = registerDialogHistory(
      () => onCloseRef.current(),
      () => preventCloseRef.current,
    );

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs.length === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(dialog);

    const frame = requestAnimationFrame(() => {
      if (openDialogs.at(-1) !== dialog) return;
      const preferred = dialog?.querySelector<HTMLElement>('[autofocus]');
      const first = dialog?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? first ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape' && !preventCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      unregisterHistory();
      const index = openDialogs.indexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) {
        document.body.style.overflow = originalOverflow;
      }
      if (previouslyFocused?.isConnected && !previouslyFocused.closest('[inert]')) {
        previouslyFocused.focus();
      } else {
        openDialogs.at(-1)?.focus();
      }
    };
  }, [active]);

  return dialogRef;
}
