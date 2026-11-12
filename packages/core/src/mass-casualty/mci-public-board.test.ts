import { describe, expect, it } from 'vitest';
import { buildPublicBoard, CONTACT_PLACE, type MciIncidentRow, type MciPatientRow } from './mci-public-board';
import type { MciSettings } from './mci-settings-queries';

const settings: MciSettings = {
  zones: [{ id: 'er', name: 'ER', sortOrder: 1, isActive: true }, { id: 'opd', name: 'OPD', sortOrder: 2, isActive: true }],
  triageLevels: [
    { id: 'red', name: 'แดง', description: '', colorHex: '#DC2626', sortOrder: 1, isDeceased: false, isActive: true },
    { id: 'green', name: 'เขียว', description: '', colorHex: '#16A34A', sortOrder: 2, isDeceased: false, isActive: true },
    { id: 'black', name: 'ดำ', description: '', colorHex: '#111827', sortOrder: 3, isDeceased: true, isActive: true },
    { id: 'old', name: 'ม่วง', description: '', colorHex: '#7C3AED', sortOrder: 4, isDeceased: false, isActive: false }
  ],
  statuses: [
    { id: 'treating', name: 'กำลังรักษา', sortOrder: 1, isDeceased: false, needsDestination: false, isDischarged: false, isActive: true },
    { id: 'referred', name: 'ส่งต่อโรงพยาบาลอื่น', sortOrder: 2, isDeceased: false, needsDestination: true, isDischarged: false, isActive: true },
    { id: 'home', name: 'กลับบ้านได้', sortOrder: 3, isDeceased: false, needsDestination: false, isDischarged: true, isActive: true },
    { id: 'dead', name: 'เสียชีวิต', sortOrder: 4, isDeceased: true, needsDestination: false, isDischarged: false, isActive: true }
  ],
  professions: [], rules: [], publicContactPhone: '043-777777', deceasedTriageId: 'black', deceasedStatusId: 'dead', intakeStatusId: 'treating'
};
const incident: MciIncidentRow = { id: 'i', title: 'รถบัสคว่ำ', kind: 'DRILL', status: 'OPEN', location: 'ถนนสาย 23', occurredAt: '2026-11-10T03:00:00.000Z', openedAt: '2026-11-10T03:05:00.000Z', closedAt: null, updatedAt: '2026-11-10T04:00:00.000Z' };
const patient = (overrides: Partial<MciPatientRow>): MciPatientRow => ({ id: 'p', tagNo: 1, triageLevelId: 'red', statusId: 'treating', zoneId: 'er', destinationHospital: '', firstName: '', lastName: '', gender: 'UNKNOWN', ageEstimate: null, hn: '', publicHidden: false, updatedAt: incident.updatedAt, ...overrides });

describe('buildPublicBoard', () => {
  const board = buildPublicBoard(incident, [
    patient({ id: 'a', tagNo: 1, firstName: 'สมชาย', lastName: 'ใจดี', hn: 'HN998877', ageEstimate: 40, gender: 'MALE' }),
    patient({ id: 'b', tagNo: 2, firstName: 'มานี', lastName: 'มีนา', statusId: 'referred', destinationHospital: 'รพ.มหาสารคาม', triageLevelId: 'green' }),
    patient({ id: 'c', tagNo: 3, firstName: 'ชูใจ', lastName: 'ใจงาม', statusId: 'dead', triageLevelId: 'black' }),
    patient({ id: 'd', tagNo: 4, firstName: 'ปิติ', lastName: 'พอใจ', publicHidden: true }),
    patient({ id: 'e', tagNo: 5, firstName: 'วีระ', lastName: 'กล้า', statusId: 'home', triageLevelId: 'green' }),
    patient({ id: 'f', tagNo: 6 })
  ], settings);

  it('counts every casualty by colour and by status, with death only in the black count', () => {
    expect(board.total).toBe(6);
    expect(board.byTriage).toEqual([{ name: 'แดง', colorHex: '#DC2626', count: 3 }, { name: 'เขียว', colorHex: '#16A34A', count: 2 }, { name: 'ดำ', colorHex: '#111827', count: 1 }]);
    expect(board.byStatus).toEqual([{ name: 'กำลังรักษา', count: 3 }, { name: 'ส่งต่อโรงพยาบาลอื่น', count: 1 }, { name: 'กลับบ้านได้', count: 1 }]);
  });

  it('lists named casualties by full name with where they are, hiding the dead and the hidden', () => {
    expect(board.people).toEqual([
      { name: 'ชูใจ ใจงาม', place: CONTACT_PLACE },
      { name: 'ปิติ พอใจ', place: CONTACT_PLACE },
      { name: 'มานี มีนา', place: 'ส่งต่อ รพ.มหาสารคาม' },
      { name: 'วีระ กล้า', place: 'กลับบ้านแล้ว' },
      { name: 'สมชาย ใจดี', place: 'ER' }
    ]);
    expect(CONTACT_PLACE).toBe('กรุณาติดต่อจุดประชาสัมพันธ์');
  });

  it('never carries an HN, tag, age, gender or a colour per person', () => {
    const serialised = JSON.stringify(board);
    for (const secret of ['HN998877', 'MCI-', '"40"', 'MALE', 'tag']) expect(serialised).not.toContain(secret);
    expect(Object.keys(board.people[0]!)).toEqual(['name', 'place']);
  });

  it('shows the เหตุ heading, the update time and the contact phone, or no เหตุ at all', () => {
    expect(board.incident).toEqual({ title: 'รถบัสคว่ำ', kind: 'DRILL', occurredAt: '2026-11-10T03:00:00.000Z' });
    expect(board.updatedAt).toBe('2026-11-10T04:00:00.000Z');
    expect(board.contactPhone).toBe('043-777777');
    expect(buildPublicBoard(null, [], settings)).toMatchObject({ incident: null, total: 0, people: [], contactPhone: '043-777777' });
  });
});
