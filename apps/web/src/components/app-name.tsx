import { t } from '@backoffice/i18n';

/** The system name with its "(Back Office)" suffix kept together on its own line. */
export function AppName() {
  const name = t('appName');
  const split = name.lastIndexOf(' (');
  if (split < 0) return <>{name}</>;
  return <>{name.slice(0, split)} <span className="app-name-tail">{name.slice(split + 1)}</span></>;
}
