import { executeWithSession, executeWithPersistentPage, SessionManager } from './session-manager';
import { Page, BrowserContext } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { screenshotWebSocketServer } from './websocket-server';
import crypto from 'crypto';

// Initialize WebSocket server for screenshot broadcasting
// This ensures screenshots can be sent even if no clients are connected yet
let wsServerInitialized = false;

function ensureWebSocketServerInitialized() {
  if (!screenshotWebSocketServer.isServerInitialized()) {
    // console.log('Initializing WebSocket server for screenshot broadcasting...');
    screenshotWebSocketServer.initialize(8080);
    wsServerInitialized = true;
    // console.log('WebSocket server initialized on port 8080');
  } else {
    // console.log('WebSocket server already initialized');
  }
}

// Initialize immediately when this module is loaded
// console.log('Action wrappers module loaded - ensuring WebSocket server is initialized...');
ensureWebSocketServerInitialized();

async function getGameInfoFromCredentialId(gameCredentialId: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: gameCredential, error } = await supabase
    .from('game_credential')
    .select(`
      team_id,
      username,
      password,
      game:game_id (*)
    `)
    .eq('id', gameCredentialId)
    .single();

  if (error || !gameCredential) {
    throw new Error(`Game credential not found: ${gameCredentialId}`);
  }

  return {
    team_id: gameCredential.team_id,
    name: (gameCredential.game as any).name,
    username: gameCredential.username,
    password: gameCredential.password,
    game: gameCredential.game as any
  };
}

export interface ActionParams {
  newAccountName?: string;
  newPassword?: string;
  targetUsername?: string;
  amount?: number;
  remark?: string;
  username?: string;
  password?: string;
  // Snake_case parameter names for new system
  account_name?: string;
  new_password?: string;
  target_username?: string;
  // Add other parameters as needed
}

/**
 * Wrapper for creating new account
 */
