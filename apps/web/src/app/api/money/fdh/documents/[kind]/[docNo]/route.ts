import { NextResponse } from 'next/server';
import { fdhKindSchema } from '@backoffice/contracts';
import { FdhDocumentService } from '@backoffice/core';
import { getNationalIdProtector } from '../../../../../../../lib/national-id';
import { moneyResult, withSessionAndDatabase } from '../../../../money-route';

/** ลบ one REP or STM document; ผู้ดูแล Smart Money only (checked by the service). */
export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string; docNo: string }> }): Promise<Response> {
  const { kind, docNo } = await params;
  return withSessionAndDatabase(request, async (session, database) => {
    const parsedKind = fdhKindSchema.safeParse(kind);
    if (!parsedKind.success || !/^[A-Za-z0-9_]{1,100}$/.test(docNo)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    return moneyResult(await new FdhDocumentService(database, getNationalIdProtector()).remove(session, parsedKind.data, docNo));
  });
}
