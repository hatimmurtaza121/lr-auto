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
    
    const { data: gameCredential, error: credentialError } = await supabase
      .from('game_credential')
      .select(`
        id,
        game:game_id (*)
      `)
      .eq('team_id', parseInt(teamId))
      .eq('game_id', game.id)
      .single();

    if (credentialError || !gameCredential) {
      console.error(`Game credential not found for team ${teamId} and game ${gameName}`);
      console.error('Credential error:', credentialError);
      return NextResponse.json({ 
        error: 'Game credentials not found for this team',
        details: `Team ID: ${teamId}, Game: ${gameName}`
      }, { status: 404 });
    }

    // Parse request body
    const { action, params } = await request.json();

    console.log('Adding action to queue:', action, 'with params:', params);

    // Create job data
    const jobData: JobData = {
      userId: user.id,
      gameCredentialId: gameCredential.id,
      action,
      params: params || {},
      teamId: parseInt(teamId),
      gameName: request.headers.get('x-game-name') || '',
    };

    // Add job to queue
    const jobId = await ActionProducer.addJob(jobData);

    console.log('Job added to queue with ID:', jobId);

    return NextResponse.json({
      success: true,
      jobId,
      message: `Action ${action} has been queued for execution`,
      data: {
        action,
        status: 'queued',
        jobId
      }
    });

  } catch (error) {
    console.error('Error executing action:', error);
    return NextResponse.json({
      error: 'Failed to execute action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 