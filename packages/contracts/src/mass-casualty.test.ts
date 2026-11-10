import { describe, expect, it } from 'vitest';
import { mciCheckInInputSchema, mciLineBroadcastPayloadSchema, mciNewPatientInputSchema, mciOpenIncidentInputSchema, mciPatientInputSchema, mciResponderUpdateInputSchema, mciRulesInputSchema, mciTriageLevelInputSchema } from './mass-casualty.ts';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const open = { title: 'รถบัสคว่ำ ถนนสาย 23', kind: 'REAL', occurredAt: '2026-11-10T03:00:00.000Z', notify: { mode: 'ALL', professionIds: [] } };
const patient = { triageLevelId: uuid, statusId: uuid, zoneId: uuid, destinationHospital: '', firstName: 'สมชาย', lastName: 'ใจดี', gender: 'MALE', ageEstimate: 40, hn: '', publicHidden: false };

describe('mciOpenIncidentInputSchema', () => {
  it('accepts an incident and defaults the location', () => {
    expect(mciOpenIncidentInputSchema.parse(open)).toMatchObject({ location: '', kind: 'REAL' });
  });
  it('rejects an empty title, an unknown kind and unknown keys', () => {
    expect(mciOpenIncidentInputSchema.safeParse({ ...open, title: '  ' }).success).toBe(false);
    expect(mciOpenIncidentInputSchema.safeParse({ ...open, kind: 'TEST' }).success).toBe(false);
    expect(mciOpenIncidentInputSchema.safeParse({ ...open, extra: 1 }).success).toBe(false);
  });
});

describe('patient inputs', () => {
  it('accepts a full record and a quick record with only colour and zone', () => {
    expect(mciPatientInputSchema.safeParse(patient).success).toBe(true);
    expect(mciNewPatientInputSchema.parse({ triageLevelId: uuid, zoneId: uuid })).toMatchObject({ firstName: '', lastName: '', gender: 'UNKNOWN', ageEstimate: null, hn: '' });
  });
  it('rejects an age over 130 and unknown keys', () => {
    expect(mciPatientInputSchema.safeParse({ ...patient, ageEstimate: 131 }).success).toBe(false);
    expect(mciNewPatientInputSchema.safeParse({ triageLevelId: uuid, zoneId: uuid, tag: 'MCI-001' }).success).toBe(false);
  });
});

describe('settings and staffing inputs', () => {
  it('needs a six-digit colour', () => {
    expect(mciTriageLevelInputSchema.safeParse({ name: 'แดง', description: '', colorHex: '#12345', sortOrder: 1, isActive: true }).success).toBe(false);
    expect(mciTriageLevelInputSchema.safeParse({ name: 'แดง', description: '', colorHex: '#DC2626', sortOrder: 1, isActive: true }).success).toBe(true);
  });
  it('takes rules, check-in and responder updates', () => {
    expect(mciRulesInputSchema.safeParse({ rules: [{ professionId: uuid, zoneId: null }] }).success).toBe(true);
    expect(mciCheckInInputSchema.safeParse({ professionId: 'x' }).success).toBe(false);
    expect(mciResponderUpdateInputSchema.safeParse({ zoneId: null, commandRole: 'RECORDER' }).success).toBe(true);
    expect(mciResponderUpdateInputSchema.safeParse({ zoneId: null, commandRole: 'BOSS' }).success).toBe(false);
  });
});

describe('mciLineBroadcastPayloadSchema', () => {
  it('holds ids only', () => {
    expect(mciLineBroadcastPayloadSchema.safeParse({ incidentId: uuid, event: 'OPENED' }).success).toBe(true);
    expect(mciLineBroadcastPayloadSchema.safeParse({ incidentId: 'x', event: 'OPENED' }).success).toBe(false);
  });
});
