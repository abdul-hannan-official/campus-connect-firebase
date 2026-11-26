import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface FirebaseProjectConfig {
  projectId: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: VerifiedFirebaseUser;
}

let cachedProjectId: string | null = null;
let cachedCerts: Record<string, string> | null = null;
let certsExpiresAt = 0;

function getFirebaseProjectId(): string {
  if (cachedProjectId) return cachedProjectId;
  const configPath = path.resolve(__dirname, '../../../firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FirebaseProjectConfig;
  if (!parsed.projectId || typeof parsed.projectId !== 'string') {
    throw new Error('Firebase projectId is missing in firebase-applet-config.json');
  }
  cachedProjectId = parsed.projectId;
  return cachedProjectId;
}

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < certsExpiresAt) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (${res.status})`);
  }

  const cacheControl = res.headers.get('cache-control') ?? '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  cachedCerts = (await res.json()) as Record<string, string>;
  certsExpiresAt = now + Math.max(60, maxAgeSeconds) * 1000;
  return cachedCerts;
}

export async function verifyIdTokenString(token: string): Promise<VerifiedFirebaseUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed bearer token');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    firebase?: { sign_in_provider?: string };
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token signing algorithm or missing key id');
  }

  const projectId = getFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Token audience mismatch');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Token issuer mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Token expired');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token issued-at timestamp invalid');
  }
  const isPasswordProvider = payload.firebase?.sign_in_provider === 'password';
  if (!payload.email || (payload.email_verified !== true && !isPasswordProvider)) {
    throw new Error('Verified email is required');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown token signing key');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = base64UrlDecode(signatureB64);
  if (!verifier.verify(cert, signature)) {
    throw new Error('Invalid token signature');
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: true,
  };
}

export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization Bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token.length > 8192) {
    res.status(401).json({ error: 'Invalid Bearer token length' });
    return;
  }

  try {
    req.authUser = await verifyIdTokenString(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: invalid or expired Firebase ID token' });
  }
}
