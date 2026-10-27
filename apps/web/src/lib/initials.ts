const prefixes = ['ทันตแพทย์หญิง', 'เภสัชกรหญิง', 'ทันตแพทย์', 'แพทย์หญิง', 'นายแพทย์', 'เภสัชกร', 'นางสาว', 'ทพญ.', 'น.ส.', 'ด.ช.', 'ด.ญ.', 'ดร.', 'นพ.', 'พญ.', 'ทพ.', 'ภก.', 'ภญ.', 'นาง', 'นาย'];

/** Up to two letters for the avatar when there is no photo: the first letter of the first and last name, without the prefix. */
export function initialsOf(displayName: string | null): string {
  let name = displayName?.trim() ?? '';
  const prefix = prefixes.find((value) => name.startsWith(value) && name.length > value.length);
  if (prefix) name = name.slice(prefix.length).trim();
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]!.toUpperCase());
  return letters.join('') || '?';
}
