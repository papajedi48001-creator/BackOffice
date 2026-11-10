// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(),
  open: vi.fn(), close: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn(), updateResponder: vi.fn(), createPatient: vi.fn(), updatePatient: vi.fn(),
  saveZone: vi.fn(), saveTriageLevel: vi.fn(), saveStatus: vi.fn(), saveProfession: vi.fn(), saveRules: vi.fn(), saveContact: vi.fn(),
  publicBoard: vi.fn(), exportIncident: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  MciIncidentService: class { open = mocks.open; close = mocks.close; },
  MciResponderService: class { checkIn = mocks.checkIn; checkOut = mocks.checkOut; update = mocks.updateResponder; },
  MciPatientService: class { create = mocks.createPatient; update = mocks.updatePatient; },
  MciSettingsService: class { saveZone = mocks.saveZone; saveTriageLevel = mocks.saveTriageLevel; saveStatus = mocks.saveStatus; saveProfession = mocks.saveProfession; saveRules = mocks.saveRules; saveContact = mocks.saveContact; },
  MciQueries: class { publicBoard = mocks.publicBoard; },
  exportIncident: mocks.exportIncident
}));

import { GET as BOARD } from './board/route';
import { POST as OPEN } from './incidents/route';
import { POST as CLOSE } from './incidents/[id]/closure/route';
import { GET as EXPORT } from './incidents/[id]/export/route';
import { POST as CHECK_IN } from './check-in/route';
import { PATCH as UPDATE_RESPONDER } from './responders/[id]/route';
import { POST as CHECK_OUT } from './responders/[id]/check-out/route';
import { POST as ADD_PATIENT } from './patients/route';
import { PUT as EDIT_PATIENT } from './patients/[id]/route';
import { POST as ADD_SETTING } from './settings/[kind]/route';
import { PUT as EDIT_SETTING } from './settings/[kind]/[id]/route';
import { PUT as RULES } from './settings/rules/route';
import { PUT as CONTACT } from './settings/contact/route';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const manager = { authenticated: true, personId: 'person-m', roles: [{ name: 'mci-manager', organizationId: null }], dataOwnerModules: [] };
const opening = { title: 'รถบัสคว่ำ', kind: 'REAL', occurredAt: '2026-11-10T03:00:00.000Z', notify: { mode: 'ALL', professionIds: [] } };
const patient = { triageLevelId: uuid, statusId: uuid, zoneId: uuid, firstName: 'สมชาย' };
const json = (method: string, value: unknown = {}, target = 'http://localhost/api/mci/x') => new Request(target, { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const id = params({ id: 'id-1' });
const ready = (session: object | null = staff) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.resetAllMocks());

describe('GET /api/mci/board', () => {
  it('answers anyone without a session and is never cached', async () => {
    ready(null);
    mocks.publicBoard.mockResolvedValueOnce({ incident: null, total: 0 });
    const response = await BOARD();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ incident: null, total: 0 });
    expect(mocks.readSession).not.toHaveBeenCalled();
  });
  it('answers 503 without a database', async () => {
    mocks.getSharedDatabase.mockReturnValue(null);
    expect((await BOARD()).status).toBe(503);
  });
});

describe('signed out', () => {
  it('answers 401 on every write', async () => {
    ready(null);
    for (const response of [await OPEN(json('POST', opening)), await CHECK_IN(json('POST', { professionId: uuid })), await ADD_PATIENT(json('POST', patient)), await CHECK_OUT(json('POST'), id), await RULES(json('PUT', { rules: [] }))]) expect(response.status).toBe(401);
  });
});

