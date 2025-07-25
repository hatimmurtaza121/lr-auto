'use client';

import { useState, lazy, Suspense, useEffect } from 'react';
import { runPlaywrightScript } from '@/utils/playwright';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

const GameDashboard = lazy(() => import('./GameDashboard'));

interface Game {
  id: number;
  name: string;
  login_url: string;
  created_at: string;
}

interface GameCredential {
  id: number;
  team_id: number;
  game_id: number;
  username: string;
  password: string;
  created_at: string;
  game: Game;
}

interface GameWidgetProps {
  gameName: string;
  displayName: string;
  hasCredentials?: boolean;
  credential?: GameCredential;
  onExecutionStart?: () => void;
  onExecutionEnd?: () => void;
  onLogUpdate?: (currentLog: string, allLogs: string[]) => void;
}

export default function GameWidget({ gameName, displayName, hasCredentials = false, credential, onExecutionStart, onExecutionEnd, onLogUpdate }: GameWidgetProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState(credential?.username || '');
  const [password, setPassword] = useState(credential?.password || '');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  // Check for existing session when component mounts
  useEffect(() => {
    checkExistingSession();
  }, []);

  // Update username/password when credential changes
  useEffect(() => {
    if (credential) {
      setUsername(credential.username);
      setPassword(credential.password);
    }
  }, [credential]);

  const checkExistingSession = async () => {
    try {
      // Get team ID from localStorage
      const teamId = localStorage.getItem('selectedTeamId');
      if (!teamId) {
        setIsCheckingSession(false);
        return;
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsCheckingSession(false);
        return;
      }

      const response = await fetch(`/api/check-session?gameName=${gameName}`, {
        method: 'GET',
        headers: {
          'x-team-id': teamId,
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasSession) {
          setSessionToken(data.sessionToken);
          setIsLoggedIn(true);
          console.log('Found existing session:', data);
        } else if (data.hasCredentials) {
          // No session but credentials exist - pre-fill the form
          setUsername(data.username || '');
          setPassword(data.password || '');
          console.log('No session but credentials found, pre-filled form');
        }
      } else {
        // Handle error response
        const errorData = await response.json().catch(() => ({}));
        console.error('Check session failed:', errorData);
        // Don't show error to user for session check failures
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(''); // Clear any previous errors
    
    try {
      // Get team ID from localStorage
      const teamId = localStorage.getItem('selectedTeamId');
      if (!teamId) {
        throw new Error('No team selected. Please select a team first.');
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/login-with-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-team-id': teamId,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ username, password, gameName }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      setSessionToken(data.sessionToken);
      setIsLoggedIn(true);
      setNeedsLogin(false); // Reset needsLogin state
      console.log('Login successful:', data);
    } catch (error) {
      console.error('Login failed:', error);
      
      // Provide short, user-friendly error messages
      let userFriendlyMessage = 'Login failed. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Captcha detected')) {
          userFriendlyMessage = 'Captcha detected. Please use manual login.';
        } else if (error.message.includes('Invalid login credentials')) {
          userFriendlyMessage = 'Invalid username or password.';
        } else if (error.message.includes('User not found')) {
          userFriendlyMessage = 'Account not found.';
        } else if (error.message.includes('Network')) {
          userFriendlyMessage = 'Network error. Check connection.';
        } else if (error.message.includes('No team selected')) {
          userFriendlyMessage = 'Please select a team first.';
        } else {
          userFriendlyMessage = error.message || 'Login failed. Please try again.';
        }
      }
      
      setErrorMessage(userFriendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Get team ID from localStorage
      const teamId = localStorage.getItem('selectedTeamId');
      if (!teamId) {
        return;
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return;
      }

      // Invalidate the session in the database
      const response = await fetch('/api/logout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-team-id': teamId,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ gameName }),
      });

      if (response.ok) {
        console.log('Session logged out successfully');
      }
    } catch (error) {
      console.error('Error logging out session:', error);
    } finally {
      // Clear local state regardless of API success
      setSessionToken(null);
      setIsLoggedIn(false);
      setUsername('');
      setPassword('');
    }
  };

  return (
    <div 
      className="bg-white rounded-3xl shadow-xl hover:shadow-3xl hover:shadow-blue-600/60 transition-all duration-200 p-6 cursor-pointer mb-6 break-inside-avoid"
      onClick={() => !isLoggedIn && !isCheckingSession && setIsExpanded(!isExpanded)}
    >
      {isCheckingSession ? (
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-lg text-gray-600">Checking session...</span>
          </div>
        </div>
      ) : (!isExpanded && !isLoggedIn) ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <span className="text-3xl font-bold text-gray-900">{displayName}</span>
            {hasCredentials && (
              <div className="mt-2 text-sm text-gray-500">
                Credentials saved • Click to login
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isLoggedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
              {isLoggedIn ? (
                <div></div> // Hidden logout button for now
              ) : (
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
              <GameDashboard 
                gameName={gameName} 
                onNeedsLogin={() => {
                  setIsLoggedIn(false);
                  setNeedsLogin(true);
                  setIsExpanded(true);
                }}
                onExecutionStart={onExecutionStart}
                onExecutionEnd={onExecutionEnd}
                onLogUpdate={onLogUpdate}
              />
            </Suspense>
          ) : needsLogin ? (
            <div 
              className="space-y-4 animate-in slide-in-from-top-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-700 text-sm font-medium">
                Session expired. Please login again to continue.
              </div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setErrorMessage('');
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
                  setErrorMessage('');
                }}
                className="w-full border-2 border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-700"
                disabled={isLoading}
              />
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
                    <span className="ml-2">Reconnecting...</span>
                  </div>
                ) : (
                  'Reconnect'
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}