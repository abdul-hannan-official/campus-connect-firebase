/**
 * Executable Automated Test Suite — Campus Connect (Modules 1–8)
 *
 * Runs with: npm test (tsx tests/campus-connect.test.ts)
 * Covers:
 *  1. Input validation, XSS/URL guards, slugification, and schema limits
 *  2. Static security invariant verification of firestore.rules vs firebase-blueprint.json
 *  3. Express Firebase ID Token cryptographic verifier rejection cases
 *  4. Live HTTP API verification against http://localhost:3000 (when running)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEPARTMENT_ADMIN_ACCOUNTS,
  getBootstrapAdminSpec,
  parseAndValidateClubSlugs,
  sanitizeBio,
  sanitizeDisplayName,
  sanitizePhotoURL,
  sanitizeStudentId,
  SCHEMA_LIMITS,
  slugifyClubName,
  validateHttpsUrl,
} from '../src/lib/validation.ts';
import { verifyIdTokenString } from '../src/server/middleware/verifyFirebaseToken.ts';

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: TestCase[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function encodeB64Url(obj: object): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ============================================================================
// 1. Validation & Sanitization Tests
// ============================================================================

test('validateHttpsUrl accepts empty string and valid HTTPS URLs', () => {
  assert.deepEqual(validateHttpsUrl(''), { valid: true, value: '', error: null });
  assert.deepEqual(validateHttpsUrl('   '), { valid: true, value: '', error: null });
  const ok = validateHttpsUrl('https://cs.university.edu/syllabus.pdf');
  assert.equal(ok.valid, true);
  assert.equal(ok.value, 'https://cs.university.edu/syllabus.pdf');
});

test('validateHttpsUrl rejects javascript:, data:, and http:// URLs (XSS guard)', () => {
  assert.equal(validateHttpsUrl('javascript:alert(1)').valid, false);
  assert.equal(validateHttpsUrl('data:text/html,<script>alert(1)</script>').valid, false);
  assert.equal(validateHttpsUrl('http://insecure.example.com').valid, false);
  assert.equal(validateHttpsUrl('https://' + 'a'.repeat(SCHEMA_LIMITS.URL_MAX + 5)).valid, false);
});

test('slugifyClubName produces Firestore-safe lowercase slugs', () => {
  assert.equal(slugifyClubName('AI & Machine Learning Club!'), 'ai-machine-learning-club');
  assert.equal(slugifyClubName('  ---Systems_Lab 2026--- '), 'systems-lab-2026');
  assert.equal(slugifyClubName('CS'), 'cs');
});

test('parseAndValidateClubSlugs enforces regex, deduplication, and max 10 clubs', () => {
  const ok = parseAndValidateClubSlugs('ai-research, systems-lab, ai-research');
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.slugs, ['ai-research', 'systems-lab']);

  const badSlug = parseAndValidateClubSlugs('ai-research, ../hack');
  assert.equal(badSlug.valid, false);

  const tooMany = parseAndValidateClubSlugs(
    Array.from({ length: 11 }, (_, i) => `club-${i + 1}`).join(',')
  );
  assert.equal(tooMany.valid, false);
});

test('sanitizers enforce length bounds and safe defaults', () => {
  assert.equal(sanitizeDisplayName(' '), 'CS Member');
  assert.equal(sanitizeDisplayName('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(sanitizePhotoURL('javascript:alert(1)'), '');
  assert.equal(
    sanitizePhotoURL('https://lh3.googleusercontent.com/avatar.png'),
    'https://lh3.googleusercontent.com/avatar.png'
  );
  assert.equal(sanitizeStudentId('cs-2026!@#01'), 'CS-202601');
  assert.equal(sanitizeBio('x'.repeat(400)).length, SCHEMA_LIMITS.BIO_MAX);
});

test('getBootstrapAdminSpec resolves HOD, Head CR, Head GR, and verified primary admin', () => {
  assert.equal(DEPARTMENT_ADMIN_ACCOUNTS.length, 4);

  const hod = getBootstrapAdminSpec('hodcs@uos.edu.pk', false);
  assert.ok(hod);
  assert.equal(hod.adminTitle, 'HOD');

  const headCr = getBootstrapAdminSpec('CSHEADCR@UOS.EDU.PK', false);
  assert.ok(headCr);
  assert.equal(headCr.adminTitle, 'Head CR');

  const headGr = getBootstrapAdminSpec('csheadgr@uos.edu.pk', true);
  assert.ok(headGr);
  assert.equal(headGr.adminTitle, 'Head GR');

  // Primary Gmail bootstrap admin requires verified email
  assert.equal(getBootstrapAdminSpec('apexorasolution@gmail.com', false), null);
  const verifiedPrimary = getBootstrapAdminSpec('apexorasolution@gmail.com', true);
  assert.ok(verifiedPrimary);
  assert.equal(verifiedPrimary.adminTitle, 'HOD');

  // Regular students must not receive admin bootstrap spec
  assert.equal(getBootstrapAdminSpec('student@uos.edu.pk', true), null);
});

// ============================================================================
// 2. Static Firestore Security Rules & Blueprint Invariant Verification
// ============================================================================

test('firebase-blueprint.json defines all 16 required collections', () => {
  const blueprintRaw = fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8');
  const blueprint = JSON.parse(blueprintRaw) as {
    firestore: Record<string, unknown>;
  };

  const expectedPaths = [
    '/users/{userId}',
    '/profiles/{userId}',
    '/admins/{userId}',
    '/moderators/{userId}',
    '/clubs/{clubId}',
    '/clubMemberships/{membershipId}',
    '/clubRequests/{requestId}',
    '/posts/{postId}',
    '/comments/{commentId}',
    '/votes/{voteId}',
    '/bookmarks/{bookmarkId}',
    '/announcements/{announcementId}',
    '/events/{eventId}',
    '/notifications/{notificationId}',
    '/reports/{reportId}',
    '/activityLogs/{logId}',
  ];

  for (const p of expectedPaths) {
    assert.ok(blueprint.firestore[p], `Missing blueprint collection path: ${p}`);
  }
});

test('firestore.rules covers all 16 collections with zero blanket allows and strict guards', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');

  // Must not contain any blanket read/write allow; any catch-all must explicitly deny
  assert.equal(/allow\s+read\s*:\s*if\s+true/i.test(rules), false);
  assert.equal(/allow\s+write\s*:\s*if\s+true/i.test(rules), false);
  assert.ok(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/.test(rules));

  // Must enforce email_verified
  assert.ok(rules.includes('request.auth.token.email_verified == true'));

  // Must check all 10 array indices (0..9) in list validators
  for (let idx = 0; idx < 10; idx++) {
    assert.ok(
      rules.includes(`listVal.size() <= ${idx} || isValidClubSlug(listVal[${idx}])`),
      `Missing club slug array index check for index ${idx}`
    );
    assert.ok(
      rules.includes(`listVal.size() <= ${idx} || isValidId(listVal[${idx}])`),
      `Missing UID array index check for index ${idx}`
    );
  }

  // Must lock users, admins, moderators from listing
  assert.ok(rules.includes('match /users/{userId}'));
  assert.ok(rules.includes('allow list: if false;'));

  // Must enforce atomic club membership and vote checks
  assert.ok(rules.includes('existsAfter(/databases/$(database)/documents/clubMemberships/'));
  assert.ok(rules.includes('getAfter(/databases/$(database)/documents/votes/'));

  // Must keep activityLogs immutable
  assert.ok(/match \/activityLogs\/\{logId\}[\s\S]*allow update: if false;[\s\S]*allow delete: if false;/.test(rules));

  // Must support password provider and pre-configured UOS department admin accounts
  assert.ok(rules.includes("sign_in_provider == 'password'"));
  assert.ok(rules.includes('hodcs@uos.edu.pk'));
  assert.ok(rules.includes('csheadcr@uos.edu.pk'));
  assert.ok(rules.includes('csheadgr@uos.edu.pk'));
  assert.ok(rules.includes('function bootstrapAdminTitle()'));
});

test('firestore.indexes.json is valid JSON with composite indexes', () => {
  const raw = fs.readFileSync(path.resolve('firestore.indexes.json'), 'utf8');
  const parsed = JSON.parse(raw) as { indexes: unknown[] };
  assert.ok(Array.isArray(parsed.indexes));
  assert.ok(parsed.indexes.length >= 4);
});

// ============================================================================
// 3. Express Firebase ID Token Verifier Negative Security Tests
// ============================================================================

test('verifyIdTokenString rejects malformed, alg:none, wrong-aud, expired, and unverified tokens', async () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve('firebase-applet-config.json'), 'utf8')
  ) as { projectId: string };
  const nowSec = Math.floor(Date.now() / 1000);

  // Malformed
  await assert.rejects(() => verifyIdTokenString('not-a-jwt'), /Malformed/);

  // alg: none attack
  const noneToken = `${encodeB64Url({ alg: 'none', kid: 'k1' })}.${encodeB64Url({
    aud: config.projectId,
    iss: `https://securetoken.google.com/${config.projectId}`,
    sub: 'uid-1',
    exp: nowSec + 3600,
    iat: nowSec,
    email: 'stu@cs.edu',
    email_verified: true,
  })}.sig`;
  await assert.rejects(() => verifyIdTokenString(noneToken), /Unsupported token signing algorithm/);

  // Wrong audience
  const wrongAudToken = `${encodeB64Url({ alg: 'RS256', kid: 'k1' })}.${encodeB64Url({
    aud: 'other-project',
    iss: `https://securetoken.google.com/${config.projectId}`,
    sub: 'uid-1',
    exp: nowSec + 3600,
    iat: nowSec,
    email: 'stu@cs.edu',
    email_verified: true,
  })}.sig`;
  await assert.rejects(() => verifyIdTokenString(wrongAudToken), /audience mismatch/);

  // Expired token
  const expiredToken = `${encodeB64Url({ alg: 'RS256', kid: 'k1' })}.${encodeB64Url({
    aud: config.projectId,
    iss: `https://securetoken.google.com/${config.projectId}`,
    sub: 'uid-1',
    exp: nowSec - 60,
    iat: nowSec - 3600,
    email: 'stu@cs.edu',
    email_verified: true,
  })}.sig`;
  await assert.rejects(() => verifyIdTokenString(expiredToken), /expired/);

  // Unverified email
  const unverifiedToken = `${encodeB64Url({ alg: 'RS256', kid: 'k1' })}.${encodeB64Url({
    aud: config.projectId,
    iss: `https://securetoken.google.com/${config.projectId}`,
    sub: 'uid-1',
    exp: nowSec + 3600,
    iat: nowSec,
    email: 'stu@cs.edu',
    email_verified: false,
  })}.sig`;
  await assert.rejects(() => verifyIdTokenString(unverifiedToken), /Verified email/);
});

// ============================================================================
// 4. Live Express Server HTTP Endpoint Verification
// ============================================================================

test('Express API health, department config, and protected /api/auth/session respond as expected', async () => {
  let healthRes: Response;
  try {
    healthRes = await fetch('http://127.0.0.1:3000/api/health');
  } catch {
    console.log('  [skipped live HTTP check — dev server not listening on 127.0.0.1:3000]');
    return;
  }

  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { ok: boolean; service: string };
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.service, 'campus-connect-api');

  const configRes = await fetch('http://127.0.0.1:3000/api/department/config');
  assert.equal(configRes.status, 200);
  const configJson = (await configRes.json()) as {
    departmentCode: string;
    modules: Array<{ status: string }>;
  };
  assert.equal(configJson.departmentCode, 'CS');
  assert.ok(configJson.modules.every((m) => m.status === 'active'));

  // Protected session endpoint must reject missing and invalid tokens with 401
  const noAuthRes = await fetch('http://127.0.0.1:3000/api/auth/session');
  assert.equal(noAuthRes.status, 401);

  const badAuthRes = await fetch('http://127.0.0.1:3000/api/auth/session', {
    headers: { Authorization: 'Bearer fake.jwt.token' },
  });
  assert.equal(badAuthRes.status, 401);
});

// ============================================================================
// Runner
// ============================================================================

async function main() {
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS  ${t.name}`);
      passed++;
    } catch (error) {
      console.error(`FAIL  ${t.name}`);
      console.error(error);
      failed++;
    }
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed (${tests.length} total)`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
