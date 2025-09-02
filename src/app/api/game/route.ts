import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');

    if (gameId) {
      // If gameId is provided, fetch specific game
      const { data: game, error } = await supabase
        .from('game')
        .select('id, name, login_url, dashboard_url, created_at')
        .eq('id', gameId)
        .single();

      if (error) {
        console.error('Error fetching game:', error);
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      }

      return NextResponse.json({ game });
    } else {
      // Fetch all games from the database
      const { data, error } = await supabase
        .from('game')
        .select('id, name, login_url, dashboard_url, created_at')
        .order('name');

      if (error) {
        console.error('Error fetching games:', error);
        return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
      }

      return NextResponse.json({ games: data });
    }
  } catch (error) {
    console.error('Error in games API:', error);
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
    const { name, login_url, dashboard_url } = body;

    // Validate required fields
    if (!name || !login_url || !dashboard_url) {
      return NextResponse.json(
        { error: 'Game name, login URL, and dashboard URL are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(login_url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid login URL format' },
        { status: 400 }
      );
    }

    // Validate dashboard URL format
    try {
      new URL(dashboard_url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid dashboard URL format' },
        { status: 400 }
      );
    }

    // Check if game name already exists
    const supabase = createAdminClient();
    const { data: existingGame, error: checkError } = await supabase
      .from('game')
      .select('id')
      .eq('name', name)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing game:', checkError);
      return NextResponse.json({ error: 'Failed to check existing game' }, { status: 500 });
    }

    if (existingGame) {
      return NextResponse.json(
        { error: 'Game name already exists' },
        { status: 409 }
      );
    }

    // Insert new game
    const gameData = {
      name,
      login_url,
      dashboard_url
    };

    const { data: newGame, error } = await supabase
      .from('game')
      .insert([gameData])
      .select('id, name, login_url, dashboard_url, created_at')
      .single();

    if (error) {
      console.error('Error creating game:', error);
      return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error('Error in game creation API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
