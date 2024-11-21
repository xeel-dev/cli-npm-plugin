import type { Project } from '@xeel-dev/cli/ecosystem-support';
import { exec, ExecError } from '../../utils/exec.js';
import { NpmDependency, PackageManagerSupport } from '../index.js';
import { findDescription, getDependencyType, parseJSON } from './common.js';

export class PnpmPackageManagerSupport implements PackageManagerSupport {
  public packageManager = 'pnpm' as const;
  private packageVersionToDateCache: Record<string, Record<string, string>> =
    {};

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout, stderr } = await exec(
      'pnpm',
      ['m', 'ls', '--json'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      throw new ExecError('pnpm m ls --json', {
        exitCode,
        stdout,
        stderr,
      });
    }
    // pnpm m ls outputs JSON objects separated by empty lines
    // split the output by empty lines and parse the first JSON object
    // Even though there might be multiple root workspaces, we only care
    // about the first one, which is the one closest to the directoryPath
    let outputString = stdout.toString();
    if (outputString.match(/^\n/gm)) {
      outputString = outputString.split(/^\n/gm)[0];
    }
    const workspaces = parseJSON(outputString) as {
      name: string;
      description: string;
      path: string;
    }[];
    return workspaces
      .map((workspace) => ({
        name: workspace.name,
        description: workspace.description,
        ecosystem: 'NPM' as const,
        packageManager: 'pnpm' as const,
        path: workspace.path,
      }))
      .filter(({ path }) => path !== directoryPath)
      .map(findDescription);
  }

  async listOutdatedDependencies(project: Project<'NPM'>) {
    const dependencies: NpmDependency[] = [];
    const { stdout, exitCode, stderr } = await exec(
      'pnpm',
      ['outdated', '--json'],
      { cwd: project.path },
    );
    if (exitCode === 0) {
      return dependencies;
    }

    // Outdated exits with a non-zero status code if there are outdated dependencies
    const outdated = parseJSON(stdout.toString());
    for (const name in outdated) {
      if (!outdated[name].current && !outdated[name].wanted) {
        throw new Error(
          'Could not find current version. Did you run `pnpm install`?' +
            ' Package: ' +
            name,
        );
      }
      if (!this.packageVersionToDateCache[name]) {
        const { stdout } = await exec(`pnpm info ${name} --json`);
        this.packageVersionToDateCache[name] = parseJSON(stdout).time;
      }
      let type;
      try {
        type = getDependencyType(outdated[name].dependencyType);
      } catch (e) {
        continue;
      }

      dependencies.push({
        name,
        current: {
          version: outdated[name].current ?? outdated[name].wanted,
          isDeprecated: false,
          date: new Date(
            this.packageVersionToDateCache[name][
              outdated[name].current ?? outdated[name].wanted
            ],
          ),
        },
        latest: {
          version: outdated[name].latest,
          isDeprecated: outdated[name].isDeprecated,
          date: new Date(
            this.packageVersionToDateCache[name][outdated[name].latest],
          ),
        },
        ecosystem: 'NPM',
        type,
      });
    }

    return dependencies;
  }
}
