import type { LabMemberRole, LabOpeningStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export type LabSettings = {
  mainStoreId: string;
  sections: { id: string; code: string; name: string; sortOrder: number; isActive: boolean; storeId: string }[];
  items: { id: string; code: string; name: string; receiveUnit: string; useUnit: string; unitsPerReceive: number; expiryWarnDays: number; isActive: boolean; reorderPoints: { storeId: string; reorderPoint: number }[] }[];
  vendors: { id: string; name: string; phone: string; isActive: boolean }[];
  usageTypes: { id: string; name: string; sortOrder: number; isActive: boolean }[];
  members: { personId: string; displayName: string; role: LabMemberRole; sectionIds: string[] }[];
  openingStatus: LabOpeningStatus;
};

const flag = (value: unknown) => Number(value) === 1;

export class LabSettingsQueries {
  constructor(private readonly database: Database) {}

  async settings(): Promise<LabSettings> {
    const [main] = await this.database.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN' LIMIT 1");
    const sections = await this.database.query<{ id: string; code: string; name: string; sort_order: number; is_active: number; store_id: string }>('SELECT c.id, c.code, c.name, c.sort_order, c.is_active, s.id AS store_id FROM lab_section c JOIN lab_store s ON s.section_id = c.id ORDER BY c.sort_order, c.name');
    const items = await this.database.query<{ id: string; code: string; name: string; receive_unit: string; use_unit: string; units_per_receive: number; expiry_warn_days: number; is_active: number }>('SELECT id, code, name, receive_unit, use_unit, units_per_receive, expiry_warn_days, is_active FROM lab_item ORDER BY code');
    const reorders = await this.database.query<{ item_id: string; store_id: string; reorder_point: number }>('SELECT item_id, store_id, reorder_point FROM lab_item_reorder');
    const vendors = await this.database.query<{ id: string; name: string; phone: string; is_active: number }>('SELECT id, name, phone, is_active FROM lab_vendor ORDER BY name');
    const usageTypes = await this.database.query<{ id: string; name: string; sort_order: number; is_active: number }>('SELECT id, name, sort_order, is_active FROM lab_usage_type ORDER BY sort_order, name');
    const members = await this.database.query<{ person_id: string; display_name: string; role: LabMemberRole; section_id: string | null }>('SELECT m.person_id, p.display_name, m.role, s.section_id FROM lab_member m JOIN person p ON p.id = m.person_id LEFT JOIN lab_member_section s ON s.person_id = m.person_id ORDER BY p.display_name, s.section_id');
    const [opening] = await this.database.query<{ v: LabOpeningStatus }>("SELECT setting_value AS v FROM lab_setting WHERE setting_key = 'opening_status'");
    const byMember = new Map<string, LabSettings['members'][number]>();
    for (const row of members) {
      const member = byMember.get(row.person_id) ?? { personId: row.person_id, displayName: row.display_name, role: row.role, sectionIds: [] };
      if (row.section_id) member.sectionIds.push(row.section_id);
      byMember.set(row.person_id, member);
    }
    return {
      mainStoreId: main?.id ?? '',
      sections: sections.map((row) => ({ id: row.id, code: row.code, name: row.name, sortOrder: Number(row.sort_order), isActive: flag(row.is_active), storeId: row.store_id })),
      items: items.map((row) => ({ id: row.id, code: row.code, name: row.name, receiveUnit: row.receive_unit, useUnit: row.use_unit, unitsPerReceive: Number(row.units_per_receive), expiryWarnDays: Number(row.expiry_warn_days), isActive: flag(row.is_active), reorderPoints: reorders.filter((point) => point.item_id === row.id).map((point) => ({ storeId: point.store_id, reorderPoint: Number(point.reorder_point) })) })),
      vendors: vendors.map((row) => ({ id: row.id, name: row.name, phone: row.phone, isActive: flag(row.is_active) })),
      usageTypes: usageTypes.map((row) => ({ id: row.id, name: row.name, sortOrder: Number(row.sort_order), isActive: flag(row.is_active) })),
      members: [...byMember.values()],
      openingStatus: opening?.v ?? 'DRAFT'
    };
  }
}
