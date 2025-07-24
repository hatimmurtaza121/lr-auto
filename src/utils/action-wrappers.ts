import { executeWithSession } from './session-manager';
import { Page, BrowserContext } from 'playwright';

export interface ActionParams {
  newAccountName?: string;
  newPassword?: string;
  targetUsername?: string;
  amount?: number;
  // Add other parameters as needed
}

/**
 * Wrapper for creating new account
 */
export async function createNewAccountWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; accountName?: string }> {
  return executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { newAccountName = "testing07", newPassword = "Hatim121" } = params;
    
    console.log('Starting account creation process...');

    try {
      // Navigate through the menu
      await page.getByText('Game User').click();
      await page.getByText('User Management').click();

      // Search for the account
      const searchFrame = await page.locator('iframe').nth(1).contentFrame();
      if (!searchFrame) throw new Error('Search frame not found');
      
      await searchFrame.getByRole('textbox', { name: 'Please enter Username' }).fill(newAccountName);
      await searchFrame.getByRole('button', { name: 'Search' }).click();

      // Check if the account exists
      let accountExists = false;
      try {
        const resultRow = searchFrame.locator('tbody > tr').first();
        await resultRow.waitFor({ timeout: 5000 });
        const foundName = (await resultRow.locator('td').nth(3).textContent())?.trim();
        if (foundName === newAccountName) {
          accountExists = true;
        }
      } catch {
        // no results → accountExists remains false
      }

      if (accountExists) {
        return {
          success: false,
          message: 'Account already exists',
          accountName: newAccountName
        };
      }

      await searchFrame.getByRole('button', { name: 'Add user' }).click();
      
      const addUserFrame = searchFrame.locator('iframe[name="layui-layer-iframe1"]').contentFrame();
      if (!addUserFrame) throw new Error('Add user frame not found');
      
      await addUserFrame.getByRole('textbox', { name: 'Please enter Username' }).fill(newAccountName);
      await addUserFrame.getByRole('textbox', { name: 'Please enter Recharge Balance' }).fill("0");
      await addUserFrame.getByRole('textbox', { name: 'Please enter Login password' }).fill(newPassword);
      await addUserFrame.getByRole('textbox', { name: 'Please enter Confirm password' }).fill(newPassword);
      await addUserFrame.getByRole('button', { name: 'Submit' }).click();

      // Check result
      await addUserFrame.locator('.layui-layer-content').waitFor({ state: 'visible' });
      const popupText = await addUserFrame.locator('.layui-layer-content').textContent();
      
      if (popupText === 'Insert successful') {
        return {
          success: true,
          message: `Successfully created user "${newAccountName}"`,
          accountName: newAccountName
        };
      } else {
        return {
          success: false,
          message: `Failed to create account. Popup says: "${popupText}"`,
          accountName: newAccountName
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error creating account: ${error}`,
        accountName: newAccountName
      };
    }
  });
}

/**
 * Wrapper for password reset
 */
export async function resetPasswordWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string }> {
  return executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, newPassword = "NewPassword123" } = params;
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for password reset'
      };
    }

    console.log(`Starting password reset for user: ${targetUsername}`);

    try {
      // Navigate to user management
      await page.getByText('Game User').click();
      await page.getByText('User Management').click();

      const searchFrame = await page.locator('iframe').nth(1).contentFrame();
      if (!searchFrame) throw new Error('Search frame not found');

      // Search for the user
      await searchFrame.getByRole('textbox', { name: 'Please enter Username' }).fill(targetUsername);
      await searchFrame.getByRole('button', { name: 'Search' }).click();

      // Check if user exists
      try {
        const resultRow = searchFrame.locator('tbody > tr').first();
        await resultRow.waitFor({ timeout: 5000 });
        const foundName = (await resultRow.locator('td').nth(3).textContent())?.trim();
        if (foundName !== targetUsername) {
          return {
            success: false,
            message: 'User not found',
            username: targetUsername
          };
        }
      } catch {
        return {
          success: false,
          message: 'User not found',
          username: targetUsername
        };
      }

      // Click edit button (assuming there's an edit button)
      await searchFrame.locator('button:has-text("Edit")').first().click();

      const editFrame = searchFrame.locator('iframe[name="layui-layer-iframe1"]').contentFrame();
      if (!editFrame) throw new Error('Edit frame not found');

      // Update password
      await editFrame.getByRole('textbox', { name: 'Please enter Login password' }).fill(newPassword);
      await editFrame.getByRole('textbox', { name: 'Please enter Confirm password' }).fill(newPassword);
      await editFrame.getByRole('button', { name: 'Submit' }).click();

      // Check result
      await editFrame.locator('.layui-layer-content').waitFor({ state: 'visible' });
      const popupText = await editFrame.locator('.layui-layer-content').textContent();

      if (popupText?.includes('successful') || popupText?.includes('updated')) {
        return {
          success: true,
          message: `Successfully reset password for user "${targetUsername}"`,
          username: targetUsername
        };
      } else {
        return {
          success: false,
          message: `Failed to reset password. Popup says: "${popupText}"`,
          username: targetUsername
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error resetting password: ${error}`,
        username: targetUsername
      };
    }
  });
}

