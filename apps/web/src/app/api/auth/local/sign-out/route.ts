import { NextResponse } from 'next/server';
import { sessionCookieName } from '../../../../../lib/session';

export async function POST(): Promise<Response> {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(sessionCookieName, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
