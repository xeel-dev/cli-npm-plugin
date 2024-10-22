import { describe, expect, it, vi } from 'vitest';
import { exec, ExecError } from '../../../../utils/exec.js';
import { PnpmPackageManagerSupport } from '../../pnpm.js';

vi.mock(import('../../../../utils/exec.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

describe('PnpmPackageManagerSupport', () => {
  describe('findWorkspaces', () => {
    it('should return workspaces excluding the root directory', async () => {
      const mockOutput = `[
        {"name": "workspace1", "description": "desc1", "path": "/path/to/workspace1"},
        {"name": "workspace2", "description": "desc2", "path": "/path/to/workspace2"}
      ]
      `;
      vi.mocked(exec).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
        stderr: '',
      });
      const pnpmSupport = new PnpmPackageManagerSupport();
      const workspaces = await pnpmSupport.findWorkspaces('/path/to');

      expect(workspaces).toEqual([
        {
          name: 'workspace1',
          description: 'desc1',
          ecosystem: 'NPM',
          packageManager: 'pnpm',
          path: '/path/to/workspace1',
        },
        {
          name: 'workspace2',
          description: 'desc2',
          ecosystem: 'NPM',
          packageManager: 'pnpm',
          path: '/path/to/workspace2',
        },
      ]);
    });

    it('should handle errors and log them', async () => {
      vi.mocked(exec).mockResolvedValue({
        stdout: 'stdout error message',
        stderr: 'stderr error message',
        exitCode: 1,
      });

      const pnpmSupport = new PnpmPackageManagerSupport();
      await expect(pnpmSupport.findWorkspaces('/path/to')).rejects.toThrow(
        ExecError,
      );
    });
  });
});
