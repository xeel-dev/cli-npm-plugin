import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { PnpmPackageManagerSupport } from '../../pnpm.js';

describe('pnpm: end-to-end', () => {
  it('should find workspaces', async () => {
    const pnpmSupport = new PnpmPackageManagerSupport();
    const workspaces = await pnpmSupport.findWorkspaces(
      join(import.meta.dirname, 'test-project'),
    );
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('@xeel-dev/pnpm-test-workspace-1');
    expect(workspaces[0].description).toBeUndefined();
    expect(workspaces[0].ecosystem).toBe('NPM');
    expect(workspaces[0].path).toBe(
      join(import.meta.dirname, 'test-project', 'packages', 'workspace-1'),
    );
  });

  it('should list outdated dependencies', async () => {
    const pnpmSupport = new PnpmPackageManagerSupport();
    const workspaces = await pnpmSupport.findWorkspaces(
      join(import.meta.dirname, 'test-project'),
    );
    const outdated = await pnpmSupport.listOutdatedDependencies(workspaces[0]);
    expect(outdated).toHaveLength(1);
    const dependency = outdated[0];
    expect(dependency.name).toBe('@types/node');
    expect(dependency.current).toMatchObject(
      expect.objectContaining({
        isDeprecated: expect.any(Boolean),
        date: expect.any(Date),
        version: expect.stringMatching(/^14\.\d+\.\d+$/),
      }),
    );
    expect(dependency.latest).toMatchObject(
      expect.objectContaining({
        isDeprecated: false,
        date: expect.any(Date),
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      }),
    );
    expect(dependency.ecosystem).toBe('NPM');
    expect(dependency.type).toBe('DEV');
  });
});
