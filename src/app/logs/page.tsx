'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Loader from '@/components/Loader';
import { getSelectedTeamId } from '@/utils/team';

interface ActionLog {
  id: number;
  team_id: number;
  game_id: number;
  action: string;
  action_display_name: string;
  status: 'success' | 'fail' | 'unknown';
  message: string | null;
  inputs: any;
  execution_time_secs: number;
  updated_at: string;
  game_name: string;
  game_login_url: string;
}

export default function LogsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  
     // Search and filter states
   const [searchTerm, setSearchTerm] = useState('');
   const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'fail'>('all');
   const [gameFilter, setGameFilter] = useState<string>('all');
   const [actionFilter, setActionFilter] = useState<string>('all');
   
   // Dropdown open states
   const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
   const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
   const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(20);

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
          fetchLogs(selectedTeamId);
        }
      }
    });
  }, [router, supabase.auth]);

  const fetchLogs = async (teamId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Fetch all logs for the selected team
      const response = await fetch(`/api/logs?teamId=${teamId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const result = await response.json();
      setLogs(result.logs || []);
      setLastUpdated(new Date());
      
      // Apply initial filtering
      applyFilters(result.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch logs');
    }
  };

  // Apply filters to logs
  const applyFilters = (logsToFilter: ActionLog[]) => {
    let filtered = logsToFilter;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(log => log.status === statusFilter);
    }

    // Apply game filter
    if (gameFilter !== 'all') {
      filtered = filtered.filter(log => log.game_name === gameFilter);
    }

    // Apply action filter
    if (actionFilter !== 'all') {
      filtered = filtered.filter(log => log.action_display_name === actionFilter);
    }

    // Apply search term
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.game_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.message && log.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredLogs(filtered);
  };

  // Update filters when search/filter states change
  useEffect(() => {
    applyFilters(logs);
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, statusFilter, gameFilter, actionFilter, logs]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = filteredLogs.slice(startIndex, endIndex);

     // Auto-refresh every 30 seconds
   useEffect(() => {
     const interval = setInterval(() => {
       const teamId = getSelectedTeamId();
       if (teamId) {
         fetchLogs(teamId);
       }
     }, 30000);

     return () => clearInterval(interval);
   }, []);

  // Handle clicking outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Close status dropdown if clicking outside
      if (!target.closest('[data-dropdown="status"]')) {
        setStatusDropdownOpen(false);
      }
      
      // Close game dropdown if clicking outside
      if (!target.closest('[data-dropdown="game"]')) {
        setGameDropdownOpen(false);
      }
      
      // Close action dropdown if clicking outside
      if (!target.closest('[data-dropdown="action"]')) {
        setActionDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

 

  if (loading) {
    return <Loader message="Loading logs..." />;
  }

  // Get current team ID
  const currentTeamId = getSelectedTeamId();

  // Format inputs for display
  const formatInputs = (inputs: any): string => {
    if (!inputs || Object.keys(inputs).length === 0) {
      return 'empty';
    }
    
    const inputStrings: string[] = [];
    
    // Add accountName if present
    if (inputs.account_name) {
      inputStrings.push(inputs.account_name);
    }
    
    // Add username if present
    if (inputs.username) {
      inputStrings.push(inputs.username);
    }
    
         // Add password if present
     if (inputs.password) {
       inputStrings.push(inputs.password);
     }
    
    // Add amount if present
    if (inputs.amount) {
      inputStrings.push(`$${inputs.amount}`);
    }
    
    // Add remark if present
    if (inputs.remark) {
      inputStrings.push(inputs.remark);
    }
    
    // Add any other string parameters
    Object.keys(inputs).forEach(key => {
      if (typeof inputs[key] === 'string' && 
          !['account_name', 'username', 'password', 'amount', 'remark'].includes(key)) {
        inputStrings.push(inputs[key]);
      }
    });
    
    return inputStrings.length > 0 ? inputStrings.join(' | ') : 'empty';
  };



  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    
    // Format date as MM/DD/YYYY
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    
    // Format time as 12-hour with AM/PM
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
  };

  // Get status color and icon
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return {
          color: 'text-green-600 bg-green-100',
          icon: (
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'fail':
        return {
          color: 'text-red-600 bg-red-100',
          icon: (
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return {
          color: 'text-gray-600 bg-gray-100',
          icon: (
            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )
        };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Action Logs</h1>
                         <div className="flex items-center gap-2 text-sm text-gray-500">
               <span>Last updated:</span>
               <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
             </div>
          </div>
          <p className="text-gray-600 text-lg">Complete history of all actions performed by your team</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {/* Quick Stats */}
        {logs.length > 0 && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-md p-4 md:p-6 text-center">
              <div className="text-xl md:text-2xl font-bold text-gray-900">{logs.length}</div>
              <div className="text-xs md:text-sm text-gray-600">Total Actions</div>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-4 md:p-6 text-center">
              <div className="text-xl md:text-2xl font-bold text-green-600">
                {logs.filter(log => log.status === 'success').length}
              </div>
              <div className="text-xs md:text-sm text-gray-600">Successful</div>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-4 md:p-6 text-center">
              <div className="text-xl md:text-2xl font-bold text-red-600">
                {logs.filter(log => log.status === 'fail').length}
              </div>
              <div className="text-xs md:text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-4 md:p-6 text-center">
              <div className="text-xl md:text-2xl font-bold text-blue-600">
                {Array.from(new Set(logs.map(log => log.game_name))).length}
              </div>
              <div className="text-xs md:text-sm text-gray-600">Games</div>
            </div>
          </div>
        )}

                 {/* Search and Filters */}
         <div className="mb-6 bg-white rounded-2xl shadow-md p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            {/* Search Input - 60% width on larger screens */}
            <div className="w-full lg:w-3/5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search games and messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                />
                <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Filters Container - 40% width on larger screens */}
            <div className="w-full lg:w-2/5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Status Filter */}
                <div data-dropdown="status">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <div className="relative">
                    <button
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors text-base"
                    >
                      <span className="text-gray-700">
                        {statusFilter === 'all' ? 'All Status' : statusFilter === 'success' ? 'Success' : 'Failed'}
                      </span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {statusDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50">
                        <button
                          onClick={() => {
                            setStatusFilter('all');
                            setStatusDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            statusFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          All Status
                        </button>
                        <button
                          onClick={() => {
                            setStatusFilter('success');
                            setStatusDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            statusFilter === 'success' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          Success
                        </button>
                        <button
                          onClick={() => {
                            setStatusFilter('fail');
                            setStatusDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            statusFilter === 'fail' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          Failed
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Game Filter */}
                <div data-dropdown="game">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Game</label>
                  <div className="relative">
                    <button
                      onClick={() => setGameDropdownOpen(!gameDropdownOpen)}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors text-base"
                    >
                      <span className="text-gray-700">
                        {gameFilter === 'all' ? 'All Games' : gameFilter}
                      </span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${gameDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {gameDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => {
                            setGameFilter('all');
                            setGameDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            gameFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          All Games
                        </button>
                        {Array.from(new Set(logs.map(log => log.game_name))).map(gameName => (
                          <button
                            key={gameName}
                            onClick={() => {
                              setGameFilter(gameName);
                              setGameDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                              gameFilter === gameName ? 'bg-blue-50 text-blue-700 font-medium' : ''
                            }`}
                          >
                            {gameName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Filter */}
                <div data-dropdown="action">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                  <div className="relative">
                    <button
                      onClick={() => setActionDropdownOpen(!actionDropdownOpen)}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors text-base"
                    >
                      <span className="text-gray-700">
                        {actionFilter === 'all' ? 'All Actions' : actionFilter}
                      </span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${actionDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {actionDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => {
                            setActionFilter('all');
                            setActionDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            actionFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          All Actions
                        </button>
                        {Array.from(new Set(logs.map(log => log.action_display_name))).map(actionName => (
                          <button
                            key={actionName}
                            onClick={() => {
                              setActionFilter(actionName);
                              setActionDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                              actionFilter === actionName ? 'bg-blue-50 text-blue-700 font-medium' : ''
                            }`}
                          >
                            {actionName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[1024px]">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Game
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                    Message
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                    Inputs
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-lg font-medium">No logs found</p>
                        <p className="text-sm">
                          {logs.length === 0 ? 'Actions will appear here once they are performed' : 'No logs match your current filters'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentLogs.map((log) => {
                    const statusConfig = getStatusConfig(log.status);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {log.game_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700">
                            {log.action_display_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            {statusConfig.icon}
                            <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              {log.status === 'success' ? 'Success' : log.status === 'fail' ? 'Failed' : 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 min-w-0">
                          <div className="text-sm text-gray-700 max-w-xs truncate" title={log.message || 'No message'}>
                            {log.message || 'No message'}
                          </div>
                        </td>
                        <td className="px-6 py-4 min-w-0">
                          <div className="text-sm text-gray-700 max-w-xs truncate" title={formatInputs(log.inputs)}>
                            {formatInputs(log.inputs)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700">
                            {formatDate(log.updated_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700">
                            {log.execution_time_secs ? `${log.execution_time_secs}s` : 'N/A'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Tablet View - Scrollable table for medium screens */}
          <div className="hidden md:block lg:hidden overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Game
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                    Inputs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-base font-medium">No logs found</p>
                        <p className="text-sm">
                          {logs.length === 0 ? 'Actions will appear here once they are performed' : 'No logs match your current filters'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentLogs.map((log) => {
                    const statusConfig = getStatusConfig(log.status);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {log.game_name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">
                            {log.action_display_name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            {statusConfig.icon}
                            <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              {log.status === 'success' ? 'Success' : log.status === 'fail' ? 'Failed' : 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-0">
                          <div className="text-sm text-gray-700 max-w-32 truncate" title={log.message || 'No message'}>
                            {log.message || 'No message'}
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-0">
                          <div className="text-sm text-gray-700 max-w-32 truncate" title={formatInputs(log.inputs)}>
                            {formatInputs(log.inputs)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">
                            {formatDate(log.updated_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">
                            {log.execution_time_secs ? `${log.execution_time_secs}s` : 'N/A'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {currentLogs.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                <div className="flex flex-col items-center">
                  <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium">No logs found</p>
                  <p className="text-sm">
                    {logs.length === 0 ? 'Actions will appear here once they are performed' : 'No logs match your current filters'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-white border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Game
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                        Message
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider min-w-0">
                        Inputs
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentLogs.map((log) => {
                      const statusConfig = getStatusConfig(log.status);
                      return (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2">
                            <div className="text-xs font-medium text-gray-900">
                              {log.game_name}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-700">
                              {log.action_display_name}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center">
                              <div className="w-3 h-3">
                                {statusConfig.icon}
                              </div>
                              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                {log.status === 'success' ? 'Success' : log.status === 'fail' ? 'Failed' : 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 min-w-0">
                            <div className="text-xs text-gray-700 max-w-20 truncate" title={log.message || 'No message'}>
                              {log.message || 'No message'}
                            </div>
                          </td>
                          <td className="px-3 py-2 min-w-0">
                            <div className="text-xs text-gray-700 max-w-20 truncate" title={formatInputs(log.inputs)}>
                              {formatInputs(log.inputs)}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-700">
                              {formatDate(log.updated_at)}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-700">
                              {log.execution_time_secs ? `${log.execution_time_secs}s` : 'N/A'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {filteredLogs.length > logsPerPage && (
          <div className="mt-6 bg-white rounded-2xl shadow-md p-4 md:p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="text-sm text-gray-700 text-center sm:text-left">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} results
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  First
                </button>
                
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                <span className="px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-md">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
                
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}

        
      </div>
    </div>
  );
}
