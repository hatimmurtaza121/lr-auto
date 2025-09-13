import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { ActionProducer } from '@/queue/producers/action-producer';
import { JobData } from '@/queue/types/job-types';
import { getSelectedTeamId } from '@/utils/team';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get team ID from headers
    const teamId = request.headers.get('x-team-id');
    // console.log('Execute-login API - received team ID:', teamId);
    if (!teamId) {
      return NextResponse.json({ error: 'Team ID required' }, { status: 400 });
    }

    // Get game credentials for this team and game
    const { createClient } = await import('@/lib/supabase/server');
    const { cookies } = await import('next/headers');
    const supabase = createClient(cookies());
    
    // Get game ID first
    const { getGame } = await import('@/utils/game-mapping');
    const gameName = request.headers.get('x-game-name');
    if (!gameName) {
      return NextResponse.json({ error: 'Game name is required' }, { status: 400 });
    }
    
    const game = await getGame(gameName);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Get request body for credentials
    const requestBody = await request.json().catch(() => ({}));
    const { username, password } = requestBody;
    
    // Check if credentials exist for this team and game
    let gameCredential = null;
    const { data: existingCredential, error: credentialError } = await supabase
      .from('game_credential')
      .select(`
        id,
        game:game_id (*)
      `)
      .eq('team_id', parseInt(teamId))
      .eq('game_id', game.id)
      .single();

    if (existingCredential) {
      // Use existing credentials
      gameCredential = existingCredential;
      // console.log(`Using existing game credential: ${gameCredential.id} for team ${teamId} and game ${gameName}`);
    } else {
      // Create new credential record with provided credentials or empty values
      // console.log(`No existing credentials found for team ${teamId} and game ${gameName}, creating new record`);
      
      const { data: newCredential, error: createError } = await supabase
        .from('game_credential')
        .insert({
          team_id: parseInt(teamId),
          game_id: game.id,
          user_id: user.id,
          username: username || '',
          password: password || '',
          created_at: new Date().toISOString()
        })
        .select(`
          id,
          game:game_id (*)
        `)
        .single();

      if (createError) {
        console.error('Failed to create game credential:', createError);
        return NextResponse.json({ 
          error: 'Failed to create game credential',
          details: createError.message
        }, { status: 500 });
      }

      gameCredential = newCredential;
      // console.log(`Created new game credential: ${gameCredential.id} for team ${teamId} and game ${gameName}`);
    }

    // Create job data for login action
    const jobData: JobData = {
      userId: user.id,
      gameCredentialId: gameCredential.id,
      action: 'login',
      params: { username, password }, // Pass credentials to the job
      teamId: parseInt(teamId),
      gameId: game.id, // Game ID used for both filtering and platform grouping
      gameName: gameName,
      sessionId: `login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Add job to queue
    const jobId = await ActionProducer.addJob(jobData);
    
    // console.log(`Login job added to queue with ID: ${jobId}`);

    return NextResponse.json({
      success: true,
      message: 'Login job added to queue',
      jobId: jobId
    });

  } catch (error) {
    console.error('Error adding login job to queue:', error);
    return NextResponse.json(
      { 
        error: 'Failed to add login job to queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 