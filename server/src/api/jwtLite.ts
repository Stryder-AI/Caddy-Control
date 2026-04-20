/**
 * Minimal HS256 JWT verifier so the Socket.io middleware can validate
 * tokens without pulling in a second JWT library (Fastify handles the
 * sign/verify for HTTP routes; this verifies tokens handed via WS handshake).
 */

import crypto from 'node:crypto';
import { config } from '../util/config.js';

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sign(payload: Record<string, unknown>, expiresInSec = 60 * 60 * 24 * 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(body)));
  const sig = b64url(
    crypto.createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest()
  );
  return `${h}.${p}.${sig}`;
}

export function verify(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [h, p, s] = parts;
  const expected = b64url(
    crypto.createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest()
  );
  if (expected !== s) throw new Error('bad signature');
  const payload = JSON.parse(b64urlDecode(p!).toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('expired');
  return payload;
}
