import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const migration = await readFile(new URL('../drizzle/0000_misty_chat.sql', import.meta.url), 'utf8');

describe('historical database migration', () => {
  it('upgrades old quick-log and recipe storage without deleting domain rows', () => {
    assert.match(migration, /ALTER COLUMN "ingredient_id" DROP NOT NULL/);
    assert.match(migration, /ALTER COLUMN "items_json" TYPE jsonb/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "is_deleted"/);
    assert.doesNotMatch(migration, /DELETE FROM "(?:meals|ingredients)"/);
    assert.doesNotMatch(migration, /DROP TABLE/);
  });

  it('removes only unsupported and duplicate barcode associations', () => {
    assert.match(migration, /SET "barcode" = NULL/);
    assert.match(migration, /ranked_barcodes/);
  });
});
