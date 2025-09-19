// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { chromium } = require('playwright');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

// WebSocket screenshot capture function
function createWebSocketScreenshotCapture(page, gameName, action, interval = 500, teamId = 'unknown', sessionId = 'unknown', gameId = 0) {
    // console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
    let screenshotCount = 0;
    
    const screenshotInterval = setInterval(async () => {
        try {
            // Check if page is still open before attempting screenshot
            if (page.isClosed && page.isClosed()) {
                clearInterval(screenshotInterval);
                return;
            }
            
            screenshotCount++;
            // console.log(`Taking screenshot #${screenshotCount} for ${gameName} - ${action}...`);
            
            // Take screenshot as buffer
            const screenshotBuffer = await page.screenshot();
            // console.log(`Screenshot #${screenshotCount} taken, size: ${screenshotBuffer.length} bytes`);
            
            // Convert to base64 for WebSocket transmission
            const base64Image = screenshotBuffer.toString('base64');
            
            // Send via WebSocket (this will be handled by the parent process)
            // console.log(`WebSocket screenshot #${screenshotCount} ready: ${new Date().toISOString()}`);
            
            // Emit custom event that parent can listen to
            if (global.screenshotWebSocketServer) {
                // console.log(`Broadcasting screenshot #${screenshotCount} via WebSocket server...`);
                // console.log('WebSocket server connection count:', global.screenshotWebSocketServer.getConnectionCount());
                global.screenshotWebSocketServer.broadcastScreenshot(screenshotBuffer, gameId, gameName, action, teamId, sessionId);
                // console.log(`Screenshot #${screenshotCount} broadcasted successfully`);
            } else {
                console.log('WebSocket server not available for screenshot broadcasting');
            }
        } catch (error) {
            // Only log the first error to avoid spam
            if (screenshotCount === 1) {
                console.log(`WebSocket screenshot error (browser likely closed): ${error.message}`);
            }
            // Clear the interval to stop further attempts
            clearInterval(screenshotInterval);
        }
    }, interval);

    return () => {
        // console.log(`Stopping WebSocket screenshot capture for ${gameName} - ${action} (took ${screenshotCount} screenshots)`);
        clearInterval(screenshotInterval);
    };
}

// Removed command line argument parsing - no longer used with new architecture

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

/**
 * Get game information including dashboard URL from database
 */
async function getGameInfo(gameCredentialId) {
  try {
    console.log(`Fetching game info for credential ID: ${gameCredentialId}`);
    
    const { data: gameCredential, error } = await supabase
      .from('game_credential')
      .select(`
        id,
        username,
        password,
        game:game_id (
          id,
          name,
          login_url,
          dashboard_url
        )
      `)
      .eq('id', gameCredentialId)
      .single();

    if (error) {
      console.error('Error fetching game credential:', error);
      return null;
    }

    if (!gameCredential) {
      console.error(`Game credential not found for ID: ${gameCredentialId}`);
      return null;
    }

    console.log('Game info retrieved:', {
      gameName: gameCredential.game.name,
      loginUrl: gameCredential.game.login_url,
      dashboardUrl: gameCredential.game.dashboard_url
    });

    return gameCredential;
  } catch (error) {
    console.error('Error in getGameInfo:', error);
    return null;
  }
}

