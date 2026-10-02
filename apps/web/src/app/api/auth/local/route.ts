import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { LocalAuthService, type LocalAccountRepository } from '@backoffice/core';
import { createSessionToken, sessionCookieName } from '../../../../lib/session';
import { readRuntimeValue } from '../../../../lib/runtime-env';

class DatabaseLocalAccountRepository implements LocalAccountRepository {
  constructor(private readonly database: ReturnType<typeof createDatabase>) {}
  async findByUsername(username: string) {
    const rows = await this.database.query<{ personId: string; username: string; passwordHash: string }>('SELECT person_id AS personId, username, password_hash AS passwordHash FROM local_account WHERE username = ? LIMIT 1', [username]);
    return rows[0] ?? null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const databaseUrl = readRuntimeValue('DATABASE_URL');
    if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
    const database = createDatabase(databaseUrl);
    try {
      const session = await new LocalAuthService(new DatabaseLocalAccountRepository(database)).authenticateLocal(body);
      const response = NextResponse.json({ authenticated: true });
      response.cookies.set(sessionCookieName, createSessionToken(session), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
      return response;
    } finally { await database.close(); }
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }
}
