# Plan: แถบเมนูของโมดูล แบบ 7.5

Spec: `docs/superpowers/specs/2026-11-19-module-subnav-glow-design.md`

- [x] **1. Component:** in `components/module-subnav.tsx`, add `span.subnav-thumb` (aria-hidden, `data-at`) to the track. Place it under the active section, mark the track `is-ready`, and move it on click and on pathname change.
  - Test: `module-subnav.test.tsx` checks the thumb on the current section, `is-ready`, and that a click moves `data-at` and `is-active`.
- [x] **2. CSS:** add the track, the gradient thumb with `subnav-breathe`, the white current text, and the not-ready fallback to `styles.css`.
  - Test: `styles-subnav.test.ts`.
- [x] **3. DESIGN.md:** describe the bar and allow its gradient.
- [x] **4. Verify:** run `pnpm lint && pnpm typecheck && pnpm test` and `git diff --check`, and take a screenshot of the real CSS.
