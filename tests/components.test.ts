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
import type { MealItem } from '../src/types.ts';
import { swedishIngredients } from './helpers/test-fixtures.ts';

const noop = () => {};

function section(html: string, id: string) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `expected rendered section #${id}`);
  return html.slice(start);
}

describe('rendered component contracts', () => {
  it('offers piece and base-unit entry for an ingredient with a piece weight', () => {
    const html = renderToString(React.createElement(AmountModal, {
      ingredient: swedishIngredients.prastost,
      onConfirm: noop,
      onClose: noop,
    }));

    assert.match(html, />Antal st</);
    assert.match(html, />Vikt \/ Volym \(/);
    assert.match(html, /id="unit-base-btn"/);
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
      isQuick: true,
      onEdit: noop,
      onDelete: noop,
    }));

    assert.match(html, /Lunch ute/);
    assert.match(html, /Snabblogg/);
    assert.match(html, /650<!-- --> kcal/);
    assert.match(html, /42<!-- --> g protein/);
    assert.match(html, /aria-label="Ändra mängd"/);
    assert.match(html, /aria-label="Ta bort"/);
  });

  it('includes quick entries in meal totals and marks only those rows as quick', () => {
    const items: MealItem[] = [
      {
        id: 'standard-1', userId: 'user-1', date: '2026-09-14', mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id, ingredientName: 'Kyckling', amount: 200,
        loggedUnit: 'g', baseUnit: 'g', calories: 220, protein: 46, createdAt: '',
      },
      {
        id: 'quick-1', userId: 'user-1', date: '2026-09-14', mealType: 'dinner',
        ingredientId: null, ingredientName: 'Sås & tillbehör', amount: 1,
        loggedUnit: 'port', baseUnit: 'g', calories: 320, protein: 4.5, createdAt: '',
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
    assert.equal((html.match(/Snabblogg/g) ?? []).length, 1);
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
    assert.match(html, />Logga</);
  });
});
