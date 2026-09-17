import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmountModal } from '../src/components/AmountModal.tsx';
import { DailySummaryCard } from '../src/components/DailySummaryCard.tsx';
import { FoodItemRow } from '../src/components/FoodItemRow.tsx';
import { LogModal } from '../src/components/LogModal.tsx';
import { MealCard } from '../src/components/MealCard.tsx';
import { ModalShell } from '../src/components/ModalShell.tsx';
import { IngredientPickerRow } from '../src/components/IngredientPickerRow.tsx';
import { DecimalInput } from '../src/components/DecimalInput.tsx';
import { CopyYesterdayModal } from '../src/components/CopyYesterdayModal.tsx';
import type { MealItem } from '../src/types.ts';
import { swedishIngredients } from './helpers/test-fixtures.ts';

const noop = () => {};

function section(html: string, id: string) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `expected rendered section #${id}`);
  return html.slice(start);
}

describe('rendered component contracts', () => {
  it('provides a shared labelled modal header and disables interaction while busy', () => {
    const props = {
      backdropId: 'test-backdrop',
      dialogClassName: '',
      titleId: 'test-title',
      title: 'Test dialog',
      closeButtonId: 'test-close',
      onClose: noop,
      children: 'Test content',
    };
    const html = renderToString(React.createElement(ModalShell, { ...props, preventClose: true }));
    assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="test-title" aria-busy="true"/);
    assert.equal((html.match(/id="test-title"/g) ?? []).length, 1);
    assert.match(html, /id="test-close"[^>]*disabled=""/);
    assert.match(html, /inert=""/);
    assert.match(html, /Test content/);
    const idle = renderToString(React.createElement(ModalShell, props));
    assert.doesNotMatch(idle, /disabled=|inert=|aria-busy=/);
    assert.equal(renderToString(React.createElement(ModalShell, { ...props, active: false })), '');
  });

  it('renders ingredient selection and editing as independent native buttons', () => {
    const html = renderToString(React.createElement(IngredientPickerRow, {
      id: 'picker-row',
      ingredient: swedishIngredients.agg,
      onSelect: noop,
      onEdit: noop,
      editButtonId: 'picker-edit',
    }));
    assert.equal((html.match(/<button\b/g) ?? []).length, 2);
    assert.match(html, /<\/button><button id="picker-edit"/);
    assert.match(html, /aria-label="Redigera /);
    assert.match(html, /g protein/);
    assert.doesNotMatch(html, /role="button"/);
  });

  it('preserves decimal text and requests the decimal keyboard', () => {
    const html = renderToString(React.createElement(DecimalInput, {
      id: 'test-decimal',
      value: '12,50',
      onValueChange: noop,
    }));
    assert.match(html, /type="text"/);
    assert.match(html, /inputMode="decimal"/);
    assert.match(html, /value="12,50"/);
  });

  it('labels copy presets relative to the selected day when browsing history', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const html = renderToString(React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(CopyYesterdayModal, {
        currentDate: '2001-03-02',
        targetMealType: 'lunch',
        onCopy: async () => {},
        onClose: noop,
      }),
    ));
    assert.match(html, />Dagen före</);
    assert.match(html, />Två dagar före</);
    assert.match(html, />En vecka före</);
    assert.match(html, /value="2001-03-01"/);
    assert.doesNotMatch(html, /Igår|I förrgår/);
  });

  it('offers piece and base-unit entry for an ingredient with a piece weight', () => {
    const html = renderToString(React.createElement(AmountModal, {
      ingredient: swedishIngredients.prastost,
      onConfirm: noop,
      onClose: noop,
    }));

    assert.match(html, />Antal st</);
    assert.match(html, />Vikt \/ Volym \(/);
    assert.match(html, /id="unit-base-btn"/);
    assert.doesNotMatch(html, /Snabbval|quick-inc-/);
    assert.match(html, /Logga i receptet/);
  });

  it('shows remaining protein only while below the goal', () => {
    const html = renderToString(React.createElement(DailySummaryCard, {
      totalCalories: 1_500,
      totalProtein: 90,
      targetCalories: 2_000,
      targetProtein: 150,
    }));
    const protein = section(html, 'daily-protein-summary');

    assert.match(protein, />Protein</);
    assert.match(protein, />60</);
    assert.match(protein, />g kvar</);
    assert.doesNotMatch(protein, /g över mål/);
  });

  it('suppresses zero remaining protein and reports a surplus after the goal', () => {
    const met = section(renderToString(React.createElement(DailySummaryCard, {
      totalCalories: 2_000,
      totalProtein: 150,
      targetCalories: 2_000,
      targetProtein: 150,
    })), 'daily-protein-summary');
    assert.match(met, /Mål uppnått/);
    assert.doesNotMatch(met, /g kvar|g över mål/);

    const exceeded = section(renderToString(React.createElement(DailySummaryCard, {
      totalCalories: 2_000,
      totalProtein: 160.7,
      targetCalories: 2_000,
      targetProtein: 150,
    })), 'daily-protein-summary');
    assert.match(exceeded, /Mål uppnått/);
    assert.match(exceeded, /\+<!-- -->10\.7/);
    assert.match(exceeded, /g över mål/);
    assert.doesNotMatch(exceeded, /g kvar/);
  });

  it('renders quick-entry identity, nutrition, and accessible actions', () => {
    const html = renderToString(React.createElement(FoodItemRow, {
      id: 'quick-1',
      name: 'Lunch ute',
      amount: 1,
      loggedUnit: 'port',
      baseUnit: 'g',
      calories: 650,
      protein: 42,
      onEdit: noop,
      onDelete: noop,
    }));

    assert.match(html, /Lunch ute/);
    assert.match(html, /650<!-- --> kcal/);
    assert.match(html, /42<!-- --> g protein/);
    assert.match(html, /aria-label="Ändra mängd"/);
    assert.match(html, /aria-label="Ta bort"/);
    assert.doesNotMatch(html, /Snabblogg/);
  });

  it('includes quick entries in meal totals and renders item rows cleanly', () => {
    const items: MealItem[] = [
      {
        id: 'standard-1', userId: 'user-1', date: '2026-09-14', mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id, ingredientName: 'Kyckling', amount: 200,
        loggedUnit: 'g', baseUnit: 'g', calories: 220, protein: 46, createdAt: '',
        pieceWeight: null,
      },
      {
        id: 'quick-1', userId: 'user-1', date: '2026-09-14', mealType: 'dinner',
        ingredientId: null, ingredientName: 'Sås & tillbehör', amount: 1,
        loggedUnit: 'port', baseUnit: 'g', calories: 320, protein: 4.5, createdAt: '',
        pieceWeight: null,
      },
    ];
    const html = renderToString(React.createElement(MealCard, {
      mealType: 'dinner',
      items,
      onOpenAdd: noop,
      onCopyYesterday: noop,
      onEditItem: noop,
      onDeleteItem: noop,
      onSaveAsRecipe: noop,
    }));

    assert.match(html, /540/);
    assert.match(html, /50\.5/);
    assert.match(html, /Sås &amp; tillbehör/);
    assert.doesNotMatch(html, /Snabblogg/);
  });

  it('renders the quick-log form with all required inputs and action', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const html = renderToString(React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(LogModal, {
        mealType: 'lunch',
        initialTab: 'quick',
        onSelectIngredient: noop,
        onRequestCreateIngredient: noop,
        onSelectRecipe: noop,
        onClose: noop,
      }),
    ));

    for (const id of ['tab-flow-quick-btn', 'quick-calories-input', 'quick-protein-input', 'quick-name-input', 'submit-quick-log-btn']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /Snabblogg/);
    assert.match(html, /Logga i lunchen/);
  });
});
