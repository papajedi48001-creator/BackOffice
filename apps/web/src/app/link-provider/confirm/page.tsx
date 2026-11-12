import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppName } from '../../../components/app-name';
import { BrandLogo } from '../../../components/brand-logo';
import { getSharedDatabase } from '../../../lib/database';
import { externalLoginService, providerSsoConfig, providerTicketCookie } from '../../../lib/provider-sso';
import { openThaidLink, thaidConfig, thaidLinkCookie, ticketHashOf } from '../../../lib/thaid';
import { ConfirmLink } from './confirm-link';

export const dynamic = 'force-dynamic';

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function names(): Promise<{ personName: string; providerName: string } | null> {
  const config = await thaidConfig();
  const provider = await providerSsoConfig();
  const database = getSharedDatabase();
  if (!config || !provider || !database) return null;
  const jar = await cookies();
  const link = openThaidLink(jar.get(thaidLinkCookie)?.value, config.clientSecret);
  const ticket = jar.get(providerTicketCookie)?.value ?? '';
  if (!link || !ticket || !sameHash(link.ticketHash, ticketHashOf(ticket))) return null;
  const pending = await externalLoginService(database, provider.apiUrl).pendingLogin(ticket);
  const rows = pending ? await database.query<{ displayName: string | null }>('SELECT display_name AS displayName FROM person WHERE id = ? AND deleted_at IS NULL LIMIT 1', [link.personId]) : [];
  if (!pending || !rows[0]) return null;
  return { personName: rows[0].displayName ?? 'ไม่ทราบชื่อ', providerName: pending.displayName ?? 'ไม่ทราบชื่อ' };
}

/**
 * ยืนยันผูกบัญชี: ThaID has confirmed the บุคลากร; on a shared computer the MOPH ID session may be someone else's, so the person
 * checks both names here and confirms before the Provider ID account becomes theirs.
 */
export default async function ConfirmLinkPage() {
  const shown = await names().catch(() => null);
  if (!shown) {
    redirect('/link-provider?thaid=failed');
    return null;
  }
  return (
    <main className="welcome-shell">
      <div className="login-card link-provider-card">
        <section aria-labelledby="page-title" className="welcome-panel">
          <div className="login-mobile-brand"><BrandLogo size={48} decorative /><p className="eyebrow"><AppName /></p></div>
          <h1 id="page-title">ยืนยันผูกบัญชี Provider ID</h1>
          <div className="link-provider-identity" role="note">
            <p>ThaID ยืนยันว่าคุณคือ</p>
            <p className="link-provider-name">{shown.personName}</p>
            <p>บัญชี Provider ID ที่จะผูกกับคุณ</p>
            <p className="link-provider-name">{shown.providerName}</p>
            <p>ถ้าชื่อ Provider ID ไม่ใช่ชื่อของคุณ อย่าผูกบัญชี ให้ออกจากระบบ MOPH ID ก่อนแล้วเข้าสู่ระบบใหม่</p>
          </div>
          <ConfirmLink />
          <p className="login-help"><a href="/link-provider">ไม่ใช่บัญชีของฉัน</a></p>
        </section>
      </div>
    </main>
  );
}
