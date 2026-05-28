import path from 'path';
import { devices, expect, test, type Page } from '@playwright/test';

const APP_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-admin-id';
const NOW = '2026-05-28T12:00:00.000Z';
const uploadFilePath = path.join(process.cwd(), 'public', 'favicon.png');

async function bootstrapAdminSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'auth_session',
      value: JSON.stringify({ userId: TEST_USER_ID, role: 'admin' }),
      url: APP_URL,
    },
  ]);

  await page.addInitScript((userId: string, now: string) => {
    window.localStorage.setItem('auth_session', JSON.stringify({
      userId,
      role: 'admin',
      loginAt: now,
    }));
  }, TEST_USER_ID, NOW);

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
    });
  });

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
        set_at: NOW,
      }),
    });
  });
}

async function mockJson(page: Page, pattern: string, payload: unknown) {
  await page.route(pattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function mockAdminApis(page: Page) {
  const location = {
    id: 'loc-1',
    name: 'Paramaribo HQ',
    address: 'Main Street 1',
    created_at: NOW,
    updated_at: NOW,
    seller_name: 'Asha',
    seller_phone: '+597000000',
    commission_rate: 10,
    is_active: true,
  };

  const wallet = {
    id: 'wallet-1',
    person_name: 'Main Wallet',
    type: 'cash',
    currency: 'USD',
    balance: 1250,
    created_at: NOW,
    updated_at: NOW,
    location_id: 'loc-1',
  };

  await mockJson(page, '**/api/orders**', {
    data: {
      orders: [
        {
          id: 'order-1',
          wallet_id: 'wallet-1',
          location_id: 'loc-1',
          supplier_id: 'supplier-1',
          total_amount: 200,
          currency: 'USD',
          exchange_rate: 40,
          status: 'pending',
          notes: 'Mobile test order',
          expected_arrival: NOW,
          created_at: NOW,
          updated_at: NOW,
          wallets: wallet,
          locations: { id: 'loc-1', name: 'Paramaribo HQ' },
          clients: { id: 'supplier-1', name: 'Supplier One' },
          purchase_order_items: [
            {
              id: 'order-item-1',
              order_id: 'order-1',
              item_id: 'item-1',
              quantity: 2,
              unit_cost: 100,
              subtotal: 200,
              quantity_received: 0,
              items: { id: 'item-1', name: 'Audio Cable', purchase_price_usd: 100 },
            },
          ],
        },
      ],
      items: [
        { id: 'item-1', name: 'Audio Cable', purchase_price_usd: 100 },
      ],
      locations: [
        { id: 'loc-1', name: 'Paramaribo HQ' },
      ],
      wallets: [wallet],
      clients: [
        { id: 'supplier-1', name: 'Supplier One' },
      ],
    },
  });

  await mockJson(page, '**/api/expenses**', {
    data: {
      categories: [
        { id: 'expense-category-1', name: 'Marketing', created_at: NOW },
      ],
      expenses: [
        {
          id: 'expense-1',
          category_id: 'expense-category-1',
          wallet_id: 'wallet-1',
          amount: 25,
          currency: 'USD',
          description: 'Campaign test spend',
          created_at: NOW,
          location_id: 'loc-1',
          expense_categories: { id: 'expense-category-1', name: 'Marketing', created_at: NOW },
          wallets: wallet,
          locations: location,
        },
      ],
      wallets: [wallet],
      locations: [location],
    },
  });

  await mockJson(page, '**/api/wallets**', {
    data: {
      wallets: [
        {
          ...wallet,
          purpose: 'operational',
          locations: location,
        },
      ],
      locations: [location],
      transactions: [
        {
          id: 'wallet-transaction-1',
          wallet_id: 'wallet-1',
          type: 'credit',
          amount: 50,
          balance_before: 1200,
          balance_after: 1250,
          description: 'Initial mobile test balance',
          created_at: NOW,
          currency: 'USD',
          reference_type: 'adjustment',
          reference_id: 'adjustment-1',
          wallets: {
            ...wallet,
            purpose: 'operational',
            locations: location,
          },
        },
      ],
    },
  });

  await mockJson(page, '**/api/commissions**', {
    data: {
      commissions: [
        {
          id: 'commission-1',
          seller_id: 'seller-1',
          sale_id: 'sale-1',
          commission_amount: 15,
          paid: false,
          created_at: NOW,
          location_id: 'loc-1',
          category_id: 'category-1',
          locations: location,
          sales: {
            id: 'sale-1',
            location_id: 'loc-1',
            seller_id: 'seller-1',
            currency: 'USD',
            exchange_rate: 40,
            total_amount: 150,
            payment_method: 'cash',
            notes: null,
            created_at: NOW,
            wallet_id: 'wallet-1',
          },
          categories: { id: 'category-1', name: 'IEMs', created_at: NOW },
        },
      ],
      locations: [location],
      wallets: [wallet],
      categories: [
        { id: 'category-1', name: 'IEMs', created_at: NOW },
      ],
      sellers: [
        { id: 'seller-1', name: 'Asha', commission_rate: 10, created_at: NOW, updated_at: NOW, location_id: 'loc-1' },
      ],
      sellerCategoryRates: [
        { id: 'seller-rate-1', seller_id: 'seller-1', category_id: 'category-1', commission_rate: 12, created_at: NOW },
      ],
    },
  });

  await mockJson(page, '**/api/invoices**', {
    data: {
      invoices: [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-1001',
          location_id: 'loc-1',
          location_name: 'Paramaribo HQ',
          created_at: NOW,
          total_amount: 150,
          currency: 'USD',
          payment_method: 'cash',
          type: 'sale',
          items: [
            {
              id: 'invoice-item-1',
              item_id: 'item-1',
              item_name: 'Audio Cable',
              quantity: 1,
              unit_price: 150,
              subtotal: 150,
            },
          ],
        },
      ],
      locations: [location],
      stats: {
        totalSales: 1,
        totalReservations: 0,
        todaySales: 1,
        todayReservations: 0,
      },
    },
  });

  await page.route('**/api/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://example.com/mobile-upload-test.png' }),
    });
  });
}

