import { redirect } from 'next/navigation';

/** Monitor Instrument OFC now lives in กองทุนฟื้นฟูสมรรถภาพ; old links keep their range. */
export default async function OfcPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const query = new URLSearchParams({ tab: 'ofc' });
  for (const key of ['start', 'end'] as const) { const value = one(params[key]); if (value) query.set(key, value); }
  redirect(`/money/disability?${query.toString()}`);
}
