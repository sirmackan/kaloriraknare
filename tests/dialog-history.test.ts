import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

class FakeWindow extends EventTarget {
  private entries: Array<Record<string, unknown> | null> = [null];
  private index = 0;
  exited = false;

  history = {
    get state() {
      return fakeWindow.entries[fakeWindow.index];
    },
    pushState: (state: Record<string, unknown>) => {
      this.entries.splice(this.index + 1);
      this.entries.push(state);
      this.index += 1;
    },
    back: () => {
      if (this.index === 0) {
        this.exited = true;
        return;
      }
      this.index -= 1;
      setTimeout(() => this.dispatchEvent(new Event('popstate')), 0);
    },
  };

  hardwareBack() {
    this.history.back();
  }
}

const fakeWindow = new FakeWindow();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: fakeWindow,
});

const { registerDialogHistory } = await import('../src/utils/dialogHistory.ts');

const waitForHistory = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('dialog history', () => {
  it('keeps Android back inside the app when returning from a child dialog', async () => {
    let ingredientClosed = false;
    let logClosed = false;

    const unregisterInitialLog = registerDialogHistory(() => {}, () => false);
    unregisterInitialLog();

    let unregisterIngredient = () => {};
    let unregisterReturnedLog = () => {};
    unregisterIngredient = registerDialogHistory(() => {
      ingredientClosed = true;
      unregisterIngredient();
      unregisterReturnedLog = registerDialogHistory(() => {
        logClosed = true;
        unregisterReturnedLog();
      }, () => false);
    }, () => false);

    fakeWindow.hardwareBack();
    await waitForHistory();
    assert.equal(ingredientClosed, true);
    assert.equal(logClosed, false);
    assert.equal(fakeWindow.exited, false);

    fakeWindow.hardwareBack();
    await waitForHistory();
    assert.equal(logClosed, true);
    assert.equal(fakeWindow.exited, false);
  });
});
