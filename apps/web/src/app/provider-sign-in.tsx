const messages: Record<string, string> = {
  unavailable: 'ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน',
  failed: 'เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่',
  inactive: 'บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ'
};

/** The second way in: a link (not a form) because the start route redirects the browser to the portal. */
export function ProviderSignIn({ enabled, outcome }: { enabled: boolean; outcome: string | undefined }) {
  if (!enabled) return null;
  const message = outcome && Object.hasOwn(messages, outcome) ? messages[outcome] : null;
  return (
    <div className="provider-sign-in">
      <p className="provider-sign-in-divider"><span>หรือ</span></p>
      {message && <p className="form-error" role="alert">{message}</p>}
      <a className="provider-sign-in-button" href="/api/auth/provider/start">เข้าสู่ระบบด้วย Provider ID</a>
    </div>
  );
}
