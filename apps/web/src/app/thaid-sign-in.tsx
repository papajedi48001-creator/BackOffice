const messages: Record<string, string> = {
  unavailable: 'ระบบ ThaID ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  failed: 'เข้าสู่ระบบด้วย ThaID ไม่สำเร็จ กรุณาลองใหม่',
  inactive: 'บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ',
  not_found: 'ไม่พบเลขบัตรประชาชนนี้ในทะเบียนบุคลากร กรุณาติดต่อผู้ดูแลระบบ'
};

/** เข้าสู่ระบบด้วย ThaID: a link (not a form) because the start route redirects the browser to DOPA, where the ThaID app confirms it. */
export function ThaidSignIn({ enabled, outcome, divider = false }: { enabled: boolean; outcome: string | undefined; divider?: boolean }) {
  if (!enabled) return null;
  const message = outcome && Object.hasOwn(messages, outcome) ? messages[outcome] : null;
  return (
    <div className="provider-sign-in thaid-sign-in">
      {divider ? <p className="provider-sign-in-divider"><span>หรือ</span></p> : null}
      {message && <p className="form-error" role="alert">{message}</p>}
      <a className="provider-sign-in-button" href="/api/auth/thaid/start">
        <span className="provider-sign-in-label">เข้าสู่ระบบด้วย ThaID<span aria-hidden="true"> →</span></span>
      </a>
    </div>
  );
}
