import type { Project } from '@xeel-dev/cli/ecosystem-support';
import { resolve } from 'node:path';
import { exec } from '../../utils/exec.js';
import { NpmDependency, PackageManagerSupport } from '../index.js';
import { findDescription, getDependencyType, parseJSON } from './common.js';

class YarnClassicPackageManagerSupport implements PackageManagerSupport {
  private packageVersionToDateCache: { [key: string]: string } = {};
  private packageDeprecationCache: { [key: string]: boolean } = {};

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout } = await exec(
      'yarn',
      ['workspaces', 'info', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      console.warn('Could not find workspaces', { directoryPath });
      return [];
    }
    // Drop the first line, which is the version of the workspaces feature
    // And the last line, which is the "✨ Done in 0.00s." line
    const jsonOutput = stdout.toString().split('\n').slice(1, -1).join('\n');
    const workspaces = parseJSON(jsonOutput);
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

  private parseYarnOutdatedOutput(output: string) {
    const packages = [];
    try {
      // Yarn outputs a single JSON object per line, so we split by newlines
      const lines = output.split('\n');
      for (const line of lines) {
        try {
          const json = parseJSON(line);
          if (json.type === 'table') {
            const { head, body } = json.data;

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

              packages.push({ name, type, current, latest });
            }
          }
        } catch (error) {}
      }
    } catch (error) {
      console.error('Error parsing yarn outdated output', error);
      return null;
    }
    return packages;
  }

  async listOutdatedDependencies(
    project: Project<'NPM'>,
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
      const outdated = this.parseYarnOutdatedOutput(stdout.toString());
      if (!outdated || !Array.isArray(outdated)) {
        return dependencies;
      }
      for (const dependency of outdated) {
        if (!dependency.current) {
          throw new Error(
            'Could not find current version. Did you run `yarn install`?',
          );
        }
        const name = dependency.name;
        if (this.packageVersionToDateCache[name] === undefined) {
          const { stdout } = await exec('yarn', ['info', name, '--json'], {
            cwd: project.path,
          });
          const { data: packageInfo } = parseJSON(stdout);
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
    } catch (error) {
      console.error('Error parsing yarn outdated output', error);
    }
    return dependencies;
  }
}

class YarnBerryPackageManagerSupport implements PackageManagerSupport {
  private packageVersionToDateCache: { [key: string]: string } = {};
  private packageDeprecationCache: { [key: string]: boolean } = {};

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout } = await exec(
      'yarn',
      ['workspaces', 'list', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      console.warn('Could not find workspaces', { directoryPath });
      return [];
    }
    // The output is one JSON object per line
    const workspaces = stdout
      .toString()
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => parseJSON(line) as { location: string; name: string })
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
        // TODO host this somewhere to avoid network requests to a third-party website
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
      // If parsing fails, we try to install the outdated plugin
      const outdated = parseJSON(stdout.toString());
      if (!outdated || !Array.isArray(outdated)) {
        return dependencies;
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
          const packageInfo = parseJSON(stdout);
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
    } catch (error) {
      console.error('Error parsing yarn outdated output', error);
      if (exitCode !== 0) {
        if (
          !hasAttemptedInstall &&
          stderr
            .toString()
            .includes('Couldn\'t find a script named "outdated".')
        ) {
          await this.installOutdatedPlugin(project.path);
          return this.listOutdatedDependencies(project, true);
        }
      }
    }
    return dependencies;
  }
}

export class YarnPackageManagerSupport implements PackageManagerSupport {
  public packageManager = 'yarn' as const;
  private classicSupport = new YarnClassicPackageManagerSupport();
  private berrySupport = new YarnBerryPackageManagerSupport();
  private yarnVersion: string | undefined;

  async isClassic() {
    if (this.yarnVersion === undefined) {
      // Run yarn --version to determine if we're using Yarn 1 or 2+
      const { stdout } = await exec('yarn --version');
      this.yarnVersion = stdout.toString().split('.')[0];
      console.log(`Detected Yarn version: ${this.yarnVersion}`);
    }
    return this.yarnVersion === '1';
  }

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    if (await this.isClassic()) {
      return this.classicSupport.findWorkspaces(directoryPath);
    }
    return this.berrySupport.findWorkspaces(directoryPath);
  }

  async listOutdatedDependencies(
    project: Project<'NPM'>,
  ): Promise<NpmDependency[]> {
    if (await this.isClassic()) {
      return this.classicSupport.listOutdatedDependencies(project);
    }
    return this.berrySupport.listOutdatedDependencies(project);
  }
}
