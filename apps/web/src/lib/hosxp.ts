import { connectionSecretBoxFrom, HolidaySyncService, HosxpSettingsService, readHosxpHolidays } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { readRuntimeValue } from './runtime-env';

/** HOSxP settings with the password sealed under CONNECTION_SECRET_KEY; HOSXP_DATABASE_URL is the fallback. */
export const hosxpSettings = (database: Database) => new HosxpSettingsService(database, connectionSecretBoxFrom(readRuntimeValue('CONNECTION_SECRET_KEY')), readRuntimeValue);
/** ดึงวันหยุดจาก HOSxP now (read-only SELECT on `holiday`). */
export const holidaySync = (database: Database) => { const settings = hosxpSettings(database); return new HolidaySyncService(database, () => settings.resolve(), readHosxpHolidays); };
