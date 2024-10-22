import type { DependencyType, Project } from '@xeel-dev/cli/ecosystem-support';
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { exec, ExecError } from '../../utils/exec.js';
import { NpmDependency, PackageManagerSupport } from '../index.js';
import { findDescription } from './common.js';

interface NpmOutdatedVersion {
  current: string;
  latest: string;
  wanted: string;
  dependent?: string;
  location: string;
}

export class NpmPackageManagerSupport implements PackageManagerSupport {
  public packageManager = 'npm' as const;
  private packageVersionToDateCache: Record<string, Record<string, string>> =
    {};
  private packageDeprecationCache: Record<string, boolean> = {};

  async findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]> {
    const { exitCode, stdout, stderr } = await exec(
      'npm',
      ['query', '.workspace'],
      {
        cwd: directoryPath,
      },
    );
    if (exitCode !== 0) {
      throw new ExecError('npm query .workspace', { exitCode, stdout, stderr });
    }
    const workspaces = JSON.parse(stdout.toString()) as {
      name: string;
      description?: string;
      path: string;
    }[];

    return workspaces
      .map((workspace) => ({
        name: workspace.name,
        description: workspace.description,
        path: workspace.path,
        ecosystem: 'NPM' as const,
        packageManager: 'npm' as const,
      }))
      .map(findDescription);
  }

  async listOutdatedDependencies(project: Project<'NPM'>) {
    const packagePath = `${project.path}/package.json`;
    const prodDependencies: Record<string, DependencyType> = {};
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    for (const dependencyName of Object.keys(packageJson.dependencies ?? [])) {
      prodDependencies[dependencyName] = 'PROD';
    }

    const dependencies: NpmDependency[] = [];
    const { stdout } = await exec('npm', ['outdated', '--json'], {
      cwd: project.path,
    });

    const outdated = JSON.parse(stdout.toString());
    for (const [name, info] of Object.entries(outdated)) {
      const versions = Array.isArray(info)
        ? info
        : ([info] as NpmOutdatedVersion[]);
      if (this.packageVersionToDateCache[name] === undefined) {
        const { stdout } = await exec(`npm info ${name} --json`);
        const packageInfo = JSON.parse(stdout);
        this.packageVersionToDateCache[name] = packageInfo.time;
        this.packageDeprecationCache[name] =
          packageInfo.deprecated !== undefined;
      }
      for (const version of versions) {
        if (version.dependent) {
          // Dependent is the name of the directory of the project that
          // depends on this package. If it's not the root project, we
          // skip it.

          const lastPathSegement = project.path.split(sep).pop();
          if (version.dependent !== lastPathSegement) {
            continue;
          }
        }
        dependencies.push({
          name,
          ecosystem: 'NPM',
          current: {
            version: version.current,
            isDeprecated: this.packageDeprecationCache[name],
            date: new Date(
              this.packageVersionToDateCache[name][version.current],
            ),
          },
          latest: {
            version: version.latest,
            isDeprecated: false,
            date: new Date(
              this.packageVersionToDateCache[name][version.latest],
            ),
          },
          type: prodDependencies[name] || 'DEV',
        });
      }
    }
    return dependencies;
  }
}
