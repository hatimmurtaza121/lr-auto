import { Worker, Job } from 'bullmq';
import { actionQueue } from '../config/queues';
import { createRedisConnection } from '../config/redis';
import { loginWithSession, executeDynamicActionWithSession } from '@/utils/action-wrappers';
import { screenshotWebSocketServer } from '@/utils/websocket-server';
import { updateGameStatus } from '@/utils/game-status';

export class GlobalWorker {
  private worker: Worker;
  private isProcessing = false;

  constructor() {
    this.worker = new Worker('action-queue', async (job: Job) => {
      await this.processJob(job);
    }, {
      connection: createRedisConnection(),
      concurrency: 1, // Process one job at a time (FIFO)
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
      settings: {
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Max number of times a job can be stalled
      }
    });

    // Set up event handlers
    this.worker.on('completed', (job) => {
      // console.log(`Job ${job.id} completed successfully`);
      this.broadcastWorkerStatus(false);
    });

    this.worker.on('failed', (job, err) => {
      if (job) {
        console.log(`Job ${job.id} failed:`, err.message);
        // Broadcast failure status
        this.broadcastWorkerStatus(false, `Job failed: ${err.message}`, [`Job failed: ${err.message}`]);
      }
      this.broadcastWorkerStatus(false);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
      this.broadcastWorkerStatus(false, `Worker error: ${err.message}`, [`Worker error: ${err.message}`]);
    });
  }

  private broadcastWorkerStatus(isExecuting: boolean, currentLog?: string, allLogs?: string[]) {
    if (screenshotWebSocketServer.isServerInitialized()) {
      screenshotWebSocketServer.broadcastWorkerStatus(isExecuting, currentLog, allLogs);
    }
  }

  private dispatchScriptResult(jobId: string, result: any) {
    // Log the script result for debugging
    // The result will be passed through the existing job status polling system
    // The ActionStatus component will receive it via the job status API
  }

  async processJob(job: Job) {
    const data = job.data;
    let result: any;

    // Broadcast that worker is starting execution
    this.broadcastWorkerStatus(true, `Starting ${data.action}...`, [`Starting ${data.action}...`]);

    try {
      await job.updateProgress(10);

      // Handle all actions dynamically
      await job.updateProgress(20);
      this.broadcastWorkerStatus(true, `Processing ${data.action}...`, [`Processing ${data.action}...`]);
      
      // Create timeout for job execution (60 seconds)
      const timeoutMs = 60000;
      let executionAborted = false;
      
      // Create AbortController for proper cleanup
      const abortController = new AbortController();
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          executionAborted = true;
          abortController.abort(); // Signal abort to any listening operations
          reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      // Create execution promise with cleanup
      const executionPromise = (async () => {
        try {
          if (data.action === 'login') {
            // Special handling for login (needs teamId)
            return await loginWithSession(
              data.userId,
              data.gameCredentialId,
              data.params || {},
              data.teamId
            );
          } else {
            // Use dynamic executor for all other actions
            return await executeDynamicActionWithSession(
              data.userId,
              data.gameCredentialId,
              data.action,
              data.params || {}
            );
          }
        } catch (error) {
          // If execution was aborted due to timeout, ensure cleanup
          if (executionAborted) {
            console.log(`Job ${job.id}: Execution aborted due to timeout, cleaning up resources...`);
            // Force cleanup of any remaining browser resources
            try {
              // Import and call cleanup function if available
              const { cleanupBrowserResources } = await import('@/utils/browser-cleanup');
              await cleanupBrowserResources();
            } catch (cleanupError) {
              console.error(`Job ${job.id}: Failed to cleanup browser resources:`, cleanupError);
            }
          }
          throw error;
        }
      })();
      
      // Race between execution and timeout
      result = await Promise.race([executionPromise, timeoutPromise]);

      await job.updateProgress(100);
      
      // Calculate execution time using BullMQ's built-in timing
      const processedOn = job.processedOn;
      const finishedOn = job.finishedOn || Date.now();
      const executionTimeSecs = processedOn && finishedOn ? (finishedOn - processedOn) / 1000 : undefined;
      
      // Save action status to database
      try {
        const { getGame } = await import('@/utils/game-mapping');
        const game = await getGame(data.gameName);
        if (game) {
          // Use params as-is since they're already in snake_case from the API
          const inputs = data.params || {};
          const actionName = data.action;
          
          await updateGameStatus({
            teamId: data.teamId,
            gameId: game.id,
            action: actionName,
            status: result?.success ? 'success' : 'fail',
            inputs: inputs,
            executionTimeSecs: executionTimeSecs
          });
          
        }
      } catch (statusError) {
        console.error(`Job ${job.id}: Failed to save action status:`, statusError);
      }
      
      // Dispatch the script result
      this.dispatchScriptResult(job.id || 'unknown', result);
      
      // Broadcast completion
      const completionMessage = result?.message || 'Job completed successfully';
      this.broadcastWorkerStatus(false, completionMessage, [completionMessage]);

      // Ensure the result is properly returned and stored
      
      // Make sure result is serializable and explicitly return it
      const serializedResult = JSON.parse(JSON.stringify(result));
      
      // Store result in job data as backup
      try {
        const jobData = { ...job.data, result: serializedResult };
        await job.updateData(jobData);
      } catch (updateError) {
        // console.log(`Job ${job.id}: Failed to update job data:`, updateError);
      }
      
      // Explicitly return the result
      return serializedResult;
    } catch (error) {
      console.error(`Job ${job.id} failed with error:`, error);
      
      // Calculate execution time using BullMQ's built-in timing for failed jobs
      const processedOn = job.processedOn;
      const finishedOn = job.finishedOn || Date.now();
      const executionTimeSecs = processedOn && finishedOn ? (finishedOn - processedOn) / 1000 : undefined;
      
      // Save failed action status to database
      try {
        const { getGame } = await import('@/utils/game-mapping');
        const game = await getGame(data.gameName);
        if (game) {
          // Use params as-is since they're already in snake_case from the API
          const inputs = data.params || {};
          
          await updateGameStatus({
            teamId: data.teamId,
            gameId: game.id,
            action: data.action, // Already in snake_case from API
            status: 'fail',
            inputs: inputs,
            executionTimeSecs: executionTimeSecs
          });
          
        }
      } catch (statusError) {
        console.error(`Job ${job.id}: Failed to save failed action status:`, statusError);
      }
      
      // Determine if this is an expected error or unexpected error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isUnexpectedError = !errorMessage.includes('Session expired') && 
                               !errorMessage.includes('Game credential not found') &&
                               !errorMessage.includes('Target username is required') &&
                               !errorMessage.includes('Amount should be greater than 0');
      
      const finalErrorMessage = isUnexpectedError 
        ? `Unexpected error: ${errorMessage}` 
        : errorMessage;
      
      // Broadcast error
      this.broadcastWorkerStatus(false, finalErrorMessage, [finalErrorMessage]);
      
      // For unexpected errors, we don't want to retry, so we throw the error
      // For expected errors, we also don't retry as per requirements
      throw new Error(finalErrorMessage);
    }
  }

  getWorkerStats() {
    return {
      isRunning: this.worker.isRunning(),
      concurrency: this.worker.concurrency,
      queues: ['action-queue']
    };
  }

  async close() {
    await this.worker.close();
  }
} 