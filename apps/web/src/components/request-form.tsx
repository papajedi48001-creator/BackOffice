'use client';

import { t } from '@backoffice/i18n';
import type { RequestFormData } from '../app/(app)/request-forms';
import { FleetForm } from '../app/(app)/fleet/new/fleet-form';
import { LeaveForm } from '../app/(app)/leave/new/leave-form';
import { BookingForm } from '../app/(app)/rooms/bookings/new/booking-form';
import { TravelForm } from '../app/(app)/travel/new/travel-form';

/** Modules whose request form opens in the top button's popup. A new request module adds its form here. */
export const requestFormModules = ['leave', 'official-travel', 'fleet', 'room-booking'] as const;

/** The module's existing request form, for the popup body. */
export function RequestForm({ data }: { data: RequestFormData }) {
  switch (data.module) {
    case 'leave': return <LeaveForm types={data.types} attachments={data.attachments} />;
    case 'official-travel': return <TravelForm leader={data.leader} attachments={data.attachments} />;
    case 'fleet': return <>{data.fromTravel && <p className="permission-notice">{t('fleetFromTravelHelp')}</p>}<FleetForm initial={data.initial} officialTravelId={data.officialTravelId} holidays={data.holidays} /></>;
    case 'room-booking': return <BookingForm rooms={data.rooms} addons={data.addons} today={data.today} holidays={data.holidays} />;
    case 'unavailable': return <p role="alert">{t('requestFormUnavailable')}</p>;
    default: return <p role="alert">{t('hrNoAccess')}</p>;
  }
}
