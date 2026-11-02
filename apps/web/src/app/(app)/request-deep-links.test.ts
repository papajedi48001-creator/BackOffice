import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import NewLeavePage from './leave/new/page';
import NewTravelPage from './travel/new/page';
import NewFleetRequestPage from './fleet/new/page';
import NewRoomBookingPage from './rooms/bookings/new/page';

describe('request form deep links open the module page with the popup', () => {
  it('redirects each /…/new route to its module page with request=1', async () => {
    await NewLeavePage();
    expect(mocks.redirect).toHaveBeenLastCalledWith('/leave/mine?request=1');
    await NewTravelPage();
    expect(mocks.redirect).toHaveBeenLastCalledWith('/travel/mine?request=1');
    await NewRoomBookingPage();
    expect(mocks.redirect).toHaveBeenLastCalledWith('/rooms/dashboard?request=1');
    await NewFleetRequestPage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).toHaveBeenLastCalledWith('/fleet/mine?request=1');
    await NewFleetRequestPage({ searchParams: Promise.resolve({ travel: 'travel 1' }) });
    expect(mocks.redirect).toHaveBeenLastCalledWith('/fleet/mine?request=1&travel=travel+1');
  });
});
