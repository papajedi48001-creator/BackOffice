# แถบเมนูของโมดูล แบบ 7.5 (ปุ่มไล่สีเรืองแสง)

## Goal
Make the section bar at the top of every module (`ModuleSubnav`) clearer and livelier. The user picked option 7.5 from the prototype `design-tweaks/subnav-segmented-options.html` in thread "ปรับแต่ง design ระบบ".

## Behaviour
- The sections sit in a rounded track: `--line-soft` fill with a `--line` inner border.
- The current section has a button with a gradient in the module colour, light to dark (`--accent` to `--accent-strong`) and white bold text. The button glows and breathes slowly, like the current icon in the sidebar.
- The button slides to a section as soon as it is clicked (`is-active`), and follows any other navigation, such as the back button, through the pathname.
- Until the script has placed the button, the current link draws the same gradient itself, so the page never shows a bar with nothing marked.
- On the first placement the button does not slide in from the left edge.
- Pointing at another section darkens its text to `--ink`.
- The bar keeps wrapping on narrow screens, and the button follows a section to its row. A window resize places the button again.
- Prefers-reduced-motion turns off the slide and the glow, through the global motion rule.
- DESIGN.md allows a gradient on this bar.

## Out of scope
Per-module bar styles, and icons in the sections.
