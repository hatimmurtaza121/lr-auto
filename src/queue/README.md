# BullMQ Queue System

This directory contains the BullMQ queue system implementation for handling game automation actions.

## Overview

The queue system allows users to execute multiple actions concurrently. Actions are queued and processed in **FIFO (First In, First Out)** order using a single unified queue:

- **Single Queue**: All actions go to the same `action-queue`
- **FIFO Processing**: Jobs are executed in the order they were added
- **Simple & Predictable**: No complex priority logic

## Architecture

### Components

- **Producers** (`src/queue/producers/`): Add jobs to the unified action queue
- **Workers** (`src/queue/workers/`): Process jobs from the action queue
- **Config** (`src/queue/config/`): Redis and queue configuration
- **Types** (`src/queue/types/`): TypeScript interfaces

### Queue

All actions use a single unified queue:
- `action-queue` - Processes all action types (login, newAccount, passwordReset, recharge, redeem)

## Setup

### 1. Install Dependencies

```bash
npm install bullmq ioredis
```

### 2. Start Redis

```bash
docker run -d -p 6379:6379 --name redis redis
```

### 3. Start Workers

```bash
npm run workers
```

### 4. Test the System

```bash
npx ts-node src/queue/test-queue.ts
```

## API Endpoints

### Add Job to Queue
```
POST /api/queue/add-job
```

### Get Job Status
```
GET /api/queue/job-status?jobId={jobId}&action={action}
```

### Get Queue Statistics
```
GET /api/queue/queue-status?action={action}
```

## Usage

### Frontend Integration

The frontend automatically uses the queue system when calling `/api/execute-action`. The response includes a `jobId` that can be used to monitor progress.

### Job Status Polling

The frontend polls job status every 2 seconds until completion:

```typescript
const pollJobStatus = async () => {
  const response = await fetch(`/api/queue/job-status?jobId=${jobId}&action=${action}`);
  const status = await response.json();
  
  if (status.status === 'completed') {
    // Handle completion
  } else if (status.status === 'failed') {
    // Handle failure
  } else {
    // Continue polling
    setTimeout(pollJobStatus, 2000);
  }
};
```

## Error Handling

### Unexpected Errors

When a job fails due to an unexpected error, the worker returns:

```json
{
  "success": false,
  "message": "Unexpected error",
  "error": "Error details"
}
```

The frontend displays "Unexpected error" for these cases.

### Job States

- `waiting`: Job is in queue
- `active`: Job is being processed
- `completed`: Job finished successfully
- `failed`: Job failed

## Configuration

### Redis Configuration

Update `src/queue/config/redis.ts` to modify Redis connection settings:

```typescript
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};
```

### Queue Configuration

Update `src/queue/config/queues.ts` to modify queue settings:

```typescript
defaultJobOptions: {
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 50, // Keep last 50 failed jobs
  attempts: 1, // No retries - if job fails, leave it as failed
  backoff: {
    type: 'exponential',
    delay: 2000, // Start with 2 seconds delay (not used since attempts=1)
  },
}
```

## Monitoring

### Worker Statistics

Get worker statistics:

```typescript
import { getActionWorker } from './workers/init-workers';

const worker = getActionWorker();
const stats = worker.getWorkerStats();
console.log(stats);
```

### Queue Statistics

Get queue statistics via API:

```bash
curl "http://localhost:3000/api/queue/queue-status?action=newAccount"
```

## FIFO Processing

### How It Works

1. **Job Added**: `login` job added to action queue
2. **Job Added**: `redeem` job added to action queue  
3. **Job Added**: `passwordReset` job added to action queue
4. **Execution Order**: `login` → `redeem` → `passwordReset` (FIFO)

### Benefits

- **Simple**: No complex priority logic
- **Predictable**: Jobs execute in exact order they were added
- **Fair**: No job can jump ahead of others
- **Easy to Debug**: All jobs in one queue

## Troubleshooting

### Redis Connection Issues

1. Ensure Redis is running: `docker ps | grep redis`
2. Check Redis logs: `docker logs redis`
3. Test connection: `npx ts-node src/queue/test-queue.ts`

### Worker Issues

1. Check worker logs for errors
2. Restart workers: `npm run workers`
3. Check job status via API

### Job Processing Issues

1. Check job status: `GET /api/queue/job-status?jobId={id}&action={action}`
2. Check queue stats: `GET /api/queue/queue-status?action={action}`
3. Review worker logs for detailed error information 