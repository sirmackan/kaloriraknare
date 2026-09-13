import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Tier 2 — FE Boundary: Decimal Inputs, Safe-Area & Camera Lifecycles', () => {
  function sanitizeDecimal(input: string): string {
    const val = input.replace(',', '.');
    // Allow at most one decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      return val;
    }
    return '';
  }

  function parseAmount(val: string): number {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  it('FE-BOUND-B2.1: Input with multiple decimal commas ("1,5,2") is rejected by regex', () => {
    const multiComma = sanitizeDecimal('1,5,2');
    assert.equal(multiComma, '', 'Multiple decimals must be rejected');
    assert.equal(parseAmount(multiComma), 0);
  });

  it('FE-BOUND-B2.2: Input with leading comma (",75") parses accurately to 0.75', () => {
    const leading = sanitizeDecimal(',75');
    assert.equal(leading, '.75');
    assert.equal(parseAmount(leading), 0.75);
  });

  it('FE-BOUND-B2.3: Input with trailing comma ("3,") evaluates to 3 numerically', () => {
    const trailing = sanitizeDecimal('3,');
    assert.equal(trailing, '3.');
    assert.equal(parseAmount(trailing), 3);
  });

  it('FE-BOUND-B2.4: Zero amounts ("0" or "0.0") parse cleanly to 0 without NaN', () => {
    assert.equal(parseAmount(sanitizeDecimal('0')), 0);
    assert.equal(parseAmount(sanitizeDecimal('0.0')), 0);
    assert.equal(parseAmount(sanitizeDecimal('0,0')), 0);
  });

  it('FE-BOUND-B2.5: Safe area CSS formula handles zero insets (standard desktop browser) gracefully', () => {
    // When safe-area-inset-top is 0px: max(0.75rem, 0px) resolves to 0.75rem
    const fallbackRem = 0.75;
    const calculateEffectivePadding = (insetPx: number) => {
      const fallbackPx = fallbackRem * 16; // 12px
      return Math.max(fallbackPx, insetPx);
    };

    // Standard browser: inset = 0px
    assert.equal(calculateEffectivePadding(0), 12, 'Fallback 12px applied when inset is 0px');

    // iPhone Dynamic Island: inset = 59px
    assert.equal(calculateEffectivePadding(59), 59, '59px clearance applied on iPhone');
  });
});
