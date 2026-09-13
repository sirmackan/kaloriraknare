import crypto from 'node:crypto';

// In-memory keypair for realistic RS256 token generation
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const defaultProjectId = 'magnus-fonder';

export function getPublicKeyPem(): string {
  return publicKey.export({ type: 'spki', format: 'pem' }) as string;
}

export function base64UrlEncode(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export interface TokenOptions {
  uid?: string;
  email?: string;
  projectId?: string;
  expiresInSeconds?: number;
  issuedAtOffsetSeconds?: number;
  audience?: string;
  issuer?: string;
  kid?: string;
  tamperSignature?: boolean;
}

export function createSignedIdToken(options: TokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const uid = options.uid || 'test-user-123';
  const projectId = options.projectId || defaultProjectId;
  const iat = now + (options.issuedAtOffsetSeconds || 0);
  const exp = now + (options.expiresInSeconds !== undefined ? options.expiresInSeconds : 3600);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: options.kid || 'test-key-id-1',
  };

  const payload = {
    iss: options.issuer || `https://securetoken.google.com/${projectId}`,
    aud: options.audience || projectId,
    auth_time: iat,
    user_id: uid,
    sub: uid,
    iat,
    exp,
    email: options.email || `${uid}@example.com`,
    email_verified: true,
    firebase: {
      identities: {
        email: [options.email || `${uid}@example.com`],
      },
      sign_in_provider: 'google.com',
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(dataToSign);
  signer.end();
  let signature = signer.sign(privateKey);

  if (options.tamperSignature) {
    // Corrupt the signature buffer
    signature = Buffer.from(signature);
    signature[0] = signature[0] ^ 0xff;
  }

  const encodedSignature = base64UrlEncode(signature);
  return `${dataToSign}.${encodedSignature}`;
}

export function createExpiredIdToken(uid = 'test-user-123'): string {
  return createSignedIdToken({
    uid,
    expiresInSeconds: -3600, // expired 1 hour ago
    issuedAtOffsetSeconds: -7200,
  });
}

export function createClockSkewedIdToken(uid = 'test-user-123'): string {
  return createSignedIdToken({
    uid,
    issuedAtOffsetSeconds: 7200, // issued 2 hours in the future
    expiresInSeconds: 10800,
  });
}

export function createWrongAudienceIdToken(uid = 'test-user-123'): string {
  return createSignedIdToken({
    uid,
    audience: 'wrong-project-id-678',
  });
}

export function createWrongIssuerIdToken(uid = 'test-user-123'): string {
  return createSignedIdToken({
    uid,
    issuer: 'https://securetoken.google.com/attacker-project',
  });
}

export function createForgedKeyToken(uid = 'test-user-123'): string {
  // Signed with a different, untrusted private key
  const { privateKey: rogueKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: 'rogue-key' };
  const payload = {
    iss: `https://securetoken.google.com/${defaultProjectId}`,
    aud: defaultProjectId,
    sub: uid,
    iat: now,
    exp: now + 3600,
  };
  const encH = base64UrlEncode(JSON.stringify(header));
  const encP = base64UrlEncode(JSON.stringify(payload));
  const data = `${encH}.${encP}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const sig = signer.sign(rogueKey);
  return `${data}.${base64UrlEncode(sig)}`;
}
