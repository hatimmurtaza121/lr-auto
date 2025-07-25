const { chromium } = require('playwright');
const path = require('path');

async function recharge(page, context, params = {}) {
    const { accountName = 'testing01', rechargeAmount = '1', remarks = 'test remarks' } = params;

    console.log(`Account to recharge: ${accountName}`);
    console.log(`Recharge amount: ${rechargeAmount}`);
    console.log(`Remarks: ${remarks}`);

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

        await page.getByRole('tabpanel', { name: ' Player List' }).locator('iframe').contentFrame().getByPlaceholder('Input score').fill(rechargeAmount);
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
            message: `Successfully recharged ${rechargeAmount} for user "${accountName}"`,
            username: accountName,
            amount: parseFloat(rechargeAmount)
        };

    } catch (error) {
        console.error('Error during recharging amount:', error);
        return {
            success: false,
            message: `Error during recharge: ${error}`,
            username: accountName,
            amount: parseFloat(rechargeAmount)
        };
    }
}

// Export the function for external use
module.exports = { recharge };
