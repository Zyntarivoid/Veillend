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

### 2. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run type-check` | Run TypeScript type checking |

## Tech Stack

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| [Next.js](https://nextjs.org) | 16 | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | 4 | Utility-first styling |
| [ESLint](https://eslint.org) | 9 | Code linting |
| [Prettier](https://prettier.io) | 3 | Code formatting |

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

## Contributing

1. Fork the repo and create a branch from `main`
2. Run `npm install` to install dependencies
3. Make your changes — ensure `npm run type-check` and `npm run lint` pass
4. Open a pull request

For more context, see the [root README](../README.md) and the broader VeilLend architecture.

## Troubleshooting

Here are common issues and their solutions:

### 1. Dependency Installation Issues

**Problem**: `npm install` fails with errors.

**Solutions**:
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then re-run `npm install`
- Ensure you're using the correct Node.js version (22+)

### 2. Development Server Won't Start

**Problem**: `npm run dev` fails or the server doesn't load.

**Solutions**:
- Check if port 3000 is already in use (use `netstat -ano | findstr :3000` on Windows)
- Try a different port: `npm run dev -- -p 3001`
- Ensure dependencies are installed correctly

### 3. TypeScript Errors

**Problem**: TypeScript type checks fail.

**Solutions**:
- Run `npm run type-check` for detailed errors
- Ensure all type definitions are correctly imported
- Check for outdated dependencies

### 4. ESLint Errors

**Problem**: ESLint reports linting issues.

**Solutions**:
- Run `npm run lint` to see all errors
- Run `npm run format` to auto-fix formatting issues
- Check `.eslintrc` (or `eslint.config.mjs`) for linting rules

### 5. Tailwind CSS Styles Not Applying

**Problem**: Tailwind styles aren't showing up.

**Solutions**:
- Ensure you're using Tailwind utility classes correctly
- Check `postcss.config.mjs` and `globals.css` for correct Tailwind configuration
- Restart the development server

For more help, check the [root README](../README.md) or open an issue.
