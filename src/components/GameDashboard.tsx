'use client';

import { useState } from 'react';
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

// Map game names to action types
const getActionType = (actionId: number): 'newAccount' | 'passwordReset' | 'recharge' | 'redeem' => {
  switch (actionId) {
    case 1: return 'newAccount';
    case 2: return 'passwordReset';
    case 3: return 'recharge';
    case 4: return 'redeem';
    default: return 'newAccount';
  }
};

// Import game mapping utility
import { getGameId } from '@/utils/game-mapping';

export default function GameDashboard({ gameName, scriptPath, onNeedsLogin, onExecutionStart, onExecutionEnd, onLogUpdate }: GameDashboardProps) {
  const supabase = createClient();
  const [selectedAction, setSelectedAction] = useState<number>(1);
  const [formInputs, setFormInputs] = useState<FormInputs>({
    accountName: '',
    password: '',
    rechargeAmount: '',
    redeemAmount: '',
    remark: '',
  });
  const [output, setOutput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);

  const [currentLog, setCurrentLog] = useState<string>('');
  const [allLogs, setAllLogs] = useState<string[]>([]);

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
    // Check session before executing
    const sessionValid = await checkSessionBeforeExecute();
    if (!sessionValid) {
      return; // Login screen will be shown by onNeedsLogin callback
    }

    setIsExecuting(true);
    setOutput('');
    setCurrentLog('Starting action...');
    setAllLogs(['Starting action...']);
    
    // Notify parent that execution started
    onExecutionStart?.();
    
    // Simulate real-time log updates
    const logSteps = [
      'Starting account creation process...',
      'Page loaded successfully',
      'Clicked Player Management',
      'Clicked Player List',
      'Clicked Player List link',
      'Iframe found',
      'Dialog create button found',
      'Clicked dialog create button',
      'Filled account name',
      'Filled password',
      'Clicked submit button'
    ];
    
    let currentStep = 0;
    const logInterval = setInterval(() => {
      if (currentStep < logSteps.length) {
        const newCurrentLog = logSteps[currentStep];
        const newAllLogs = [...allLogs, logSteps[currentStep]];
        setCurrentLog(newCurrentLog);
        setAllLogs(newAllLogs);
        onLogUpdate?.(newCurrentLog, newAllLogs);
        currentStep++;
      } else {
        clearInterval(logInterval);
      }
    }, 1000); // Update every second
    
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

      const actionType = getActionType(selectedAction);

      // Prepare parameters based on action type
      let params: any = {};
      
      switch (actionType) {
        case 'newAccount':
          params = {
            newAccountName: formInputs.accountName,
            newPassword: formInputs.password
          };
          break;
        case 'passwordReset':
          params = {
            targetUsername: formInputs.accountName,
            newPassword: formInputs.password
          };
          break;
        case 'recharge':
          params = {
            targetUsername: formInputs.accountName,
            amount: parseFloat(formInputs.rechargeAmount) || 0,
            remark: formInputs.remark
          };
          break;
        case 'redeem':
          params = {
            targetUsername: formInputs.accountName,
            amount: parseFloat(formInputs.redeemAmount) || 0,
            remark: formInputs.remark
          };
          break;
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
          action: actionType,
          params: params
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Job submission response:', result);
      
      // Check if this is a queued job response
      if (result.jobId) {
        // Dispatch event for ActionStatus component to track this job
        const newJobEvent = new CustomEvent('new-job', {
          detail: {
            jobId: result.jobId,
            gameName: gameName,
            action: actionType
          }
        });
        window.dispatchEvent(newJobEvent);
        
        // Re-enable the execute button immediately after job is queued
        // The ActionStatus component will handle job monitoring
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
        clearInterval(logInterval);
        
        // Cleanup polling timeout
        if ((window as any).__pollCleanup) {
          (window as any).__pollCleanup();
          delete (window as any).__pollCleanup;
        }
        
        // Note: setIsExecuting(false) is now handled in the polling logic
        // when the job actually completes or fails
      }
  };

  const actions = [
    { id: 1, name: 'New Account' },
    { id: 2, name: 'Password Reset' },
    { id: 3, name: 'Recharge' },
    { id: 4, name: 'Redeem' },
  ];

  // Define input fields for each action
  const getInputFields = () => {
    switch (selectedAction) {
      case 1: // New Account
        return [
          { key: 'accountName', label: 'New Account Name', placeholder: 'Enter new account name' },
          { key: 'password', label: 'New Password', placeholder: 'Enter new password' }
        ];
      case 2: // Password Reset
        return [
          { key: 'accountName', label: 'Account Name', placeholder: 'Enter account name' },
          { key: 'password', label: 'New Password', placeholder: 'Enter new password' }
        ];
      case 3: // Recharge
        return [
          { key: 'accountName', label: 'Account Name', placeholder: 'Enter account name' },
          { key: 'rechargeAmount', label: 'Recharge Amount', placeholder: 'Enter recharge amount' },
          { key: 'remark', label: 'Remark', placeholder: 'Enter remark' }
        ];
      case 4: // Redeem
        return [
          { key: 'accountName', label: 'Account Name', placeholder: 'Enter account name' },
          { key: 'redeemAmount', label: 'Redeem Amount', placeholder: 'Enter redeem amount' },
          { key: 'remark', label: 'Remark', placeholder: 'Enter remark' }
        ];
      default:
        return [];
    }
  };

  const currentInputFields = getInputFields();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Form Inputs */}
        <div className="flex-1 space-y-4">
          <h3 className="text-lg font-semibold text-content-primary">Configuration</h3>
          
          {currentInputFields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                {label}
              </label>
              <input
                type="text"
                value={formInputs[key] || ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className="w-full px-4 py-3 bg-surface-secondary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent transition-all duration-200 text-content-primary placeholder-content-tertiary"
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="md:w-48 space-y-3">
          <h3 className="text-lg font-semibold text-content-primary">Actions</h3>
          
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => setSelectedAction(action.id)}
              className={`w-full py-3 px-4 rounded-2xl font-bold border-4 transition-all duration-150 active:animate-tap ${
                selectedAction === action.id
                  ? 'bg-surface-primary hover:bg-surface-secondary text-primary-500 border-primary-500'
                  : 'bg-surface-primary hover:bg-surface-secondary text-content-primary border-border-primary'
              }`}
            >
              {action.name}
            </button>
          ))}
        </div>
      </div>





      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isExecuting}
        className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-300 text-content-inverse font-medium py-4 px-6 rounded-2xl transition-all duration-150 active:animate-tap disabled:cursor-not-allowed shadow-primary"
      >
        {isExecuting ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-content-inverse"></div>
            <span className="ml-2">Executing...</span>
          </div>
        ) : (
          `Execute ${actions.find(a => a.id === selectedAction)?.name}`
        )}
      </button>

      {/* Output - Hidden */}
      {/* {output && (
        <div className="bg-surface-secondary border border-border-primary rounded-2xl p-4">
          <h4 className="text-sm font-medium text-content-secondary mb-2">Output:</h4>
          <pre className="text-sm text-content-tertiary whitespace-pre-wrap">{output}</pre>
        </div>
      )} */}
    </div>
  );
}