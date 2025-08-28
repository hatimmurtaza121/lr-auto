'use client';

import { useState, lazy, Suspense, useEffect } from 'react';
import { runPlaywrightScript } from '@/utils/playwright';
import { createClient } from '@/lib/supabase/client';
import {
  TextField,
  Button,
  Alert,
  Box,
} from "@mui/material";
import GameRow from './GameRow';

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

  // Debug: Monitor state changes
  useEffect(() => {
    // console.log(`GameWidget ${gameName} state:`, {
    //   isLoggedIn,
    //   needsLogin,
    //   isExpanded,
    //   sessionToken,
    //   errorMessage
    // });
  }, [isLoggedIn, needsLogin, isExpanded, sessionToken, errorMessage, gameName]);

  // Listen for session expired events from ActionStatus
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent) => {
      const { gameName: expiredGameName } = event.detail;
      
      // Only trigger login state if this event is for this specific game widget
      if (expiredGameName === gameName) {
        // console.log(`Session expired for ${gameName}, updating state but not expanding`);
        setIsLoggedIn(false);
        setNeedsLogin(true);
        // Don't automatically expand - let user click to expand
        // setIsExpanded(true);
      }
    };

    // Listen for login job completion
    const handleLoginJobComplete = (event: CustomEvent) => {
      const { gameName: completedGameName, action, success, sessionToken, message } = event.detail;
      
      if (completedGameName === gameName && action === 'login') {
        if (success) {
          setSessionToken(sessionToken || 'session-token');
          setIsLoggedIn(true);
          setNeedsLogin(false);
          setErrorMessage('');
          setIsExpanded(true); // Auto-expand after successful login to show dashboard
          
          // Also check the session to ensure the UI updates properly
          setTimeout(() => {
            checkExistingSession();
          }, 1000);
        } else {
          // Fix: Reset login state when login fails
          setSessionToken(null);
          setIsLoggedIn(false);
          setNeedsLogin(true);
          // Don't automatically expand on login failure
          // setIsExpanded(true);
          setErrorMessage(message || 'Login failed');
        }
      }
    };

    window.addEventListener('session-expired', handleSessionExpired as EventListener);
    window.addEventListener('login-job-complete', handleLoginJobComplete as EventListener);

    return () => {
      console.log(`Removing event listeners for ${gameName}`);
      window.removeEventListener('session-expired', handleSessionExpired as EventListener);
      window.removeEventListener('login-job-complete', handleLoginJobComplete as EventListener);
    };
  }, [gameName]);

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
          // Don't auto-expand - keep collapsed until user chooses to interact
          console.log('Found existing session:', data);
        } else if (data.hasCredentials) {
          // No session but credentials exist - pre-fill the form but don't show login screen
          setUsername(data.username || '');
          setPassword(data.password || '');
          // Don't auto-expand - keep collapsed until user chooses to interact
          console.log('No session but credentials found, pre-filled form');
        } else {
          // No credentials found - don't show login screen
          // console.log('No credentials found');
        }
      } else {
        // Handle error response
        const errorData = await response.json().catch(() => ({}));
        console.error('Check session failed:', errorData);
        // Don't show login screen on error
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

      // Use the new queue-based login endpoint
      const response = await fetch('/api/execute-login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-team-id': teamId,
          'x-game-name': gameName,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      
      if (data.jobId) {
        // Login job was added to queue successfully
        
        // Dispatch event for ActionStatus component to track this job
        const newJobEvent = new CustomEvent('new-job', {
          detail: {
            jobId: data.jobId,
            gameName: gameName,
            action: 'login'
          }
        });
        window.dispatchEvent(newJobEvent);
        
        // Show success message for job submission
        setErrorMessage('');
        
        // Since the backend login was successful, manually check session after a delay
        // This ensures the UI updates even if the event system doesn't work
        setTimeout(() => {
          checkExistingSession();
        }, 2000);
        
        // Also try an immediate session check
        setTimeout(() => {
          checkExistingSession();
        }, 500);
      } else {
        throw new Error('No job ID returned from login request');
      }
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
      
      // CRITICAL FIX: Handle login failure immediately by calling the same logic as handleLoginJobComplete
      setSessionToken(null);
      setIsLoggedIn(false);
      setNeedsLogin(true);
      // Don't automatically expand on login failure
      // setIsExpanded(true);
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
        // console.log('Session logged out successfully');
      }
    } catch (error) {
      console.error('Error logging out session:', error);
    } finally {
      // Clear local state regardless of API success
      setSessionToken(null);
      setIsLoggedIn(false);
      setUsername('');
      setPassword('');
      // Don't auto-expand - let user choose when to expand
      // setIsExpanded(true);
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // If not expanded, show only the game name
  if (!isExpanded) {
    return (
      <div className="bg-white rounded-2xl shadow-xl hover:shadow-3xl hover:shadow-blue-600/60 transition-all duration-200 p-6 mb-6 cursor-pointer group min-h-[120px] flex items-center justify-center" onClick={toggleExpanded}>
        {/* Game Header - Clickable */}
        <div className="relative w-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
            {isLoggedIn && (
              <p className="text-base text-green-600 mt-1">Logged in • Click to open</p>
            )}
            {!isLoggedIn && hasCredentials && (
              <p className="text-base text-gray-500 mt-1">Credentials saved • Click to login</p>
            )}
            {!isLoggedIn && !hasCredentials && (
              <p className="text-base text-gray-500 mt-1">Click to login</p>
            )}
          </div>
          <div className="absolute top-0 right-0 flex items-center space-x-2">
            {isLoggedIn ? (
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            ) : (
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            )}
            <svg 
              className="w-6 h-6 text-gray-400 transform transition-all duration-200 group-hover:text-blue-600 group-hover:scale-110" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl hover:shadow-3xl hover:shadow-blue-600/60 transition-all duration-200 p-6 mb-6">
      {/* Game Header - Clickable to collapse */}
      <div className="flex items-center justify-between mb-6 cursor-pointer group" onClick={toggleExpanded}>
                <div>
          <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
        </div>
        <div className="flex items-center space-x-2">
          {/* Circle indicator for login status */}
          {isLoggedIn ? (
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          ) : (
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          )}
          <svg 
            className="w-6 h-6 text-gray-400 transform rotate-180 transition-all duration-200 group-hover:text-blue-600 group-hover:scale-110" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Fat Row Layout - Three Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Column 1: Inputs - Narrower */}
        <div className="lg:col-span-1">
          {/* Login form or GameDashboard content */}
          {isCheckingSession ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-lg text-gray-600">Checking session...</span>
              </div>
            </div>
          ) : !isLoggedIn ? (
            <div className="space-y-4">
              <TextField
                label="Username"
                variant="outlined"
                fullWidth
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setErrorMessage('');
                }}
                disabled={isLoading}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    height: "48px",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.95)" },
                    "&.Mui-focused": { 
                      backgroundColor: "rgba(255,255,255,1)",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#1976d2",
                        borderWidth: "2px",
                      },
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(0,0,0,0.7)",
                    fontWeight: 500,
                    "&.Mui-focused": {
                      color: "#1976d2",
                    },
                  },
                }}
              />
              <TextField
                label="Password"
                variant="outlined"
                fullWidth
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setErrorMessage('');
                }}
                disabled={isLoading}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    height: "48px",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.95)" },
                    "&.Mui-focused": { 
                      backgroundColor: "rgba(255,255,255,1)",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#1976d2",
                        borderWidth: "2px",
                      },
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(0,0,0,0.7)",
                    fontWeight: 500,
                    "&.Mui-focused": {
                      color: "#1976d2",
                    },
                  },
                }}
              />
              {errorMessage && (
                <Alert severity="error" className="w-full">
                  {errorMessage}
                </Alert>
              )}
              <Button
                variant="contained"
                onClick={handleLogin}
                disabled={isLoading || !username || !password}
                fullWidth
                sx={{
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  height: 40,
                  fontWeight: 600,
                  fontSize: "1rem",
                  textTransform: "none",
                  borderRadius: "16px",
                  boxShadow: "0 8px 20px -5px rgba(25,118,210,0.3)",
                  "&:hover": {
                    backgroundColor: "#1565c0",
                    boxShadow: "0 12px 28px -5px rgba(25,118,210,0.4)",
                  },
                  "&:disabled": {
                    backgroundColor: "#90caf9",
                    color: "#fff",
                  },
                }}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span className="ml-2">Connecting...</span>
                  </div>
                ) : (
                  'Login'
                )}
              </Button>
            </div>
          ) : (
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
                }}
                onExecutionStart={onExecutionStart}
                onExecutionEnd={onExecutionEnd}
                onLogUpdate={onLogUpdate}
              />
            </Suspense>
          )}
        </div>

        {/* Column 2 & 3: Live View and Logs - Use GameRow component */}
        <div className="lg:col-span-4 h-full">
          <GameRow
            gameId={credential?.game_id || 0}
            gameName={gameName}
            displayName={displayName}
            isLoggedIn={isLoggedIn}
            onLogUpdate={onLogUpdate}
          />
        </div>
      </div>
    </div>
  );
}