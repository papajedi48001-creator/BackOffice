import { t } from '@backoffice/i18n';

export default function DashboardPage() { return <section><h2>{t('overviewTitle')}</h2><p>{t('overviewCopy')}</p><div className="summary-grid"><article><strong>0</strong><span>{t('pending')}</span></article><article><strong>0</strong><span>{t('notifications')}</span></article></div></section>; }
