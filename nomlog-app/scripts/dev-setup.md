# Development Build Setup

## Quick Start

### For iOS Development Build (without Expo Go):

```bash
# Option 1: Run directly on device/simulator
yarn ios

# Option 2: Run with specific configuration
yarn ios:dev

# Option 3: Run on iOS Simulator specifically
yarn ios:simulator
```

### For EAS Development Builds:

```bash
# Build development version for iOS
yarn build:dev

# Build development version for Android
yarn build:dev:android

# Build preview version for iOS
yarn build:preview

# Build preview version for Android
yarn build:preview:android
```

## Prerequisites

1. **Xcode** (for iOS development)
2. **EAS CLI** installed globally:
   ```bash
   npm install -g @expo/eas-cli
   ```

3. **Apple Developer Account** (for device builds)

## First Time Setup

1. **Login to EAS:**
   ```bash
   eas login
   ```

2. **Configure your project:**
   ```bash
   eas build:configure
   ```

3. **Build your first development build:**
   ```bash
   yarn build:dev
   ```

4. **Install the development build on your device** (follow the QR code or download link)

5. **Start the development server:**
   ```bash
   yarn start
   ```

6. **Open the development build** and scan the QR code to connect to your development server

## Troubleshooting

- If you get port conflicts, try: `yarn start --port 8083`
- For simulator issues, try: `yarn ios:simulator`
- For device builds, make sure your device is registered in your Apple Developer account
- Check that your bundle identifier matches your Apple Developer account

## Development Workflow

1. Make code changes
2. The development build will hot reload automatically
3. For native changes, you may need to rebuild the development build
4. Use `yarn build:dev` to create a new development build when needed
