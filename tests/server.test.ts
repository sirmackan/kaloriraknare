process.env.NODE_ENV = 'test';
process.env.SQL_HOST = '127.0.0.1';
process.env.SQL_USER = 'test';
process.env.SQL_PASSWORD = 'test';
process.env.SQL_DB_NAME = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchRequest } from './helpers/memory-http.ts';

const { app } = await import('../server.ts');

describe('HTTP server public behavior', () => {
  it('serves health metadata with cache prevention headers', async () => {
    const response = await dispatchRequest(app, { method: 'GET', path: '/api/health' });
    const body = response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'kaloriraknare');
    assert.match(body.time, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(body.check, 'liveness');
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  for (const request of [
    { method: 'GET' as const, path: '/api' },
    { method: 'POST' as const, path: '/api/unknown/deep', body: { value: true } },
    { method: 'PUT' as const, path: '/api/users/not-a-route', body: {} },
    { method: 'DELETE' as const, path: '/api/recipes/id/extra' },
    { method: 'PATCH' as const, path: '/api/meals/id' },
  ]) {
    it(`does not disclose unmatched protected ${request.method} routes`, async () => {
      const response = await dispatchRequest(app, request);
      assert.equal(response.status, 401);
      assert.match(response.headers['content-type'], /application\/json/);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.deepEqual(response.json(), { error: 'Ogiltig eller saknad inloggning' });
    });
  }

  for (const request of [
    { method: 'GET' as const, path: '/api/meals?date=2026-09-14' },
    { method: 'POST' as const, path: '/api/ingredients/batch', body: { ids: ['ing_1'] } },
  ]) {
    it(`rejects unauthenticated ${request.method} ${request.path.split('?')[0]}`, async () => {
      const response = await dispatchRequest(app, request);
      assert.equal(response.status, 401);
      assert.deepEqual(response.json(), { error: 'Ogiltig eller saknad inloggning' });
    });
  }
});
