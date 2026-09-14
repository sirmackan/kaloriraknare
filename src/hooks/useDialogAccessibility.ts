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

let openDialogs = 0;
let originalOverflow = '';

export function useDialogAccessibility(onClose: () => void, preventClose = false, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);
  onCloseRef.current = onClose;
  preventCloseRef.current = preventClose;

  useEffect(() => {
    if (!active) return;

    const unregisterHistory = registerDialogHistory(
      () => onCloseRef.current(),
      () => preventCloseRef.current,
    );

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs += 1;

    const dialog = dialogRef.current;
    const frame = requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>('[autofocus]');
      const first = dialog?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? first ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog || !dialog.contains(document.activeElement)) return;
      if (event.key === 'Escape' && !preventCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
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
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      unregisterHistory();
      openDialogs = Math.max(0, openDialogs - 1);
      if (openDialogs === 0) {
        document.body.style.overflow = originalOverflow;
        previouslyFocused?.focus();
      }
    };
  }, [active]);

  return dialogRef;
}
