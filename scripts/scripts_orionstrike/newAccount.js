// From here
await page.reload();
await page.waitForLoadState('networkidle');

await page.locator('#frm_left_frm').contentFrame().locator('a').filter({ hasText: 'Admin Structure' }).click();

// Fill search field and click Search
await page.locator('iframe[name="frm_main_content"]').contentFrame().getByRole('textbox', { name: 'Account' }).fill(params.account_name);
await page.locator('iframe[name="frm_main_content"]').contentFrame().getByRole('button', { name: 'Search' }).click();

// Access the main content iframe
const mainFrame = await page.frame({ name: 'frm_main_content' });

// Wait for search results to load
await page.waitForTimeout(2000);

// Check if any search results exist - try multiple selectors
let searchResults = mainFrame.locator('tbody > tr.list');
let resultCount = await searchResults.count();

// If no results with .list class, try alternative selectors
if (resultCount === 0) {
    searchResults = mainFrame.locator('tbody > tr');
    resultCount = await searchResults.count();
    // console.log(`Found ${resultCount} rows with alternative selector`);
} else {
    // console.log(`Found ${resultCount} rows with .list selector`);
}

if (resultCount > 0) {
    // console.log(`Found ${resultCount} search result rows, checking first row only`);
    
    // Only check the first row (search result)
    const firstRow = searchResults.first();
    
    // Debug: log cells in the first row
    const cells = firstRow.locator('td');
    const cellCount = await cells.count();
    // console.log(`First row has ${cellCount} cells`);
    
    // Get the account cell (2nd column, index 1) from first row
    const accountCell = firstRow.locator('td').nth(1);
    const cellText = (await accountCell.textContent()).trim();
    
    // Debug: log what we're comparing
    // console.log(`First row, Account column: "${cellText}" vs searching for: "${params.account_name}"`);
    
    // Check for exact match first
    if (cellText === params.account_name) {
        // console.log(`✓ EXACT MATCH: Account "${params.account_name}" already exists in first row`);
        return {
            success: false,
            message: 'Account has already been created'
        };
    }
    
    // Also check if the account name is contained within the cell text (for extra whitespace/newlines)
    if (cellText.includes(params.account_name)) {
        // console.log(`✓ CONTAINS MATCH: Account "${params.account_name}" found within "${cellText}" in first row`);
        return {
            success: false,
            message: 'Account has already been created'
        };
    }
    
    // console.log(`No matching account found in first row, continuing with account creation`);
} else {
    // console.log('No search results found, continuing with account creation');
}

await page.locator('iframe[name="frm_main_content"]').contentFrame().getByText('Create Account').click();

// Fill the account form fields using the Container iframe approach from codegen
await page.locator('#Container iframe').contentFrame().locator('#txtAccount').click();
await page.locator('#Container iframe').contentFrame().locator('#txtAccount').fill(params.account_name);
await page.locator('#Container iframe').contentFrame().locator('#txtLogonPass').click();
await page.locator('#Container iframe').contentFrame().locator('#txtLogonPass').fill(params.new_password);
await page.locator('#Container iframe').contentFrame().locator('#txtLogonPass2').click();
await page.locator('#Container iframe').contentFrame().locator('#txtLogonPass2').fill(params.new_password);

// Wait 1 second before clicking
await page.waitForTimeout(1000);

await page.locator('#Container iframe').contentFrame().getByRole('button', { name: 'Create' }).click();

// Try multiple approaches to find the popup message
let popupText = '';
try {
    // First try in the main page
    await page.waitForSelector('#mb_msg', { visible: true, timeout: 3000 });
    popupText = (await page.locator('#mb_msg').textContent()).trim();
    // console.log('Found popup in main page:', popupText);
} catch (e) {
    try {
        // Try in the Container iframe
        await page.locator('#Container iframe').contentFrame().waitForSelector('#mb_msg', { visible: true, timeout: 3000 });
        popupText = (await page.locator('#Container iframe').contentFrame().locator('#mb_msg').textContent()).trim();
        // console.log('Found popup in Container iframe:', popupText);
    } catch (e2) {
        try {
            // Try looking for any text containing "Successfully" or "Error"
            const successText = await page.locator('text=Successfully').first().textContent();
            if (successText) {
                popupText = successText.trim();
                // console.log('Found success text:', popupText);
            } else {
                popupText = 'Account creation completed';
                // console.log('No popup found, assuming success');
            }
        } catch (e3) {
            popupText = 'Account creation completed';
            // console.log('No popup found, assuming success');
        }
    }
}

// branch on what it says
if (popupText === 'Successfully Created Account') {
    // console.log(`Successfully created user "${params.account_name}".`);
    return {
        success: true,
        message: 'Account created successfully'
    };
} else {
    // console.log(`Popup says: "${popupText}"`);
    return {
        success: false,
        message: `Error creating account: ${popupText}`
    };
}