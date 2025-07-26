'use client';

import { useState, useEffect } from 'react';
import GameWidget from '@/components/GameWidget';
import BrowserView from '@/components/BrowserView';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@mui/material';
import Navbar from '@/components/Navbar';
import { getSelectedTeamId } from '@/utils/team';
import { getAllGames, getTeamGameCredentials } from '@/utils/game-mapping';

interface Game {
  id: number;
  name: string;
  login_url: string;
  created_at: string;
}

interface GameCredential {
  id: number;
  team_id: number;
  game_id: number;
  username: string;
  password: string;
  created_at: string;
  game: Game;
}

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [gameCredentials, setGameCredentials] = useState<GameCredential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentLog, setCurrentLog] = useState<string>('');
  const [allLogs, setAllLogs] = useState<string[]>([]);

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/main_login');
          return;
        }

        // Check if user has selected a team
        const selectedTeamId = getSelectedTeamId();
        if (!selectedTeamId) {
          router.replace('/choose-team');
          return;
        }

        // WebSocket server is now initialized in action-wrappers.ts

        // Fetch all available games
        const allGames = await getAllGames();
        if (allGames.length === 0) {
          console.error('No games found in database. Please seed the game table first.');
          setError('No games found. Please contact administrator.');
        }
        setGames(allGames);

        // Fetch team's game credentials
        const credentials = await getTeamGameCredentials(selectedTeamId);
        setGameCredentials(credentials);

        setLoading(false);
      } catch (error) {
        console.error('Error initializing dashboard:', error);
        setError('Failed to load dashboard. Please refresh the page.');
        setLoading(false);
      }
    };

    initializeDashboard();
  }, [router, supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/main_login');
  };

  const handleLogUpdate = (currentLog: string, allLogs: string[]) => {
    setCurrentLog(currentLog);
    setAllLogs(allLogs);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 font-system">
        <Navbar />
        <div className="container mx-auto px-4 pt-20 pb-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Create game widgets for all available games
  const gameWidgets = games.map((game) => {
    // Find if this team has credentials for this game
    const credential = gameCredentials.find(c => c.game_id === game.id);

    // Format display name: remove "scripts_" prefix and replace underscores with spaces
    const displayName = game.name
      .replace(/^scripts_/, '') // Remove "scripts_" prefix
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word

            return (
                      <GameWidget
              key={game.id}
              gameName={game.name} // Use database name directly for API calls
              displayName={displayName} // Use formatted name for display
              hasCredentials={!!credential}
              credential={credential}
              onExecutionStart={() => {
                console.log('Dashboard: Execution started');
                setIsExecuting(true);
                setCurrentLog('');
                setAllLogs([]);
              }}
              onExecutionEnd={() => {
                console.log('Dashboard: Execution ended');
                setIsExecuting(false);
              }}
              onLogUpdate={handleLogUpdate}
            />
        );
  });

  return (
    <div className="min-h-screen bg-gray-300 font-system">
      <Navbar />
      <div className="w-full px-4 pt-20 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
          {/* Left Column - Game Widgets */}
          <div className="overflow-y-auto px-4">
            <div className="space-y-6 max-w-4xl mx-auto">
              {gameWidgets}
            </div>
          </div>
          
          {/* Right Column - Browser View */}
          <div className="h-full">
            <BrowserView 
              isExecuting={isExecuting} 
              currentLog={currentLog}
              allLogs={allLogs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}