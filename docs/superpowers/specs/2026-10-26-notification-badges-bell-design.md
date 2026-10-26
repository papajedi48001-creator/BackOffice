# Menu badges, notification bell and the คำขอ inbox

Date: 2026-10-26. Requested by wasan in the HR thread (four points, all in one message).

## Problems

1. Only การแจ้งเตือน shows a count in the sidebar. การลา and จองห้องประชุม have counts on the main page tiles but not on their menu items.
2. There is no way to see new notices without opening การแจ้งเตือน.
3. The main page says "1 คำขอรอพิจารณา" and the คำขอ tile shows 1, but `/requests` only lists the person's own requests. The count includes approval steps from every module (a ใบลา waiting for the director, for example), and no page lists them in one place.
4. Everyone sees the คำขอ menu, even someone who never made a request and never had one to approve.

## Behaviour

### Red counts on menus
- Each sidebar item, and each main-page tile, shows a red circle with the count when that module has work waiting for the person:
  - คำขอ: approval steps waiting on them, across all modules.
  - การแจ้งเตือน: unread in-app notices.
  - การลา and จองห้องประชุม: their existing badge functions.
- A count of 0, or a count that fails to load or takes longer than 2 seconds, shows no circle and does not break the page. This reuses `collectBadges`.
- The circle is red: `#dc2626` with white bold text, fully rounded.

### Notification bell
- A bell button sits at the top right of every signed-in page, with a red circle showing the unread count.
- Pressing it opens a panel with the 10 newest in-app notices. Each one reads `[<module>] > [<subject>]` with its Bangkok time, and unread notices are marked.
- Pressing a notice marks it read through the existing `PATCH /api/notifications/:id/read`, then opens the page that call returns.
- The panel ends with a link to `/notifications` (ดูทั้งหมด). Escape or a second press closes it.
- The decision reason is never part of a subject. This rule already holds and stays.

### Subjects that name the status and who acted
- When a step of a คำขอ or ใบลา is decided, the requestor is told for every step, not only the last. The subject is `<action> > <actor's position>`:
  - The actions are อนุมัติ, ไม่อนุมัติ and ส่งกลับแก้ไข.
  - The position is `person.position_title` of the person who decided, which may be a ผู้แทน. When it is empty, ผู้อนุมัติ is used.
- When an intermediate approval moves the request on, the next approver still gets "มีคำขอรอพิจารณา".
- For a room booking decision, the booker gets `อนุมัติ > ผู้รับผิดชอบ (<ref>)` or `ไม่อนุมัติ > ผู้รับผิดชอบ (<ref>)`.
- Notices sent before this change keep their old text.

### คำขอ page
- A "รอฉันพิจารณา" table lists every request whose current pending step is assigned to the person, matching the count's rule. Its columns are module, reference, requestor and submitted date.
  - Each reference links to that module's page for the request. A ใบลา goes to `/leave/requests/:id`, and anything else goes to `/requests/:id`.
- The person's own requests stay below. Their links use the same per-module target.

### Hiding คำขอ
- The คำขอ menu item and tile appear only when the person has made a request, or has ever been assigned an approval step.
- The `/requests` page still works when opened directly. Authorization is unchanged.

## Out of scope
- Live updates. The counts and the bell refresh on navigation, not in the background.
- Email.
