import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getTeamContextFromRequest } from '@/utils/api-helpers';
import {
  createNewAccountWithSession,
  resetPasswordWithSession,
  rechargeWithSession,
  redeemWithSession,
  ActionParams
} from '@/utils/action-wrappers';
import { createClient } from '@supabase/supabase-js';
import { getGameCredential } from '@/utils/game-mapping';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    
    // Get team context
    const { teamId } = await getTeamContextFromRequest(request);
    
    // Parse request body
    const body = await request.json();
    const { 
      action, 
      gameName, 
      params 
    }: {
      action: 'newAccount' | 'passwordReset' | 'recharge' | 'redeem';
      gameName: string;
      params: ActionParams;
    } = body;

    if (!action || !gameName) {
      return NextResponse.json(
        { error: 'Action and gameName are required' },
        { status: 400 }
      );
    }

    // Get game credential for this team and game
    const gameCredential = await getGameCredential(gameName, teamId);
    
    if (!gameCredential) {
      return NextResponse.json(
        { error: 'No credentials found for this game. Please login first.' },
        { status: 404 }
      );
    }

    console.log(`Executing ${action} for user ${user.id}, game ${gameName}, team ${teamId}`);
    console.log('Parameters:', params);

    // Execute the appropriate action with session management
    let result;
    
    switch (action) {
      case 'newAccount':
        result = await createNewAccountWithSession(user.id, gameCredential.id, params);
        break;
        
      case 'passwordReset':
        result = await resetPasswordWithSession(user.id, gameCredential.id, params);
        break;
        
      case 'recharge':
        result = await rechargeWithSession(user.id, gameCredential.id, params);
        break;
        
      case 'redeem':
        result = await redeemWithSession(user.id, gameCredential.id, params);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be one of: newAccount, passwordReset, recharge, redeem' },
          { status: 400 }
        );
    }

    console.log('Action result:', result);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result
    });

  } catch (error) {
    console.error('Error executing action:', error);
    return NextResponse.json(
      { error: 'Failed to execute action', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 