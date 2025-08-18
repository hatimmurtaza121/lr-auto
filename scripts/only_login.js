// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { chromium } = require('playwright');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');


// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Function to get credentials from database using team_id and game_id
async function getCredentialsFromDatabase(teamId, gameId) {
  try {
    console.log(`Fetching credentials for team_id: ${teamId}, game_id: ${gameId}`);
    
    const { data: credentials, error } = await supabase
      .from('game_credential')
      .select('username, password')
      .eq('team_id', teamId)
      .eq('game_id', gameId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(`No credentials found for team_id: ${teamId}, game_id: ${gameId}`);
      }
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!credentials) {
      throw new Error(`No credentials found for team_id: ${teamId}, game_id: ${gameId}`);
    }
    
    console.log(`Credentials found for team ${teamId}, game ${gameId}`);
    return credentials;
    
  } catch (error) {
    console.error('Error fetching credentials:', error.message);
    throw error;
  }
}

// Debug environment variable loading
console.log('Environment variables loaded:');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
console.log('Current working directory:', process.cwd());
console.log('Env file path:', require('path').resolve('.env.local'));

async function solveCaptchaWithGemini(captchaImagePath) {
  try {
    console.log('Sending captcha image to Gemini 2.0 Flash...');
    
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    console.log('API Key length:', process.env.GEMINI_API_KEY.length);
    
    // Use Gemini 2.0 Flash model
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    // Check if image file exists
    if (!fs.existsSync(captchaImagePath)) {
      throw new Error(`Captcha image file not found: ${captchaImagePath}`);
    }
    
    // Read the image file
    const imageBytes = fs.readFileSync(captchaImagePath);
    console.log('Image file size:', imageBytes.length, 'bytes');
    
    // Create the prompt for captcha solving
    const prompt = "The image is a captcha and will contain only numbers. Please read the text in this captcha image. Return ONLY the characters you see, with no additional explanation or formatting. Do not confuse similar-looking characters (for example, 7 is the digit seven, not the symbol >). If you cannot read it clearly, return 'ERROR'.";
    
    console.log('Sending request to Gemini...');
    
    // Generate content with image
    const result = await model.generateContent([prompt, {
      inlineData: {
        data: imageBytes.toString('base64'),
        mimeType: "image/png"
      }
    }]);
    
    const response = await result.response;
    const captchaText = response.text().trim();
    
    console.log(`Gemini response: ${captchaText}`);
    
    if (captchaText === 'ERROR' || captchaText.length === 0) {
      throw new Error('Could not read captcha text from Gemini response');
    }
    
    return captchaText;
    
  } catch (error) {
    console.error('Error solving captcha with Gemini:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

async function findAndSolveCaptcha(page) {
  console.log('Looking for captcha elements...');
  
  // Captcha input field selectors
  const captchaInputSelectors = [
    'div.el-input.loginCode input.el-input__inner',
    'input.el-input__inner[placeholder="Please enter the verification code"]',
    'input.el-input__inner',
    'input.layui-input[name="captcha"]',
    'input#txtVerifyCode',
    'input[name="captcha"]',
    'input[placeholder="Please enter the verification code"]',
    'input[placeholder="Captcha"]',
    'input[placeholder="Code"]',
    'input[name*="captcha" i]',
    'input[id*="captcha" i]',
    'input[placeholder*="captcha" i]',
    'input[placeholder*="code" i]',
    'input[placeholder*="verification" i]',
    'input[placeholder*="verify" i]'
  ];
  
  // Visual captcha element selectors
  const captchaImageSelectors = [
    'img.imgCode',
    'canvas',
    'img[src*="captcha" i]',
    'div[class*="captcha" i]',
    'span[class*="captcha" i]',
    'img[alt*="captcha" i]',
    'img[title*="captcha" i]'
  ];
  
  // Find captcha input field
  let captchaInput = null;
  for (const selector of captchaInputSelectors) {
    const element = await page.locator(selector).first();
    if (await element.isVisible()) {
      captchaInput = element;
      console.log(`Found captcha input field: ${selector}`);
      break;
    }
  }
  
  if (!captchaInput) {
    console.log('No captcha input field found, skipping captcha step.');
    return { found: false, captchaData: null };
  }
  
  // Find captcha image/element to screenshot
  let captchaElement = null;
  for (const selector of captchaImageSelectors) {
    const element = await page.locator(selector).first();
    if (await element.isVisible()) {
      captchaElement = element;
      console.log(`Found captcha element: ${selector}`);
      break;
    }
  }
  
  if (!captchaElement) {
    console.log('No captcha image element found, trying to screenshot the entire page...');
    // If no specific captcha element found, try to screenshot the area around the input
    const captchaInputBox = await captchaInput.boundingBox();
    if (captchaInputBox) {
      // Screenshot a larger area around the input field
      const screenshotPath = path.join(__dirname, 'captcha.png');
      await page.screenshot({
        path: screenshotPath,
        clip: {
          x: Math.max(0, captchaInputBox.x - 200),
          y: Math.max(0, captchaInputBox.y - 100),
          width: captchaInputBox.width + 400,
          height: captchaInputBox.height + 200
        }
      });
      console.log(`Screenshot saved to: ${screenshotPath}`);
      
      // Solve captcha
      const captchaText = await solveCaptchaWithGemini(screenshotPath);
      
      // Fill the captcha input
      await captchaInput.fill(captchaText);
      console.log(`Captcha text filled: ${captchaText}`);
      
      return { found: true, captchaData: { imagePath: screenshotPath, apiResponse: captchaText } };
    }
  } else {
    // Screenshot the specific captcha element
    const screenshotPath = path.join(__dirname, 'captcha.png');
    await captchaElement.screenshot({ path: screenshotPath });
    console.log(`Captcha screenshot saved to: ${screenshotPath}`);
    
    // Solve captcha
    const captchaText = await solveCaptchaWithGemini(screenshotPath);
    
    // Fill the captcha input
    await captchaInput.fill(captchaText);
    console.log(`Captcha text filled: ${captchaText}`);
    
    return { found: true, captchaData: { imagePath: screenshotPath, apiResponse: captchaText } };
  }
  
  return { found: false, captchaData: null };
}

async function checkForCaptchaError(page) {
  console.log('Checking for captcha error messages...');
  
  // Captcha-specific error messages
  const captchaKeywords = [
    'verification code is incorrect',
    'validation code you filled in is incorrect',
    'The verification code is incorrect!',
    'please re_enter',
    'captcha is incorrect',
    'verification code error',
    'validation code error',
    'code is incorrect',
    'verification failed',
    'validation failed',
    'captcha error',
    'verification error',
    'validation error'
  ];
  
  // Check for captcha error messages in various elements
  const errorSelectors = [
    'div.el-message.el-message--error',
    'div.el-message',
    'div[role="alert"]',
    'div#mb_msg',
    'div.layui-layer-content',
    'div.layui-layer',
    'div.alert',
    'div.error',
    'span.error',
    'p.error',
    'div[class*="error"]',
    'span[class*="error"]',
    'p[class*="error"]'
  ];
  
  for (const selector of errorSelectors) {
    try {
      const errorElements = await page.locator(selector).all();
      
      for (const errorElement of errorElements) {
        if (await errorElement.isVisible()) {
          const errorText = await errorElement.textContent();
          
          if (errorText) {
            const lowerText = errorText.toLowerCase();
            console.log(`Checking error text: "${errorText}"`);
            
            for (const keyword of captchaKeywords) {
              if (lowerText.includes(keyword.toLowerCase())) {
                console.log(`Found captcha error keyword: "${keyword}" in text: "${errorText}"`);
                return true;
              }
            }
          }
        }
      }
    } catch (error) {
      // Error silently ignored
    }
  }
  
  console.log('No captcha error messages found');
  return false;
}

async function performLoginAttempt(page, username, password) {
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
  const captchaResult = await findAndSolveCaptcha(page);
  
  if (captchaResult.found) {
    console.log('Captcha found and solved automatically!');
  }
  
  console.log('Attempting to click login button...');
  
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
  
  console.log('Waiting for login response...');
  
  // Wait a moment for the page to respond
  await page.waitForTimeout(3000);
  
  // Check for captcha error messages
  const captchaError = await checkForCaptchaError(page);
  if (captchaError) {
    console.log('Captcha error detected - will retry with new captcha');
    return { result: 'captcha_error', captchaData: captchaResult.captchaData };
  }
  
  // Wait for login response and check URL for success indicators
  try {
    // Wait for page to potentially redirect after login
    await page.waitForTimeout(3000);
    
    // Get current URL
    const currentUrl = page.url();
    console.log(`Current URL after login attempt: ${currentUrl}`);
    
    // Check if we're still on a login page
    const loginFormPresent = await page.locator('input[type="password"]').isVisible();
    if (loginFormPresent) {
      console.log('Login failed - still on login page');
      return { result: 'failed', captchaData: captchaResult.captchaData };
    }
    
    console.log('Login successful!');
    return { result: 'success', captchaData: captchaResult.captchaData };
    
  } catch (error) {
    console.log('Error during login check:', error.message);
    return { result: 'failed', captchaData: captchaResult.captchaData };
  }
}

async function loginToGame(loginUrl, username, password) {
  const maxRetries = 10; // Allow up to 10 attempts for captcha
  let attempt = 1;
  
  while (attempt <= maxRetries) {
    console.log(`\n=== Login Attempt ${attempt}/${maxRetries} ===`);
    
    // Launch browser
    const browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });
   
    // Create a new browser context
    const context = await browser.newContext();
   
    // Create a new page
    const page = await context.newPage();
   
    try {
      console.log('Opening login page...');
     
      // Navigate to the login page
      await page.goto(loginUrl);
     
      console.log('Login page opened successfully!');
      
      // Wait for the page to load completely
      await page.waitForLoadState('networkidle');
      
      // Perform the login attempt
      const loginResult = await performLoginAttempt(page, username, password);
      
      if (loginResult.result === 'success') {
        console.log(`\nLogin successful on attempt ${attempt}!`);
        
        // Additional wait to ensure dashboard is fully loaded
        await page.waitForTimeout(2000);
        
        // Save the authentication state
        await context.storageState({ path: './auth-state.json' });
        console.log('Authentication state saved');
        
        // Browser stays open - user can continue using it
        console.log('Login complete! Browser will remain open for you to use.');
        return { success: true, message: 'Login successful', browser, context, page };
        
      } else if (loginResult.result === 'captcha_error') {
        console.log(`Captcha error on attempt ${attempt} - will retry with fresh page`);
        
        // Close browser for retry
        await browser.close();
        
        if (attempt < maxRetries) {
          console.log(`Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
        } else {
          console.log(`Max retries (${maxRetries}) reached.`);
          return { success: false, message: 'Login failed after max retries due to captcha errors' };
        }
        
      } else {
        // Login failed for other reasons
        console.log('Login failed - browser will remain open for debugging');
        return { success: false, message: 'Login failed due to invalid credentials or other errors', browser, context, page };
      }
      
    } catch (error) {
      console.error('Error during login process:', error);
      console.log('Browser will remain open for debugging');
      return { success: false, message: `Login error: ${error.message}`, browser, context, page };
    }
  }
}

// Lightweight function for existing browser - BEST FOR SCALABILITY
async function loginInExistingBrowser(page, teamId, gameId) {
  console.log('Logging in using existing browser instance...');
  console.log(`Using team_id: ${teamId}, game_id: ${gameId}`);
  
  const maxRetries = 10; // Allow up to 10 attempts for captcha
  let attempt = 1;
  
  while (attempt <= maxRetries) {
    console.log(`\n=== Login Attempt ${attempt}/${maxRetries} ===`);
    
    try {
      // Get credentials from database
      const credentials = await getCredentialsFromDatabase(teamId, gameId);
      console.log(`Retrieved credentials for username: ${credentials.username}`);
      
      // Wait for the page to load completely
      await page.waitForLoadState('networkidle');
      
      // Perform the login attempt with retrieved credentials
      const loginResult = await performLoginAttempt(page, credentials.username, credentials.password);
      
      if (loginResult.result === 'success') {
        console.log('Login successful in existing browser!');
        
        // Additional wait to ensure dashboard is fully loaded
        await page.waitForTimeout(2000);
        
        // Save the authentication state
        await page.context().storageState({ path: './auth-state.json' });
        console.log('Authentication state saved');
        
        return { success: true, message: 'Login successful' };
        
      } else if (loginResult.result === 'captcha_error') {
        console.log(`Captcha error on attempt ${attempt} - will retry with fresh captcha`);
        
        if (attempt < maxRetries) {
          console.log(`Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
          
          // Refresh the page to get a new captcha
          console.log('Refreshing page to get new captcha...');
          await page.reload();
          await page.waitForLoadState('networkidle');
          
          continue; // Continue to next attempt
        } else {
          console.log(`Max retries (${maxRetries}) reached.`);
          return { success: false, message: 'Login failed after max retries due to captcha errors', result: 'captcha_error' };
        }
        
      } else {
        console.log('Login failed in existing browser');
        return { success: false, message: 'Login failed due to invalid credentials or other errors', result: 'failed' };
      }
      
    } catch (error) {
      console.error(`Error in loginInExistingBrowser attempt ${attempt}:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        attempt++;
        continue; // Continue to next attempt
      } else {
        return { 
          success: false, 
          message: `Login failed after ${maxRetries} attempts: ${error.message}`, 
          result: 'error' 
        };
      }
    }
  }
}

// Export all functions
module.exports = {
  loginToGame,
  loginInExistingBrowser,
  handleLoginIfNeeded,
  executeJobWithLoginCheck
};

// Helper function for action scripts - automatically handles login if needed
async function handleLoginIfNeeded(page, teamId, gameId) {
  console.log('Checking if login is needed...');
  
  try {
    // Check if we're on a login page by looking for password input
    const loginFormPresent = await page.locator('input[type="password"]').isVisible();
    
    if (loginFormPresent) {
      console.log('Login page detected! Running login script...');
      
      // Run the login logic with automatic retry
      const loginResult = await loginInExistingBrowser(page, teamId, gameId);
      
      if (loginResult.success) {
        console.log('Login successful! Continuing with action...');
        return { success: true, message: 'Login completed, action can continue' };
      } else if (loginResult.result === 'captcha_error') {
        console.log('Login failed due to captcha errors after max retries');
        return { success: false, message: 'Login failed after max captcha retries - may need manual intervention' };
      } else {
        console.log('Login failed:', loginResult.message);
        return { success: false, message: loginResult.message };
      }
    } else {
      console.log('No login required, continuing with action...');
      return { success: true, message: 'Already logged in, action can continue' };
    }
    
  } catch (error) {
    console.error('Error checking login status:', error.message);
    return { success: false, message: `Login check error: ${error.message}` };
  }
}

// Complete job execution flow - opens dashboard, checks login, handles login if needed, then executes action
async function executeJobWithLoginCheck(page, dashboardUrl, teamId, gameId, actionScript) {
  console.log('Starting job execution...');
  
  try {
    // Step 1: Open dashboard URL
    console.log(`Opening dashboard: ${dashboardUrl}`);
    await page.goto(dashboardUrl);
    await page.waitForLoadState('networkidle');
    
    // Step 2: Check if still on dashboard URL (user is logged in)
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Check if we're still on the dashboard (not redirected to login)
    const isOnDashboard = currentUrl.includes(dashboardUrl) || 
                         currentUrl.includes('dashboard') || 
                         currentUrl.includes('home') ||
                         currentUrl.includes('main');
    
    if (isOnDashboard) {
      console.log('Still on dashboard - user is logged in!');
      console.log('Executing action script directly...');
      
      // Execute action script
      const actionResult = await actionScript(page);
      return { success: true, message: 'Action completed successfully', actionResult };
      
    } else {
      console.log('Not on dashboard - login required!');
      
      // Step 3: Handle login
      const loginStatus = await handleLoginIfNeeded(page, teamId, gameId);
      
      if (loginStatus.success) {
        console.log('Login successful! Now executing action script...');
        
        // Step 4: Execute action script after login
        const actionResult = await actionScript(page);
        return { success: true, message: 'Action completed after login', actionResult };
        
      } else {
        console.log('Login failed, cannot execute action');
        return { success: false, message: `Login failed: ${loginStatus.message}` };
      }
    }
    
  } catch (error) {
    console.error('Error during job execution:', error.message);
    return { success: false, message: `Job execution error: ${error.message}` };
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  const username = process.argv[2] || '';
  const password = process.argv[3] || '';
  const gameUrl = process.argv[4] || '';
  
  if (!username || !password || !gameUrl) {
    console.log('Usage: node only_login.js <username> <password> <gameUrl>');
    process.exit(1);
  }
  
  loginToGame(gameUrl, username, password).catch(console.error);
}
