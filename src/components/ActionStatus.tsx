'use client';

import { useState, useEffect } from 'react';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

interface JobStatus {
  jobId: string;
  gameName: string;
  action: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'cancelled';
  message: string;
  timestamp: string;
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
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
  const updateJobStatus = (jobId: string, status: JobStatus['status'], message: string, result?: any, error?: string, timing?: { startTime?: number; endTime?: number; duration?: number }) => {
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

        return {
          ...job,
          status,
          message: finalMessage,
          result,
          error,
          timestamp: new Date().toLocaleTimeString(),
          ...timing, // Include timing information
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

  // Cancel a job
  const cancelJob = async (jobId: string) => {
    try {
      // Find the job to get the action type
      const job = jobs.find(j => j.jobId === jobId);
      if (!job) return;

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

      if (response.ok) {
        updateJobStatus(jobId, 'cancelled', 'Job cancelled by user');
      } else {
        console.error('Failed to cancel job:', response.statusText);
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
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
              });
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
      
      updateJobStatus(jobId, status, finalMessage, result, error, { startTime, endTime, duration });
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
                            </div>
                            {/* Display the script result message prominently */}
                            <p className={`text-sm font-medium mt-1 ${getMessageColor(job)}`}>
                              {job.message}
                            </p>
                            {/* Show additional result details if available */}
                            {job.result && job.status === 'completed' && (
                              <div className="mt-1">
                                {job.result.accountName && (
                                  <p className="text-xs text-gray-500">
                                    Account: {job.result.accountName}
                                  </p>
                                )}
                                {job.result.logs && job.result.logs.length > 0 && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    {job.result.logs.length} log entries
                                  </p>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {/* Cancel button for active jobs */}
                        {(job.status === 'waiting' || job.status === 'active') && (
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
                        {(job.status === 'completed' || job.status === 'failed') && job.duration ? (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatDuration(job.duration)}
                          </span>
                        ) : job.status === 'completed' ? (
                          <span className="text-xs text-red-400">
                            Debug: No duration
                          </span>
                        ) : null}
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