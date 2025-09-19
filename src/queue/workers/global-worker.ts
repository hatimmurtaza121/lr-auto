import { WorkerPro as Worker, JobPro as Job } from '@taskforcesh/bullmq-pro';
import { teamQueueManager } from '../config/queues';
import { createRedisConnection } from '../config/redis';
import { loginWithSession, executeDynamicActionWithSession } from '@/utils/action-wrappers';
import { screenshotWebSocketServer } from '@/utils/websocket-server';
import { updateGameStatus } from '@/utils/game-status';

export class GlobalWorker {
  private teamWorkers = new Map<number, Worker>();
  private isProcessing = false;

  constructor() {
    // Initialize workers dynamically from database
    this.initializeTeamWorkers().then(() => {
      // Start monitoring queue events after workers are initialized
      this.startQueueMonitoring();
    }).catch(error => {
      console.error('Failed to initialize team workers:', error);
    });
  }

  private async initializeTeamWorkers() {
    try {
      // Fetch teams from database
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      const { data: teams, error } = await supabase
        .from('team')
        .select('id')
        .order('id');
        
      if (error) {
        console.error('Error fetching teams from database:', error);
        // Fallback to hardcoded teams 1-6
        console.log('Falling back to hardcoded teams 1-6');
        for (let teamId = 1; teamId <= 6; teamId++) {
          this.createTeamWorker(teamId);
        }
        return;
      }
      
      if (teams && teams.length > 0) {
        console.log(`Found ${teams.length} teams in database:`, teams.map(t => t.id));
        for (const team of teams) {
          this.createTeamWorker(team.id);
        }
      } else {
        console.log('No teams found in database, falling back to hardcoded teams 1-6');
        for (let teamId = 1; teamId <= 6; teamId++) {
          this.createTeamWorker(teamId);
        }
      }
    } catch (error) {
      console.error('Error initializing team workers:', error);
      // Fallback to hardcoded teams 1-6
      console.log('Falling back to hardcoded teams 1-6');
      for (let teamId = 1; teamId <= 6; teamId++) {
        this.createTeamWorker(teamId);
      }
    }
  }

  private createTeamWorker(teamId: number) {
    const queue = teamQueueManager.getTeamQueue(teamId);
    
    const worker = new Worker(`team-${teamId}-queue`, async (job: Job) => {
      await this.processJob(job);
    }, {
      connection: createRedisConnection(),
      concurrency: 3, // 3 jobs per team
      group: {
        concurrency: 1 // Only 1 job per group at a time (this is the key fix!)
      },
      removeOnComplete: { count: 50 }, // Keep more completed jobs
      removeOnFail: { count: 20 },
    });

    // Set up event handlers for this team worker
    worker.on('completed', (job) => {
      console.log(`Team ${teamId} - Job ${job.id} completed successfully`);
      this.broadcastWorkerStatus(false);
      
      // NEW: Broadcast job completion via WebSocket
      screenshotWebSocketServer.broadcastJobUpdate(job, 'completed');
    });

    worker.on('failed', (job, err) => {
      if (job) {
        console.log(`Team ${teamId} - Job ${job.id} failed:`, err.message);
        this.broadcastWorkerStatus(false, `Job failed: ${err.message}`, [`Job failed: ${err.message}`]);
        
        // NEW: Broadcast job failure via WebSocket
        screenshotWebSocketServer.broadcastJobUpdate(job, 'failed', { error: err.message });
      }
      this.broadcastWorkerStatus(false);
    });

    worker.on('error', (err) => {
      console.error(`Team ${teamId} worker error:`, err);
      this.broadcastWorkerStatus(false, `Worker error: ${err.message}`, [`Worker error: ${err.message}`]);
    });

    // NEW: Add progress event handler
    worker.on('progress', (job, progress) => {
      // console.log(`Team ${teamId} - Job ${job.id} progress: ${progress}%`);
      // Ensure progress is a number
      const progressValue = typeof progress === 'number' ? progress : 0;
      screenshotWebSocketServer.broadcastJobProgress(job, progressValue);
    });

    // Note: For grouped jobs, we don't use the 'waiting' event as it doesn't work with groups
    // Instead, we fetch waiting jobs using getGroupJobs() in the API

    this.teamWorkers.set(teamId, worker);
    console.log(`Team ${teamId} worker initialized with concurrency 3, group concurrency 1`);
  }

  private broadcastWorkerStatus(isExecuting: boolean, currentLog?: string, allLogs?: string[]) {
    if (screenshotWebSocketServer.isServerInitialized()) {
      screenshotWebSocketServer.broadcastWorkerStatus(isExecuting, currentLog, allLogs);
    }
  }

