interface DialogEntry {
  historyId: number;
  historyConsumed: boolean;
  onClose: () => void;
  isPrevented: () => boolean;
}

const historyKey = '__kaloriraknareDialogId';
const dialogStack: DialogEntry[] = [];
let nextHistoryId = 1;
let isInternalPop = false;
let isListening = false;
let internalPopReset: ReturnType<typeof setTimeout> | null = null;
let pendingCleanup: { historyId: number; timeout: ReturnType<typeof setTimeout> } | null = null;

function currentHistoryId() {
  return window.history.state?.[historyKey] as number | undefined;
}

function pushHistory(historyId: number) {
  try {
    window.history.pushState({
      ...(window.history.state ?? {}),
      [historyKey]: historyId,
    }, '');
    return true;
  } catch {
    // History can be unavailable in embedded/private browsing contexts.
    return false;
  }
}

function discardCurrentHistoryEntry() {
  isInternalPop = true;
  if (internalPopReset) clearTimeout(internalPopReset);

  try {
    window.history.back();
    internalPopReset = setTimeout(() => {
      isInternalPop = false;
      internalPopReset = null;
    }, 1_000);
  } catch {
    isInternalPop = false;
  }
}

function handlePopState() {
  if (isInternalPop) {
    isInternalPop = false;
    if (internalPopReset) {
      clearTimeout(internalPopReset);
      internalPopReset = null;
    }

    const historyId = currentHistoryId();
    if (historyId !== undefined && !dialogStack.some((dialog) => dialog.historyId === historyId)) {
      discardCurrentHistoryEntry();
    }
    return;
  }

  const dialog = dialogStack.at(-1);
  if (!dialog) return;

  if (dialog.isPrevented()) {
    pushHistory(dialog.historyId);
    return;
  }

  // Re-arm the guard before React changes which dialog is rendered. In Android
  // PWAs a second hardware-back press can otherwise leave the app while the
  // replacement dialog is still mounting. If another dialog opens, it reuses
  // this entry; if none does, unregisterDialogHistory removes it shortly after.
  dialog.historyConsumed = !pushHistory(dialog.historyId);
  dialog.onClose();
}

function ensureListener() {
  if (isListening) return;
  window.addEventListener('popstate', handlePopState);
  isListening = true;
}

export function registerDialogHistory(onClose: () => void, isPrevented: () => boolean) {
  ensureListener();

  let historyId: number;
  if (pendingCleanup && currentHistoryId() === pendingCleanup.historyId) {
    clearTimeout(pendingCleanup.timeout);
    historyId = pendingCleanup.historyId;
    pendingCleanup = null;
  } else {
    historyId = nextHistoryId++;
    pushHistory(historyId);
  }

  const entry: DialogEntry = { historyId, historyConsumed: false, onClose, isPrevented };
  dialogStack.push(entry);

  return () => {
    const index = dialogStack.indexOf(entry);
    if (index !== -1) dialogStack.splice(index, 1);
    if (entry.historyConsumed || currentHistoryId() !== historyId) return;

    const timeout = setTimeout(() => {
      if (pendingCleanup?.historyId === historyId) pendingCleanup = null;
      const isStillOpen = dialogStack.some((dialog) => dialog.historyId === historyId);
      if (!isStillOpen && currentHistoryId() === historyId) discardCurrentHistoryEntry();
    }, 30);
    pendingCleanup = { historyId, timeout };
  };
}
