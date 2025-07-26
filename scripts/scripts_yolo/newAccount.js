const { chromium } = require('playwright');
const path = require('path');

// WebSocket screenshot capture function
function createWebSocketScreenshotCapture(page, gameName, action, interval = 500) {
    console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
    
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
                global.screenshotWebSocketServer.broadcastScreenshot(screenshotBuffer, gameName, action);
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
    const { newAccountName = 'testing07', newPassword = 'Hatim121' } = params;
    
    console.log('Starting account creation process...');
    console.log(`Account Name: ${newAccountName}`);
    console.log(`Password: ${newPassword}`);
    
               // Start WebSocket screenshot capture
           const stopScreenshotCapture = createWebSocketScreenshotCapture(page, 'yolo', 'newAccount', 500);
    
    try {
        await page.waitForLoadState('networkidle');
        console.log('Page loaded successfully');
        
        await page.getByRole('link', { name: ' Player Management ' }).click();
        console.log('Clicked Player Management');
        
        await page.getByRole('link', { name: ' Player List' }).click();
        console.log('Clicked Player List');

        // Clicking the New button
        await page.click('a.nav-link:has-text("Player List")');
        console.log('Clicked Player List link');
        
        await page.waitForSelector('#iframe-267a8743d2af1d75 iframe', { state: 'attached', timeout: 5000 });
        console.log('Iframe found');
        
        const listFrame = page.frameLocator('#iframe-267a8743d2af1d75 iframe');
        await listFrame.locator('button.dialog-create').waitFor({ state: 'visible', timeout: 5000 });
        console.log('Dialog create button found');
        
        await listFrame.locator('button.dialog-create').click();
        console.log('Clicked dialog create button');
        
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Account' }).fill(newAccountName);
        console.log('Filled account name');
        
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input Password' }).fill(newPassword);
        console.log('Filled password');
        
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByText('Submit').click();
        console.log('Clicked submit button');

        // Checking errors and success message
        const playerFrame = await page
          .getByRole('tabpanel', { name: ' Player List' })
          .locator('iframe')
          .contentFrame();

        const errorLocator = playerFrame.getByText('The Accounts has already been', { exact: false });
        try {
          await errorLocator.waitFor({ state: 'visible', timeout: 3000 });
          const errMsg = (await errorLocator.textContent()).trim();
          console.log(`Error: ${errMsg}`);
          return {
            success: false,
            message: `Account already exists: ${errMsg}`,
            accountName: newAccountName
          };
        } catch {
          // We assume no error and treat as success
          console.log(`Successfully created user "${newAccountName}".`);
          return {
            success: true,
            message: `Successfully created user "${newAccountName}"`,
            accountName: newAccountName
          };
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
