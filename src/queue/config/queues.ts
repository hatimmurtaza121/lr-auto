


import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';
import { JobData } from '../types/job-types';

// Single unified queue name
export const QUEUE_NAMES = {
  ACTION: 'action-queue'
} as const;

// Create queue
export const createQueue = (name: string) => {
  return new Queue<JobData>(name, {
    connection: createRedisConnection(),
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
};

// Create the unified action queue
export const actionQueue = createQueue(QUEUE_NAMES.ACTION); 