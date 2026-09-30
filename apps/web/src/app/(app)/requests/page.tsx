import Link from 'next/link';
import { t } from '@backoffice/i18n';
import { StatusBadge } from '../../../components/status-badge';

export default function RequestsPage() { return <section><h2>{t('requestsTitle')}</h2><table><thead><tr><th>{t('requestReference')}</th><th>{t('status')}</th></tr></thead><tbody><tr><td><Link href="/requests/request-demo">{t('demoReference')}</Link></td><td><StatusBadge status="PENDING" /></td></tr></tbody></table></section>; }
