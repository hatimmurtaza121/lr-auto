const { chromium } = require('playwright');
const path = require('path');

async function redeem(page, context, params = {}) {
    const { accountName = 'testing01', redeemAmount = '1', remarks = 'test remarks' } = params;

    console.log(`Account to redeem: ${accountName}`);
    console.log(`Redeem amount: ${redeemAmount}`);
    console.log(`Remarks: ${remarks}`);

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

        // 3.5a. Check if "No data." row is present
        const noData = listFrame
            .locator('tbody > tr > td[colspan="16"] span.help-block')
            .filter({ hasText: 'No data.' });

        if (await noData.count() > 0) {
            console.log('No user exists. Aborting.');
            return {
                success: false,
                message: 'No user exists',
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
                message: 'Account in row does not match',
                username: accountName
              };
            }
        } catch {
          console.log('No rows found. Aborting.');
          return {
            success: false,
            message: 'No rows found',
            username: accountName
          };
        }

        await listFrame.getByRole('button', { name: 'editor' }).click();
        await listFrame.locator('a').filter({ hasText: 'Recharge' }).click();

        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByPlaceholder('Input score').fill(redeemAmount);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('textbox', { name: 'Input remark' }).fill(remarks);
        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByRole('button', { name: ' Submit' }).click();
        
        // 6. Capture and log the success message
        const successMsg = await listFrame
            .locator('div')
            .filter({ hasText: 'success' })
            .nth(1)
            .textContent();
        console.log('Result:', successMsg.trim());

        return {
            success: true,
            message: `Successfully redeemed ${redeemAmount} for user "${accountName}"`,
            username: accountName,
            amount: parseFloat(redeemAmount)
        };
        
    } catch (error) {
        console.error('Error during recharging amount:', error);
        clearInterval(screenshotInterval);
        return {
            success: false,
            message: `Error during redeem: ${error}`,
            error,
            username: accountName,
            amount: parseFloat(redeemAmount)
        };
             } finally {
             // Stop screenshot capture
             clearInterval(screenshotInterval);
             

         }
}

// Export the function for external use
module.exports = { redeem };
