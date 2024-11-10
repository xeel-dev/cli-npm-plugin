import type { Project } from '@xeel-dev/cli/ecosystem-support';
import { resolve } from 'node:path';
import { exec } from '../../utils/exec.js';
import { NpmDependency, PackageManagerSupport } from '../index.js';
import { findDescription, getDependencyType } from './common.js';

export class YarnPackageManagerSupport implements PackageManagerSupport {
  public packageManager = 'yarn' as const;
  private packageVersionToDateCache: Record<string, Record<string, string>> =
    {};
  private packageDeprecationCache: Record<string, boolean> = {};

  private async findWorkspacesYarnV1(
    directoryPath: string,
  ): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout, stderr } = await exec(
      'yarn',
      ['workspaces', 'info', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      console.warn('Could not find workspaces', { stdout, stderr });
      return [];
    }
    const workspaces = JSON.parse(stdout.toString());
    return Object.entries(workspaces)
      .map(([name, workspace]) => {
        const workspaceInfo = workspace as { location: string };
        if (!workspaceInfo.location) {
          return null;
        }
        const path = resolve(directoryPath, workspaceInfo.location);
        const project = {
          name,
          ecosystem: 'NPM' as const,
          path,
        };
        return findDescription(project);
      })
      .filter((workspace): workspace is Project<'NPM'> => workspace !== null);
  }

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout, stderr } = await exec(
      'yarn',
      ['workspaces', 'list', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      // Yarn v1 does not support `yarn workspaces list --json`, it
      // uses a different command to list workspaces
      return this.findWorkspacesYarnV1(directoryPath);
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
    const dependencies: NpmDependency[] = [];
    try {
      const outdatedOutput = stdout.toString();
      if (!outdatedOutput) {
        return dependencies;
      }
      // The outdated output may be multiple JSON objects, one per line, try to parse each
      const lines = outdatedOutput.split('\n');
      for (const line of lines) {
        let json = JSON.parse(line);
        if (!json) {
          continue;
        }
        let outdated;
        if (json.type === 'table') {
          console.log('Yarn v1 detected…');
          // Yarn v1
          const { head, body } = json.data;
          outdated = [];

          // Create a mapping of column names to their indices
          const columnIndices: { [key: string]: number } = {};
          head.forEach((columnName: string, index: number) => {
            columnIndices[columnName.toLowerCase()] = index;
          });

          // Iterate over each package in the body
          for (const row of body) {
            const name = row[columnIndices['package']];
            const current = row[columnIndices['current']];
            const latest = row[columnIndices['latest']];
            const type = row[columnIndices['package type']];

            outdated.push({ name, type, current, latest });
          }
        } else {
          // Yarn v2+
          outdated = json;
        }
        if (!outdated || !Array.isArray(outdated)) {
          continue;
        }
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
        if (dependencies.length > 0) {
          // If we have found some dependencies, we can break out of the loop
          break;
        }
      }
    } catch (error) {
      console.error('Error parsing yarn outdated output', error);
      if (exitCode !== 0) {
        if (!hasAttemptedInstall) {
          await this.installOutdatedPlugin(project.path);
          return this.listOutdatedDependencies(project, true);
        }
      }
    }
    return dependencies;
  }
}
