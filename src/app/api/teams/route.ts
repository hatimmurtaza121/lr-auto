import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (teamId) {
      // If teamId is provided, fetch games for that team
      const { data: games, error: gamesError } = await supabase
        .from('game')
        .select('id, name, login_url, dashboard_url')
        .order('name');

      if (gamesError) {
        console.error('Error fetching games:', gamesError);
        return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
      }

      return NextResponse.json({ games: games });
    } else {
      // Fetch all teams from the database
      const { data, error } = await supabase
        .from('team')
        .select('id, code, name, created_at')
        .order('name');

      if (error) {
        console.error('Error fetching teams:', error);
        return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
      }

      return NextResponse.json({ teams: data });
    }
  } catch (error) {
    console.error('Error in teams API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 