import type { Project } from '@xeel-dev/cli/ecosystem-support';
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
