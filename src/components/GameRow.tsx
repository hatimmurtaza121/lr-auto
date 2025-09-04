'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSelectedTeamId } from '@/utils/team';
import { getGameId } from '@/utils/game-mapping';

interface GameRowProps {
  gameId: number;
  gameName: string;
  displayName: string;
  isLoggedIn: boolean;
  onLogUpdate?: (currentLog: string, allLogs: string[]) => void;
}

export default function GameRow({ gameId, gameName, displayName, isLoggedIn, onLogUpdate }: GameRowProps) {
  const supabase = createClient();
  const [imageSrc, setImageSrc] = useState<string>('');
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [currentLog, setCurrentLog] = useState<string>('');
  const [allLogs, setAllLogs] = useState<Array<{message: string, actionName?: string, duration?: string, inputs?: string}>>([]);
  const [sessionId, setSessionId] = useState<string>(''); // NEW: Store session ID
  const [gameJobs, setGameJobs] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<any>({});
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string>('');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to create WebSocket connection
  const createWebSocketConnection = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const ws = new WebSocket(process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8080');
    setWsConnection(ws);
    setConnectionStatus('connecting');

    ws.onopen = () => {
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      console.log(`GameRow ${gameName}: WebSocket connected, sending auth message`);
      
      // Get the current team ID for WebSocket authentication
      const currentTeamId = getSelectedTeamId();
      console.log(`GameRow ${gameName}: Current team ID:`, currentTeamId);
      
      // Send authentication message
      const authMessage = {
        type: 'auth',
        userId: 'current-user',
        teamId: currentTeamId?.toString() || 'unknown',
        gameId: gameId,
        gameName: gameName
      };
      console.log(`GameRow ${gameName}: Sending auth message:`, authMessage);
      ws.send(JSON.stringify(authMessage));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connection' && data.sessionId) {
          // NEW: Store the session ID when connection is established
          setSessionId(data.sessionId);
          console.log(`GameRow ${gameName}: Session established with ID: ${data.sessionId}, connectionId: ${data.connectionId}`);
        } else if (data.type === 'screenshot') {
          // Accept screenshots for our game using game ID
          console.log(`GameRow ${gameName}: Received screenshot message:`, {
            gameId: data.gameId,
            expectedGameId: gameId,
            gameName: data.gameName,
            expectedGameName: gameName,
            dataLength: data.data?.length || 0,
            messageType: data.type,
            timestamp: new Date().toISOString()
          });
          
          // Check if this screenshot is for our game using game ID (more reliable)
          if (data.gameId === gameId) {
            console.log(`GameRow ${gameName}: Processing screenshot for our game (game ID match)`);
            
            // Convert base64 to blob URL
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });
            
            // Revoke previous blob URL to free memory
            if (blobUrlRef.current) {
              URL.revokeObjectURL(blobUrlRef.current);
            }
            
            // Create new blob URL and update reference
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setImageSrc(url);
            
            console.log(`GameRow ${gameName}: Screenshot displayed successfully`);
          } else {
            console.log(`GameRow ${gameName}: Ignoring screenshot for different game: ${data.gameName} (case-sensitive comparison)`);
          }
        } else if (data.type === 'log_update' && data.gameId === gameId) {
          // Handle log updates - now just refresh database data
          console.log(`GameRow ${gameName}: Received log update, refreshing database data`);
          
                  // Refresh game jobs from database
        setCurrentOffset(0);
        setHasMoreLogs(true);
        fetchGameJobs(false);
          
          // Notify parent component
          onLogUpdate?.(data.currentLog || '', []);
        } else if (data.type === 'script-result' && data.result?.type === 'login-job-complete') {
          // Handle login completion from global worker
          const { gameName: completedGameName, action, success, sessionToken, message } = data.result;
          
          if (completedGameName === gameName && action === 'login') {
            console.log(`GameRow ${gameName}: Received login completion via WebSocket:`, data.result);
            
            // Dispatch custom event for GameWidget to handle
            const loginEvent = new CustomEvent('login-job-complete', {
              detail: {
                gameName: completedGameName,
                action: action,
                success: success,
                sessionToken: sessionToken,
                message: message
              }
            });
            window.dispatchEvent(loginEvent);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      
      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Attempt to reconnect with exponential backoff
      const maxReconnectAttempts = 10;
      const baseDelay = 1000; // 1 second
      const maxDelay = 30000; // 30 seconds
      
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          createWebSocketConnection();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error(`GameRow ${gameName}: WebSocket error:`, error);
      setConnectionStatus('disconnected');
    };
  };

  // Create WebSocket connection when component mounts - ALWAYS establish connection for live view
  useEffect(() => {
    console.log(`GameRow ${gameName}: useEffect triggered, isLoggedIn: ${isLoggedIn}`);
    
    // ALWAYS establish WebSocket connection for live view, regardless of login state
    // This ensures screenshots are always displayed in real-time
    console.log(`GameRow ${gameName}: Creating WebSocket connection for live view (logged in: ${isLoggedIn})`);
    createWebSocketConnection();
    
    // Only fetch game jobs if actually logged in (not just during login)
    if (isLoggedIn) {
      // Reset pagination state for initial load
      setCurrentOffset(0);
      setHasMoreLogs(true);
      fetchGameJobs(false);
    }

    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [gameName]); // Always connect when component mounts

  // Set up heartbeat, ping, and log refresh intervals
  useEffect(() => {
    if (wsConnection && connectionStatus === 'connected') {
      // Heartbeat interval
      heartbeatIntervalRef.current = setInterval(() => {
        if (wsConnection.readyState === WebSocket.OPEN) {
          try {
            wsConnection.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          } catch (error) {
            console.error('Failed to send heartbeat:', error);
          }
        }
      }, 30000);

      // Ping interval
      const pingInterval = setInterval(() => {
        if (wsConnection.readyState === WebSocket.OPEN) {
          try {
            wsConnection.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          } catch (error) {
            console.error('Failed to send ping:', error);
          }
        }
      }, 30000);

      return () => {
        clearInterval(heartbeatIntervalRef.current!);
        clearInterval(pingInterval);
      };
    }
  }, [wsConnection, connectionStatus, isLoggedIn]);

  // Smart polling for Live Action widget - only poll when there are active jobs
  useEffect(() => {
    if (isLoggedIn) {
      // Initial fetch when logged in
      fetchGameJobs();
      
      // Listen for immediate refresh when actions are executed
      const handleActionExecuted = () => {
        // Reset pagination and refresh when action is executed
        setCurrentOffset(0);
        setHasMoreLogs(true);
        fetchGameJobs(false);
      };
      
      window.addEventListener('action-executed', handleActionExecuted);
      
      return () => {
        window.removeEventListener('action-executed', handleActionExecuted);
      };
    }
  }, [isLoggedIn]);

  // Smart polling: only poll when there are active/waiting jobs
  useEffect(() => {
    if (isLoggedIn && (jobStats.active > 0 || jobStats.waiting > 0)) {
      // Poll every 2 seconds when there are active jobs
      const interval = setInterval(() => {
        // Only refresh current logs, don't load more
        fetchGameJobs(false);
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, jobStats.active, jobStats.waiting]);

  // CRITICAL FIX: Listen for job events and ensure WebSocket connection is maintained
  // This ensures we can receive screenshots for all actions (login, new account, etc.)
  useEffect(() => {
    const handleNewJob = (event: CustomEvent) => {
      const { gameName: jobGameName, action } = event.detail;
      
      // Only handle jobs for this specific game
      if (jobGameName === gameName) {
        console.log(`GameRow ${gameName}: ${action} job started, ensuring WebSocket connection is active`);
        
        // Ensure WebSocket connection is active for screenshots
        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
          console.log(`GameRow ${gameName}: Creating WebSocket connection for ${action} job`);
          createWebSocketConnection();
        }
        
        // Immediately refresh game jobs to show the new job
        setCurrentOffset(0);
        setHasMoreLogs(true);
        fetchGameJobs(false);
      }
    };

    const handleJobComplete = (event: CustomEvent) => {
      const { gameName: jobGameName, action, success } = event.detail;
      
      // Only handle jobs for this specific game
      if (jobGameName === gameName) {
        if (success) {
          console.log(`GameRow ${gameName}: ${action} job completed successfully, keeping WebSocket connection for live view`);
          // Keep the connection for ongoing screenshot updates
        } else {
          console.log(`GameRow ${gameName}: ${action} job failed, keeping WebSocket connection for live view`);
          // Keep connection even on failure - user might want to see what happened
        }
      }
    };

    // Listen for job events
    window.addEventListener('new-job', handleNewJob as EventListener);
    window.addEventListener('login-job-complete', handleJobComplete as EventListener);

    return () => {
      window.removeEventListener('new-job', handleNewJob as EventListener);
      window.removeEventListener('login-job-complete', handleJobComplete as EventListener);
    };
  }, [gameName, wsConnection]);



  // Cancel a specific job
  const cancelJob = async (jobId: string) => {
    try {
      console.log(`GameRow ${gameName}: Cancelling job ${jobId}...`);
      
      // Find the job to get the action type
      const job = gameJobs.find(j => j.jobId === jobId);
      if (!job) {
        console.error(`GameRow ${gameName}: Job ${jobId} not found in gameJobs`);
        return;
      }
      
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('User not authenticated');
        return;
      }

      // Cancel the job
      const response = await fetch('/api/queue/cancel-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          jobId,
          action: job.action
        })
      });

      if (response.ok) {
        console.log(`GameRow ${gameName}: Job ${jobId} cancelled successfully`);
        // Refresh the game jobs to show updated status
        setCurrentOffset(0);
        setHasMoreLogs(true);
        fetchGameJobs(false);
      } else {
        console.error(`GameRow ${gameName}: Failed to cancel job ${jobId}`);
      }
    } catch (error) {
      console.error(`GameRow ${gameName}: Error cancelling job:`, error);
    }
  };

  // Fetch game-specific jobs from queue
  const fetchGameJobs = async (loadMore = false) => {
    try {
      console.log(`GameRow ${gameName}: Fetching game jobs from queue...`);
      
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('User not authenticated');
        return;
      }

      // Get team ID
      const teamId = getSelectedTeamId();
      if (!teamId) {
        console.error('No team selected');
        return;
      }

      // Get game ID from game mapping
      const gameId = await getGameId(gameName);
      if (!gameId) {
        console.error('Game not found:', gameName);
        return;
      }

      // Calculate offset for pagination
      const offset = loadMore ? currentOffset : 0;
      
      // Fetch game-specific jobs with pagination
      const response = await fetch(`/api/queue/game-jobs?teamId=${teamId}&gameId=${gameId}&limit=6&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`GameRow ${gameName}: Received ${result.jobs?.length || 0} game jobs`);
        
        if (loadMore) {
          // Append new logs to existing ones
          setGameJobs(prev => [...prev, ...(result.jobs || [])]);
        } else {
          // Replace all logs (initial load or refresh)
          setGameJobs(result.jobs || []);
        }
        
        setJobStats(result.stats || {});
        setHasMoreLogs(result.hasMore || false);
        setCurrentOffset(result.nextOffset || 0);
      } else {
        console.error(`GameRow ${gameName}: Failed to fetch game jobs:`, response.statusText);
        if (!loadMore) {
          setGameJobs([]);
          setJobStats({});
        }
      }
    } catch (error) {
      console.error(`GameRow ${gameName}: Error fetching game jobs:`, error);
      if (!loadMore) {
        setGameJobs([]);
        setJobStats({});
      }
    }
  };

  // Load more logs when user scrolls to bottom (6 logs at a time)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    
    // Check if user scrolled to bottom (with 50px buffer)
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      if (hasMoreLogs && !loadingMoreLogs) {
        setLoadingMoreLogs(true);
        fetchGameJobs(true).finally(() => {
          setLoadingMoreLogs(false);
        });
      }
    }
  };

  // Manual load more function
  const handleLoadMore = () => {
    if (hasMoreLogs && !loadingMoreLogs) {
      setLoadingMoreLogs(true);
      fetchGameJobs(true).finally(() => {
        setLoadingMoreLogs(false);
      });
    }
  };

  // Manual reconnect function
  const handleManualReconnect = () => {
    setReconnectAttempts(0);
    if (wsConnection) {
      wsConnection.close();
    }
    createWebSocketConnection();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
      
      {/* Column 1-3: Live View - Spans 3 columns for more space */}
      <div className="lg:col-span-3">
        <div className="min-h-80 h-full bg-gray-100 rounded-2xl border-2 border-gray-200 overflow-hidden flex items-center justify-center relative">
          {/* In order to hide screenshots */}
          {/* {isLoggedIn && imageSrc ? ( */}
          {imageSrc ? (
            <img 
              src={imageSrc} 
              alt="Live view" 
              className="max-w-full max-h-full object-contain w-full h-full"
              onLoad={(e) => {
                // Image loaded successfully
              }}
              onError={(e) => {
                // Hide broken image
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">🖥️</div>
              <p className="text-sm font-medium">Live View</p>
              <p className="text-xs text-gray-400 mt-1">
                {isLoggedIn ? 'Waiting for action...' : 'Waiting for login...'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Column 4: Logs - Takes 1 column on the right */}
      <div className="lg:col-span-1">
        <div className="h-full bg-gray-100 rounded-2xl border-2 border-gray-200 overflow-hidden p-4 ">
          {isLoggedIn ? (
            <div className="h-full flex flex-col ">
              <div className="text-sm font-semibold text-gray-700 mb-2">
                Live Action
              </div>
              
              {/* Job Stats */}
              {(jobStats.active > 0 || jobStats.waiting > 0) && (
                <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-700 font-medium mb-1">Current Status</div>
                  <div className="flex gap-3 text-xs text-blue-600">
                    {jobStats.active > 0 && <span>{jobStats.active} running</span>}
                    {jobStats.waiting > 0 && <span>{jobStats.waiting} queued</span>}
                  </div>
                </div>
              )}
              
              {/* Display action logs in compact format */}
              <div 
                ref={logsContainerRef}
                className="overflow-y-auto overflow-x-hidden space-y-2 max-h-[32.5rem]"
                onScroll={handleScroll}
              >
                {gameJobs.map((job, index) => (
                  <div key={job.jobId} className={`p-2 bg-white rounded-lg border border-gray-200 shadow-sm text-xs overflow-hidden border-l-4 ${
                    job.status === 'completed' ? 'border-l-green-500' :
                    job.status === 'failed' ? 'border-l-red-500' :
                    job.status === 'active' ? 'border-l-blue-500' :
                    job.status === 'waiting' ? 'border-l-yellow-500' :
                    'border-l-gray-300'
                  }`}>
                    {/* Header row with action name and status */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium text-gray-700 truncate flex-1 pr-2">
                        {job.actionDisplayName || job.action}
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Cancel button for queued jobs - positioned to the left */}
                        {job.status === 'waiting' && (
                          <button
                            onClick={() => cancelJob(job.jobId)}
                            className="px-2 py-0.5 text-xs text-red-700 rounded border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        
                        {/* Status indicator */}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          job.status === 'active' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                          job.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' :
                          job.status === 'completed' ? 'bg-green-100 text-green-700' :
                          job.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {job.status === 'active' ? 'Running' :
                           job.status === 'waiting' ? 'Queued' :
                           job.status === 'completed' ? '✓' :
                           job.status === 'failed' ? '✗' :
                           job.status}
                        </span>
                      </div>
                    </div>
                    
                    {/* Inputs row - always show if params exist */}
                    {job.params && Object.keys(job.params).length > 0 && (
                      <div className="text-xs text-gray-600 mb-1 break-words">
                        <span className="font-medium">Inputs:</span> {Object.values(job.params).join(' | ')}
                      </div>
                    )}
                    
                    {/* Message row */}
                    {job.message && (
                      <div className={`text-xs leading-relaxed break-words ${
                        job.status === 'completed' ? 'text-green-600' :
                        job.status === 'failed' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {job.message}
                      </div>
                    )}
                    

                    
                    {/* Bottom row with date/time on left and execution time on right */}
                    <div className="flex justify-between items-center mt-1">
                      {/* Date and time on the left */}
                      <div className="text-xs text-gray-500">
                        {job.timestamp ? new Date(job.timestamp).toLocaleString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : ''}
                      </div>
                      
                      {/* Execution time on the right */}
                      {job.executionTime && (
                        <div className="text-xs text-gray-500">
                          {job.executionTime.toFixed(1)}s
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Load more indicator */}
                {loadingMoreLogs && (
                  <div className="flex justify-center py-2">
                    <div className="text-xs text-gray-500">Loading more logs...</div>
                  </div>
                )}
                
                {/* No more logs message */}
                {!hasMoreLogs && gameJobs.length > 0 && (
                  <div className="flex justify-center py-2">
                    <div className="text-xs text-gray-400">No more logs available</div>
                  </div>
                )}
                
                {/* Load more button (fallback) */}
                {hasMoreLogs && !loadingMoreLogs && gameJobs.length > 0 && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={handleLoadMore}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      Load More Logs
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-xs text-gray-400 mt-1">Latest logs will appear here...</p>
                {!isLoggedIn && (
                  <p className="text-xs text-gray-400 mt-1">Login to see live logs</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
