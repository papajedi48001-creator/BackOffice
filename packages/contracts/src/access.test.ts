import { describe, expect, it } from 'vitest';
import { permissionModules, permissionSchema } from './access';

describe('permissionModules', () => {
  it('names the module of every permission; data.export follows the exported module', () => {
    for (const permission of permissionSchema.options) expect(permissionModules).toHaveProperty(permission);
    expect(permissionModules['data.export']).toBeNull();
    expect(permissionModules['inventory.opening.certify']).toBe('inventory');
  });
});
