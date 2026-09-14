import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { isPieceUnit } from '../../src/utils/nutrition';
import { AmountModal } from '../../src/components/AmountModal';
import { DailySummaryCard } from '../../src/components/DailySummaryCard';
import type { Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 1 — R3: Swedish UI Phrasing & State Polish', () => {
  const rootDir = process.cwd();

  describe('R3-1: Piece Unit Definition', () => {
    it('R3-1.1: Strictly identifies "st" as piece unit', () => {
      assert.equal(isPieceUnit('st'), true);
      assert.equal(isPieceUnit('ST'), true);
      assert.equal(isPieceUnit('g'), false);
      assert.equal(isPieceUnit('ml'), false);
    });
  });

  describe('R3-2: AmountModal Piece Unit Button Label Rendering', () => {
    const baseIngredient: Ingredient = swedishIngredients.prastost;

    it('R3-2.1: Renders static "Antal st" on piece button', () => {
      const html = renderToString(
        React.createElement(AmountModal, {
          ingredient: baseIngredient,
          onConfirm: () => {},
          onClose: () => {},
        })
      );

      assert.ok(
        html.includes('Antal st'),
        'Piece unit button must be hardcoded to "Antal st"'
      );
      assert.ok(
        html.includes('Vikt / Volym') && html.includes('unit-base-btn'),
        'Base unit button should be present'
      );
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
