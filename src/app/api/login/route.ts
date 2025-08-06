import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getGame } from '@/utils/game-mapping';
import { getUserSession, getTeamContextFromRequest } from '@/utils/api-helpers';

// In-memory session store
const sessionStore: Record<string, any> = {};

// Game URL mapping
const gameUrlMap: Record<string, { url: string; scriptDir: string }> = {
  'GV': { url: 'https://agent.gamevault999.com/login', scriptDir: 'scripts' },
  'OS': { url: 'https://orionstars.vip:8781/default.aspx', scriptDir: 'scripts' },
  'JW': { url: 'https://ht.juwa777.com/login', scriptDir: 'scripts' },
  'YL': { url: 'https://agent.yolo777.game/', scriptDir: 'scripts' },
  'A1': { url: 'https://agentserver.mrallinone777.com/', scriptDir: 'scripts' },
  'ST': { url: 'https://www.orionstrike777.com/admin/login', scriptDir: 'scripts' },
};

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user and team context
    const user = await getUserSession(request);
    const { teamId } = await getTeamContextFromRequest(request);
    
    const body = await request.json();
    const { username, password, gameName } = body;
    
    if (!username || !password || !gameName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get game from database
    const game = await getGame(gameName);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 400 });
    }

    console.log(`Logging into ${gameName} for user ${user.id}, team ${teamId}`);

    // Run the login script
    const scriptPath = `scripts/login.js`;
    const args = [username, password, game.login_url];

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('node', [scriptPath, ...args]);
        let output = '';
        let errorOutput = '';
        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
        proc.on('close', (code) => {
          if (code === 0) resolve(output);
          else reject(new Error('Login failed'));
        });
      });
      
      // Generate a session token
      const sessionToken = `${gameName}_${username}_${Date.now()}`;
      sessionStore[sessionToken] = { username, gameName, result, created: Date.now() };
      return NextResponse.json({ sessionToken });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Login failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ 
      error: 'Login failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 