/**
 * Wrapper for recharge
 */
export async function rechargeWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string; amount?: number }> {
  return executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, amount = 0 } = params;
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for recharge'
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount must be greater than 0'
      };
    }

    console.log(`Starting recharge for user: ${targetUsername}, amount: ${amount}`);

    try {
      // Navigate to recharge section
      await page.getByText('Game User').click();
      await page.getByText('Recharge').click();

      const rechargeFrame = await page.locator('iframe').nth(1).contentFrame();
      if (!rechargeFrame) throw new Error('Recharge frame not found');

      // Fill recharge form
      await rechargeFrame.getByRole('textbox', { name: 'Please enter Username' }).fill(targetUsername);
      await rechargeFrame.getByRole('textbox', { name: 'Please enter Amount' }).fill(amount.toString());
      await rechargeFrame.getByRole('button', { name: 'Submit' }).click();

      // Check result
      await rechargeFrame.locator('.layui-layer-content').waitFor({ state: 'visible' });
      const popupText = await rechargeFrame.locator('.layui-layer-content').textContent();

      if (popupText?.includes('successful') || popupText?.includes('recharged')) {
        return {
          success: true,
          message: `Successfully recharged ${amount} for user "${targetUsername}"`,
          username: targetUsername,
          amount
        };
      } else {
        return {
          success: false,
          message: `Failed to recharge. Popup says: "${popupText}"`,
          username: targetUsername,
          amount
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error during recharge: ${error}`,
        username: targetUsername,
        amount
      };
    }
  });
}

/**
 * Wrapper for redeem
 */
export async function redeemWithSession(
  userId: string,
  gameCredentialId: number,
  params: ActionParams
): Promise<{ success: boolean; message: string; username?: string; amount?: number }> {
  return executeWithSession(userId, gameCredentialId, async (page: Page, context: BrowserContext) => {
    const { targetUsername, amount = 0 } = params;
    
    if (!targetUsername) {
      return {
        success: false,
        message: 'Target username is required for redeem'
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount must be greater than 0'
      };
    }

    console.log(`Starting redeem for user: ${targetUsername}, amount: ${amount}`);

    try {
      // Navigate to redeem section
      await page.getByText('Game User').click();
      await page.getByText('Redeem').click();

      const redeemFrame = await page.locator('iframe').nth(1).contentFrame();
      if (!redeemFrame) throw new Error('Redeem frame not found');

      // Fill redeem form
      await redeemFrame.getByRole('textbox', { name: 'Please enter Username' }).fill(targetUsername);
      await redeemFrame.getByRole('textbox', { name: 'Please enter Amount' }).fill(amount.toString());
      await redeemFrame.getByRole('button', { name: 'Submit' }).click();

      // Check result
      await redeemFrame.locator('.layui-layer-content').waitFor({ state: 'visible' });
      const popupText = await redeemFrame.locator('.layui-layer-content').textContent();

      if (popupText?.includes('successful') || popupText?.includes('redeemed')) {
        return {
          success: true,
          message: `Successfully redeemed ${amount} for user "${targetUsername}"`,
          username: targetUsername,
          amount
        };
      } else {
        return {
          success: false,
          message: `Failed to redeem. Popup says: "${popupText}"`,
          username: targetUsername,
          amount
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error during redeem: ${error}`,
        username: targetUsername,
        amount
      };
    }
  });
} 