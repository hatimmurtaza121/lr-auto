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
  origins?: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
  sessionStorage?: Record<string, string>; // NEW: Session storage data
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
  private browsers: Map<number, Browser> = new Map(); // NEW: Multiple browsers keyed by team ID
  private persistentPages: Map<string, Page> = new Map(); // NEW: Multiple persistent pages keyed by team+game
  private persistentContexts: Map<number, BrowserContext> = new Map(); // NEW: Multiple persistent contexts keyed by team ID
  private currentSessionId: number | null = null;
  private static globalSessionManager: SessionManager | null = null; // NEW: Global instance

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
    console.log(`Looking for session: userId=${userId}, gameCredentialId=${gameCredentialId}`);
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

    if (error) {
      console.log(`Session query error:`, error);
      return null;
    }
    
    if (!session) {
      console.log(`No active session found for userId=${userId}, gameCredentialId=${gameCredentialId}`);
      return null;
    }
    
    console.log(`Found session: id=${session.id}, expires_at=${session.expires_at}, is_active=${session.is_active}`);

    // Check if session has expired or has no expiration date
    const now = new Date();
    const expiresAt = session.expires_at ? new Date(session.expires_at) : null;
    
    console.log(`Session expiration check: now=${now.toISOString()}, expires_at=${session.expires_at}, expiresAt=${expiresAt?.toISOString()}`);
    
    // Consider session inactive if expires_at is null or if it has expired
    if (!expiresAt || (expiresAt && now > expiresAt)) {
      console.log(`Session is expired/inactive - expires_at: ${session.expires_at}, now: ${now.toISOString()}`);
      
      // Mark session as inactive
      const supabase = getSupabaseClient();
      await supabase
        .from('session')
        .update({ is_active: false })
        .eq('id', session.id);
      
      return null;
    }
    
    console.log(`Session is valid and active`);

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
  async getGameCredentialInfo(gameCredentialId: number) {
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
   * Perform login and capture session data (legacy method - uses default team browser)
   */
  private async performLogin(game: any): Promise<{
    sessionData: SessionData;
    credentials: GameCredentials;
  }> {
    // Use default team ID 1 for legacy compatibility
    const defaultTeamId = 1;
    let browser = this.browsers.get(defaultTeamId);
    
    if (!browser) {
      browser = await chromium.launch({ headless: config.BROWSER_HEADLESS });
      this.browsers.set(defaultTeamId, browser);
    }

    const context = await browser.newContext();
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
   * Get global session manager instance (singleton)
   */
  static getInstance(): SessionManager {
    if (!SessionManager.globalSessionManager) {
      SessionManager.globalSessionManager = new SessionManager();
    }
    return SessionManager.globalSessionManager;
  }

  /**
   * Get or create persistent page for specific team and game combination
   */
  async getPersistentPage(teamId: number, gameId: number): Promise<Page> {
    const pageKey = `${teamId}-${gameId}`;
    
    // Check if we already have a persistent page for this team+game combination
    let page = this.persistentPages.get(pageKey);
    if (page && !page.isClosed()) {
      console.log(`Using existing persistent page for team ${teamId}, game ${gameId}`);
      return page;
    }
    
    console.log(`Creating new persistent page for team ${teamId}, game ${gameId}`);
    
    // Get or create browser for this team
    let browser = this.browsers.get(teamId);
    if (!browser) {
      browser = await chromium.launch({ 
        headless: config.BROWSER_HEADLESS,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.browsers.set(teamId, browser);
      
      // Register browser for cleanup
      try {
        const { registerBrowserForCleanup } = await import('@/utils/browser-cleanup');
        registerBrowserForCleanup(browser);
      } catch (error) {
        console.log('Could not register browser for cleanup:', error);
      }
    }
    
    // Get or create persistent context for this team
    let context = this.persistentContexts.get(teamId);
    if (!context) {
      context = await browser.newContext();
      this.persistentContexts.set(teamId, context);
      
      // Register context for cleanup (but it will be protected if it contains persistent pages)
      try {
        const { registerContextForCleanup } = await import('@/utils/browser-cleanup');
        registerContextForCleanup(context);
      } catch (error) {
        console.log('Could not register persistent context for cleanup:', error);
      }
    }
    
    // Create new page from the team's context
    page = await context.newPage();
    this.persistentPages.set(pageKey, page);
    
    // Register persistent page for protection (will NOT be closed during cleanup)
    try {
      const { registerPersistentPageForCleanup } = await import('@/utils/browser-cleanup');
      registerPersistentPageForCleanup(page);
      console.log(`Persistent page created and registered for protection (team ${teamId}, game ${gameId})`);
    } catch (error) {
      console.log('Could not register persistent page for protection:', error);
    }
    
    return page;
  }

  /**
   * Create browser context with stored session (legacy method - uses default team browser)
   */
  async createAuthenticatedContext(sessionData: SessionData): Promise<BrowserContext> {
    try {
      // Use default team ID 1 for legacy compatibility
      const defaultTeamId = 1;
      let browser = this.browsers.get(defaultTeamId);
      
      if (!browser) {
        browser = await chromium.launch({ 
          headless: config.BROWSER_HEADLESS, // Use config setting
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.browsers.set(defaultTeamId, browser);
      }

      const context = await browser.newContext();
      
      // Set cookies from session data
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        await context.addCookies(sessionData.cookies);
      }

      // Set local storage from session data
      if (sessionData.origins && sessionData.origins.length > 0) {
        for (const origin of sessionData.origins) {
          if (origin.localStorage && origin.localStorage.length > 0) {
            // Create a page to set localStorage for this origin
            const page = await context.newPage();
            try {
              await page.goto(origin.origin);
              await page.evaluate((localStorageData) => {
                localStorageData.forEach((item: any) => {
                  localStorage.setItem(item.name, item.value);
                });
              }, origin.localStorage);
              await page.close();
            } catch (error) {
              console.error(`Error setting localStorage for ${origin.origin}:`, error);
              await page.close();
            }
          }
        }
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
   * Restore session data to the persistent context for specific team
   */
  async restoreSessionToPersistentContext(sessionData: SessionData, teamId: number, gameId: number): Promise<void> {
    const context = this.persistentContexts.get(teamId);
    
    if (!context) {
      console.log(`No persistent context found for team ${teamId}, game ${gameId}`);
      return;
    }

    try {
      console.log(`Restoring session data to persistent context for team ${teamId}, game ${gameId}:`, {
        hasCookies: sessionData.cookies?.length || 0,
        hasOrigins: sessionData.origins?.length || 0
      });

      // Set cookies from session data
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        await context.addCookies(sessionData.cookies);
        console.log(`Restored ${sessionData.cookies.length} cookies to persistent context for team ${teamId}, game ${gameId}`);
      }

      // Skip localStorage restoration to avoid temporary page creation
      console.log('Skipping localStorage restoration to avoid temporary page creation');
    } catch (error) {
      console.error(`Error restoring session to persistent context for team ${teamId}, game ${gameId}:`, error);
    }
  }

  /**
   * Restore session storage data in a page after navigation
   */
  async restoreSessionStorageInPage(page: Page, sessionData: SessionData): Promise<void> {
    try {
      console.log('Restoring session data:', {
        hasCookies: sessionData.cookies?.length || 0,
        hasOrigins: sessionData.origins?.length || 0,
        hasSessionStorage: !!sessionData.sessionStorage,
        sessionStorageKeys: sessionData.sessionStorage ? Object.keys(sessionData.sessionStorage) : []
      });
      
      // Import the utility function from script-executor
      const { restoreSessionStorageInPage: restoreSessionStorage } = await import('@/utils/script-executor');
      
      // Use the utility function to restore session storage
      if (sessionData.sessionStorage) {
        await restoreSessionStorage(page, sessionData.sessionStorage);
      } else {
        console.log('No session storage data to restore');
      }
    } catch (error) {
      console.error('Error restoring session storage:', error);
      // Don't throw error - session storage restoration is not critical
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
   * Get browser and resource statistics
   */
  getResourceStats() {
    return {
      totalBrowsers: this.browsers.size,
      totalContexts: this.persistentContexts.size,
      totalPages: this.persistentPages.size,
      browsersByTeam: Array.from(this.browsers.keys()),
      pagesByTeamGame: Array.from(this.persistentPages.keys())
    };
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    // DO NOT close persistent pages - we want them to persist across jobs!
    console.log('SessionManager cleanup called - preserving persistent pages for session continuity');
    
    // Only close browser if explicitly requested (not during normal job execution)
    // This method should rarely be called for the global session manager
  }

  /**
   * Force cleanup - only call this when you want to completely reset everything
   */
  async forceCleanup() {
    console.log('Force cleanup called - closing all persistent resources');
    
    // Close all persistent pages
    for (const [pageKey, page] of this.persistentPages) {
      if (page && !page.isClosed()) {
        await page.close();
      }
    }
    this.persistentPages.clear();
    
    // Close all persistent contexts
    for (const [teamId, context] of this.persistentContexts) {
      if (context) {
        await context.close();
      }
    }
    this.persistentContexts.clear();
    
    // Close all browsers
    for (const [teamId, browser] of this.browsers) {
      // Unregister browser from cleanup registry
      try {
        const { unregisterBrowser } = await import('@/utils/browser-cleanup');
        unregisterBrowser(browser);
      } catch (error) {
        console.log('Could not unregister browser from cleanup:', error);
      }
      
      await browser.close();
    }
    this.browsers.clear();
  }
}

/**
 * NEW: Execute actions with persistent page (same page for same team+game combination)
 */
export async function executeWithPersistentPage<T>(
  userId: string,
  gameCredentialId: number,
  teamId: number,
  gameId: number,
  actionFunction: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T | { needsLogin: boolean; gameInfo: any }> {
  const sessionManager = SessionManager.getInstance();
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  
  try {
    // Get or create session
    const { sessionData, gameInfo, needsLogin } = await sessionManager.getOrCreateSession(userId, gameCredentialId);
    
    if (needsLogin) {
      return { needsLogin: true, gameInfo };
    }
    
    // Get the persistent page for this team+game combination
    page = await sessionManager.getPersistentPage(teamId, gameId);
    context = page.context();
    
    // Restore session data to the persistent context (cookies and localStorage)
    await sessionManager.restoreSessionToPersistentContext(sessionData, teamId, gameId);
    
    // Navigate to the game dashboard
    if (gameInfo.dashboard_url) {
      await page.goto(gameInfo.dashboard_url);
    } else {
      await page.goto(gameInfo.login_url);
    }
    
    await page.waitForLoadState('networkidle');
    
    // Restore session storage data after navigation
    await sessionManager.restoreSessionStorageInPage(page, sessionData);
    
    // Check if we got redirected to login page after navigation
    const currentUrl = page.url();
    const expectedUrl = gameInfo.dashboard_url || gameInfo.login_url;
    
    console.log(`Expected URL: ${expectedUrl}`);
    console.log(`Current URL: ${currentUrl}`);
    
    // Check if we're still on the expected page (not redirected to login)
    if (currentUrl !== expectedUrl && currentUrl.includes('login')) {
      console.log('Redirected to login page - session may have expired');
      return { needsLogin: true, gameInfo };
    }
    
    // Execute the action function with the persistent page
    return await actionFunction(page, context);
    
  } catch (error) {
    console.error('Error in executeWithPersistentPage:', error);
    throw error;
  }
}

/**
 * Wrapper function to execute actions with session management (LEGACY - creates new page each time)
 */
export async function executeWithSession<T>(
  userId: string,
  gameCredentialId: number,
  actionFunction: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T | { needsLogin: boolean; gameInfo: any }> {
  // LEGACY FUNCTION - Use executeWithPersistentPage instead for better performance
  console.warn('executeWithSession is deprecated. Use executeWithPersistentPage for better session management.');
  const sessionManager = SessionManager.getInstance(); // Use singleton instead of new instance
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
    
    // NEW: Use persistent page for all platforms (legacy function - use default IDs)
    page = await sessionManager.getPersistentPage(1, 1); // Default team and game IDs for legacy function
    
    // Navigate to the game dashboard
    if (gameInfo.dashboard_url) {
      await page.goto(gameInfo.dashboard_url);
    } else {
      await page.goto(gameInfo.login_url);
    }
    
    await page.waitForLoadState('networkidle');
    
    // NEW: Restore session storage data after navigation
    await sessionManager.restoreSessionStorageInPage(page, sessionData);
    
    // Check if we got redirected to login page after navigation
    const currentUrl = page.url();
    const expectedUrl = gameInfo.dashboard_url || gameInfo.login_url;
    
         console.log(`Expected URL: ${expectedUrl}`);
     console.log(`Current URL: ${currentUrl}`);
    
         // Check if we're still on the expected page (not redirected to login)
     // Strict URL matching - any URL with login/auth indicators means login required
     const isOnExpectedPage = 
       // Exact match only
       currentUrl === expectedUrl ||
       // Common dashboard indicators (but not if they contain login/auth)
       (currentUrl.includes('dashboard') && !currentUrl.includes('/login') && !currentUrl.includes('/auth')) || 
       (currentUrl.includes('home') && !currentUrl.includes('/login') && !currentUrl.includes('/auth')) ||
       (currentUrl.includes('main') && !currentUrl.includes('/login') && !currentUrl.includes('/auth'));
    
    if (!isOnExpectedPage) {
             console.log('Got redirected to login page! Running only_login.js...');
      
      try {
        // Import and run the login functionality from only_login.js
        const { handleLoginIfNeeded } = require('../../scripts/only_login.js');
        
        // Get team_id from game credential
        const supabase = getSupabaseClient();
        const { data: credential } = await supabase
          .from('game_credential')
          .select('team_id')
          .eq('id', gameCredentialId)
          .single();
        
        if (credential?.team_id) {
          const loginResult = await handleLoginIfNeeded(page, credential.team_id, gameInfo.id);
          
          if (loginResult.success) {
                         console.log('Login successful! Continuing with action...');
            // Wait a bit for the page to fully load after login
            await page.waitForTimeout(2000);
                     } else {
             console.log('Login failed:', loginResult.message);
             throw new Error(loginResult.message);
           }
        } else {
          throw new Error('Could not determine team_id for auto-login');
        }
        
             } catch (loginError: any) {
         console.error('Error during auto-login:', loginError);
         throw loginError; // Re-throw the original error without wrapping
       }
    } else {
             console.log('Still on expected page - no login required');
    }
    
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