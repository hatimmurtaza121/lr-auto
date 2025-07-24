import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserSession, getTeamContextFromRequest } from '@/utils/api-helpers';

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
    const { gameName } = body;
    
    if (!gameName) {
      return NextResponse.json({ error: 'Game name is required' }, { status: 400 });
    }

    // Get game config to find the game name
    const gameConfigMap: Record<string, { name: string }> = {
      'GV': { name: 'Game Vault' },
      'OS': { name: 'Orion Stars' },
      'JW': { name: 'Juwa City' },
      'YL': { name: 'Yolo' },
      'A1': { name: 'Mr. All In One' },
      'ST': { name: 'Orion Strike' },
    };

    const gameConfig = gameConfigMap[gameName];
    if (!gameConfig) {
      return NextResponse.json({ error: 'Invalid game name' }, { status: 400 });
    }

    // First get the game ID
    const { data: game, error: gameError } = await supabase
      .from('game')
      .select('id')
      .eq('name', gameConfig.name)
      .eq('team_id', teamId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Invalidate all active sessions for this user and game
    const { error } = await supabase
      .from('session')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('game_id', game.id)
      .eq('is_active', true);

    if (error) {
      console.error('Error invalidating session:', error);
      return NextResponse.json({ error: 'Failed to logout session' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Logout session error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to logout session', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 