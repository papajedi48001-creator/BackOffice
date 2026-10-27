# ใบขอใช้รถจากไปราชการแบบอัตโนมัติ

Status: asked for by wasan in the thread "พัฒนาระบบจองรถยนต์" on 2026-10-27, after PR #34. This changes rule 3 of `2026-10-27-fleet-design.md`.

## What changes

wasan's ask: once a คำขอไปราชการ by รถราชการ is approved, nobody should have to press ขอใช้รถ. The ใบขอใช้รถ goes straight to the หัวหน้าหมวดยานพาหนะ, with no review by the head of งาน or กลุ่มงาน.

The ใบ is filed **automatically** at the moment the trip becomes approved. That moment is a decision (อนุมัติ or ไม่อนุมัติ) on one member's คำขอ that leaves the trip with nobody in review or returned and at least one person approved, which is what `tripStatus` calls APPROVED.

The automatic ใบ is a ใบ filed from ไปราชการ under the existing rule 2. It has no head คำขอ, starts in รอจัดรถ, and the fleet managers get "มีใบขอใช้รถรอจัดรถ". It is filed only when all of the following hold:

- The vehicle is `GOVERNMENT_CAR` and the trip has not ended (Bangkok today ≤ end date).
- The trip has no live ใบ (the same check as `TRAVEL_ALREADY_HAS_CAR`).
- A requester can be found: the หัวหน้าคณะ if their own คำขอ is approved, otherwise the first approved member by person id. The requester has a current unit, which becomes the ใบ's organization.

If any of these does not hold, nothing is filed. The ขอใช้รถ button stays on the ไปราชการ page as the fallback. It is shown under the same conditions as before, so it appears only while the trip has no live ใบ: for example after the fleet team declines the ใบ, or for trips approved before this change.

## The ใบ's content

| Field | Value |
|---|---|
| ภารกิจ | the trip subject |
| ปลายทาง and จังหวัด | the place and the province |
| เวลาออก | start date 08:00 Bangkok, or 13:00 when the trip starts in the afternoon |
| เวลากลับ | end date 17:00 Bangkok, or 12:00 when the trip ends in the morning |
| ผู้โดยสาร | the approved members, with their count and names |
| เบอร์ติดต่อ | empty |

These are the same defaults the form already prefills. The time-window rules for a ใบ typed by hand (not in the past, within 90 days, at most 30 days, 15-minute steps) do not apply, because the trip was already approved up the chain. The fleet team sets the real times on the เที่ยวรถ.

## Recording

- History: a new action `FILED_FROM_TRAVEL` ("สร้างจากคำขอไปราชการที่อนุมัติแล้ว"), by the approver whose decision made the trip approved.
- Audit: `fleet.request.submitted` by that approver, with metadata `{ reference, status: 'WAITING', travelId }`.
- Notices: `waiting` to the fleet managers, as for a manual filing from ไปราชการ.

## Where it runs

The decision route (`POST /api/requests/<id>/decisions`) calls `FleetRequestService.fileFromTravelDecision(requestId, actorPersonId)` right after a decision on an `official-travel` คำขอ commits.

That call is its own READ COMMITTED transaction. It locks `official_travel` first, exactly as a manual filing does, so a manual filing and an automatic one cannot both create a ใบ. The ใบ's insert, history, audit and outbox are written in that one transaction.

The call runs after the decision commits rather than inside it, for two reasons. The decision transaction runs REPEATABLE READ with snapshot isolation, so reading the other members' fresh statuses there would fail concurrent decisions with ER_CHECKREAD. And locking the trip inside it would reverse the trip → คำขอ lock order that ไปราชการ cancel and resubmit use.

If the follow-up fails, the decision still stands, and the route logs only the error code. The fallback button covers that case.
