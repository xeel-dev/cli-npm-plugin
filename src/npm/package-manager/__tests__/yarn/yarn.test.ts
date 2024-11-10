import { describe, expect, it, vi } from 'vitest';
import { exec } from '../../../../utils/exec.js';
import { YarnPackageManagerSupport } from '../../yarn.js';

vi.mock(import('../../../../utils/exec.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    exec: vi.fn(),
  };
});
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('YarnPackageManagerSupport', () => {
  describe('findWorkspaces', () => {
    it('should return workspaces excluding the root directory', async () => {
      const mockOutput = `{"location":".","name":"@xeel-dev/yarn-test"}
{"location":"packages/workspace-1","name":"@xeel-dev/yarn-test-workspace-1"}`;
      vi.mocked(exec).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
        stderr: '',
      });
      const yarnSupport = new YarnPackageManagerSupport();
      const workspaces = await yarnSupport.findWorkspaces('/path/to');

      expect(workspaces).toEqual([
        {
          name: '@xeel-dev/yarn-test-workspace-1',
          ecosystem: 'NPM',
          packageManager: 'yarn',
          path: '/path/to/packages/workspace-1',
        },
      ]);
    });

    it('should handle errors and log them', async () => {
      vi.mocked(exec).mockResolvedValue({
        stdout: 'stdout error message',
        stderr: 'stderr error message',
        exitCode: 1,
      });

      const yarnSupport = new YarnPackageManagerSupport();
      await expect(yarnSupport.findWorkspaces('/path/to')).resolves.toEqual([]);
    });

    it('should fall back to v1', async () => {
      vi.mocked(exec).mockResolvedValue({
        stdout: 'stdout error message',
        stderr: 'stderr error message',
        exitCode: 1,
      });
      vi.mocked(exec).mockResolvedValueOnce({
        stdout: '1.22.0',
        stderr: 'stderr error message',
        exitCode: 0,
      });

      const yarnSupport = new YarnPackageManagerSupport();
      await expect(yarnSupport.findWorkspaces('/path/to')).resolves.toEqual([]);
      await expect(exec).toHaveBeenCalledWith(
        'yarn',
        ['workspaces', 'list', '--json'],
        { cwd: '/path/to' },
      );
      await expect(exec).toHaveBeenCalledWith(
        'yarn',
        ['workspaces', 'info', '--json'],
        { cwd: '/path/to' },
      );
    });
  });
});
