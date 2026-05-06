# Nomlog App

A React Native meal logging app built with Expo and TypeScript.

## Features

- 🍽️ Meal logging and tracking
- 📊 Nutrition analysis
- 🔐 User authentication with Supabase
- 📱 Push notifications with OneSignal
- 📱 Cross-platform (iOS & Android)

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **State Management**: Zustand
- **Navigation**: Expo Router
- **Backend**: Supabase
- **Push Notifications**: OneSignal
- **Package Manager**: pnpm (monorepo root)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- pnpm (install from monorepo root)
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. Clone the repository
2. From the **repository root**, install all workspaces:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm --filter nomlog-app run start
   ```

4. Run on specific platforms:
   ```bash
   pnpm --filter nomlog-app run ios              # Uses Expo’s default `.env` loading
   pnpm --filter nomlog-app run ios:develop      # `.env.development` (Supabase develop + matching API URL)
   pnpm --filter nomlog-app run ios:production   # `.env.production`
   pnpm --filter nomlog-app run android          # Same pattern; use `android:develop` / `android:production` for env files
   ```

   Pass extra flags after `--`, e.g. `pnpm --filter nomlog-app run ios:develop -- --simulator`.

## Apple Health (activity logging)

Activity import uses `react-native-health` and **does not work in Expo Go**. After installing dependencies from the repo root, run `pnpm --filter nomlog-app run prebuild` and build with `pnpm --filter nomlog-app run ios -- --device`, `pnpm --filter nomlog-app run ios:device:release` (development env + **Release** configuration on a USB device), or EAS so the HealthKit entitlement and native module are linked. See [docs/features/activity-logging.md](../docs/features/activity-logging.md).

## Environment Setup

Values come from `.env.development` or `.env.production` via `app.config.js`, which copies them into `expo.extra` (`apiUrl`, `supabaseUrl`, `supabaseAnonKey`) so native dev builds use the right URLs (not only Metro’s dev `EXPO_PUBLIC_*` prelude). See `src/config/supabase.ts` and `src/lib/api.ts`.

### Production vs develop Supabase branch

When using [Supabase branching](https://supabase.com/docs/guides/deployment/branching), each branch has its own URL and anon key (dashboard → switch branch → **Settings → API**).

1. Copy the examples and fill in real values:

   ```bash
   cp .env.production.example .env.production
   cp .env.development.example .env.development
   ```

2. Scripts set `EXPO_APP_ENV` to choose which file `app.config.js` loads:

   - **Production (main branch) backend:** `pnpm --filter nomlog-app run start:production` or `pnpm --filter nomlog-app run ios:production` / `pnpm --filter nomlog-app run android:production`
   - **Develop / staging branch backend:** `pnpm --filter nomlog-app run start:develop` or `pnpm --filter nomlog-app run ios:develop` / `pnpm --filter nomlog-app run android:develop`

### EAS cloud builds

For `eas build`, set the same three `EXPO_PUBLIC_*` variables per profile using [EAS environment variables](https://docs.expo.dev/eas/environment-variables/) (or `eas env:create`). Suggested mapping:

| `eas.json` profile | Typical targets |
|--------------------|-----------------|
| `production` | Production API + production Supabase |
| `preview` | Staging API + develop Supabase branch (optional) |
| `development` | Local or staging API + develop Supabase branch |

See [docs/deployment/supabase-environments.md](../docs/deployment/supabase-environments.md) for branching and promotion workflow.

## Project Structure

```
src/
├── components/     # Reusable UI components
├── config/         # Configuration files
├── context/        # React context providers
├── hooks/          # Custom React hooks
├── lib/            # Utility libraries
├── screens/        # Screen components
├── services/       # API and external services
├── store/          # State management
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Development

### Code Style

- Use TypeScript for all new files
- Follow React Native best practices
- Use functional components with hooks
- Implement proper error handling

### OneSignal Setup

The app includes OneSignal for push notifications. The service is configured to work in both development and production environments.

- **Development**: OneSignal gracefully degrades with warnings
- **Production**: Full OneSignal functionality when native modules are available

## Building for Production

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.