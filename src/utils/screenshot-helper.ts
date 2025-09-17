import { Page } from 'playwright';
import { screenshotWebSocketServer } from './websocket-server';

export interface ScreenshotOptions {
  gameName: string;
  action: string;
  interval?: number; // milliseconds between screenshots
  teamId?: string; // NEW: Team ID for filtering
  sessionId?: string; // NEW: Session ID for targeted delivery
  gameId?: number; // NEW: Game ID for targeted delivery
}

export function createWebSocketScreenshotCapture(page: Page, options: ScreenshotOptions) {
  const { gameName, action, interval = 500, teamId = 'unknown', sessionId = 'unknown', gameId = 0 } = options;
  
  // console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action} (Team: ${teamId}, Session: ${sessionId})`);
  
  // Start screenshot capture
  const screenshotInterval = setInterval(async () => {
    try {
      // Check if page is still valid before taking screenshot
      if (!page || page.isClosed()) {
        console.log(`Page closed for ${gameName} - ${action}, stopping screenshot capture`);
        clearInterval(screenshotInterval);
        return;
      }
      
      // Take screenshot as buffer
      const screenshotBuffer = await page.screenshot();
      
      // NEW: Use session-based broadcasting with game ID
      screenshotWebSocketServer.broadcastScreenshot(
        screenshotBuffer, 
        gameId, // NEW: Pass game ID
        gameName, 
        action, 
        teamId, 
        sessionId
      );
      
      // console.log(`WebSocket screenshot sent: ${new Date().toISOString()}`);
    } catch (error) {
      // Don't log cleanup errors as they're expected when page closes
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Target page, context or browser has been closed') &&
          !errorMessage.includes('cannot register cleanup after operation has finished')) {
        console.log('WebSocket screenshot error:', error);
      }
    }
  }, interval);

  // Return cleanup function
  return () => {
    // console.log(`Stopping WebSocket screenshot capture for ${gameName} - ${action}`);
    try {
      clearInterval(screenshotInterval);
      // Additional safety: ensure interval is cleared
      if (screenshotInterval) {
        clearInterval(screenshotInterval);
      }
    } catch (cleanupError) {
      console.log('Screenshot interval cleanup error (non-critical):', cleanupError);
    }
  };
} 