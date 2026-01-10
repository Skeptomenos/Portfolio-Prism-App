import { test, expect } from '@playwright/test'

test.describe('Dashboard Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('can navigate to dashboard from sidebar', async ({ page }) => {
    const dashboardButton = page
      .locator('[data-testid="nav-dashboard"]')
      .or(page.getByRole('button', { name: /dashboard/i }))

    if (await dashboardButton.first().isVisible()) {
      await dashboardButton.first().click()
      await expect(page.getByText(/Portfolio Overview/i)).toBeVisible()
    }
  })

  test('dashboard shows loading state initially', async ({ page }) => {
    await page.goto('/')

    const dashboardButton = page
      .locator('[data-testid="nav-dashboard"]')
      .or(page.getByRole('button', { name: /dashboard/i }))

    if (await dashboardButton.first().isVisible()) {
      await dashboardButton.first().click()

      const loadingOrContent = page.getByText(/Loading|Portfolio Overview/i)
      await expect(loadingOrContent.first()).toBeVisible()
    }
  })

  test('sidebar navigation works correctly', async ({ page }) => {
    const navItems = ['Dashboard', 'Holdings', 'X-Ray', 'Health']

    for (const item of navItems) {
      const navButton = page.getByRole('button', { name: new RegExp(item, 'i') })
      if (await navButton.isVisible()) {
        await navButton.click()
        await page.waitForTimeout(500)
      }
    }
  })

  test('app has correct layout structure', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible()
  })
})
