import type { DependencyType, Project } from '@xeel-dev/cli/ecosystem-support';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function findDescription(workspace: Project<'NPM'>) {
  try {
    if (!workspace.description && workspace.path) {
      // Load the package.json to get the description
      const packageJsonPath = join(workspace.path, 'package.json');
      const packageJsonFile = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = parseJSON(packageJsonFile);
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

export function parseJSON(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    if (!(e instanceof Error)) {
      throw new Error('Failed to parse JSON: ' + e);
    }
    console.error('Failed to parse JSON:');
    console.error('Error message: ' + e.message);

    // Try to extract the position of the error from the error message
    let position = -1;
    const positionMatch = e.message.match(/at position (\d+)/);
    if (positionMatch) {
      position = parseInt(positionMatch[1], 10);
    } else {
      // Handle different error message formats
      const columnMatch = e.message.match(/line (\d+) column (\d+)/);
      if (columnMatch) {
        const line = parseInt(columnMatch[1], 10);
        const column = parseInt(columnMatch[2], 10);
        const lines = str.split('\n');
        position = 0;
        for (let i = 0; i < line - 1; i++) {
          position += lines[i].length + 1; // +1 for newline character
        }
        position += column - 1;
      }
    }

    if (position >= 0) {
      const contextRadius = 20;
      const start = Math.max(0, position - contextRadius);
      const end = Math.min(str.length, position + contextRadius);
      const snippet = str.substring(start, end);
      console.error('Error near: ' + snippet.replace(/\s+/g, ' '));
      console.error(' '.repeat(position - start) + '^');
    } else {
      // If position is not found, output the entire input
      console.error('Input:');
      console.error(str);
    }
    return null;
  }
}
