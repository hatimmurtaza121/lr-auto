const { chromium } = require('playwright');
const path = require('path');

async function resetAccountPassword(page, context, params = {}) {
    const { targetUsername = 'testing01', newPassword = 'NewPassword123' } = params;
    
    console.log(`Account to reset: ${targetUsername}`);
    console.log(`New password: ${newPassword}`);

             // Start screenshot capture
         const screenshotInterval = setInterval(async () => {
             try {
                 // Use process.cwd() to get the project root directory
                 const screenshotPath = path.join(process.cwd(), 'public', 'latest.png');
                 await page.screenshot({ path: screenshotPath });
                 console.log('Screenshot taken:', new Date().toISOString(), 'to:', screenshotPath);
             } catch (error) {
                 console.log('Screenshot error:', error);
             }
         }, 500);

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

        if (await noData.count() > 0) {
            console.log('No user exists. Aborting.');
            return {
                success: false,
                message: 'No user exists',
                username: targetUsername
            };
        }

        // 3.5b. Now safely grab the first data row
        const firstRow = listFrame.locator('tbody > tr').first();
        try {
            await firstRow.waitFor({ timeout: 5000 });             // wait for at least one data row
            const accountCell = firstRow.locator('td').nth(2);     // 3rd <td> holds the account
            const foundName = (await accountCell.textContent()).trim();
            console.log(foundName, '---', targetUsername);
            if (foundName !== targetUsername) {
            console.log('Account in row does not match. Aborting.');
            return {
                success: false,
                message: 'Account in row does not match',
                username: targetUsername
            };
            }
        } catch {
            console.log('No rows found. Aborting.');
            return {
                success: false,
                message: 'No rows found',
                username: targetUsername
            };
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
            // First try to find success message
            const successMsg = await listFrame
                .locator('div')
                .filter({ hasText: 'success' })
                .nth(1)
                .textContent();
            console.log('Result:', successMsg.trim());

            // Check if it's a success message
            const messageText = successMsg.trim().toLowerCase();
            
            if (messageText.includes('success')) {
                return {
                    success: true,
                    message: `Successfully reset password for user "${targetUsername}"`,
                    username: targetUsername
                };
            } else {
                // For any other message, return the exact message
                return {
                    success: false,
                    message: successMsg.trim(),
                    username: targetUsername
                };
            }
        } catch {
            // If success message not found, look for error messages in specific locations
            try {
                // Try to find error message in toast container
                const errorMsg = await listFrame
                    .locator('#toast-container')
                    .getByText(/.*/)
                    .textContent();
                console.log('Error Result:', errorMsg.trim());
                
                return {
                    success: false,
                    message: errorMsg.trim(),
                    username: targetUsername
                };
            } catch {
                // If toast container not found, look for 'failed' text
                try {
                    const failedMsg = await listFrame
                        .getByText('failed')
                        .textContent();
                    console.log('Failed Result:', failedMsg.trim());
                    
                    return {
                        success: false,
                        message: failedMsg.trim(),
                        username: targetUsername
                    };
                } catch {
                    // If no specific error found, return generic message
                    return {
                        success: false,
                        message: 'Password reset failed',
                        username: targetUsername
                    };
                }
            }
        }
    
    } catch (error) {
        console.error('Error during password reset:', error);
        clearInterval(screenshotInterval);
        return {
            success: false,
            message: `Error resetting password: ${error}`,
            username: targetUsername
        };
             } finally {
             // Stop screenshot capture
             clearInterval(screenshotInterval);
             

         }
}

// Export the function for external use
module.exports = { resetAccountPassword };