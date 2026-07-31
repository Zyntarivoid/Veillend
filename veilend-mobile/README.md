# VeilLend Mobile Runtime Configuration

The VeilLend mobile app now uses runtime configuration for backend API hosts instead of hardcoded localhost values.

## Supported Environment Variables

- `API_URL_WEB` — backend URL used when running on web or Expo web.
- `API_URL_MOBILE` — backend URL used when running in mobile emulators and on devices.

## Setup

1. Copy the example environment file:

```bash
cd veilend-mobile
cp .env.example .env
```

2. Set the backend endpoints for your environment.

### Example values

- Web development: `API_URL_WEB=http://localhost:3000`
- Android emulator: `API_URL_MOBILE=http://10.0.2.2:3000`
- iOS simulator: `API_URL_MOBILE=http://localhost:3000`
- Physical device: `API_URL_MOBILE=http://<YOUR_MACHINE_IP>:3000`

## Device scenarios

- **Android emulator:** use `10.0.2.2` to reach the host machine from the emulator.
- **iOS simulator:** use `localhost` because the simulator shares the host network.
- **Physical device:** use your computer's LAN IP address (for example `192.168.1.100`) so the device can reach the backend.

## Validation

The app validates these values at startup and will fail clearly if a required configuration is missing or invalid.

- Missing `API_URL_WEB` or `API_URL_MOBILE` will surface a startup error.
- Invalid URLs will be rejected with a descriptive message.

## Runtime config flow

- `app.config.ts` reads `API_URL_WEB` and `API_URL_MOBILE` from the environment and injects them into Expo `extra`.
- `src/utils/config.ts` resolves the active backend URL for the current platform.
- `src/utils/api.ts` uses the resolved runtime API host as the Axios `baseURL`.
