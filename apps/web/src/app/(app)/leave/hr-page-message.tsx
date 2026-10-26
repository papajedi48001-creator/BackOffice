import { t, type MessageKey } from '@backoffice/i18n';

export function HrPageMessage({ titleKey, reason }: { titleKey: MessageKey; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{t(titleKey)}</h2><p role="alert">{t(reason === 'forbidden' ? 'hrNoAccess' : 'leaveLoadError')}</p></section>;
}
