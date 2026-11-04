import { NextResponse } from 'next/server';
import { HrProfileService } from '@backoffice/core';
import { receiveProfilePhoto } from '../../../../../lib/photo-upload';
import { profilePhotoUrl } from '../../../../../lib/profile-photo';
import { resultResponse, withSessionAndDatabase } from '../../profile-route';

/** Takes the signed-in person's own profile photo (multipart field `file`): JPEG, PNG or WebP up to 2 MB, scanned and kept privately. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const received = await receiveProfilePhoto(request, database, session.personId);
    if (received instanceof Response) return received;
    const result = await new HrProfileService(database).setOwnPhoto(session.personId, received.attachmentId, session);
    if (!result.ok) return resultResponse(result);
    return NextResponse.json({ photoUrl: profilePhotoUrl(session.personId, received.attachmentId) }, { status: 201 });
  });
}

/** Removes the signed-in person's own profile photo; the chip goes back to initials. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => resultResponse(await new HrProfileService(database).setOwnPhoto(session.personId, null, session)));
}
