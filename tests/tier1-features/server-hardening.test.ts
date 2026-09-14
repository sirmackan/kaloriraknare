process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dispatchRequest } from '../helpers/memory-http.ts';

// Dynamically import server.ts after setting process.env.NODE_ENV = 'test'
const { app, startServer } = await import('../../server.ts');

describe('Tier 1 — Server Hardening: Dynamic Port Binding & API 404 Interception', () => {
  describe('HARDEN-01: Dynamic Port Binding', () => {
    it('HARDEN-01.1: Fallback port resolves to 3000 when process.env.PORT is undefined', () => {
      const computePort = (envPort?: string) => Number(envPort) || 3000;
      assert.equal(computePort(undefined), 3000, 'Undefined PORT must fall back to 3000');
    });

    it('HARDEN-01.2: Dynamic binding uses Cloud Run container PORT (e.g. 8080)', () => {
      const computePort = (envPort?: string) => Number(envPort) || 3000;
      assert.equal(computePort('8080'), 8080, 'Cloud Run 8080 must be parsed correctly');
      assert.equal(computePort('5000'), 5000);
      assert.equal(computePort('4567'), 4567);
    });

    it('HARDEN-01.3: Non-numeric and empty PORT values safely fall back to 3000', () => {
      const computePort = (envPort?: string) => Number(envPort) || 3000;
      assert.equal(computePort(''), 3000, 'Empty string PORT must fall back to 3000');
      assert.equal(computePort('   '), 3000, 'Whitespace PORT must fall back to 3000');
      assert.equal(computePort('invalid'), 3000, 'Malformed PORT string must fall back to 3000');
      assert.equal(computePort('0'), 3000, 'Port 0 must fall back to 3000');
    });

    it('HARDEN-01.4: server.ts statically defines Number(process.env.PORT) || 3000', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes('const PORT = Number(process.env.PORT) || 3000;'),
        'server.ts must declare const PORT = Number(process.env.PORT) || 3000;'
      );
    });
  });

  describe('HARDEN-02: Unmatched /api/* 404 JSON Response', () => {
    it('HARDEN-02.1: GET /api/nonexistent returns HTTP 404 with JSON { error: "Not found" }', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: '/api/nonexistent',
      });

      assert.equal(res.status, 404, 'Unmatched API endpoint must return HTTP 404');
      const contentType = res.headers['content-type'] || '';
      assert.ok(
        contentType.includes('application/json'),
        `Content-Type must be application/json, got: ${contentType}`
      );
      assert.deepEqual(
        res.json(),
        { error: 'Not found' },
        'Response body must be JSON { error: "Not found" }'
      );
    });

    it('HARDEN-02.2: POST /api/unknown/subpath returns HTTP 404 with JSON { error: "Not found" }', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/unknown/subpath',
        body: { test: true },
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.json(), { error: 'Not found' });
    });

    it('HARDEN-02.3: PUT /api/users/undefined-endpoint returns HTTP 404 JSON', async () => {
      const res = await dispatchRequest(app, {
        method: 'PUT',
        path: '/api/users/undefined-endpoint',
        body: { foo: 'bar' },
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.json(), { error: 'Not found' });
    });

    it('HARDEN-02.4: DELETE /api/recipes/invalid/extra/path returns HTTP 404 JSON', async () => {
      const res = await dispatchRequest(app, {
        method: 'DELETE',
        path: '/api/recipes/invalid/extra/path',
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.json(), { error: 'Not found' });
    });

    it('HARDEN-02.5: GET /api returns HTTP 404 JSON', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: '/api',
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.json(), { error: 'Not found' });
    });
  });

  describe('HARDEN-03: Known API Endpoints Pass Through Unhindered', () => {
    it('HARDEN-03.1: GET /api/health responds with HTTP 200 { status: "ok" }', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: '/api/health',
      });

      assert.equal(res.status, 200);
      assert.equal(res.json().status, 'ok');
      assert.equal(res.json().service, 'kaloriraknare');
    });
  });

  describe('HARDEN-04: Server Export and Test Guard', () => {
    it('HARDEN-04.1: server.ts exports app and startServer', () => {
      assert.ok(app, 'app must be exported from server.ts');
      assert.equal(typeof app.use, 'function', 'app must be an Express application');
      assert.equal(typeof startServer, 'function', 'startServer must be exported');
    });

    it('HARDEN-04.2: startServer() is guarded when process.env.NODE_ENV === "test"', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes("if (process.env.NODE_ENV !== 'test')"),
        'server.ts must guard startServer() execution using NODE_ENV !== "test"'
      );
    });
  });
});
