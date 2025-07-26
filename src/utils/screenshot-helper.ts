import { Page } from 'playwright';
import { screenshotWebSocketServer } from './websocket-server';

export interface ScreenshotOptions {
  gameName: string;
  action: string;
  interval?: number; // milliseconds between screenshots
}

export function createWebSocketScreenshotCapture(page: Page, options: ScreenshotOptions) {
  const { gameName, action, interval = 500 } = options;
  
  console.log(`Starting WebSocket screenshot capture for ${gameName} - ${action}`);
  
  // Start screenshot capture
  const screenshotInterval = setInterval(async () => {
    try {
      // Take screenshot as buffer
      const screenshotBuffer = await page.screenshot();
      
      // Broadcast via WebSocket
      screenshotWebSocketServer.broadcastScreenshot(screenshotBuffer, gameName, action);
      
      console.log(`WebSocket screenshot sent: ${new Date().toISOString()}`);
    } catch (error) {
      console.log('WebSocket screenshot error:', error);
    }
  }, interval);

  // Return cleanup function
  return () => {
    console.log(`Stopping WebSocket screenshot capture for ${gameName} - ${action}`);
    clearInterval(screenshotInterval);
  };
} 