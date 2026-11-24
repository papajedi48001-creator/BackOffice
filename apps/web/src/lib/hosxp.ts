import { connectionSecretBoxFrom, DentalService, HerbService, OfcService, readHerb, readOfc, readTtm, TtmService, PttypeMappingService, HolidaySyncService, HosxpSettingsService, readDentalClaims, readHosxpHolidays } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { readRuntimeValue } from './runtime-env';

/** HOSxP settings with the password sealed under CONNECTION_SECRET_KEY; HOSXP_DATABASE_URL is the fallback. */
export const hosxpSettings = (database: Database) => new HosxpSettingsService(database, connectionSecretBoxFrom(readRuntimeValue('CONNECTION_SECRET_KEY')), readRuntimeValue);
/** ดึงวันหยุดจาก HOSxP now (read-only SELECT on `holiday`). */
export const holidaySync = (database: Database) => { const settings = hosxpSettings(database); return new HolidaySyncService(database, () => settings.resolve(), readHosxpHolidays); };
/** ลูกหนี้ทันตกรรม read live from HOSxP over the same connection (read-only SELECT). */
export const dentalService = (database: Database) => { const settings = hosxpSettings(database); return new DentalService(() => settings.resolve(), readDentalClaims); };
/** Mapping สิทธิ: reads and writes `paccountopd`/`paccountipd` in HOSxP over the same connection; who changed what is audited here. */
export const pttypeMappingService = (database: Database) => { const settings = hosxpSettings(database); return new PttypeMappingService(database, () => settings.resolve()); };
/** งานแพทย์แผนไทย read live from HOSxP over the same connection, in a READ ONLY transaction. */
export const ttmService = (database: Database) => { const settings = hosxpSettings(database); return new TtmService(() => settings.resolve(), readTtm); };
/** การจ่ายยาสมุนไพร read live from HOSxP over the same connection, in a READ ONLY transaction. */
export const herbService = (database: Database) => { const settings = hosxpSettings(database); return new HerbService(() => settings.resolve(), readHerb); };
/** Monitor Instrument OFC: visits read live from HOSxP (READ ONLY) matched to the stored OFC REP and Statement. */
export const ofcService = (database: Database) => { const settings = hosxpSettings(database); return new OfcService(database, () => settings.resolve(), readOfc); };
