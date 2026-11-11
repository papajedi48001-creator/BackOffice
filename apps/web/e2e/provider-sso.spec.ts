import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

// Runs against a seeded R0 environment whose web server was started with
// PROVIDER_ID_HEALTH_URL=PROVIDER_ID_API_URL=http://127.0.0.1:<E2E_PROVIDER_STUB_PORT>, PROVIDER_ID_HEALTH_CLIENT_ID=e2e-health,
// PROVIDER_ID_CLIENT_ID=e2e-provider, PROVIDER_ID_HEALTH_CLIENT_SECRET=PROVIDER_ID_SECRET_KEY=<E2E_PROVIDER_SECRET>
// and PROVIDER_ID_REDIRECT_URI=<E2E_BASE_URL>/api/auth/provider/callback.
// This file plays MOPH ID and Provider ID: every sign-in comes back as `stub.subject`.
const port = Number(process.env.E2E_PROVIDER_STUB_PORT);
const secret = process.env.E2E_PROVIDER_SECRET ?? '';
test.skip(!process.env.E2E_BASE_URL || !process.env.R0_E2E_PASSWORD || !port || !secret, 'requires a seeded R0 environment started with the Provider ID stub settings');

const base = `http://127.0.0.1:${port}`;
const stub = { subject: '', firstname: '', lastname: '' };
const codes = new Map<string, { subject: string; firstname: string; lastname: string }>();
const tokens = new Map<string, { subject: string; firstname: string; lastname: string }>();
const json = (response: import('node:http').ServerResponse, status: number, body: unknown) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

test.describe.configure({ mode: 'serial' });

let server: Server;
test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', base);
    if (url.pathname === '/oauth/redirect') {
      const code = randomUUID();
      codes.set(code, { ...stub });
      const target = new URL(url.searchParams.get('redirect_uri') ?? '');
      target.search = new URLSearchParams({ code, state: url.searchParams.get('state') ?? '' }).toString();
      response.writeHead(303, { location: target.toString() }).end();
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (url.pathname === '/api/v1/token') {
        const form = new URLSearchParams(body);
        const grant = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        if (form.get('client_id') !== 'e2e-health' || form.get('client_secret') !== secret || !grant) { json(response, 400, { message: 'invalid code' }); return; }
        const token = randomUUID();
        tokens.set(token, grant);
        json(response, 200, { access_token: token });
        return;
      }
      if (url.pathname === '/api/v1/services/token') {
        const input = JSON.parse(body || '{}') as Record<string, string>;
        const grant = tokens.get(input.token ?? '');
        if (input.client_id !== 'e2e-provider' || input.secret_key !== secret || !grant) { json(response, 401, { message: 'unauthorized' }); return; }
        const token = randomUUID();
        tokens.set(token, grant);
        json(response, 200, { status: 200, data: { access_token: token } });
        return;
      }
      if (url.pathname === '/api/v1/services/profile') {
        const grant = tokens.get((request.headers.authorization ?? '').replace(/^Bearer /, ''));
        if (!grant || request.headers['secret-key'] !== secret) { json(response, 401, { message: 'unauthorized' }); return; }
        json(response, 200, { status: 200, data: { account_id: grant.subject, firstname_th: grant.firstname, lastname_th: grant.lastname, hash_cid: 'f'.repeat(64) } });
        return;
      }
      response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('a Provider ID login that matches no บุคลากร national ID waits for the admin', async ({ page }) => {
  // The stub's hash_cid matches no seeded national ID, so nobody is linked automatically.
  stub.subject = `e2e-member-${randomUUID()}`;
  stub.firstname = 'ผู้ทดสอบ';
  stub.lastname = 'Provider ID';
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' }).click();
  await expect(page).toHaveURL(/\/link-provider$/);
  await expect(page.getByRole('heading', { name: 'ผูกบัญชี Provider ID' })).toBeVisible();
  await expect(page.getByText('ผู้ทดสอบ Provider ID', { exact: true })).toBeVisible();
  await expect(page.getByText(/ติดต่อผู้ดูแลระบบ/).first()).toBeVisible();
  await expect(page.getByLabel('รหัสผ่าน')).toHaveCount(0);
});

test('a forged callback goes back to the sign-in page with a Thai message', async ({ page }) => {
  await page.goto('/api/auth/provider/callback?code=forged&state=forged');
  await expect(page.getByRole('alert').filter({ hasText: 'เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
});
