import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { createAdminClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const gameId = parseInt(params.id);
    if (isNaN(gameId)) {
      return NextResponse.json({ error: 'Invalid game ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, login_url, dashboard_url } = body;

    // Validate required fields
    if (!name || !login_url) {
      return NextResponse.json(
        { error: 'Game name and login URL are required' },
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

    if (dashboard_url) {
      try {
        new URL(dashboard_url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid dashboard URL format' },
          { status: 400 }
        );
      }
    }

    // Check if game exists
    const supabase = createAdminClient();
    const { data: existingGame, error: checkError } = await supabase
      .from('game')
      .select('id')
      .eq('id', gameId)
      .single();

    if (checkError) {
      console.error('Error checking game existence:', checkError);
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }



    // Update game
    const gameData = {
      name,
      login_url,
      dashboard_url: dashboard_url || login_url
    };

    const { data: updatedGame, error } = await supabase
      .from('game')
      .update(gameData)
      .eq('id', gameId)
      .select('id, name, login_url, dashboard_url, created_at')
      .single();

    if (error) {
      console.error('Error updating game:', error);
      return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
    }

    return NextResponse.json(updatedGame);
  } catch (error) {
    console.error('Error in game update API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const gameId = parseInt(params.id);
    if (isNaN(gameId)) {
      return NextResponse.json({ error: 'Invalid game ID' }, { status: 400 });
    }

    // Check if game exists
    const supabase = createAdminClient();
    const { data: existingGame, error: checkError } = await supabase
      .from('game')
      .select('id')
      .eq('id', gameId)
      .single();

    if (checkError) {
      console.error('Error checking game existence:', checkError);
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Delete game (this will cascade to related records due to 'CASCADE constraint)
    const { error } = await supabase
      .from('game')
      .delete()
      .eq('id', gameId);

    if (error) {
      console.error('Error deleting game:', error);
      return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error in game deletion API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
