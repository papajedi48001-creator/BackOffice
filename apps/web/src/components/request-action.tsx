'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { loadRequestForm, type RequestFormData } from '../app/(app)/request-forms';
import type { SubmitIconName } from '../lib/modules';
import { matchModule } from '../lib/module-theme';
import type { NavigationItem } from './app-shell';
import { FormDialog } from './form-dialog';
import { RequestForm } from './request-form';

const glyphs: Record<SubmitIconName, React.ReactNode> = {
  // calendar with a plus
  leave: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 13v6M9 16h6"/></>,
  // briefcase
  travel: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18M11 13v2h2v-2"/></>,
  car: <><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H8.3a2 2 0 0 0-1.6.8L4 10l-1.5.6C1.7 10.9 1 11.6 1 12.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></>,
  // door with a check
  room: <><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M2 21h20"/><path d="M12 12h.01"/><path d="m16 8 2 2 4-4"/></>
};

/**
 * The current module's ยื่นคำขอ button, at the top of every page of the module. It opens the module's request form in
 * FormDialog without leaving the page; `?request=1` (where the /…/new deep links land) opens it on load. The form's
 * options come from the server. The popup closes from × or ยกเลิก, or when a successful submit navigates away.
 */
export function RequestAction({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const code = matchModule(pathname, navigation);
  const action = navigation.find((item) => item.module === code)?.submitAction;
  const deepLink = search?.get('request') === '1';
  const travelId = search?.get('travel') ?? undefined;
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RequestFormData | null>(null);
  const openedAt = useRef<string | null>(null);

  function show() {
    if (!code) return;
    openedAt.current = pathname;
    setData(null);
    setOpen(true);
    void loadRequestForm(code, deepLink ? travelId : undefined).then(setData, () => setData({ module: 'unavailable' }));
  }
  // Opens once when a /…/new deep link lands here with request=1.
  useEffect(() => { if (deepLink && action && !open) show(); }, [deepLink, code]);
  // A successful submit navigates to the new request; the popup goes with the page it was opened on.
  useEffect(() => { if (open && openedAt.current !== null && openedAt.current !== pathname) { setOpen(false); setData(null); } }, [pathname, open]);

  if (!action) return null;
  const close = () => { setOpen(false); setData(null); if (deepLink) router.replace(pathname); };
  return <>
    <button type="button" className="request-action" onClick={show}>
      <span className="request-action-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyphs[action.icon]}</svg></span>
      <span className="request-action-label">{t(action.label)}</span>
    </button>
    <FormDialog title={data?.module === 'fleet' && data.fromTravel ? t('fleetFromTravel') : t(action.label)} wide open={open} onOpenChange={(next) => { if (!next) close(); }}>
      {data ? <RequestForm data={data} /> : <p role="status">{t('requestFormLoading')}</p>}
    </FormDialog>
  </>;
}
