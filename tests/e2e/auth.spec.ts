/**
 * Authentication Flow E2E Tests
 *
 * These tests verify that auth-related routes render correctly regardless
 * of whether the engine has a saved session, active session, or no session.
 * They do NOT assume a specific auth state — they adapt to the current runtime.
 */
import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('initial load renders a valid app state without blank screen', async ({ page }) => {
    // The app should render one of: Dashboard (authenticated), TR view (unauthenticated),
    // or restore prompt — never a blank screen
    const dashboard = page.getByText(/Portfolio Overview/i)
    const trHeading = page.getByRole('heading', { name: /Trade Republic/i })

    await expect(dashboard.or(trHeading)).toBeVisible()
  })

  test('Trade Republic nav button navigates to TR view', async ({ page }) => {
    await page.getByRole('button', { name: /trade republic/i }).click()

    // Should show TR heading regardless of auth state
    await expect(page.getByRole('heading', { name: /Trade Republic/i })).toBeVisible()
  })

  test('TR view shows login form, restore prompt, or connected state', async ({ page }) => {
    await page.getByRole('button', { name: /trade republic/i }).click()

    // Wait for the TR view to settle into one of three valid states.
    // The auto-restore path can take several seconds.
    const settled = await Promise.race([
      page
        .getByText(/Connect to Trade Republic/i)
        .waitFor({ timeout: 10000 })
        .then(() => 'login'),
      page
        .getByText(/Welcome back/i)
        .waitFor({ timeout: 10000 })
        .then(() => 'restore'),
      page
        .getByRole('button', { name: /Sync Now/i })
        .waitFor({ timeout: 10000 })
        .then(() => 'connected'),
      page
        .getByRole('button', { name: /Logout/i })
        .waitFor({ timeout: 10000 })
        .then(() => 'connected'),
    ])

    // Any of these is a valid state — the test only fails on blank screen or timeout
    expect(['login', 'restore', 'connected']).toContain(settled)
  })

  test('navigates between views using sidebar', async ({ page }) => {
    const dashboardLink = page.getByRole('button', { name: /dashboard/i })

    if (await dashboardLink.isVisible()) {
      await dashboardLink.click()
      await expect(page.getByText(/Portfolio Overview/i)).toBeVisible()
    }
  })

  test('sidebar shows all navigation items', async ({ page }) => {
    await expect(page.getByRole('button', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /trade republic/i })).toBeVisible()
  })
})
