// Load environment variables
require('dotenv').config();

const { chromium } = require('playwright');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = require('./config');

const username = process.argv[2] || '';
const password = process.argv[3] || '';
const gameurl = process.argv[4] || '';
const saveToSupabase = process.argv[5] !== 'false'; // Default to true, but can be disabled
const teamId = process.argv[6] ? parseInt(process.argv[6]) : 1; // Team ID parameter
const userId = process.argv[7] || 'default-user-id'; // User ID parameter
const storageFile = path.join(__dirname, '../auth-state.json');

// Initialize Supabase client with service role key for automation
console.log('Initializing Supabase client...');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || config.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || config.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

async function solveCaptchaWithGemini(captchaImagePath) {
  try {
    console.log('Sending captcha image to Gemini 2.0 Flash...');
    
    // Use Gemini 2.0 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    // Read the image file
    const imageBytes = fs.readFileSync(captchaImagePath);
    
    // Create the prompt for captcha solving
    const prompt = "The image is a captcha and will contain only numbers. Please read the text in this captcha image. Return ONLY the characters you see, with no additional explanation or formatting. Do not confuse similar-looking characters (for example, 7 is the digit seven, not the symbol >). If you cannot read it clearly, return 'ERROR'.";
    
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
    
    // Return captcha data for logging
    return {
      imagePath: captchaImagePath,
      apiResponse: captchaText,
      apiStatus: 'pending' // Will be updated based on login success/failure
    };
    
  } catch (error) {
    console.error('Error solving captcha with Gemini:', error);
    
    // Return captcha data even on error
    return {
      imagePath: captchaImagePath,
      apiResponse: error.message,
      apiStatus: 'fail'
    };
  }
}

async function findAndSolveCaptcha(page) {
  console.log('Looking for captcha elements...');
  
  // Captcha input field selectors
  const captchaInputSelectors = [
    'div.el-input.loginCode input.el-input__inner', // For sites with .el-input.loginCode wrapper
    'input.el-input__inner[placeholder="Please enter the verification code"]', // Most specific
    'input.el-input__inner', // Element UI
    'input.layui-input[name="captcha"]', // LayUI
    'input#txtVerifyCode', // ID-based
    'input[name="captcha"]', // Name-based
    'input[placeholder="Please enter the verification code"]',
    'input[placeholder="Captcha"]',
    'input[placeholder="Code"]',
    // Fallbacks/generics:
    'input[name*="captcha" i]',
    'input[id*="captcha" i]',
    'input[placeholder*="captcha" i]',
    'input[placeholder*="code" i]',
    'input[placeholder*="verification" i]',
    'input[placeholder*="verify" i]'
  ];
  
  // Visual captcha element selectors
  const captchaImageSelectors = [
    'img.imgCode', // GameVault captcha image
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
      const screenshotPath = path.join(__dirname, config.CAPTCHA_SCREENSHOT_PATH);
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
      const captchaData = await solveCaptchaWithGemini(screenshotPath);
      
      // Fill the captcha input
      await captchaInput.fill(captchaData.apiResponse);
      console.log(`Captcha text filled: ${captchaData.apiResponse}`);
      
      return { found: true, captchaData: captchaData };
    }
  } else {
    // Screenshot the specific captcha element
    const screenshotPath = path.join(__dirname, config.CAPTCHA_SCREENSHOT_PATH);
    await captchaElement.screenshot({ path: screenshotPath });
    console.log(`Captcha screenshot saved to: ${screenshotPath}`);
    
    // Solve captcha
    const captchaData = await solveCaptchaWithGemini(screenshotPath);
    
    // Fill the captcha input
    await captchaInput.fill(captchaData.apiResponse);
    console.log(`Captcha text filled: ${captchaData.apiResponse}`);
    
    return { found: true, captchaData: captchaData };
  }
  
  return { found: false, captchaData: null };
}

