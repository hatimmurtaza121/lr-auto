import { BrowserContext, Page } from 'playwright';

// WebSocket screenshot capture function - unified for all actions
export function createWebSocketScreenshotCapture(
    page: Page, 
    gameName: string, 
    action: string, 
    interval: number = 500,
    teamId: string = 'unknown',
    sessionId: string = 'unknown',
    gameId: number // NEW: Add game ID parameter
) {
    console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action} (Team: ${teamId}, Session: ${sessionId})`);
    console.log(`WebSocket server available: ${!!(global as any).screenshotWebSocketServer}`);
    console.log(`Screenshot interval: ${interval}ms`);
    
    const screenshotInterval = setInterval(async () => {
        try {
            // Check if page is still valid before taking screenshot
            if (!page || page.isClosed()) {
                console.log(`Page closed for ${gameName} - ${action}, stopping screenshot capture`);
                clearInterval(screenshotInterval);
                return;
            }
            
            // console.log(`Taking screenshot for ${gameName} - ${action}...`);
            // Take screenshot as buffer
            const screenshotBuffer = await page.screenshot();
            // console.log(`Screenshot taken, size: ${screenshotBuffer.length} bytes`);
            
            // Convert to base64 for WebSocket transmission
            const base64Image = screenshotBuffer.toString('base64');
            
            // Send via WebSocket (this will be handled by the parent process)
            // console.log(`WebSocket screenshot ready: ${new Date().toISOString()}`);
            
            // Emit custom event that parent can listen to
            if ((global as any).screenshotWebSocketServer) {
                console.log(`Screenshot captured for ${gameName} - ${action} (${screenshotBuffer.length} bytes)`);
                console.log(`Broadcasting to WebSocket server (Team: ${teamId}, Session: ${sessionId})`);
                
                // NEW: Use session-based broadcasting with game ID
                (global as any).screenshotWebSocketServer.broadcastScreenshot(
                    screenshotBuffer, 
                    gameId, // NEW: Pass game ID
                    gameName, 
                    action, 
                    teamId, 
                    sessionId
                );
                
                console.log(`Screenshot sent successfully`);
            } else {
                console.log(`WebSocket server not available for screenshot broadcast`);
            }
        } catch (error) {
            // Don't log cleanup errors as they're expected when page closes
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('Target page, context or browser has been closed') &&
                !errorMessage.includes('cannot register cleanup after operation has finished')) {
                console.log('WebSocket screenshot error:', error);
            }
        }
    }, interval);

    return () => {
        console.log(`Stopping WebSocket screenshot capture for ${gameName} - ${action}`);
        try {
            clearInterval(screenshotInterval);
            // Additional safety: ensure interval is cleared
            if (screenshotInterval) {
                clearInterval(screenshotInterval);
            }
            console.log(`Screenshot capture stopped successfully for ${gameName} - ${action}`);
        } catch (cleanupError) {
            console.log(`Screenshot interval cleanup error (non-critical): ${cleanupError}`);
        }
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
    gameId: number, // NEW: Add game ID parameter
    params: any = {},
    databaseScript?: string | null,
    teamId: string = 'unknown',
    sessionId: string = 'unknown'
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
        scriptCode = await getFallbackScript(actionName, gameName, gameId);
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
        // Screenshot capture is now handled inside the script wrapper
        // No need to start it here to avoid duplication
        
        try {
            // Execute the script using a more robust approach that properly handles async/await
            let result;
            
            // Create a proper async function that can handle await statements
            // We need to define the async function explicitly in the Function constructor
            const executeScript = new Function(
                'page', 'context', 'params', 'createWebSocketScreenshotCapture', 'restoreSessionStorageInPage',
                `
                // Define an async function that will execute the script
                const runScript = async function() {
                    console.log('Database script wrapper starting for ' + '${actionName}');
                    
                    // Start WebSocket screenshot capture for database scripts
                    const stopScreenshotCapture = createWebSocketScreenshotCapture(page, '${gameName}', '${actionName}', 500, '${teamId}', '${sessionId}', ${gameId});
                    
                    try {
                        console.log('Executing database script: ' + '${actionName}');
                        ${scriptCode}
                    } finally {
                        console.log('Database script finished, stopping screenshot capture');
                        // Always stop screenshot capture
                        stopScreenshotCapture();
                    }
                };
                
                // Execute the async function and return its promise
                return runScript();
                `
            );
            
            // Execute and await the result
            result = await executeScript(page, context, params, createWebSocketScreenshotCapture, restoreSessionStorageInPage);
            
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
            
        } catch (scriptError) {
            // Re-throw the error after stopping screenshot capture
            throw scriptError;
        } finally {
            // Screenshot cleanup is handled inside the script wrapper
            // Small delay to ensure everything is properly cleaned up
            await new Promise(resolve => setTimeout(resolve, 100));
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
async function getFallbackScript(actionName: string, gameName: string, gameId: number): Promise<string> {
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
                        
                        // Start WebSocket screenshot capture for fallback scripts
                        const stopScreenshotCapture = createWebSocketScreenshotCapture(page, '${gameName}', '${actionName}', 500, 'unknown', 'unknown', ${gameId});
                        
                        try {
                            // Create the original function
                            const originalFunction = ${functionString};
                            
                            // Execute it with the provided parameters
                            return await originalFunction(page, context, params);
                        } finally {
                            // Always stop screenshot capture
                            stopScreenshotCapture();
                        }
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

// Helper function to restore session storage in a page
export async function restoreSessionStorageInPage(page: Page, sessionStorageData: Record<string, string>): Promise<void> {
  try {
    if (sessionStorageData && Object.keys(sessionStorageData).length > 0) {
      console.log('Restoring session storage data...');
      console.log(`Session storage items to restore: ${Object.keys(sessionStorageData).length}`);
      
      await page.evaluate((sessionStorageData) => {
        try {
          // Restore session storage data (don't clear existing)
          Object.entries(sessionStorageData).forEach(([key, value]) => {
            sessionStorage.setItem(key, value);
            console.log(`Restored session storage: ${key} = ${value}`);
          });
          
          console.log('Session storage restoration completed');
        } catch (error) {
          console.error('Error restoring session storage:', error);
        }
      }, sessionStorageData);
      
      console.log('Session storage data restored successfully');
    } else {
      console.log('No session storage data to restore');
    }
  } catch (error) {
    console.error('Error restoring session storage:', error);
    // Don't throw error - session storage restoration is not critical
  }
}

// Helper function to validate script code
export function validateScriptCode(scriptCode: string): { isValid: boolean; error?: string } {
  try {
    // Wrap the script code in an async function to handle await statements
    const wrappedCode = `(async function(page, context, params, createWebSocketScreenshotCapture) {\n${scriptCode}\n})`;
    
    // Basic validation - check if it's valid JavaScript
    new Function('page', 'context', 'params', 'createWebSocketScreenshotCapture', wrappedCode);
    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Invalid script syntax' 
    };
  }
}