async function verifyOrders(page: Page) {
  await page.goto('/orders');
  await expect(page.locator('body')).toContainText('Manage purchase orders and inventory');
  await page.locator('button:has-text("New Order")').first().click();
  await expect(page.getByRole('heading', { name: 'New Purchase Order' })).toBeVisible();
}

async function verifyExpenses(page: Page) {
  await page.goto('/expenses');
  await expect(page.locator('body')).toContainText('Track business expenses and categories');
  const marketingChip = page.locator('div.group.bg-muted.rounded-full').filter({ hasText: 'Marketing' }).first();
  await expect(marketingChip.locator('button').nth(0)).toBeVisible();
  await expect(marketingChip.locator('button').nth(1)).toBeVisible();
  await page.locator('button:has-text("New Expense")').first().click();
  await expect(page.getByRole('heading', { name: 'Record Expense' })).toBeVisible();
}

async function verifyWallets(page: Page) {
  await page.goto('/wallets');
  await expect(page.locator('body')).toContainText('Manage location wallets and finances');
  await expect(page.getByRole('button', { name: /Transfer/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /History/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /New/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /Transfer/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Transfer Between Wallets' })).toBeVisible();
}

async function verifyCommissions(page: Page) {
  await page.goto('/commissions');
  await expect(page.locator('body')).toContainText('Track sales commissions by location');
  const editButton = page.getByRole('button', { name: 'Edit' }).first();
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(page.getByRole('heading', { name: 'Edit Category Rate' })).toBeVisible();
}

async function verifyInvoices(page: Page) {
  await page.goto('/invoices');
  await expect(page.locator('body')).toContainText('View and print all sales and reservation invoices');
  await page.getByText('INV-1001').click();
  await expect(page.getByRole('button', { name: 'Print Invoice' })).toBeVisible();
}

async function verifyImageUpload(page: Page) {
  await page.goto('/upload-example');
  await expect(page.locator('body')).toContainText('Image Upload Example');
  await page.locator('input[type="file"]').setInputFiles(uploadFilePath);
  await expect(page.getByRole('button', { name: /^Change$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove$/ })).toBeVisible();
}

const mobileProfiles = [
  { name: 'iphone', device: devices['iPhone 13'] },
  { name: 'android', device: devices['Pixel 7'] },
];

for (const profile of mobileProfiles) {
  const { defaultBrowserType: _defaultBrowserType, ...mobileUse } = profile.device;

  test.describe(`Mobile Touch Actions (${profile.name})`, () => {
    test.use({
      ...mobileUse,
    });

    test('keeps admin and upload actions usable on touch layouts', async ({ page }) => {
      await bootstrapAdminSession(page);
      await mockAdminApis(page);

      await verifyOrders(page);
      await verifyExpenses(page);
      await verifyWallets(page);
      await verifyCommissions(page);
      await verifyInvoices(page);
      await verifyImageUpload(page);
    });
  });
}