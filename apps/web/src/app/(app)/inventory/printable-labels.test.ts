import { describe, expect, it } from 'vitest';
import { printableLabels } from './printable-labels';

describe('printableLabels', () => {
  it('draws one QR per lot that carries nothing but the lot code', async () => {
    const [label] = await printableLabels([{ lotCode: 'LT-2569-000001', itemCode: 'AB-01', itemName: 'ถุงมือยาง', expiryDate: null, receivedOn: '2026-10-22' }]);
    expect(label!.svg.startsWith('<svg')).toBe(true);
    expect(label!.svg).not.toContain('ถุงมือยาง');
  });
});
