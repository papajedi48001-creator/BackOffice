import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_BASE_URL || !process.env.R0_E2E_PASSWORD, 'requires a seeded R0 environment and password');

async function signIn(page: import('@playwright/test').Page, username: string, password: string) {
  const response = await page.request.post('/api/auth/local', { data: { username, password } });
  expect(response.ok()).toBeTruthy();
  const cookie = response.headers()['set-cookie']?.match(/backoffice_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error('SESSION_COOKIE_MISSING');
  await page.context().addCookies([{ name: 'backoffice_session', value: cookie, url: process.env.E2E_BASE_URL! }]);
}

test('requestor submits and approver approves a request with Thai status labels', async ({ page }) => {
  const password = process.env.R0_E2E_PASSWORD!;
  const organizationId = '00000000-0000-4000-8000-000000000001';
  await signIn(page, 'r0-e2e-requestor', password);
  let response = await page.request.post('/api/requests', { data: { moduleCode: 'maintenance', organizationId } });
  expect(response.status()).toBe(201);
  const request = await response.json() as { id: string };
  await signIn(page, 'r0-e2e-approver', password);

  await page.goto(`/requests/${request.id}`);
  await expect(page.getByText('รอพิจารณา')).toBeVisible();
  await page.getByRole('button', { name: 'อนุมัติคำขอ' }).click();
  await expect(page.getByText('อนุมัติแล้ว')).toBeVisible();
});
