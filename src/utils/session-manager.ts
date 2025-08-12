import { createClient } from '@supabase/supabase-js';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import config from '../../scripts/config.js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
}

export interface GameCredentials {
  username: string;
  password: string;
}

export interface GameInfo {
  id: number;
  name: string;
  login_url: string;
  dashboard_url?: string;
  username: string;
  password: string;
}

export class SessionManager {
  private browser: Browser | null = null;
  private currentSessionId: number | null = null;

  /**
   * Validate session data structure
   */
  private validateSessionData(sessionData: any): sessionData is SessionData {
    return (
      sessionData &&
      typeof sessionData === 'object' &&
      Array.isArray(sessionData.cookies) &&
      sessionData.cookies.every((cookie: any) => 
        cookie && 
        typeof cookie.name === 'string' &&
        typeof cookie.value === 'string' &&
        typeof cookie.domain === 'string' &&
        typeof cookie.path === 'string'
      )
    );
  }

  /**
   * Get or create a session for a user and game credential
   */
  async getOrCreateSession(userId: string, gameCredentialId: number): Promise<{
    sessionData: SessionData;
    credentials: GameCredentials;
    gameInfo: GameInfo;
    needsLogin: boolean;
  }> {
    // First, try to get existing session
    const existingSession = await this.getExistingSession(userId, gameCredentialId);
    if (existingSession) {
      return { ...existingSession, needsLogin: false };
    }

    // If no session exists, return credentials for manual login
    const gameCredential = await this.getGameCredentialInfo(gameCredentialId);
    return {
      sessionData: { cookies: [] },
      credentials: {
        username: gameCredential.username,
        password: gameCredential.password
      },
      gameInfo: {
        id: gameCredential.game.id,
        name: gameCredential.game.name,
        login_url: gameCredential.game.login_url,
        dashboard_url: gameCredential.game.dashboard_url,
        username: gameCredential.username,
        password: gameCredential.password
      },
      needsLogin: true
    };
  }

  /**
   * Get existing session from database (most recent active session)
   */
  private async getExistingSession(userId: string, gameCredentialId: number) {
    const supabase = getSupabaseClient();
    const { data: session, error } = await supabase
      .from('session')
      .select(`
        id,
        session_data,
        is_active,
        expires_at,
        created_at,
        game_credential:game_credential_id (
          id,
          username,
          password,
          game:game_id (
            id,
            name,
            login_url,
            dashboard_url
          )
        )
      `)
      .eq('user_id', userId)
      .eq('game_credential_id', gameCredentialId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as any;

    if (error || !session) {
      return null;
    }

    // Check if session has expired or has no expiration date
    const now = new Date();
    const expiresAt = session.expires_at ? new Date(session.expires_at) : null;
    
    // Consider session inactive if expires_at is null or if it has expired
    if (!expiresAt || (expiresAt && now > expiresAt)) {
      // console.log(`Session is inactive - expires_at: ${session.expires_at}`);
      
      // Mark session as inactive
      const supabase = getSupabaseClient();
      await supabase
        .from('session')
        .update({ is_active: false })
        .eq('id', session.id);
      
      return null;
    }

    return {
      sessionData: session.session_data,
      credentials: {
        username: session.game_credential.username,
        password: session.game_credential.password
      },
      gameInfo: {
        id: session.game_credential.game.id,
        name: session.game_credential.game.name,
        login_url: session.game_credential.game.login_url,
        dashboard_url: session.game_credential.game.dashboard_url,
        username: session.game_credential.username,
        password: session.game_credential.password
      }
    };
  }

  /**
   * Get game credential info
   */
  private async getGameCredentialInfo(gameCredentialId: number) {
    const supabase = getSupabaseClient();
    const { data: gameCredential, error: credentialError } = await supabase
      .from('game_credential')
      .select(`
        *,
        game:game_id (*)
      `)
      .eq('id', gameCredentialId)
      .single();

    if (credentialError || !gameCredential) {
      throw new Error(`Game credential not found: ${gameCredentialId}`);
    }

    return gameCredential;
  }

  /**
   * Create new session by performing login
   */
  private async createNewSession(userId: string, gameCredentialId: number) {
    const gameCredential = await this.getGameCredentialInfo(gameCredentialId);

    // Perform login and capture session
    const { sessionData, credentials } = await this.performLogin({
      ...gameCredential.game,
      username: gameCredential.username,
      password: gameCredential.password
    });

    // Save session to database
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const supabase = getSupabaseClient();
    const { data: newSession, error: saveError } = await supabase
      .from('session')
      .insert({
        user_id: userId,
        game_credential_id: gameCredentialId,
        session_token: sessionToken,
        session_data: sessionData,
        is_active: true,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (saveError) {
      throw new Error(`Failed to save session: ${saveError.message}`);
    }

    // Store the new session ID
    this.currentSessionId = newSession.id;

    return {
      sessionData,
      credentials,
      gameInfo: {
        id: gameCredential.game.id,
        name: gameCredential.game.name,
        login_url: gameCredential.game.login_url,
        dashboard_url: gameCredential.game.dashboard_url,
        username: gameCredential.username,
        password: gameCredential.password
      },
    };
  }

  /**
   * Perform login and capture session data
   */
  private async performLogin(game: any): Promise<{
    sessionData: SessionData;
    credentials: GameCredentials;
  }> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: config.BROWSER_HEADLESS });
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    try {
      // console.log(`Logging into ${game.name} at ${game.login_url}`);

      // Navigate to login page
      await page.goto(game.login_url);
      await page.waitForLoadState('networkidle');

      // Fill login form
      await this.fillLoginForm(page, game.username, game.password);

      // Check for captcha
      const hasCaptcha = await this.checkForCaptcha(page);
      if (hasCaptcha) {
        console.log('Captcha detected! Please handle captcha manually in your login scripts.');
        throw new Error('Captcha detected - use manual login scripts for captcha handling');
      }

      // Wait for login to complete
      await this.waitForLoginSuccess(page);

      // Capture session data (cookies only)
      const cookies = await context.cookies();
      const sessionData: SessionData = { cookies };

      // Close context
      await context.close();

      return {
        sessionData,
        credentials: {
          username: game.username,
          password: game.password,
        },
      };
    } catch (error) {
      await context.close();
      throw new Error(`Login failed for ${game.name}: ${error}`);
    }
  }

