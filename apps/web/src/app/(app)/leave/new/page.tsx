import { redirect } from 'next/navigation';

/** Deep link: the request form opens as a popup over the module page (RequestAction reads request=1). */
export default async function NewLeavePage() {
  redirect('/leave/mine?request=1');
}
