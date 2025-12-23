# Tailwind CSS v4 Migration Issue

**Status**: Critical Build Failure
**Date**: 2025-12-22
**Context**: The project was missing Tailwind CSS configuration. We attempted to install it, but we inadvertently installed **Tailwind CSS v4** (the latest version), which has a different PostCSS integration strategy than v3.

---

## 1. The Issue
The build fails with:
`[postcss] It looks like you're trying to use tailwindcss directly as a PostCSS plugin. The PostCSS plugin has moved to a separate package...`

This happens because:
1.  We ran `npm install -D tailwindcss`. This installed **v4.0.0+**.
2.  We configured `postcss.config.js` using the **v3 syntax**: `plugins: { tailwindcss: {} }`.
3.  Tailwind v4 requires a dedicated package `@tailwindcss/postcss` instead of the main `tailwindcss` package in the PostCSS config.

---

## 2. Attempted Fixes
1.  **Initial Audit**: Identified missing `tailwindcss`, `postcss`, and `autoprefixer` packages.
2.  **Installation**: Ran `npm install -D tailwindcss postcss autoprefixer`.
3.  **Configuration**: Created `tailwind.config.js` and `postcss.config.js` manually.
4.  **Result**: The configuration generated was for Tailwind v3, but the installed package is Tailwind v4. This version mismatch caused the build to crash.

---

## 3. Required Resolution
We need to either:
1.  **Downgrade to Tailwind v3** (Recommended for stability):
    *   Uninstall current packages.
    *   Install `tailwindcss@3.4.17`.
    *   Keep the current config files.
2.  **Upgrade Config to Tailwind v4**:
    *   Install `@tailwindcss/postcss`.
    *   Update `postcss.config.js` to use the new plugin.
    *   Update `src/styles.css` to use the new `@import "tailwindcss";` syntax instead of `@tailwind` directives.

**Recommendation**: Downgrade to v3 to match the existing codebase patterns and avoid further migration headaches.

---

## 4. Files Involved
- `package.json` (Dependencies)
- `postcss.config.js` (The source of the error)
- `tailwind.config.js`
- `src/styles.css`
