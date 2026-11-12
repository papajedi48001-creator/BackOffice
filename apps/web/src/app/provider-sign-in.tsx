const messages: Record<string, string> = {
  unavailable: 'ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน',
  failed: 'เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่',
  inactive: 'บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ'
};

/** The second way in: a link (not a form) because the start route redirects the browser to the portal. */
export function ProviderSignIn({ enabled, outcome, passwordOpen = true }: { enabled: boolean; outcome: string | undefined; passwordOpen?: boolean }) {
  if (!enabled) return null;
  const message = outcome === 'unavailable' && !passwordOpen ? 'ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'
    : outcome && Object.hasOwn(messages, outcome) ? messages[outcome] : null;
  return (
    <div className="provider-sign-in">
      {passwordOpen ? <p className="provider-sign-in-divider"><span>หรือ</span></p> : null}
      {message && <p className="form-error" role="alert">{message}</p>}
      <a className="provider-sign-in-button" href="/api/auth/provider/start">
        {/* The ministry's own Provider ID mark, as on its sign-in buttons; the text below names the link. */}
        <span className="provider-sign-in-logo"><img src="/provider-id-logo.png" alt="" width={150} height={64} /></span>
        <span className="provider-sign-in-label">เข้าสู่ระบบด้วย Provider ID<span aria-hidden="true"> →</span></span>
      </a>
    </div>
  );
}
