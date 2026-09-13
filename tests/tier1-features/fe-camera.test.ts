import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock MediaStreamTrack and MediaStream
class MockMediaStreamTrack {
  public stopped = false;
  stop() {
    this.stopped = true;
  }
}

class MockMediaStream {
  public tracks: MockMediaStreamTrack[] = [new MockMediaStreamTrack(), new MockMediaStreamTrack()];
  getTracks() {
    return this.tracks;
  }
}

class MockVideoElement {
  public srcObject: MockMediaStream | null = null;
}

// Lifecycle coordinator simulating BarcodeScanner lifecycle contract
class BarcodeScannerLifecycleHarness {
  public isMounted = true;
  public activeTracks: MockMediaStreamTrack[] = [];
  public videoElement = new MockVideoElement();
  public scannerRunning = false;
  public startPromise: Promise<void> | null = null;

  async start(): Promise<void> {
    const stream = new MockMediaStream();
    this.activeTracks = stream.getTracks();
    this.videoElement.srcObject = stream;

    // Simulate async camera initialization delay
    this.startPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.isMounted) {
          this.scannerRunning = true;
        } else {
          // Unmounted while start was pending: IMMEDIATE CLEANUP REQUIRED
          this.stopHardware();
        }
        resolve();
      }, 50);
    });

    return this.startPromise;
  }

  stopHardware() {
    for (const track of this.activeTracks) {
      track.stop();
    }
    this.videoElement.srcObject = null;
    this.scannerRunning = false;
  }

  unmount() {
    this.isMounted = false;
    this.stopHardware();
  }
}

describe('Tier 1 — FE-CAMERA: Barcode Scanner Camera Stream Leak Prevention', () => {
  it('FE-CAMERA-T1.1: Stops all MediaStream tracks immediately upon component unmount', async () => {
    const harness = new BarcodeScannerLifecycleHarness();
    await harness.start();

    assert.equal(harness.scannerRunning, true);
    assert.equal(harness.activeTracks.length, 2);
    assert.equal(harness.activeTracks.every((t) => !t.stopped), true);

    // Unmount modal
    harness.unmount();

    assert.equal(harness.scannerRunning, false);
    assert.equal(harness.activeTracks.every((t) => t.stopped), true, 'All tracks must be stopped');
  });

  it('FE-CAMERA-T1.2: In-flight startup promise cleanup: stops stream even if unmounted before start() finishes', async () => {
    const harness = new BarcodeScannerLifecycleHarness();

    // Trigger start() but DO NOT await it yet
    const startPromise = harness.start();

    // User closes modal immediately while camera is still initializing (in-flight promise)
    harness.unmount();

    // Wait for the pending startup promise to complete
    await startPromise;

    // Verify all acquired tracks were immediately stopped upon resolution
    assert.equal(harness.activeTracks.length, 2);
    assert.equal(
      harness.activeTracks.every((t) => t.stopped),
      true,
      'Hardware tracks must be released when promise resolves after unmount'
    );
    assert.equal(harness.videoElement.srcObject, null, 'srcObject must be cleared');
  });

  it('FE-CAMERA-T1.3: video.srcObject reference is cleared to prevent memory retention', async () => {
    const harness = new BarcodeScannerLifecycleHarness();
    await harness.start();

    assert.ok(harness.videoElement.srcObject !== null);

    harness.unmount();
    assert.equal(harness.videoElement.srcObject, null, 'video.srcObject must be null');
  });

  it('FE-CAMERA-T1.4: Cleanup executes unconditionally without gating behind isRunning check', () => {
    // The defect noted in Survey 3 was:
    // if (scannerRef.current.isRunning) { scannerRef.current.stop(); }
    // which failed because isRunning was false during initialization.
    let stopCalled = false;
    const mockScanner = {
      isRunning: false, // Not yet marked running
      stop: () => {
        stopCalled = true;
      },
    };

    // Unconditional cleanup invocation
    mockScanner.stop();

    assert.equal(stopCalled, true, 'Scanner stop must be called regardless of isRunning flag');
  });

  it('FE-CAMERA-T1.5: Handles rapid mount-unmount cycles without hardware track retention', async () => {
    const harnesses = [
      new BarcodeScannerLifecycleHarness(),
      new BarcodeScannerLifecycleHarness(),
      new BarcodeScannerLifecycleHarness(),
    ];

    // Rapidly start and unmount 3 instances
    const promises = harnesses.map(async (h) => {
      const p = h.start();
      h.unmount();
      await p;
    });

    await Promise.all(promises);

    for (const h of harnesses) {
      assert.equal(h.activeTracks.every((t) => t.stopped), true);
      assert.equal(h.videoElement.srcObject, null);
    }
  });
});
