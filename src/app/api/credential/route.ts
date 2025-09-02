import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const gameId = searchParams.get('gameId');

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    let query = supabase
      .from('game_credential')
      .select(`
        id,
        team_id,
        game_id,
        user_id,
        username,
        password,
        created_at,
        game:game_id (
          id,
          name,
          login_url,
          dashboard_url
        )
      `)
      .eq('team_id', parseInt(teamId));

    // Filter by game if provided
    if (gameId) {
      query = query.eq('game_id', parseInt(gameId));
    }

    const { data: credentials, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching credentials:', error);
      return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
    }

    return NextResponse.json({ credentials: credentials || [] });
  } catch (error) {
    console.error('Error in credentials GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { teamId, gameId, username, password } = body;

    // Validate required fields
    if (!teamId || !gameId || !username || !password) {
      return NextResponse.json(
        { error: 'Team ID, Game ID, username, and password are required' },
        { status: 400 }
      );
    }

    // Validate username and password
    if (username.trim().length === 0) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    if (password.trim().length === 0) {
      return NextResponse.json({ error: 'Password cannot be empty' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if team exists
    const { data: team, error: teamError } = await supabase
      .from('team')
      .select('id')
      .eq('id', parseInt(teamId))
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if game exists
    const { data: game, error: gameError } = await supabase
      .from('game')
      .select('id')
      .eq('id', parseInt(gameId))
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Check if credential already exists for this team and game
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id, username, password')
      .eq('team_id', parseInt(teamId))
      .eq('game_id', parseInt(gameId))
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing credential:', checkError);
      return NextResponse.json({ error: 'Failed to check existing credential' }, { status: 500 });
    }

    let resultCredential;

    if (existingCredential) {
      // Update existing credential and track who updated it
      const { data: updatedCredential, error } = await supabase
        .from('game_credential')
        .update({
          username: username.trim(),
          password: password.trim(),
          user_id: user.id // Track who updated it
        })
        .eq('id', existingCredential.id)
        .select(`
          id,
          team_id,
          game_id,
          user_id,
          username,
          password,
          created_at,
          game:game_id (
            id,
            name,
            login_url,
            dashboard_url
          )
        `)
        .single();

      if (error) {
        console.error('Error updating credential:', error);
        return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 });
      }

      resultCredential = updatedCredential;
    } else {
      // Create new credential
      const credentialData = {
        team_id: parseInt(teamId),
        game_id: parseInt(gameId),
        user_id: user.id,
        username: username.trim(),
        password: password.trim()
      };

      const { data: newCredential, error } = await supabase
        .from('game_credential')
        .insert([credentialData])
        .select(`
          id,
          team_id,
          game_id,
          user_id,
          username,
          password,
          created_at,
          game:game_id (
            id,
            name,
            login_url,
            dashboard_url
          )
        `)
        .single();

      if (error) {
        console.error('Error creating credential:', error);
        return NextResponse.json({ error: 'Failed to create credential' }, { status: 500 });
      }

      resultCredential = newCredential;
    }

    return NextResponse.json(resultCredential, { status: 200 });
  } catch (error) {
    console.error('Error in credentials POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { teamId, gameId, username, password } = body;

    // Validate required fields
    if (!teamId || !gameId || !username || !password) {
      return NextResponse.json(
        { error: 'Team ID, Game ID, username, and password are required' },
        { status: 400 }
      );
    }

    // Validate username and password
    if (username.trim().length === 0) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    if (password.trim().length === 0) {
      return NextResponse.json({ error: 'Password cannot be empty' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if team exists
    const { data: team, error: teamError } = await supabase
      .from('team')
      .select('id')
      .eq('id', parseInt(teamId))
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if game exists
    const { data: game, error: gameError } = await supabase
      .from('game')
      .select('id')
      .eq('id', parseInt(gameId))
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Find existing credential for this team and game
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id')
      .eq('team_id', parseInt(teamId))
      .eq('game_id', parseInt(gameId))
      .single();

    if (checkError || !existingCredential) {
      return NextResponse.json({ error: 'Credential not found for this team and game' }, { status: 404 });
    }

    // Update credential and track who updated it
    const { data: updatedCredential, error } = await supabase
      .from('game_credential')
      .update({
        username: username.trim(),
        password: password.trim(),
        user_id: user.id // Track who updated it
      })
      .eq('id', existingCredential.id)
      .select(`
        id,
        team_id,
        game_id,
        user_id,
        username,
        password,
        created_at,
        game:game_id (
          id,
          name,
          login_url,
          dashboard_url
        )
      `)
      .single();

    if (error) {
      console.error('Error updating credential:', error);
      return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 });
    }

    return NextResponse.json(updatedCredential);
  } catch (error) {
    console.error('Error in credentials PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const gameId = searchParams.get('gameId');

    if (!teamId || !gameId) {
      return NextResponse.json({ error: 'Team ID and Game ID are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Find existing credential for this team and game
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id')
      .eq('team_id', parseInt(teamId))
      .eq('game_id', parseInt(gameId))
      .single();

    if (checkError || !existingCredential) {
      return NextResponse.json({ error: 'Credential not found for this team and game' }, { status: 404 });
    }

    // Delete credential (this will cascade to related session records due to CASCADE constraint)
    const { error } = await supabase
      .from('game_credential')
      .delete()
      .eq('id', existingCredential.id);

    if (error) {
      console.error('Error deleting credential:', error);
      return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Credential deleted successfully' });
  } catch (error) {
    console.error('Error in credentials DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