  /**
   * Fill login form with credentials
   */
  private async fillLoginForm(page: Page, username: string, password: string) {
    // Find and fill username field
    const usernameSelectors = [
      'input[placeholder*="username" i]',
      'input[placeholder*="account" i]',
      'input[name="username"]',
      'input[name="account"]',
      'input[id="username"]',
      'input[id="account"]',
    ];

    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible()) {
        await input.fill(username);
        usernameFilled = true;
        break;
      }
    }

    if (!usernameFilled) {
      throw new Error('Username field not found');
    }

    // Find and fill password field
    const passwordSelectors = [
      'input[placeholder*="password" i]',
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible()) {
        await input.fill(password);
        passwordFilled = true;
        break;
      }
    }

    if (!passwordFilled) {
      throw new Error('Password field not found');
    }

    // Click login button
    const loginButtonSelectors = [
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'input[type="submit"]',
      'button[type="submit"]',
    ];

    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        await button.click();
        loginClicked = true;
        break;
      }
    }

    if (!loginClicked) {
      throw new Error('Login button not found');
    }
  }

  /**
   * Check for captcha on the page
   */
  private async checkForCaptcha(page: Page): Promise<boolean> {
    const captchaSelectors = [
      'input[name="captcha"]',
      'input[name="txtVerifyCode"]',
      'input[id="txtVerifyCode"]',
      'input[lay-verify*="captcha"]',
      'input[placeholder="Code"]',
      'input[placeholder="Captcha"]',
      'input[placeholder="Please enter the verification code"]',
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'input[placeholder*="captcha" i]',
      'input[placeholder*="code" i]',
      'input[placeholder*="verification" i]',
      'input[placeholder*="verify" i]',
      'canvas',
      'img[src*="captcha" i]',
      'div[class*="captcha" i]',
      'span[class*="captcha" i]'
    ];

    for (const selector of captchaSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          // console.log(`Captcha detected using selector: ${selector}`);
          return true;
        }
      } catch {
        // Continue checking other selectors
      }
    }

    return false;
  }

  /**
   * Wait for login to complete
   */
  private async waitForLoginSuccess(page: Page) {
    // Wait for password field to disappear (indicating successful login)
    await page.waitForFunction(() => {
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      return passwordInputs.length === 0 || Array.from(passwordInputs).every(input => !(input as HTMLElement).offsetParent);
    }, { timeout: 30000 });

    // Additional wait to ensure dashboard is loaded
    await page.waitForTimeout(2000);
  }

  /**
   * Create browser context with stored session
   */
  async createAuthenticatedContext(sessionData: SessionData): Promise<BrowserContext> {
    try {
      if (!this.browser) {
        this.browser = await chromium.launch({ 
          headless: config.BROWSER_HEADLESS, // Use config setting
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }

      const context = await this.browser.newContext();
      
      // Set cookies from session data
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        await context.addCookies(sessionData.cookies);
      }

      // Register context for cleanup
      try {
        const { registerContextForCleanup } = await import('@/utils/browser-cleanup');
        registerContextForCleanup(context);
      } catch (error) {
        console.log('Could not register context for cleanup:', error);
      }

      return context;
    } catch (error) {
      throw new Error(`Failed to create authenticated context: ${error}`);
    }
  }

  /**
   * Check if session is still valid
   */
  async isSessionValid(page: Page): Promise<boolean> {
    try {
      // Wait a bit for page to load
      await page.waitForTimeout(1000);

      // Check for common session expired indicators
      const expiredIndicators = [
        'text=Login',
        'text=Sign in',
        'text=Session expired',
        'text=Please log in',
        'text=Log in',
        'input[type="password"]',
        'input[placeholder*="password" i]',
        'input[placeholder*="username" i]',
      ];

      for (const indicator of expiredIndicators) {
        try {
          const element = page.locator(indicator).first();
          if (await element.isVisible()) {
            // console.log(`Session expired indicator found: ${indicator}`);
            return false; // Session appears to be expired
          }
        } catch {
          // Continue checking other indicators
        }
      }

      // Check if we're on a login page by URL
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth')) {
        // console.log('Currently on login page, session appears expired');
        return false;
      }

      return true; // Session appears to be valid
    } catch (error) {
      console.error('Error checking session validity:', error);
      return false; // Assume expired if we can't check
    }
  }

  /**
   * Invalidate specific session in database
   */
  async invalidateSession(userId: string, gameId: number) {
    if (!this.currentSessionId) {
      console.warn('No current session ID to invalidate');
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('session')
      .update({ is_active: false })
      .eq('id', this.currentSessionId);

    if (error) {
      console.error('Failed to invalidate session:', error);
    }
  }

  /**
   * Get session statistics for a user and game
   */
  async getSessionStats(userId: string, gameId: number) {
    const supabase = getSupabaseClient();
    const { data: sessions, error } = await supabase
      .from('session')
      .select('id, created_at, is_active')
      .eq('user_id', userId)
      .eq('game_credential_id', gameId) // Changed from game_id to game_credential_id
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get session stats: ${error.message}`);
    }

    return {
      totalSessions: sessions?.length || 0,
      activeSessions: sessions?.filter(s => s.is_active).length || 0,
      latestSession: sessions?.[0] || null,
      sessions: sessions || []
    };
  }

  /**
   * Clean up old inactive sessions
   */
  async cleanupOldSessions(userId: string, gameId: number, daysOld: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('session')
      .delete()
      .eq('user_id', userId)
      .eq('game_credential_id', gameId) // Changed from game_id to game_credential_id
      .eq('is_active', false)
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      console.error('Failed to cleanup old sessions:', error);
    }
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    if (this.browser) {
      // Unregister browser from cleanup registry
      try {
        const { unregisterBrowser } = await import('@/utils/browser-cleanup');
        unregisterBrowser(this.browser);
      } catch (error) {
        console.log('Could not unregister browser from cleanup:', error);
      }
      
      await this.browser.close();
      this.browser = null;
    }
  }
}

/**
 * Wrapper function to execute actions with session management
 */
export async function executeWithSession<T>(
  userId: string,
  gameCredentialId: number,
  actionFunction: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T | { needsLogin: boolean; gameInfo: any }> {
  const sessionManager = new SessionManager();
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  
  try {
    // Get or create session
    const { sessionData, gameInfo, needsLogin } = await sessionManager.getOrCreateSession(userId, gameCredentialId);
    
    if (needsLogin) {
      return { needsLogin: true, gameInfo };
    }
    
    // Create authenticated browser context
    context = await sessionManager.createAuthenticatedContext(sessionData);
    page = await context.newPage();
    
    // Register page for cleanup
    try {
      const { registerPageForCleanup } = await import('@/utils/browser-cleanup');
      registerPageForCleanup(page);
    } catch (error) {
      console.log('Could not register page for cleanup:', error);
    }
    
    // Navigate to the game dashboard
    if (gameInfo.dashboard_url) {
      await page.goto(gameInfo.dashboard_url);
    } else {
      await page.goto(gameInfo.login_url);
    }
    
    await page.waitForLoadState('networkidle');
    
    // Execute the action function
    const result = await actionFunction(page, context);
    
    // Wait a bit so you can see the final state
    await page.waitForTimeout(3000);
    
    return result;
    
  } catch (error) {
    console.error('Error in executeWithSession:', error);
    throw error;
  } finally {
    // Unregister resources from cleanup registry
    try {
      if (page && context) {
        const { unregisterPage, unregisterContext } = await import('@/utils/browser-cleanup');
        unregisterPage(page);
        unregisterContext(context);
      }
    } catch (error) {
      console.log('Could not unregister resources from cleanup:', error);
    }
    
    await sessionManager.cleanup();
  }
} 