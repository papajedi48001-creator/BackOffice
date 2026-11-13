# ไปราชการ: invitation/vehicles/funding — plan
**Spec:** docs/superpowers/specs/2026-11-13-travel-invitation-funding-design.md
- [ ] Task 1 contracts: vehicles, invitation fields, costFunding, summarizeTravelFunding, usesGovernmentCar — tests in official-travel.test.ts. Verify: pnpm --filter @backoffice/contracts test.
- [ ] Task 2 db+core: migration 0039, schema, TravelService insert/update, TravelQueries detail (invitation + costs per item with funding), fleet uses usesGovernmentCar — integration test in travel-service.integration.test.ts.
- [ ] Task 3 web: travel-form (invitation fields, per-item funding select, new vehicles), detail + print pages, labels — tests in travel-form.test.tsx and page tests.
- [ ] Verify: pnpm lint && pnpm typecheck && pnpm test; integration with DATABASE_URL; git diff --check.
