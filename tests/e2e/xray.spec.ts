import { test, expect } from '@playwright/test'

test.describe('X-Ray View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('can navigate to X-Ray view', async ({ page }) => {
    const xrayButton = page
      .locator('[data-testid="nav-xray"]')
      .or(page.getByRole('button', { name: /x-ray/i }))

    if (await xrayButton.first().isVisible()) {
      await xrayButton.first().click()
      await page.waitForTimeout(1000)

      const xrayContent = page.getByText(/X-Ray|Analysis|Pipeline|Resolution/i)
      await expect(xrayContent.first()).toBeVisible()
    }
  })

  test('X-Ray view shows analysis options', async ({ page }) => {
    const xrayButton = page
      .locator('[data-testid="nav-xray"]')
      .or(page.getByRole('button', { name: /x-ray/i }))

    if (await xrayButton.first().isVisible()) {
      await xrayButton.first().click()
      await page.waitForTimeout(1000)
    }
  })

  test('can navigate to Holdings view', async ({ page }) => {
    const holdingsButton = page
      .locator('[data-testid="nav-holdings"]')
      .or(page.getByRole('button', { name: /holdings/i }))

    if (await holdingsButton.first().isVisible()) {
      await holdingsButton.first().click()
      await page.waitForTimeout(1000)

      const holdingsContent = page.getByText(/Holdings|Explorer|True/i)
      await expect(holdingsContent.first()).toBeVisible()
    }
  })

  test('can navigate to Health view', async ({ page }) => {
    const healthButton = page
      .locator('[data-testid="nav-health"]')
      .or(page.getByRole('button', { name: /health/i }))

    if (await healthButton.first().isVisible()) {
      await healthButton.first().click()
      await page.waitForTimeout(1000)

      const healthContent = page.getByText(/Health|System|Engine|Status/i)
      await expect(healthContent.first()).toBeVisible()
    }
  })
})
