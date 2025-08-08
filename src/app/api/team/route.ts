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
      // If teamId is provided, fetch specific team
      const { data: team, error } = await supabase
        .from('team')
        .select('id, code, name, created_at')
        .eq('id', teamId)
        .single();

      if (error) {
        console.error('Error fetching team:', error);
        return NextResponse.json({ error: 'Team not found' }, { status: 404 });
      }

      return NextResponse.json({ team });
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code } = body;

    // Validate required fields
    if (!name || !code) {
      return NextResponse.json(
        { error: 'Team name and code are required' },
        { status: 400 }
      );
    }

    // Check if team code already exists
    const { data: existingTeam, error: checkError } = await supabase
      .from('team')
      .select('id')
      .eq('code', code)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing team:', checkError);
      return NextResponse.json({ error: 'Failed to check existing team' }, { status: 500 });
    }

    if (existingTeam) {
      return NextResponse.json(
        { error: 'Team code already exists' },
        { status: 409 }
      );
    }

    // Insert new team
    const { data: newTeam, error } = await supabase
      .from('team')
      .insert([{ name, code }])
      .select('id, code, name, created_at')
      .single();

    if (error) {
      console.error('Error creating team:', error);
      return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }

    return NextResponse.json(newTeam, { status: 201 });
  } catch (error) {
    console.error('Error in team creation API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
