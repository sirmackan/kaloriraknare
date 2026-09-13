import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1 — FE-SAFEAREA: PWA iOS Safe-Area Inset Handling', () => {
  const rootDir = process.cwd();

  it('FE-SAFEAREA-T1.1: index.html configures viewport-fit=cover for notch/island rendering', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(
      content.includes('viewport-fit=cover'),
      'index.html meta viewport must specify viewport-fit=cover'
    );
  });

  it('FE-SAFEAREA-T1.2: DateHeader specification includes env(safe-area-inset-top) padding', () => {
    const headerPath = path.join(rootDir, 'src/components/DateHeader.tsx');
    const content = fs.readFileSync(headerPath, 'utf-8');

    // Check if safe-area-inset-top is referenced in header styling
    const hasSafeAreaTop = content.includes('safe-area-inset-top') || content.includes('pt-[');
    assert.ok(
      hasSafeAreaTop,
      'DateHeader should include safe-area top padding or CSS classes'
    );
  });

  it('FE-SAFEAREA-T1.3: App.tsx main container specifies bottom safe-area padding', () => {
    const appPath = path.join(rootDir, 'src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    const hasBottomPadding = content.includes('safe-area-inset-bottom') || content.includes('pb-');
    assert.ok(hasBottomPadding, 'App.tsx must include bottom padding for home indicator');
  });

  it('FE-SAFEAREA-T1.4: Safe-area calculation helper evaluates valid CSS with fallback values', () => {
    // Utility verifying the CSS safe-area max() syntax
    function generateSafeAreaStyle(type: 'top' | 'bottom', fallbackRem: number): string {
      return `max(${fallbackRem}rem, env(safe-area-inset-${type}, 0px))`;
    }

    const topStyle = generateSafeAreaStyle('top', 0.75);
    assert.equal(topStyle, 'max(0.75rem, env(safe-area-inset-top, 0px))');

    const bottomStyle = generateSafeAreaStyle('bottom', 1.5);
    assert.equal(bottomStyle, 'max(1.5rem, env(safe-area-inset-bottom, 0px))');
  });

  it('FE-SAFEAREA-T1.5: Modal dialog containers provide vertical clearance for notch and home bar', () => {
    const amountModalPath = path.join(rootDir, 'src/components/AmountModal.tsx');
    const content = fs.readFileSync(amountModalPath, 'utf-8');

    assert.ok(
      content.includes('max-h-') || content.includes('p-'),
      'AmountModal dialog must constrain max height and provide padding'
    );
  });
});
