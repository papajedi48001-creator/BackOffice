import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import type { SidebarWidth } from '../lib/sidebar-width';
import { SidebarEdge } from './sidebar-edge';

function Harness({ start }: { start: SidebarWidth }) {
  const [state, setState] = useState(start);
  return <><SidebarEdge state={state} onChange={setState} /><output data-testid="width">{state.width}:{state.lastWide}</output><input aria-label="ช่องกรอก" /></>;
}

it('folds the menu to the rail from the edge tab and opens it back to the last wide width', () => {
  render(<Harness start={{ width: 300, lastWide: 300 }} />);
  const tab = screen.getByRole('button', { name: 'ย่อเมนู' });
  expect(tab).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(tab);
  expect(screen.getByTestId('width')).toHaveTextContent('92:300');
  const open = screen.getByRole('button', { name: 'ขยายเมนู' });
  expect(open).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(open);
  expect(screen.getByTestId('width')).toHaveTextContent('300:300');
});

it('is a separator that arrow keys widen or narrow 24px at a time', () => {
  render(<Harness start={{ width: 272, lastWide: 272 }} />);
  const edge = screen.getByRole('separator', { name: /ความกว้างเมนู/ });
  expect(edge).toHaveAttribute('aria-valuenow', '272');
  fireEvent.keyDown(edge, { key: 'ArrowRight' });
  expect(screen.getByTestId('width')).toHaveTextContent('296:296');
  fireEvent.keyDown(edge, { key: 'ArrowLeft' });
  fireEvent.keyDown(edge, { key: 'ArrowLeft' });
  expect(screen.getByTestId('width')).toHaveTextContent('248:248');
});

it('resizes when the edge is dragged, snapping a very narrow menu to the rail', () => {
  render(<Harness start={{ width: 272, lastWide: 272 }} />);
  const edge = screen.getByRole('separator', { name: /ความกว้างเมนู/ });
  fireEvent.pointerDown(edge, { clientX: 272, pointerId: 1, button: 0 });
  fireEvent.pointerMove(edge, { clientX: 320, pointerId: 1 });
  fireEvent.pointerUp(edge, { clientX: 320, pointerId: 1 });
  expect(screen.getByTestId('width')).toHaveTextContent('320:320');
  fireEvent.pointerDown(edge, { clientX: 320, pointerId: 1, button: 0 });
  fireEvent.pointerMove(edge, { clientX: 120, pointerId: 1 });
  fireEvent.pointerUp(edge, { clientX: 120, pointerId: 1 });
  expect(screen.getByTestId('width')).toHaveTextContent('92:320');
});

it('toggles with Ctrl B, but not while typing in a field', () => {
  render(<Harness start={{ width: 272, lastWide: 272 }} />);
  fireEvent.keyDown(screen.getByLabelText('ช่องกรอก'), { key: 'b', ctrlKey: true });
  expect(screen.getByTestId('width')).toHaveTextContent('272:272');
  fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
  expect(screen.getByTestId('width')).toHaveTextContent('92:272');
});