  private async broadcastGameLogUpdate(gameName: string, currentLog?: string, allLogs?: string[], gameCredentialId?: number) {
    if (screenshotWebSocketServer.isServerInitialized()) {
      let gameId = 0; // Default fallback
      
      // Try to get game ID from game credential if available
      if (gameCredentialId) {
        try {
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          
          const { data: gameCredential, error } = await supabase
            .from('game_credential')
            .select('game_id')
            .eq('id', gameCredentialId)
            .single();
            
          if (!error && gameCredential) {
            gameId = gameCredential.game_id;
          }
        } catch (error) {
          console.log('Could not get game ID for broadcast, using fallback:', error);
        }
      }
      
      screenshotWebSocketServer.broadcastLogUpdate(gameId, gameName, currentLog, allLogs);
    }
  }

  // NEW: Broadcast job added to queue
  async broadcastJobAdded(job: any) {
    if (screenshotWebSocketServer.isServerInitialized()) {
      screenshotWebSocketServer.broadcastJobUpdate(job, 'waiting');
    }
  }

  private dispatchScriptResult(jobId: string, result: any) {
    // Log the script result for debugging
    // The result will be passed through the existing job status polling system
    // The ActionStatus component will receive it via the job status API
  }

  private dispatchLoginJobComplete(gameName: string, result: any, teamId?: number, gameId?: number) {
    // Broadcast login completion via WebSocket so frontend can handle it
    if (screenshotWebSocketServer.isServerInitialized()) {
      // Use the existing broadcastScriptResult method with team and game filtering
      screenshotWebSocketServer.broadcastScriptResult('login-job', {
        type: 'login-job-complete',
        gameName: gameName,
        action: 'login',
        success: result?.success || false,
        sessionToken: result?.sessionToken || null,
        message: result?.message || 'Login completed'
      }, teamId?.toString(), gameId);
      console.log(`Login job completed for ${gameName} (teamId: ${teamId}, gameId: ${gameId}):`, result);
    }
  }

