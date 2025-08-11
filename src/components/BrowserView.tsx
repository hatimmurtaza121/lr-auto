'use client';

import { useState, useEffect, useRef } from 'react';

interface BrowserViewProps {
  isExecuting: boolean;
}

export default function BrowserView({ isExecuting }: BrowserViewProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
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
      setReconnectAttempts(0); // Reset reconnect attempts on successful connection
      
      // Send authentication message
      const authMessage = {
        type: 'auth',
        userId: 'current-user',
        teamId: 'current-team'
      };
      ws.send(JSON.stringify(authMessage));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'screenshot') {
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
          
        } else if (data.type === 'connection') {
        } else if (data.type === 'heartbeat') {
        } else if (data.type === 'worker_status') {
        } else if (data.type === 'pong') {
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
      } else {
        // Max reconnection attempts reached. Manual refresh required.
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };
  };

  // Initialize WebSocket connection immediately when component mounts
  useEffect(() => {
    createWebSocketConnection();
    
    // Cleanup function to close connection when component unmounts
    return () => {
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

  // Ensure WebSocket connection is ready when execution starts
  useEffect(() => {
    if (isExecuting) {
      // If not connected, try to connect
      if (connectionStatus !== 'connected') {
        createWebSocketConnection();
      }
      
      // Clear any existing image to show fresh screenshots
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
        setImageSrc('');
      }
    }
  }, [isExecuting]);

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



  // Manual reconnect function
  const handleManualReconnect = () => {
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
              // Image loaded successfully
            }}
            onError={(e) => {
              // Hide broken image
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="text-center text-gray-500">
            <div className="text-6xl mb-4">🖥️</div>
            <p className="text-lg font-medium">Browser View</p>
            <p className="text-sm">
              {isExecuting && connectionStatus === 'connected' ? 'Ready for screenshots!' :
               connectionStatus === 'connected' ? 'Waiting for screenshots...' : 
               connectionStatus === 'connecting' ? 'Connecting to WebSocket...' : 
               reconnectAttempts >= 10 ? 'Connection failed. Click Reconnect.' : 
               'Connecting to WebSocket...'}
            </p>
            {isExecuting && connectionStatus === 'connected' && (
              <p className="text-xs text-green-500 mt-2">
                Screenshots will appear here during login process
              </p>
            )}
            {connectionStatus !== 'connected' && reconnectAttempts < 10 && (
              <p className="text-xs text-orange-500 mt-2">
                Attempting to reconnect... ({reconnectAttempts}/10)
              </p>
            )}
          </div>
        )}
      </div>


    </div>
  );
} 