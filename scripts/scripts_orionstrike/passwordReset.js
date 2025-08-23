const { chromium } = require('playwright');
const path = require('path');

const username = process.argv[2] || 'TestOstr';
const password = process.argv[3] || 'Abcd123#';
const storageFile = path.join(__dirname, '../auth-state.json');

async function loginAndSaveState() {
  // Launch browser in non-headless mode so you can see it
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000 // Add a small delay between actions for better visibility
  });
 
  // Create a new browser context
  const context = await browser.newContext();
 
  // Create a new page
  const page = await context.newPage();
 
  try {
    console.log('Opening login page...');
   
    // Navigate to the login page
    await page.goto('https://www.orionstrike777.com/admin/login');
   
    console.log('Login page opened successfully!');
   
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
   
    console.log('Filling in login credentials...');
   
    // Find and fill username field by placeholder (try username first, then account)
    let usernameInput = await page.locator('input[placeholder*="username" i]').first();
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      console.log(`Username filled in username field: ${username}`);
    } else {
      // If username not found, try account field
      usernameInput = await page.locator('input[placeholder*="account" i]').first();
      if (await usernameInput.isVisible()) {
        await usernameInput.fill(username);
        console.log(`Username filled in account field: ${username}`);
      } else {
        console.log('Neither username nor account input field found');
      }
    }
    
    // Find and fill password field by placeholder
    const passwordInput = await page.locator('input[placeholder*="password" i]').first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(password);
      console.log(`Password filled: ${password}`);
    } else {
      console.log('Password input field not found');
    }
   
    // Check the "remember password" checkbox (try multiple selectors)
    try {
      // Try different checkbox selectors
      const checkboxSelectors = [
        'span.el-checkbox__inner',
        'input[id="remember"]',
        'input[name="remember"]',
        'span.vs-checkbox',
        'span.vs-checkbox--check',
        'input[type="checkbox"]'
      ];
      
      let checkboxClicked = false;
      for (const selector of checkboxSelectors) {
        const checkbox = await page.locator(selector).first();
        if (await checkbox.isVisible()) {
          // Check if it's already checked (for input elements)
          if (selector.includes('input')) {
            const isChecked = await checkbox.isChecked();
            if (isChecked) {
              checkboxClicked = true;
              break;
            }
          }
          
          // Check if it's already checked (for custom checkboxes with CSS classes)
          if (selector.includes('span.el-checkbox__inner') || selector.includes('span.vs-checkbox')) {
            const parentLabel = await checkbox.locator('xpath=ancestor::label').first();
            if (await parentLabel.isVisible()) {
              const hasCheckedClass = await parentLabel.getAttribute('class');
              if (hasCheckedClass && hasCheckedClass.includes('is-checked')) {
                checkboxClicked = true;
                break;
              }
            }
          }
          
          // Click if not checked
          await checkbox.click();
          checkboxClicked = true;
          break;
        }
      }
      
      if (!checkboxClicked) {
        console.log('Remember password checkbox not found, skipping...');
      }
    } catch (error) {
      console.log('Error clicking remember password checkbox, skipping...');
    }
   
    console.log('Login form filled successfully!');
    
    // Check if captcha is present
    const captchaSelectors = [
      // Specific captcha input fields
      'input[name="captcha"]',
      'input[name="txtVerifyCode"]',
      'input[id="txtVerifyCode"]',
      'input[lay-verify*="captcha"]',
      'input[placeholder="Code"]',
      'input[placeholder="Captcha"]',
      'input[placeholder="Please enter the verification code"]',
      
      // Generic captcha patterns
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'input[placeholder*="captcha" i]',
      'input[placeholder*="code" i]',
      'input[placeholder*="verification" i]',
      'input[placeholder*="verify" i]',
      
      // Visual captcha elements
      'canvas',
      'img[src*="captcha" i]',
      'div[class*="captcha" i]',
      'span[class*="captcha" i]'
    ];
    
    let captchaFound = false;
    for (const selector of captchaSelectors) {
      const captchaElement = await page.locator(selector).first();
      if (await captchaElement.isVisible()) {
        captchaFound = true;
        console.log(`Captcha detected using selector: ${selector}`);
        break;
      }
    }
    
    if (captchaFound) {
      console.log('Captcha found! Please enter the captcha manually and click the sign in button.');
    } else {
      console.log('No captcha detected. Attempting to click login button automatically...');
      
      // Try to find and click login button
      const loginButtonSelectors = [
        // Specific button selectors
        'button.el-button.el-button--primary span:has-text("Sign in")',
        'button.el-button.el-button--primary',
        'input[name="btnLogin"]',
        'input[id="btnLogin"]',
        'button.layui-btn.layui-block',
        'button.btn.btn-primary.login-btn',
        'button[type="submit"]',
        'input[type="submit"]',
        
        // Generic patterns
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'input[value*="Login" i]',
        'input[value*="Sign In" i]',
        'button[class*="login" i]',
        'button[class*="signin" i]',
        'a[class*="login" i]',
        'a[class*="signin" i]'
      ];
      
      let loginButtonClicked = false;
      for (const selector of loginButtonSelectors) {
        const loginButton = await page.locator(selector).first();
        if (await loginButton.isVisible()) {
          await loginButton.click();
          console.log(`Login button clicked using selector: ${selector}`);
          loginButtonClicked = true;
          break;
        }
      }
      
      if (!loginButtonClicked) {
        console.log('Login button not found automatically. Please click the login button manually.');
      }
    }
    
    console.log('Waiting for login to complete...');
    
    // Wait for login to complete by checking when password field is no longer visible
    try {
      // Wait for the password field to disappear (indicating successful login)
      await page.waitForFunction(() => {
        const passwordInputs = document.querySelectorAll('input[placeholder*="password" i], input[type="password"]');
        return passwordInputs.length === 0 || Array.from(passwordInputs).every(input => !input.offsetParent);
      }, { timeout: 30000 });
      
      console.log('Password field no longer visible - login appears successful!');
      
      // Additional wait to ensure dashboard is fully loaded
      await page.waitForTimeout(2000);
      
      // Save the authentication state
      await context.storageState({ path: storageFile });
      console.log(`Authentication state saved to: ${storageFile}`);
      
      // Also save credentials for future use
      const fs = require('fs');
      const credentialsFile = path.join(__dirname, 'stored-credentials.json');
      const credentials = { username, password };
      fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
      console.log(`Credentials saved to: ${credentialsFile}`);
      console.log('You can now run account creation without logging in again!');
      
      console.log('Login successful! Now proceeding to reset account password...');
      // Run the createNewAccount function
      await resetAccountPassword(page, browser);
      
    } catch (error) {
      console.log('Login may not have been successful. Dashboard elements not found.');
      await browser.close();
      process.exit(1); // Exit with error code
    }
   
  } catch (error) {
    console.error('Error during login:', error);
    await browser.close();
  }
}

