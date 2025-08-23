import { createClient } from '@supabase/supabase-js';

export interface GameStatusUpdate {
  teamId: number;
  gameId: number;
  action: string;
  status: 'success' | 'fail' | 'unknown';
  inputs?: any; // Add inputs field to store action parameters
  executionTimeSecs?: number; // Add execution time field
  message?: string; // Add message field to store result messages
}

/**
 * Update game action status in the database
 */
export async function updateGameStatus(update: GameStatusUpdate): Promise<void> {
  try {
    // console.log(`Updating game status:`, update);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
    }
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error } = await supabase
      .from('game_action_status')
      .insert({
        team_id: update.teamId,
        game_id: update.gameId,
        action: update.action,
        status: update.status,
        inputs: update.inputs || null, // Save inputs field
        execution_time_secs: update.executionTimeSecs || null, // Save execution time
        message: update.message || null, // Save message field
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating game status:', error);
      throw new Error(`Failed to update game status: ${error.message}`);
    }

    // console.log('Game status updated successfully');
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
    }
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('game_action_status')
      .select(`
        id,
        team_id,
        game_id,
        action,
        status,
        inputs,
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
          inputs: record.inputs,
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