async function solveCaptchaWithGemini(captchaImagePath) {
  try {
    console.log('Sending captcha image to Gemini 2.0 Flash...');
    
    // Use Gemini 2.0 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    // Read the image file
    const imageBytes = fs.readFileSync(captchaImagePath);
    
    // Create the prompt for captcha solving
    const prompt = "The image is a captcha and will contain only numbers. Please read ALL the characters you see in the main sequence. Return ONLY the characters you see in order from left to right, with no additional explanation or formatting. Focus on the prominent, dark characters that appear to be the main captcha text, ignoring any faint background characters. Do not confuse similar-looking characters - for example, 7 is the digit seven, not the symbol '>'. If you cannot read it clearly, return 'ERROR'.";
    
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
  
  // Removed debugging code that was printing all visible text
  
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

// Function to save or update credentials in Supabase
async function saveOrUpdateCredentials(username, password, teamId, gameId) {
  try {
    console.log('Saving/updating credentials in Supabase...');
    console.log('Parameters:', { username, teamId, gameId });
    
    // Check if credentials already exist for this team and game combination
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id, username, password')
      .eq('team_id', teamId)
      .eq('game_id', gameId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for existing credentials:', checkError);
      throw new Error(`Failed to check existing credentials: ${checkError.message}`);
    }
    
    if (existingCredential) {
      console.log('Found existing credentials, updating...');
      
             // Update existing credentials
       const { data: updateData, error: updateError } = await supabase
         .from('game_credential')
         .update({
           username: username,
           password: password
         })
         .eq('id', existingCredential.id)
         .select();
      
      if (updateError) {
        console.error('Failed to update credentials:', updateError);
        throw new Error(`Failed to update credentials: ${updateError.message}`);
      }
      
      console.log('Credentials updated successfully:', updateData);
      return updateData[0];
    } else {
      console.log('No existing credentials found, creating new ones...');
      
             // Create new credentials using team_id and game_id directly
       const { data: newCredential, error: insertError } = await supabase
         .from('game_credential')
         .insert({
           team_id: teamId,
           game_id: gameId,
           username: username,
           password: password
         })
         .select();
      
      if (insertError) {
        console.error('Failed to create credentials:', insertError);
        throw new Error(`Failed to create credentials: ${insertError.message}`);
      }
      
      console.log('New credentials created successfully:', newCredential);
      return newCredential[0];
    }
  } catch (error) {
    console.error('Error saving/updating credentials:', error);
    throw error;
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
    const currentTeamId = teamId; // This should be the passed teamId parameter
    const currentUserId = userId;
    
    console.log('Using teamId:', currentTeamId, 'userId:', currentUserId, 'gameCredentialId:', gameCredentialId);
    console.log('Team ID parameter received:', teamId);
    

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

async function performLoginAttempt(page, username, password, gameCredentialId) {
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
    
    // Get game info from database to check dashboard URL
    const gameInfo = await getGameInfo(gameCredentialId);
    if (!gameInfo) {
      console.log('Could not fetch game info from database, falling back to pattern matching');
      
      // Fallback to pattern matching if we can't get game info
      const successPatterns = ['admin', 'HomeDetail', 'Cashier.aspx'];
      const isLoginSuccessful = successPatterns.some(pattern => 
        currentUrl.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (isLoginSuccessful) {
        console.log('Login successful! URL contains success pattern (fallback).');
        return { result: 'success', captchaData: captchaResult.captchaData };
      } else {
        console.log('Login not successful - URL does not contain success patterns (fallback).');
        
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
    }
    
    // Compare current URL with dashboard URL from database
    const dashboardUrl = gameInfo.game.dashboard_url;
    console.log(`Expected dashboard URL: ${dashboardUrl}`);
    console.log(`Current URL: ${currentUrl}`);
    
    // More strict URL matching - check if current URL matches dashboard URL exactly or contains the dashboard path
    const normalizedCurrentUrl = currentUrl.toLowerCase();
    const normalizedDashboardUrl = dashboardUrl.toLowerCase();
    
    // Extract the domain and path from dashboard URL
    const dashboardUrlObj = new URL(normalizedDashboardUrl);
    const dashboardDomain = dashboardUrlObj.hostname;
    const dashboardPath = dashboardUrlObj.pathname;
    
    // Extract the domain and path from current URL
    const currentUrlObj = new URL(normalizedCurrentUrl);
    const currentDomain = currentUrlObj.hostname;
    const currentPath = currentUrlObj.pathname;
    
    console.log(`Dashboard domain: ${dashboardDomain}, path: ${dashboardPath}`);
    console.log(`Current domain: ${currentDomain}, path: ${currentPath}`);
    
    // Check if domains match and current path contains or equals dashboard path
    const domainsMatch = currentDomain === dashboardDomain;
    const pathMatches = currentPath === dashboardPath || currentPath.startsWith(dashboardPath);
    
    const isLoginSuccessful = domainsMatch && pathMatches;
    
    console.log(`Domains match: ${domainsMatch}`);
    console.log(`Path matches: ${pathMatches}`);
    
    console.log(`URL comparison: current="${normalizedCurrentUrl}" vs dashboard="${normalizedDashboardUrl}"`);
    console.log(`Exact match: ${normalizedCurrentUrl === normalizedDashboardUrl}`);
    console.log(`Starts with: ${normalizedCurrentUrl.startsWith(normalizedDashboardUrl)}`);
    
    if (isLoginSuccessful) {
      console.log('Login successful! Current URL matches dashboard URL from database.');
      
      // Additional verification: check if we're still on a login page
      const loginFormPresent = await page.locator('input[type="password"]').isVisible();
      if (loginFormPresent) {
        console.log('WARNING: Login form still present despite URL match - login may have failed');
        console.log('Login failed - still on login page despite URL match');
        return { result: 'failed', captchaData: captchaResult.captchaData };
      }
      
      return { result: 'success', captchaData: captchaResult.captchaData };
    } else {
      console.log('Login not successful - URL does not match dashboard URL from database.');
      
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



// Function to capture session storage data from the browser
async function captureSessionStorageData(page) {
  try {
    console.log('Capturing session storage data from browser...');
    
    // Execute JavaScript in the browser to get session storage
    const sessionStorageData = await page.evaluate(() => {
      const data = {};
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            data[key] = sessionStorage.getItem(key);
          }
        }
        console.log('Session storage items found:', Object.keys(data));
      } catch (error) {
        console.error('Error accessing session storage:', error);
      }
      return data;
    });
    
    console.log(`Session storage captured: ${Object.keys(sessionStorageData).length} items`);
    return sessionStorageData;
  } catch (error) {
    console.error('Error capturing session storage:', error);
    return {};
  }
}

// Helper function to get game ID from URL
function getGameIdFromUrl(loginUrl) {
  try {
    console.log(`Determining game ID from URL: ${loginUrl}`);
    
    // Map URLs to game IDs based on the database schema
    if (loginUrl.includes('gamevault999.com')) {
      return 3; // Game Vault
    } else if (loginUrl.includes('orionstars.vip')) {
      return 2; // Orion Stars
    } else if (loginUrl.includes('juwa777.com')) {
      return 6; // Juwa City
    } else if (loginUrl.includes('yolo777.game')) {
      return 1; // Yolo
    } else if (loginUrl.includes('mrallinone777.com')) {
      return 5; // Mr All In One
    } else if (loginUrl.includes('orionstrike777.com')) {
      return 4; // Orion Strike
    }
    
    console.log('Could not determine game ID from URL');
    return null;
  } catch (error) {
    console.error('Error determining game ID from URL:', error);
    return null;
  }
}

// REMOVED: loginAndSaveState function - no longer used with new team-isolated browser architecture
// This function created its own browser instances and used file-based storage
// The new architecture uses loginWithPersistentPage with shared browser instances

// NEW: Login function that works with persistent page
async function loginWithPersistentPage(page, context, providedUsername, providedPassword, providedGameUrl, providedUserId, providedGameCredentialId, providedParams) {
  console.log('loginWithPersistentPage called with parameters:', {
    providedUsername,
    providedPassword,
    providedGameUrl,
    providedUserId,
    providedGameCredentialId,
    providedParams
  });
  
  // Always use manually entered credentials from params, never fall back to saved ones
  const loginUsername = providedParams?.username || '';
  const loginPassword = providedParams?.password || '';
  const loginGameUrl = providedGameUrl || '';
  const loginUserId = providedUserId || 'default-user-id';
  const loginGameCredentialId = providedGameCredentialId || 0;
  const loginTeamId = providedParams?.teamId;
  const loginSessionId = providedParams?.sessionId || 'unknown';
  
  if (!loginTeamId) {
    console.error('No team ID provided - cannot proceed with login');
    return {
      success: false,
      message: 'Team ID is required for login'
    };
  }
  
  console.log('Using parameters:', {
    loginUsername,
    loginPassword: '***', // Don't log password
    loginGameUrl,
    loginUserId,
    loginGameCredentialId,
    loginTeamId,
    loginSessionId
  });

  try {
    // FIXED: Screenshot capture is now started earlier in the wrapper
    // No need to start it here to avoid duplication
    console.log('Login script starting - screenshot capture already initialized by wrapper');

    const maxRetries = 5;
    let attempt = 1;
    
    while (attempt <= maxRetries) {
      console.log(`Login attempt ${attempt} of ${maxRetries}`);
      
      // Navigate to the login URL using the persistent page
      console.log(`Navigating to login URL: ${loginGameUrl}`);
      await page.goto(loginGameUrl);
      await page.waitForLoadState('networkidle');
      
      // Perform login using the existing page
      const loginResult = await performLoginAttempt(page, loginUsername, loginPassword, loginGameCredentialId);
      
      if (loginResult.result === 'success') {
        console.log('Login successful with persistent page');
        
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
        
        // Capture session data from the persistent page (same as original)
        const sessionStorageData = await captureSessionStorageData(page);
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

        // NEW: Capture session storage data
        console.log('Capturing session storage data...');
        console.log(`Session storage captured: ${Object.keys(sessionStorageData).length} items`);
        Object.entries(sessionStorageData).forEach(([key, value]) => {
          console.log(`  - ${key}: ${value}`);
        });

        const sessionData = { 
          ...storageState,
          cookies,
          cookieExpirations,
          earliestExpiration,
          earliestExpirationDate: earliestExpiration ? new Date(earliestExpiration * 1000).toISOString() : null,
          sessionStorage: sessionStorageData // NEW: Include session storage data
        };

        console.log(`Captured ${cookies.length} cookies from logged-in session`);
        console.log(`Cookies with expiration:`, cookieExpirations.length);
        cookieExpirations.forEach(cookie => {
          console.log(`  - ${cookie.name}: expires ${cookie.expiresDate}`);
        });
        console.log(`Earliest expiration: ${sessionData.earliestExpirationDate}`);
        console.log('Session data captured for Supabase');
        
        // Save or update credentials in Supabase upon successful login FIRST
        let savedCredentialId = null;
        try {
          console.log('Saving credentials after successful login...');
          
          // Determine game ID from URL
          const gameId = getGameIdFromUrl(loginGameUrl);
          
          if (!gameId) {
            console.error('Could not determine game ID for credential saving');
            console.log('Login successful but could not save credentials - game ID unknown');
          } else {
            console.log(`Using game ID: ${gameId} for credential saving`);
            console.log(`Using team ID: ${loginTeamId} for credential saving`);
            
            const savedCredential = await saveOrUpdateCredentials(
              loginUsername, 
              loginPassword, 
              loginTeamId, 
              gameId
            );
            console.log('Credentials saved/updated successfully:', savedCredential.id);
            savedCredentialId = savedCredential.id; // Store the credential ID for session creation
          }
        } catch (error) {
          console.error('Failed to save credentials after successful login:', error);
          // Don't fail the entire login process if credential saving fails
        }
        
        // Save session to Supabase - use the saved credential ID
        try {
          // Use the saved credential ID if available, otherwise use the provided one
          const sessionCredentialId = savedCredentialId || loginGameCredentialId;
          console.log(`Using team ID: ${loginTeamId} for session saving`);
          await saveSessionToSupabase(loginUsername, loginPassword, loginGameUrl, sessionData, loginUserId, sessionCredentialId, loginTeamId);
          console.log('Session saved to Supabase successfully!');
        } catch (error) {
          console.error('Failed to save session to Supabase:', error);
        }
        
        console.log('You can now run account creation without logging in again!');
        
        // Stop screenshot capture
        // FIXED: Screenshot capture cleanup handled by wrapper
        
        // Return success result for queue processing
        return {
          success: true,
          message: 'Login successful',
          sessionToken: 'session-token', // This will be generated by the session manager
          gameCredentialId: savedCredentialId || loginGameCredentialId
        };
        
      } else if (loginResult.result === 'captcha_error') {
        console.log(`Captcha error on attempt ${attempt} - will retry`);
        
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
        
        if (attempt < maxRetries) {
          console.log(`Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
          continue; // Continue to next attempt
        } else {
          console.log(`Max retries (${maxRetries}) reached.`);
          // Stop screenshot capture
          // FIXED: Screenshot capture cleanup handled by wrapper
          return {
            success: false,
            message: 'Captcha error - max retries reached'
          };
        }
      } else {
        console.log(`Login failed on attempt ${attempt}`);
        if (attempt < maxRetries) {
          console.log(`Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
          continue; // Continue to next attempt
        } else {
          console.log(`Max retries (${maxRetries}) reached.`);
          // Stop screenshot capture
          // FIXED: Screenshot capture cleanup handled by wrapper
          return {
            success: false,
            message: loginResult.message || 'Login failed - max retries reached'
          };
        }
      }
    }
  } catch (error) {
    console.error('Error in loginWithPersistentPage:', error);
    // FIXED: Screenshot capture cleanup is now handled by the wrapper
    return {
      success: false,
      message: `Login error: ${error.message}`
    };
  }
}

// Export the function for use in the queue system
module.exports = {
  loginWithPersistentPage
};

// REMOVED: Direct script execution - no longer used with new architecture
// The script is now called programmatically through action wrappers