async function checkForCaptchaError(page) {
  console.log('Checking for captcha error messages...');
  
  // Captcha-specific error messages (more specific to avoid false positives)
  const captchaKeywords = [
    'verification code is incorrect',
    'validation code you filled in is incorrect',
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
  
  // First, let's log all visible text on the page to see what error messages are present
  console.log('=== DEBUGGING: Checking all visible text for errors ===');
  try {
    const allText = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter(el => el.offsetParent !== null) // Only visible elements
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0)
        .join(' | ');
    });
    console.log('All visible text on page:', allText);
  } catch (error) {
    console.log('Error getting all text:', error.message);
  }
  
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
              if (lowerText.includes(keyword)) {
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

async function logCaptchaToSupabase(imagePath, apiResponse, apiStatus) {
  try {
    console.log('Logging captcha attempt to Supabase...');
    console.log('Image path:', imagePath);
    console.log('API response:', apiResponse);
    console.log('API status:', apiStatus);
    
    // Check if image file exists
    if (!fs.existsSync(imagePath)) {
      console.log('ERROR: Image file does not exist:', imagePath);
      return;
    }
    
    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const storagePath = `${Date.now()}-${fileName}`;
    
    console.log('Image file size:', imageBuffer.length, 'bytes');
    console.log('Storage path:', storagePath);
    
    // Upload image directly to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('captcha-images')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: false
      });
    
    if (uploadError) {
      console.log('Failed to upload captcha image to storage:', uploadError.message);
      // Continue with logging even if image upload fails
    } else {
      console.log('Captcha image uploaded successfully to storage');
    }
    
    // Insert log entry directly into database
    const { data: logData, error: logError } = await supabase
      .from('captcha_log')
      .insert([
        {
          image_path: uploadError ? 'upload_failed' : storagePath, // Use placeholder if upload failed
          api_response: apiResponse || '',
          api_status: apiStatus,
          solved_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (logError) {
      console.log('Failed to log captcha attempt:', logError.message);
      console.log('Error details:', logError);
    } else {
      console.log('Captcha attempt logged successfully to database');
      console.log('Log entry ID:', logData?.[0]?.id);
    }
  } catch (error) {
    console.log('Error logging captcha to Supabase:', error.message);
    console.log('Full error:', error);
  }
}

// Function to save session to Supabase
async function saveSessionToSupabase(username, password, loginUrl, sessionData, userId, gameCredentialId, teamId) {
  try {
    console.log('Saving session data to Supabase...');
    console.log('Parameters received:', { username, loginUrl, userId, gameCredentialId, teamId });
    console.log('Session data keys:', Object.keys(sessionData || {}));
    
    // Determine game name from URL - must match database names exactly
    let gameName = 'Unknown Game';
    if (loginUrl.includes('gamevault999.com')) {
      gameName = 'Game Vault';
    } else if (loginUrl.includes('orionstars.vip')) {
      gameName = 'Orion Stars';
    } else if (loginUrl.includes('juwa777.com')) {
      gameName = 'Juwa City';
    } else if (loginUrl.includes('yolo777.game')) {
      gameName = 'Yolo';
    } else if (loginUrl.includes('mrallinone777.com')) {
      gameName = 'Mr All In One';
    } else if (loginUrl.includes('orionstrike777.com')) {
      gameName = 'Orion Strike';
    }

    console.log(`Detected game: ${gameName}`);

    // Use the team ID and user ID from parameters
    const currentTeamId = teamId;
    const currentUserId = userId;
    
    console.log('Using teamId:', currentTeamId, 'userId:', currentUserId, 'gameCredentialId:', gameCredentialId);

    // Check if session already exists for this user and game credential
    console.log('Checking for existing session...');
    const { data: existingSession, error: checkError } = await supabase
      .from('session')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('game_credential_id', gameCredentialId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for existing session:', checkError);
    }

         if (existingSession) {
                console.log('Found existing session, updating...');
         
         // Calculate expiration from session data
         const expiresAt = sessionData?.earliestExpirationDate ? sessionData.earliestExpirationDate : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
         
         // Update existing session
         const { error: sessionError } = await supabase
           .from('session')
           .update({
             session_token: `session_${Date.now()}`,
             session_data: sessionData || {},
             is_active: true,
             expires_at: expiresAt,
           })
           .eq('id', existingSession.id);

      if (sessionError) {
        console.error('Session update error:', sessionError);
        throw new Error(`Failed to update session: ${sessionError.message}`);
      }

      console.log(`Updated existing session: ${existingSession.id}`);
    } else {
      console.log('No existing session found, creating new session...');
      
      // Calculate expiration from session data
      const expiresAt = sessionData?.earliestExpirationDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      // Create new session
      const sessionDataToInsert = {
        user_id: currentUserId,
        game_credential_id: gameCredentialId,
        session_token: `session_${Date.now()}`,
        session_data: sessionData || {},
        is_active: true,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };
      
      console.log('Inserting session data:', sessionDataToInsert);
      
      const { data: newSession, error: sessionError } = await supabase
        .from('session')
        .insert(sessionDataToInsert)
        .select();

      if (sessionError) {
        console.error('Session insert error:', sessionError);
        throw new Error(`Failed to save session: ${sessionError.message}`);
      }

      console.log('Created new session:', newSession);
    }

    console.log(`Session saved successfully for game credential ${gameCredentialId}`);
    
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    throw error;
  }
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
    
    // Check if URL contains success indicators
    const successPatterns = ['admin', 'HomeDetail', 'Cashier.aspx'];
    const isLoginSuccessful = successPatterns.some(pattern => 
      currentUrl.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isLoginSuccessful) {
      console.log('Login successful! URL contains success pattern.');
      return { result: 'success', captchaData: captchaResult.captchaData };
    } else {
      console.log('Login not successful - URL does not contain success patterns.');
      
      // Check for captcha error again (in case it appeared after the redirect)
      const captchaError = await checkForCaptchaError(page);
      if (captchaError) {
        console.log('Captcha error detected after redirect - will retry with new captcha');
        return { result: 'captcha_error', captchaData: captchaResult.captchaData };
      } else {
        console.log('No captcha error found - login failed.');
        return { result: 'failed', captchaData: captchaResult.captchaData };
      }
    }
    
  } catch (error) {
    console.log('Error during login check:', error.message);
    return { result: 'failed', captchaData: captchaResult.captchaData };
  }
}

async function loginAndSaveState(providedUsername, providedPassword, providedGameUrl, providedUserId, providedGameCredentialId) {
  console.log('loginAndSaveState called with parameters:', {
    providedUsername,
    providedPassword,
    providedGameUrl,
    providedUserId,
    providedGameCredentialId
  });
  
  // Use provided parameters if available, otherwise fall back to command line args
  const loginUsername = providedUsername || username;
  const loginPassword = providedPassword || password;
  const loginGameUrl = providedGameUrl || gameurl;
  const loginUserId = providedUserId || userId;
  const loginGameCredentialId = providedGameCredentialId || 0; // Default to 0 if not provided
  
  console.log('Using parameters:', {
    loginUsername,
    loginPassword: '***', // Don't log password
    loginGameUrl,
    loginUserId,
    loginGameCredentialId
  });
  
  const maxRetries = 10; // Allow up to 10 attempts for captcha
  let attempt = 1;
  
  while (attempt <= maxRetries) {
    console.log(`\n=== Login Attempt ${attempt}/${maxRetries} ===`);
    
    // Launch browser in non-headless mode so you can see it
    const browser = await chromium.launch({
      headless: config.BROWSER_HEADLESS,
      slowMo: config.BROWSER_SLOW_MO // Add a small delay between actions for better visibility
    });
   
    // Create a new browser context
    const context = await browser.newContext();
   
    // Create a new page
    const page = await context.newPage();
   
    try {
      console.log('Opening login page...');
     
      // Navigate to the login page
      await page.goto(loginGameUrl);
     
      console.log('Login page opened successfully!');
     
      // Wait for the page to load completely
      await page.waitForLoadState('networkidle');
      
      // Perform the login attempt
      const loginResult = await performLoginAttempt(page, loginUsername, loginPassword);
      
      if (loginResult.result === 'success') {
        console.log(`\nLogin successful on attempt ${attempt}!`);
        
        // Log successful captcha if we have captcha data
        if (loginResult.captchaData) {
          console.log('Login successful - logging captcha as SUCCESS');
          loginResult.captchaData.apiStatus = 'success';
          await logCaptchaToSupabase(
            loginResult.captchaData.imagePath,
            loginResult.captchaData.apiResponse,
            loginResult.captchaData.apiStatus
          );
        } else {
          console.log('No captcha data found for successful login');
        }
        
        // Additional wait to ensure dashboard is fully loaded
        await page.waitForTimeout(2000);
        
        // Save the authentication state
        await context.storageState({ path: storageFile });
        console.log(`Authentication state saved to: ${storageFile}`);
        
        // Also save credentials for future use
        const credentialsFile = path.join(__dirname, 'stored-credentials.json');
        const credentials = { username: loginUsername, password: loginPassword };
        fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
        console.log(`Credentials saved to: ${credentialsFile}`);
        
        // Capture session data for Supabase
        const storageState = await context.storageState();
        
        // Capture cookies and calculate expiration like the original implementation
        let cookies = await context.cookies();
        console.log(`Cookies captured from logged-in session: ${cookies.length}`);
        
        // If no cookies with expiration found, wait a bit more and try again
        const cookiesWithExpiration = cookies.filter(cookie => 
          cookie.expires !== -1 && cookie.expires !== undefined
        );
        
        if (cookiesWithExpiration.length === 0) {
          console.log('No cookies with expiration found initially, waiting longer...');
          await page.waitForTimeout(5000); // Wait 5 more seconds
          cookies = await context.cookies();
          console.log(`Cookies after additional wait: ${cookies.length}`);
        }
        
        // Extract cookie expiration information from the actual cookie structure
        const cookieExpirations = cookies
          .filter(cookie => {
            // Filter out session cookies (no expiration) and cookies without expiration
            return cookie.expires !== -1 && cookie.expires !== undefined;
          })
          .map(cookie => {
            // Convert Unix timestamp to ISO date
            const expiresDate = cookie.expires ? new Date(cookie.expires * 1000).toISOString() : null;
            return {
              name: cookie.name,
              domain: cookie.domain,
              expires: cookie.expires,
              expiresDate: expiresDate,
              rawCookie: cookie // Include full cookie for debugging
            };
          });

        // Find the earliest expiration time
        const validExpirations = cookieExpirations.filter(c => c.expires && c.expires !== -1);
        const earliestExpiration = validExpirations.length > 0 
          ? Math.min(...validExpirations.map(c => c.expires))
          : null;

        const sessionData = { 
          ...storageState,
          cookies,
          cookieExpirations,
          earliestExpiration,
          earliestExpirationDate: earliestExpiration ? new Date(earliestExpiration * 1000).toISOString() : null
        };

        console.log(`Captured ${cookies.length} cookies from logged-in session`);
        console.log(`Cookies with expiration:`, cookieExpirations.length);
        cookieExpirations.forEach(cookie => {
          console.log(`  - ${cookie.name}: expires ${cookie.expiresDate}`);
        });
        console.log(`Earliest expiration: ${sessionData.earliestExpirationDate}`);
        console.log('Session data captured for Supabase');
        
                           // Save session to Supabase (only if enabled)
          if (saveToSupabase) {
            try {
              await saveSessionToSupabase(loginUsername, loginPassword, loginGameUrl, sessionData, loginUserId, loginGameCredentialId, teamId);
              console.log('Session saved to Supabase successfully!');
            } catch (error) {
              console.error('Failed to save session to Supabase:', error);
            }
          } else {
            console.log('Skipping Supabase save (disabled via parameter)');
          }
        
        console.log('You can now run account creation without logging in again!');
        
        // Close the browser after successful login and state saving
        await browser.close();
        console.log('Browser closed successfully.');
        
        // Return success result for queue processing
        return {
          success: true,
          message: 'Login successful',
          sessionToken: 'session-token', // This will be generated by the session manager
          gameCredentialId: loginGameCredentialId
        };
        
      } else if (loginResult.result === 'captcha_error') {
        console.log(`Captcha error on attempt ${attempt} - will retry with fresh page`);
        
        // Log captcha as FAIL if we have captcha data
        if (loginResult.captchaData) {
          console.log('Captcha error detected - logging captcha as FAIL');
          loginResult.captchaData.apiStatus = 'fail';
          await logCaptchaToSupabase(
            loginResult.captchaData.imagePath,
            loginResult.captchaData.apiResponse,
            loginResult.captchaData.apiStatus
          );
        }
        
        console.log('Closing browser due to captcha error...');
        await browser.close();
        console.log('Browser closed successfully after captcha error');
        
        if (attempt < maxRetries) {
          console.log(`Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
        } else {
          console.log(`Max retries (${maxRetries}) reached. Closing browser.`);
          await browser.close();
          return {
            success: false,
            message: 'Login failed after max retries due to captcha errors'
          };
        }
        
      } else {
        // Login failed for other reasons (e.g., credentials)
        // Log captcha as SUCCESS if we have captcha data (since it's not a captcha error)
        if (loginResult.captchaData) {
          console.log('Login failed for non-captcha reasons - logging captcha as SUCCESS');
          loginResult.captchaData.apiStatus = 'success';
          await logCaptchaToSupabase(
            loginResult.captchaData.imagePath,
            loginResult.captchaData.apiResponse,
            loginResult.captchaData.apiStatus
          );
        }
        
        await browser.close();
        return {
          success: false,
          message: 'Login failed due to invalid credentials or other errors'
        };
      }
      
    } catch (error) {
      console.error('Error during login process:', error);
      await browser.close();
      return {
        success: false,
        message: `Login error: ${error.message}`
      };
    }
  }
}

// Export the function for use in the queue system
module.exports = {
  loginAndSaveState
};

// Run the function if this script is executed directly
if (require.main === module) {
  loginAndSaveState().catch(console.error);
}
