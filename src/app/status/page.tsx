'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
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
  const [error, setError] = useState<string | null>(null);

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
          fetchGameStatus(selectedTeamId);
        }
      }
    });
  }, [router, supabase.auth]);

  const fetchGameStatus = async (teamId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // First, get all games available for this team
      const gamesResponse = await fetch(`/api/teams?teamId=${teamId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

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

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const teamId = getSelectedTeamId();
      if (teamId) {
        fetchGameStatus(teamId);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-system">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
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
            <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Last updated:</span>
              <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {/* Status Grid */}
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
                                 <div className="mb-4">
                   <h3 className="text-lg font-semibold text-gray-900">
                     {gameStatus.game_name}
                   </h3>
                 </div>
                
                {/* Function Status Grid */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Actions status</h4>
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
    </div>
  );
} 