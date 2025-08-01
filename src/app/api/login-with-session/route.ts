import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getTeamContextFromRequest } from '@/utils/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import path from 'path';
import { getGame, getGameCredential } from '@/utils/game-mapping';
import { updateGameStatus } from '@/utils/game-status';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    
    // Get team context
    const { teamId } = await getTeamContextFromRequest(request);
    
    // Parse request body
    const body = await request.json();
    const { username, password, gameName } = body;
    
    if (!username || !password || !gameName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Logging into ${gameName} for user ${user.id}, team ${teamId}`);

    // Get game from database
    const game = await getGame(gameName);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 400 });
    }

    console.log(`Found game: ${game.name} with login URL: ${game.login_url}`);

    // Get or create game credential
    let gameCredentialId: number;
    
    // First check if credential already exists
    const existingCredential = await getGameCredential(gameName, teamId);
    
    if (existingCredential) {
      // Update existing credential
      const { error: updateError } = await supabase
        .from('game_credential')
        .update({
          username: username,
          password: password
        })
        .eq('id', existingCredential.id);

      if (updateError) {
        throw new Error(`Failed to update game credential: ${updateError.message}`);
      }

      gameCredentialId = existingCredential.id;
      console.log(`Updated existing game credential: ${gameCredentialId}`);
    } else {
      // Create new game credential
      const { data: newCredential, error: createError } = await supabase
        .from('game_credential')
        .insert({
          team_id: teamId,
          game_id: game.id,
          username: username,
          password: password
        })
        .select('id')
        .single();

      if (createError) {
        throw new Error(`Failed to create game credential: ${createError.message}`);
      }

      gameCredentialId = newCredential.id;
      console.log(`Created new game credential: ${gameCredentialId}`);
    }

    // Run the existing login script
    const loginResult = await runLoginScript('scripts', username, password, game.login_url);
    
    // Update login status
    // try {
    //   await updateGameStatus({
    //     teamId: teamId,
    //     gameId: game.id,
    //     action: 'login',
    //     status: loginResult.success ? 'success' : 'fail'
    //   });
    // } catch (error) {
    //   console.error('Failed to update login status:', error);
    // }
    
    if (!loginResult.success) {
      throw new Error(loginResult.error || 'Login script failed');
    }

    // Capture session data from the logged-in session using the auth state file
    const sessionData = await captureSessionDataFromAuthState(game.login_url);

    // Deactivate any existing sessions for this credential
    await supabase
      .from('session')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('game_credential_id', gameCredentialId);

    // Save session to database
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const { error: sessionError } = await supabase
      .from('session')
      .insert({
        user_id: user.id,
        game_credential_id: gameCredentialId,
        session_token: sessionToken,
        session_data: sessionData,
        expires_at: sessionData.earliestExpirationDate,
        is_active: true,
        created_at: new Date().toISOString(),
      });

    if (sessionError) {
      throw new Error(`Failed to save session: ${sessionError.message}`);
    }

    console.log(`Session saved successfully for game credential ${gameCredentialId}`);

    return NextResponse.json({
      success: true,
      message: `Successfully logged into ${game.name}`,
      sessionToken: sessionToken,
      gameCredentialId: gameCredentialId
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { 
        error: 'Login failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

/**
 * Run the existing login script
 */
async function runLoginScript(scriptDir: string, username: string, password: string, loginUrl: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), scriptDir, 'login.js');
    const args = [username, password, loginUrl];
    
    console.log(`Running login script: ${scriptPath} with args: ${args}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Script exists: ${require('fs').existsSync(scriptPath)}`);

    const proc = spawn('node', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env }
    });
    
    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => { 
      output += data.toString(); 
      console.log('Login script stdout:', data.toString());
    });
    
    proc.stderr.on('data', (data) => { 
      errorOutput += data.toString(); 
      console.log('Login script stderr:', data.toString());
    });
    
    proc.on('close', (code) => {
      console.log(`Login script process closed with code: ${code}`);
      console.log(`Total stdout: ${output}`);
      console.log(`Total stderr: ${errorOutput}`);
      
      if (code === 0) {
        console.log('Login script completed successfully');
        resolve({ success: true });
      } else {
        console.log(`Login script failed with code: ${code}`);
        resolve({ 
          success: false, 
          error: errorOutput || `Login script failed with exit code ${code}` 
        });
      }
    });

    proc.on('error', (error) => {
      console.error('Login script spawn error:', error);
      resolve({ 
        success: false, 
        error: `Failed to run login script: ${error.message}` 
      });
    });
  });
}

/**
 * Capture session data from the logged-in session using auth state file
 */
async function captureSessionDataFromAuthState(loginUrl: string): Promise<any> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Load the auth state file created by the login script
    const authStatePath = path.join(process.cwd(), 'auth-state.json');
    console.log(`Loading auth state from: ${authStatePath}`);
    
    if (!require('fs').existsSync(authStatePath)) {
      throw new Error('Auth state file not found. Login script must run first.');
    }

    // Create context with the saved auth state
    context = await browser.newContext({ storageState: authStatePath });
    const page = await context.newPage();

    console.log(`Capturing session data from logged-in session: ${loginUrl}`);

    // Navigate to the login URL (should redirect to dashboard if logged in)
    await page.goto(loginUrl);
    await page.waitForLoadState('networkidle');

    // Wait a bit for any redirects or session establishment
    await page.waitForTimeout(3000);

    // Capture cookies from the logged-in session
    let cookies = await context.cookies();
    console.log(`Cookies captured from logged-in session: ${cookies.length}`);
    
    // If no cookies with expiration found, wait a bit more and try again
    const cookiesWithExpiration = cookies.filter(cookie => 
      cookie.expires !== -1 && cookie.expires !== undefined
    );
    
    if (cookiesWithExpiration.length === 0) {
      console.log('No cookies with expiration found initially, waiting longer...');
      await page.waitForTimeout(5000); // Wait 5 more seconds
      cookies = await context.cookies();
      console.log(`Cookies after additional wait: ${cookies.length}`);
    }
    
    // Log the full cookie structure to see what fields are available
    console.log('Full cookie structure:', JSON.stringify(cookies, null, 2));
    
    // Log each cookie individually for better debugging
    cookies.forEach((cookie, index) => {
      console.log(`Cookie ${index + 1}:`, {
        name: cookie.name,
        domain: cookie.domain,
        expires: cookie.expires,
        expiresDate: cookie.expires ? new Date(cookie.expires * 1000).toISOString() : 'No expiration',
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        path: cookie.path
      });
    });
    
    // Extract cookie expiration information from the actual cookie structure
    const cookieExpirations = cookies
      .filter(cookie => {
        // Filter out session cookies (no expiration) and cookies without expiration
        return cookie.expires !== -1 && cookie.expires !== undefined;
      })
      .map(cookie => {
        // Convert Unix timestamp to ISO date
        const expiresDate = cookie.expires ? new Date(cookie.expires * 1000).toISOString() : null;
        return {
          name: cookie.name,
          domain: cookie.domain,
          expires: cookie.expires,
          expiresDate: expiresDate,
          rawCookie: cookie // Include full cookie for debugging
        };
      });

    // Find the earliest expiration time
    const validExpirations = cookieExpirations.filter(c => c.expires && c.expires !== -1);
    const earliestExpiration = validExpirations.length > 0 
      ? Math.min(...validExpirations.map(c => c.expires))
      : null;

    const sessionData = { 
      cookies,
      cookieExpirations,
      earliestExpiration,
      earliestExpirationDate: earliestExpiration ? new Date(earliestExpiration * 1000).toISOString() : null
    };

    console.log(`Captured ${cookies.length} cookies from logged-in session`);
    console.log(`Cookies with expiration:`, cookieExpirations.length);
    cookieExpirations.forEach(cookie => {
      console.log(`  - ${cookie.name}: expires ${cookie.expiresDate}`);
    });
    console.log(`Earliest expiration: ${sessionData.earliestExpirationDate}`);

    return sessionData;

  } catch (error) {
    console.error('Error capturing session data from auth state:', error);
    throw new Error(`Failed to capture session data from auth state: ${error}`);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
} 