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

async function resetAccountPassword(page, context, params = {}) {
    const { targetUsername = 'testing01', newPassword = 'NewPassword123' } = params;
    
    console.log(`Account to reset: ${targetUsername}`);
    console.log(`New password: ${newPassword}`);

             // Start WebSocket screenshot capture
         const stopScreenshotCapture = createWebSocketScreenshotCapture(page, 'yolo', 'passwordReset', 500);

    try {
        await page.waitForLoadState('networkidle');
        await page.getByRole('link', { name: ' Player Management ' }).click();
        await page.getByRole('link', { name: ' Player List' }).click();

        // 2. Grab the iframe that contains the player list
        const listFrame = await page
            .getByRole('tabpanel', { name: ' Player List' })
            .locator('iframe')
            .contentFrame();
        
        // 3. Search for the account
        await listFrame.getByRole('textbox', { name: 'Account' }).fill(targetUsername);
        await listFrame.getByRole('button', { name: '  Search' }).click();

        // 3.5a. Check if "No data." row is present
        const noData = listFrame
            .locator('tbody > tr > td[colspan="16"] span.help-block')
            .filter({ hasText: 'No data.' });

        // Validate account exists and is accessible
        let accountValidationError = null;
        
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
                console.log(foundName, '---', targetUsername);
                if (foundName !== targetUsername) {
                    console.log('Account in row does not match. Aborting.');
                    accountValidationError = 'No account found';
                }
            } catch {
                console.log('No rows found. Aborting.');
                accountValidationError = 'No account found';
            }
        }

        // Early return if validation failed
        if (accountValidationError) {
            return { success: false, message: accountValidationError, username: targetUsername };
        }

        
        // 4. Open the "editor" dropdown and click "Reset Password"
        await listFrame.getByRole('button', { name: 'editor' }).click();
        await listFrame
            .locator('a')
            .filter({ hasText: 'Reset Password' })
            .click();
        
        // 5. Fill in the new password and submit
        await listFrame.getByRole('textbox', { name: 'Input Password' }).fill(newPassword);
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
                username: targetUsername
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
                    username: targetUsername
                };
            } catch (errorError) {
                // If neither success nor specific error found, return generic error
                console.log('Try again');
                return {
                    success: false,
                    message: 'Try again',
                    username: targetUsername
                };
            }
        }
    
    } catch (error) {
        console.error('Error during password reset:', error);
        stopScreenshotCapture();
        return {
            success: false,
            message: `Error resetting password: ${error}`,
            username: targetUsername
        };
    } finally {
        // Stop WebSocket screenshot capture
        stopScreenshotCapture();
    }
}

// Export the function for external use
module.exports = { resetAccountPassword };