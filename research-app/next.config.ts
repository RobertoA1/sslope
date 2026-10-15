import type { NextConfig } from 'next';
import { LAB_BASE_PATH } from './lib/paths.mjs';

const config: NextConfig = {
  basePath: LAB_BASE_PATH,
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
};
export default config;
