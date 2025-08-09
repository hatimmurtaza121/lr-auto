import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    const supabase = createClient(cookies());
    
    const { data: actions, error } = await supabase
      .from('actions')
      .select('*')
      .eq('game_id', parseInt(gameId))
      .order('name');

    if (error) {
      console.error('Error fetching actions:', error);
      return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 });
    }

    return NextResponse.json({ actions: actions || [] });

  } catch (error) {
    console.error('Error in actions GET:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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
    const { gameId, name, inputsJson } = body;
    // Accept either display_name or displayName from clients
    const display_name: string | undefined = body.display_name ?? body.displayName;

    if (!gameId || !name) {
      return NextResponse.json({ error: 'Game ID and name are required' }, { status: 400 });
    }

    // Validate name format (snake_case)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return NextResponse.json({ 
        error: 'Action name must be in snake_case format (e.g., "new_account", "ban_user")' 
      }, { status: 400 });
    }

    const supabase = createClient(cookies());
    
    // Check if action already exists for this game
    const { data: existingAction } = await supabase
      .from('actions')
      .select('id')
      .eq('game_id', parseInt(gameId))
      .eq('name', name)
      .single();

    if (existingAction) {
      return NextResponse.json({ error: 'Action with this name already exists for this game' }, { status: 409 });
    }

    // Create new action
    const { data: newAction, error } = await supabase
      .from('actions')
      .insert({
        game_id: parseInt(gameId),
        name,
        display_name: display_name || null,
        inputs_json: inputsJson || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating action:', error);
      return NextResponse.json({ error: 'Failed to create action' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      action: newAction,
      message: 'Action created successfully'
    });

  } catch (error) {
    console.error('Error in actions POST:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
