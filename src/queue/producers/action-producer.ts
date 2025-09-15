import { teamQueueManager } from '../config/queues';
import { JobData, JobProgress } from '../types/job-types';
import { screenshotWebSocketServer } from '@/utils/websocket-server';

export class ActionProducer {
  /**
   * Add a job to the team queue with platform grouping
   */
  static async addJob(jobData: JobData): Promise<string> {
    try {
      // Validate job data
      if (!jobData.userId || !jobData.gameCredentialId || !jobData.action || !jobData.teamId || !jobData.gameId) {
        throw new Error('Invalid job data: missing required fields (userId, gameCredentialId, action, teamId, gameId)');
      }
      
      // Add job to team queue with game grouping (serial processing per game within team)
      const jobId = await teamQueueManager.addJob(jobData.teamId, jobData.gameId, jobData);
      
      console.log(`Job added to team-${jobData.teamId} queue with game-${jobData.gameId} grouping, ID: ${jobId} (action: ${jobData.action})`);
      
      // Note: For grouped jobs, waiting jobs are fetched via API using getGroupJobs()
      // No need to broadcast waiting events as they don't work properly with groups
      
      return jobId;
    } catch (error) {
      console.error('Error adding job to team queue:', error);
      throw new Error(`Failed to add job to team queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add multiple jobs to the queue
   */
  static async addJobs(jobsData: JobData[]): Promise<string[]> {
    const jobIds: string[] = [];
    
    for (const jobData of jobsData) {
      try {
        const jobId = await this.addJob(jobData);
        jobIds.push(jobId);
      } catch (error) {
        console.error(`Error adding job for ${jobData.action}:`, error);
        throw error;
      }
    }
    
    return jobIds;
  }

  /**
   * Get job status from team queue
   */
  static async getJobStatus(jobId: string, teamId: number): Promise<JobProgress | null> {
    try {
      const job = await teamQueueManager.getJobStatus(teamId, jobId);
      
      if (!job) {
        console.log(`Job ${jobId} not found in team-${teamId} queue`);
        return null;
      }

      const state = await job.getState();
      const progress = job.progress; // progress is a property, not a method
      let result = job.returnvalue;
      const failedReason = job.failedReason;
      const progressNumber = typeof progress === 'number' ? progress : 0;
      const stateString = String(state);

      // If job is completed, try to get result from job data first, then returnvalue
      if (stateString === 'completed') {
        // console.log(`Job ${jobId} is completed, checking for result...`);
        // console.log(`Job ${jobId} returnvalue:`, job.returnvalue);
        // console.log(`Job ${jobId} returnvalue type:`, typeof job.returnvalue);
        // console.log(`Job ${jobId} returnvalue === null:`, job.returnvalue === null);
        // console.log(`Job ${jobId} returnvalue === undefined:`, job.returnvalue === undefined);
        // console.log(`Job ${jobId} job data:`, job.data);
        // console.log(`Job ${jobId} job data result:`, job.data?.result);
         
        // First try to get result from job data (backup approach)
        if (job.data && job.data.result) {
          // console.log(`Job ${jobId} found result in job data:`, job.data.result);
          result = job.data.result;
        } else if (job.returnvalue !== null && job.returnvalue !== undefined) {
          // console.log(`Job ${jobId} found result in returnvalue:`, job.returnvalue);
          result = job.returnvalue;
        } else {
          // console.log(`Job ${jobId} no result found in either job data or returnvalue`);
        }
      }
      
      // console.log(`Job ${jobId} status:`, {
      //   state: stateString,
      //   progress: progressNumber,
      //   result: result,
      //   failedReason: failedReason
      // });
      
      // console.log(`Job ${jobId} full job object:`, {
      //   id: job.id,
      //   name: job.name,
      //   data: job.data,
      //   returnvalue: job.returnvalue,
      //   failedReason: job.failedReason,
      //   progress: job.progress,
      //   state: stateString
      // });
      
      // console.log(`Job ${jobId} returnvalue type:`, typeof job.returnvalue);
      // console.log(`Job ${jobId} returnvalue JSON:`, JSON.stringify(job.returnvalue));
      
      // Additional debugging for completed jobs
      if (stateString === 'completed') {
        // console.log(`Job ${jobId} is completed, checking returnvalue...`);
        // console.log(`Job ${jobId} returnvalue directly:`, job.returnvalue);
        // console.log(`Job ${jobId} returnvalue === null:`, job.returnvalue === null);
        // console.log(`Job ${jobId} returnvalue === undefined:`, job.returnvalue === undefined);
        
        // Try to get the job again to see if it's a timing issue
        const jobAgain = await actionQueue.getJob(jobId);
        if (jobAgain) {
          // console.log(`Job ${jobId} re-fetched returnvalue:`, jobAgain.returnvalue);
        }
      }

      // Generate status message inline
      let statusMessage: string;
      let finalStatus = state as 'waiting' | 'active' | 'completed' | 'failed' | 'cancelled';
      
      // Check if job was cancelled (even if it's in completed state)
      if (job.data && job.data.cancelled) {
        finalStatus = 'cancelled';
        statusMessage = 'Job cancelled by user';
      } else {
        switch (stateString) {
          case 'waiting':
            statusMessage = 'Job is waiting in queue...';
            break;
          case 'active':
            statusMessage = 'Processing...';
            break;
          case 'completed':
            statusMessage = result?.message || 'Job completed successfully';
            // console.log(`Job ${jobId} completed status message:`, statusMessage);
            // console.log(`Job ${jobId} result object:`, result);
            break;
          case 'failed':
            statusMessage = failedReason || 'Job failed';
            break;
          case 'cancelled':
            statusMessage = 'Job cancelled by user';
            break;
          default:
            statusMessage = 'Unknown status';
        }
      }

      // Use BullMQ's built-in timing information
      const timestamp = job.timestamp; // When job was created
      const processedOn = job.processedOn; // When job started processing
      const finishedOn = job.finishedOn; // When job finished
      
      let duration: number | undefined;
      if (processedOn && finishedOn) {
        duration = finishedOn - processedOn;
      } else if (processedOn && (stateString === 'completed' || stateString === 'failed')) {
        // If job is completed/failed but no finishedOn, calculate from current time
        duration = Date.now() - processedOn;
      }

      return {
        jobId,
        status: finalStatus,
        progress: progressNumber,
        message: statusMessage,
        result: result || undefined,
        error: failedReason || undefined,
        startTime: processedOn,
        endTime: finishedOn,
        duration,
        params: job.data?.params, // Include job parameters
      };
    } catch (error) {
      console.error('Error getting job status:', error);
      return null;
    }
  }

  /**
   * Get status message based on job state
   */
  static getStatusMessage(state: string, progress: number): string {
    switch (state) {
      case 'waiting':
        return 'Job is waiting in queue...';
      case 'active':
        return 'Processing...';
      case 'completed':
        return 'Job completed successfully';
      case 'failed':
        return 'Job failed';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Cancel a specific job by ID in team queue
   */
  static async cancelJob(jobId: string, teamId: number): Promise<boolean> {
    try {
      console.log(`=== CANCELLING JOB ${jobId} IN TEAM ${teamId} ===`);
      
      return await teamQueueManager.cancelJob(teamId, jobId);
    } catch (error) {
      console.error('Error cancelling job:', error);
      return false;
    }
  }

  /**
   * Get queue statistics for a team
   */
  static async getQueueStats(teamId: number) {
    try {
      return await teamQueueManager.getQueueStats(teamId);
    } catch (error) {
      console.error('Error getting team queue stats:', error);
      return null;
    }
  }
}