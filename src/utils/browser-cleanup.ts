import { Browser, BrowserContext, Page } from 'playwright';

/**
 * Global registry of active browser instances for cleanup
 */
class BrowserRegistry {
  private browsers: Set<Browser> = new Set();
  private contexts: Set<BrowserContext> = new Set();
  private pages: Set<Page> = new Set();

  registerBrowser(browser: Browser) {
    this.browsers.add(browser);
  }

  registerContext(context: BrowserContext) {
    this.contexts.add(context);
  }

  registerPage(page: Page) {
    this.pages.add(page);
  }

  unregisterBrowser(browser: Browser) {
    this.browsers.delete(browser);
  }

  unregisterContext(context: BrowserContext) {
    this.contexts.delete(context);
  }

  unregisterPage(page: Page) {
    this.pages.delete(page);
  }

  /**
   * Force cleanup all browser resources
   */
  async cleanupAll() {
    console.log('BrowserRegistry: Starting forced cleanup of all resources...');
    
    // Close all pages
    for (const page of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
          console.log('BrowserRegistry: Closed page');
        }
      } catch (error) {
        console.error('BrowserRegistry: Error closing page:', error);
      }
    }
    this.pages.clear();

    // Close all contexts
    for (const context of this.contexts) {
      try {
        if (!context.isClosed()) {
          await context.close();
          console.log('BrowserRegistry: Closed context');
        }
      } catch (error) {
        console.error('BrowserRegistry: Error closing context:', error);
      }
    }
    this.contexts.clear();

    // Close all browsers
    for (const browser of this.browsers) {
      try {
        if (browser.isConnected()) {
          await browser.close();
          console.log('BrowserRegistry: Closed browser');
        }
      } catch (error) {
        console.error('BrowserRegistry: Error closing browser:', error);
      }
    }
    this.browsers.clear();

    console.log('BrowserRegistry: Forced cleanup completed');
  }

  /**
   * Get current resource counts
   */
  getResourceCounts() {
    return {
      browsers: this.browsers.size,
      contexts: this.contexts.size,
      pages: this.pages.size
    };
  }
}

// Global instance
export const browserRegistry = new BrowserRegistry();

/**
 * Cleanup browser resources - called when jobs timeout or fail
 */
export async function cleanupBrowserResources() {
  console.log('cleanupBrowserResources: Starting cleanup...');
  
  try {
    // Force cleanup all registered resources
    await browserRegistry.cleanupAll();
    
    // Additional cleanup: check for any remaining global references
    if ((global as any).browser) {
      try {
        await (global as any).browser.close();
        (global as any).browser = null;
        console.log('cleanupBrowserResources: Closed global browser reference');
      } catch (error) {
        console.error('cleanupBrowserResources: Error closing global browser:', error);
      }
    }

    // Force garbage collection if available (Node.js)
    if (global.gc) {
      global.gc();
      console.log('cleanupBrowserResources: Forced garbage collection');
    }

    console.log('cleanupBrowserResources: Cleanup completed successfully');
  } catch (error) {
    console.error('cleanupBrowserResources: Error during cleanup:', error);
    throw error;
  }
}

/**
 * Enhanced cleanup with timeout protection
 */
export async function cleanupBrowserResourcesWithTimeout(timeoutMs: number = 10000) {
  console.log(`cleanupBrowserResourcesWithTimeout: Starting cleanup with ${timeoutMs}ms timeout...`);
  
  const cleanupPromise = cleanupBrowserResources();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Browser cleanup timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([cleanupPromise, timeoutPromise]);
    console.log('cleanupBrowserResourcesWithTimeout: Cleanup completed within timeout');
  } catch (error) {
    console.error('cleanupBrowserResourcesWithTimeout: Cleanup failed or timed out:', error);
    // Even if cleanup times out, try to force close any remaining resources
    try {
      await browserRegistry.cleanupAll();
    } catch (forceError) {
      console.error('cleanupBrowserResourcesWithTimeout: Force cleanup also failed:', forceError);
    }
    throw error;
  }
}

/**
 * Register a browser instance for cleanup
 */
export function registerBrowserForCleanup(browser: Browser) {
  browserRegistry.registerBrowser(browser);
}

/**
 * Register a context instance for cleanup
 */
export function registerContextForCleanup(context: BrowserContext) {
  browserRegistry.registerContext(context);
}

/**
 * Register a page instance for cleanup
 */
export function registerPageForCleanup(page: Page) {
  browserRegistry.registerPage(page);
}

/**
 * Unregister resources when they're properly closed
 */
export function unregisterBrowser(browser: Browser) {
  browserRegistry.unregisterBrowser(browser);
}

export function unregisterContext(context: BrowserContext) {
  browserRegistry.unregisterContext(context);
}

export function unregisterPage(page: Page) {
  browserRegistry.unregisterPage(page);
}
