import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Nomlog parent folder has its own yarn.lock; pin Turbopack root to this app.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
