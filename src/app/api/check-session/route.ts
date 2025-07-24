import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserSession, getTeamContextFromRequest } from '@/utils/api-helpers';
import { getGameCredential } from '@/utils/game-mapping';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    
    // Get team context
    const { teamId } = await getTeamContextFromRequest(request);
    
    // Get game name from query params
    const { searchParams } = new URL(request.url);
    const gameName = searchParams.get('gameName');
    
    if (!gameName) {
      return NextResponse.json({ error: 'Game name is required' }, { status: 400 });
    }

    console.log(`Checking session for user ${user.id}, team ${teamId}, game ${gameName}`);

    // Get game credential for this team and game
    const gameCredential = await getGameCredential(gameName, teamId);
    
    if (!gameCredential) {
      console.log(`No game credential found for game ${gameName} in team ${teamId}`);
      return NextResponse.json({
        hasSession: false,
        hasCredentials: false
      });
    }

    console.log(`Found game credential: ${gameCredential.game.name} (ID: ${gameCredential.id})`);

    // Check for existing active session for this game credential
    const { data: session, error } = await supabase
      .from('session')
      .select(`
        id,
        session_token,
        session_data,
        is_active,
        expires_at,
        created_at,
        game_credential:game_credential_id (
          id,
          username,
          password,
          game:game_id (
            id,
            name,
            login_url
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('game_credential_id', gameCredential.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as any;

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking session:', error);
      return NextResponse.json({ error: 'Failed to check session' }, { status: 500 });
    }

    if (session) {
      // Check if session has expired
      const now = new Date();
      const expiresAt = session.expires_at ? new Date(session.expires_at) : null;
      
      if (expiresAt && now > expiresAt) {
        console.log(`Session for game ${gameName} has expired at ${expiresAt}`);
        
        // Mark session as inactive
        await supabase
          .from('session')
          .update({ is_active: false })
          .eq('id', session.id);
        
        return NextResponse.json({
          hasSession: false,
          hasCredentials: true,
          username: gameCredential.username,
          password: gameCredential.password
        });
      }
      
      console.log(`Found active session for game ${gameName}:`, session);
      console.log(`Session expires at: ${expiresAt}`);
      
      return NextResponse.json({
        hasSession: true,
        hasCredentials: true,
        sessionToken: session.session_token,
        sessionData: session.session_data,
        gameName: session.game_credential?.game?.name,
        username: session.game_credential?.username,
        loginUrl: session.game_credential?.game?.login_url,
        createdAt: session.created_at,
        expiresAt: session.expires_at
      });
    } else {
      console.log(`No active session found for game ${gameName}`);
      return NextResponse.json({
        hasSession: false,
        hasCredentials: true,
        username: gameCredential.username,
        password: gameCredential.password
      });
    }

  } catch (error) {
    console.error('Check session error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check session', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 