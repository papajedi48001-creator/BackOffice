/** A full page load. Used after the session's role changes, so no page or cached redirect from the old role survives. */
export function hardNavigate(href: string): void {
  window.location.assign(href);
}
