import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Zap, ZapOff } from 'lucide-react';
import { BarcodeScanner as WasmBarcodeScanner, type ScanResult } from 'web-wasm-barcode-reader';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<WasmBarcodeScanner | null>(null);
  const hasScannedRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let isMounted = true;
    hasScannedRef.current = false;
    let scannerInstance: WasmBarcodeScanner | null = null;

    const stopContainerMediaTracks = () => {
      if (containerRef.current) {
        const videos = containerRef.current.querySelectorAll('video');
        videos.forEach((video) => {
          if (video.srcObject && 'getTracks' in (video.srcObject as MediaStream)) {
            (video.srcObject as MediaStream).getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {
                // Ignore track stop error
              }
            });
            video.srcObject = null;
          }
        });
      }
    };

    const startScanner = async () => {
      // Allow DOM to calculate container dimensions
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!isMounted || !containerRef.current) return;

      try {
        setErrorMsg(null);

        scannerInstance = new WasmBarcodeScanner({
          container: containerRef.current,
          wasmPath: '/wasm-barcode-reader/',
          scanInterval: 120, // Fast scanning loop
          beepOnDetect: false, // Avoid Safari AudioContext lockup
          facingMode: 'environment',
          scanRegion: { width: 0.9, height: 0.4 },
          resolutionScale: 1.5,
          onDetect: (result: ScanResult) => {
            if (!isMounted || hasScannedRef.current) return;
            const cleaned = result?.data?.trim();
            // Requirement: Only support scanning of exactly 13 digits (EAN-13).
            // If anything else is detected, ignore and let camera keep scanning.
            if (cleaned && /^\d{13}$/.test(cleaned)) {
              hasScannedRef.current = true;
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(100);
                } catch {
                  // Ignore
                }
              }
              // Defer callback out of synchronous WASM call stack
              setTimeout(() => {
                if (isMounted) {
                  onScanRef.current(cleaned);
                }
              }, 20);
            }
          },
          onError: (err: Error) => {
            if (!isMounted) return;
            setCameraActive(false);
            const msg = err.message || String(err);
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
              setErrorMsg('Kameratillstånd nekades.');
            } else {
              setErrorMsg('Kunde inte starta kameran.');
            }
          },
        });

        scannerRef.current = scannerInstance;
        await scannerInstance.start();

        // Handle in-flight startup promises: if unmounted while start() was awaiting, stop immediately
        if (!isMounted) {
          try {
            scannerInstance.stop();
          } catch (e) {
            console.warn('Error stopping scanner after unmount:', e);
          }
          stopContainerMediaTracks();
          scannerRef.current = null;
          return;
        }

        setCameraActive(true);
      } catch (err: unknown) {
        if (!isMounted) {
          try {
            scannerInstance?.stop();
          } catch {
            // Ignore
          }
          stopContainerMediaTracks();
          scannerRef.current = null;
          return;
        }
        setCameraActive(false);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setErrorMsg('Kameratillstånd nekades.');
        } else {
          setErrorMsg('Kunde inte starta kameran.');
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        try {
          // Remove the isRunning conditional check that prevented cleanup:
          // stop() is called unconditionally
          scannerRef.current.stop();
        } catch (e) {
          console.warn('Error stopping scanner on unmount:', e);
        }
        scannerRef.current = null;
      }
      stopContainerMediaTracks();
    };
  }, []);

  const toggleTorch = async () => {
    if (!scannerRef.current || !scannerRef.current.isRunning) return;
    try {
      const state = await scannerRef.current.toggleTorch();
      setIsTorchOn(state);
    } catch {
      // Torch not supported on current device
    }
  };

  return (
    <div className="relative w-full aspect-[4/3] max-h-[300px] bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
      {/* Container where web-wasm-barcode-reader mounts video. Overlays and polygon canvas are hidden via CSS */}
      <div
        ref={containerRef}
        className="w-full h-full relative [&_.scan-overlay]:!hidden [&_canvas]:!hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
      />

      {/* Loading or Error placeholder when camera isn't active */}
      {!cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/90 z-20">
          {errorMsg ? (
            <>
              <CameraOff className="w-8 h-8 text-slate-500 mb-1.5" />
              <p className="text-xs text-rose-400">{errorMsg}</p>
            </>
          ) : (
            <>
              <Camera className="w-8 h-8 text-emerald-400 animate-pulse mb-1.5" />
              <p className="text-xs text-slate-400">Startar kamera...</p>
            </>
          )}
        </div>
      )}

      {/* Flashlight toggle button */}
      {cameraActive && (
        <button
          type="button"
          id="toggle-torch-btn"
          aria-label={isTorchOn ? 'Släck lampa' : 'Tänd lampa'}
          onClick={toggleTorch}
          title={isTorchOn ? 'Släck lampa' : 'Tänd lampa'}
          className={`absolute top-2.5 right-2.5 z-30 p-2.5 rounded-xl backdrop-blur-md transition active:scale-90 ${
            isTorchOn
              ? 'bg-amber-400 text-slate-950 shadow-md'
              : 'bg-black/60 text-white hover:bg-black/80'
          }`}
        >
          {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};
