# Spec: Migrate to pnpm

> **Goal**: Switch package manager from `npm` to `pnpm` to comply with `rules/rules_ts.md`.
> **Estimated Time**: 15 minutes.

## 1. Overview
`rules/rules_ts.md` mandates the exclusive use of `pnpm` for strict dependency management and performance. The project currently uses `npm`.

## 2. Implementation Steps

### 2.1 Clean Setup
- [ ] Remove `node_modules` and `package-lock.json`.
- [ ] Install `pnpm` (if not available via Corepack).
    ```bash
    corepack enable
    corepack prepare pnpm@latest --activate
    ```

### 2.2 Install Dependencies
- [ ] Run `pnpm import` (optional, to generate `pnpm-lock.yaml` from `package-lock.json` before deleting it) OR just run `pnpm install`.
    - *Recommendation*: `pnpm install` fresh to ensure a clean slate given the lack of strict locking previously.

### 2.3 Update Scripts
- [ ] Update `package.json` scripts if they explicitly call `npm` (unlikely, but check).
- [ ] Update `tauri.conf.json`:
    - Check `build.beforeDevCommand`: change `npm run start` -> `pnpm start` (or `pnpm dev`).
    - Check `build.beforeBuildCommand`: change `npm run build` -> `pnpm build`.

### 2.4 CI/CD Configuration
- [ ] Update `.github/workflows/` (if any exist) to setup pnpm.
    - Use `pnpm/action-setup@v2`.
    - Cache `pnpm` store instead of `npm` modules.

## 3. Verification
- [ ] Run `pnpm dev` -> App starts.
- [ ] Run `pnpm tauri build` -> App builds.
- [ ] Verify `pnpm-lock.yaml` exists and `package-lock.json` is gone.
