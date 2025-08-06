import { actionQueue } from '../config/queues';
import { JobData, JobProgress } from '../types/job-types';

export class ActionProducer {
  /**
   * Add a job to the unified action queue
   */
  static async addJob(jobData: JobData): Promise<string> {
    try {
      // Validate job data
      if (!jobData.userId || !jobData.gameCredentialId || !jobData.action) {
        throw new Error('Invalid job data: missing required fields');
      }
      
      // Generate unique job ID
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 11);
      const jobId = `${jobData.action}-${timestamp}-${randomId}`;
      
      // Add job to unified action queue (FIFO - no priority)
      const job = await actionQueue.add(
        jobData.action,
        jobData,
        {
          delay: 0, // No delay, process immediately
          jobId: jobId,
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
        }
      );

      const finalJobId = job.id || jobId;
      console.log(`Job added to action queue with ID: ${finalJobId} (action: ${jobData.action})`);
      return finalJobId;
    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw new Error(`Failed to add job to queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Get job status from queue
   */
  static async getJobStatus(jobId: string, action: string): Promise<JobProgress | null> {
    try {
      const job = await actionQueue.getJob(jobId);
      
      if (!job) {
        console.log(`Job ${jobId} not found in action-queue`);
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
        console.log(`Job ${jobId} is completed, checking for result...`);
        console.log(`Job ${jobId} returnvalue:`, job.returnvalue);
        console.log(`Job ${jobId} returnvalue type:`, typeof job.returnvalue);
        console.log(`Job ${jobId} returnvalue === null:`, job.returnvalue === null);
        console.log(`Job ${jobId} returnvalue === undefined:`, job.returnvalue === undefined);
        console.log(`Job ${jobId} job data:`, job.data);
        console.log(`Job ${jobId} job data result:`, job.data?.result);
         
        // First try to get result from job data (backup approach)
        if (job.data && job.data.result) {
          console.log(`Job ${jobId} found result in job data:`, job.data.result);
          result = job.data.result;
        } else if (job.returnvalue !== null && job.returnvalue !== undefined) {
          console.log(`Job ${jobId} found result in returnvalue:`, job.returnvalue);
          result = job.returnvalue;
        } else {
          console.log(`Job ${jobId} no result found in either job data or returnvalue`);
        }
      }
      
      console.log(`Job ${jobId} status:`, {
        state: stateString,
        progress: progressNumber,
        result: result,
        failedReason: failedReason
      });
      
      console.log(`Job ${jobId} full job object:`, {
        id: job.id,
        name: job.name,
        data: job.data,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        progress: job.progress,
        state: stateString
      });
      
      console.log(`Job ${jobId} returnvalue type:`, typeof job.returnvalue);
      console.log(`Job ${jobId} returnvalue JSON:`, JSON.stringify(job.returnvalue));
      
      // Additional debugging for completed jobs
      if (stateString === 'completed') {
        console.log(`Job ${jobId} is completed, checking returnvalue...`);
        console.log(`Job ${jobId} returnvalue directly:`, job.returnvalue);
        console.log(`Job ${jobId} returnvalue === null:`, job.returnvalue === null);
        console.log(`Job ${jobId} returnvalue === undefined:`, job.returnvalue === undefined);
        
        // Try to get the job again to see if it's a timing issue
        const jobAgain = await actionQueue.getJob(jobId);
        if (jobAgain) {
          console.log(`Job ${jobId} re-fetched returnvalue:`, jobAgain.returnvalue);
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
            console.log(`Job ${jobId} completed status message:`, statusMessage);
            console.log(`Job ${jobId} result object:`, result);
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
   * Cancel a specific job by ID
   */
  static async cancelJob(jobId: string): Promise<boolean> {
    try {
      console.log(`=== CANCELLING JOB ${jobId} ===`);
      
      console.log(`Got action queue, looking for job ${jobId}`);
      
      // Get the specific job by ID
      const job = await actionQueue.getJob(jobId);
      
      if (!job) {
        console.log(`❌ Job ${jobId} not found in action-queue`);
        return false;
      }

      console.log(`✅ Found job ${jobId} in action-queue`);
      console.log(`Job data:`, job.data);
      console.log(`Job ID:`, job.id);
      console.log(`Job name:`, job.name);

      // Check if job can be cancelled (waiting, prioritized, or active jobs)
      const state = await job.getState();
      console.log(`Job ${jobId} state:`, state);
      
      if (state !== 'waiting' && state !== 'prioritized' && state !== 'active') {
        console.log(`❌ Job ${jobId} cannot be cancelled - it is in ${state} state`);
        return false;
      }

      if (state === 'waiting' || state === 'prioritized') {
        console.log(`✅ Job ${jobId} is in ${state} state, removing from queue`);
        // Remove the specific job from the action queue
        console.log(`🗑️ Removing job ${jobId} from action-queue...`);
        await job.remove();
      } else if (state === 'active') {
        console.log(`✅ Job ${jobId} is in active state, marking as cancelled`);
        // Mark job as cancelled so worker can check and skip processing
        const jobData = { ...job.data, cancelled: true, cancelledAt: Date.now() };
        console.log(`Marking job ${jobId} as cancelled:`, jobData);
        await job.updateData(jobData);
      }
      
      console.log(`✅ Job ${jobId} cancelled successfully`);
      return true;
    } catch (error) {
      console.error('❌ Error cancelling job:', error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(action: string) {
    try {
      const waiting = await actionQueue.getWaiting();
      const active = await actionQueue.getActive();
      const completed = await actionQueue.getCompleted();
      const failed = await actionQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return null;
    }
  }
} 