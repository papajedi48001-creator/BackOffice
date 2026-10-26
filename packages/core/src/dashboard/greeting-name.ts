// Thai titles written before a name, longest first so นางสาว wins over นาง and นายแพทย์ over นาย.
const titles = ['ทันตแพทย์หญิง', 'เภสัชกรหญิง', 'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ทันตแพทย์', 'แพทย์หญิง', 'นายแพทย์', 'เภสัชกร', 'นางสาว', 'ทพญ.', 'นพ.', 'พญ.', 'ทพ.', 'ทญ.', 'ภก.', 'ภญ.', 'ดร.', 'นาย', 'นาง']
  .sort((left, right) => right.length - left.length);

/** The name a greeting uses: the first name on the HR record, else the display name without its title and surname. */
export function greetingName(displayName: string | null, firstName: string | null): string | null {
  if (firstName?.trim()) return firstName.trim();
  let rest = displayName?.trim() ?? '';
  for (let stripped = true; stripped;) {
    stripped = false;
    const title = titles.find((candidate) => rest.startsWith(candidate) && rest.length > candidate.length);
    if (title) { rest = rest.slice(title.length).trim(); stripped = true; }
  }
  return rest.split(/\s+/)[0] || null;
}
