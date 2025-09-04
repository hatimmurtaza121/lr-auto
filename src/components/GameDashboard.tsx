'use client';

import { useState, useEffect, useRef } from 'react';
import { getSelectedTeamId } from '@/utils/team';
import { createClient } from '@/lib/supabase/client';

interface GameDashboardProps {
  gameName: string;
  scriptPath?: string;
  onNeedsLogin?: () => void;
  onExecutionStart?: () => void;
  onExecutionEnd?: () => void;
  onLogUpdate?: (currentLog: string, allLogs: string[]) => void;
}

interface FormInputs {
  [key: string]: string;
}

interface Action {
  id: number;
  name: string;
  display_name?: string | null;
  inputs_json?: {
    fields: Array<{
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }>;
  };
  script_code?: string | null;
}

// Import game mapping utility
import { getGameId } from '@/utils/game-mapping';

export default function GameDashboard({ gameName, scriptPath, onNeedsLogin, onExecutionStart, onExecutionEnd, onLogUpdate }: GameDashboardProps) {
  const supabase = createClient();
  const [actions, setActions] = useState<Action[]>([]);
  const [selectedAction, setSelectedAction] = useState<number | null>(null);
  const [formInputs, setFormInputs] = useState<FormInputs>({});
  const [output, setOutput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadingActions, setLoadingActions] = useState(true);
  const [actionsDropdownOpen, setActionsDropdownOpen] = useState(false);

  const [currentLog, setCurrentLog] = useState<string>('');
  const [allLogs, setAllLogs] = useState<string[]>([]);
  const actionsDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(event.target as Node)) {
        setActionsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch actions from database
  const fetchActions = async () => {
    try {
      setLoadingActions(true);
      const gameId = await getGameId(gameName);
      if (!gameId) {
        console.error('Game not found:', gameName);
        return;
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('User not authenticated');
        return;
      }

      const response = await fetch(`/api/actions?gameId=${gameId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setActions(data.actions || []);
        // Set first action as selected if available
        if (data.actions && data.actions.length > 0) {
          setSelectedAction(data.actions[0].id);
        }
      } else {
        console.error('Failed to fetch actions');
      }
    } catch (error) {
      console.error('Error fetching actions:', error);
    } finally {
      setLoadingActions(false);
    }
  };

  // Load actions on component mount
  useEffect(() => {
    fetchActions();
  }, [gameName]);

  const handleInputChange = (key: string, value: string) => {
    setFormInputs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Function to check session status before executing actions
  const checkSessionBeforeExecute = async () => {
    try {
      const teamId = getSelectedTeamId();
      if (!teamId) {
        throw new Error('No team selected');
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/check-session?gameName=${gameName}`, {
        method: 'GET',
        headers: {
          'x-team-id': teamId.toString(),
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasSession) {
          return true; // Session is valid, can proceed with execution
        } else {
          // No valid session - trigger login screen
          onNeedsLogin?.();
          return false;
        }
      } else {
        // Session check failed - trigger login screen
        onNeedsLogin?.();
        return false;
      }
    } catch (error) {
      console.error('Session check failed:', error);
      onNeedsLogin?.();
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!selectedAction) {
      setOutput('Please select an action first');
      return;
    }

    try {
      // Start loading immediately
      setIsExecuting(true);

      // Check session before executing
      const sessionValid = await checkSessionBeforeExecute();
      if (!sessionValid) {
        setIsExecuting(false);
        return; // Login screen will be shown by onNeedsLogin callback
      }

      setOutput('');
      setCurrentLog('');
      setAllLogs([]);

      const teamId = getSelectedTeamId();
      if (!teamId) {
        setOutput('Error: No team selected');
        return;
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setOutput('Error: User not authenticated');
        return;
      }

      const selectedActionData = actions.find(action => action.id === selectedAction);
      if (!selectedActionData) {
        setOutput('Error: Selected action not found');
        return;
      }

      // Build params dynamically based on the action's input schema
      let params: any = {};
      if (selectedActionData.inputs_json && selectedActionData.inputs_json.fields) {
        selectedActionData.inputs_json.fields.forEach((field) => {
          params[field.key] = formInputs[field.key] || '';
        });
      }

      const response = await fetch('/api/execute-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-team-id': teamId.toString(),
          'x-game-name': gameName,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: selectedActionData.name,
          params: params
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Check if this is a queued job response
      if (result.jobId) {
        // Dispatch event for job tracking
        const newJobEvent = new CustomEvent('new-job', {
          detail: {
            jobId: result.jobId,
            gameName: gameName,
            action: selectedActionData.name
          }
        });
        window.dispatchEvent(newJobEvent);
        
        // Re-enable the execute button immediately after job is queued
        // Job monitoring is handled by the Live Action widget
        setIsExecuting(false);
        
        return;
      }
      
      // Handle immediate responses (fallback)
      if (result.needsLogin) {
        setOutput(`Session expired. Please login first.\nGame Info: ${JSON.stringify(result.gameInfo, null, 2)}`);
        // Trigger login callback if provided
        if (onNeedsLogin) {
          onNeedsLogin();
        }
        return;
      }
      
      // Display logs if available
      if (result.logs && result.logs.length > 0) {
        setAllLogs(result.logs);
        setCurrentLog(result.logs[result.logs.length - 1]); // Show the last log
      }
      
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setOutput(`Error: ${errorMessage}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Define input fields for each action
  const getInputFields = () => {
    const selectedActionData = actions.find(action => action.id === selectedAction);
    
    if (!selectedActionData || !selectedActionData.inputs_json || !selectedActionData.inputs_json.fields) {
      return [];
    }

    return selectedActionData.inputs_json.fields.map((field) => ({
      key: field.key,
      label: field.label,
      placeholder: field.placeholder || `Enter ${field.label.toLowerCase()}`,
      required: field.required !== false
    }));
  };

  const currentInputFields = getInputFields();

  if (loadingActions) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-content-secondary">No actions available for this game.</p>
          <p className="text-sm text-content-tertiary mt-2">Add actions in the Settings page to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">
        {/* Actions Section */}
        <div>
          <h3 className="text-lg font-semibold text-content-primary mb-4">Actions</h3>
          
          <div className="relative" ref={actionsDropdownRef}>
            <button
              onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
              className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer group border border-gray-300 hover:border-gray-400 w-full justify-between"
            >
              <span className="whitespace-nowrap">
                {selectedAction 
                  ? actions.find(a => a.id === selectedAction)?.display_name || 
                    actions.find(a => a.id === selectedAction)?.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  : 'Select an action'}
              </span>
              <svg className={`w-4 h-4 transition-transform ${actionsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {actionsDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50 max-h-60 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => {
                      setSelectedAction(action.id);
                      setActionsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                      selectedAction === action.id ? 'bg-blue-50 text-blue-700 font-medium' : ''
                    }`}
                  >
                    <span className="truncate">
                      {action.display_name && action.display_name.trim().length > 0
                        ? action.display_name
                        : action.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    {selectedAction === action.id && (
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-content-primary">Inputs</h3>
          
          {currentInputFields.length > 0 ? (
            currentInputFields.map(({ key, label, placeholder, required }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={formInputs[key] || ''}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  className="w-full px-4 py-3 bg-surface-secondary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent transition-all duration-200 text-content-primary placeholder-content-tertiary"
                  placeholder={placeholder}
                  required={required}
                />
              </div>
            ))
          ) : (
            <p className="text-gray-500">No inputs required</p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isExecuting || !selectedAction}
        className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-300 text-content-inverse font-medium py-4 px-6 rounded-2xl transition-all duration-150 active:animate-tap disabled:cursor-not-allowed shadow-primary"
      >
        {isExecuting ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-content-inverse"></div>
            <span className="ml-2">Executing...</span>
          </div>
        ) : (
          'Execute Action'
        )}
      </button>

      {/* Output Display */}
      {output && (
        <div className="bg-surface-secondary border border-border-primary rounded-2xl p-4">
          <h3 className="text-lg font-semibold text-content-primary mb-2">Output</h3>
          <pre className="text-sm text-content-secondary whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  );
}