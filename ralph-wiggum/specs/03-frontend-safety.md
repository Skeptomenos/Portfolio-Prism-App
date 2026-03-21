# Spec: Frontend Type Safety & Validation

> **Goal**: Enforce strict type safety in the frontend by removing `any` and implementing Zod runtime validation for IPC.
> **Estimated Time**: 30-40 minutes.

## 1. Overview
The codebase currently uses `any` in critical paths and lacks runtime validation for data coming from the Python sidecar. We will install Zod and strict schemas.

## 2. Implementation Steps

### 2.1 Install Zod
- [ ] Run `npm install zod` in the project root.

### 2.2 IPC Validation Layer
- [ ] Update `src/lib/ipc.ts`:
    - Create a generic `invoke<T>(cmd, args, schema: ZodSchema<T>)` wrapper.
    - Validate the response from Tauri against the schema.
    - Throw a typed error if validation fails.

### 2.3 Define Schemas
- [ ] Create `src/lib/schemas/ipc.ts` (or in feature folders if FSD is ready).
- [ ] Define Zod schemas for:
    - `DashboardResponseSchema`
    - `HealthStatusSchema`
    - `LoginResponseSchema`
- [ ] Update `src/types/index.ts` to infer types from Zod schemas:
    ```typescript
    export type DashboardData = z.infer<typeof DashboardResponseSchema>;
    ```

### 2.4 Remove `any` (Specific Fixes)
Fix the 13 violations identified:
- [ ] `src/types/index.ts`: Replace generic `any` with `unknown` or specific generics.
- [ ] `src/components/views/HealthView.tsx`: Define `StatusCardProps` interface.
- [ ] `src/components/HoldingsUpload.tsx`: Create interface for `File` object (or use Tauri's file type).
- [ ] `src/components/views/xray/ActionQueue.tsx`: Define `ValidationFailure` interface.
- [ ] `src/lib/scrubber.ts`: Use `Record<string, unknown>` instead of `any` for `obj`.
- [ ] `src/lib/ipc.ts`: Remove `Promise<any>`, use generic `T` with Zod schema.
- [ ] `src/components/views/XRayView.tsx`: Use `unknown` for error in catch block and type-guard it.

### 2.5 Refactor `.then()` to `async/await`
- [ ] `src/hooks/useTauriEvents.ts`: Convert `.then()` to `async` function inside `useEffect`.
- [ ] `src/components/views/HealthView.tsx`: Convert `getHiveContribution().then(...)` to `await`.

## 3. Verification
- [ ] Run `npm run typecheck` (tsc).
- [ ] Verify strict mode is still on.
- [ ] Search for `any` in `src/` -> should be 0 matches.
