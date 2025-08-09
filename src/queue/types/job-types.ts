export interface JobData {
  userId: string;
  gameCredentialId: number;
  action: string;
  params: any;
  teamId: number;
  gameName: string;
  result?: JobResult; // Store the job result in the job data
  cancelled?: boolean; // Flag to mark job as cancelled
  cancelledAt?: number; // Timestamp when job was cancelled
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
  params?: any; // Job parameters
}

export type ActionType = string; // Allow any action name since they're dynamic

export interface QueueJob {
  id: string;
  data: JobData;
  progress: JobProgress;
  timestamp: number;
  priority: number;
} 