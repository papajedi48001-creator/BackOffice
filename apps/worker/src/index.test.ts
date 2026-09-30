import { createWorkerApplication } from './index';

describe('createWorkerApplication', () => {
  it('creates the worker application without starting consumers', () => {
    expect(createWorkerApplication({ start: false })).toBeDefined();
  });
});
