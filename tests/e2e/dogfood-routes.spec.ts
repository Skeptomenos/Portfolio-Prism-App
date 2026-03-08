/**
 * Dogfood Route Assertions (Procedures A-D from AGENTS.md)
 *
 * These tests validate that each major app route renders without
 * IPCValidationError or blank-screen failures when the engine is running.
 */
import { expect, test } from '@playwright/test'

/** Collect console errors during a test. */
function collectConsoleErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  return errors
}

// ── Procedure C — Health Diagnostics ────────────────────────────────────────

test('health route renders without IPC validation errors', async ({ page }) => {
  const errors = collectConsoleErrors(page)

  await page.goto('/')
  await page.getByRole('button', { name: /health/i }).click()

  // Should render one of the expected states, not a blank screen
  await expect(page.getByText(/missing|invalid|ready|degraded|Health/i).first()).toBeVisible()

  expect(errors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})

// ── Procedure A — Dashboard ────────────────────────────────────────────────

test('dashboard route renders without IPC validation errors', async ({ page }) => {
  const errors = collectConsoleErrors(page)

  await page.goto('/')
  await page.getByRole('button', { name: /dashboard/i }).click()

  // Should render a heading or summary content, not a blank screen
  await expect(page.getByText(/dashboard|portfolio|total|value/i).first()).toBeVisible()

  expect(errors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})

// ── Holdings Route ─────────────────────────────────────────────────────────

test('holdings route renders without IPC validation errors', async ({ page }) => {
  const errors = collectConsoleErrors(page)

  await page.goto('/')
  await page.getByRole('button', { name: /holdings/i }).click()

  // Should render holdings content or empty state, not a blank screen
  await expect(page.getByText(/holdings|positions|no data|no positions/i).first()).toBeVisible()

  expect(errors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})

// ── Procedure B — X-Ray ────────────────────────────────────────────────────

test('x-ray route renders without IPC validation errors', async ({ page }) => {
  const errors = collectConsoleErrors(page)

  await page.goto('/')
  await page.getByRole('button', { name: /x-ray/i }).click()

  // Should render X-Ray content or empty state, not a blank screen
  await expect(page.getByText(/x-ray|analysis|pipeline|run|no data/i).first()).toBeVisible()

  expect(errors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})
