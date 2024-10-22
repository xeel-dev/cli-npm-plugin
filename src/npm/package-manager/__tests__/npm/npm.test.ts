import { describe, expect, it, vi } from 'vitest';
import { exec, ExecError } from '../../../../utils/exec.js';
import { NpmPackageManagerSupport } from '../../npm.js';

vi.mock(import('../../../../utils/exec.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

describe('NpmPackageManagerSupport', () => {
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

      const npmSupport = new NpmPackageManagerSupport();
      const workspaces = await npmSupport.findWorkspaces('/path/to');

      expect(workspaces).toEqual([
        {
          name: 'workspace1',
          description: 'desc1',
          ecosystem: 'NPM',
          packageManager: 'npm',
          path: '/path/to/workspace1',
        },
        {
          name: 'workspace2',
          description: 'desc2',
          ecosystem: 'NPM',
          packageManager: 'npm',
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

      const npmSupport = new NpmPackageManagerSupport();
      await expect(npmSupport.findWorkspaces('/path/to')).rejects.toThrow(
        ExecError,
      );
    });
  });
});
