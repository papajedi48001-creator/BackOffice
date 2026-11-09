# UI animations plan

Files: `apps/web/src/app/styles.css`, `apps/web/src/app/styles-motion.test.ts`, `DESIGN.md`.

- [x] Task 1: write failing test `styles-motion.test.ts` (tokens, keyframes, stagger, press, reduced motion). Verify: `pnpm --filter @backoffice/web exec vitest run src/app/styles-motion.test.ts` fails.
- [x] Task 2: add motion block to the end of `styles.css`; same command passes.
- [x] Task 3: document motion in `DESIGN.md` (section "Motion").
- [x] Task 4: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, screenshots.
