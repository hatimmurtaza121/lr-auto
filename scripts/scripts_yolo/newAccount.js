const { chromium } = require('playwright');
const path = require('path');

// WebSocket screenshot capture function
function createWebSocketScreenshotCapture(page, gameName, action, interval = 500) {
    console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
    console.log('WebSocket server available:', !!global.screenshotWebSocketServer);
    
    const screenshotInterval = setInterval(async () => {
        try {
            // Take screenshot as buffer
            const screenshotBuffer = await page.screenshot();
            
            // Convert to base64 for WebSocket transmission
            const base64Image = screenshotBuffer.toString('base64');
            
            // Send via WebSocket (this will be handled by the parent process)
            console.log(`WebSocket screenshot ready: ${new Date().toISOString()}`);
            
            // Emit custom event that parent can listen to
            if (global.screenshotWebSocketServer) {
                console.log('Broadcasting screenshot via WebSocket...');
                global.screenshotWebSocketServer.broadcastScreenshot(screenshotBuffer, gameName, action);
            } else {
                console.log('WebSocket server not available for screenshot broadcast');
            }
        } catch (error) {
            console.log('WebSocket screenshot error:', error);
        }
    }, interval);

    return () => {
        console.log(`Stopping WebSocket screenshot capture for ${gameName} - ${action}`);
        clearInterval(screenshotInterval);
    };
}

async function createNewAccount(page, context, params = {}) {
    const { newAccountName = 'testing01', newPassword = 'password01' } = params;
    
    console.log('Starting account creation process...');
    console.log(`Account Name: ${newAccountName}`);
    console.log(`Password: ${newPassword}`);
    
               // Start WebSocket screenshot capture
           const stopScreenshotCapture = createWebSocketScreenshotCapture(page, 'yolo', 'newAccount', 500);
    
    try {
        // From here
        await page.goto('https://agent.yolo777.game/admin');
        await page.getByRole('link', { name: ' Player Management ' }).click();
        await page.getByRole('link', { name: ' Player List' }).click();
        await page.waitForLoadState('networkidle');

        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('button', { name: '  New' }).click();
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Account' }).click();
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Account' }).fill(newAccountName);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Password' }).click();
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Password' }).fill(newPassword);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByText('Submit').click();

        // Checking errors and success message
        const playerFrame = await page
          .getByRole('tabpanel', { name: ' Player List' })
          .locator('iframe')
          .contentFrame();

        try {
          // Check for success dialog
          const successDialog = playerFrame.getByRole('dialog', { name: 'Successfully! You can Copy' });
          await successDialog.waitFor({ state: 'visible', timeout: 3000 });
          await successDialog.click();
          console.log('Account created successfully');
          return {
            success: true,
            message: 'Account created successfully',
            accountName: newAccountName
          };
        } catch (successError) {
          try {
            // Check for "already exists" error
            const alreadyExistsError = playerFrame.getByText('The Accounts has already been');
            await alreadyExistsError.waitFor({ state: 'visible', timeout: 3000 });
            await alreadyExistsError.click();
            console.log('Account has already been created');
            return {
              success: false,
              message: 'Account has already been created',
              accountName: newAccountName
            };
          } catch (errorError) {
            // If neither success nor specific error found, return generic error
            console.log('Try again');
            return {
              success: false,
              message: 'Try again',
              accountName: newAccountName
            };
          }
        }
    } catch (error) {
        console.error('Error during account creation:', error);
        stopScreenshotCapture();
        return {
          success: false,
          message: `Error creating account: ${error.message || error}`,
          accountName: newAccountName
        };
    } finally {
        // Stop WebSocket screenshot capture
        stopScreenshotCapture();
    }
}

// Export the function for external use
module.exports = { createNewAccount };
