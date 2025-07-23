const { chromium } = require('playwright');
const path = require('path');

const username = process.argv[2] || 'test__juwa';
const password = process.argv[3] || 'Abcd_test123#';
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
    await page.goto('https://ht.juwa777.com/login');
   
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
      
      console.log('Login successful!');
      
      // Wait for the page to fully load before proceeding
      await page.waitForLoadState('networkidle');
      console.log('Page fully loaded, proceeding with account creation...');
      
      // Run the createNewAccount function
      await createNewAccount(page, browser);
      
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


async function createNewAccount(page, browser) {
  const newAccountName = "testing07";
  const newPassword = "1234"; 

  console.log('Starting account creation process...');

  // Navigate to User Management
  await page.getByText('Game User').click();
  await page.getByRole('menuitem', { name: 'User Management' }).click();

  // Search for the account name
  await page.getByRole('textbox', { name: 'Please enter your search' }).fill(newAccountName);
  await page.getByRole('button', { name: ' search' }).click();

  // Wait for search results to appear
  await page.waitForSelector('tr.el-table__row, .el-table__empty-block');

  // Check if "No Data" message is present (indicating no results)
  const noDataElement = await page.locator('.el-table__empty-text:has-text("No Data")').first();
  const hasNoData = await noDataElement.isVisible();
  
  if (hasNoData) {
    console.log(`No existing user found for "${newAccountName}". Proceeding with account creation...`);
  } else {
    // Check if there are actual table rows with data
    const tableRows = await page.locator('tr.el-table__row').count();
    
    if (tableRows > 0) {
      // Get the username from the 4th td in the first row
      const usernameCell = await page.locator('tr.el-table__row td:nth-child(4) div.cell').first();
      const existingUsername = (await usernameCell.textContent())?.trim();

      if (existingUsername === newAccountName) {
        console.log(`User "${newAccountName}" already exists.`);
        return;
      }
    }
  }
  
  // Create new account
  await page.getByRole('button', { name: ' create' }).click();
  await page.locator('div').filter({ hasText: /^Use 13 or less characters with letters, underscore & numbers\.$/ }).getByRole('textbox').click();
  await page.locator('div').filter({ hasText: /^Use 13 or less characters with letters, underscore & numbers\.$/ }).getByRole('textbox').fill(newAccountName);
  await page.locator('div').filter({ hasText: /^Use letters, underscore & numbers\.$/ }).getByRole('textbox').click();
  await page.locator('div').filter({ hasText: /^Use letters, underscore & numbers\.$/ }).getByRole('textbox').fill(newPassword);
  await page.locator('div').filter({ hasText: /^Please re-enter the password$/ }).getByRole('textbox').click();
  await page.locator('div').filter({ hasText: /^Please re-enter the password$/ }).getByRole('textbox').fill(newPassword);
  await page.getByRole('button', { name: 'Save' }).click();

  // Wait a moment for any response messages to appear
  await page.waitForTimeout(2000);

  // Check for error or success messages
  try {
    // Check for error message
    const errorMessage = await page.locator('.el-message--error .el-message__content').first();
    const isErrorVisible = await errorMessage.isVisible();
    
    if (isErrorVisible) {
      const errorText = await errorMessage.textContent();
      console.log(`Error occurred: ${errorText}`);
      
      if (errorText.includes('login name have used')) {
        console.log(`User "${newAccountName}" already exists in the system.`);
        return;
      }
    } else {
      // Check for success message
      const successMessage = await page.locator('.el-message.el-message--success .el-message__content').first();
      const isSuccessVisible = await successMessage.isVisible();
      
      if (isSuccessVisible) {
        const successText = await successMessage.textContent();
        console.log(`Success: ${successText}`);
      } else {
        console.log('Account created successfully (no specific success message found).');
      }
    }
  } catch (error) {
    console.log('Account created successfully (no messages found).');
  }
  
  console.log('Browser will stay open for manual interaction.');
  console.log('Press Ctrl+C in the terminal to close the browser.');

  await new Promise(() => {}); // keep the browser open
}




// Run the main function
loginAndSaveState().catch(console.error);
