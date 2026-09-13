import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { dispatchRequest } from '../helpers/memory-http';
import {
  createExpiredIdToken,
  createClockSkewedIdToken,
  createWrongAudienceIdToken,
  createWrongIssuerIdToken,
  createForgedKeyToken,
  createSignedIdToken,
  getPublicKeyPem,
} from '../helpers/jwt-helper';

describe('Tier 2 — SEC-01 Boundary: Edge Cases & Forged Token Rejections', () => {
  // Authentication handler enforcing strict JWT boundaries:
  // - Expired tokens rejected
  // - Future clock skew rejected
  // - Untrusted audience/issuer rejected
  // - Forged keys / bad signatures rejected
  // - Fake UIDs rejected
  const createAuthApp = () => {
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

      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        const now = Math.floor(Date.now() / 1000);

        // Claim validations
        if (payload.aud !== 'magnus-fonder') {
          return res.status(401).json({ error: 'Unauthorized: invalid audience' });
        }
        if (payload.iss !== 'https://securetoken.google.com/magnus-fonder') {
          return res.status(401).json({ error: 'Unauthorized: invalid issuer' });
        }
        if (payload.exp && payload.exp < now) {
          return res.status(401).json({ error: 'Unauthorized: token expired' });
        }
        if (payload.iat && payload.iat > now + 300) {
          // Clock skew > 5 min in future
          return res.status(401).json({ error: 'Unauthorized: clock skew' });
        }
        // Genuine cryptographic signature verification
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(`${parts[0]}.${parts[1]}`);
        verifier.end();
        const isValidSig = verifier.verify(
          getPublicKeyPem(),
          Buffer.from(parts[2], 'base64url')
        );

        if (!isValidSig) {
          return res.status(401).json({ error: 'Unauthorized: signature invalid' });
        }

        (req as any).userId = payload.sub;
        next();
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    });

    app.get('/api/protected', (req, res) => res.json({ ok: true, user: (req as any).userId }));
    return app;
  };

  it('SEC-01-B2.1: Rejects expired JWT with HTTP 401', async () => {
    const app = createAuthApp();
    const expiredToken = createExpiredIdToken();

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    assert.equal(res.status, 401, 'Expired token must return HTTP 401');
  });

  it('SEC-01-B2.2: Rejects token with extreme future clock skew with HTTP 401', async () => {
    const app = createAuthApp();
    const skewedToken = createClockSkewedIdToken();

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${skewedToken}` },
    });

    assert.equal(res.status, 401, 'Clock skewed token must return HTTP 401');
  });

  it('SEC-01-B2.3: Rejects token with incorrect audience with HTTP 401', async () => {
    const app = createAuthApp();
    const wrongAudToken = createWrongAudienceIdToken();

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${wrongAudToken}` },
    });

    assert.equal(res.status, 401, 'Wrong audience must return HTTP 401');
  });

  it('SEC-01-B2.4: Rejects token with incorrect issuer with HTTP 401', async () => {
    const app = createAuthApp();
    const wrongIssToken = createWrongIssuerIdToken();

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${wrongIssToken}` },
    });

    assert.equal(res.status, 401, 'Wrong issuer must return HTTP 401');
  });

  it('SEC-01-B2.5: Rejects fake UID strings (Bearer admin, Bearer ../../../etc/passwd) with HTTP 401', async () => {
    const app = createAuthApp();

    const testUids = [
      'Bearer admin',
      'Bearer mock_uid_777',
      'Bearer ../../../etc/passwd',
      'Bearer null',
      'Bearer undefined',
    ];

    for (const authVal of testUids) {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: '/api/protected',
        headers: { authorization: authVal },
      });
      assert.equal(res.status, 401, `Failed to reject fake UID header: ${authVal}`);
    }
  });

  it('SEC-01-B2.6: Rejects forged signature or tampered signature bytes with HTTP 401', async () => {
    const app = createAuthApp();
    const tamperedToken = createSignedIdToken({ tamperSignature: true });

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${tamperedToken}` },
    });

    assert.equal(res.status, 401, 'Tampered token must return HTTP 401');

    // Also test token signed with rogue/untrusted key
    const forgedKeyToken = createForgedKeyToken();
    const resForged = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${forgedKeyToken}` },
    });
    assert.equal(resForged.status, 401, 'Forged key token must return HTTP 401');
  });

  it('SEC-01-B2.7: Valid unexpired token authenticates successfully with 200', async () => {
    const app = createAuthApp();
    const validToken = createSignedIdToken({ uid: 'verified_user_999' });

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: '/api/protected',
      headers: { authorization: `Bearer ${validToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json().user, 'verified_user_999');
  });
});
