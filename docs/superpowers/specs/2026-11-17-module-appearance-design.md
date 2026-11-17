# สีและไอคอนของโมดูล (module appearance)

## Goal
On ตั้งค่าโปรแกรม (`/admin/modules`), a ผู้ดูแลระบบ can choose each module's colour and icon. The choice applies everywhere the module shows: the sidebar, the หน้าหลัก tiles, the module's own pages (`--accent`), and the ตั้งค่าโปรแกรม table. "คืนค่าเริ่มต้น" returns to the registry default.

The user approved the prototype `module-settings-options.html` (section 2) in thread "ปรับแต่ง design ระบบ".

## Behaviour
- Each row in ตั้งค่าโปรแกรม has a palette button (`aria-label="สีและไอคอน <module>"`) at the start of the actions cell. It opens a `FormDialog` titled `สีและไอคอน: <module>`. The dialog has:
  - a live preview: a sidebar item on deep blue, and a หน้าหลัก tile;
  - a colour group: "เดิม" (the default, null) plus 16 palette swatches;
  - an icon group: "เดิม" (null) plus every `ModuleIconName`;
  - a "บันทึก" button.
- Colours come from a fixed palette in `@backoffice/contracts` (`moduleAccentPalette`), so white text stays at least 4.5:1 and nothing free-form reaches CSS. Icons come from `moduleIconNames`, also in contracts. `ModuleIconName` in the web app is derived from that list.
- Stored in two new nullable columns on `admin_module_setting`, `accent_color VARCHAR(7)` and `icon VARCHAR(32)` (migration `0040_module_appearance.sql`). NULL means the default. A row created by an appearance change keeps mode `ON`, which is the same as having no row.
- `AdminService.setModuleAppearance(actor, code, { color, icon })` runs in one transaction:
  - it upserts the row;
  - it writes audit event `admin.module.appearance_changed` with `{ moduleCode, fromColor, toColor, fromIcon, toIcon }`;
  - setting the same values returns `changed: false`.
  - The admin module may be recoloured; locking only applies to its mode.
- API: `PUT /api/admin/modules/[code]/appearance` with body `{ color: string|null, icon: string|null }` (strict). It uses `withAdmin`, so only the admin tier can call it, matching the mode switch. It returns 404 for a module that is not live.
- Reading: `AdminQueries.moduleAppearance()` returns `{ [code]: { color, icon } }`. A stored value outside the palette or icon list is dropped, so the default shows.
  - `readModuleAppearance(db)` in the web app counts any failure as "no overrides".
  - The `(app)` layout renders `<style>` with `[data-module="<code>"]{--accent:<hex>}` for each override. The hex is from the palette, so it cannot inject CSS. Derived shades already follow `--accent`.
  - Icons are replaced in `navigationFrom` (sidebar), on the dashboard modules (tiles), and on the ตั้งค่าโปรแกรม rows.
- The audit page labels the new action "เปลี่ยนสีหรือไอคอนโมดูล".

## Out of scope
Per-person colours, uploaded icons, and changing module names.
