


import { QueuePro as Queue } from '@taskforcesh/bullmq-pro';
import { createRedisConnection } from './redis';
import { JobData } from '../types/job-types';

// Team queue manager for dynamic queue creation
export class TeamQueueManager {
  private teamQueues = new Map<number, Queue<JobData>>();
  private redisConnection: any;

  constructor() {
    this.redisConnection = createRedisConnection();
  }

  /**
   * Get or create a team queue
   */
  getTeamQueue(teamId: number): Queue<JobData> {
    if (!this.teamQueues.has(teamId)) {
      this.teamQueues.set(teamId, this.createTeamQueue(teamId));
    }
    return this.teamQueues.get(teamId)!;
  }

  /**
   * Create a new team queue with platform grouping
   */
  private createTeamQueue(teamId: number): Queue<JobData> {
    return new Queue<JobData>(`team-${teamId}-queue`, {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 1, // No retries - if job fails, leave it as failed
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 seconds delay (not used since attempts=1)
        },
      },
    });
  }

  /**
   * Add job to team queue with platform grouping
   */
  async addJob(teamId: number, gameId: number, jobData: JobData): Promise<string> {
    const queue = this.getTeamQueue(teamId);
    
    // Generate unique job ID
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 11);
    const jobId = `${jobData.action}-${teamId}-${gameId}-${timestamp}-${randomId}`;
    
    // Add job to team queue with game grouping
    const job = await queue.add(
      jobData.action,
      jobData,
      {
        delay: 0, // No delay, process immediately
        jobId: jobId,
        group: {
          id: `game-${gameId}` // Group by game ID
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    return job.id || jobId;
  }

  /**
   * Get job status from team queue
   */
  async getJobStatus(teamId: number, jobId: string): Promise<any> {
    const queue = this.getTeamQueue(teamId);
    return await queue.getJob(jobId);
  }

  /**
   * Cancel job in team queue
   */
  async cancelJob(teamId: number, jobId: string): Promise<boolean> {
    const queue = this.getTeamQueue(teamId);
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return false;
    }

    const state = await job.getState();
    
    if (state !== 'waiting' && state !== 'prioritized' && state !== 'active') {
      return false;
    }

    if (state === 'waiting' || state === 'prioritized') {
      await job.remove();
    } else if (state === 'active') {
      const jobData = { ...job.data, cancelled: true, cancelledAt: Date.now() };
      await job.updateData(jobData);
    }
    
    return true;
  }

  /**
   * Get queue statistics for a team
   */
  async getQueueStats(teamId: number) {
    const queue = this.getTeamQueue(teamId);
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  /**
   * Get all team queues
   */
  getAllQueues(): Map<number, Queue<JobData>> {
    return this.teamQueues;
  }

  /**
   * Close all queues
   */
  async closeAll() {
    const closePromises = Array.from(this.teamQueues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    this.teamQueues.clear();
  }
}

// Export singleton instance
export const teamQueueManager = new TeamQueueManager();

// Legacy exports for backward compatibility (will be removed)
export const QUEUE_NAMES = {
  ACTION: 'action-queue'
} as const;

export const createQueue = (name: string) => {
  return new Queue<JobData>(name, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 1,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });
};

// Legacy action queue (deprecated)
export const actionQueue = createQueue(QUEUE_NAMES.ACTION); 