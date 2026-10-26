import { describe, expect, it } from 'vitest';
import { requiresDataOwner, roleGrantsPermission } from './policy';

describe('inventory roles', () => {
  it('lets an inventory officer keep the catalogue, receive stock and read stock', () => {
    expect(roleGrantsPermission('inventory-officer', 'inventory.item.manage')).toBe(true);
    expect(roleGrantsPermission('inventory-officer', 'inventory.stock.receive')).toBe(true);
    expect(roleGrantsPermission('inventory-officer', 'inventory.stock.read')).toBe(true);
    expect(roleGrantsPermission('inventory-officer', 'inventory.opening.certify')).toBe(false);
  });

  it('lets an inventory supervisor certify the opening balance and read stock only', () => {
    expect(roleGrantsPermission('inventory-supervisor', 'inventory.opening.certify')).toBe(true);
    expect(roleGrantsPermission('inventory-supervisor', 'inventory.stock.read')).toBe(true);
    expect(roleGrantsPermission('inventory-supervisor', 'inventory.stock.receive')).toBe(false);
  });
});

describe('leave permission', () => {
  it('lets an HR manager manage leave as a data owner, and nobody else', () => {
    expect(roleGrantsPermission('hr-manager', 'leave.manage')).toBe(true);
    expect(roleGrantsPermission('hr-reader', 'leave.manage')).toBe(false);
    expect(requiresDataOwner('leave.manage')).toBe(true);
  });
});
