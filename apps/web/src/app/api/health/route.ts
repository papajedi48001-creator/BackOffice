import { NextResponse } from 'next/server';
import { isSetupMode } from '../../../lib/setup-mode';

export function GET(): Response {
  return NextResponse.json({ status: isSetupMode() ? 'setup-required' : 'ok' });
}
