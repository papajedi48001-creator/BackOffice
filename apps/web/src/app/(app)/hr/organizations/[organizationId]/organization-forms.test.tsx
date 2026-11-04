import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { OrganizationForms } from './organization-forms';

const people = [{ id: 'p1', label: 'E001 นายสมศักดิ์ รักงาน' }];

const openHead = () => fireEvent.click(screen.getByRole('button', { name: 'ตั้งเป็นหัวหน้า' }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('OrganizationForms', () => {
  it('saves the unit type and refreshes the page', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<OrganizationForms organizationId="nur" unitType="DIVISION" people={people} today="2026-10-22" />);

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขชนิดหน่วยงาน' }));
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขชนิดหน่วยงาน' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'ชนิดหน่วยงาน' }), { target: { value: 'SECTION' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกชนิดหน่วยงาน' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/hr/organizations/nur/unit-type', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ unitType: 'SECTION' }) }));
  });

  it('assigns the chosen person from today by default', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<OrganizationForms organizationId="nur" unitType={null} people={people} today="2026-10-22" />);

    openHead();
    expect(screen.getByLabelText('วันที่เริ่มเป็นหัวหน้า')).toHaveValue('22/10/2569');
    fireEvent.change(screen.getByRole('combobox', { name: 'หัวหน้าคนใหม่' }), { target: { value: 'E001 นายสมศักดิ์ รักงาน' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ตั้งเป็นหัวหน้า' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith('/api/hr/organizations/nur/heads', expect.objectContaining({ method: 'POST', body: JSON.stringify({ personId: 'p1', effectiveFrom: '2026-10-22' }) }));
  });

  it('asks for a person from the list instead of sending free text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<OrganizationForms organizationId="nur" unitType={null} people={people} today="2026-10-22" />);
    openHead();

    fireEvent.change(screen.getByRole('combobox', { name: 'หัวหน้าคนใหม่' }), { target: { value: 'สมศักดิ์' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ตั้งเป็นหัวหน้า' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('เลือกบุคลากรจากรายการ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a rejected back-dated start in Thai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'EFFECTIVE_FROM_BEFORE_CURRENT' }), { status: 400 })));
    render(<OrganizationForms organizationId="nur" unitType={null} people={people} today="2026-10-22" />);
    openHead();

    fireEvent.change(screen.getByRole('combobox', { name: 'หัวหน้าคนใหม่' }), { target: { value: 'E001 นายสมศักดิ์ รักงาน' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ตั้งเป็นหัวหน้า' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('วันที่เริ่มต้องไม่ก่อนวันที่หัวหน้าคนปัจจุบันเริ่ม');
    expect(refresh).not.toHaveBeenCalled();
  });
});
