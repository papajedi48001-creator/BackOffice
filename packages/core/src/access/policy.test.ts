import { describe, expect, it } from 'vitest';
import { roleGrantsPermission } from './policy';

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
