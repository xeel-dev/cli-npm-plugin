import type { Hook } from '@oclif/core';
import NpmEcosystemSupport from '../npm/index.js';

const hook: Hook<'register-ecosystem'> = async function () {
  return new NpmEcosystemSupport();
};

export default hook;
