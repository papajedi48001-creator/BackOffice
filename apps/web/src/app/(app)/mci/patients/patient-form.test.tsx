import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { PatientForm } from './patient-form';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });
const options = {
  zones: [{ id: 'er', name: 'ER' }, { id: 'opd', name: 'OPD' }],
  triageLevels: [{ id: 'red', name: 'แดง', colorHex: '#DC2626' }, { id: 'black', name: 'ดำ', colorHex: '#111827' }],
  statuses: [{ id: 'treating', name: 'กำลังรักษา', needsDestination: false }, { id: 'referred', name: 'ส่งต่อโรงพยาบาลอื่น', needsDestination: true }]
};

it('records a new casualty with colour and zone, then shows the new tag large', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, patientId: 'p', tag: 'MCI-007' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PatientForm options={options} defaultZoneId="er" canHide={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกผู้ป่วยใหม่' }));
  const form = screen.getByRole('form', { name: 'บันทึกผู้ป่วยใหม่' });
  fireEvent.click(within(form).getByRole('radio', { name: 'แดง' }));
  fireEvent.change(within(form).getByLabelText('ชื่อ'), { target: { value: 'สมชาย' } });
  fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mci/patients', expect.objectContaining({ method: 'POST' })));
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ triageLevelId: 'red', zoneId: 'er', firstName: 'สมชาย' });
  expect(await screen.findByText('MCI-007')).toBeInTheDocument();
});

it('asks for the destination only for a referral, keeps the popup open on Esc and hides the board flag from non-commanders', () => {
  render(<PatientForm options={options} canHide={false} patient={{ id: 'p', tag: 'MCI-001', triageLevelId: 'red', statusId: 'treating', zoneId: 'er', destinationHospital: '', firstName: '', lastName: '', gender: 'UNKNOWN', ageEstimate: null, hn: '', publicHidden: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข MCI-001' }));
  const form = screen.getByRole('form', { name: 'แก้ไข MCI-001' });
  expect(within(form).queryByLabelText('โรงพยาบาลปลายทาง')).toBeNull();
  fireEvent.change(within(form).getByLabelText('สถานะ'), { target: { value: 'referred' } });
  expect(within(form).getByLabelText('โรงพยาบาลปลายทาง')).toBeRequired();
  screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(within(form).queryByLabelText('ไม่เปิดเผยบนกระดานสาธารณะ')).toBeNull();
});
