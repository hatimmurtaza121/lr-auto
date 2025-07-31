export interface JobData {
  userId: string;
  gameCredentialId: number;
  action: string;
  params: any;
  teamId: number;
  gameName: string;
  result?: JobResult; // Store the job result in the job data
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: any;
  needsLogin?: boolean;
  gameInfo?: any;
  logs?: string[];
  error?: string;
}

export interface JobProgress {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  message: string;
  result?: JobResult;
  error?: string;
  startTime?: number; // When job started processing (from BullMQ processedOn)
  endTime?: number; // When job completed/failed (from BullMQ finishedOn)
  duration?: number; // Total execution time in milliseconds
}

export type ActionType = 'login' | 'newAccount' | 'passwordReset' | 'recharge' | 'redeem';

export interface QueueJob {
  id: string;
  data: JobData;
  progress: JobProgress;
  timestamp: number;
  priority: number;
} 