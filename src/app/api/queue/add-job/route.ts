import { NextRequest, NextResponse } from 'next/server';
import { ActionProducer } from '@/queue/producers/action-producer';
import { JobData } from '@/queue/types/job-types';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const { createClient } = await import('@/lib/supabase/server');
    const { cookies } = await import('next/headers');
    const supabase = createClient(cookies());
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get team ID from headers
    const teamId = request.headers.get('x-team-id');
    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    // Parse request body
    const { action, gameName, params } = await request.json();

    if (!action || !gameName) {
      return NextResponse.json({ 
        error: 'Action and gameName are required' 
      }, { status: 400 });
    }

    // Get game credential ID from database
    const { data: gameCredential, error: gameError } = await supabase
      .from('game_credentials')
      .select('id')
      .eq('game_name', gameName)
      .eq('team_id', teamId)
      .single();

    if (gameError || !gameCredential) {
      return NextResponse.json({ 
        error: 'Game credential not found' 
      }, { status: 404 });
    }

    // Get game ID for platform grouping
    const { data: game, error: gameQueryError } = await supabase
      .from('game')
      .select('id')
      .eq('name', gameName)
      .single();

    if (gameQueryError || !game) {
      return NextResponse.json({ 
        error: 'Game not found' 
      }, { status: 404 });
    }

    // Create job data
    const jobData: JobData = {
      userId: user.id,
      gameCredentialId: gameCredential.id,
      action,
      params: params || {},
      teamId: parseInt(teamId),
      gameId: game.id, // Game ID used for both filtering and platform grouping
      gameName,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`, // Generate session ID
    };

    // Validate action type - allow any action name since they're dynamic
    if (!action || typeof action !== 'string') {
      return NextResponse.json({ 
        error: 'Valid action name is required' 
      }, { status: 400 });
    }

    // Add job to queue
    const jobId = await ActionProducer.addJob(jobData);

    return NextResponse.json({
      success: true,
      jobId,
      message: `Job added to ${action} queue`,
      data: {
        action,
        gameName,
        status: 'queued'
      }
    });

  } catch (error) {
    console.error('Error adding job to queue:', error);
    return NextResponse.json({
      error: 'Failed to add job to queue',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 