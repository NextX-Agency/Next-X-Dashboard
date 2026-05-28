import { expect, test, type Page } from '@playwright/test'

const APP_URL = 'http://localhost:3000'
const TEST_USER_ID = 'test-admin-id'

async function bootstrapAdminSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'auth_session',
      value: JSON.stringify({ userId: TEST_USER_ID, role: 'admin' }),
      url: APP_URL,
    },
  ])

  await page.addInitScript((userId: string) => {
    window.localStorage.setItem('auth_session', JSON.stringify({
      userId,
      role: 'admin',
      loginAt: new Date().toISOString(),
    }))
  }, TEST_USER_ID)

  await page.route('**/api/auth/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: {
          id: TEST_USER_ID,
          email: 'admin@test.com',
          name: 'Test Admin',
          role: 'admin',
        },
      }),
    })
  })

  await page.route('**/rest/v1/exchange_rates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-0/1',
      },
      body: JSON.stringify({
        id: 'rate-1',
        usd_to_srd: 40,
        is_active: true,
        set_at: '2026-01-01T00:00:00.000Z',
      }),
    })
  })
}

async function dispatchCatalogChange(page: Page, catalog: 'audio' | 'watches') {
  await page.evaluate((nextCatalog) => {
    window.localStorage.setItem('nextx:admin-catalog-focus', nextCatalog)
    window.dispatchEvent(new CustomEvent('nextx-admin-catalog-change', { detail: nextCatalog }))
  }, catalog)
}

test.describe('Admin Catalog Switch', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapAdminSession(page)
  })

  test('keeps reports in sync with the shared catalog switch', async ({ page }) => {
    await page.route('**/api/reports', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sales: [],
            items: [],
            stocks: [],
            locations: [],
            expenses: [],
            commissions: [],
            wallets: [],
            walletTransactions: [],
            reservations: [],
            comboItems: [],
            sellers: [],
            categories: [],
            purchaseOrders: [],
          },
        }),
      })
    })

    await page.goto('/reports?catalog=audio')
    await expect(page.getByRole('heading', { name: /Reports & Insights/i })).toBeVisible()

    await dispatchCatalogChange(page, 'watches')

    await expect(page).toHaveURL(/\/reports\?catalog=watches$/)
    await expect(page.getByText(/Watches report scope/i)).toBeVisible()
  })

  test('keeps stock in sync with the shared catalog switch', async ({ page }) => {
    await page.route('**/api/stock**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [],
            locations: [],
            stocks: [],
          },
        }),
      })
    })

    await page.goto('/stock?catalog=audio')
    await expect(page.getByRole('heading', { name: /Stock Management/i })).toBeVisible()

    await dispatchCatalogChange(page, 'watches')

    await expect(page).toHaveURL(/\/stock\?catalog=watches$/)
    await expect(page.getByText(/Track watches inventory across locations/i)).toBeVisible()
  })
})