export async function createNewAccountWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; accountName?: string; needsLogin?: boolean; gameInfo?: any; logs?: string[] }> {
  const logs: string[] = [];
  
  // Override console.log to capture logs
  const originalLog = console.log;
  console.log = (...args) => {
    const logMessage = args.join(' ');
    logs.push(logMessage);
    originalLog(...args);
  };

  // Get game info to extract team and game IDs
  const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
  
  const result = await executeWithPersistentPage(userId, gameCredentialId, gameInfo.team_id, gameInfo.game.id, async (page: Page, context: BrowserContext) => {
    // Handle both old camelCase and new snake_case parameter names
    const newAccountName = params.newAccountName || params.account_name || "testing07";
    const newPassword = params.newPassword || params.new_password || "Hatim121";
    
    try {
      // Game info already retrieved above
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/new_account.js`);
      const result = await scriptModule.run(page, context, {
        account_name: newAccountName,
        new_password: newPassword
      });
      
      return { ...result, logs };
    } catch (error) {
      return {
        success: false,
        message: `Error creating account: ${error}`,
        accountName: newAccountName,
        logs
      };
    }
  });

  // Restore original console.log
  console.log = originalLog;

  // Check if result indicates needsLogin
  if (result && typeof result === 'object' && 'needsLogin' in result) {
    return {
      success: false,
      message: 'Session expired. Please login first.',
      needsLogin: true,
      gameInfo: (result as any).gameInfo
    };
  }

  return result as { success: boolean; message: string; accountName?: string };
}

/**
 * Wrapper for password reset
 */
export async function resetPasswordWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string; needsLogin?: boolean; gameInfo?: any }> {
  // Get game info to extract team and game IDs
  const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
  
  const result = await executeWithPersistentPage(userId, gameCredentialId, gameInfo.team_id, gameInfo.game.id, async (page: Page, context: BrowserContext) => {
    // Handle both old camelCase and new snake_case parameter names
    const targetUsername = params.targetUsername || params.target_username;
    const newPassword = params.newPassword || params.new_password || "NewPassword123";
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for password reset'
      };
    }

    try {
      // Game info already retrieved above
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/password_reset.js`);
      const result = await scriptModule.run(page, context, {
        target_username: targetUsername,
        new_password: newPassword
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Error resetting password: ${error}`,
        username: targetUsername
      };
    }
  });

  // Check if result indicates needsLogin
  if (result && typeof result === 'object' && 'needsLogin' in result) {
    return {
      success: false,
      message: 'Session expired. Please login first.',
      needsLogin: true,
      gameInfo: (result as any).gameInfo
    };
  }

  return result as { success: boolean; message: string; username?: string };
}

/**
 * Wrapper for recharge
 */
export async function rechargeWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string; amount?: number; needsLogin?: boolean; gameInfo?: any }> {
  // Get game info to extract team and game IDs
  const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
  
  const result = await executeWithPersistentPage(userId, gameCredentialId, gameInfo.team_id, gameInfo.game.id, async (page: Page, context: BrowserContext) => {
    // Handle both old camelCase and new snake_case parameter names
    const targetUsername = params.targetUsername || params.target_username;
    const amount = params.amount || 0;
    const remark = params.remark || "test remarks";
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for recharge'
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount should be greater than 0'
      };
    }

    try {
      // Game info already retrieved above
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/recharge.js`);
      const result = await scriptModule.run(page, context, {
        target_username: targetUsername,
        amount: amount,
        remark: remark
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Error during recharge: ${error}`,
        username: targetUsername,
        amount
      };
    }
  });

  // Check if result indicates needsLogin
  if (result && typeof result === 'object' && 'needsLogin' in result) {
    return {
      success: false,
      message: 'Session expired. Please login first.',
      needsLogin: true,
      gameInfo: (result as any).gameInfo
    };
  }

  return result as { success: boolean; message: string; username?: string; amount?: number };
}

/**
 * Wrapper for redeem
 */
export async function redeemWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string; amount?: number; needsLogin?: boolean; gameInfo?: any }> {
  // Get game info to extract team and game IDs
  const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
  
  const result = await executeWithPersistentPage(userId, gameCredentialId, gameInfo.team_id, gameInfo.game.id, async (page: Page, context: BrowserContext) => {
    // Handle both old camelCase and new snake_case parameter names
    const targetUsername = params.targetUsername || params.target_username;
    const amount = params.amount || 0;
    const remark = params.remark || "test remarks";
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for redeem'
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount should be greater than 0'
      };
    }

    try {
      // Game info already retrieved above
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/redeem.js`);
      const result = await scriptModule.run(page, context, {
        target_username: targetUsername,
        amount: amount,
        remark: remark
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Error during redeem: ${error}`,
        username: targetUsername,
        amount
      };
    }
  });

  // Check if result indicates needsLogin
  if (result && typeof result === 'object' && 'needsLogin' in result) {
    return {
      success: false,
      message: 'Session expired. Please login first.',
      needsLogin: true,
      gameInfo: (result as any).gameInfo
    };
  }

  return result as { success: boolean; message: string; username?: string; amount?: number };
} 

/**
 * Wrapper for login action
 */
export async function loginWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams,
  teamId?: number,
  sessionId?: string
): Promise<{ success: boolean; message: string; sessionToken?: string; gameCredentialId?: number; needsLogin?: boolean; gameInfo?: any; logs?: string[] }> {
  const logs: string[] = [];
  
  // Override console.log to capture logs
  const originalLog = console.log;
  console.log = (...args) => {
    const logMessage = args.join(' ');
    logs.push(logMessage);
    originalLog(...args);
  };

  // For login, we need to bypass the session check and go directly to login
  const sessionManager = SessionManager.getInstance();
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  
  try {
    // Get game info
    const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
    
    // Get the persistent page for this team+game combination
    page = await sessionManager.getPersistentPage(gameInfo.team_id, gameInfo.game.id);
    if (!page) {
      throw new Error('Failed to get persistent page');
    }
    context = page.context();
    
    // Navigate to the login URL (not dashboard)
    await page.goto(gameInfo.game.login_url);
    await page.waitForLoadState('networkidle');
    
    // Execute the login function with the persistent page
    const result = await (async (page: Page, context: BrowserContext) => {
      try {
        // Ensure WebSocket server is initialized and make it available to the script
        ensureWebSocketServerInitialized();
        (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
        
        // Import and execute the login script function with the persistent page
        const scriptModule = require(`../../scripts/login.js`);
        // console.log('Login wrapper - passing teamId to script:', teamId);
        // console.log('Login wrapper - params:', params);
        // Always use manually entered credentials, never fall back to saved ones
        const loginResult = await scriptModule.loginWithPersistentPage(
          page, // Pass the persistent page
          context, // Pass the persistent context
          params?.username || '', // Use whatever is in the input fields
          params?.password || '', // Use whatever is in the input fields
          gameInfo.game.login_url,
          userId,
          gameCredentialId,
          { ...params, teamId, sessionId } // Pass the params, teamId, and sessionId to the login script
        );
        
        if (loginResult.success) {
          // Generate a session token for the successful login
          const sessionToken = crypto.randomBytes(32).toString('hex');
          
          return {
            success: true,
            message: 'Login successful',
            sessionToken: sessionToken,
            gameCredentialId: gameCredentialId,
            logs
          };
        } else {
          return {
            success: false,
            message: loginResult.message || 'Login failed',
            logs
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Error during login: ${error}`,
          logs
        };
      }
    })(page, context);

    // Restore original console.log
    console.log = originalLog;

    return result;
    
  } catch (error) {
    // Restore original console.log
    console.log = originalLog;
    
    return {
      success: false,
      message: `Error during login: ${error}`,
      logs
    };
  }
} 

/**
 * Dynamic executor for actions loaded from database
 */
export async function executeDynamicActionWithSession(
  userId: string,
  gameCredentialId: number,
  actionName: string,
  params: Record<string, any>,
  teamId?: number,
  sessionId?: string
): Promise<{ success: boolean; message: string; needsLogin?: boolean; gameInfo?: any }> {
  // Get game info to extract team and game IDs
  const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
  
  const result = await executeWithPersistentPage(userId, gameCredentialId, gameInfo.team_id, gameInfo.game.id, async (page: Page, context: BrowserContext) => {
    // console.log(`Starting dynamic action: ${actionName} with params:`, params);

    try {
      // Game info already retrieved above
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      
      // Try to fetch script from database first
      let databaseScript: string | null = null;
      try {
        // Use direct Supabase client for worker process
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        const { data: actionDefinition, error } = await supabase
          .from('actions')
          .select('script_code')
          .eq('game_id', gameInfo.game.id)
          .eq('name', actionName)
          .single();
        
        if (error) {
          console.log(`Database error fetching script for ${actionName}:`, error);
        } else if (actionDefinition?.script_code) {
          databaseScript = actionDefinition.script_code;
          console.log(`Successfully fetched script from database for ${actionName}`);
        } else {
          console.log(`No script found in database for ${actionName}`);
        }
      } catch (dbError) {
        console.log(`Could not fetch script from database for ${actionName}, falling back to hardcoded script:`, dbError);
      }
      
      // Use the unified script execution system
      const { executeActionScript } = await import('@/utils/script-executor');
      
      // Use the passed session ID or generate a new one if not provided
      const finalSessionId = sessionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await executeActionScript(
        page, 
        context, 
        actionName, 
        gameInfo.name.toLowerCase().replace(/\s+/g, ''),
        gameInfo.game.id, // NEW: Pass game ID
        params,
        databaseScript,
        (teamId || gameInfo.team_id).toString(), // Use passed team ID or fall back to game info
        finalSessionId // Use final session ID
      );
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Error executing ${actionName}: ${error}`,
        actionName
      };
    }
  });

  // Check if result indicates needsLogin
  if (result && typeof result === 'object' && 'needsLogin' in result) {
    return {
      success: false,
      message: 'Session expired. Please login first.',
      needsLogin: true,
      gameInfo: (result as any).gameInfo
    };
  }

  return result as { success: boolean; message: string };
} 