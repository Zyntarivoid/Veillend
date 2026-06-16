# VeilLend Web Contributor Guide

This guide helps frontend contributors install, run, and extend the
`veilend-web` app without needing to read the whole monorepo first.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Git

Check your local versions before installing dependencies:

```bash
node --version
npm --version
```

## Local Setup

From a fresh clone of the repository:

```bash
cd veilend-web
npm install
npm run dev
```

The development server starts at `http://localhost:3000` by default.

Before opening a pull request, run the same checks maintainers can repeat
locally:

```bash
npm run type-check
npm run lint
npm run build
```

## Folder Structure

```text
veilend-web/
├── src/
│   └── app/
│       ├── globals.css     # Global Tailwind and base styles
│       ├── layout.tsx      # Shared App Router layout
│       └── page.tsx        # Current landing page route
├── public/                 # Static assets served by Next.js
├── next.config.ts          # Next.js configuration
├── eslint.config.mjs       # ESLint configuration
├── postcss.config.mjs      # Tailwind/PostCSS configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Scripts and dependency versions
```

Keep new page-level routes under `src/app/`. Shared UI, data, or utility
folders can be added under `src/` when a feature needs them.

## Development Notes

- This app uses Next.js 16 with the App Router.
- Use TypeScript for new source files.
- Keep browser-facing code inside `veilend-web`; contracts, mobile code, and
  backend code live in sibling workspaces.
- Prefer small pull requests that map directly to one GitHub issue.
- If you add a new command, environment variable, or setup requirement, update
  this guide or `README.md` in the same PR.

## Troubleshooting

### Port 3000 is already in use

Run the dev server on another port:

```bash
npm run dev -- --port 3001
```

### Dependency install fails

Remove the local install output and reinstall from the lockfile:

```bash
rm -rf node_modules
npm install
```

### TypeScript cannot resolve generated or stale files

Run the type checker from the `veilend-web` directory, not the repository root:

```bash
cd veilend-web
npm run type-check
```

### Next.js behavior differs from older examples

This project uses Next.js 16. If an API or convention looks unfamiliar, check
the installed Next.js documentation in `node_modules/next/dist/docs/` after
running `npm install`.
