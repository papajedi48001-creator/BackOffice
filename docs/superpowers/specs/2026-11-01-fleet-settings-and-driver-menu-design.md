# ยานพาหนะ: deleting cars and drivers, and a menu for drivers only

Status: asked for by wasan in the thread "พัฒนาระบบจองรถยนต์" on 2026-10-30. This builds on `2026-10-27-fleet-design.md`.

## งานขับของฉัน only for drivers

The งานขับของฉัน link in the module's section bar shows only to a person on the driver list who is not paused, meaning `fleet_driver.is_active = 1`. This is the same check the page makes. It replaces the earlier choice of showing the link to everyone.

`ModuleSection` gains an optional `available(db, subject)`, the section-level twin of `ModuleEntry.available`. `ModuleLayout` and `ModuleIndex` filter sections through `availableSections`. A failing check leaves the link in place, as it does for modules. The page still checks on the server, so the link is never the security boundary.

## Adding, editing and deleting cars and drivers

Adding and editing already exist on ตั้งค่า. This change adds **ลบ**, for the หัวหน้าหมวดยานพาหนะ (`fleet.manage`) only:

- `DELETE /api/fleet/vehicles/<id>` calls `FleetCatalogService.deleteVehicle`.
- `DELETE /api/fleet/drivers/<personId>` calls `FleetCatalogService.deleteDriver`.

A driver delete removes the `fleet_driver` row only. The บุคลากร record stays.

Each delete asks for confirmation in a dialog first, then removes the car or driver and audits it:

- `fleet.vehicle.delete`, with metadata `{ registration }`.
- `fleet.driver.delete`, with empty metadata.

A car or driver that was ever put on a เที่ยวรถ cannot be deleted. The request answers `409 HAS_HISTORY`, with a message telling the manager to set the car to ปลดระวาง, or press หยุดขับ for the driver, instead. Past trips keep their car and driver this way.

The foreign key from `fleet_trip` decides whether a car or driver has history. Because of that, no separate read can race a new assignment.
