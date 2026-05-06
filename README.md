# Nomlog

Monorepo: **pnpm** workspaces + **Turborepo** (`nomlog-app`, `nomlog-api`, `nomlog-web`, `docs`).

## Prerequisites

- **Node.js** ≥ 20.18 (20.19+ recommended for `nomlog-web` `engines`)
- **pnpm** 9.x — this repo pins `packageManager` and includes **`pnpm` as a devDependency** so scripts work even when the global `pnpm` shim (Corepack) is broken. Root scripts prepend `node_modules/.bin` to `PATH`.

## Setup

From the monorepo root, install dependencies:

```bash
pnpm install
```

**If `pnpm install` fails with `Cannot find matching keyid` (Corepack):** your global `pnpm` is the Corepack shim and it’s out of date or mismatched with Node. Use either:

```bash
# One-shot (no global change)
npx --yes pnpm@9.15.9 install
```

Or fix Corepack / pnpm globally, then re-run `pnpm install`:

```bash
npm install -g corepack@latest
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

**After the first successful install**, prefer putting the repo’s pnpm first on `PATH` so plain `pnpm` works without Corepack:

```bash
export PATH="$PWD/node_modules/.bin:$PATH"
```

(You can add that to your shell profile for this project, or always run commands via `npx pnpm@9.15.9 …`.)

From the repo root:

```bash
pnpm run typecheck
pnpm run build
pnpm run lint
```

`pnpm run lint` currently surfaces **pre-existing** ESLint issues in `nomlog-app` and `nomlog-api`; CI runs **typecheck** and **build** only until those are cleaned up.

Run a script in one package:

```bash
pnpm --filter nomlog-api run dev:develop
pnpm --filter nomlog-web run dev
pnpm --filter nomlog-app run start
```

## Documentation

Product and engineering docs live in **`docs/`** — start at [docs/README.md](docs/README.md).
