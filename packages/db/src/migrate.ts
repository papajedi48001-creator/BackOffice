import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './client.ts';

export const migrationVersions: readonly string[] = ['0000_r0_foundation.sql', '0001_in_app_notifications.sql', '0002_outbox_retry.sql', '0003_session_and_login_throttle.sql', '0004_hr_master_data.sql', '0005_room_booking.sql', '0006_notification_module.sql', '0007_request_cancellation.sql', '0009_hr_command_chain.sql', '0010_hr_staff_profile.sql', '0008_inventory.sql', '0011_leave.sql', '0012_leave_type_gender.sql', '0013_official_travel.sql', '0014_official_travel_report.sql', '0015_attachment_filename.sql', '0016_fleet.sql', '0017_person_photo.sql', '0018_organization_soft_delete.sql', '0019_hr_position.sql', '0020_admin_module.sql', '0021_module_mode.sql', '0022_hr_kp7_family.sql', '0023_hr_kp7_service_education.sql', '0024_hr_kp7_position_history.sql', '0025_local_account_must_change_password.sql', '0026_support_chat.sql', '0027_room_booking_request.sql', '0028_line_alert.sql', '0029_active_role.sql'];

/** Runs every migration not yet recorded and returns the versions it ran. */
export async function runMigrations(db: Database, options: { migrationsDir?: string } = {}): Promise<string[]> {
  const directory = options.migrationsDir ?? resolve(import.meta.dirname, '../migrations');
  const ran: string[] = [];
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migration (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL)');
  for (const version of migrationVersions) {
    const applied = await db.query<{ version: string }>('SELECT version FROM schema_migration WHERE version = ? LIMIT 1', [version]);
    if (applied.length > 0) continue;
    const migration = await readFile(resolve(directory, version), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) await db.execute(statement);
    // Every statement is idempotent (IF NOT EXISTS), so a runner that lost the race to record a version only skips the row.
    await db.execute('INSERT IGNORE INTO schema_migration (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [version]);
    ran.push(version);
  }
  return ran;
}

/** Versions not yet recorded. Only reads, so a database user without CREATE can ask before deciding to migrate. */
export async function pendingMigrations(db: Pick<Database, 'query'>): Promise<string[]> {
  const table = await db.query<{ present: number }>("SELECT 1 AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migration' LIMIT 1");
  if (table.length === 0) return [...migrationVersions];
  const applied = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migration')).map((row) => row.version));
  return migrationVersions.filter((version) => !applied.has(version));
}
