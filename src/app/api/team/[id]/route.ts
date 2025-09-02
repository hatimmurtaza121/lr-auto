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

    const teamId = parseInt(params.id);
    if (isNaN(teamId)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, code } = body;

    // Validate required fields
    if (!name || !code) {
      return NextResponse.json(
        { error: 'Team name and code are required' },
        { status: 400 }
      );
    }

    // Check if team exists
    const supabase = createAdminClient();
    const { data: existingTeam, error: checkError } = await supabase
      .from('team')
      .select('id')
      .eq('id', teamId)
      .single();

    if (checkError) {
      console.error('Error checking team existence:', checkError);
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if new code conflicts with other teams
    const { data: conflictingTeam, error: conflictError } = await supabase
      .from('team')
      .select('id')
      .eq('code', code)
      .neq('id', teamId)
      .single();

    if (conflictError && conflictError.code !== 'PGRST116') {
      console.error('Error checking code conflict:', conflictError);
      return NextResponse.json({ error: 'Failed to check code conflict' }, { status: 500 });
    }

    if (conflictingTeam) {
      return NextResponse.json(
        { error: 'Team code already exists' },
        { status: 409 }
      );
    }

    // Update team
    const { data: updatedTeam, error } = await supabase
      .from('team')
      .update({ name, code })
      .eq('id', teamId)
      .select('id, code, name, created_at')
      .single();

    if (error) {
      console.error('Error updating team:', error);
      return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
    }

    return NextResponse.json(updatedTeam);
  } catch (error) {
    console.error('Error in team update API:', error);
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

    const teamId = parseInt(params.id);
    if (isNaN(teamId)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    // Check if team exists
    const supabase = createAdminClient();
    const { data: existingTeam, error: checkError } = await supabase
      .from('team')
      .select('id')
      .eq('id', teamId)
      .single();

    if (checkError) {
      console.error('Error checking team existence:', checkError);
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Delete team (this will cascade to related records due to CASCADE constraint)
    const { error } = await supabase
      .from('team')
      .delete()
      .eq('id', teamId);

    if (error) {
      console.error('Error deleting team:', error);
      return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error in team deletion API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
