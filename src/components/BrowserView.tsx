'use client';

import { useState, useEffect, useRef } from 'react';

interface BrowserViewProps {
  isExecuting: boolean;
  currentLog?: string;
  allLogs?: string[];
}

export default function BrowserView({ isExecuting, currentLog, allLogs = [] }: BrowserViewProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string>('');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to create WebSocket connection
  const createWebSocketConnection = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log('WebSocket connection already exists');
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    console.log(`Creating WebSocket connection to ws://localhost:8080... (attempt ${reconnectAttempts + 1})`);
    const ws = new WebSocket('ws://localhost:8080');
    setWsConnection(ws);
    setConnectionStatus('connecting');

    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      setConnectionStatus('connected');
      setReconnectAttempts(0); // Reset reconnect attempts on successful connection
      
      // Send authentication message
      const authMessage = {
        type: 'auth',
        userId: 'current-user',
        teamId: 'current-team'
      };
      ws.send(JSON.stringify(authMessage));
      console.log('Sent auth message:', authMessage);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data.type, data);
        
        if (data.type === 'screenshot') {
          console.log('Screenshot received, processing...');
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
          
          console.log('WebSocket screenshot received and displayed:', data.timestamp);
        } else if (data.type === 'connection') {
          console.log('WebSocket connection confirmed:', data.message);
        } else if (data.type === 'heartbeat') {
          console.log('WebSocket heartbeat received:', data.timestamp);
        } else if (data.type === 'worker_status') {
          console.log('Worker status received:', data);
        } else if (data.type === 'pong') {
          console.log('WebSocket pong received:', data.timestamp);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
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
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          createWebSocketConnection();
        }, delay);
      } else {
        console.log('Max reconnection attempts reached. Manual refresh required.');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };
  };

  // Initialize WebSocket connection immediately when component mounts
  useEffect(() => {
    console.log('BrowserView component mounted - initializing WebSocket connection...');
    createWebSocketConnection();
    
    // Cleanup function to close connection when component unmounts
    return () => {
      console.log('BrowserView component unmounting - closing WebSocket connection...');
      
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Close WebSocket connection
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
      }
      
      // Clean up blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // Keep connection alive with heartbeat and ping
  useEffect(() => {
    if (wsConnection && connectionStatus === 'connected') {
      // Send heartbeat every 25 seconds
      heartbeatIntervalRef.current = setInterval(() => {
        if (wsConnection.readyState === WebSocket.OPEN) {
          try {
            wsConnection.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          } catch (error) {
            console.error('Failed to send heartbeat:', error);
          }
        }
      }, 25000);

      // Send ping every 30 seconds to detect dead connections
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
  }, [wsConnection, connectionStatus]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [allLogs, currentLog]);

  // Manual reconnect function
  const handleManualReconnect = () => {
    console.log('Manual reconnect requested');
    setReconnectAttempts(0);
    if (wsConnection) {
      wsConnection.close();
    }
    createWebSocketConnection();
  };

  return (
    <div className="h-full bg-gray-100 rounded-2xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Live Browser View</h3>
        <div className="flex items-center space-x-2">
          {isExecuting && (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className="text-sm text-blue-600">Live</span>
            </>
          )}
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs text-gray-500">
            {connectionStatus === 'connected' ? 'WS Connected' : 
             connectionStatus === 'connecting' ? 'WS Connecting' : 'WS Disconnected'}
          </span>
          {connectionStatus === 'disconnected' && reconnectAttempts > 0 && (
            <span className="text-xs text-orange-500">
              (Reconnecting: {reconnectAttempts}/10)
            </span>
          )}
          {connectionStatus === 'disconnected' && reconnectAttempts >= 10 && (
            <button
              onClick={handleManualReconnect}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>
      
              <div className="flex-1 bg-white rounded-2xl border-2 border-gray-200 overflow-hidden flex items-center justify-center">
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt="Live browser view" 
            className="max-w-full max-h-full object-contain"
            onLoad={(e) => {
              console.log('BrowserView: Image loaded successfully:', imageSrc);
            }}
            onError={(e) => {
              console.log('BrowserView: Image failed to load:', imageSrc);
              // Hide broken image
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="text-center text-gray-500">
            <div className="text-6xl mb-4">🖥️</div>
            <p className="text-lg font-medium">Browser View</p>
            <p className="text-sm">
              {connectionStatus === 'connected' ? 'Waiting for screenshots...' : 
               connectionStatus === 'connecting' ? 'Connecting to WebSocket...' : 
               reconnectAttempts >= 10 ? 'Connection failed. Click Reconnect.' : 
               'Connecting to WebSocket...'}
            </p>
            {connectionStatus !== 'connected' && reconnectAttempts < 10 && (
              <p className="text-xs text-orange-500 mt-2">
                Attempting to reconnect... ({reconnectAttempts}/10)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Log Display Area */}
      {isExecuting && (
        <div ref={logContainerRef} className="bg-blue-50 border border-blue-200 rounded-2xl p-4 h-40 overflow-y-auto">
          <div className="flex items-center mb-2">
            <span className="text-blue-800 font-medium text-sm">Execution Logs</span>
          </div>
          <div className="text-xs text-blue-600 space-y-1 font-mono">
            {/* Show only the latest log */}
            {allLogs.length > 0 && (
              <div className="flex items-start">
                <span className="text-blue-400 mr-2">•</span>
                <span className="flex-1">{allLogs[allLogs.length - 1]}</span>
              </div>
            )}
            {/* Optionally, show currentLog if it's not already the last log */}
            {currentLog && currentLog !== allLogs[allLogs.length - 1] && (
              <div className="flex items-start bg-blue-100 p-1 rounded">
                <span className="text-blue-600 mr-2 font-bold">→</span>
                <span className="flex-1 font-medium">{currentLog}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 