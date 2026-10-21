import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { seedLocalDemo } from './local-demo-seed';

// Fills a developer's local database with synthetic units, people and accounts. Never point it at production.
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const database = createDatabase(required('DATABASE_URL'));
try {
  await runMigrations(database);
  const password = process.env.DEMO_PASSWORD?.trim() || 'demo-password-2569';
  const result = await seedLocalDemo(database, new NationalIdProtector(required('NATIONAL_ID_ENCRYPTION_KEY'), required('NATIONAL_ID_LOOKUP_KEY')), { password });
  console.log(result.accountsCreated ? `Created demo accounts: ${result.usernames.join(', ')}` : 'Demo accounts already exist.');
} finally {
  await database.close();
}