  async processJob(job: Job) {
    const data = job.data;
    let result: any;

    // NEW: Broadcast job started processing
    screenshotWebSocketServer.broadcastJobUpdate(job, 'active');

    // Broadcast that worker is starting execution
    this.broadcastWorkerStatus(true, `Starting ${data.action}...`, [`Starting ${data.action}...`]);
    await this.broadcastGameLogUpdate(data.gameName, `Starting ${data.action}...`, [`Starting ${data.action}...`], data.gameCredentialId);

    try {
      await job.updateProgress(10);

      // Handle all actions dynamically
      await job.updateProgress(20);
      this.broadcastWorkerStatus(true, `Processing ${data.action}...`, [`Processing ${data.action}...`]);
      await this.broadcastGameLogUpdate(data.gameName, `Processing ${data.action}...`, [`Processing ${data.action}...`], data.gameCredentialId);
      
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
            // Special handling for login (needs teamId and sessionId)
            return await loginWithSession(
              data.userId,
              data.gameCredentialId,
              data.params || {},
              data.teamId,
              data.sessionId      // Pass sessionId for screenshot tagging
            );
          } else {
            // Use dynamic executor for all other actions
            return await executeDynamicActionWithSession(
              data.userId,
              data.gameCredentialId,
              data.action,
              data.params || {},
              data.teamId,        // Pass teamId for screenshot tagging
              data.sessionId      // Pass sessionId for screenshot tagging
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

      // Check if result indicates session expired and needs login
      if (result && typeof result === 'object' && result.needsLogin === true) {
        console.log(`Job ${job.id}: Session expired, automatically triggering login for ${data.gameName}`);
        
        // Broadcast that we're triggering automatic login
        this.broadcastWorkerStatus(true, `Session expired, logging in...`, [`Session expired, logging in...`]);
        await this.broadcastGameLogUpdate(data.gameName, `Session expired, logging in...`, [`Session expired, logging in...`], data.gameCredentialId);
        
        try {
          // Get credentials from database for automatic login
          const sessionManager = (await import('@/utils/session-manager')).SessionManager.getInstance();
          const gameCredential = await sessionManager.getGameCredentialInfo(data.gameCredentialId);
          
          console.log(`Job ${job.id}: Retrieved credentials from database:`, {
            gameCredentialId: data.gameCredentialId,
            username: gameCredential.username,
            password: gameCredential.password ? '***' : 'EMPTY',
            gameName: gameCredential.game.name
          });
          
          // Check if credentials are empty
          if (!gameCredential.username || !gameCredential.password) {
            console.error(`Job ${job.id}: Credentials are empty in database for gameCredentialId=${data.gameCredentialId}`);
            result = {
              success: false,
              message: `No saved credentials found for ${data.gameName}. Please login manually first.`
            };
          } else {
            // Use the saved credentials for automatic login
            const loginParams = {
              username: gameCredential.username,
              password: gameCredential.password,
              teamId: data.teamId,
              sessionId: data.sessionId
            };
            
            console.log(`Job ${job.id}: Using saved credentials for automatic login: username=${gameCredential.username}`);
            
            // Ensure WebSocket server is available for screenshots during automatic login
            const { screenshotWebSocketServer } = await import('@/utils/websocket-server');
            if (!screenshotWebSocketServer.isServerInitialized()) {
              screenshotWebSocketServer.initialize(8080);
            }
            (global as any).screenshotWebSocketServer = screenshotWebSocketServer;
            
            // Trigger automatic login with saved credentials
            const loginResult = await loginWithSession(
              data.userId,
              data.gameCredentialId,
              loginParams,
              data.teamId,
              data.sessionId
            );
          
          if (loginResult.success) {
            console.log(`Job ${job.id}: Automatic login successful, retrying original action`);
            
            // Retry the original action after successful login
            this.broadcastWorkerStatus(true, `Login successful, retrying ${data.action}...`, [`Login successful, retrying ${data.action}...`]);
            await this.broadcastGameLogUpdate(data.gameName, `Login successful, retrying ${data.action}...`, [`Login successful, retrying ${data.action}...`], data.gameCredentialId);
            
            // Execute the original action again
            if (data.action === 'login') {
              result = loginResult; // If it was a login action, use the login result
            } else {
              result = await executeDynamicActionWithSession(
                data.userId,
                data.gameCredentialId,
                data.action,
                data.params || {},
                data.teamId,
                data.sessionId
              );
            }
          } else {
            console.log(`Job ${job.id}: Automatic login failed: ${loginResult.message}`);
            result = {
              success: false,
              message: `Automatic login failed: ${loginResult.message}`
            };
          }
          }
        } catch (loginError) {
          console.error(`Job ${job.id}: Error during automatic login:`, loginError);
          result = {
            success: false,
            message: `Automatic login error: ${loginError instanceof Error ? loginError.message : String(loginError)}`
          };
        }
      }

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
            userId: data.userId, // Add userId to track which user executed the action
            action: actionName,
            status: result?.success ? 'success' : 'fail',
            inputs: inputs,
            executionTimeSecs: executionTimeSecs,
            message: result?.message || null
          });
          
        }
      } catch (statusError) {
        console.error(`Job ${job.id}: Failed to save action status:`, statusError);
      }
      
      // Dispatch the script result
      this.dispatchScriptResult(job.id || 'unknown', result);
      
      // Dispatch login completion event if this is a login job
      if (data.action === 'login') {
        this.dispatchLoginJobComplete(data.gameName, result, data.teamId, data.gameId);
      }
      
      // Broadcast completion
      const completionMessage = result?.message || 'Job completed successfully';
      this.broadcastWorkerStatus(false, completionMessage, [completionMessage]);
      await this.broadcastGameLogUpdate(data.gameName, completionMessage, [completionMessage], data.gameCredentialId);

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
      
             // Determine if this is an expected error or unexpected error
       const errorMessage = error instanceof Error ? error.message : String(error);
       
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
             userId: data.userId, // Add userId to track which user executed the action
             action: data.action, // Already in snake_case from API
             status: 'fail',
             inputs: inputs,
             executionTimeSecs: executionTimeSecs,
             message: errorMessage
           });
           
         }
       } catch (statusError) {
         console.error(`Job ${job.id}: Failed to save failed action status:`, statusError);
       }
      const isUnexpectedError = !errorMessage.includes('Session expired') && 
                               !errorMessage.includes('Game credential not found') &&
                               !errorMessage.includes('Target username is required') &&
                               !errorMessage.includes('Amount should be greater than 0');
      
      const finalErrorMessage = isUnexpectedError 
        ? `Unexpected error: ${errorMessage}` 
        : errorMessage;
      
      // Broadcast error
      this.broadcastWorkerStatus(false, finalErrorMessage, [finalErrorMessage]);
      await this.broadcastGameLogUpdate(data.gameName, finalErrorMessage, [finalErrorMessage], data.gameCredentialId);
      
      // For unexpected errors, we don't want to retry, so we throw the error
      // For expected errors, we also don't retry as per requirements
      throw new Error(finalErrorMessage);
    }
  }

  // NEW: Start monitoring job events for real-time updates
  private async startQueueMonitoring() {
    console.log('Starting job monitoring for real-time updates...');
    
    // We'll use worker events which are more reliable than queue events
    // The worker events are already set up in createTeamWorker method
    // We just need to enhance them to broadcast job updates
    
    console.log('Job monitoring will use existing worker events');
  }

  getWorkerStats() {
    const teamStats = Array.from(this.teamWorkers.entries()).map(([teamId, worker]) => ({
      teamId,
      isRunning: worker.isRunning(),
      concurrency: worker.concurrency,
      queue: `team-${teamId}-queue`
    }));

    return {
      totalTeams: this.teamWorkers.size,
      teamStats,
      totalConcurrency: Array.from(this.teamWorkers.values()).reduce((sum, worker) => sum + worker.concurrency, 0)
    };
  }

  async close() {
    const closePromises = Array.from(this.teamWorkers.values()).map(worker => worker.close());
    await Promise.all(closePromises);
    this.teamWorkers.clear();
  }
}

// Export singleton instance
export const globalWorker = new GlobalWorker(); 