#!/usr/bin/env node

import { exec } from '@actions/exec';
import { platform } from 'node:os';

const isWindows = platform() === 'win32';
const script = isWindows ? 'e2e-setup.bat' : 'e2e-setup.sh';
const dirPath = import.meta.url
  .replace(isWindows ? 'file:///' : 'file://', '') // Windows paths do not start with a slash
  .replace('run-e2e-setup.js', '');

console.log(`Running script: ${script} in directory: ${dirPath}`);

const args = [script];
if (isWindows) {
  args.unshift('/c');
}

await exec(isWindows ? 'cmd.exe' : '/bin/bash', args, { cwd: dirPath });
