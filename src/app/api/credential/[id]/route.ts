import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const credentialId = parseInt(params.id);
    if (isNaN(credentialId)) {
      return NextResponse.json({ error: 'Invalid credential ID' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch specific credential
    const { data: credential, error } = await supabase
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
      .eq('id', credentialId)
      .single();

    if (error) {
      console.error('Error fetching credential:', error);
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    return NextResponse.json({ credential });
  } catch (error) {
    console.error('Error in credential GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const credentialId = parseInt(params.id);
    if (isNaN(credentialId)) {
      return NextResponse.json({ error: 'Invalid credential ID' }, { status: 400 });
    }

    const body = await request.json();
    const { username, password } = body;

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
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

    // Check if credential exists
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id, team_id, game_id')
      .eq('id', credentialId)
      .single();

    if (checkError || !existingCredential) {
      console.error('Error checking credential existence:', checkError);
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    // Update credential
    const { data: updatedCredential, error } = await supabase
      .from('game_credential')
      .update({
        username: username.trim(),
        password: password.trim()
      })
      .eq('id', credentialId)
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
    console.error('Error in credential PUT:', error);
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

    const credentialId = parseInt(params.id);
    if (isNaN(credentialId)) {
      return NextResponse.json({ error: 'Invalid credential ID' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if credential exists
    const { data: existingCredential, error: checkError } = await supabase
      .from('game_credential')
      .select('id')
      .eq('id', credentialId)
      .single();

    if (checkError || !existingCredential) {
      console.error('Error checking credential existence:', checkError);
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    // Delete credential (this will cascade to related session records due to CASCADE constraint)
    const { error } = await supabase
      .from('game_credential')
      .delete()
      .eq('id', credentialId);

    if (error) {
      console.error('Error deleting credential:', error);
      return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Credential deleted successfully' });
  } catch (error) {
    console.error('Error in credential DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
