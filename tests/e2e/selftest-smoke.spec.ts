import { expect, test } from '@playwright/test'

test('health route has no IPC validation errors', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: /health/i }).click()

  expect(consoleErrors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})
