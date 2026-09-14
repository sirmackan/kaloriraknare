import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';
import { ModalShell } from './ModalShell';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const closeIOSGuide = () => setShowIOSGuide(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 dark:border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition active:scale-95 touch-manipulation"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installera</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 dark:border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition active:scale-95 touch-manipulation"
        >
          <Share className="w-3.5 h-3.5" />
          <span>Installera</span>
        </button>

        <ModalShell
          active={showIOSGuide}
          backdropId="ios-guide-modal-backdrop"
          backdropClassName="z-50 p-4 overflow-y-auto"
          dialogClassName="rounded-2xl p-5"
          titleId="ios-guide-title"
          onClose={closeIOSGuide}
        >
              <div className="flex items-center justify-between mb-3">
                <h3 id="ios-guide-title" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Installera på iPhone / iPad
                </h3>
                <button
                  id="close-ios-guide-btn"
                  aria-label="Stäng"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                1. Tryck på delningsknappen <strong className="text-emerald-600 dark:text-emerald-400">Dela</strong> (fyrkant med pil uppåt) i Safari.<br />
                2. Rulla nedåt och välj <strong className="text-emerald-600 dark:text-emerald-400">Lägg till på hemskärmen</strong>.<br />
                3. Appen läggs till och kan öppnas i helskärmsläge med kameratillgång!
              </p>
              <button
                id="ack-ios-guide-btn"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 active:scale-98 transition"
              >
                Uppfattat
              </button>
        </ModalShell>
      </>
    );
  }

  return null;
};
