import { describe, expect, it } from 'vitest';
import { officialTravelInputSchema, summarizeTravelFunding, usesGovernmentCar } from './official-travel.ts';

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

  it('takes an optional attachment id that may be null to remove the file', () => {
    expect(officialTravelInputSchema.parse({ ...valid, attachmentId: '00000000-0000-4000-8000-000000000001' }).attachmentId).toBe('00000000-0000-4000-8000-000000000001');
    expect(officialTravelInputSchema.parse({ ...valid, attachmentId: null }).attachmentId).toBeNull();
    expect(officialTravelInputSchema.parse(valid).attachmentId).toBeUndefined();
    expect(officialTravelInputSchema.safeParse({ ...valid, attachmentId: 'not-an-id' }).success).toBe(false);
  });
});

describe('invitation letter, combined vehicles and funding per item', () => {
  it('takes an optional invitation letter and the combined flight vehicles', () => {
    expect(officialTravelInputSchema.parse({ ...valid, invitationNumber: 'มค 0033/ว 123', invitationDate: '2026-11-01', invitationIssuer: 'สสจ.มหาสารคาม', vehicle: 'GOVERNMENT_CAR_AIRPLANE' })).toMatchObject({ invitationNumber: 'มค 0033/ว 123', invitationDate: '2026-11-01', vehicle: 'GOVERNMENT_CAR_AIRPLANE' });
    expect(officialTravelInputSchema.safeParse({ ...valid, vehicle: 'PRIVATE_CAR_AIRPLANE' }).success).toBe(true);
    expect(officialTravelInputSchema.safeParse({ ...valid, invitationDate: '1 พ.ย.' }).success).toBe(false);
    expect(usesGovernmentCar('GOVERNMENT_CAR_AIRPLANE')).toBe(true);
    expect(usesGovernmentCar('PRIVATE_CAR_AIRPLANE')).toBe(false);
  });

  it('takes a source for each cost item without the old single source', () => {
    const withoutSource: Partial<typeof valid> = { ...valid };
    delete withoutSource.fundingSource;
    const parsed = officialTravelInputSchema.parse({ ...withoutSource, costAllowance: 240, costRegistration: 1500, costFunding: { allowance: 'HOSPITAL_FUND', lodging: 'NONE', transport: 'NONE', registration: 'ORGANISER' } });
    expect(parsed.costFunding).toEqual({ allowance: 'HOSPITAL_FUND', lodging: 'NONE', transport: 'NONE', registration: 'ORGANISER' });
  });

  it('summarizes the sources of the items that cost something', () => {
    const costs = { costAllowance: 240, costLodging: 0, costTransport: 0, costRegistration: 1500 };
    expect(summarizeTravelFunding(costs, { allowance: 'HOSPITAL_FUND', lodging: 'ORGANISER', transport: 'NONE', registration: 'HOSPITAL_FUND' })).toBe('HOSPITAL_FUND');
    expect(summarizeTravelFunding(costs, { allowance: 'HOSPITAL_FUND', lodging: 'NONE', transport: 'NONE', registration: 'ORGANISER' })).toBe('MIXED');
    expect(summarizeTravelFunding({ costAllowance: 0, costLodging: 0, costTransport: 0, costRegistration: 0 }, { allowance: 'HOSPITAL_FUND', lodging: 'HOSPITAL_FUND', transport: 'HOSPITAL_FUND', registration: 'HOSPITAL_FUND' })).toBe('NONE');
  });
});
