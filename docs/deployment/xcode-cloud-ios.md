# iOS builds with Xcode Cloud (Nomlog)

**Environment assumption:** TestFlight / App Store builds use **`EXPO_APP_ENV=production`** and production API/Supabase URLs. Local development stays on `.env.development`; do not commit secrets.

The app is an **Expo prebuild** project: `nomlog-app/ios/` is committed so Xcode Cloud can open `nomlog.xcworkspace`. **`ios/Pods/` is not committed**; Xcode Cloud runs `pod install` via `ios/ci_scripts/ci_post_clone.sh`.

**Source of truth:** the shell scripts are kept in [`nomlog-app/xcode-cloud-ci/`](../../nomlog-app/xcode-cloud-ci/). The Expo config plugin [`withXcodeCloudCiScripts`](../../nomlog-app/plugins/withXcodeCloudCiScripts.js) copies them into `ios/ci_scripts/` on every `expo prebuild`, so `expo prebuild --clean` does not permanently lose them—**commit the regenerated `ios/ci_scripts/` after prebuild** (or re-run prebuild before pushing) so Xcode Cloud sees the files on clone.

---

## One-time: Apple Developer + GitHub

1. In [App Store Connect](https://appstoreconnect.apple.com/), ensure the **Nomlog** app and bundle ID `com.brandonminch.nomlog` exist.
2. In Xcode (**Settings → Accounts**), sign in with your Apple ID and select the correct team.
3. Connect the GitHub repo under **Xcode → Settings → Accounts → GitHub** (or via App Store Connect → Xcode Cloud).
4. Enable **Xcode Cloud** for the repository in App Store Connect (**Xcode Cloud** tab).

---

## Create the workflow (push `main` → TestFlight)

1. Open **`nomlog-app/ios/nomlog.xcworkspace`** in Xcode.
2. **Product → Xcode Cloud → Create Workflow** (or manage from App Store Connect).
3. Configure:
   - **Repository**: your GitHub remote.
   - **Branch**: `main` (or your release branch).
   - **Project / Workspace**:
     - Monorepo (Nomlog): `nomlog-app/ios/nomlog.xcworkspace`
     - Dedicated app repo (package.json at repo root): `ios/nomlog.xcworkspace`
   - **Scheme**: `nomlog` (shared scheme is under `nomlog.xcodeproj/xcshareddata/xcschemes/`).
   - **Action**: **Archive**.
   - **Post-actions**: distribute to **TestFlight** (and optionally App Store after manual approval).
4. Confirm **Start Condition** is “On push” to `main` (or your chosen branch).

`ci_scripts/ci_post_clone.sh` runs automatically when placed under `ios/ci_scripts/`. It finds the Expo app root as the parent of `ios/` (so it works for both layouts above).

`ci_scripts/ci_pre_xcodebuild.sh` (optional) runs before the archive and runs `agvtool new-version -all "$CI_BUILD_NUMBER"` so the app and OneSignal extension share the same build number. You can rely on **Xcode Cloud / workflow build settings** for `$(CI_BUILD_NUMBER)` instead; if you do, remove or empty this script to avoid double-setting. See [Setting the next build number for Xcode Cloud builds](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds).

---

## Environment variables (Xcode Cloud)

Set these in the workflow **Environment Variables** (or per-branch overrides). They mirror [`nomlog-app/app.config.js`](../../nomlog-app/app.config.js). **Do not** rely on committed `.env.production` (gitignored).

| Variable | Required | Notes |
|----------|----------|--------|
| `EXPO_APP_ENV` | Yes | Use `production` for TestFlight/App Store (push entitlements + OneSignal plugin mode). |
| `EXPO_PUBLIC_API_URL` | Yes | Public API base URL. |
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (still treat as sensitive in CI). |
| `EXPO_PUBLIC_MEAL_PHOTO_BUCKET` | Yes | Storage bucket name for meal photos. |
| `POSTHOG_PROJECT_TOKEN` | If analytics enabled | |
| `POSTHOG_HOST` | No | Defaults to `https://us.i.posthog.com` in app config. |
| `SENTRY_DISABLE_AUTO_UPLOAD` | No | Set to `true` to skip Sentry upload during archive if you do not configure Sentry secrets. |
| `SENTRY_AUTH_TOKEN` | Optional | For debug symbols / source maps upload. |
| `SENTRY_ORG` | Optional | Required for Sentry Expo plugin when uploading. |
| `SENTRY_PROJECT` | Optional | Required for Sentry Expo plugin when uploading. |

`EXPO_PUBLIC_*` keys are embedded in the JS bundle at build time.

---

## Signing and capabilities (checklist)

After the first successful archive, verify in App Store Connect / Xcode:

- **Main app** (`com.brandonminch.nomlog`): App Store distribution signing, **Push Notifications**, **Sign in with Apple**, **HealthKit**, **App Groups** `group.com.brandonminch.nomlog.onesignal`.
- **OneSignal extension** (`com.brandonminch.nomlog.OneSignalNotificationServiceExtension`): must use the **same team** and a provisioning profile that includes the extension’s bundle ID and **App Group** if required by your OneSignal setup.
- **Entitlements**: main app should have `aps-environment` = **production** for TestFlight (generated when `EXPO_APP_ENV=production` at prebuild time).

If signing fails only on the extension, open the project in Xcode, select the extension target, and enable **Automatically manage signing** for both app and extension, or align manual profiles.

---

## Regenerating `ios/` after native changes

When you change `app.json`, `app.config.js`, Expo plugins, or native modules:

```bash
cd /path/to/Nomlog   # monorepo root
pnpm install
pnpm --filter nomlog-app run prebuild:ios:production
```

Commit the updated `nomlog-app/ios/` (except `Pods/`, which stays ignored), including **`ios/ci_scripts/`** produced from `xcode-cloud-ci/`. Re-run a Xcode Cloud build to verify.

---

## Troubleshooting

- **“The bundle version must be higher than the previously uploaded version”**: Each upload needs a higher **build** (`CFBundleVersion`) than the last one on App Store Connect. Configure the next build in your **Xcode Cloud workflow** (e.g. **Current Project Version** = `$(CI_BUILD_NUMBER)`), or keep **`ci_pre_xcodebuild.sh`** so `agvtool` applies `CI_BUILD_NUMBER` to all targets. See [Setting the next build number for Xcode Cloud builds](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds).
- **`fmt` / `basic_format_string` / “consteval … is not a constant expression”** when archiving: newer Xcode (e.g. 26.x on Xcode Cloud) is stricter than the `fmt` version bundled with React Native 0.79. The config plugin [`withFmtPodfileFix`](../../nomlog-app/plugins/withFmtPodfileFix.js) injects a **`fmt`**-only **`CLANG_CXX_LANGUAGE_STANDARD = c++17`** block into the Podfile on every **`expo prebuild`** (including `--clean`), so the fix is not lost when `ios/` is regenerated. Run `pod install` in `ios/` after prebuild (post-clone already does) and rebuild.
- **`expected nomlog-app at …repository/nomlog-app` (older script)**: Your Xcode Cloud checkout is the app repo or uses `ios/` at the root. Use the current `ci_post_clone.sh`, which resolves the app directory from `ios/ci_scripts` instead of `CI_PRIMARY_REPOSITORY_PATH/nomlog-app`.
- **`npx: command not found` / no Node in post-clone**: Xcode Cloud often runs `ci_post_clone.sh` with a minimal `PATH` and **without** Node. The script bootstraps **Node 20.18.1** (same pin as `eas.json`) from `nodejs.org` into `$TMPDIR` when `node`/`npx` are missing. Override with `NOMLOG_CI_NODE_VERSION` if you change the EAS Node pin.
- **`pnpm` / Corepack on CI**: The monorepo expects **pnpm** from the repository root. If Xcode Cloud’s `ci_post_clone.sh` still assumes Yarn, update it to run `pnpm install` at the monorepo root and use `pnpm --filter nomlog-app …` for app scripts (or invoke the local `node_modules/.bin/pnpm` after install). Legacy note: older scripts used `npx yarn@1.22.22 install` when Corepack failed.
- **`pod install` fails**: Ensure `LANG` is UTF-8 (the post-clone script sets `en_US.UTF-8`).
- **Node not found during “Bundle React Native”**: [`ios/.xcode.env`](../../nomlog-app/ios/.xcode.env) uses `command -v node`; Xcode Cloud images include `node`. For local odd setups, use `.xcode.env.local` (gitignored).
- **Wrong API environment in TestFlight**: Confirm `EXPO_APP_ENV=production` and all `EXPO_PUBLIC_*` vars in the Xcode Cloud workflow match production.
