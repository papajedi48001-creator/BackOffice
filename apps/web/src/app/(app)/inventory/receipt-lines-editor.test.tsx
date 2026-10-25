import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { ScanItem } from '@backoffice/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyScan, ReceiptLinesEditor, toLineInputs, type EditorLine } from './receipt-lines-editor';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const gloves: ScanItem = { id: 'item-1', code: 'AB-01', name: 'ถุงมือยาง', issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, tracksExpiry: true, isActive: true };
const paper: ScanItem = { id: 'item-2', code: 'PA-01', name: 'กระดาษ', issueUnit: 'รีม', purchaseUnit: 'ลัง', purchaseUnitFactor: 5, tracksExpiry: false, isActive: true };
const respond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const scan = (value: string) => {
  const input = screen.getByLabelText('สแกนหรือพิมพ์รหัส แล้วกด Enter');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

function Harness({ initial = [], canBindBarcode = false }: { initial?: EditorLine[]; canBindBarcode?: boolean }) {
  const [lines, setLines] = useState<EditorLine[]>(initial);
  return <><ReceiptLinesEditor lines={lines} onChange={setLines} items={[gloves, paper]} canBindBarcode={canBindBarcode} /><output data-testid="lines">{JSON.stringify(toLineInputs(lines))}</output></>;
}
const sent = () => JSON.parse(screen.getByTestId('lines').textContent ?? '[]');

describe('applyScan', () => {
  it('adds one to the last line of the same item and unit on a repeated scan', () => {
    const first = applyScan([], { kind: 'barcode', unitKind: 'ISSUE', item: gloves }, 'a');
    if (!('lines' in first)) throw new Error('expected lines');
    const second = applyScan(first.lines, { kind: 'item', item: gloves }, 'b');
    expect('lines' in second && second.lines.map((line) => [line.key, line.quantity])).toEqual([['a', '2']]);
  });

  it('refuses inactive items and lot labels', () => {
    expect(applyScan([], { kind: 'item', item: { ...gloves, isActive: false } }, 'a')).toEqual({ error: 'วัสดุนี้ปิดใช้แล้ว' });
    expect(applyScan([], { kind: 'lot', item: gloves, lot: { id: 'lot-1', lotCode: 'LT-2569-000001', expiryDate: null, onHandQuantity: 3 } }, 'a')).toEqual({ error: 'ของชิ้นนี้รับเข้าแล้ว (LT-2569-000001)' });
  });
});

describe('ReceiptLinesEditor', () => {
  it('turns two scans of one barcode into one line of quantity 2', async () => {
    respond(200, { kind: 'barcode', unitKind: 'ISSUE', item: gloves });
    respond(200, { kind: 'barcode', unitKind: 'ISSUE', item: gloves });
    render(<Harness />);
    scan('8850001');
    await waitFor(() => expect(sent()).toHaveLength(1));
    scan('8850001');
    await waitFor(() => expect(sent()[0].quantity).toBe(2));
    expect(sent()).toHaveLength(1);
  });

  it('shows the purchase unit for a box barcode and sends the price as a number', async () => {
    respond(200, { kind: 'barcode', unitKind: 'PURCHASE', item: gloves });
    render(<Harness />);
    scan('8850002');
    expect(await screen.findByText('กล่อง')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ราคาต่อหน่วย (บาท) ถุงมือยาง'), { target: { value: '250.5' } });
    fireEvent.change(screen.getByLabelText('วันหมดอายุ ถุงมือยาง'), { target: { value: '2027-06-30' } });
    expect(sent()).toEqual([{ itemId: 'item-1', unitKind: 'PURCHASE', quantity: 1, unitPrice: 250.5, expiryDate: '2027-06-30' }]);
    expect(screen.getByText('250.50')).toBeInTheDocument();
  });

  it('adds no line for an inactive item and says why', async () => {
    respond(200, { kind: 'item', item: { ...gloves, isActive: false } });
    render(<Harness />);
    scan('AB-01');
    expect(await screen.findByText('วัสดุนี้ปิดใช้แล้ว')).toBeInTheDocument();
    expect(sent()).toEqual([]);
  });

  it('asks for an expiry date only on items that track one', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('เลือกวัสดุ'), { target: { value: 'item-2' } });
    expect(await screen.findByText('กระดาษ')).toBeInTheDocument();
    expect(screen.queryByLabelText('วันหมดอายุ กระดาษ')).not.toBeInTheDocument();
  });

  it('offers to bind an unknown barcode to an item when allowed', async () => {
    respond(404, { error: 'CODE_NOT_FOUND' });
    respond(201, { id: 'barcode-1' });
    render(<Harness canBindBarcode />);
    scan('999000');
    const bind = await screen.findByRole('group', { name: 'ผูกบาร์โค้ดนี้กับวัสดุ' });
    fireEvent.change(within(bind).getByLabelText('เลือกวัสดุ'), { target: { value: 'item-2' } });
    fireEvent.click(within(bind).getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(sent()).toEqual([{ itemId: 'item-2', unitKind: 'ISSUE', quantity: 1, unitPrice: 0 }]));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/inventory/items/item-2/barcodes');
    expect(JSON.parse(init.body)).toEqual({ barcode: '999000', unitKind: 'ISSUE' });
  });
});
