'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

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
  const [allActionLogs, setAllActionLogs] = useState<any[]>([]);
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

    const ws = new WebSocket('ws://localhost:8080');
    setWsConnection(ws);
    setConnectionStatus('connecting');

    ws.onopen = () => {
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      console.log(`GameRow ${gameName}: WebSocket connected, sending auth message`);
      
      // Send authentication message
      const authMessage = {
        type: 'auth',
        userId: 'current-user',
        teamId: 'current-team',
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
          
          // Refresh all action logs from database
          fetchAllActionLogs();
          
          // Notify parent component
          onLogUpdate?.(data.currentLog || '', []);
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
      console.error('WebSocket error:', error);
    };
  };

  // Create WebSocket connection when component mounts - ALWAYS establish connection for live view
  useEffect(() => {
    console.log(`GameRow ${gameName}: useEffect triggered, isLoggedIn: ${isLoggedIn}`);
    
    // ALWAYS establish WebSocket connection for live view, regardless of login state
    // This ensures screenshots are always displayed in real-time
    console.log(`GameRow ${gameName}: Creating WebSocket connection for live view (logged in: ${isLoggedIn})`);
    createWebSocketConnection();
    
    // Only fetch action logs if actually logged in (not just during login)
    if (isLoggedIn) {
      fetchAllActionLogs();
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

  // Fetch all action logs from database using the same endpoint as Action Logs
  const fetchAllActionLogs = async () => {
    try {
      console.log(`GameRow ${gameName}: Fetching all action logs from database...`);
      
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log(`GameRow ${gameName}: No session token, skipping fetch`);
        return;
      }

      const response = await fetch(`/api/logs?teamId=1`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      console.log(`GameRow ${gameName}: API response status:`, response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log(`GameRow ${gameName}: API response result:`, result);
        
        if (result.success && result.logs) {
          // Find all logs for this specific game
          const gameLogs = result.logs.filter((log: any) => 
            log.game_id === gameId
          );
          
          if (gameLogs.length > 0) {
            // Transform logs to the format we need
            const transformedLogs = gameLogs.map((log: any) => ({
              action: log.action_display_name || log.action,
              status: log.status,
              execution_time_secs: log.execution_time_secs,
              inputs: log.inputs,
              message: log.message || `${log.action} ${log.status === 'success' ? 'completed' : 'failed'}`,
              updated_at: log.updated_at
            }));
            
            console.log(`GameRow ${gameName}: Setting ${transformedLogs.length} action logs:`, transformedLogs);
            setAllActionLogs(transformedLogs);
          } else {
            console.log(`GameRow ${gameName}: No logs found for this game`);
            setAllActionLogs([]);
          }
        } else {
          console.log(`GameRow ${gameName}: API response not successful:`, result);
          setAllActionLogs([]);
        }
      } else {
        console.error(`GameRow ${gameName}: API response not ok:`, response.status, response.statusText);
        setAllActionLogs([]);
      }
    } catch (error) {
      console.error(`GameRow ${gameName}: Failed to fetch action logs:`, error);
      setAllActionLogs([]);
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
          {isLoggedIn && allActionLogs.length > 0 ? (
            <div className="h-full flex flex-col ">
              <div className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-300 pb-1  ">
                Live Action
              </div>
              
              {/* Display all action logs with reasonable max height and scroll */}
              <div className="overflow-y-auto space-y-2 max-h-[32.5rem]  ">
                {allActionLogs.map((log, index) => (
                  <div key={index} className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm text-xs relative">
                    <div className="mb-1">
                      <div className="text-xs text-gray-600 font-medium truncate">
                        {log.action}
                      </div>
                    </div>
                    
                    {/* Show inputs if available */}
                    {log.inputs && Object.keys(log.inputs).length > 0 && (
                      <div className="text-xs text-gray-500 mb-1 p-1.5 bg-gray-50 rounded border border-gray-100">
                        <span className="font-medium">Inputs:</span> {Object.values(log.inputs).join(' | ')}
                      </div>
                    )}
                    
                    {/* Show message if available */}
                    {log.message && (
                      <div className={`text-xs leading-relaxed line-clamp-2 ${
                        log.status === 'success' ? 'text-green-600' :
                        log.status === 'fail' ? 'text-red-600' :
                        'text-gray-500'
                      }`}>
                        {log.message}
                      </div>
                    )}
                    
                    {/* Duration at bottom right */}
                    <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                      {log.execution_time_secs ? `${log.execution_time_secs.toFixed(1)}s` : ''}
                    </div>
                  </div>
                ))}
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
