import { executeWithSession } from './session-manager';
import { Page, BrowserContext } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { screenshotWebSocketServer } from './websocket-server';

// Initialize WebSocket server for screenshot broadcasting
// This ensures screenshots can be sent even if no clients are connected yet
let wsServerInitialized = false;

function ensureWebSocketServerInitialized() {
  if (!screenshotWebSocketServer.isServerInitialized()) {
    console.log('Initializing WebSocket server for screenshot broadcasting...');
    screenshotWebSocketServer.initialize(8080);
    wsServerInitialized = true;
    console.log('WebSocket server initialized on port 8080');
  } else {
    console.log('WebSocket server already initialized');
  }
}

// Initialize immediately when this module is loaded
console.log('Action wrappers module loaded - ensuring WebSocket server is initialized...');
ensureWebSocketServerInitialized();

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

async function getGameInfoFromCredentialId(gameCredentialId: number) {
  const supabase = getSupabaseClient();
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

  const result = await executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { newAccountName = "testing07", newPassword = "Hatim121" } = params;
    
    console.log('Starting account creation process...');

    try {
      // Get game info to determine script path
      const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      console.log('WebSocket server made available to script');
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/newAccount.js`);
      const result = await scriptModule.createNewAccount(page, context, {
        newAccountName,
        newPassword
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
  const result = await executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, newPassword = "NewPassword123" } = params;
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for password reset'
      };
    }

    console.log(`Starting password reset for user: ${targetUsername}`);

    try {
      // Get game info to determine script path
      const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      console.log('WebSocket server made available to script');
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/passwordReset.js`);
      const result = await scriptModule.resetAccountPassword(page, context, {
        targetUsername,
        newPassword
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
  const result = await executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, amount = 0, remark = "test remarks" } = params;
    
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

    console.log(`Starting recharge for user: ${targetUsername}, amount: ${amount}`);

    try {
      // Get game info to determine script path
      const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      console.log('WebSocket server made available to script');
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/recharge.js`);
      const result = await scriptModule.recharge(page, context, {
        accountName: targetUsername,
        rechargeAmount: amount.toString(),
        remarks: remark
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
  const result = await executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, amount = 0, remark = "test remarks" } = params;
    
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

    console.log(`Starting redeem for user: ${targetUsername}, amount: ${amount}`);

    try {
      // Get game info to determine script path
      const gameInfo = await getGameInfoFromCredentialId(gameCredentialId);
      
      // Ensure WebSocket server is initialized and make it available to the script
      ensureWebSocketServerInitialized();
      (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
      console.log('WebSocket server made available to script');
      
      // Import and execute the script function with authenticated page
      const scriptModule = require(`../../scripts/scripts_${gameInfo.name.toLowerCase().replace(/\s+/g, '')}/redeem.js`);
      const result = await scriptModule.redeem(page, context, {
        accountName: targetUsername,
        redeemAmount: amount.toString(),
        remarks: remark
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