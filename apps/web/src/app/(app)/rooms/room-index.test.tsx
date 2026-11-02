import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error('redirected'); }), ModuleIndex: vi.fn(() => null) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../components/module-layout', () => ({ ModuleIndex: mocks.ModuleIndex }));

import Page from './page';

afterEach(() => vi.clearAllMocks());

it('sends an old week or day calendar link to the week calendar with its query', async () => {
  await expect(Page({ searchParams: Promise.resolve({ week: '2026-11-09', roomId: 'r1' }) })).rejects.toThrow('redirected');
  expect(mocks.redirect).toHaveBeenCalledWith('/rooms/calendar?week=2026-11-09&roomId=r1');
  await expect(Page({ searchParams: Promise.resolve({ view: 'day', date: '2026-11-05' }) })).rejects.toThrow('redirected');
  expect(mocks.redirect).toHaveBeenCalledWith('/rooms/calendar?view=day&date=2026-11-05');
});

it('opens the first section otherwise', async () => {
  const element = await Page({ searchParams: Promise.resolve({}) });
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(element.props).toEqual({ code: 'room-booking' });
});
