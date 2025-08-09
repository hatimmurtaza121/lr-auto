const { chromium } = require('playwright');
const path = require('path');

// WebSocket screenshot capture function
function createWebSocketScreenshotCapture(page, gameName, action, interval = 500) {
    console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
    console.log('WebSocket server available:', !!global.screenshotWebSocketServer);
    
    const screenshotInterval = setInterval(async () => {
        try {
            console.log(`Taking screenshot for ${gameName} - ${action}...`);
            // Take screenshot as buffer
            const screenshotBuffer = await page.screenshot();
            console.log(`Screenshot taken, size: ${screenshotBuffer.length} bytes`);
            
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

async function run(page, context, params = {}) {
    // Handle both old camelCase and new snake_case parameter names
    const target_username = params.target_username || params.targetUsername || 'testing01';
    const new_password = params.new_password || params.newPassword || 'NewPassword123';
    
    console.log(`Account to reset: ${target_username}`);
    console.log(`New password: ${new_password}`);

    // Start WebSocket screenshot capture
    const stopScreenshotCapture = createWebSocketScreenshotCapture(page, 'yolo', 'password_reset', 500);

    try {
        // From here
        await page.reload();
        await page.getByRole('link', { name: ' Player Management ' }).click();
        await page.getByRole('link', { name: ' Player List' }).click();
        await page.waitForLoadState('networkidle');

        // 2. Grab the iframe that contains the player list
        const listFrame = await page
            .getByRole('tabpanel', { name: ' Player List' })
            .locator('iframe')
            .contentFrame();
        
        // 3. Search for the account
        await listFrame.getByRole('textbox', { name: 'Account' }).fill(target_username);
        await listFrame.getByRole('button', { name: '  Search' }).click();

        // 3.5. Wait for table to load and stabilize
        await page.waitForTimeout(1000);
        console.log('Waiting for search results to load...');
        
        // Validate account exists and is accessible
        let accountValidationError = null;
        
        // Wait for either data to appear OR "No data" message to appear
        try {
            // First, wait for the table to stop loading (either data or no data)
            await listFrame.locator('tbody').waitFor({ timeout: 10000 });
            
            // Give a small buffer for the table to fully render
            await page.waitForTimeout(1000);
            
            // Now check if "No data." row is present
            const noData = listFrame
                .locator('tbody > tr > td[colspan="16"] span.help-block')
                .filter({ hasText: 'No data.' });
            
            if (await noData.count() > 0) {
                console.log('No user exists. Aborting.');
                accountValidationError = 'No account found';
            } else {
                // 3.5b. Now safely grab the first data row
                const firstRow = listFrame.locator('tbody > tr').first();
                try {
                    await firstRow.waitFor({ timeout: 5000 });             // wait for at least one data row
                    const accountCell = firstRow.locator('td').nth(2);     // 3rd <td> holds the account
                    const foundName = (await accountCell.textContent()).trim();
                    console.log(foundName, '---', target_username);
                    if (foundName !== target_username) {
                        console.log('Account in row does not match. Aborting.');
                        accountValidationError = 'No account found';
                    }
                } catch {
                    console.log('No rows found. Aborting.');
                    accountValidationError = 'No account found';
                }
            }
        } catch (error) {
            console.log('Table loading timeout. Aborting.');
            return {
                success: false,
                message: 'Table loading timeout',
                username: target_username
            };
        }

        // Early return if validation failed
        if (accountValidationError) {
            return { success: false, message: accountValidationError, username: target_username };
        }

        
        // 4. Open the "editor" dropdown and click "Reset Password"
        await listFrame.getByRole('button', { name: 'editor' }).click();
        await listFrame
            .locator('a')
            .filter({ hasText: 'Reset Password' })
            .click();
        
        // 5. Fill in the new password and submit
        await listFrame.getByRole('textbox', { name: 'Input Password' }).fill(new_password);
        await listFrame.getByRole('button', { name: ' Submit' }).click();
        
        // 6. Capture and log the success/error message
        try {
            // Check for success message
            const successElement = listFrame
                .locator('div')
                .filter({ hasText: 'success' })
                .nth(1);
            await successElement.waitFor({ state: 'visible', timeout: 3000 });
            await successElement.click();
            console.log('Password reset successful');
            return {
                success: true,
                message: 'Password reset successful',
                username: target_username
            };
        } catch (successError) {
            try {
                // Check for failed message
                const failedElement = listFrame
                    .locator('div')
                    .filter({ hasText: 'failed' })
                    .nth(1);
                await failedElement.waitFor({ state: 'visible', timeout: 3000 });
                await failedElement.click();
                console.log('Old password cannot be the new password');
                return {
                    success: false,
                    message: 'Old password cannot be the new password',
                    username: target_username
                };
            } catch (errorError) {
                // If neither success nor specific error found, return generic error
                console.log('Try again');
                return {
                    success: false,
                    message: 'Try again',
                    username: target_username
                };
            }
        }
     
    } catch (error) {
        console.error('Error during password reset:', error);
        stopScreenshotCapture();
        return {
            success: false,
            message: `Error resetting password: ${error}`,
            username: target_username
        };
    } finally {
        // Stop WebSocket screenshot capture
        stopScreenshotCapture();
    }
}

module.exports = { run };