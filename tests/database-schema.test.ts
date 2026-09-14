import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema.ts';

function indexes(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    method: index.config.method,
    columns: index.config.columns.map((column: any) => column.name),
  }));
}

describe('database schema contracts', () => {
  it('defines the exact ingredient lookup indexes used by search and barcode queries', () => {
    assert.deepEqual(indexes(schema.ingredients), [
      { name: 'ingredients_name_trgm_idx', method: 'gin', columns: ['name'] },
      { name: 'ingredients_barcode_idx', method: 'btree', columns: ['barcode'] },
    ]);
  });

  it('indexes meals by user/date and user/creation time', () => {
    assert.deepEqual(indexes(schema.meals), [
      { name: 'meals_user_id_date_idx', method: 'btree', columns: ['user_id', 'date'] },
      { name: 'meals_user_id_created_at_idx', method: 'btree', columns: ['user_id', 'created_at'] },
    ]);
  });

  it('stores recipe items as required jsonb with required aggregate columns', () => {
    const config = getTableConfig(schema.recipes);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    assert.equal(columns.get('items_json')?.columnType, 'PgJsonb');
    assert.equal(columns.get('items_json')?.notNull, true);
    assert.equal(columns.get('total_calories')?.notNull, true);
    assert.equal(columns.get('total_protein')?.notNull, true);
  });

  it('allows quick meals without an ingredient while retaining user ownership constraints', () => {
    const config = getTableConfig(schema.meals);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    assert.equal(columns.get('ingredient_id')?.notNull, false);
    assert.equal(columns.get('user_id')?.notNull, true);
    assert.equal(config.foreignKeys.length, 2);
  });
});
