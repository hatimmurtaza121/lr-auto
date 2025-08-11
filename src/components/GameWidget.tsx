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
    console.log(`GameWidget ${gameName} state:`, {
      isLoggedIn,
      needsLogin,
      isExpanded,
      sessionToken,
      errorMessage
    });
  }, [isLoggedIn, needsLogin, isExpanded, sessionToken, errorMessage, gameName]);

  // Listen for session expired events from ActionStatus
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent) => {
      const { gameName: expiredGameName } = event.detail;
      
      // Only trigger login screen if this event is for this specific game widget
      if (expiredGameName === gameName) {
        console.log(`Session expired for ${gameName}, triggering login screen`);
        setIsLoggedIn(false);
        setNeedsLogin(true);
        setIsExpanded(true);
      }
    };

    // Listen for login job completion
    const handleLoginJobComplete = (event: CustomEvent) => {
      console.log(`Login job completion event received for ${gameName}:`, event.detail);
      const { gameName: completedGameName, action, success, sessionToken, message } = event.detail;
      
      if (completedGameName === gameName && action === 'login') {
        console.log(`Login job completed for ${gameName}:`, { success, message });
        if (success) {
          console.log(`Login succeeded for ${gameName}, setting logged in state`);
          setSessionToken(sessionToken || 'session-token');
          setIsLoggedIn(true);
          setNeedsLogin(false);
          setErrorMessage('');
        } else {
          // Fix: Reset login state when login fails
          console.log(`Login failed for ${gameName}, resetting state...`);
          setSessionToken(null);
          setIsLoggedIn(false);
          setNeedsLogin(true);
          setIsExpanded(true);
          setErrorMessage(message || 'Login failed');
        }
      }
    };

    window.addEventListener('session-expired', handleSessionExpired as EventListener);
    window.addEventListener('login-job-complete', handleLoginJobComplete as EventListener);

    return () => {
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
          console.log('Found existing session:', data);
        } else if (data.hasCredentials) {
          // No session but credentials exist - pre-fill the form but don't show login screen
          setUsername(data.username || '');
          setPassword(data.password || '');
          console.log('No session but credentials found, pre-filled form');
        } else {
          // No credentials found - don't show login screen
          console.log('No credentials found');
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
        console.log('Login job added to queue:', data.jobId);
        
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
        // Note: We don't set isLoggedIn here because we need to wait for the job to complete
        // The ActionStatus component will handle showing the progress
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
      console.log(`Login failed for ${gameName}, resetting state immediately...`);
      setSessionToken(null);
      setIsLoggedIn(false);
      setNeedsLogin(true);
      setIsExpanded(true);
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
              className="bg-white rounded-2xl shadow-xl hover:shadow-3xl hover:shadow-blue-600/60 transition-all duration-200 p-6 cursor-pointer mb-6 break-inside-avoid"
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
             {(hasCredentials || (username && password)) && (
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
              className="space-y-6 animate-in slide-in-from-top-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <TextField
                label="Username"
                variant="outlined"
                fullWidth
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setErrorMessage(''); // Clear error when user types
                }}
                disabled={isLoading}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    height: "48px", // Match the py-3 height (24px) + some padding
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
                  setErrorMessage(''); // Clear error when user types
                }}
                disabled={isLoading}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    height: "48px", // Match the py-3 height (24px) + some padding
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
              {/* Error Message - Positioned between password and login button */}
              {errorMessage && (
                <Alert severity="error" className="w-full mb-6">
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
              className="space-y-6 animate-in slide-in-from-top-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <Alert severity="warning" className="w-full mb-6">
                Session expired. Please login again to continue.
              </Alert>
                                             <TextField
                  label="Username"
                  variant="outlined"
                  fullWidth
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                    setErrorMessage('');
                  }}
                  error={!!errorMessage}
                  helperText={errorMessage}
                  disabled={isLoading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255,255,255,0.9)",
                      borderRadius: "12px",
                      height: "48px", // Match the py-3 height (24px) + some padding
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
                  error={!!errorMessage}
                  helperText={errorMessage}
                  disabled={isLoading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255,255,255,0.9)",
                      borderRadius: "12px",
                      height: "48px", // Match the py-3 height (24px) + some padding
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
                <Alert severity="error" className="w-full mb-6">
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
                    <span className="ml-2">Reconnecting...</span>
                  </div>
                ) : (
                  'Reconnect'
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}