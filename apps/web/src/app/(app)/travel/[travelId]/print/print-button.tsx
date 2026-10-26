'use client';

import { t } from '@backoffice/i18n';

/** Opens the browser's print dialog; print CSS hides it and the app's navigation. */
export function PrintButton() {
  return <div className="travel-print-actions"><button type="button" onClick={() => window.print()}>{t('travelPrintAction')}</button></div>;
}
