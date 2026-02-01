
import { test, expect } from '@playwright/test';

test.describe('Sri Chendur Traders - E2E Suite', () => {
  
  test.beforeEach(async ({ page }) => {
    // 1. Visit App
    await page.goto('/');
    
    // 2. Login Flow
    await page.getByTestId('input-username').fill('admin');
    await page.getByTestId('input-password').fill('password');
    await page.getByTestId('btn-login').click();
    
    // 3. Verify Dashboard Load
    await expect(page.getByText('System Operational')).toBeVisible();
    await expect(page.getByText('Net Business Equity')).toBeVisible();
  });

  test('Customer Management Flow', async ({ page }) => {
    // Navigate to Registry
    await page.getByTestId('nav-registry').click();
    await expect(page.getByText('Financial Configuration')).not.toBeVisible();

    // Open Modal
    await page.getByTestId('btn-add-customer').click();
    await expect(page.getByText('Financial Configuration')).toBeVisible();

    // Fill Form
    const testName = `TEST-USER-${Date.now()}`;
    await page.getByTestId('input-cust-name').fill(testName);
    await page.getByTestId('input-cust-phone').fill('9999999999');
    
    // Select General Role (assuming standard checkbox behavior or label click)
    await page.getByText('General / Trader').click(); 

    // Save
    await page.getByTestId('btn-save-customer').click();

    // Verify in List
    await expect(page.getByText(testName.toUpperCase())).toBeVisible();
  });

  test('Financial Voucher Flow', async ({ page }) => {
    // Navigate to Vouchers
    await page.getByTestId('nav-vouchers').click();
    
    // Create Receipt (Default is IN/General)
    const testAmount = '500';
    await page.getByTestId('input-amount').fill(testAmount);
    await page.getByPlaceholder('SEARCH...').fill('General');
    // Assuming dropdown selection or auto-select for simplicity in test
    
    // Save Voucher
    await page.getByTestId('btn-save-voucher').click();

    // Verify Alert/Toast (Mocked via window.alert usually, but here checking UI update)
    // Checking Recent Vouchers list
    await expect(page.getByText(`+ ₹${testAmount}`)).toBeVisible();
  });

  test('Navigation Check', async ({ page }) => {
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL('/');
    
    await page.getByTestId('nav-billing').click();
    await expect(page).toHaveURL('/invoices');
    
    await page.getByTestId('nav-savings-hub').click();
    await expect(page).toHaveURL('/savings');
  });

  test('Logout', async ({ page }) => {
    await page.getByTestId('btn-logout').click();
    await expect(page.getByTestId('input-username')).toBeVisible();
  });
});
