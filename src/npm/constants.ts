export type Lockfile = 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml';
export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export const Lockfiles: Record<Lockfile, PackageManager> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};