describe('commander-only actions', () => {
  it('refuses staff and lets the ผู้จัดการอุบัติเหตุหมู่ open, close, export and change settings', async () => {
    ready(staff);
    expect((await OPEN(json('POST', opening))).status).toBe(403);
    expect((await CLOSE(json('POST'), id)).status).toBe(403);
    expect((await EXPORT(new Request('http://localhost/api/mci/incidents/id-1/export?kind=patients'), id)).status).toBe(403);
    expect((await ADD_SETTING(json('POST', { name: 'จุดใหม่', sortOrder: 9, isActive: true }), params({ kind: 'zones' }))).status).toBe(403);
    expect((await CONTACT(json('PUT', { publicContactPhone: '1' }))).status).toBe(403);
    expect(mocks.open).not.toHaveBeenCalled();

    ready(manager);
    mocks.open.mockResolvedValueOnce({ ok: true, incidentId: 'i-1' }).mockResolvedValueOnce({ ok: false, code: 'INCIDENT_ALREADY_OPEN' });
    const opened = await OPEN(json('POST', opening));
    expect(opened.status).toBe(201);
    expect(mocks.open).toHaveBeenCalledWith('person-m', { ...opening, location: '' });
    expect((await OPEN(json('POST', opening))).status).toBe(409);
    mocks.close.mockResolvedValueOnce({ ok: true });
    expect((await CLOSE(json('POST'), id)).status).toBe(200);
    expect(mocks.close).toHaveBeenCalledWith('person-m', 'id-1');
  });

  it('downloads the CSV of a closed เหตุ and refuses an unknown kind', async () => {
    ready(manager);
    mocks.exportIncident.mockResolvedValueOnce({ ok: true, csv: '﻿"a"\r\n', title: 'รถบัสคว่ำ' });
    const response = await EXPORT(new Request('http://localhost/api/mci/incidents/id-1/export?kind=patients'), id);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="mci-id-1-patients.csv"');
    expect((await EXPORT(new Request('http://localhost/api/mci/incidents/id-1/export?kind=all'), id)).status).toBe(400);
  });

  it('routes each settings kind to its save and rejects an unknown kind', async () => {
    ready(manager);
    mocks.saveZone.mockResolvedValue({ ok: true, id: 'z' });
    mocks.saveTriageLevel.mockResolvedValue({ ok: false, code: 'PROTECTED' });
    expect((await ADD_SETTING(json('POST', { name: 'จุดใหม่', sortOrder: 9, isActive: true }), params({ kind: 'zones' }))).status).toBe(201);
    expect(mocks.saveZone).toHaveBeenCalledWith('person-m', null, { name: 'จุดใหม่', sortOrder: 9, isActive: true });
    expect((await EDIT_SETTING(json('PUT', { name: 'ดำ', colorHex: '#111827', sortOrder: 4, isActive: false }), params({ kind: 'triage', id: 'black' }))).status).toBe(409);
    expect((await ADD_SETTING(json('POST', {}), params({ kind: 'secrets' }))).status).toBe(404);
  });
});

describe('check-in, staffing and casualties', () => {
  it('checks in as the session person and maps conflicts', async () => {
    ready(staff);
    mocks.checkIn.mockResolvedValueOnce({ ok: true, responderId: 'r', zoneId: null, commandRole: 'STAFF' }).mockResolvedValueOnce({ ok: false, code: 'NO_OPEN_INCIDENT' });
    expect((await CHECK_IN(json('POST', { professionId: uuid }))).status).toBe(200);
    expect(mocks.checkIn).toHaveBeenCalledWith(staff, { professionId: uuid });
    expect((await CHECK_IN(json('POST', { professionId: uuid }))).status).toBe(409);
    expect((await CHECK_IN(json('POST', { professionId: uuid, personId: 'person-z' }))).status).toBe(400);
  });

  it('passes staffing changes through and maps FORBIDDEN to 403', async () => {
    ready(staff);
    mocks.updateResponder.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await UPDATE_RESPONDER(json('PATCH', { zoneId: null, commandRole: 'COMMANDER' }), id)).status).toBe(403);
    mocks.checkOut.mockResolvedValueOnce({ ok: false, code: 'ALREADY_OUT' });
    expect((await CHECK_OUT(json('POST'), id)).status).toBe(409);
  });

  it('records and edits casualties, answering invalid input with field names only', async () => {
    ready(staff);
    mocks.createPatient.mockResolvedValueOnce({ ok: true, patientId: 'p', tag: 'MCI-001' });
    const created = await ADD_PATIENT(json('POST', { triageLevelId: uuid, zoneId: uuid }));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ ok: true, patientId: 'p', tag: 'MCI-001' });
    const invalid = await EDIT_PATIENT(json('PUT', { ...patient, hn: 'x'.repeat(30) }), id);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'invalid_input', fields: ['hn'] });
    mocks.updatePatient.mockResolvedValueOnce({ ok: false, code: 'DESTINATION_REQUIRED' });
    expect((await EDIT_PATIENT(json('PUT', patient), id)).status).toBe(400);
  });
});
