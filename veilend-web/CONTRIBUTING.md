# Contributing to VeilLend Web

Thank you for your interest in contributing to VeilLend! This guide will help you get the frontend development environment set up and explain our workflow.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** 22 or later — [Download](https://nodejs.org/)
- **npm** 10 or later (comes with Node.js)
- **Git** — [Download](https://git-scm.com/)

You can verify your installations:

```bash
node --version   # Should be v22+
npm --version    # Should be 10+
git --version
```

## Local Setup

1. **Fork the repository** on GitHub.

2. **Clone your fork:**

   ```bash
   git clone https://github.com/<your-username>/Veillend.git
   cd Veillend/veilend-web
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Start the development server:**

   ```bash
   npm run dev
   ```

   The app will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
veilend-web/
├── public/             # Static assets (images, icons)
├── src/
│   └── app/
│       ├── layout.tsx  # Root layout with metadata and providers
│       ├── page.tsx    # Home page component
│       └── globals.css # Global styles (Tailwind CSS)
├── .prettierrc         # Prettier configuration
├── eslint.config.mjs   # ESLint configuration
├── next.config.ts      # Next.js configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

## Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Start the Next.js development server with hot reload |
| `npm run build` | Build the application for production |
| `npm run start` | Start the production server (run `build` first) |
| `npm run lint` | Run ESLint to check for code quality issues |
| `npm run format` | Format all files with Prettier |
| `npm run type-check` | Run TypeScript type checking without emitting files |

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Linting:** ESLint + Prettier
- **Package Manager:** npm

## Code Style

We use **Prettier** and **ESLint** to maintain consistent code style. Before submitting a PR:

```bash
npm run format    # Auto-format your code
npm run lint      # Check for linting errors
npm run type-check # Verify TypeScript types
```

### Prettier Rules

- Semicolons: **yes**
- Single quotes: **yes**
- Tab width: **2 spaces**
- Trailing commas: **ES5 style**
- Print width: **100 characters**

## Branch Naming

Use descriptive branch names with a type prefix:

- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation changes
- `refactor/` — Code refactoring
- `test/` — Adding or updating tests
- `chore/` — Maintenance tasks

Examples:
- `feat/add-wallet-connection`
- `fix/loan-calculation-rounding`
- `docs/update-readme`

## Commit Messages

Write clear, concise commit messages:

```
type(scope): short description

Optional longer description of what changed and why.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat(ui): add deposit confirmation modal

Adds a confirmation step before depositing assets to prevent
accidental transactions. Includes amount display and gas estimate.
```

## Pull Request Process

1. **Create a branch** from `main` for your changes.
2. **Make your changes** following the code style guidelines.
3. **Run all checks** before submitting:
   ```bash
   npm run format
   npm run lint
   npm run type-check
   npm run build
   ```
4. **Push your branch** and open a Pull Request against `main`.
5. **Fill out the PR template** with a clear description of your changes.
6. **Link the related issue** in the PR description (e.g., "Closes #73").
7. **Wait for review.** A maintainer will review your PR and may request changes.

## Common Issues

### Build fails after pulling latest changes

```bash
rm -rf node_modules .next
npm install
npm run build
```

### TypeScript errors after adding dependencies

```bash
npm run type-check
```

If the error persists, check if the package has TypeScript types:

```bash
npm info <package-name> types
```

### Port 3000 already in use

```bash
# Find and kill the process using port 3000
lsof -i :3000
kill -9 <PID>
```

Or start on a different port:

```bash
npm run dev -- -p 3001
```

## Need Help?

- Check the [main README](../README.md) for project overview
- Look at existing [issues](https://github.com/Zyntarivoid/Veillend/issues) for known problems
- Open a new issue if you find a bug or have a feature request

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
