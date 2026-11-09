import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

// Runs against a seeded R0 environment whose web server was started with PROVIDER_SSO_ISSUER=http://127.0.0.1:<E2E_PROVIDER_STUB_PORT>,
// PROVIDER_SSO_CLIENT_ID=backoffice, PROVIDER_SSO_CLIENT_SECRET=<E2E_PROVIDER_SECRET> and PROVIDER_SSO_REDIRECT_URI=<E2E_BASE_URL>/api/auth/provider/callback.
// This file plays the portal: a minimal OpenID provider that signs every member in as `stub.subject`.
const port = Number(process.env.E2E_PROVIDER_STUB_PORT);
const secret = process.env.E2E_PROVIDER_SECRET ?? '';
test.skip(!process.env.E2E_BASE_URL || !process.env.R0_E2E_PASSWORD || !port || !secret, 'requires a seeded R0 environment started with the Provider SSO stub settings');

const issuer = `http://127.0.0.1:${port}`;
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
// A fresh kid per run, like the portal's thumbprint kid: the web server caches JWKS for 10 minutes and must not match a previous run's key.
const kid = `stub-${randomUUID()}`;
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' };
const stub = { subject: '', name: '' };
const codes = new Map<string, { nonce: string; challenge: string; subject: string; name: string }>();
const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function idToken(claims: Record<string, unknown>): string {
  const input = `${b64(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`;
  return `${input}.${b64(sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
}

test.describe.configure({ mode: 'serial' });

let server: Server;
test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', issuer);
    if (url.pathname === '/oidc/authorize') {
      const code = randomUUID();
      codes.set(code, { nonce: url.searchParams.get('nonce') ?? '', challenge: url.searchParams.get('code_challenge') ?? '', subject: stub.subject, name: stub.name });
      const target = new URL(url.searchParams.get('redirect_uri') ?? '');
      target.search = new URLSearchParams({ code, state: url.searchParams.get('state') ?? '' }).toString();
      response.writeHead(303, { location: target.toString() }).end();
      return;
    }
    if (url.pathname === '/oidc/jwks') { response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })); return; }
    if (url.pathname === '/oidc/token') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const form = new URLSearchParams(body);
        const grant = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        const authorized = request.headers.authorization === `Basic ${Buffer.from(`backoffice:${secret}`).toString('base64')}`;
        if (!authorized) { response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_client' })); return; }
        if (!grant || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== grant.challenge) { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' })); return; }
        const now = Math.floor(Date.now() / 1000);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ token_type: 'Bearer', expires_in: 300, id_token: idToken({ iss: issuer, aud: 'backoffice', sub: grant.subject, iat: now, exp: now + 300, nonce: grant.nonce, auth_time: now, name: grant.name, preferred_username: null }) }));
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('an unlinked Provider ID login links once with the password, then signs straight in', async ({ page, context }) => {
  // A fixed subject: the first run against a fresh seed links it, and any later run finds it already linked.
  stub.subject = 'e2e-member-requestor';
  stub.name = 'ผู้ทดสอบ Provider ID';
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' }).click();
  await page.waitForURL(/\/(link-provider|dashboard)$/);
  if (page.url().endsWith('/link-provider')) {
    await expect(page.getByRole('heading', { name: 'ผูกบัญชี Provider ID' })).toBeVisible();
    await expect(page.getByText('ผู้ทดสอบ Provider ID', { exact: true })).toBeVisible();
    await page.getByLabel('ชื่อผู้ใช้').fill('r0-e2e-requestor');
    await page.getByLabel('รหัสผ่าน').fill(process.env.R0_E2E_PASSWORD!);
    await page.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/);

  await context.clearCookies();
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('a second Provider ID account cannot take a person who is already linked', async ({ page }) => {
  stub.subject = `e2e-member-${randomUUID()}`;
  stub.name = 'บัญชีที่สอง';
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' }).click();
  await expect(page.getByText('บัญชีที่สอง', { exact: true })).toBeVisible();
  await page.getByLabel('ชื่อผู้ใช้').fill('r0-e2e-requestor');
  await page.getByLabel('รหัสผ่าน').fill(process.env.R0_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'บัญชีบุคลากรนี้ผูกกับ Provider ID อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ' })).toBeVisible();
});

test('a forged callback goes back to the sign-in page with a Thai message', async ({ page }) => {
  await page.goto('/api/auth/provider/callback?code=forged&state=forged');
  await expect(page.getByRole('alert').filter({ hasText: 'เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
});
