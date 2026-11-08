import { t } from '@backoffice/i18n';

/** "คำขอของคุณเอง": shown beside a request the viewer submitted and may decide in the admin or manager tier. */
export function OwnRequestMarker() {
  return <span className="own-request-marker">{t('ownRequestMarker')}</span>;
}
