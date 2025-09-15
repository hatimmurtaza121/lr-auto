'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Loader from '@/components/Loader';
import { getSelectedTeamId } from '@/utils/team';

interface GameInsight {
  game_id: number;
  game_name: string;
  success_rate: number;
  avg_execution_time: number;
  total_requests: number;
}

interface TeamInsight {
  id: number;
  name: string;
  gameInsights: GameInsight[];
}

export default function InsightsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [gameInsights, setGameInsights] = useState<GameInsight[]>([]);
  const [allTeamsInsights, setAllTeamsInsights] = useState<TeamInsight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [loadingAllTeams, setLoadingAllTeams] = useState(false);
  const [summaryMetrics, setSummaryMetrics] = useState({
    captchaSuccessRate: 0,
    overallSuccessRate: 0,
    avgExecutionTime: 0
  });

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
          fetchGameInsights(selectedTeamId);
          fetchSummaryMetrics();
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

  const fetchGameInsights = async (teamId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch insights data
      const response = await fetch(`/api/insights?teamId=${teamId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const result = await response.json();
      setGameInsights(result.data || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching game insights:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch insights');
    }
  };

  const fetchSummaryMetrics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch summary metrics
      const response = await fetch('/api/insights/summary', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch summary metrics');
      }

      const result = await response.json();
      setSummaryMetrics(result.data || {
        captchaSuccessRate: 0,
        overallSuccessRate: 0,
        avgExecutionTime: 0
      });
    } catch (error) {
      console.error('Error fetching summary metrics:', error);
      // Set default values on error
      setSummaryMetrics({
        captchaSuccessRate: 0,
        overallSuccessRate: 0,
        avgExecutionTime: 0
      });
    }
  };

  const fetchAllTeamsInsights = async () => {
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

      // Fetch insights for all teams in parallel
      const teamInsightsPromises = allTeams.map(async (team: any) => {
        try {
          const response = await fetch(`/api/insights?teamId=${team.id}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          let insightsData: GameInsight[] = [];
          if (response.ok) {
            const result = await response.json();
            insightsData = result.data || [];
          }

          return {
            id: team.id,
            name: team.name,
            gameInsights: insightsData
          };
        } catch (error) {
          console.error(`Error fetching insights for team ${team.id}:`, error);
          return {
            id: team.id,
            name: team.name,
            gameInsights: []
          };
        }
      });

      // Wait for all team insights requests to complete
      const teamsData = await Promise.all(teamInsightsPromises);
      setAllTeamsInsights(teamsData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching all teams insights:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch all teams insights');
    } finally {
      setLoadingAllTeams(false);
    }
  };

  // Manual refresh only - no auto-refresh for insights page

  // Handle manual refresh
  const handleRefresh = () => {
    fetchSummaryMetrics(); // Always refresh summary metrics
    if (showAllTeams) {
      fetchAllTeamsInsights();
    } else {
      const teamId = getSelectedTeamId();
      if (teamId) {
        fetchGameInsights(teamId);
      }
    }
  };

  // Handle toggle between current team and all teams
  const handleToggleView = () => {
    const newShowAllTeams = !showAllTeams;
    setShowAllTeams(newShowAllTeams);
    
    if (newShowAllTeams) {
      // Switching to all teams view - show loader
      fetchAllTeamsInsights();
    } else {
      // Switching to current team view
      const teamId = getSelectedTeamId();
      if (teamId) {
        fetchGameInsights(teamId);
      }
    }
  };

  // Helper function to get color class for success rate
  const getSuccessRateColor = (rate: number) => {
    if (rate === 0) return 'text-gray-500 bg-gray-50';
    if (rate >= 70) return 'text-green-600 bg-green-50';
    if (rate >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Helper function to get color class for execution time
  const getExecutionTimeColor = (time: number) => {
    if (time === 0) return 'text-gray-500 bg-gray-50';
    if (time < 20) return 'text-green-600 bg-green-50';
    if (time < 30) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Helper function to get color class for success rate
  const getSuccessRateSummaryColor = (rate: number) => {
    if (rate === 0) return 'text-gray-500';
    if (rate >= 70) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Helper function to get color class for execution time summary
  const getExecutionTimeSummaryColor = (time: number) => {
    if (time === 0) return 'text-gray-500';
    if (time < 20) return 'text-green-600';
    if (time < 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return <Loader message="Loading insights..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Insights</h1>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
                  title="Refresh data"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={handleToggleView}
                  className="px-3 py-2 text-sm sm:text-base text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
                >
                  {showAllTeams ? 'Show Current Team' : 'Show All Teams'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                <span>Last updated:</span>
                <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
          <p className="text-gray-600 text-base sm:text-lg">Performance analytics and metrics</p>
          
          {/* Summary Metrics */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-m text-gray-500 mb-1">CAPTCHA Success Rate</div>
              <div className={`text-2xl font-bold ${getSuccessRateSummaryColor(summaryMetrics.captchaSuccessRate)}`}>
                {summaryMetrics.captchaSuccessRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-m text-gray-500 mb-1">Overall Success Rate</div>
              <div className={`text-2xl font-bold ${getSuccessRateSummaryColor(summaryMetrics.overallSuccessRate)}`}>
                {summaryMetrics.overallSuccessRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-m text-gray-500 mb-1">Avg Execution Time</div>
              <div className={`text-2xl font-bold ${getExecutionTimeSummaryColor(summaryMetrics.avgExecutionTime)}`}>
                {summaryMetrics.avgExecutionTime.toFixed(1)}s
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {/* Insights Content */}
        {loadingAllTeams ? (
          /* Loading All Teams */
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader 
              message="Loading all teams insights..." 
              className="!h-auto !bg-transparent !p-0"
            />
          </div>
        ) : showAllTeams ? (
          /* All Teams View */
          <div className="space-y-8">
            {allTeamsInsights.map((team) => (
              <div key={team.id} className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">
                  {team.name}
                </h2>
                
                {/* Insights Table */}
                <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead className="bg-white border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                            Game Name
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                            Success Rate
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                            Avg Execution Time
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                            Total Requests
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {team.gameInsights.length > 0 ? (
                          team.gameInsights.map((insight) => (
                            <tr key={insight.game_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {insight.game_name}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${getSuccessRateColor(insight.success_rate)}`}>
                                  {insight.success_rate.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${getExecutionTimeColor(insight.avg_execution_time)}`}>
                                  {insight.avg_execution_time.toFixed(1)}s
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {insight.total_requests.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                              No insights data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
            
            {/* Insights Table */}
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-white border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Game Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Success Rate
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Avg Execution Time
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Total Requests
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {gameInsights.length > 0 ? (
                      gameInsights.map((insight) => (
                        <tr key={insight.game_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {insight.game_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${getSuccessRateColor(insight.success_rate)}`}>
                              {insight.success_rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${getExecutionTimeColor(insight.avg_execution_time)}`}>
                              {insight.avg_execution_time.toFixed(1)}s
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {insight.total_requests.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                          No insights data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
