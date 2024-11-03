import type { DependencyType, Project } from '@xeel-dev/cli/ecosystem-support';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function findDescription(workspace: Project<'NPM'>) {
  try {
    if (!workspace.description && workspace.path) {
      // Load the package.json to get the description
      const packageJsonPath = join(workspace.path, 'package.json');
      const packageJsonFile = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonFile);
      workspace.description = packageJson.description;
    }
  } finally {
    return workspace;
  }
}

export function getDependencyType(typeString: string): DependencyType {
  switch (typeString) {
    case 'dependencies':
      return 'PROD';
    case 'devDependencies':
      return 'DEV';
    default:
      // We explicitly do not support optional, and peer dependencies
      throw new Error(`Unsupported dependency type: ${typeString}`);
  }
}
