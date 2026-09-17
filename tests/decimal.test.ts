import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDecimalInput, parseDecimal } from '../src/utils/decimal.ts';

describe('decimal entry', () => {
  it('accepts Swedish commas and decimal points without rounding', () => {
    assert.equal(parseDecimal('12,5'), 12.5);
    assert.equal(parseDecimal('12.5'), 12.5);
    assert.equal(parseDecimal(',25'), 0.25);
    assert.equal(parseDecimal('0.0125'), 0.0125);
    assert.equal(parseDecimal('0'), 0);
  });

  it('allows intermediate typing states without treating empty text as zero', () => {
    for (const text of ['', ',', '.', '12,', '12.']) assert.equal(isDecimalInput(text), true);
    for (const text of ['', ',', '.']) assert.equal(parseDecimal(text), null);
    assert.equal(parseDecimal('12,'), 12);
    assert.equal(parseDecimal('12.'), 12);
  });

  it('rejects malformed, negative, and non-finite values', () => {
    for (const text of ['1,2.3', '1,,2', '-1', '1e3', '12g', 'NaN', 'Infinity', ' 12 ']) {
      assert.equal(isDecimalInput(text), false);
      assert.equal(parseDecimal(text), null);
    }
    assert.equal(parseDecimal('9'.repeat(400)), null);
  });
});
