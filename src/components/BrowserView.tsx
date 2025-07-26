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
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('BrowserView: isExecuting changed to:', isExecuting);
    
    if (!isExecuting) {
      setImageSrc('');
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
      }
      setConnectionStatus('disconnected');
      return;
    }

    // Initialize WebSocket connection
    const ws = new WebSocket('ws://localhost:8080');
    setWsConnection(ws);
    setConnectionStatus('connecting');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      
      // Send authentication message
      ws.send(JSON.stringify({
        type: 'auth',
        userId: 'current-user', // You can get this from your auth context
        teamId: 'current-team'  // You can get this from your team context
      }));
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
          const url = URL.createObjectURL(blob);
          
          setImageSrc(url);
          console.log('WebSocket screenshot received:', data.timestamp);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isExecuting]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [allLogs, currentLog]);

  return (
    <div className="h-full bg-gray-100 rounded-2xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Live Browser View</h3>
        {isExecuting && (
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-blue-600">Live</span>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
            <span className="text-xs text-gray-500">
              {connectionStatus === 'connected' ? 'WS Connected' : 
               connectionStatus === 'connecting' ? 'WS Connecting' : 'WS Disconnected'}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex-1 bg-white rounded-xl border-2 border-gray-200 overflow-hidden flex items-center justify-center mb-4">
        {isExecuting && imageSrc ? (
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
            <p className="text-sm">Execute an action to see live automation</p>
          </div>
        )}
      </div>

      {/* Log Display Area */}
      {isExecuting && (
        <div ref={logContainerRef} className="bg-blue-50 border border-blue-200 rounded-xl p-4 h-40 overflow-y-auto">
          <div className="flex items-center mb-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-3"></div>
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