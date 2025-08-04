// Configuration file for automation scripts
module.exports = {
  // Gemini API Key for captcha solving
  // Get your API key from: https://makersuite.google.com/app/apikey
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  
  // Default credentials
  DEFAULT_USERNAME: 'default_username',
  DEFAULT_PASSWORD: 'default_password',
  
  // Screenshot settings
  CAPTCHA_SCREENSHOT_PATH: 'captcha.png',
  
  // Timeout settings
  LOGIN_TIMEOUT: 30000,
  CAPTCHA_TIMEOUT: 10000,
  
  // Browser settings
  BROWSER_HEADLESS: false,
  BROWSER_SLOW_MO: 1000,
  
  // Supabase configuration
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
}; 