async function resetAccountPassword(page, browser) {
    //---------------------------------------------------------------------------------------------
    try {
        const accountName = "testing0";
        const newPassword = "Hatim121";
        
        console.log(`Account to reset: ${accountName}`);
        console.log(`New password: ${newPassword}`);
        
        // From here
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Navigate to Admin Structure
        await page.locator('#frm_left_frm').contentFrame().locator('a').filter({ hasText: 'Admin Structure' }).click();
        
        // Fill search field and click Search
        await page.locator('iframe[name="frm_main_content"]').contentFrame().getByRole('textbox', { name: 'Account' }).fill(accountName);
        await page.locator('iframe[name="frm_main_content"]').contentFrame().getByRole('button', { name: 'Search' }).click();
        
        // Access the main content iframe
        const mainFrame = await page.frame({ name: 'frm_main_content' });
        
        // Wait for the first result row to appear
        const firstRow = mainFrame.locator('tbody > tr.list').first();
        try {
            await firstRow.waitFor({ timeout: 5000 });
        } catch (e) {
            // console.log(`No results found. Aborting.`);
            return {
                success: false,
                message: 'No account found'
            };
        }
        
        // Extract and verify the Account cell (3rd column) in the first row
        const accountCell = firstRow.locator('td').nth(1);
        const cellText = (await accountCell.textContent()).trim();
        if (cellText !== accountName) {
            // console.log(`Account mismatch: found "${cellText}" instead of "${accountName}". Aborting.`);
            return {
                success: false,
                message: 'No account found'
            };
        }
        
        // Rest work from update
        await page.locator('iframe[name="frm_main_content"]').contentFrame().getByText('Update').click();
        
        await page.locator('iframe[name="frm_main_content"]').contentFrame().getByText('Reset Password').click();
        await page.locator('#Container iframe').contentFrame().locator('#txtConfirmPass').fill(newPassword);
        await page.locator('#Container iframe').contentFrame().locator('#txtSureConfirmPass').fill(newPassword);
        await page.locator('#Container iframe').contentFrame().getByRole('button', { name: 'Reset' }).click();
            
        // Confirm success message
        try {
            const successMsg = await page.locator('#mb_msg font').textContent();
            if (successMsg.trim() === 'Confirmed successful') {
                // console.log('Password reset successful.');
                return {
                    success: true,
                    message: 'Password reset successful'
                };
            } else {
                // console.log(`Unexpected success message: ${successMsg}`);
                return {
                    success: true,
                    message: 'Password reset successful'
                };
            }
        } catch (e) {
            // console.log('Success message not found. Password reset may have failed.');
            return {
                success: false,
                message: 'Error resetting password: No confirmation message found'
            };
        }
        
    } catch (error) {
        console.error('Error during password reset:', error);
    }
    
    console.log('Browser will stay open for manual interaction.');
    console.log('Press Ctrl+C in the terminal to close the browser.');
    
    // Keep the browser open indefinitely
    await new Promise(() => {});
}

// Run the main function
loginAndSaveState().catch(console.error);
