/** Module whose href is the longest prefix of the path; 'home' for the main page and anything else. Safe for client components. */
export function matchModule(pathname: string, entries: ReadonlyArray<{ href: string; module?: string }>): string {
  let best: { href: string; module?: string } | undefined;
  for (const entry of entries) {
    if (!entry.module || entry.module === 'home') continue;
    if ((pathname === entry.href || pathname.startsWith(`${entry.href}/`)) && entry.href.length > (best?.href.length ?? 0)) best = entry;
  }
  return best?.module ?? 'home';
}
