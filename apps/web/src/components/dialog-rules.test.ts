import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// DESIGN.md: every popup is ActionDialog, FormDialog or SectionEditor, and only its buttons close it.
const src = path.resolve(__dirname, '..');
const popupComponents = ['action-dialog.tsx', 'form-dialog.tsx', 'section-editor.tsx'].map((name) => path.join(src, 'components', name));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

it('builds every popup from the shared dialog components', () => {
  const ownDialogs = sourceFiles(src).filter((file) => !popupComponents.includes(file) && /<dialog[\s>]/.test(readFileSync(file, 'utf8')));
  expect(ownDialogs.map((file) => path.relative(src, file))).toEqual([]);
});

it('never lets Esc or a click outside close a popup', () => {
  for (const file of popupComponents) {
    const code = readFileSync(file, 'utf8');
    expect(code, path.basename(file)).toContain("setAttribute('closedby', 'none')");
    expect(code, path.basename(file)).toContain('onCancel={(event) => event.preventDefault()}');
    expect(code, path.basename(file)).not.toMatch(/event\.target === event\.currentTarget/);
  }
});
