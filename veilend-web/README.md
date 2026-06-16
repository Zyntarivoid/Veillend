# VeilLend Web

The VeilLend web application — a privacy-first decentralized lending interface built on Stellar/Soroban.

## Prerequisites

- **Node.js** 22+
- **npm** 10+

## Getting Started

```bash
npm install
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
├── src/
│   └── app/          # Next.js App Router pages and layouts
├── public/           # Static assets
├── eslint.config.mjs # ESLint configuration
├── .prettierrc       # Prettier configuration
└── tsconfig.json     # TypeScript configuration
```

## Contributing

1. Fork the repo and create a branch from `main`
2. Run `npm install` to install dependencies
3. Make your changes — ensure `npm run type-check` and `npm run lint` pass
4. Open a pull request

For more context, see the [root README](../README.md) and the broader VeilLend architecture.
