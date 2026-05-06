import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
// pnpm hoisted monorepo: Turbopack must resolve `next` from the workspace root, not `src/app`.
// See https://github.com/vercel/next.js/issues/92540
const monorepoRoot = path.resolve(appRoot, "..");

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
