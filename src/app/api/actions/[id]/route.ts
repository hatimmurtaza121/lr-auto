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

    const actionId = parseInt(params.id);
    if (isNaN(actionId)) {
      return NextResponse.json({ error: 'Invalid action ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, inputsJson, script_code } = body;
    // Accept either display_name or displayName from clients
    const display_name: string | undefined = body.display_name ?? body.displayName;

    if (!name) {
      return NextResponse.json({ error: 'Action name is required' }, { status: 400 });
    }

    // Validate name format (snake_case)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return NextResponse.json({ 
        error: 'Action name must be in snake_case format (e.g., "new_account", "ban_user")' 
      }, { status: 400 });
    }

    // Validate script code if provided
    if (body.script_code) {
      try {
        const { validateScriptCode } = await import('@/utils/script-executor');
        const validation = validateScriptCode(body.script_code);
        if (!validation.isValid) {
          return NextResponse.json({ 
            error: 'Invalid script code',
            details: validation.error
          }, { status: 400 });
        }
      } catch (validationError) {
        return NextResponse.json({ 
          error: 'Script validation failed',
          details: 'Could not validate script code'
        }, { status: 400 });
      }
    }

    const supabase = createAdminClient();
    
    // Check if action exists
    const { data: existingAction, error: fetchError } = await supabase
      .from('actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (fetchError || !existingAction) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    // Check if new name conflicts with another action in the same game
    if (name !== existingAction.name) {
      const { data: conflictingAction } = await supabase
        .from('actions')
        .select('id')
        .eq('game_id', existingAction.game_id)
        .eq('name', name)
        .single();

      if (conflictingAction) {
        return NextResponse.json({ error: 'Action with this name already exists for this game' }, { status: 409 });
      }
    }

    // Update action
    const { data: updatedAction, error } = await supabase
      .from('actions')
      .update({
        name,
        display_name: display_name ?? existingAction.display_name ?? null,
        inputs_json: inputsJson || null,
        script_code: script_code ?? existingAction.script_code ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', actionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating action:', error);
      return NextResponse.json({ error: 'Failed to update action' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      action: updatedAction,
      message: 'Action updated successfully'
    });

  } catch (error) {
    console.error('Error in actions PUT:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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

    const actionId = parseInt(params.id);
    if (isNaN(actionId)) {
      return NextResponse.json({ error: 'Invalid action ID' }, { status: 400 });
    }

    const supabase = createAdminClient();
    
    // Check if action exists
    const { data: existingAction, error: fetchError } = await supabase
      .from('actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (fetchError || !existingAction) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    // Delete action
    const { error } = await supabase
      .from('actions')
      .delete()
      .eq('id', actionId);

    if (error) {
      console.error('Error deleting action:', error);
      return NextResponse.json({ error: 'Failed to delete action' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Action deleted successfully'
    });

  } catch (error) {
    console.error('Error in actions DELETE:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
