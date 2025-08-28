// From here
await page.reload();
await page.waitForLoadState('networkidle');

// Navigate to Admin Structure
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
    // Only check the first row (search result)
    const firstRow = searchResults.first();
    
    // Get the account cell (2nd column, index 1) from first row
    const accountCell = firstRow.locator('td').nth(1);
    const cellText = (await accountCell.textContent()).trim();
    
    // Check for exact match first
    if (cellText === params.account_name) {
        // console.log(`✓ EXACT MATCH: Account "${params.account_name}" found in first row`);
    } else if (cellText.includes(params.account_name)) {
        // console.log(`✓ CONTAINS MATCH: Account "${params.account_name}" found within "${cellText}" in first row`);
    } else {
        // console.log(`Account mismatch: found "${cellText}" instead of "${params.account_name}". Aborting.`);
        return {
            success: false,
            message: 'No account found'
        };
    }
} else {
    // console.log('No search results found. Aborting.');
    return {
        success: false,
        message: 'No account found'
    };
}

// Rest work from update
await page.locator('iframe[name="frm_main_content"]').contentFrame().getByText('Update').click();

await page.locator('iframe[name="frm_main_content"]').contentFrame().getByText('Recharge').click();
await page.locator('#Container iframe').contentFrame().locator('#txtAddGold').fill(params.amount);
await page.locator('#Container iframe').contentFrame().getByText('Recharge').click();

// Confirm recharge outcome message
try {
    // grab the font text inside the #mb_msg div
    const msgText = await page.locator('#mb_msg font').textContent();
    const trimmed = msgText.trim();

    if (trimmed === 'Confirmed successful') {
        // console.log('Recharge successful.');
        return {
            success: true,
            message: 'Recharge successful'
        };
    } else {
        // console.log(`Error: ${trimmed}`);
        return {
            success: false,
            message: `Error during recharge: ${trimmed}`
        };
    }
} catch (e) {
    // console.log('Message element not found. Recharge outcome unknown.');
    return {
        success: false,
        message: 'Error during recharge: No confirmation message found'
    };
}