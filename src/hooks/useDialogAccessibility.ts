import { useEffect, useRef } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogEntry {
  id: number;
  onClose: () => void;
  isPrevented: () => boolean;
}

let nextDialogId = 1;
const dialogStack: DialogEntry[] = [];
let originalOverflow = '';
let isInternalHistoryPop = false;
let isPopStateListenerAttached = false;
let cleanupHistoryTimeout: ReturnType<typeof setTimeout> | null = null;

function handleGlobalPopState() {
  if (isInternalHistoryPop) {
    isInternalHistoryPop = false;
    return;
  }

  if (dialogStack.length === 0) return;

  const topDialog = dialogStack[dialogStack.length - 1];
  if (topDialog.isPrevented()) {
    try {
      window.history.pushState({ dialogLevel: 1 }, '');
    } catch {
      // ignore
    }
    return;
  }

  // Close the active top dialog
  topDialog.onClose();
}

function ensurePopStateListener() {
  if (!isPopStateListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('popstate', handleGlobalPopState);
    isPopStateListenerAttached = true;
  }
}

export function useDialogAccessibility(onClose: () => void, preventClose = false, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);
  onCloseRef.current = onClose;
  preventCloseRef.current = preventClose;

  useEffect(() => {
    if (!active) return;

    ensurePopStateListener();

    if (cleanupHistoryTimeout) {
      clearTimeout(cleanupHistoryTimeout);
      cleanupHistoryTimeout = null;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialogStack.length === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      try {
        window.history.pushState({ dialogLevel: 1 }, '');
      } catch {
        // ignore
      }
    }

    const entryId = nextDialogId++;
    dialogStack.push({
      id: entryId,
      onClose: () => onCloseRef.current(),
      isPrevented: () => preventCloseRef.current,
    });

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

      const index = dialogStack.findIndex((d) => d.id === entryId);
      if (index !== -1) {
        dialogStack.splice(index, 1);
      }

      if (dialogStack.length === 0) {
        document.body.style.overflow = originalOverflow;
        previouslyFocused?.focus();

        // Defer history.back() slightly to avoid colliding with another modal mounting in the same transition
        cleanupHistoryTimeout = setTimeout(() => {
          if (dialogStack.length === 0 && typeof window !== 'undefined' && window.history.state?.dialogLevel) {
            isInternalHistoryPop = true;
            try {
              window.history.back();
            } catch {
              isInternalHistoryPop = false;
            }
          }
        }, 30);
      }
    };
  }, [active]);

  return dialogRef;
}

