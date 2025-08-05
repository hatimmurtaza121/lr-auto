'use client';

import { useState, useEffect, useMemo } from 'react';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { createClient } from '@/lib/supabase/client';

interface JobStatus {
  jobId: string;
  gameName: string;
  action: string;
  status: 'waiting' | 'prioritized' | 'active' | 'completed' | 'failed' | 'cancelled';
  message: string;
  timestamp: string;
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  params?: any; // Job parameters
}

interface ActionStatusProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export default function ActionStatus({ isExpanded, onToggle }: ActionStatusProps) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(false);

  // Track active jobs
  const [activeJobIds, setActiveJobIds] = useState<Set<string>>(new Set());

  // Track processed jobs to avoid duplicates
  const [processedJobs, setProcessedJobs] = useState<Set<string>>(new Set());

  // Generate unique component ID for debugging
  const componentId = useMemo(() => `ActionStatus-${Math.random().toString(36).substr(2, 9)}`, []);
  
  console.log(`ActionStatus component ${componentId} mounted at ${new Date().toISOString()}`);

  // Add a new job Monsanto tracking
  const addJob = (jobId: string, gameName: string, action: string) => {
    const newJob: JobStatus = {
      jobId,
      gameName,
      action,
      status: 'waiting',
      message: 'Job queued...',
      timestamp: new Date().toLocaleTimeString()
    };

    setJobs(prev => [newJob, ...prev]);
    setActiveJobIds(prev => new Set([...Array.from(prev), jobId]));
  };

  // Update job status with improved message handling
  const updateJobStatus = (jobId: string, status: JobStatus['status'], message: string, result?: any, error?: string, timing?: { startTime?: number; endTime?: number; duration?: number }, params?: any, source?: string) => {
    console.log(`[${componentId}] updateJobStatus called for job ${jobId} from ${source || 'unknown source'}`);
    
    setJobs(prev => prev.map(job => {
      if (job.jobId === jobId) {
        // Determine the final message to display
        let finalMessage = message;
        
        if (status === 'completed' && result) {
          // For completed jobs, prioritize the script result message
          if (result.message) {
            finalMessage = result.message;
          } else if (result.success !== undefined) {
            // If no message but success flag exists, create appropriate message
            finalMessage = result.success ? 'Operation completed successfully' : 'Operation failed';
          }
        } else if (status === 'failed' && error) {
          finalMessage = error;
        }

        // Check if the message indicates session expiration
        if (finalMessage.includes('Session expired. Please login first.')) {
          // Dispatch event to trigger login screen for this game
          const sessionExpiredEvent = new CustomEvent('session-expired', {
            detail: {
              gameName: job.gameName,
              jobId: jobId
            }
          });
          window.dispatchEvent(sessionExpiredEvent);
        }

        // Check if this is a completed login job
        if (status === 'completed' && job.action === 'login' && result) {
          // Dispatch event for login job completion
          const loginJobCompleteEvent = new CustomEvent('login-job-complete', {
            detail: {
              gameName: job.gameName,
              action: 'login',
              success: result.success,
              sessionToken: result.sessionToken,
              message: result.message
            }
          });
          window.dispatchEvent(loginJobCompleteEvent);
        }

        return {
          ...job,
          status,
          message: finalMessage,
          result,
          error,
          timestamp: new Date().toLocaleTimeString(),
          ...timing, // Include timing information
          params, // Include parameters
        };
      }
      return job;
    }));

    // Remove from active jobs if completed, failed, or cancelled
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      setActiveJobIds(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(jobId);
        return newSet;
      });

      console.log(`[${componentId}] Job finished, calling updateGameStatusInSupabase:`, {
        jobId,
        status,
        result,
        timing,
        params
      });

      // Call API to update game status in Supabase when job finishes
      updateGameStatusInSupabase(jobId, status, result, timing, params);
    }
  };

  // Function to update game status in Supabase
  const updateGameStatusInSupabase = async (jobId: string, status: JobStatus['status'], result?: any, timing?: { startTime?: number; endTime?: number; duration?: number }, params?: any) => {
    console.log('updateGameStatusInSupabase called with:', {
      jobId,
      status,
      result,
      timing,
      params
    });

    // Check if we've already processed this job
    if (processedJobs.has(jobId)) {
      console.log(`Job ${jobId} already processed, skipping`);
      return;
    }

    try {
      // Find the job to get game info
      const job = jobs.find(j => j.jobId === jobId);
      if (!job) {
        console.error('Job not found for status update:', jobId);
        return;
      }

      console.log('Found job:', job);

      // Get team ID
      const { getSelectedTeamId } = await import('@/utils/team');
      const teamId = getSelectedTeamId();
      if (!teamId) {
        console.error('No team selected for status update');
        return;
      }

      // Get game ID from game name
      const { getGameId } = await import('@/utils/game-mapping');
      const gameId = await getGameId(job.gameName);
      if (!gameId) {
        console.error(`Game not found: ${job.gameName}`);
        return;
      }

      // Determine the final status for Supabase
      let finalStatus: 'success' | 'fail' | 'unknown' = 'unknown';
      if (status === 'completed' && result) {
        finalStatus = result.success ? 'success' : 'fail';
      } else if (status === 'failed') {
        finalStatus = 'fail';
      }

      // Calculate execution time in seconds
      const executionTimeSecs = timing?.duration ? timing.duration / 1000 : undefined;

      // Prepare inputs data
      const inputs = params ? {
        account_name: params.accountName || params.newAccountName || params.targetUsername,
        password: params.password || params.newPassword,
        amount: params.amount,
        remarks: params.remark || params.remarks
      } : undefined;

      // Map action names to match database format
      const actionMap: { [key: string]: string } = {
        'newAccount': 'new_account',
        'passwordReset': 'password_reset',
        'recharge': 'recharge',
        'redeem': 'redeem',
        // Add lowercase versions in case job actions are lowercase
        'newaccount': 'new_account',
        'passwordreset': 'password_reset'
      };

      console.log('Job action before mapping:', job.action);
      const action = actionMap[job.action] || job.action;
      console.log('Action after mapping:', action);

      console.log('Updating game status in Supabase:', {
        teamId,
        gameId,
        action,
        status: finalStatus,
        inputs,
        execution_time_secs: executionTimeSecs
      });

      // Get session for authorization
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      // Call the API to update game status
      console.log(`Making API call for job ${jobId} at ${new Date().toISOString()}`);
      const response = await fetch('/api/update-game-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          teamId: teamId,
          gameId: gameId,
          action: action,
          status: finalStatus,
          inputs: inputs,
          execution_time_secs: executionTimeSecs
        }),
      });

      if (!response.ok) {
        console.error('Failed to update game status in Supabase:', response.statusText);
      } else {
        console.log(`API call successful for job ${jobId} at ${new Date().toISOString()}`);
        // Mark this job as processed
        setProcessedJobs(prev => new Set([...Array.from(prev), jobId]));
      }
    } catch (error) {
      console.error('Error updating game status in Supabase:', error);
    }
  };

  // Format duration for display
  const formatDuration = (durationMs: number): string => {
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = ((durationMs % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  };

  // Format parameters for display
  const formatParams = (params: any): string => {
    if (!params) return '';
    
    const paramStrings: string[] = [];
    
    // Add accountName if present
    if (params.accountName) {
      paramStrings.push(params.accountName);
    }
    
    // Add password if present
    if (params.password) {
      paramStrings.push(params.password);
    }
    
    // Add amount if present
    if (params.amount) {
      paramStrings.push(`$${params.amount}`);
    }
    
    // Add remark if present
    if (params.remark) {
      paramStrings.push(params.remark);
    }
    
    // Add any other string parameters
    Object.keys(params).forEach(key => {
      if (typeof params[key] === 'string' && 
          !['accountName', 'password', 'amount', 'remark'].includes(key)) {
        paramStrings.push(params[key]);
      }
    });
    
    return paramStrings.join(' | ');
  };

  // Cancel a job
  const cancelJob = async (jobId: string) => {
    try {
      console.log(`=== FRONTEND CANCEL CALLED ===`);
      console.log(`Cancelling jobId:`, jobId);
      
      // Find the job to get the action type
      const job = jobs.find(j => j.jobId === jobId);
      if (!job) {
        console.log(`❌ Job not found in local state:`, jobId);
        return;
      }

      console.log(`✅ Found job in local state:`, job);

      const response = await fetch(`/api/queue/cancel-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          action: job.action
        })
      });

      console.log(`Cancel response status:`, response.status);
      console.log(`Cancel response ok:`, response.ok);

      if (response.ok) {
        console.log(`✅ Job cancelled successfully`);
        updateJobStatus(jobId, 'cancelled', 'Job cancelled by user', undefined, undefined, undefined, undefined, 'frontend-cancel');
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to cancel job:', response.statusText, errorText);
      }
    } catch (error) {
      console.error('❌ Error cancelling job:', error);
    }
  };

  // Poll for job status updates with improved result handling
  useEffect(() => {
    if (activeJobIds.size === 0) return;

    const pollInterval = setInterval(async () => {
      for (const jobId of Array.from(activeJobIds)) {
        try {
          // Find the job in our local state to get the action
          const job = jobs.find(j => j.jobId === jobId);
          if (!job) continue;

          const response = await fetch(`/api/queue/job-status?jobId=${jobId}&action=${job.action}`);
          if (response.ok) {
            const data = await response.json();
            const status = data.status;

            if (status) {
              let message = status.message || 'Processing...';
              let jobStatus: JobStatus['status'] = 'waiting';

              console.log(`Job ${jobId} status update:`, {
                status: status.status,
                message: status.message,
                result: status.result,
                error: status.error,
                startTime: status.startTime,
                endTime: status.endTime,
                duration: status.duration
              });

              switch (status.status) {
                case 'waiting':
                  jobStatus = 'waiting';
                  message = 'Job is waiting in queue...';
                  break;
                case 'active':
                  jobStatus = 'active';
                  message = 'Processing...';
                  break;
                case 'completed':
                  jobStatus = 'completed';
                  // Use the script result message if available
                  if (status.result && status.result.message) {
                    message = status.result.message;
                  } else if (status.result && status.result.success !== undefined) {
                    message = status.result.success ? 'Operation completed successfully' : 'Operation failed';
                  } else {
                    message = 'Job completed successfully';
                  }
                  console.log(`Job ${jobId} completed with result:`, status.result);
                  console.log(`Job ${jobId} final message:`, message);
                  break;
                case 'failed':
                  jobStatus = 'failed';
                  message = status.error || 'Job failed';
                  break;
                case 'cancelled':
                  jobStatus = 'cancelled';
                  message = 'Job cancelled by user';
                  break;
              }

              updateJobStatus(jobId, jobStatus, message, status.result, status.error, {
                startTime: status.startTime,
                endTime: status.endTime,
                duration: status.duration
              }, status.params, 'polling');
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobIds, jobs]);

  // Listen for new job events
  useEffect(() => {
    const handleNewJob = (event: CustomEvent) => {
      const { jobId, gameName, action } = event.detail;
      addJob(jobId, gameName, action);
    };

    const handleJobUpdate = (event: CustomEvent) => {
      const { jobId, status, message, result, error, startTime, endTime, duration } = event.detail;
      
      // Use the message from the result object if available, otherwise use the event message
      let finalMessage = message;
      if (result && result.message) {
        finalMessage = result.message;
      } else if (result && result.success !== undefined) {
        finalMessage = result.success ? 'Operation completed successfully' : 'Operation failed';
      }
      
      console.log(`Job ${jobId} update received:`, {
        status,
        message,
        result,
        finalMessage,
        startTime,
        endTime,
        duration
      });
      
      updateJobStatus(jobId, status, finalMessage, result, error, { startTime, endTime, duration }, undefined, 'event');
    };

    window.addEventListener('new-job', handleNewJob as EventListener);
    window.addEventListener('job-update', handleJobUpdate as EventListener);

    return () => {
      window.removeEventListener('new-job', handleNewJob as EventListener);
      window.removeEventListener('job-update', handleJobUpdate as EventListener);
    };
  }, []);

  const getStatusColor = (status: JobStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'active':
        return 'text-blue-600 bg-blue-100';
      case 'waiting':
        return 'text-yellow-600 bg-yellow-100';
      case 'prioritized':
        return 'text-orange-600 bg-orange-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status: JobStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'active':
        return 'In Progress';
      case 'waiting':
        return 'Queued';
      case 'prioritized':
        return 'Prioritized';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  // Get message color based on result
  const getMessageColor = (job: JobStatus) => {
    if (job.status === 'failed') return 'text-red-600';
    if (job.status === 'completed' && job.result) {
      return job.result.success ? 'text-green-600' : 'text-red-600';
    }
    return 'text-gray-600';
  };

  return (
    <div className="bg-white rounded-2xl shadow-md mb-6 overflow-hidden">
      {/* Header - Always visible */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-gray-800">Action Status</h3>
          <span className="text-sm text-gray-500">({jobs.length} jobs)</span>
          {activeJobIds.size > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {activeJobIds.size} active
            </span>
          )}
        </div>
        {isExpanded ? (
          <KeyboardArrowUp className="text-gray-500" />
        ) : (
          <KeyboardArrowDown className="text-gray-500" />
        )}
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          <div className="max-h-[20vh] overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No actions in progress
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {jobs.map((job) => (
                  <div key={job.jobId} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-4">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <span className="font-medium text-gray-900">
                                {job.gameName}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-700">
                                {job.action}
                              </span>
                              {job.params && (
                                <>
                                  <span className="text-gray-400">-</span>
                                  <span className="text-xs text-gray-500">
                                    {formatParams(job.params)}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* Display the script result message prominently */}
                            <p className={`text-sm font-medium mt-1 ${getMessageColor(job)}`}>
                              {job.message}
                            </p>

                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {/* Cancel button for waiting and prioritized jobs */}
                        {(job.status === 'waiting' || job.status === 'prioritized') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelJob(job.jobId);
                            }}
                            className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-200 hover:border-red-300 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {getStatusText(job.status)}
                        </span>
                        {/* Display duration for completed/failed jobs, show nothing for active/waiting jobs */}
                        {(job.status === 'completed' || job.status === 'failed') && job.duration && (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatDuration(job.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 