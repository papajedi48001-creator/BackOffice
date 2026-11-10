import { NextResponse } from 'next/server';
import { labItemInputSchema, labSectionInputSchema, labUsageTypeInputSchema, labVendorInputSchema } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { labResult, labSettings, readInput, withSessionAndDatabase } from '../lab-route';

type Session = Parameters<Parameters<typeof withSessionAndDatabase>[1]>[0];
type Saver = (database: Database, session: Session, id: string | null, value: never) => Promise<{ ok: true } | { ok: false; code: string }>;
const kinds: Record<string, { schema: Parameters<typeof readInput>[1]; save: Saver }> = {
  items: { schema: labItemInputSchema, save: (database, session, id, value) => labSettings(database).saveItem(session, id, value) },
  sections: { schema: labSectionInputSchema, save: (database, session, id, value) => labSettings(database).saveSection(session, id, value) },
  vendors: { schema: labVendorInputSchema, save: (database, session, id, value) => labSettings(database).saveVendor(session, id, value) },
  'usage-types': { schema: labUsageTypeInputSchema, save: (database, session, id, value) => labSettings(database).saveUsageType(session, id, value) }
};

/** Adds (`id` null) or edits one settings row of `kind`; the service checks the ผู้ดูแลคลัง Lab permission. */
export function saveSetting(request: Request, kind: string, id: string | null): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const entry = kinds[kind];
    if (!entry) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, entry.schema);
    if (!input.ok) return input.response;
    return labResult(await entry.save(database, session, id, input.value as never), id ? 200 : 201);
  });
}
