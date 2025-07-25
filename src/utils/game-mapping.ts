import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Game {
  id: number;
  name: string;
  login_url: string;
  created_at: string;
}

export interface GameCredential {
  id: number;
  team_id: number;
  game_id: number;
  username: string;
  password: string;
  created_at: string;
  game: Game;
}

// Cache for game mappings
let gameCache: { [key: string]: Game } = {};
let cacheExpiry = 0;

/**
 * Get game from database by name
 */
export async function getGame(gameName: string): Promise<Game | null> {
  // Check cache first
  const now = Date.now();
  
  if (gameCache[gameName] && now < cacheExpiry) {
    return gameCache[gameName];
  }

  try {
    const { data: game, error } = await supabase
      .from('game')
      .select('*')
      .eq('name', gameName)
      .single();

    if (error || !game) {
      console.error(`Game not found: ${gameName}`);
      return null;
    }

    // Update cache
    gameCache[gameName] = game;
    cacheExpiry = now + (5 * 60 * 1000); // Cache for 5 minutes

    return game;
  } catch (error) {
    console.error('Error fetching game:', error);
    return null;
  }
}

/**
 * Get game credential for a specific team and game
 */
export async function getGameCredential(gameName: string, teamId: number): Promise<GameCredential | null> {
  try {
    const game = await getGame(gameName);
    if (!game) {
      return null;
    }

    const { data: credential, error } = await supabase
      .from('game_credential')
      .select(`
        *,
        game:game_id (*)
      `)
      .eq('team_id', teamId)
      .eq('game_id', game.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching game credential:', error);
      return null;
    }

    return credential;
  } catch (error) {
    console.error('Error fetching game credential:', error);
    return null;
  }
}

/**
 * Get game ID from game name
 */
export async function getGameId(gameName: string): Promise<number | null> {
  const game = await getGame(gameName);
  return game?.id || null;
}

/**
 * Get all available games
 */
export async function getAllGames(): Promise<Game[]> {
  try {
    const { data: games, error } = await supabase
      .from('game')
      .select('*')
      .order('name', { ascending: false });

    if (error) {
      console.error('Error fetching games:', error);
      return [];
    }

    return games || [];
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

/**
 * Get all games with credentials for a team
 */
export async function getTeamGameCredentials(teamId: number): Promise<GameCredential[]> {
  try {
    const { data: credentials, error } = await supabase
      .from('game_credential')
      .select(`
        *,
        game:game_id (*)
      `)
      .eq('team_id', teamId)
      .order('created_at');

    if (error) {
      console.error('Error fetching team game credentials:', error);
      return [];
    }

    return credentials || [];
  } catch (error) {
    console.error('Error fetching team game credentials:', error);
    return [];
  }
}

/**
 * Clear game cache
 */
export function clearGameCache() {
  gameCache = {};
  cacheExpiry = 0;
} 