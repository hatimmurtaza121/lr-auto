'use client';

import { useState, useEffect } from 'react';

interface BrowserViewProps {
  isExecuting: boolean;
  currentLog?: string;
  allLogs?: string[];
}

export default function BrowserView({ isExecuting, currentLog, allLogs = [] }: BrowserViewProps) {
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    console.log('BrowserView: isExecuting changed to:', isExecuting);
    
    if (!isExecuting) {
      setImageSrc('');
      return;
    }

    // Auto-refresh image every 500ms when executing
    const interval = setInterval(() => {
      const newSrc = `/latest.png?ts=${Date.now()}`;
      console.log('BrowserView: Setting image src to:', newSrc);
      setImageSrc(newSrc);
    }, 500);

    // Also set initial image immediately
    const initialSrc = `/latest.png?ts=${Date.now()}`;
    console.log('BrowserView: Setting initial image src to:', initialSrc);
    setImageSrc(initialSrc);

    return () => clearInterval(interval);
  }, [isExecuting]);

  return (
    <div className="h-full bg-gray-100 rounded-2xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Live Browser View</h3>
        {isExecuting && (
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-blue-600">Live</span>
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 h-40 overflow-y-auto">
          <div className="flex items-center mb-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-3"></div>
            <span className="text-blue-800 font-medium text-sm">Execution Logs</span>
          </div>
          {currentLog && (
            <div className="text-blue-700 text-sm mb-2 font-medium">
              Current: {currentLog}
            </div>
          )}
          {allLogs.length > 0 && (
            <div className="text-xs text-blue-600 space-y-1">
              {allLogs.slice(-3).map((log, index) => (
                <div key={index} className="opacity-80">• {log}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 