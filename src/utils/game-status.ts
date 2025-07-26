import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GameStatusUpdate {
  teamId: number;
  gameId: number;
  action: 'login' | 'newaccount' | 'passwordreset' | 'recharge' | 'redeem';
  status: 'success' | 'fail' | 'unknown';
}

/**
 * Update game action status in the database
 */
export async function updateGameStatus(update: GameStatusUpdate): Promise<void> {
  try {
    console.log(`Updating game status:`, update);

    const { error } = await supabase
      .from('game_action_status')
      .insert({
        team_id: update.teamId,
        game_id: update.gameId,
        action: update.action,
        status: update.status,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating game status:', error);
      throw new Error(`Failed to update game status: ${error.message}`);
    }

    console.log('Game status updated successfully');
  } catch (error) {
    console.error('Error in updateGameStatus:', error);
    throw error;
  }
}

/**
 * Get game status for a specific team
 */
export async function getGameStatus(teamId: number) {
  try {
    const { data, error } = await supabase
      .from('game_action_status')
      .select(`
        id,
        team_id,
        game_id,
        action,
        status,
        updated_at,
        game:game_id (
          id,
          name,
          login_url
        )
      `)
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching game status:', error);
      throw new Error(`Failed to fetch game status: ${error.message}`);
    }

    // Group by game and get the latest status for each action
    const gameStatusMap = new Map();
    
    data?.forEach((record: any) => {
      const gameId = record.game_id;
      const action = record.action;
      
      if (!gameStatusMap.has(gameId)) {
        gameStatusMap.set(gameId, {
          game_id: gameId,
          game_name: record.game.name,
          login_url: record.game.login_url,
          actions: {}
        });
      }
      
      const gameStatus = gameStatusMap.get(gameId);
      if (!gameStatus.actions[action] || 
          new Date(record.updated_at) > new Date(gameStatus.actions[action].updated_at)) {
        gameStatus.actions[action] = {
          status: record.status,
          updated_at: record.updated_at
        };
      }
    });

    return Array.from(gameStatusMap.values());
  } catch (error) {
    console.error('Error in getGameStatus:', error);
    throw error;
  }
} 