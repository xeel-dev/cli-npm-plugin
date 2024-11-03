import type { Project } from '@xeel-dev/cli/ecosystem-support';
import { resolve } from 'node:path';
import { exec, ExecError } from '../../utils/exec.js';
import { NpmDependency, PackageManagerSupport } from '../index.js';
import { findDescription, getDependencyType } from './common.js';

export class YarnPackageManagerSupport implements PackageManagerSupport {
  public packageManager = 'yarn' as const;
  private packageVersionToDateCache: Record<string, Record<string, string>> =
    {};
  private packageDeprecationCache: Record<string, boolean> = {};

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout, stderr } = await exec(
      'yarn',
      ['workspaces', 'list', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      throw new ExecError('yarn workspaces list --json', {
        exitCode,
        stdout,
        stderr,
      });
    }
    // The output is one JSON object per line
    const workspaces = stdout
      .toString()
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as { location: string; name: string })
      .filter(({ location }) => location !== '.');
    // Yarn's CLI does not provide the workspace description
    return workspaces
      .map((workspace) => ({
        name: workspace.name,
        path: resolve(directoryPath, workspace.location),
        ecosystem: 'NPM' as const,
        packageManager: 'yarn' as const,
      }))
      .map(findDescription);
  }

  private async installOutdatedPlugin(path: string) {
    console.log(`Installing yarn plugin: yarn-plugin-outdated…`);
    const { stdout } = await exec('yarn --version');
    const yarnMajorVersion = Number(stdout.toString().split('.')[0]);
    if (yarnMajorVersion < 3) {
      throw new Error('Yarn version must be at least 3');
    }
    await exec(
      `yarn`,
      [
        'plugin',
        'import',
        `https://go.mskelton.dev/yarn-outdated/v${yarnMajorVersion}`,
      ],
      { cwd: path },
    );
  }

  async listOutdatedDependencies(
    project: Project<'NPM'>,
    hasAttemptedInstall?: boolean,
  ): Promise<NpmDependency[]> {
    const { exitCode, stdout, stderr } = await exec(
      'yarn',
      ['outdated', '--json', '--workspace', '.'],
      {
        cwd: project.path,
      },
    );
    if (exitCode !== 0) {
      if (!hasAttemptedInstall) {
        await this.installOutdatedPlugin(project.path);
        return this.listOutdatedDependencies(project, true);
      }
      throw new ExecError('yarn outdated --json --workspace .', {
        exitCode,
        stdout,
        stderr,
      });
    }
    const dependencies: NpmDependency[] = [];

    const outdated = JSON.parse(stdout.toString());
    for (const dependency of outdated) {
      if (!dependency.current) {
        throw new Error(
          'Could not find current version. Did you run `yarn install`?',
        );
      }
      const name = dependency.name;
      if (this.packageVersionToDateCache[name] === undefined) {
        const { stdout } = await exec(
          'yarn',
          ['npm', 'info', name, '--json', '--fields', 'time'],
          {
            cwd: project.path,
          },
        );
        const packageInfo = JSON.parse(stdout);
        this.packageVersionToDateCache[name] = packageInfo.time;
        this.packageDeprecationCache[name] =
          packageInfo.deprecated !== undefined;
      }
      let type;
      try {
        type = getDependencyType(dependency.type);
      } catch (e) {
        continue;
      }
      dependencies.push({
        name,
        ecosystem: 'NPM',
        type,
        current: {
          version: dependency.current,
          isDeprecated: false,
          date: new Date(
            this.packageVersionToDateCache[name][dependency.current],
          ),
        },
        latest: {
          version: dependency.latest,
          isDeprecated: this.packageDeprecationCache[name],
          date: new Date(
            this.packageVersionToDateCache[name][dependency.latest],
          ),
        },
      });
    }

    return dependencies;
  }
}
