import { Dirent } from 'fs';
import { readdir } from 'fs/promises';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { exec } from '../../utils/exec.js';
import NpmEcosystemSupport from '../index.js';

vi.mock('fs/promises');
vi.mock('node:fs');
vi.mock(import('../../utils/exec.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    exec: vi.fn(),
  };
});
vi.mock('../package-manager/npm');
vi.mock('../package-manager/pnpm');
vi.mock('../package-manager/yarn');

describe('NpmEcosystemSupport', () => {
  const mockReaddir = vi.mocked(readdir);
  const mockReadFileSync = vi.mocked(readFileSync);
  const mockExec = vi.mocked(exec);

  const npmEcosystemSupport = new NpmEcosystemSupport();

  describe('findProjects', () => {
    it('should find projects with lockfiles', async () => {
      mockReaddir.mockResolvedValue([
        {
          isFile: () => true,
          name: 'package-lock.json',
          isDirectory: () => false,
        } as Dirent,
        {
          isFile: () => true,
          name: 'package.json',
          isDirectory: () => false,
        } as Dirent,
      ]);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ name: 'test-project', description: 'A test project' }),
      );

      const projects = await npmEcosystemSupport.findProjects('/test-path');

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'test-project',
        description: 'A test project',
        path: '/test-path',
        ecosystem: 'NPM',
        packageManager: 'npm',
      });
    });

    it('should ignore directories listed in .gitignore', async () => {
      mockReaddir.mockResolvedValue([
        {
          isDirectory: () => true,
          name: 'node_modules',
          isFile: () => false,
        } as Dirent,
        {
          isDirectory: () => true,
          name: '.git',
          isFile: () => false,
        } as Dirent,
      ]);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const projects = await npmEcosystemSupport.findProjects('/test-path');

      expect(projects).toHaveLength(0);
    });
  });
});
