import { redirect } from 'next/navigation';
import { ModuleIndex } from '../../../components/module-layout';

/** The module opens its first section; links saved from the old week/day calendar at /rooms still reach it. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.week !== undefined || params.view !== undefined || params.date !== undefined) {
    const query = new URLSearchParams();
    for (const key of ['view', 'week', 'date', 'roomId']) { const value = params[key]; if (typeof value === 'string') query.set(key, value); }
    redirect(`/rooms/calendar?${query.toString()}`);
  }
  return <ModuleIndex code="room-booking" />;
}
