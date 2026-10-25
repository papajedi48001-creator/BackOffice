import { describe, expect, it } from 'vitest';
import { openingView } from './opening-view';

describe('openingView', () => {
  it('lets the officer start and edit, and only the supervisor decide', () => {
    expect(openingView(null, { canEdit: true, canDecide: false })).toBe('start');
    expect(openingView(null, { canEdit: false, canDecide: true })).toBe('missing');
    expect(openingView('DRAFT', { canEdit: true, canDecide: false })).toBe('edit');
    expect(openingView('DRAFT', { canEdit: false, canDecide: true })).toBe('draft');
    expect(openingView('SUBMITTED', { canEdit: true, canDecide: false })).toBe('waiting');
    expect(openingView('SUBMITTED', { canEdit: false, canDecide: true })).toBe('decide');
    expect(openingView('CERTIFIED', { canEdit: true, canDecide: true })).toBe('certified');
  });
});
