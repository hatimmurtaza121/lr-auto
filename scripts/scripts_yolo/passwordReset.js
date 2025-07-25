const { chromium } = require('playwright');
const path = require('path');

async function resetAccountPassword(page, context, params = {}) {
    const { targetUsername = 'testing01', newPassword = 'NewPassword123' } = params;
    
    console.log(`Account to reset: ${targetUsername}`);
    console.log(`New password: ${newPassword}`);

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
        
        // 6. Capture and log the success message
        const successMsg = await listFrame
            .locator('div')
            .filter({ hasText: 'success' })
            .nth(1)
            .textContent();
        console.log('Result:', successMsg.trim());

        return {
            success: true,
            message: `Successfully reset password for user "${targetUsername}"`,
            username: targetUsername
        };
    
    } catch (error) {
        console.error('Error during password reset:', error);
        return {
            success: false,
            message: `Error resetting password: ${error}`,
            username: targetUsername
        };
    }
}

// Export the function for external use
module.exports = { resetAccountPassword };