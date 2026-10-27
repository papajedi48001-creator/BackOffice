/** Where a person's profile photo is served. The attachment id only busts caches when the photo changes. */
export function profilePhotoUrl(personId: string, attachmentId: string): string {
  return `/api/hr/people/${encodeURIComponent(personId)}/photo?v=${encodeURIComponent(attachmentId)}`;
}
