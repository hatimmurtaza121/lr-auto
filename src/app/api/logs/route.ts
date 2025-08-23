import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserSession } from '@/utils/api-helpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Fetch all logs for the specified team, ordered by most recent first
    const { data, error } = await supabase
      .from('game_action_status')
      .select(`
        id,
        team_id,
        game_id,
        action,
        status,
        message,
        inputs,
        execution_time_secs,
        updated_at,
        game:game_id (
          id,
          name,
          login_url
        )
      `)
      .eq('team_id', parseInt(teamId))
      .order('updated_at', { ascending: false });

    // Now fetch action display names separately
    const { data: actionsData, error: actionsError } = await supabase
      .from('actions')
      .select('name, display_name');

    if (actionsError) {
      console.error('Error fetching actions:', actionsError);
      // Continue without action display names
    }

    // Create a map of action names to display names
    const actionDisplayMap = new Map();
    if (actionsData) {
      actionsData.forEach((action: any) => {
        actionDisplayMap.set(action.name, action.display_name);
      });
    }

    if (error) {
      console.error('Error fetching logs:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch logs',
        details: error.message 
      }, { status: 500 });
    }

    // Transform the data to include game and action information
    const logs = data?.map((log: any) => ({
      id: log.id,
      team_id: log.team_id,
      game_id: log.game_id,
      action: log.action,
      action_display_name: actionDisplayMap.get(log.action) || log.action,
      status: log.status,
      message: log.message || null,
      inputs: log.inputs,
      execution_time_secs: log.execution_time_secs,
      updated_at: log.updated_at,
      game_name: log.game?.name || 'Unknown Game',
      game_login_url: log.game?.login_url || ''
    })) || [];

    return NextResponse.json({
      success: true,
      logs: logs
    });

  } catch (error) {
    console.error('Error in logs API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
