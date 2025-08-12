import { BrowserContext, Page } from 'playwright';

// WebSocket screenshot capture function - unified for all actions
export function createWebSocketScreenshotCapture(page: Page, gameName: string, action: string, interval: number = 500) {
    console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
    console.log('WebSocket server available:', !!(global as any).screenshotWebSocketServer);
    
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
            if ((global as any).screenshotWebSocketServer) {
                console.log('Broadcasting screenshot via WebSocket...');
                (global as any).screenshotWebSocketServer.broadcastScreenshot(screenshotBuffer, gameName, action);
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

// Script execution interface
export interface ScriptResult {
    success: boolean;
    message: string;
    [key: string]: any;
}

// Script execution function that can handle both database and hardcoded scripts
export async function executeActionScript(
    page: Page, 
    context: BrowserContext, 
    actionName: string, 
    gameName: string,
    params: any = {},
    databaseScript?: string | null
): Promise<ScriptResult> {
    
    let scriptCode: string;
    let scriptSource: 'database' | 'fallback';
    
    // Try to use database script first
    if (databaseScript && databaseScript.trim()) {
        scriptCode = databaseScript;
        scriptSource = 'database';
        console.log(`Executing ${actionName} script from database`);
    } else {
        // Fallback to hardcoded script
        scriptCode = await getFallbackScript(actionName, gameName);
        scriptSource = 'fallback';
        console.log(`Executing ${actionName} script from fallback (hardcoded)`);
    }
    
    if (!scriptCode) {
        return {
            success: false,
            message: `No script found for action '${actionName}' in game '${gameName}'`
        };
    }
    
    try {
        // Start WebSocket screenshot capture
        const stopScreenshotCapture = createWebSocketScreenshotCapture(page, gameName, actionName, 500);
        
        try {
            // Execute the script using a more robust approach that properly handles async/await
            let result;
            
            // Create a proper async function that can handle await statements
            // We need to define the async function explicitly in the Function constructor
            const executeScript = new Function(
                'page', 'context', 'params', 'createWebSocketScreenshotCapture',
                `
                // Define an async function that will execute the script
                const runScript = async function() {
                    ${scriptCode}
                };
                
                // Execute the async function and return its promise
                return runScript();
                `
            );
            
            // Execute and await the result
            result = await executeScript(page, context, params, createWebSocketScreenshotCapture);
            
            // Ensure the result has the expected structure
            if (result && typeof result === 'object') {
                return {
                    ...result,
                    _scriptSource: scriptSource
                };
            } else {
                return {
                    success: false,
                    message: `Invalid script result format for action '${actionName}'`,
                    _scriptSource: scriptSource
                };
            }
            
        } finally {
            // Always stop screenshot capture
            stopScreenshotCapture();
        }
        
    } catch (error) {
        console.error(`Error executing ${actionName} script:`, error);
        return {
            success: false,
            message: `Script execution error: ${error instanceof Error ? error.message : String(error)}`,
            _scriptSource: scriptSource
        };
    }
}

// Fallback script loader - loads hardcoded scripts
async function getFallbackScript(actionName: string, gameName: string): Promise<string> {
    try {
        // Map game names to script directories
        const gameScriptMap: { [key: string]: string } = {
            'yolo': 'scripts_yolo',
            'orion_stars': 'scripts_orion_stars',
            'game_vault': 'scripts_game_vault',
            'orion_strike': 'scripts_orion_strike',
            'mr_all_in_one': 'scripts_mr_all_in_one',
            'juwa_city': 'scripts_juwa_city'
        };
        
        const scriptDir = gameScriptMap[gameName.toLowerCase()];
        if (!scriptDir) {
            throw new Error(`No script directory found for game: ${gameName}`);
        }
        
        // Try to load the script file using require
        try {
            const scriptPath = `../../scripts/${scriptDir}/${actionName}.js`;
            const scriptModule = require(scriptPath);
            
            // Extract the run function from the module
            const runFunction = scriptModule.run || scriptModule[actionName] || scriptModule.default;
            
            if (runFunction && typeof runFunction === 'function') {
                // Convert the function to string for execution
                const functionString = runFunction.toString();
                
                // Extract the function body (everything between the first { and last })
                const bodyStart = functionString.indexOf('{');
                const bodyEnd = functionString.lastIndexOf('}');
                
                if (bodyStart !== -1 && bodyEnd !== -1) {
                    const functionBody = functionString.substring(bodyStart + 1, bodyEnd).trim();
                    
                    // Return the function body wrapped in a function that calls the original
                    return `
                        // Fallback script for ${actionName} in ${gameName}
                        // Loading from hardcoded script file
                        
                        // Create the original function
                        const originalFunction = ${functionString};
                        
                        // Execute it with the provided parameters
                        return await originalFunction(page, context, params);
                    `;
                }
            }
            
            throw new Error(`Could not extract function body from ${actionName}.js`);
            
        } catch (requireError) {
            console.log(`Could not require script file for ${actionName}:`, requireError);
            throw new Error(`Fallback script file not found: ${actionName}.js`);
        }
        
    } catch (error) {
        console.error(`Error loading fallback script for ${actionName}:`, error);
        throw error;
    }
}

// Helper function to validate script code
export function validateScriptCode(scriptCode: string): { isValid: boolean; error?: string } {
    try {
        // Basic validation - check if it's valid JavaScript
        new Function('page', 'context', 'params', 'createWebSocketScreenshotCapture', scriptCode);
        return { isValid: true };
    } catch (error) {
        return { 
            isValid: false, 
            error: error instanceof Error ? error.message : 'Invalid script syntax' 
        };
    }
}
