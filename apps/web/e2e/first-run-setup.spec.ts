import { expect, test } from '@playwright/test';

// Runs against a web container started without a database URL. E2E_SETUP_CODE comes from `docker compose logs web`.
const code = process.env.E2E_SETUP_CODE;
const database = { host: process.env.E2E_SETUP_DB_HOST ?? '', user: process.env.E2E_SETUP_DB_USER ?? '', password: process.env.E2E_SETUP_DB_PASSWORD ?? '', name: process.env.E2E_SETUP_DB_NAME ?? 'backoffice' };

test.skip(!code, 'needs E2E_SETUP_CODE from a web container in setup mode');

test('first-run setup creates the first ผู้ดูแลระบบ and then closes', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('รหัส setup').fill(code!);
  await page.getByLabel('เครื่องฐานข้อมูล (host)').fill(database.host);
  await page.getByLabel('ชื่อฐานข้อมูล', { exact: true }).fill(database.name);
  await page.getByLabel('ชื่อผู้ใช้ฐานข้อมูล').fill(database.user);
  await page.getByLabel('รหัสผ่านฐานข้อมูล').fill(database.password);
  await page.getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' }).click();
  await expect(page.getByText(/เชื่อมต่อได้/)).toBeVisible();
  await page.getByLabel('ชื่อ', { exact: true }).fill('จีระศักดิ์');
  await page.getByLabel('นามสกุล').fill('หอกคำ');
  await page.getByLabel('รหัสบุคลากร').fill('IT001');
  await page.getByLabel('เลขประจำตัวประชาชน').fill('1101700230708');
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill('it001');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('long-enough-pw');
  await page.getByLabel('ยืนยันรหัสผ่าน').fill('long-enough-pw');
  await page.getByRole('button', { name: 'บันทึกและสร้างบัญชี' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill('it001');
  await page.getByRole('textbox', { name: 'รหัสผ่าน' }).fill('long-enough-pw');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/grants');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await request.get('/setup')).status()).toBe(404);
});
