import type {
  Dependency,
  EcosystemSupport,
  Project,
  RootProject,
} from '@xeel-dev/cli/ecosystem-support';
import { readdir } from 'fs/promises';
import { readFileSync } from 'node:fs';
import { exec } from '../utils/exec.js';
import { Lockfiles, PackageManager } from './constants.js';
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
      throw new Error(`Unsupported package manager: ${packageManager}`);
    }
    return support.findWorkspaces(directoryPath);
  }

  async listOutdatedDependencies(
    project: NpmProject,
  ): Promise<NpmDependency[]> {
    const support = this.managerSupport[project.packageManager];
    if (!support) {
      throw new Error(`Unsupported package manager: ${project.packageManager}`);
    }
    return support.listOutdatedDependencies(project);
  }

  async findProjects(directoryPath = process.cwd()): Promise<NpmProject[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const projects: NpmProject[] = [];
    for (const entry of entries) {
      if (entry.isFile() && LOCKFILE_NAMES.includes(entry.name)) {
        // If there's a lockfile here, there should also be a package.json
        // load it in order to find the project's name
        const packageJsonPath = `${directoryPath}/package.json`;
        const { name, description } = JSON.parse(
          readFileSync(packageJsonPath, 'utf-8'),
        );
        const packageManager = Lockfiles[entry.name as keyof typeof Lockfiles];

        projects.push({
          name,
          description,
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

    return projects;
  }
}
