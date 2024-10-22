import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { YarnPackageManagerSupport } from '../../yarn.js';

describe('yarn: end-to-end', () => {
  it('should find workspaces', async () => {
    const yarnSupport = new YarnPackageManagerSupport();
    const workspaces = await yarnSupport.findWorkspaces(
      join(import.meta.dirname, 'test-project'),
    );
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('@xeel-dev/yarn-test-workspace-1');
    expect(workspaces[0].description).toBe('Workspace 1');
    expect(workspaces[0].ecosystem).toBe('NPM');
    expect(workspaces[0].path).toBe(
      join(import.meta.dirname, 'test-project', 'packages', 'workspace-1'),
    );
  });

  it('should list outdated dependencies', async () => {
    const yarnSupport = new YarnPackageManagerSupport();
    const workspaces = await yarnSupport.findWorkspaces(
      join(import.meta.dirname, 'test-project'),
    );
    const outdated = await yarnSupport.listOutdatedDependencies(workspaces[0]);
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
