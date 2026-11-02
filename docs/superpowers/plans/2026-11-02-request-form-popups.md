# Request form popups plan

- [x] Test: `RequestAction` renders a button; click opens a dialog containing the form and does not navigate; ยกเลิก closes it; `?request=1` opens it. (`components/request-action.test.tsx`)
- [x] Test: `loadRequestForm` loads each module's options with the same checks. (`app/(app)/request-forms.test.ts`)
- [x] Test: `/…/new` pages redirect to the module page with `request=1`.
- [x] Test: request modules have no sub-nav section pointing at their submit href. (`lib/modules.test.ts`)
- [x] Implement `FormDialog` children-own-form mode, `request-forms.ts`, `RequestAction`, page redirects, sub-nav removal, DESIGN.md rule.
- [x] Verify: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`.
