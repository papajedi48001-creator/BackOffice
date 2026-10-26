import { describe, expect, it } from 'vitest';
import { officialTravelInputSchema } from './official-travel.ts';

const valid = { subject: 'ประชุมวิชาการการพยาบาล', organiser: 'สสจ.มหาสารคาม', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', startDate: '2026-11-10', endDate: '2026-11-11', memberPersonIds: ['person-b'] };

describe('officialTravelInputSchema', () => {
  it('accepts a trip and defaults the halves and costs', () => {
    expect(officialTravelInputSchema.parse(valid)).toMatchObject({ startHalf: 'FULL', endHalf: 'FULL', costAllowance: 0, costLodging: 0, costTransport: 0, costRegistration: 0 });
  });

  it('rejects an end before the start', () => {
    expect(officialTravelInputSchema.safeParse({ ...valid, endDate: '2026-11-09' }).success).toBe(false);
  });

  it('rejects a person listed twice', () => {
    expect(officialTravelInputSchema.safeParse({ ...valid, memberPersonIds: ['person-b', 'person-b'] }).success).toBe(false);
  });

  it('rejects a negative cost and fractions of a satang', () => {
    expect(officialTravelInputSchema.safeParse({ ...valid, costLodging: -1 }).success).toBe(false);
    expect(officialTravelInputSchema.safeParse({ ...valid, costLodging: 1.005 }).success).toBe(false);
  });

  it('rejects more than 29 other people and unknown keys', () => {
    expect(officialTravelInputSchema.safeParse({ ...valid, memberPersonIds: Array.from({ length: 30 }, (_, index) => `p-${index}`) }).success).toBe(false);
    expect(officialTravelInputSchema.safeParse({ ...valid, leaderPersonId: 'x' }).success).toBe(false);
  });

  it('rejects a trip longer than a year', () => {
    expect(officialTravelInputSchema.safeParse({ ...valid, endDate: '2027-11-12' }).success).toBe(false);
    expect(officialTravelInputSchema.safeParse({ ...valid, endDate: '2027-11-09' }).success).toBe(true);
  });
});
