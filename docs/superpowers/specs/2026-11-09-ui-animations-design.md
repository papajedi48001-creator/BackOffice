# UI animations (เพิ่มความเคลื่อนไหวให้หน้าจอ)

Request: "เพิ่ม effect animation เข้าในระบบด้วยเพื่อความน่าสนใจ".

## Decisions
- CSS only in `apps/web/src/app/styles.css`; no new dependency, no JS.
- Motion tokens on `:root`: `--motion-fast` 150ms, `--motion-base` 220ms, `--motion-slow` 380ms, `--motion-stagger` 40ms, `--ease-out` cubic-bezier(.2,.8,.2,1).
- Page content (children of `.app-main` except the sticky topbar) and the login card / welcome panel fade and rise 8px on load.
- Module launcher tiles enter with a staggered rise (nth-child delay, capped at 12 steps).
- Buttons and button links: hover lift 1px, press `scale(.98)`; tiles keep their existing hover lift.
- Sidebar items slide 2px on hover.
- `form-error`, `room-conflicts`, `chat-error` alerts slide in.
- Popups keep the existing `dialog-in` / `backdrop-in` animation and close behaviour (buttons only).
- Profile panel fades in when opened.
- `prefers-reduced-motion: reduce` disables every animation and transition globally.
- Durations 150–400ms, ease-out. Theme colours unchanged.

## Testing
A Vitest test reads `styles.css` and asserts the tokens, keyframes, stagger rules, press feedback and a global reduced-motion rule exist.
