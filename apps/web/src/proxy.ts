import { NextResponse, type NextRequest } from 'next/server';
import { getSharedDatabase } from './lib/database';
import { gateDecision, moduleForPath, readModuleModes } from './lib/module-gate';
import type { Session } from '@backoffice/contracts';
import { readSession, sessionCookieName } from './lib/session';
import { isSetupMode } from './lib/setup-mode';

/** Paths a signed-in person with several roles may use before choosing one: sign-in, sign-out, password change, the picker, health. */
const openBeforeRoleChoice = (pathname: string) => pathname === '/' || pathname === '/choose-role' || pathname === '/change-password' || pathname.startsWith('/api/auth/') || pathname === '/api/health';

const openDuringSetup = (pathname: string) => pathname === '/setup' || pathname.startsWith('/api/setup/') || pathname === '/api/health';

/**
 * Refuses, before the route runs, every page and API of a module a ผู้ดูแลระบบ switched off (ตั้งค่าโปรแกรม) and, for anyone but
 * ผู้ดูแลระบบ, the module's ผู้จัดการ and ผู้ทดสอบ, of a module in development. Shared paths (หน้าหลัก, sign-in, attachments) and the
 * admin module are never refused. A refused development module looks exactly like a switched-off one. Before any of that, a signed-in
 * person who still has to choose a role is sent to /choose-role (pages) or refused with role_selection_required (APIs).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  // Until the first-run setup saves a database URL, only the setup page and the health check answer.
  if (isSetupMode()) {
    if (openDuringSetup(pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'setup_required' }, { status: 503 });
    return NextResponse.redirect(new URL('/setup', request.url));
  }
  const database = getSharedDatabase();
  if (!database) return NextResponse.next();
  let session: Promise<Session | null> | undefined;
  const currentSession = () => (session ??= readSession(request));
  // A person with several roles works in none of them until they choose one at /choose-role (the session holds no role till then).
  if (!openBeforeRoleChoice(pathname) && request.cookies.has(sessionCookieName) && (await currentSession())?.roleSelectionRequired) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'role_selection_required' }, { status: 403 });
    return NextResponse.redirect(new URL('/choose-role', request.url));
  }
  if (!moduleForPath(pathname)) return NextResponse.next();
  const decision = await gateDecision(pathname, await readModuleModes(database), currentSession);
  if (!decision) return NextResponse.next();
  if (decision.api) return NextResponse.json({ error: 'module_disabled' }, { status: 403 });
  return NextResponse.rewrite(new URL('/module-disabled', request.url), { status: 403 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)']
};
