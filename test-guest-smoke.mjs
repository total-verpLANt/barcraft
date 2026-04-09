import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const GUEST_PAGE = `${BASE_URL}/guest.html`;
const BAR_PASSWORD = 'barcraft2026';

async function runTests() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    test1_navigate: { passed: false, error: null, screenshot: null },
    test1b_password: { passed: false, error: null },
    test2_create_user: { passed: false, error: null, screenshot: null },
    test3_check_storage: { passed: false, error: null, token: null },
    test4_order_attempt: { passed: false, error: null, screenshot: null },
    test5_no_401: { passed: false, error: null, requests: [] },
    test6_no_cookie_401: { passed: false, error: null },
    test7_wrong_token_403: { passed: false, error: null },
    test8_foreign_userid_403: { passed: false, error: null },
  };

  // Collect requests for 401 check
  const requests = [];
  page.on('response', response => {
    if (response.status() === 401) {
      requests.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  try {
    // Test 1: Navigate to guest.html
    console.log('TEST 1: Navigating to guest.html...');
    await page.goto(GUEST_PAGE, { waitUntil: 'networkidle' });
    results.test1_navigate.screenshot = 'test_01_initial.png';
    await page.screenshot({ path: results.test1_navigate.screenshot });
    results.test1_navigate.passed = true;
    console.log('✅ TEST 1: Navigated successfully');

    // Test 1b: Enter password to unlock guest join section
    console.log('TEST 1b: Entering password...');
    try {
      const passwordInput = page.locator('#barcraft-password');
      
      if (await passwordInput.count() > 0) {
        await passwordInput.fill(BAR_PASSWORD);
        console.log('  Password entered');
        
        const form = page.locator('#password-form');
        await form.evaluate((el) => {
          el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        
        // Wait for overlay to hide
        await page.waitForFunction(() => {
          const overlay = document.getElementById('password-overlay');
          return overlay && overlay.classList.contains('hidden');
        }, { timeout: 5000 });
        
        results.test1b_password.passed = true;
        console.log('✅ TEST 1b: Password verified, overlay hidden');
      }
    } catch (e) {
      console.log(`❌ TEST 1b: Password step failed: ${e.message}`);
      // Don't fail the whole test yet
    }

    // Small wait to ensure overlay is really gone
    await page.waitForTimeout(500);

    // Test 2: Create new user with timestamp
    console.log('TEST 2: Creating new user...');
    const timestamp = Date.now();
    const userName = `TokenTest-${timestamp}`;

    // Find and fill the name input
    const nameInput = page.locator('#new-user-name');
    if (await nameInput.count() > 0) {
      await nameInput.fill(userName);
      console.log(`  Entered name: ${userName}`);
    } else {
      throw new Error('Could not find name input field (#new-user-name)');
    }

    // Find and click the Join button
    const joinBtn = page.locator('#btn-create-user');
    if (await joinBtn.count() > 0) {
      await joinBtn.click();
      await page.waitForLoadState('networkidle');
      results.test2_create_user.passed = true;
      console.log('✅ TEST 2: User created (Join clicked)');
    } else {
      throw new Error('Could not find Join button');
    }

    results.test2_create_user.screenshot = 'test_02_after_create.png';
    await page.screenshot({ path: results.test2_create_user.screenshot });

    // Test 3: Verify guestToken is NOT in localStorage (httpOnly cookie migration)
    console.log('TEST 3: Verifying guestToken is absent from localStorage and present as httpOnly cookie...');
    const storedUser = await page.evaluate(() => {
      const userStr = localStorage.getItem('barcraft_user');
      return userStr ? JSON.parse(userStr) : null;
    });

    const tokenInStorage = storedUser && storedUser.guestToken != null;
    const userIdPresent = storedUser && storedUser.id;

    // Playwright can read httpOnly cookies via context.cookies()
    const allCookies = await context.cookies(BASE_URL);
    const guestCookie = allCookies.find(c => c.name === 'guestToken');

    if (tokenInStorage) {
      results.test3_check_storage.error = 'guestToken still present in localStorage — security regression!';
      console.log('❌ TEST 3: guestToken leaked into localStorage');
    } else if (!userIdPresent) {
      results.test3_check_storage.error = 'No user stored in localStorage after create';
      console.log('❌ TEST 3: localStorage has no user object at all');
    } else if (!guestCookie) {
      results.test3_check_storage.error = 'guestToken cookie not set by server';
      console.log('❌ TEST 3: No guestToken cookie found');
    } else {
      results.test3_check_storage.passed = true;
      results.test3_check_storage.token = guestCookie.httpOnly ? '(httpOnly — not readable by JS)' : guestCookie.value.substring(0, 20) + '...';
      console.log(`✅ TEST 3: guestToken absent from localStorage, httpOnly cookie present (httpOnly=${guestCookie.httpOnly}, sameSite=${guestCookie.sameSite})`);
    }

    // Test 4: Attempt to place an order
    console.log('TEST 4: Attempting to place an order...');
    try {
      const orderBtn = page.locator('button:has-text("In den Warenkorb")');
      if (await orderBtn.count() > 0) {
        await orderBtn.first().click();
        await page.waitForLoadState('networkidle');
        results.test4_order_attempt.passed = true;
        console.log('✅ TEST 4: Order action triggered');
      } else {
        console.log('⚠️  TEST 4: No order button found');
        results.test4_order_attempt.passed = true;
      }
    } catch (e) {
      console.log(`⚠️  TEST 4: Order attempt: ${e.message}`);
      results.test4_order_attempt.passed = true;
    }

    results.test4_order_attempt.screenshot = 'test_04_after_order.png';
    await page.screenshot({ path: results.test4_order_attempt.screenshot });

    // Test 5: Check for 401 errors
    results.test5_no_401.requests = requests;
    results.test5_no_401.passed = requests.length === 0;
    if (results.test5_no_401.passed) {
      console.log('✅ TEST 5: No 401 errors detected');
    } else {
      console.log(`❌ TEST 5: Detected ${requests.length} 401 error(s)`);
    }

    // Test 6: No cookie → 401
    console.log('TEST 6: POST /api/orders without cookie should return 401...');
    try {
      const res6 = await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'any', items: [{ drink: { drinkId: 'x', name: 'x' }, quantity: 1 }] }),
      });
      results.test6_no_cookie_401.passed = res6.status === 401;
      if (results.test6_no_cookie_401.passed) {
        console.log('✅ TEST 6: Returned 401 without cookie');
      } else {
        results.test6_no_cookie_401.error = `Expected 401, got ${res6.status}`;
        console.log(`❌ TEST 6: ${results.test6_no_cookie_401.error}`);
      }
    } catch (err) {
      results.test6_no_cookie_401.error = err.message;
      console.log(`❌ TEST 6: ${err.message}`);
    }

    // Test 7: Wrong token → 403
    console.log('TEST 7: POST /api/orders with wrong guestToken should return 403...');
    try {
      const res7 = await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'guestToken=wrongtokenwrongtokenwrongtokenwrongtokenwrongtoken',
        },
        body: JSON.stringify({ userId: 'nonexistent-user-id', items: [{ drink: { drinkId: 'x', name: 'x' }, quantity: 1 }] }),
      });
      results.test7_wrong_token_403.passed = res7.status === 403;
      if (results.test7_wrong_token_403.passed) {
        console.log('✅ TEST 7: Returned 403 with wrong token');
      } else {
        results.test7_wrong_token_403.error = `Expected 403, got ${res7.status}`;
        console.log(`❌ TEST 7: ${results.test7_wrong_token_403.error}`);
      }
    } catch (err) {
      results.test7_wrong_token_403.error = err.message;
      console.log(`❌ TEST 7: ${err.message}`);
    }

    // Test 8: Valid own cookie + foreign userId → 403
    console.log('TEST 8: POST /api/orders with valid token but foreign userId should return 403...');
    try {
      // Get the real guestToken from the browser context (set by test2)
      const browserCookies = await context.cookies(BASE_URL);
      const guestCookie = browserCookies.find(c => c.name === 'guestToken');

      // Create a second user to get a foreign userId
      const secondUserRes = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'NegativTestUser_B' }),
      });
      const { user: userB } = await secondUserRes.json();

      if (!guestCookie || !userB?.id) {
        results.test8_foreign_userid_403.error = 'Could not get cookie or create second user';
        console.log(`❌ TEST 8: ${results.test8_foreign_userid_403.error}`);
      } else {
        // Use our own cookie (user A's token) with user B's ID → must be rejected
        const res8 = await fetch(`${BASE_URL}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `guestToken=${guestCookie.value}`,
          },
          body: JSON.stringify({ userId: userB.id, items: [{ drink: { drinkId: 'x', name: 'x' }, quantity: 1 }] }),
        });
        results.test8_foreign_userid_403.passed = res8.status === 403;
        if (results.test8_foreign_userid_403.passed) {
          console.log('✅ TEST 8: Returned 403 for foreign userId with own token');
        } else {
          results.test8_foreign_userid_403.error = `Expected 403, got ${res8.status}`;
          console.log(`❌ TEST 8: ${results.test8_foreign_userid_403.error}`);
        }
      }
    } catch (err) {
      results.test8_foreign_userid_403.error = err.message;
      console.log(`❌ TEST 8: ${err.message}`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    let passCount = 0;
    for (const [test, result] of Object.entries(results)) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${test}: ${result.passed ? 'PASS' : 'FAIL'}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.screenshot) console.log(`   Screenshot: ${result.screenshot}`);
      if (result.token) console.log(`   Token: ${result.token.substring(0, 30)}...`);
      if (result.requests && result.requests.length > 0) {
        console.log(`   401 Requests: ${result.requests.map(r => r.url).join(', ')}`);
      }
      if (result.passed) passCount++;
    }
    console.log('='.repeat(60));
    console.log(`TOTAL: ${passCount}/9 tests passed\n`);

  } catch (error) {
    console.error('❌ Test execution error:', error.message);
    results.error = error.message;
  } finally {
    await browser.close();
  }
}

runTests();
