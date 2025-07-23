import { NextRequest, NextResponse } from 'next/server';
import { getTeamContextFromRequest, validateTeam, getUserSession } from '@/utils/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get team context from request
    const { teamId } = await getTeamContextFromRequest(request);
    
    // Validate team exists
    const team = await validateTeam(teamId);
    
    // Get user session (if authentication is required)
    // const user = await getUserSession(request);
    
    const body = await request.json();
    const { gameName, action, data } = body;

    // Example: Insert a session record with team context
    const { data: sessionData, error } = await supabase
      .from('session')
      .insert([
        {
          user_id: 'example-user-id', // In real app, use actual user ID
          game_id: 1, // In real app, get from game table based on gameName
          credentials: { username: data.username, password: data.password },
          session_token: `token_${Date.now()}`,
          session_data: { action, gameName, teamId: team.id },
          is_active: true,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        }
      ])
      .select();

    if (error) {
      console.error('Error inserting session:', error);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      session: sessionData[0],
      team: { id: team.id, name: team.name }
    });

  } catch (error: any) {
    console.error('Error in example-with-team API:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get team context from request
    const { teamId } = await getTeamContextFromRequest(request);
    
    // Validate team exists
    const team = await validateTeam(teamId);

    // Example: Get sessions for the team
    const { data: sessions, error } = await supabase
      .from('session')
      .select(`
        id,
        session_token,
        is_active,
        created_at,
        game:game_id(name)
      `)
      .eq('session_data->teamId', teamId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    return NextResponse.json({ 
      sessions,
      team: { id: team.id, name: team.name }
    });

  } catch (error: any) {
    console.error('Error in example-with-team API:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
} 