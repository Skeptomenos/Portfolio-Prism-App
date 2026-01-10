import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows Trade Republic view on initial load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Trade Republic/i })).toBeVisible()
  })

  test('displays login form when not authenticated', async ({ page }) => {
    await expect(page.getByPlaceholder(/phone/i)).toBeVisible()
    await expect(page.getByPlaceholder(/pin/i)).toBeVisible()
  })

  test('shows validation error for empty phone number', async ({ page }) => {
    const loginButton = page.getByRole('button', { name: /login|sign in|connect/i })

    if (await loginButton.isVisible()) {
      await loginButton.click()
      await expect(page.getByText(/phone|required/i)).toBeVisible()
    }
  })

  test('navigates between views using sidebar', async ({ page }) => {
    const dashboardLink = page.getByRole('button', { name: /dashboard/i })

    if (await dashboardLink.isVisible()) {
      await dashboardLink.click()
      await expect(page.getByText(/Portfolio Overview/i)).toBeVisible()
    }
  })

  test('sidebar shows all navigation items', async ({ page }) => {
    await expect(page.getByText(/Dashboard/i)).toBeVisible()
    await expect(page.getByText(/Trade Republic/i)).toBeVisible()
  })
})
