import { t, type MessageKey } from '@backoffice/i18n';

export function AdminMessage({ titleKey, reason }: { titleKey: MessageKey; reason: 'no_access' | 'unavailable' }) {
  return <section><h2>{t(titleKey)}</h2><p role="alert">{t(reason === 'no_access' ? 'adminNoAccess' : 'adminLoadError')}</p></section>;
}
