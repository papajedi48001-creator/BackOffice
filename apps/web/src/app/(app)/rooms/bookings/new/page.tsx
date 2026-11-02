import { redirect } from 'next/navigation';

/** Deep link: the request form opens as a popup over the module page (RequestAction reads request=1). */
export default async function NewRoomBookingPage() {
  redirect('/rooms/dashboard?request=1');
}
