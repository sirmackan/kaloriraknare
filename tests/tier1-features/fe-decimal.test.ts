import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Tier 1 — FE-DECIMAL: Swedish Mobile Decimal Keyboard Comma Handling', () => {
  // Pure sanitizer logic specified in Survey 3 & R4:
  // Converts Swedish comma to period, allows digits and at most one decimal point
  function sanitizeDecimalInput(rawValue: string): string {
    const val = rawValue.replace(',', '.');
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      return val;
    }
    return '';
  }

  function parseAmount(sanitizedValue: string): number {
    const num = parseFloat(sanitizedValue);
    return isNaN(num) ? 0 : num;
  }

  it('FE-DECIMAL-T1.1: Auto-converts Swedish decimal comma "1,5" to period "1.5" without clearing', () => {
    // In iOS Swedish keypad, the decimal separator is ','
    const userInput = '1,5';
    const sanitized = sanitizeDecimalInput(userInput);

    assert.equal(sanitized, '1.5', 'Comma must be converted to dot');
    assert.equal(parseAmount(sanitized), 1.5, 'Parsed amount must be 1.5');
  });

  it('FE-DECIMAL-T1.2: Handles partial typing of decimal comma (e.g. "1," or "0,")', () => {
    const partial1 = sanitizeDecimalInput('1,');
    assert.equal(partial1, '1.', 'Permits trailing decimal point while user continues typing');

    const partial2 = sanitizeDecimalInput('0,');
    assert.equal(partial2, '0.');
  });

  it('FE-DECIMAL-T1.3: Handles leading decimal comma (",5" -> ".5" -> 0.5)', () => {
    const leadingComma = sanitizeDecimalInput(',5');
    assert.equal(leadingComma, '.5');
    assert.equal(parseAmount(leadingComma), 0.5);
  });

  it('FE-DECIMAL-T1.4: Handles standard dot decimal inputs ("2.75") seamlessly', () => {
    const dotInput = sanitizeDecimalInput('2.75');
    assert.equal(dotInput, '2.75');
    assert.equal(parseAmount(dotInput), 2.75);
  });

  it('FE-DECIMAL-T1.5: Rejects non-numeric alphabetic input', () => {
    const invalidInput = sanitizeDecimalInput('12abc');
    assert.equal(invalidInput, '', 'Alphabetic characters must be rejected');
    assert.equal(parseAmount(invalidInput), 0);
  });

  it('FE-DECIMAL-T1.6: Standard integers ("100", "250") parse cleanly without decimals', () => {
    const integerInput = sanitizeDecimalInput('250');
    assert.equal(integerInput, '250');
    assert.equal(parseAmount(integerInput), 250);
  });
});
