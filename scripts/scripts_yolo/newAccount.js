const { chromium } = require('playwright');
const path = require('path');

async function createNewAccount(page, context, params = {}) {
    const { newAccountName = 'testing07', newPassword = 'Hatim121' } = params;
    
    console.log('Starting account creation process...');
    console.log(`Account Name: ${newAccountName}`);
    console.log(`Password: ${newPassword}`);
    
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
        clearInterval(screenshotInterval);
        return {
            success: false,
            message: `Error creating account: ${error.message || error}`,
            accountName: newAccountName
        };
             } finally {
             // Stop screenshot capture
             clearInterval(screenshotInterval);
             

         }
}

// Export the function for external use
module.exports = { createNewAccount };
