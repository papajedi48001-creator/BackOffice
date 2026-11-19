# ทะเบียนบุคลากร แบบ A: design

Chosen from three mock-ups (wasan, 19 พ.ย. 2569). Superpowers skills followed by hand.

## Behaviour
1. สถานะ: `ACTIVE` shows **ปฏิบัติงาน**, `INACTIVE` **ลาออก**, new `TRANSFERRED` **ย้าย**. Any status other than ACTIVE cannot sign in; changing to it signs the person out. No migration: `employment_status` is VARCHAR(16). Import accepts TRANSFERRED; export writes the Thai label.
2. The list has a switch **แสดงเฉพาะปฏิบัติงาน**, on by default; status shows as a coloured chip.
3. Column **2FA**: Provider ID logo in colour when the person has an `identity_link`; ThaiD logo in colour when the person has signed in with ThaiD at least once (audit `identity.thaid_login` SUCCESS). Faded logo otherwise. Migration 0045 adds index `audit_event (action, target_id)`.
4. A pencil button ends each row; the name is plain text. The pencil opens the person's existing edit page inside a popup over the list (intercepting route `@modal/(.)[personId]`); it closes only from its ปิด button. Opening the URL directly still shows the full page.
5. Creating a username (new person or existing person) asks no password: the account gets `DEFAULT_RESET_PASSWORD` (P@ssw0rd#1) with must_change_password, and the screen shows an alert naming the temporary password. The password is never logged, audited or sent back by the API.
6. รหัสบุคลากร is shown read-only and can no longer be changed through the identity form (schema rejects it).
7. Nobody changes their own สถานะ (server: `SELF_STATUS`; UI hides the select on one's own record).
8. Admin and HR/module manager change another person's profile photo (already allowed by `profileAccess().editProfile`; covered by a test).
