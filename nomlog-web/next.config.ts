import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Monorepo root uses pnpm; pin Turbopack root to this app so resolution stays local.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
