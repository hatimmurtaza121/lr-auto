'use client';

import { useState, lazy, Suspense, useEffect } from 'react';
import { runPlaywrightScript } from '@/utils/playwright';
import { createClient } from '@/lib/supabase/client';

const GameDashboard = lazy(() => import('./GameDashboard'));

interface GameWidgetProps {
  gameName: string;
  displayName: string;
}

export default function GameWidget({ gameName, displayName }: GameWidgetProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);


  const handleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(''); // Clear any previous errors
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, gameName }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      setSessionToken(data.sessionToken);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Login failed:', error);
      
      // Provide short, user-friendly error messages
      let userFriendlyMessage = 'Login failed. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid login credentials')) {
          userFriendlyMessage = 'Invalid username or password.';
        } else if (error.message.includes('User not found')) {
          userFriendlyMessage = 'Account not found.';
        } else if (error.message.includes('Network')) {
          userFriendlyMessage = 'Network error. Check connection.';
        } else {
          userFriendlyMessage = 'Login failed. Please try again.';
        }
      }
      
      setErrorMessage(userFriendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="bg-white rounded-3xl shadow-lg hover:shadow-2xl hover:shadow-blue-600/50 transition-all duration-200 p-6 cursor-pointer mb-6 break-inside-avoid"
      onClick={() => !isLoggedIn && setIsExpanded(!isExpanded)}
    >
      {(!isExpanded && !isLoggedIn) ? (
        <div className="flex items-center justify-center h-32">
          <span className="text-3xl font-bold text-gray-900">{displayName}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isLoggedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
              {!isLoggedIn && (
                <svg 
                  className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </div>
          {!isLoggedIn && isExpanded ? (
            <div 
              className="space-y-4 animate-in slide-in-from-top-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setErrorMessage(''); // Clear error when user types
                }}
                className="w-full border-2 border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-700"
                disabled={isLoading}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setErrorMessage(''); // Clear error when user types
                }}
                className="w-full border-2 border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-700"
                disabled={isLoading}
              />
              {/* Error Message - Positioned between password and login button */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm font-medium">
                  {errorMessage}
                </div>
              )}
              <button
                onClick={handleLogin}
                disabled={isLoading || !username || !password}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-150 active:scale-95 disabled:cursor-not-allowed shadow"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span className="ml-2">Connecting...</span>
                  </div>
                ) : (
                  'Login'
                )}
              </button>
            </div>
          ) : isLoggedIn ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            }>
              <GameDashboard gameName={gameName} />
            </Suspense>
          ) : null}
        </>
      )}
    </div>
  );
}