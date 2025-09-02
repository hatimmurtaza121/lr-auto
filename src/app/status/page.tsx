'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Loader from '@/components/Loader';
import { getSelectedTeamId } from '@/utils/team';

interface GameStatus {
  game_id: number;
  game_name: string;
  login_url: string;
  actions: {
    [key: string]: {
      status: 'success' | 'fail' | 'unknown';
      updated_at: string;
    };
  };
}

interface TeamData {
  id: number;
  name: string;
  gameStatuses: GameStatus[];
}

// Status configuration for different status types



const statusConfig = {
  success: {
    color: 'bg-success-500',
    textColor: 'text-success-700',
    bgColor: 'bg-success-50',
    borderColor: 'border-success-200',
    icon: (
      <svg className="w-5 h-5 text-success-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    )
  },
  fail: {
    color: 'bg-error-500',
    textColor: 'text-error-700',
    bgColor: 'bg-error-50',
    borderColor: 'border-error-200',
    icon: (
      <svg className="w-5 h-5 text-error-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    )
  },
  unknown: {
    color: 'bg-gray-500',
    textColor: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: (
      <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    )
  }
};

export default function StatusPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [gameStatuses, setGameStatuses] = useState<GameStatus[]>([]);
  const [allTeamsData, setAllTeamsData] = useState<TeamData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [editingGame, setEditingGame] = useState<{teamId: number, teamName: string, gameId: number, gameName: string} | null>(null);
  const [credentials, setCredentials] = useState<{username: string, password: string}>({username: '', password: ''});
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [loadingAllTeams, setLoadingAllTeams] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/main_login');
      } else {
        // Check if user has selected a team
        const selectedTeamId = getSelectedTeamId();
        if (!selectedTeamId) {
          router.replace('/choose-team');
        } else {
          setLoading(false);
          fetchTeamName(selectedTeamId);
          fetchGameStatus(selectedTeamId);
        }
      }
    });
  }, [router, supabase.auth]);

  const fetchTeamName = async (teamId: number) => {
    try {
      const response = await fetch(`/api/team?teamId=${teamId}`);
      if (response.ok) {
        const data = await response.json();
        setTeamName(data.team.name);
      }
    } catch (error) {
      console.error('Error fetching team name:', error);
    }
  };

  const fetchGameStatus = async (teamId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch all games using the game API
      const gamesResponse = await fetch('/api/game');

      if (!gamesResponse.ok) {
        throw new Error('Failed to fetch games');
      }

      const gamesResult = await gamesResponse.json();
      const allGames = gamesResult.games || [];

      // Then, get the status data
      const statusResponse = await fetch(`/api/update-game-status?teamId=${teamId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      let statusData: GameStatus[] = [];
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        statusData = statusResult.data || [];
      }

      console.log('Raw status data from API:', JSON.stringify(statusData, null, 2));

      // Create complete game status list with unknown status for missing actions
      const completeGameStatuses = allGames.map((game: any) => {
        const existingStatus = statusData.find((status: any) => status.game_id === game.id);
        
        if (existingStatus) {
          // Ensure all 5 actions are present, fill missing ones with unknown
          const allActions = {
            login: { status: 'unknown', updated_at: new Date().toISOString() },
            new_account: { status: 'unknown', updated_at: new Date().toISOString() },
            password_reset: { status: 'unknown', updated_at: new Date().toISOString() },
            recharge: { status: 'unknown', updated_at: new Date().toISOString() },
            redeem: { status: 'unknown', updated_at: new Date().toISOString() }
          };
          
          // Merge existing status with default unknown status
          Object.assign(allActions, existingStatus.actions);
          
          return {
            ...existingStatus,
            actions: allActions
          };
        } else {
          // Create new game status with unknown for all actions
          return {
            game_id: game.id,
            game_name: game.name,
            login_url: game.login_url,
            actions: {
              login: { status: 'unknown', updated_at: new Date().toISOString() },
              new_account: { status: 'unknown', updated_at: new Date().toISOString() },
              password_reset: { status: 'unknown', updated_at: new Date().toISOString() },
              recharge: { status: 'unknown', updated_at: new Date().toISOString() },
              redeem: { status: 'unknown', updated_at: new Date().toISOString() }
            }
          };
        }
      });

      console.log('Final game statuses:', JSON.stringify(completeGameStatuses, null, 2));
      
      // Sort game statuses in descending order by game name
      const sortedGameStatuses = completeGameStatuses.sort((a: GameStatus, b: GameStatus) => 
        b.game_name.localeCompare(a.game_name)
      );
      
      setGameStatuses(sortedGameStatuses);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching game status:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch status');
    }
  };

  const fetchAllTeamsStatus = async () => {
    setLoadingAllTeams(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch all teams
      const teamsResponse = await fetch('/api/team');
      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams');
      }
      const teamsResult = await teamsResponse.json();
      const allTeams = teamsResult.teams || [];

      // Fetch all games
      const gamesResponse = await fetch('/api/game');
      if (!gamesResponse.ok) {
        throw new Error('Failed to fetch games');
      }
      const gamesResult = await gamesResponse.json();
      const allGames = gamesResult.games || [];

      // Fetch status for each team
      const teamsData: TeamData[] = [];
      
      for (const team of allTeams) {
        const statusResponse = await fetch(`/api/update-game-status?teamId=${team.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        let statusData: GameStatus[] = [];
        if (statusResponse.ok) {
          const statusResult = await statusResponse.json();
          statusData = statusResult.data || [];
        }

        // Create complete game status list for this team
        const completeGameStatuses = allGames.map((game: any) => {
          const existingStatus = statusData.find((status: any) => status.game_id === game.id);
          
          if (existingStatus) {
            // Ensure all 5 actions are present, fill missing ones with unknown
            const allActions = {
              login: { status: 'unknown', updated_at: new Date().toISOString() },
              new_account: { status: 'unknown', updated_at: new Date().toISOString() },
              password_reset: { status: 'unknown', updated_at: new Date().toISOString() },
              recharge: { status: 'unknown', updated_at: new Date().toISOString() },
              redeem: { status: 'unknown', updated_at: new Date().toISOString() }
            };
            
            // Merge existing status with default unknown status
            Object.assign(allActions, existingStatus.actions);
            
            return {
              ...existingStatus,
              actions: allActions
            };
          } else {
            // Create new game status with unknown for all actions
            return {
              game_id: game.id,
              game_name: game.name,
              login_url: game.login_url,
              actions: {
                login: { status: 'unknown', updated_at: new Date().toISOString() },
                new_account: { status: 'unknown', updated_at: new Date().toISOString() },
                password_reset: { status: 'unknown', updated_at: new Date().toISOString() },
                recharge: { status: 'unknown', updated_at: new Date().toISOString() },
                redeem: { status: 'unknown', updated_at: new Date().toISOString() }
              }
            };
          }
        });

        // Sort game statuses in descending order by game name
        const sortedGameStatuses = completeGameStatuses.sort((a: GameStatus, b: GameStatus) => 
          b.game_name.localeCompare(a.game_name)
        );

        teamsData.push({
          id: team.id,
          name: team.name,
          gameStatuses: sortedGameStatuses
        });
      }

      setAllTeamsData(teamsData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching all teams status:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch all teams status');
    } finally {
      setLoadingAllTeams(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (showAllTeams) {
        fetchAllTeamsStatus();
      } else {
        const teamId = getSelectedTeamId();
        if (teamId) {
          fetchGameStatus(teamId);
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [showAllTeams]);

  // Handle toggle between current team and all teams
  const handleToggleView = () => {
    const newShowAllTeams = !showAllTeams;
    setShowAllTeams(newShowAllTeams);
    
    if (newShowAllTeams) {
      // Switching to all teams view - show loader
      fetchAllTeamsStatus();
    } else {
      // Switching to current team view
      const teamId = getSelectedTeamId();
      if (teamId) {
        fetchGameStatus(teamId);
      }
    }
  };

  // Handle opening edit modal
  const handleEditGame = async (teamId: number, teamName: string, gameId: number, gameName: string) => {
    setEditingGame({ teamId, teamName, gameId, gameName });
    setLoadingCredentials(true);
    setCredentials({ username: '', password: '' });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch existing credentials
      const response = await fetch(`/api/credential?teamId=${teamId}&gameId=${gameId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.credentials && data.credentials.length > 0) {
          const credential = data.credentials[0];
          setCredentials({
            username: credential.username || '',
            password: credential.password || ''
          });
        }
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
    } finally {
      setLoadingCredentials(false);
    }
  };

  // Handle saving credentials
  const handleSaveCredentials = async () => {
    if (!editingGame) return;
    
    setSavingCredentials(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/credential', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          teamId: editingGame.teamId,
          gameId: editingGame.gameId,
          username: credentials.username,
          password: credentials.password
        })
      });

      if (response.ok) {
        setEditingGame(null);
        setCredentials({ username: '', password: '' });
        // Refresh the current view
        if (showAllTeams) {
          fetchAllTeamsStatus();
        } else {
          const teamId = getSelectedTeamId();
          if (teamId) {
            fetchGameStatus(teamId);
          }
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save credentials');
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
      setError('Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  // Handle closing edit modal
  const handleCloseEditModal = () => {
    setEditingGame(null);
    setCredentials({ username: '', password: '' });
  };

  if (loading) {
    return <Loader message="Loading status..." />;
  }

  // Get current team ID
  const currentTeamId = getSelectedTeamId();
  console.log('Current Team ID:', currentTeamId);
  console.log('Game Statuses:', gameStatuses);

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Status</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={handleToggleView}
                className="px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
              >
                {showAllTeams ? 'Show Current Team' : 'Show All Teams'}
              </button>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Last updated:</span>
              <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
          </div>

          <p className="text-gray-600 text-lg">Overview of action logs</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {/* Status Content */}
        {loadingAllTeams ? (
          /* Loading All Teams */
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader 
              message="Loading all teams..." 
              className="!h-auto !bg-transparent !p-0"
            />
          </div>
        ) : showAllTeams ? (
          /* All Teams View */
          <div className="space-y-8">
            {allTeamsData.map((team) => (
              <div key={team.id} className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">
                  {team.name}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {team.gameStatuses.map((gameStatus, index) => {
                    // Determine overall status based on actions
                    const actions = gameStatus.actions;
                    const hasFail = Object.values(actions).some(action => action.status === 'fail');
                    const hasSuccess = Object.values(actions).some(action => action.status === 'success');
                    const overallStatus = hasFail ? 'fail' : hasSuccess ? 'success' : 'unknown';
                    
                    const config = statusConfig[overallStatus as keyof typeof statusConfig];
                    
                    return (
                      <div 
                        key={`${team.id}-${index}`}
                        className={`card-elevated p-6 hover:shadow-ios-xl transition-all duration-200`}
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {gameStatus.game_name}
                          </h3>
                          <button
                            onClick={() => handleEditGame(team.id, team.name, gameStatus.game_id, gameStatus.game_name)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit Credentials"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* Function Status Grid */}
                        <div className="mt-4">
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(actions).map(([actionName, actionData]) => {
                              console.log('Action display:', { actionName, status: actionData.status, statusType: typeof actionData.status });
                              const actionConfig = statusConfig[actionData.status as keyof typeof statusConfig] || statusConfig.unknown;
                              console.log('Action config found:', !!actionConfig, 'Using fallback:', !statusConfig[actionData.status as keyof typeof statusConfig]);
                              const displayName = actionName === 'new_account' ? 'New Account' : 
                                                actionName === 'password_reset' ? 'Password Reset' :
                                                actionName.charAt(0).toUpperCase() + actionName.slice(1);
                              return (
                                <div key={actionName} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                  <span className="text-xs text-gray-600">
                                    {displayName}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {actionConfig.icon}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Current Team View */
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">
              {teamName}
            </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gameStatuses.map((gameStatus, index) => {
            // Determine overall status based on actions
            const actions = gameStatus.actions;
            const hasFail = Object.values(actions).some(action => action.status === 'fail');
            const hasSuccess = Object.values(actions).some(action => action.status === 'success');
            const overallStatus = hasFail ? 'fail' : hasSuccess ? 'success' : 'unknown';
            
            const config = statusConfig[overallStatus as keyof typeof statusConfig];
            
            return (
                             <div 
                 key={index}
                 className={`card-elevated p-6 hover:shadow-ios-xl transition-all duration-200`}
               >
                                                 <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {gameStatus.game_name}
                  </h3>
                  <button
                        onClick={() => {
                          const currentTeamId = getSelectedTeamId();
                          if (currentTeamId) {
                            handleEditGame(currentTeamId, teamName, gameStatus.game_id, gameStatus.game_name);
                          }
                        }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit Credentials"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                
                {/* Function Status Grid */}
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(actions).map(([actionName, actionData]) => {
                       console.log('Action display:', { actionName, status: actionData.status, statusType: typeof actionData.status });
                       const actionConfig = statusConfig[actionData.status as keyof typeof statusConfig] || statusConfig.unknown;
                       console.log('Action config found:', !!actionConfig, 'Using fallback:', !statusConfig[actionData.status as keyof typeof statusConfig]);
                       const displayName = actionName === 'new_account' ? 'New Account' : 
                                         actionName === 'password_reset' ? 'Password Reset' :
                                         actionName.charAt(0).toUpperCase() + actionName.slice(1);
                       return (
                         <div key={actionName} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                           <span className="text-xs text-gray-600">
                             {displayName}
                           </span>
                           <div className="flex items-center gap-1">
                             {actionConfig.icon}
                           </div>
                         </div>
                       );
                     })}
                  </div>
                                 </div>
              </div>
            );
          })}
        </div>
          </div>
        )}

        {/* Edit Credentials Modal */}
        {editingGame && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md mx-4 w-full relative">
              <button
                onClick={handleCloseEditModal}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Edit Game Credentials</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium">Team:</span> {editingGame.teamName}</p>
                    <p><span className="font-medium">Game:</span> {editingGame.gameName}</p>
                  </div>
                </div>

                {loadingCredentials ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader 
                      message="Loading credentials..." 
                      size={32}
                      className="!h-auto !bg-transparent !p-0"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        id="username"
                        value={credentials.username}
                        onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter username"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        value={credentials.password}
                        onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter password"
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={handleCloseEditModal}
                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveCredentials}
                        disabled={savingCredentials || !credentials.username.trim() || !credentials.password.trim()}
                        className="flex-1 px-4 py-2 text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {savingCredentials ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
} 