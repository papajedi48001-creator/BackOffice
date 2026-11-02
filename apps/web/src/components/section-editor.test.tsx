import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SectionEditor, useSectionSaved } from './section-editor';

function FakeForm() {
  const saved = useSectionSaved();
  return <form aria-label="ฟอร์มทดสอบ" onSubmit={(event) => { event.preventDefault(); saved(); }}><label>ชื่อ<input /></label><button type="submit">บันทึก</button></form>;
}

it('opens the form in a popup named after the section and closes it once the form saves', () => {
  render(<SectionEditor title="ข้อมูลติดต่อ"><FakeForm /></SectionEditor>);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล ข้อมูลติดต่อ' }));
  expect(screen.getByRole('dialog', { name: 'แก้ไขข้อมูลติดต่อ' })).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes with the × button without saving', () => {
  render(<SectionEditor title="ข้อมูลติดต่อ"><FakeForm /></SectionEditor>);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล ข้อมูลติดต่อ' }));
  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('lets a form outside any popup call saved without failing', () => {
  render(<FakeForm />);
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
  expect(screen.getByRole('form', { name: 'ฟอร์มทดสอบ' })).toBeInTheDocument();
});
