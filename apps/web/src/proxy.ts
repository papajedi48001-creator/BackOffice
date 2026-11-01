import { NextResponse, type NextRequest } from 'next/server';
import { getSharedDatabase } from './lib/database';
import { gateDecision, moduleForPath, readDisabledModules } from './lib/module-gate';

/**
 * Refuses every page and API of a module a ผู้ดูแลระบบ switched off (ตั้งค่าโปรแกรม), for everyone, before the route runs.
 * Shared paths (หน้าหลัก, sign-in, attachments) and the admin module are never refused.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (!moduleForPath(pathname)) return NextResponse.next();
  const database = getSharedDatabase();
  if (!database) return NextResponse.next();
  const decision = gateDecision(pathname, await readDisabledModules(database));
  if (!decision) return NextResponse.next();
  if (decision.api) return NextResponse.json({ error: 'module_disabled' }, { status: 403 });
  return NextResponse.rewrite(new URL('/module-disabled', request.url), { status: 403 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)']
};
