# VeilLend Web

The VeilLend web application — a privacy-first decentralized lending interface built on Stellar/Soroban.

## Prerequisites

- **Node.js** 22+
- **npm** 10+

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and adjust any values you need:

```bash
cp .env.example .env.local
```

The app ships with **safe testnet defaults** for every variable, so this step is optional for local development — you can skip it and the app will connect to Stellar testnet automatically.

See [Environment Variables](#environment-variables) below for the full reference.

### 3. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Script               | Description                    |
| :------------------- | :----------------------------- |
| `npm run dev`        | Start the development server   |
| `npm run build`      | Build for production           |
| `npm run start`      | Start the production server    |
| `npm run lint`       | Run ESLint                     |
| `npm run format`     | Format all files with Prettier |
| `npm run type-check` | Run TypeScript type checking   |

## Tech Stack

| Tool                                         | Version | Purpose                         |
| :------------------------------------------- | :------ | :------------------------------ |
| [Next.js](https://nextjs.org)                | 16      | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org) | 5       | Type safety                     |
| [Tailwind CSS](https://tailwindcss.com)      | 4       | Utility-first styling           |
| [ESLint](https://eslint.org)                 | 9       | Code linting                    |
| [Prettier](https://prettier.io)              | 3       | Code formatting                 |

## UI component standard

The web application standardizes on [shadcn/ui](https://ui.shadcn.com/) components backed by Radix UI primitives. Use the components in `src/components/ui/` for reusable controls and surfaces; Tailwind utilities remain appropriate for page layout and for composing product-specific views.

- Import primitives from `@/components/ui/<component>` (for example, `@/components/ui/button`). Do not add parallel `Button`, `Card`, `Input`, `Badge`, `Alert`, or `Skeleton` components outside this directory.
- Prefer an existing component and its `variant`, `size`, and `className` APIs before adding custom markup. Keep product-specific compositions such as wallet and campaign views in `src/components/`.
- To add a missing primitive, generate or adapt it using the shadcn/Radix conventions in this repository: TypeScript, `cn` from `@/lib/utils`, `data-slot` attributes, and variants with `class-variance-authority` where needed.
- Update `components.json` when the shadcn configuration changes, and document any intentionally bespoke component in its source file.

This keeps accessibility behavior, visual states, and maintenance in one component layer. The former duplicate primitives have been removed; migrate any stale imports to `@/components/ui/` rather than restoring them.

## Project Structure

```
veilend-web/
├── public/           # Static assets (images, icons, etc.)
├── src/
│   ├── app/          # Next.js App Router (pages, layouts, global styles)
│   └── components/   # Reusable UI components (Button, Card, Input, etc.)
├── .gitignore        # Git ignore rules
├── .prettierrc       # Prettier configuration
├── AGENTS.md         # Agent guidelines
├── CLAUDE.md         # Claude guidelines
├── eslint.config.mjs # ESLint configuration
├── next.config.ts    # Next.js configuration
├── package-lock.json # Locked dependencies
├── package.json      # Project dependencies and scripts
├── postcss.config.mjs # PostCSS configuration
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

### Key Directories & Files Explained

- **public/**: Static assets served at the root level (e.g., favicon, SVGs).
- **src/app/**: Next.js App Router directory for routing, layouts, and global styles.
  - **page.tsx**: The home page component.
  - **layout.tsx**: The root layout component (shared across all pages).
  - **globals.css**: Global CSS styles and Tailwind configuration.
- **src/components/**: Reusable UI primitives (Button, Card, Input, etc.).
- **package.json**: Lists dependencies, scripts, and project metadata.

## Environment Variables

All configuration is driven by environment variables.  Copy `.env.example` to
`.env.local` to get started — every variable has a safe testnet default so the
app works without any extra setup in local development.

```bash
cp .env.example .env.local
```

### Variable Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | No | `testnet` | Stellar network to connect to. Accepted values: `testnet`, `mainnet`, `futurenet`. |
| `NEXT_PUBLIC_HORIZON_URL` | No | `https://horizon-testnet.stellar.org` | Horizon REST API base URL for the chosen network. |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | No | `Test SDF Network ; September 2015` | Stellar network passphrase — must match the network exactly. |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | Base URL for the VeilLend indexer / backend API. |

### Environment Presets

**Testnet (default — no `.env.local` needed)**

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Mainnet**

```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

> **Important:** `NEXT_PUBLIC_` variables are inlined into the browser bundle at build time.
> Never put secrets, private keys, or tokens in these variables.

---

## Startup Config Validation

`src/lib/config-validation.ts` runs **automatically at `next dev` and `next build`** (wired in `next.config.ts`).

It checks all four environment variables and throws a single, formatted error listing every problem found — so you can fix everything in one go instead of discovering issues one at a time at runtime.

### Example output when misconfigured

```
╔══════════════════════════════════════════════════════════╗
║   VeilLend — invalid or missing environment variables    ║
╚══════════════════════════════════════════════════════════╝

The following configuration problems were detected:

  1. NEXT_PUBLIC_STELLAR_NETWORK
     → Must be one of: testnet, mainnet, futurenet. Got: "prodnet"

  2. NEXT_PUBLIC_HORIZON_URL
     → Must be a valid http/https URL. Got: "horizon.stellar.org"

Fix these values in .env.local (copy .env.example to get started):

  cp .env.example .env.local

See veilend-web/README.md § Environment Variables for full documentation.
```

### Using `getConfig()` in application code

Import the typed `AppConfig` anywhere you need config values — validation is guaranteed to have already run at startup:

```typescript
import { getConfig } from "@/lib/config-validation";

const { horizonUrl, networkPassphrase } = getConfig();
```

The `AppConfig` type is:

```typescript
interface AppConfig {
  stellarNetwork: "testnet" | "mainnet" | "futurenet";
  horizonUrl: string;
  networkPassphrase: string;
  apiUrl: string;
}
```

---

## Campaign Analytics

The GrantFox OSS campaign landing page uses a lightweight first-party analytics flow to measure campaign effectiveness without introducing third-party tracking scripts.

### Tracked events

| Event                           | Purpose                                            | Fields                                             |
| :------------------------------ | :------------------------------------------------- | :------------------------------------------------- |
| `campaign_page_visit`           | Measure landing page traffic                       | `path`, `referrer`, `source`                       |
| `campaign_cta_click`            | Measure CTA engagement                             | `path`, `source`, `ctaId`, `ctaLabel`, `targetUrl` |
| `campaign_contributor_interest` | Measure which contribution tracks attract interest | `path`, `source`, `interestArea`                   |

### Implementation

- Client-side helpers in `src/lib/campaignAnalytics.ts` send events to the first-party route `src/app/api/campaign-events/route.ts`.
- `CampaignTracker` records a page visit on mount.
- `TrackedLink` records outbound CTA clicks before navigation.
- `ContributorInterest` records anonymous contributor track selection.
- The API route sanitizes inputs, accepts only an allowlist of expected fields, and writes structured events to server logs using the `[campaign-analytics]` marker.

### Privacy considerations

- No cookies, local storage identifiers, wallet addresses, emails, names, or free-form text are collected.
- Only anonymous interaction metadata needed for campaign measurement is accepted by the API route.
- Referrer and UTM source are optional and truncated during sanitization.
- If longer-term reporting is needed later, route the structured log output into your preferred first-party observability platform rather than embedding third-party trackers by default.

## Contributing

1. Fork the repo and create a branch from `main`
2. Run `npm install` to install dependencies
3. Make your changes — ensure `npm run type-check` and `npm run lint` pass
4. Open a pull request

For more context, see the [root README](../README.md) and the broader VeilLend architecture.

## Troubleshooting

Here are common issues and their solutions:

### 1. Missing or Invalid Environment Variables

**Problem**: `next dev` or `next build` fails with a VeilLend config error block.

**Solutions**:

- Copy the example file and edit it: `cp .env.example .env.local`
- Make sure `NEXT_PUBLIC_STELLAR_NETWORK` is one of: `testnet`, `mainnet`, `futurenet`
- Make sure `NEXT_PUBLIC_HORIZON_URL` and `NEXT_PUBLIC_API_URL` are full `http://` or `https://` URLs
- Make sure `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` is not empty
- The error output lists every problem at once — fix them all, then restart the server

### 2. Dependency Installation Issues

**Problem**: `npm install` fails with errors.

**Solutions**:

- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then re-run `npm install`
- Ensure you're using the correct Node.js version (22+)

### 3. Development Server Won't Start

**Problem**: `npm run dev` fails or the server doesn't load.

**Solutions**:

- Check if port 3000 is already in use (use `netstat -ano | findstr :3000` on Windows)
- Try a different port: `npm run dev -- -p 3001`
- Ensure dependencies are installed correctly

### 4. TypeScript Errors

**Problem**: TypeScript type checks fail.

**Solutions**:

- Run `npm run type-check` for detailed errors
- Ensure all type definitions are correctly imported
- Check for outdated dependencies

### 5. ESLint Errors

**Problem**: ESLint reports linting issues.

**Solutions**:

- Run `npm run lint` to see all errors
- Run `npm run format` to auto-fix formatting issues
- Check `.eslintrc` (or `eslint.config.mjs`) for linting rules

### 6. Tailwind CSS Styles Not Applying

**Problem**: Tailwind styles aren't showing up.

**Solutions**:

- Ensure you're using Tailwind utility classes correctly
- Check `postcss.config.mjs` and `globals.css` for correct Tailwind configuration
- Restart the development server

For more help, check the [root README](../README.md) or open an issue.
