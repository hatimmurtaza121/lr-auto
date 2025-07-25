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
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [currentLog, setCurrentLog] = useState<string>('');
  const [allLogs, setAllLogs] = useState<string[]>([]);

  const handleInputChange = (key: string, value: string) => {
    setFormInputs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async () => {
    setIsExecuting(true);
    setOutput('');
    setResultMessage(null);
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
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: actionType,
          gameName: gameName,
          params: params
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Action execution failed');
      }

      const result = await response.json();
      
      // Check if action needs login
      if (result.needsLogin) {
        setResultMessage({
          type: 'error',
          message: 'Session expired. Please login first.'
        });
        setOutput(`Session expired. Please login first.\nGame Info: ${JSON.stringify(result.gameInfo, null, 2)}`);
        // Trigger login callback if provided
        if (onNeedsLogin) {
          onNeedsLogin();
        }
        return;
      }
      
      // Set result message based on success/failure
      if (result.success) {
        setResultMessage({
          type: 'success',
          message: result.message || 'Action completed successfully!'
        });
      } else {
        setResultMessage({
          type: 'error',
          message: result.message || 'Action failed!'
        });
      }
      
      // Display logs if available
      if (result.logs && result.logs.length > 0) {
        setAllLogs(result.logs);
        setCurrentLog(result.logs[result.logs.length - 1]); // Show the last log
      }
      
      setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setResultMessage({
          type: 'error',
          message: `Error: ${errorMessage}`
        });
        setOutput(`Error: ${errorMessage}`);
      } finally {
        clearInterval(logInterval);
        setIsExecuting(false);
        
        // Notify parent that execution ended
        onExecutionEnd?.();
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



      {/* Result Message */}
      {resultMessage && (
        <div className={`p-4 rounded-2xl border-2 ${
          resultMessage.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : resultMessage.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center">
            <div className={`w-5 h-5 rounded-full mr-3 ${
              resultMessage.type === 'success' 
                ? 'bg-green-500' 
                : resultMessage.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}></div>
            <span className="font-medium">{resultMessage.message}</span>
          </div>
        </div>
      )}

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