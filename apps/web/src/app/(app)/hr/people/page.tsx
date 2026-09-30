import { t } from '@backoffice/i18n';

export default function PeoplePage() { return <section><h2>{t('peopleTitle')}</h2><table><thead><tr><th>{t('people')}</th><th>{t('organization')}</th><th>{t('nationalIdLabel')}</th></tr></thead><tbody><tr><td>{t('samplePerson')}</td><td>{t('sampleOrganization')}</td><td>{t('maskedNationalId')}</td></tr></tbody></table></section>; }
