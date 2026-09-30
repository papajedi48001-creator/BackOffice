export default function HomePage() {
  return (
    <main className="welcome-shell">
      <section aria-labelledby="page-title" className="welcome-panel">
        <p className="eyebrow">โรงพยาบาลวาริชภูมิ</p>
        <h1 id="page-title">ระบบ Back Office</h1>
        <p className="welcome-copy">พื้นที่กลางสำหรับจัดการคำขอ ทรัพยากร และงานสนับสนุนภายในองค์กร</p>
        <p className="welcome-status" role="status">กำลังเตรียมระบบพื้นฐานสำหรับโครงการนำร่อง</p>
      </section>
    </main>
  );
}
