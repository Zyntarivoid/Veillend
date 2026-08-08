# VeilLend Mobile

Expo (React Native) client for VeilLend on Stellar.

## Prerequisites

- Node.js 20+
- npm
- Expo Go or a dev client for device testing

## Quick start

```bash
cd veilend-mobile
cp .env.example .env   # optional — platform defaults work for emulator/sim
npm install
npm start              # or: npx expo start
```

## API base URL configuration

The axios client (`src/utils/api.ts`) no longer hardcodes hosts. Resolution lives in `src/utils/config.ts`:

| Priority | Variable | When used |
| --- | --- | --- |
| 1 | `EXPO_PUBLIC_API_URL` | All platforms (best for physical devices / staging) |
| 2 | `EXPO_PUBLIC_API_URL_WEB` | Web only |
| 2 | `EXPO_PUBLIC_API_URL_MOBILE` | iOS / Android |
| 3 | Platform defaults | `localhost:3000` (web/iOS), `10.0.2.2:3000` (Android emulator) |

Invalid overrides (empty, relative, or non-http schemes) throw a clear error at startup so misconfiguration fails loudly instead of silently calling the wrong host.

### Common setups

| Scenario | Recommended value |
| --- | --- |
| Backend on same machine, web | default / `EXPO_PUBLIC_API_URL_WEB=http://localhost:3000` |
| Android emulator → host backend | default / `EXPO_PUBLIC_API_URL_MOBILE=http://10.0.2.2:3000` |
| iOS simulator → host backend | default / `http://localhost:3000` |
| Physical phone on LAN | `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000` |

After changing env vars, restart Expo (`r` in the terminal or stop/start) so `EXPO_PUBLIC_*` values are re-inlined.

Backend default port is **3000** (`veilend-backend` `PORT`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run android` / `ios` / `web` | Platform targets |
| `npm test` | Node test runner (`src/**/*.test.ts`) |
| `npm run doctor` | `expo-doctor` |

## Related docs

- Backend setup: [`../veilend-backend/README.md`](../veilend-backend/README.md)
- Root project overview: [`../README.md`](../README.md)
