import { NextResponse, type NextRequest } from 'next/server';
import { getSharedDatabase } from './lib/database';
import { gateDecision, moduleForPath, readModuleModes } from './lib/module-gate';
import { readSession } from './lib/session';

/**
 * Refuses, before the route runs, every page and API of a module a ผู้ดูแลระบบ switched off (ตั้งค่าโปรแกรม) and, for anyone but
 * ผู้ดูแลระบบ, the module's ผู้จัดการ and ผู้ทดสอบ, of a module in development. Shared paths (หน้าหลัก, sign-in, attachments) and the
 * admin module are never refused. A refused development module looks exactly like a switched-off one.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (!moduleForPath(pathname)) return NextResponse.next();
  const database = getSharedDatabase();
  if (!database) return NextResponse.next();
  const decision = await gateDecision(pathname, await readModuleModes(database), () => readSession(request));
  if (!decision) return NextResponse.next();
  if (decision.api) return NextResponse.json({ error: 'module_disabled' }, { status: 403 });
  return NextResponse.rewrite(new URL('/module-disabled', request.url), { status: 403 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)']
};
