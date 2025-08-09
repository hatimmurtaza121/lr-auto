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
    });

    // Set up event handlers
    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
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
    console.log(`Job ${jobId}: Script result to be dispatched:`, result);
    console.log(`Job ${jobId}: Script message:`, result?.message);
    
    // The result will be passed through the existing job status polling system
    // The ActionStatus component will receive it via the job status API
  }

  async processJob(job: Job) {
    const data = job.data;
    let result: any;

    console.log(`=== WORKER PICKING UP JOB ${job.id} ===`);
    console.log(`Processing ${data.action} job for user ${data.userId}`);
    console.log(`Job ${job.id} state:`, await job.getState());
    console.log(`Job ${job.id} data:`, data);
    console.log(`Job ${job.id} timestamp:`, job.timestamp);
    console.log(`Job ${job.id} name:`, job.name);
    
    // Broadcast that worker is starting execution
    this.broadcastWorkerStatus(true, `Starting ${data.action}...`, [`Starting ${data.action}...`]);

    try {
      await job.updateProgress(10);
      console.log(`Job ${job.id}: Processing...`);

      // Handle all actions dynamically
      await job.updateProgress(20);
      console.log(`Job ${job.id}: Processing action: ${data.action}...`);
      this.broadcastWorkerStatus(true, `Processing ${data.action}...`, [`Processing ${data.action}...`]);
      
      if (data.action === 'login') {
        // Special handling for login (needs teamId)
        result = await loginWithSession(
          data.userId,
          data.gameCredentialId,
          data.params || {},
          data.teamId
        );
      } else {
        // Use dynamic executor for all other actions
        result = await executeDynamicActionWithSession(
          data.userId,
          data.gameCredentialId,
          data.action,
          data.params || {}
        );
      }

      await job.updateProgress(100);
      console.log(`Job ${job.id}: Completed successfully`);
      console.log(`Job ${job.id}: Result:`, result);
      console.log(`Job ${job.id}: Result type:`, typeof result);
      console.log(`Job ${job.id}: Result JSON:`, JSON.stringify(result));
      
      // Calculate execution time using BullMQ's built-in timing
      const processedOn = job.processedOn;
      const finishedOn = job.finishedOn || Date.now();
      const executionTimeSecs = processedOn && finishedOn ? (finishedOn - processedOn) / 1000 : undefined;
      
      console.log(`Job ${job.id}: BullMQ timing - processedOn: ${processedOn}, finishedOn: ${finishedOn}, executionTime: ${executionTimeSecs}s`);
      
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
          
          console.log(`Job ${job.id}: Action status saved to database (execution time: ${executionTimeSecs}s)`);
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
      console.log(`Job ${job.id}: Returning result to BullMQ:`, result);
      
      // Make sure result is serializable and explicitly return it
      const serializedResult = JSON.parse(JSON.stringify(result));
      console.log(`Job ${job.id}: Serialized result:`, serializedResult);
      console.log(`Job ${job.id}: About to return result...`);
      
      // Store result in job data as backup
      try {
        const jobData = { ...job.data, result: serializedResult };
        await job.updateData(jobData);
        console.log(`Job ${job.id}: Stored result in job data:`, jobData.result);
      } catch (updateError) {
        console.log(`Job ${job.id}: Failed to update job data:`, updateError);
      }
      
      // Explicitly return the result
      return serializedResult;
    } catch (error) {
      console.error(`Job ${job.id} failed with error:`, error);
      
      // Calculate execution time using BullMQ's built-in timing for failed jobs
      const processedOn = job.processedOn;
      const finishedOn = job.finishedOn || Date.now();
      const executionTimeSecs = processedOn && finishedOn ? (finishedOn - processedOn) / 1000 : undefined;
      
      console.log(`Job ${job.id}: BullMQ timing for failed job - processedOn: ${processedOn}, finishedOn: ${finishedOn}, executionTime: ${executionTimeSecs}s`);
      
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
          
          console.log(`Job ${job.id}: Failed action status saved to database (execution time: ${executionTimeSecs}s)`);
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