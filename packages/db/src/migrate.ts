import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './client.ts';

const migrations = ['0000_r0_foundation.sql', '0001_in_app_notifications.sql', '0002_outbox_retry.sql', '0003_session_and_login_throttle.sql', '0004_hr_master_data.sql', '0005_room_booking.sql', '0006_notification_module.sql', '0007_request_cancellation.sql', '0009_hr_command_chain.sql', '0010_hr_staff_profile.sql', '0008_inventory.sql', '0011_leave.sql', '0012_leave_type_gender.sql', '0013_official_travel.sql', '0014_official_travel_report.sql', '0015_attachment_filename.sql', '0016_fleet.sql', '0017_organization_soft_delete.sql'];

export async function runMigrations(db: Database): Promise<void> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migration (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL)');
  for (const version of migrations) {
    const applied = await db.query<{ version: string }>('SELECT version FROM schema_migration WHERE version = ? LIMIT 1', [version]);
    if (applied.length > 0) continue;
    const migration = await readFile(resolve(import.meta.dirname, `../migrations/${version}`), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) await db.execute(statement);
    // Every statement is idempotent (IF NOT EXISTS), so a runner that lost the race to record a version only skips the row.
    await db.execute('INSERT IGNORE INTO schema_migration (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [version]);
  }
}
