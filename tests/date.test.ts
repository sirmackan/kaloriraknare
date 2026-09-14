import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, formatHeaderDate, getTodayString } from '../src/utils/date.ts';

describe('calendar date utilities', () => {
  it('moves across month, year, and leap-day boundaries using local calendar dates', () => {
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2024-02-29', 1), '2024-03-01');
    assert.equal(addDays('2025-01-01', -1), '2024-12-31');
  });

  it('labels today, yesterday, and tomorrow relative to the same local date source', () => {
    const today = getTodayString();
    assert.match(formatHeaderDate(today).label, /^Idag, /);
    assert.match(formatHeaderDate(addDays(today, -1)).label, /^Igår, /);
    assert.match(formatHeaderDate(addDays(today, 1)).label, /^Imorgon, /);
  });

  it('formats an ordinary date with its Swedish weekday and month', () => {
    assert.deepEqual(formatHeaderDate('2024-02-29'), { label: 'Torsdag, 29 feb' });
  });
});
