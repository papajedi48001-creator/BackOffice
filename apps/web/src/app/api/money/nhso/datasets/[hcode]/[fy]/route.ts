import { NextResponse } from 'next/server';
import { NhsoDatasetService } from '@backoffice/core';
import { moneyResult, withSessionAndDatabase } from '../../../../money-route';

/** ลบ one report (หน่วยบริการ, ปีงบ); ผู้ดูแล Smart Money only (checked by the service). */
export async function DELETE(request: Request, { params }: { params: Promise<{ hcode: string; fy: string }> }): Promise<Response> {
  const { hcode, fy } = await params;
  return withSessionAndDatabase(request, async (session, database) => {
    if (!/^\d{5}$/.test(hcode) || !/^\d{4}$/.test(fy)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    return moneyResult(await new NhsoDatasetService(database).remove(session, hcode, Number(fy)));
  });
}
