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
    console.log(`=== FRONTEND UPDATE CALLED ===`);
    console.log(`Updating jobId:`, jobId);
    console.log(`Status:`, status);
    console.log(`Message:`, message);
    console.log(`Result:`, result);
    console.log(`Error:`, error);
    console.log(`Timing:`, timing);
    console.log(`Params:`, params);
    console.log(`Source:`, source);

    setJobs(prevJobs => {
      const existingJobIndex = prevJobs.findIndex(job => job.jobId === jobId);
      
      if (existingJobIndex !== -1) {
        // Update existing job
        const updatedJobs = [...prevJobs];
        updatedJobs[existingJobIndex] = {
          ...updatedJobs[existingJobIndex],
          status,
          message,
          result,
          error,
          startTime: timing?.startTime,
          endTime: timing?.endTime,
          duration: timing?.duration,
          params
        };
        console.log(`✅ Updated existing job:`, updatedJobs[existingJobIndex]);
        return updatedJobs;
      } else {
        // Add new job (this shouldn't happen often)
        const newJob: JobStatus = {
          jobId,
          gameName: 'Unknown', // Will be updated later
          action: 'Unknown',    // Will be updated later
          status,
          message,
          timestamp: new Date().toLocaleTimeString(),
          result,
          error,
          startTime: timing?.startTime,
          endTime: timing?.endTime,
          duration: timing?.duration,
          params
        };
        console.log(`✅ Added new job:`, newJob);
        return [...prevJobs, newJob];
      }
    });

    // Remove the database update call - let the worker handle it
    console.log(`Skipping database update for job ${jobId} - worker will handle it`);
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

              // Remove job from active set if it's completed, failed, or cancelled
              if (jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled') {
                setActiveJobIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(jobId);
                  return newSet;
                });
                console.log(`Removed job ${jobId} from active set (status: ${jobStatus})`);
              }

              // Dispatch login-job-complete event for login jobs
              if (job.action === 'login' && (jobStatus === 'completed' || jobStatus === 'failed')) {
                // Determine actual login success from the result, not just job status
                const actualSuccess = jobStatus === 'completed' && status.result && status.result.success === true;
                const loginJobCompleteEvent = new CustomEvent('login-job-complete', {
                  detail: {
                    gameName: job.gameName,
                    action: 'login',
                    success: actualSuccess,
                    sessionToken: actualSuccess ? 'session-token' : null,
                    message: message
                  }
                });
                window.dispatchEvent(loginJobCompleteEvent);
                console.log(`Dispatched login-job-complete event for ${job.gameName}:`, { 
                  jobStatus, 
                  resultSuccess: status.result?.success, 
                  actualSuccess, 
                  message 
                });
              }
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
      
      // Remove job from active set if it's completed, failed, or cancelled
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        setActiveJobIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(jobId);
          return newSet;
        });
        console.log(`Removed job ${jobId} from active set via event (status: ${status})`);
      }

      // Dispatch login-job-complete event for login jobs
      const job = jobs.find(j => j.jobId === jobId);
      if (job && job.action === 'login' && (status === 'completed' || status === 'failed')) {
        // Determine actual login success from the result, not just job status
        const actualSuccess = status === 'completed' && result && result.success === true;
        const loginJobCompleteEvent = new CustomEvent('login-job-complete', {
          detail: {
            gameName: job.gameName,
            action: 'login',
            success: actualSuccess,
            sessionToken: actualSuccess ? 'session-token' : null,
            message: finalMessage
          }
        });
        window.dispatchEvent(loginJobCompleteEvent);
        console.log(`Dispatched login-job-complete event for ${job.gameName} via event:`, { 
          status, 
          resultSuccess: result?.success, 
          actualSuccess, 
          message: finalMessage 
        });
      }
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