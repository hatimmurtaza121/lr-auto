


import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';
import { JobData } from '../types/job-types';

// Queue names
export const QUEUE_NAMES = {
  LOGIN: 'login-queue',
  NEW_ACCOUNT: 'new-account-queue',
  PASSWORD_RESET: 'password-reset-queue',
  RECHARGE: 'recharge-queue',
  REDEEM: 'redeem-queue',
  GENERAL: 'general-queue',
  GLOBAL: 'global-queue'
} as const;

// Create queues
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

// Create specific queues
export const loginQueue = createQueue(QUEUE_NAMES.LOGIN);
export const newAccountQueue = createQueue(QUEUE_NAMES.NEW_ACCOUNT);
export const passwordResetQueue = createQueue(QUEUE_NAMES.PASSWORD_RESET);
export const rechargeQueue = createQueue(QUEUE_NAMES.RECHARGE);
export const redeemQueue = createQueue(QUEUE_NAMES.REDEEM);
export const generalQueue = createQueue(QUEUE_NAMES.GENERAL);
export const globalQueue = createQueue(QUEUE_NAMES.GLOBAL);

// Get queue by action type
export const getQueueByAction = (action: string) => {
  switch (action) {
    case 'login':
      return loginQueue;
    case 'newAccount':
      return newAccountQueue;
    case 'passwordReset':
      return passwordResetQueue;
    case 'recharge':
      return rechargeQueue;
    case 'redeem':
      return redeemQueue;
    default:
      return generalQueue;
  }
};

// Get queue priority by action type
export const getQueuePriority = (action: string): number => {
  switch (action) {
    case 'login':
      return 1; // Highest priority
    case 'newAccount':
      return 2;
    case 'passwordReset':
      return 3;
    case 'recharge':
      return 4;
    case 'redeem':
      return 5;
    default:
      return 10; // Lowest priority
  }
}; 