import { SessionManager, executeWithSession } from './session-manager';
import { createNewAccountWithSession, rechargeWithSession } from './action-wrappers';
import { Page, BrowserContext } from 'playwright';

/**
 * Example: How to use the session management system
 */

// Example 1: Basic session management
export async function exampleBasicSessionManagement() {
  const sessionManager = new SessionManager();
  const userId = 'user-uuid-here';
  const gameId = 1;

  try {
    // Get or create session
    const session = await sessionManager.getOrCreateSession(userId, gameId);
    console.log('Session ready:', session.gameInfo.name);

    // Create authenticated context
    const context = await sessionManager.createAuthenticatedContext(session.sessionData);
    const page = await context.newPage();

    // Navigate to dashboard
    await page.goto(session.gameInfo.dashboard_url || session.gameInfo.login_url);
    
    // Check if session is valid
    const isValid = await sessionManager.isSessionValid(page);
    console.log('Session valid:', isValid);

    await context.close();
  } finally {
    await sessionManager.cleanup();
  }
}

// Example 2: Using wrapper functions
export async function exampleWrapperFunctions() {
  const userId = 'user-uuid-here';
  const gameId = 1;

  // Create new account with automatic session management
  const result = await createNewAccountWithSession(userId, gameId, {
    newAccountName: 'testuser123',
    newPassword: 'TestPass123'
  });

  console.log('Account creation result:', result);

  // Recharge with automatic session management
  const rechargeResult = await rechargeWithSession(userId, gameId, {
    targetUsername: 'testuser123',
    amount: 100
  });

  console.log('Recharge result:', rechargeResult);
}

// Example 3: Custom action with session management
export async function exampleCustomAction() {
  const userId = 'user-uuid-here';
  const gameId = 1;

  // Define custom action
  const customAction = async (page: Page, context: BrowserContext) => {
    // Navigate to user management
    await page.getByText('Game User').click();
    await page.getByText('User Management').click();

    // Get user count
    const searchFrame = await page.locator('iframe').nth(1).contentFrame();
    if (!searchFrame) throw new Error('Search frame not found');

    // Search for all users
    await searchFrame.getByRole('button', { name: 'Search' }).click();
    
    // Wait for results
    await searchFrame.locator('tbody > tr').first().waitFor({ timeout: 5000 });
    
    // Count users
    const userRows = await searchFrame.locator('tbody > tr').count();
    
    return {
      success: true,
      userCount: userRows,
      message: `Found ${userRows} users`
    };
  };

  // Execute custom action with session management
  const result = await executeWithSession(userId, gameId, customAction);
  console.log('Custom action result:', result);
}

// Example 4: Session statistics and cleanup
export async function exampleSessionMaintenance() {
  const sessionManager = new SessionManager();
  const userId = 'user-uuid-here';
  const gameId = 1;

  try {
    // Get session statistics
    const stats = await sessionManager.getSessionStats(userId, gameId);
    console.log('Session stats:', stats);

    // Clean up old sessions (older than 7 days)
    await sessionManager.cleanupOldSessions(userId, gameId, 7);
    console.log('Old sessions cleaned up');
  } finally {
    await sessionManager.cleanup();
  }
}

// Example 5: Error handling and retry logic
export async function exampleErrorHandling() {
  const userId = 'user-uuid-here';
  const gameId = 1;

  try {
    const result = await createNewAccountWithSession(userId, gameId, {
      newAccountName: 'existinguser', // This might already exist
      newPassword: 'TestPass123'
    });

    if (!result.success) {
      console.log('Action failed:', result.message);
      
      // Try a different approach or handle the error
      if (result.message.includes('already exists')) {
        console.log('User already exists, trying recharge instead...');
        
        const rechargeResult = await rechargeWithSession(userId, gameId, {
          targetUsername: 'existinguser',
          amount: 50
        });
        
        console.log('Recharge result:', rechargeResult);
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
} 