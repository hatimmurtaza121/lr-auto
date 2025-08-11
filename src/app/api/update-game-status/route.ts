import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserSession } from '@/utils/api-helpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  // console.log(`API route called at ${new Date().toISOString()}`);
  
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { teamId, gameId, action, status, inputs, execution_time_secs } = body;

    // console.log(`Processing request: Team ${teamId}, Game ${gameId}, Action ${action}, Status ${status}`);

    // Validate required fields
    if (!teamId || !gameId || !action || !status) {
      return NextResponse.json({ 
        error: 'Missing required fields: teamId, gameId, action, status' 
      }, { status: 400 });
    }

    // Validate action - allow any action name since they're dynamic
    if (!action || typeof action !== 'string') {
      return NextResponse.json({ 
        error: 'Valid action name is required' 
      }, { status: 400 });
    }

    // Validate status
    const validStatuses = ['success', 'fail', 'unknown'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      }, { status: 400 });
    }

    // console.log(`Updating game status: Team ${teamId}, Game ${gameId}, Action ${action}, Status ${status}`);
    // if (inputs) console.log('Inputs:', inputs);
    // if (execution_time_secs) console.log('Execution time:', execution_time_secs, 'seconds');

    // Prepare insert data
    const insertData: any = {
      team_id: teamId,
      game_id: gameId,
      action: action,
      status: status,
      updated_at: new Date().toISOString()
    };

    // Add optional fields if provided
    if (inputs !== undefined) {
      insertData.inputs = inputs;
    }
    
    if (execution_time_secs !== undefined) {
      insertData.execution_time_secs = execution_time_secs;
    }

    // Insert new status record
    const { data, error } = await supabase
      .from('game_action_status')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error updating game status:', error);
      return NextResponse.json({ 
        error: 'Failed to update game status',
        details: error.message 
      }, { status: 500 });
    }

    // console.log('Game status updated successfully:', data);

    return NextResponse.json({
      success: true,
      message: 'Game status updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Error in update-game-status API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get team ID from query params
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    // console.log(`Fetching game status for team: ${teamId}`);

    // Get the latest status for each game and action for this team using the stored function
    const { data, error } = await supabase
      .rpc('get_latest_game_action_status', { team_id_param: parseInt(teamId) });

    if (error) {
      console.error('Error fetching game status:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch game status',
        details: error.message 
      }, { status: 500 });
    }

    // Group by game and get the latest status for each action
    const gameStatusMap = new Map();
    
    data?.forEach((record: any) => {
      const gameId = record.game_id;
      const action = record.action;
      
      if (!gameStatusMap.has(gameId)) {
        gameStatusMap.set(gameId, {
          game_id: gameId,
          game_name: record.game_name,
          login_url: record.game_login_url,
          actions: {}
        });
      }
      
      const gameStatus = gameStatusMap.get(gameId);
      gameStatus.actions[action] = {
        status: record.status,
        updated_at: record.updated_at,
        inputs: record.inputs,
        execution_time_secs: record.execution_time_secs
      };
    });

    const gameStatuses = Array.from(gameStatusMap.values());

    // console.log('Game statuses fetched successfully:', gameStatuses);

    return NextResponse.json({
      success: true,
      data: gameStatuses
    });

  } catch (error) {
    console.error('Error in update-game-status GET API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 