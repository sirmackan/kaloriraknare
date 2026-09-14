import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  getDisplayPieceLabel,
  formatPieceUnitLabel,
} from '../../src/utils/nutrition';
import { AmountModal } from '../../src/components/AmountModal';
import { DailySummaryCard } from '../../src/components/DailySummaryCard';
import type { Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 1 — R3: Swedish UI Phrasing & State Polish', () => {
  const rootDir = process.cwd();

  describe('R3-1: formatPieceUnitLabel Helper & Invariant Verification', () => {
    it('R3-1.1: Formats custom piece labels with clean parentheses "Antal (<label>)"', () => {
      assert.equal(formatPieceUnitLabel('skiva'), 'Antal (skiva)');
      assert.equal(formatPieceUnitLabel('ägg'), 'Antal (ägg)');
      assert.equal(formatPieceUnitLabel('skopa'), 'Antal (skopa)');
      assert.equal(formatPieceUnitLabel('portion'), 'Antal (portion)');
    });

    it('R3-1.2: Formats standard piece unit as "Antal (st)"', () => {
      assert.equal(formatPieceUnitLabel('st'), 'Antal (st)');
    });

    it('R3-1.3: Handles null, undefined, empty, and whitespace strings safely falling back to "Antal (st)"', () => {
      assert.equal(formatPieceUnitLabel(null), 'Antal (st)');
      assert.equal(formatPieceUnitLabel(undefined), 'Antal (st)');
      assert.equal(formatPieceUnitLabel(''), 'Antal (st)');
      assert.equal(formatPieceUnitLabel('   '), 'Antal (st)');
    });

    it('R3-1.4: Trims extraneous whitespace around custom labels', () => {
      assert.equal(formatPieceUnitLabel('  skiva  '), 'Antal (skiva)');
      assert.equal(formatPieceUnitLabel('\tägg\n'), 'Antal (ägg)');
    });

    it('R3-1.5: Preserves CALC-ADV-07 invariant: getDisplayPieceLabel return behavior is untouched', () => {
      // Must strictly preserve existing challenger test behavior: returns raw label, not formatted
      assert.equal(getDisplayPieceLabel('ägg'), 'ägg');
      assert.equal(getDisplayPieceLabel('  skiva  '), 'skiva');
      assert.equal(getDisplayPieceLabel(null), 'st');
      assert.equal(getDisplayPieceLabel(undefined), 'st');
      assert.equal(getDisplayPieceLabel(''), 'st');
      assert.equal(getDisplayPieceLabel('   '), 'st');
    });
  });

  describe('R3-2: AmountModal Piece Unit Button Label Rendering', () => {
    const baseIngredient: Ingredient = swedishIngredients.prastost;

    it('R3-2.1: Renders "Antal (skiva)" on piece button when pieceLabel is "skiva"', () => {
      const html = renderToString(
        React.createElement(AmountModal, {
          ingredient: { ...baseIngredient, pieceLabel: 'skiva' },
          onConfirm: () => {},
          onClose: () => {},
        })
      );

      assert.ok(
        html.includes('Antal (skiva)'),
        'Piece unit button must format cleanly as "Antal (skiva)" rather than "Antal skiva"'
      );
      assert.ok(
        !html.includes('Antal skiva'),
        'Piece unit button must NOT be unparenthesized "Antal skiva"'
      );
      assert.ok(
        html.includes('Vikt / Volym') && html.includes('unit-base-btn'),
        'Base unit button should be present'
      );
    });

    it('R3-2.2: Renders "Antal (ägg)" when pieceLabel is "ägg"', () => {
      const html = renderToString(
        React.createElement(AmountModal, {
          ingredient: { ...baseIngredient, name: 'Ägg', pieceLabel: 'ägg', pieceWeight: 55 },
          onConfirm: () => {},
          onClose: () => {},
        })
      );

      assert.ok(
        html.includes('Antal (ägg)'),
        'Piece unit button must format cleanly as "Antal (ägg)"'
      );
      assert.ok(
        !html.includes('Antal ägg'),
        'Piece unit button must NOT be unparenthesized "Antal ägg"'
      );
    });

    it('R3-2.3: Renders "Antal (st)" when pieceLabel is null, undefined, or empty', () => {
      const htmlNull = renderToString(
        React.createElement(AmountModal, {
          ingredient: { ...baseIngredient, pieceLabel: null },
          onConfirm: () => {},
          onClose: () => {},
        })
      );
      assert.ok(htmlNull.includes('Antal (st)'), 'Null pieceLabel should render "Antal (st)"');

      const htmlEmpty = renderToString(
        React.createElement(AmountModal, {
          ingredient: { ...baseIngredient, pieceLabel: '' },
          onConfirm: () => {},
          onClose: () => {},
        })
      );
      assert.ok(htmlEmpty.includes('Antal (st)'), 'Empty pieceLabel should render "Antal (st)"');
    });
  });

  describe('R3-3: DailySummaryCard Protein Goal Reached & 0g Kvar Suppression', () => {
    it('R3-3.1: Suppresses "0 g kvar" when protein goal is exactly met (remainingProtein === 0)', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2000,
          totalProtein: 150,
          targetCalories: 2000,
          targetProtein: 150,
        })
      );

      // Must show goal reached header
      assert.ok(
        html.includes('Mål uppnått'),
        'Must display "Mål uppnått" when protein goal is met'
      );

      // Must suppress "0 g kvar" beneath "Mål uppnått"
      assert.ok(
        !html.includes('0 g kvar'),
        'Must suppress "0 g kvar" when protein goal is met'
      );
      assert.ok(
        !html.includes('g kvar') || !html.includes('0</span><span class="text-xs font-semibold text-slate-500 dark:text-slate-400">g kvar'),
        'Must not show "0" with "g kvar" in protein summary'
      );

      // Verify that "g kvar" for protein does not exist
      // Split by protein card to be certain
      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection, 'Protein summary card section must exist');
      assert.ok(
        !proteinSection.includes('g kvar'),
        'Protein section must not contain "g kvar" when goal is met'
      );
    });

    it('R3-3.2: Displays "+X g över mål" when protein goal is exceeded (remainingProtein < 0)', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2000,
          totalProtein: 175,
          targetCalories: 2000,
          targetProtein: 150,
        })
      );

      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection, 'Protein summary card section must exist');

      assert.ok(
        proteinSection.includes('Mål uppnått'),
        'Exceeded protein goal must show "Mål uppnått"'
      );
      assert.ok(
        proteinSection.includes('+25') || proteinSection.includes('+<!-- -->25'),
        'Must render "+25" surplus'
      );
      assert.ok(
        proteinSection.includes('g över mål'),
        'Must display "g över mål" when protein target is exceeded'
      );
      assert.ok(
        !proteinSection.includes('g kvar'),
        'Must NOT display "g kvar" when goal is exceeded'
      );
    });

    it('R3-3.3: Displays "X g kvar" when protein goal is not yet met (remainingProtein > 0)', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 1500,
          totalProtein: 90,
          targetCalories: 2000,
          targetProtein: 150,
        })
      );

      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection, 'Protein summary card section must exist');

      assert.ok(
        proteinSection.includes('Protein'),
        'Incomplete goal must show "Protein" header'
      );
      assert.ok(
        !proteinSection.includes('Mål uppnått'),
        'Incomplete goal must NOT show "Mål uppnått"'
      );
      assert.ok(
        proteinSection.includes('60'),
        'Must render remaining amount 60'
      );
      assert.ok(
        proteinSection.includes('g kvar'),
        'Must display "g kvar" when goal is pending'
      );
      assert.ok(
        !proteinSection.includes('g över mål'),
        'Must NOT display "g över mål" when under target'
      );
    });
  });

  describe('R3-4: Phrasing Preservation Audit', () => {
    it('R3-4.1: Preserves "En vecka sedan" in src/components/CopyYesterdayModal.tsx', () => {
      const filePath = path.join(rootDir, 'src/components/CopyYesterdayModal.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes('En vecka sedan'),
        'CopyYesterdayModal.tsx must preserve the exact phrasing "En vecka sedan"'
      );
    });

    it('R3-4.2: Preserves "Ange ett giltigt kaloriantal" in src/components/IngredientModal.tsx', () => {
      const filePath = path.join(rootDir, 'src/components/IngredientModal.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes('Ange ett giltigt kaloriantal'),
        'IngredientModal.tsx must preserve the exact phrasing "Ange ett giltigt kaloriantal"'
      );
    });
  });
});
