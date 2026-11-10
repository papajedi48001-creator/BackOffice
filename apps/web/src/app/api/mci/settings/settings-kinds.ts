import { NextResponse } from 'next/server';
import { mciProfessionInputSchema, mciStatusInputSchema, mciTriageLevelInputSchema, mciZoneInputSchema } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canCommandMci, forbidden, mciResult, mciSettings, readInput, withSessionAndDatabase } from '../mci-route';

type Saver = (database: Database, actor: string, id: string | null, value: never) => Promise<{ ok: true } | { ok: false; code: string }>;
const kinds: Record<string, { schema: Parameters<typeof readInput>[1]; save: Saver }> = {
  zones: { schema: mciZoneInputSchema, save: (database, actor, id, value) => mciSettings(database).saveZone(actor, id, value) },
  triage: { schema: mciTriageLevelInputSchema, save: (database, actor, id, value) => mciSettings(database).saveTriageLevel(actor, id, value) },
  statuses: { schema: mciStatusInputSchema, save: (database, actor, id, value) => mciSettings(database).saveStatus(actor, id, value) },
  professions: { schema: mciProfessionInputSchema, save: (database, actor, id, value) => mciSettings(database).saveProfession(actor, id, value) }
};

/** Adds (`id` null) or edits one settings row of `kind`; ผู้บัญชาการเหตุ (mci.command) only. */
export function saveSetting(request: Request, kind: string, id: string | null): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const entry = kinds[kind];
    if (!entry) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, entry.schema);
    if (!input.ok) return input.response;
    return mciResult(await entry.save(database, session.personId, id, input.value as never), id ? 200 : 201);
  });
}
