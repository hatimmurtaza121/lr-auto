import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGameCredential, getGame } from '@/utils/game-mapping';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userId, 
      teamId, 
      gameName, 
      username, 
      password, 
      sessionData 
    } = body;

    if (!userId || !teamId || !gameName || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Saving session for game: ${gameName}, user: ${userId}, team: ${teamId}`);

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
    } else {
      // Get game to create new credential
      const game = await getGame(gameName);
      
      if (!game) {
        throw new Error(`Game not found: ${gameName}`);
      }

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
    }

    // Check if session already exists for this user and game credential
    const { data: existingSession } = await supabase
      .from('session')
      .select('id')
      .eq('user_id', userId)
      .eq('game_credential_id', gameCredentialId)
      .single();

    if (existingSession) {
      // Update existing session
      const { error: sessionError } = await supabase
        .from('session')
        .update({
          session_token: `session_${Date.now()}`,
          session_data: sessionData || {},
          is_active: true,
          expires_at: sessionData?.earliestExpirationDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', existingSession.id);

      if (sessionError) {
        throw new Error(`Failed to update session: ${sessionError.message}`);
      }

      console.log(`Updated existing session: ${existingSession.id}`);
    } else {
      // Create new session
      const { error: sessionError } = await supabase
        .from('session')
        .insert({
          user_id: userId,
          game_credential_id: gameCredentialId,
          session_token: `session_${Date.now()}`,
          session_data: sessionData || {},
          is_active: true,
          expires_at: sessionData?.earliestExpirationDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        });

      if (sessionError) {
        throw new Error(`Failed to save session: ${sessionError.message}`);
      }

      console.log('Created new session');
    }

    console.log(`Session saved successfully for game credential ${gameCredentialId}`);

    return NextResponse.json({
      success: true,
      message: 'Session saved successfully',
      gameCredentialId: gameCredentialId
    });

  } catch (error) {
    console.error('Save session error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save session', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 