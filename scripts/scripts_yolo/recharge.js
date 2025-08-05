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

async function recharge(page, context, params = {}) {
    const { accountName = 'testing01', rechargeAmount = '1', remarks = 'test remarks' } = params;

    console.log(`Account to recharge: ${accountName}`);
    console.log(`Recharge amount: ${rechargeAmount}`);
    console.log(`Remarks: ${remarks}`);

             // Start WebSocket screenshot capture
         const stopScreenshotCapture = createWebSocketScreenshotCapture(page, 'yolo', 'recharge', 500);

    try {
        // From here
        await page.waitForLoadState('networkidle');
        await page.getByRole('link', { name: ' Player Management ' }).click();
        await page.getByRole('link', { name: ' Player List' }).click();

        // 2. Grab the iframe that contains the player list
        const listFrame = await page
            .getByRole('tabpanel', { name: ' Player List' })
            .locator('iframe')
            .contentFrame();
        
        // 3. Search for the account
        await listFrame.getByRole('textbox', { name: 'Account' }).fill(accountName);
        await listFrame.getByRole('button', { name: '  Search' }).click();

        // 3.5. Wait for table to load and stabilize
        console.log('Waiting for search results to load...');
        
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
                return {
                    success: false,
                    message: 'No account found',
                    username: accountName
                };
            }

            // 3.5b. Now safely grab the first data row
            const firstRow = listFrame.locator('tbody > tr').first();
            try {
                await firstRow.waitFor({ timeout: 5000 });             // wait for at least one data row
                const accountCell = firstRow.locator('td').nth(2);     // 3rd <td> holds the account
                const foundName = (await accountCell.textContent()).trim();
                console.log(foundName, '---', accountName);
                if (foundName !== accountName) {
                  console.log('Account in row does not match. Aborting.');
                  return {
                    success: false,
                    message: 'No account found',
                    username: accountName
                  };
                }
            } catch {
              console.log('No rows found. Aborting.');
              return {
                success: false,
                message: 'No account found',
                username: accountName
              };
            }
        } catch (error) {
            console.log('Table loading timeout. Aborting.');
            return {
                success: false,
                message: 'Table loading timeout',
                username: accountName
            };
        }

        await listFrame.getByRole('button', { name: 'editor' }).click();
        await listFrame.locator('a').filter({ hasText: 'Recharge' }).click();

        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByPlaceholder('Input score').fill(rechargeAmount);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input remark' }).fill(remarks);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('button', { name: ' Submit' }).click();
        
        // 6. Capture and log the success/error message
        try {
            // Check for success message
            const successElement = listFrame
                .locator('div')
                .filter({ hasText: 'success' })
                .nth(1);
            await successElement.waitFor({ state: 'visible', timeout: 3000 });
            await successElement.click();
            console.log('Recharge successful');
            return {
                success: true,
                message: 'Recharge successful',
                username: accountName,
                amount: parseFloat(rechargeAmount)
            };
        } catch (successError) {
            try {
                // Check for "Amount cannot be 0" error
                const zeroAmountError = listFrame
                    .locator('div')
                    .filter({ hasText: /^The score must be greater than 0\.$/ })
                    .nth(1);
                await zeroAmountError.waitFor({ state: 'visible', timeout: 3000 });
                await zeroAmountError.click();
                console.log('Amount should be greater than 0');
                return {
                    success: false,
                    message: 'Amount should be greater than 0',
                    username: accountName,
                    amount: parseFloat(rechargeAmount)
                };
            } catch (zeroError) {
                try {
                    // Check for "Amount is insufficient" error
                    const insufficientError = listFrame
                        .locator('div')
                        .filter({ hasText: 'The score is insufficient' })
                        .nth(1);
                    await insufficientError.waitFor({ state: 'visible', timeout: 3000 });
                    await insufficientError.click();
                    console.log('Amount is insufficient');
                    return {
                        success: false,
                        message: 'Amount is insufficient',
                        username: accountName,
                        amount: parseFloat(rechargeAmount)
                    };
                } catch (insufficientError) {
                    // If neither success nor specific error found, return generic error
                    console.log('Try again');
                    return {
                        success: false,
                        message: 'Try again, maybe the amount is insufficient',
                        username: accountName,
                        amount: parseFloat(rechargeAmount)
                    };
                }
            }
        }

    } catch (error) {
        console.error('Error during recharging amount:', error);
        stopScreenshotCapture();
        return {
            success: false,
            message: `Error during recharge: ${error}`,
            username: accountName,
            amount: parseFloat(rechargeAmount)
        };
    } finally {
        // Stop WebSocket screenshot capture
        stopScreenshotCapture();
    }
}

// Export the function for external use
module.exports = { recharge };
