import { redirect } from 'next/navigation';

/**
 * Deep link: ขอใช้รถ opens as a popup over ใบขอใช้รถของฉัน (RequestAction reads request=1). With `?travel=<travelId>` the
 * popup starts from a คำขอไปราชการ the person may see; that check is the server's, in loadRequestForm and again on submit.
 */
export default async function NewFleetRequestPage({ searchParams }: { searchParams: Promise<{ travel?: string | string[] }> }) {
  const travelParam = (await searchParams).travel;
  const travelId = Array.isArray(travelParam) ? travelParam[0] : travelParam;
  const query = new URLSearchParams({ request: '1', ...(travelId ? { travel: travelId } : {}) });
  redirect(`/fleet/mine?${query.toString()}`);
}
