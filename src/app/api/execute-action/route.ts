import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/utils/api-helpers';
import { 
  createNewAccountWithSession, 
  resetPasswordWithSession, 
  rechargeWithSession, 
  redeemWithSession 
} from '@/utils/action-wrappers';
import { getSelectedTeamId } from '@/utils/team';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get team ID from headers
    const teamId = request.headers.get('x-team-id');
    if (!teamId) {
      return NextResponse.json({ error: 'Team ID required' }, { status: 400 });
    }

    // Get game credentials for this team and game
    const { createClient } = await import('@/lib/supabase/server');
    const { cookies } = await import('next/headers');
    const supabase = createClient(cookies());
    
    const { data: gameCredential, error: credentialError } = await supabase
      .from('game_credential')
      .select(`
        id,
        game:game_id (*)
      `)
      .eq('team_id', parseInt(teamId))
      .eq('game.name', request.headers.get('x-game-name'))
      .single();

    if (credentialError || !gameCredential) {
      return NextResponse.json({ 
        error: 'Game credentials not found for this team' 
      }, { status: 404 });
    }

    // Parse request body
    const { action, params } = await request.json();

    console.log('Executing action:', action, 'with params:', params);

    // Execute the appropriate action
    let result;
    switch (action) {
      case 'newAccount':
        result = await createNewAccountWithSession(
          user.id,
          gameCredential.id,
          params
        );
        break;
      case 'passwordReset':
        result = await resetPasswordWithSession(
          user.id,
          gameCredential.id,
          params
        );
        break;
      case 'recharge':
        result = await rechargeWithSession(
          user.id,
          gameCredential.id,
          params
        );
        break;
      case 'redeem':
        result = await redeemWithSession(
          user.id,
          gameCredential.id,
          params
        );
        break;
      default:
        return NextResponse.json({ 
          error: 'Invalid action' 
        }, { status: 400 });
    }

    console.log('Action result:', result);

    // Check if action needs login
    if (result.needsLogin) {
      return NextResponse.json({
        success: false,
        message: 'Session expired. Please login first.',
        needsLogin: true,
        gameInfo: result.gameInfo
      });
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result
    });

  } catch (error) {
    console.error('Error executing action:', error);
    return NextResponse.json({
      error: 'Failed to execute action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 