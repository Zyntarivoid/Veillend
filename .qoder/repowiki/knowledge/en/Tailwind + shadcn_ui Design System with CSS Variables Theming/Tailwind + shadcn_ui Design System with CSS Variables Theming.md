---
kind: frontend_style
name: Tailwind + shadcn/ui Design System with CSS Variables Theming
category: frontend_style
scope:
    - '**'
source_files:
    - veilend-web/src/app/globals.css
    - veilend-web/components.json
    - veilend-web/src/components/ui/button.tsx
    - veilend-web/src/app/layout.tsx
    - veilend-mobile/tailwind.config.js
    - veilend-mobile/postcss.config.js
    - veilend-mobile/App.tsx
---

## What system/approach is used

The monorepo contains two frontend applications that share a consistent Tailwind CSS–based design approach, but implement it on separate platforms:

- **veilend-web** (Next.js): Uses Tailwind CSS v4 (`@import "tailwindcss"` in `globals.css`) together with the shadcn/ui component library configured via `components.json` (`style: "radix-vega"`, `rsc: true`, `tsx: true`). It also imports `tw-animate-css` for animation utilities and uses Radix UI primitives under the hood. Styling is driven by CSS custom properties (design tokens) defined in `src/app/globals.css` and exposed through a `@theme inline` block so they are available as Tailwind theme values.
- **veilend-mobile** (Expo/React Native): Uses Tailwind CSS via `postcss.config.js` with a minimal `tailwind.config.js` that extends the theme with brand colors (`primary: #A855F7`, `secondary: #00D1FF`, `background: #0A0A0A`, `card: #1A1A0A`, `text`, `textSecondary`). Components mix Tailwind utility classes with React Native `StyleSheet.create` for layout properties that Tailwind does not cover (e.g. `flex`, `position`, `zIndex`).

Both apps use a dark-first palette centered on purple (`#A855F7`) and cyan (`#00D1FF`) accents over near-black backgrounds (`#0A0A0A`).

## Key files and packages

- `veilend-web/src/app/globals.css` — central stylesheet: imports Tailwind, `tw-animate-css`, `shadcn/tailwind.css`; declares CSS variables for VeilLend brand tokens and shadcn neutral-theme tokens; defines light/dark mode overrides via a `.dark` class and a `@custom-variant dark` rule; sets base layer resets.
- `veilend-web/components.json` — shadcn/ui configuration: style preset `radix-vega`, RSC enabled, aliases mapping `@/components/ui` to generated shadcn components, `lucide` icon library, `neutral` base color, CSS variables enabled.
- `veilend-web/src/components/ui/*.tsx` — generated shadcn/ui primitive components (button, card, dialog, input, badge, alert, checkbox, progress, separator, skeleton, tooltip). The button component demonstrates the pattern: variants and sizes are declared with `class-variance-authority` (`cva`) and composed via `cn()` from `@/lib/utils`.
- `veilend-web/src/app/layout.tsx` — root layout that injects Google Fonts (`Inter`, `Geist`, `Geist_Mono`) as CSS variables (`--font-sans`, `--font-geist-sans`, `--font-geist-mono`) consumed by the Tailwind theme.
- `veilend-web/postcss.config.mjs` / `next.config.ts` — Tailwind v4 PostCSS setup integrated with Next.js.
- `veilend-mobile/tailwind.config.js` — mobile Tailwind config extending the theme with brand color tokens.
- `veilend-mobile/postcss.config.js` — enables Tailwind processing for Expo.
- `veilend-mobile/App.tsx` — app shell using React Native `StyleSheet` for structural styles and Tailwind classes for color/text styling; hardcodes the same background color (`#0A0A0A`) as the web app.

## Architecture and conventions

1. **Design tokens live in CSS variables.** All brand colors, semantic colors (success/warning/error), typography variables, radii, shadows, and chart/sidebar tokens are declared as `--veil-*` or shadcn `--*` variables in `globals.css`. The `@theme inline` block maps them into Tailwind's theme namespace (`--color-primary`, `--color-background`, `--radius-md`, etc.), so components reference tokens rather than raw hex values.
2. **Dark mode is opt-in via a `.dark` class.** A `@custom- variant dark (&:is(.dark *))` rule lets any selector be prefixed with `.dark` to override token values. The `.dark` block redefines all shadcn neutral tokens for a dark appearance; the web app's body defaults to the dark palette while the light palette is available by toggling the class.
3. **shadcn/ui primitives are the shared UI building blocks.** Generated components under `src/components/ui/` are imported directly by feature components (e.g. `Button`, `Card`, `Dialog`, `Input`, `Badge`, `Alert`, `Checkbox`, `Progress`, `Separator`, `Skeleton`, `Tooltip`). Variants and sizes are managed through `class-variance-authority` patterns, keeping component APIs declarative.
4. **Utility composition via `cn()`.** Component className props are merged with `cn(...)` from `@/lib/utils`, which is the standard shadcn pattern for conditional class application.
5. **Mobile mirrors the web palette but uses native layouts.** The mobile app defines matching brand tokens in its Tailwind config and uses the same hex values in `App.tsx` (`backgroundColor: '#0A0A0A'`), ensuring visual parity across platforms even though layout is handled by React Native Flexbox rather than Tailwind.
6. **Typography is font-variable based.** Fonts are loaded via `next/font/google` and assigned to CSS custom properties (`--font-sans`, `--font-geist-sans`, `--font-geist-mono`), then referenced in the Tailwind theme so components can use `font-sans` / `font-mono` consistently.

## Conventions and constraints

- **Use Tailwind utility classes over custom CSS.** Both apps compose UI primarily with Tailwind classes; custom CSS is reserved for global tokens, base resets, and animations.
- **Never hardcode brand colors in components.** Colors should come from the Tailwind theme tokens (`bg-primary`, `text-foreground`, `border-border`, etc.) which resolve to the CSS variables defined centrally in `globals.css` / `tailwind.config.js`.
- **Extend shadcn/ui variants rather than duplicating components.** New component variants and sizes are added via `cva` (as shown in `button.tsx`), keeping variant logic centralized.
- **Dark-mode overrides go in the `.dark` block.** Any new token introduced for the brand palette must have a corresponding `.dark` override if it participates in light/dark switching.
- **Mobile layout uses React Native `StyleSheet` for non-Tailwind properties.** Properties like `flex`, `position`, `zIndex`, and `alignItems` are set via `StyleSheet.create` because Tailwind for React Native does not generate those utilities.
- **Generated shadcn components live under `@/components/ui` and are aliased via `components.json`.** Do not edit them manually; regenerate via shadcn CLI when updating the design system.