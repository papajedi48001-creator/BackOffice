import { render } from '@testing-library/react';
import { moduleIconNames } from '@backoffice/contracts';
import { describe, expect, it } from 'vitest';
import { ModuleIcon, moduleIconLabel } from './module-icon';

describe('ไอคอนโมดูล', () => {
  it('draws every icon a module may choose, each with a Thai name', () => {
    for (const name of moduleIconNames) {
      const { container, unmount } = render(<ModuleIcon name={name} />);
      expect(container.querySelector('svg')!.children.length, name).toBeGreaterThan(0);
      expect(moduleIconLabel(name), name).toMatch(/\p{Script=Thai}/u);
      unmount();
    }
  });

  it('offers the hospital set: medical, documents, people, money, IT and communication icons', () => {
    for (const name of ['hospital', 'ambulance', 'stethoscope', 'pill', 'syringe', 'tooth', 'bed', 'pulse', 'file', 'folder', 'book', 'news', 'graduation', 'idcard', 'user', 'banknote', 'cart', 'utensils', 'building', 'mappin', 'chart', 'scan', 'database', 'server', 'cloud', 'wifi', 'devices', 'printer', 'download', 'video', 'image', 'lock', 'key', 'mail', 'phone', 'chat', 'megaphone', 'calendar', 'star', 'help', 'grid', 'globe', 'link']) expect(moduleIconNames).toContain(name);
    expect(new Set(moduleIconNames).size).toBe(moduleIconNames.length);
  });
});
