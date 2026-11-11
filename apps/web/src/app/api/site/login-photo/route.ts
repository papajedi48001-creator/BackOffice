import { SiteImageService } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';

export const dynamic = 'force-dynamic';

/**
 * The hospital photo behind the sign-in page. Public on purpose: it shows before anyone signs in. Only JPEG, PNG or
 * WebP is ever stored (checked by content), and nosniff stops a browser from reading it as anything else. The page
 * links it with ?v=<version>, so that URL may be cached for good; any other URL is checked again each time.
 */
export async function GET(request: Request): Promise<Response> {
  const database = getSharedDatabase();
  const image = database ? await new SiteImageService(database).read('login-hero') : null;
  if (!image) return new Response(null, { status: 404 });
  const current = new URL(request.url).searchParams.get('v') === image.version;
  return new Response(new Uint8Array(image.data), {
    headers: {
      'content-type': image.contentType,
      'x-content-type-options': 'nosniff',
      'cache-control': current ? 'public, max-age=31536000, immutable' : 'no-cache',
      etag: `"${image.version}"`
    }
  });
}
