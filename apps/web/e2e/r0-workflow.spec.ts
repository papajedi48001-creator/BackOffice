import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_BASE_URL, 'requires a seeded R0 environment');

test('requestor submits and approver approves a request with Thai status labels', async ({ page }) => {
  await page.goto(`${process.env.E2E_BASE_URL}/requests/request-demo`);
  await expect(page.getByText('รอพิจารณา')).toBeVisible();
  await page.getByRole('button', { name: 'อนุมัติคำขอ' }).click();
  await expect(page.getByText('อนุมัติแล้ว')).toBeVisible();
});
