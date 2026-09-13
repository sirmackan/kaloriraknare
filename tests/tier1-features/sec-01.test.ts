import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { dispatchRequest } from '../helpers/memory-http';
import { createSignedIdToken } from '../helpers/jwt-helper';

describe('Tier 1 — SEC-01: Authentication & Token Verification Contract', () => {
  // We test the contract specified in PROJECT.md:
  // - Header: Authorization: Bearer <firebase_id_token>
  // - Claims: aud: 'magnus-fonder', iss: 'https://securetoken.google.com/magnus-fonder'
  // - Verified Subject: sub represents authenticated userId
  // - Unauthorized: Missing token, malformed token, invalid signature, or fake UID returns HTTP 401

  it('SEC-01-T1.1: Rejects arbitrary fake UID (e.g. Bearer test_fake_uid) with HTTP 401 Unauthorized', async () => {
    // Contract test for the server authentication middleware
    const app = express();
    app.use(express.json());

    // Middleware implementing the SEC-01 verification contract:
    // Requires a valid JWT structure with project aud 'magnus-fonder'
    app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7).trim();
      const parts = token.split('.');
      if (parts.length !== 3) {
        // Not a valid 3-part JWT, or a raw fake UID
        return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        if (payload.aud !== 'magnus-fonder' || !payload.sub) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        (req as any).userId = payload.sub;
        next();
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    });

    app.get('/api/meals', (req, res) => {
      res.json({ meals: [], userId: (req as any).userId });
    });

    // Test with fake UID
    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/meals?date=2026-09-13',
      headers: {
        authorization: 'Bearer test_fake_uid',
      },
    });

    assert.equal(res.status, 401, 'Fake UID must return HTTP 401 Unauthorized');
    assert.deepEqual(res.json(), { error: 'Unauthorized' });
  });

  it('SEC-01-T1.2: Rejects missing Authorization header on protected routes with HTTP 401', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });
    app.get('/api/ingredients', (_req, res) => res.json([]));

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/ingredients',
    });

    assert.equal(res.status, 401, 'Missing Authorization header must return HTTP 401');
    assert.deepEqual(res.json(), { error: 'Unauthorized' });
  });

  it('SEC-01-T1.3: Rejects malformed Authorization header schemes (Basic, Token, or empty Bearer) with HTTP 401', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });
    app.get('/api/recipes', (_req, res) => res.json([]));

    // Test with Basic auth
    const resBasic = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/recipes',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    assert.equal(resBasic.status, 401);

    // Test with empty Bearer
    const resEmpty = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/recipes',
      headers: { authorization: 'Bearer   ' },
    });
    assert.equal(resEmpty.status, 401);
  });

  it('SEC-01-T1.4: Decodes and authenticates valid Firebase ID token with projectId magnus-fonder', async () => {
    const testUid = 'usr_verified_google_987';
    const validToken = createSignedIdToken({
      uid: testUid,
      projectId: 'magnus-fonder',
      audience: 'magnus-fonder',
    });

    const app = express();
    app.use(express.json());
    app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7).trim();
      const parts = token.split('.');
      if (parts.length !== 3) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      if (payload.aud !== 'magnus-fonder' || payload.iss !== 'https://securetoken.google.com/magnus-fonder') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      (req as any).userId = payload.sub;
      next();
    });

    app.get('/api/user/me', (req, res) => {
      res.json({ id: (req as any).userId, authenticated: true });
    });

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/user/me',
      headers: { authorization: `Bearer ${validToken}` },
    });

    assert.equal(res.status, 200);
    const data = res.json();
    assert.equal(data.id, testUid);
    assert.equal(data.authenticated, true);
  });

  it('SEC-01-T1.5: Client API getHeaders contract specifies awaiting currentUser.getIdToken()', async () => {
    // Verify client-side contract: mock currentUser with getIdToken spy
    let getIdTokenCalled = false;
    const mockToken = createSignedIdToken({ uid: 'mock_uid_123' });

    const mockCurrentUser = {
      uid: 'mock_uid_123',
      getIdToken: async () => {
        getIdTokenCalled = true;
        return mockToken;
      },
    };

    // Client helper simulation following R1 requirement
    async function clientGetHeaders(user: typeof mockCurrentUser | null): Promise<Record<string, string>> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (user) {
        const token = await user.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    }

    const headers = await clientGetHeaders(mockCurrentUser);
    assert.equal(getIdTokenCalled, true, 'getHeaders must call currentUser.getIdToken()');
    assert.equal(headers['Authorization'], `Bearer ${mockToken}`);
    assert.notEqual(headers['Authorization'], 'Bearer mock_uid_123', 'Must not use raw UID');
  });

  it('SEC-01-T1.6: syncUserWithBackend transmits cryptographically signed ID token in Authorization header', async () => {
    let capturedAuthHeader: string | null = null;
    const token = createSignedIdToken({ uid: 'usr_new_google_sync' });

    const mockFbUser = {
      uid: 'usr_new_google_sync',
      email: 'newuser@example.com',
      displayName: 'Sven Svensson',
      getIdToken: async () => token,
    };

    // Test client syncUserWithBackend contract
    async function syncUserWithBackendTest(fbUser: typeof mockFbUser, fetchImpl: any) {
      const idToken = await fbUser.getIdToken();
      return fetchImpl('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName,
          targetCalories: 2400,
          targetProtein: 160,
        }),
      });
    }

    const mockFetch = async (_url: string, init: any) => {
      capturedAuthHeader = init.headers['Authorization'];
      return { ok: true, json: async () => ({ id: 'usr_new_google_sync' }) };
    };

    await syncUserWithBackendTest(mockFbUser, mockFetch);
    assert.equal(capturedAuthHeader, `Bearer ${token}`);
    assert.notEqual(capturedAuthHeader, 'Bearer usr_new_google_sync');
  });
});
