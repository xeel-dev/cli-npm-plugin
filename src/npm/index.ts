import type {
  Dependency,
  EcosystemSupport,
  Project,
  Release,
  RootProject,
} from '@xeel-dev/cli/ecosystem-support';
import { readdir } from 'fs/promises';
import { readFileSync } from 'node:fs';
import { exec } from '../utils/exec.js';
import { Lockfiles, PackageManager } from './constants.js';
import { parseJSON } from './package-manager/common.js';
import { NpmPackageManagerSupport } from './package-manager/npm.js';
import { PnpmPackageManagerSupport } from './package-manager/pnpm.js';
import { YarnPackageManagerSupport } from './package-manager/yarn.js';

const LOCKFILE_NAMES = Object.keys(Lockfiles);

export interface NpmProject extends RootProject<'NPM'> {
  packageManager: PackageManager;
}

export interface NpmDependency extends Dependency<'NPM'> {}

export interface PackageManagerSupport {
  findWorkspaces(directoryPath: string): Promise<Project<'NPM'>[]>;
  listOutdatedDependencies(project: NpmProject): Promise<NpmDependency[]>;
}

export default class NpmEcosystemSupport implements EcosystemSupport<'NPM'> {
  get name(): 'NPM' {
    return 'NPM';
  }

  private managerSupport: Record<PackageManager, PackageManagerSupport> = {
    pnpm: new PnpmPackageManagerSupport(),
    yarn: new YarnPackageManagerSupport(),
    npm: new NpmPackageManagerSupport(),
  };

  private async findWorkspaces(
    packageManager: PackageManager,
    directoryPath: string,
  ): Promise<Project<'NPM'>[]> {
    const support = this.managerSupport[packageManager];
    if (!support) {
      console.error('Unsupported package manager!', {
        packageManager,
        directoryPath,
      });
      throw new Error(`Unsupported package manager!`);
    }
    console.log('Finding workspaces in', directoryPath, 'with', packageManager);
    return support.findWorkspaces(directoryPath);
  }

  private isValidVersion(version: Release): boolean {
    return (
      version.date instanceof Date &&
      typeof version.isDeprecated === 'boolean' &&
      typeof version.version === 'string'
    );
  }

  async listOutdatedDependencies(
    project: NpmProject,
  ): Promise<NpmDependency[]> {
    const support = this.managerSupport[project.packageManager];
    if (!support) {
      console.error(`Unsupported package manager!`, {
        packageManager: project.packageManager,
        directoryPath: project.path,
      });
      throw new Error(`Unsupported package manager!`);
    }
    const outdated = await support.listOutdatedDependencies(project);
    // Validate that all dependencies have all required fields, remove any that don't,
    // and return the result
    const validatedOutdated = outdated.filter((dependency: NpmDependency) => {
      const isValid =
        this.isValidVersion(dependency.latest) &&
        this.isValidVersion(dependency.current) &&
        dependency.name &&
        dependency.type;
      if (!isValid) {
        console.warn(`Invalid dependency: ${JSON.stringify(dependency)}`);
      }
      return isValid;
    });
    return validatedOutdated;
  }

  async findProjects(
    directoryPath = process.cwd(),
    allowNoLockfile = false,
  ): Promise<NpmProject[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const projects: NpmProject[] = [];
    for (const entry of entries) {
      if (
        entry.isFile() &&
        (LOCKFILE_NAMES.includes(entry.name) ||
          (allowNoLockfile &&
            entry.name === 'package.json' &&
            directoryPath === process.cwd()))
      ) {
        // If there's a lockfile here, there may also be a package.json
        // load it in order to find the project's name
        const packageJsonPath = `${directoryPath}/package.json`;
        // Check if the entries contains the package.json file
        if (!entries.some((e) => e.isFile() && e.name === 'package.json')) {
          console.warn(
            `Lockfile found at ${directoryPath} but no package.json found`,
          );
          continue;
        }

        const packageDefinition = parseJSON(
          readFileSync(packageJsonPath, 'utf-8'),
        );
        const packageManager =
          Lockfiles[entry.name as keyof typeof Lockfiles] ?? 'npm';

        projects.push({
          // Fall back to the directory name if the package.json doesn't have a name
          name: packageDefinition.name ?? directoryPath.split('/').pop(),
          description: packageDefinition.description,
          path: directoryPath,
          ecosystem: 'NPM',
          packageManager,
          subProjects: await this.findWorkspaces(packageManager, directoryPath),
        });
      } else if (entry.isDirectory()) {
        if (entry.name === '.git') {
          continue;
        }
        const { exitCode } = await exec(
          'git',
          ['check-ignore', '-v', entry.name],
          {
            cwd: directoryPath,
          },
        );
        if (exitCode === 0) {
          continue;
        }

        projects.push(
          ...(await this.findProjects(`${directoryPath}/${entry.name}`)),
        );
      }
    }

    if (projects.length === 0 && !allowNoLockfile) {
      // If no projects were found, and we're not allowing no lockfile, try again
      // with the parent directory.
      return this.findProjects(directoryPath, true);
    }

    return projects;
  }
}
