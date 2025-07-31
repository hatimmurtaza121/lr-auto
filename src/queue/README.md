# BullMQ Queue System

This directory contains the BullMQ queue system implementation for handling game automation actions.

## Overview

The queue system allows users to execute multiple actions concurrently. Actions are queued and processed by workers in order of priority:

1. **Login** (Highest priority)
2. **New Account**
3. **Password Reset**
4. **Recharge**
5. **Redeem** (Lowest priority)

## Architecture

### Components

- **Producers** (`src/queue/producers/`): Add jobs to queues
- **Workers** (`src/queue/workers/`): Process jobs from queues
- **Config** (`src/queue/config/`): Redis and queue configuration
- **Types** (`src/queue/types/`): TypeScript interfaces

### Queues

Each action type has its own queue:
- `login-queue`
- `new-account-queue`
- `password-reset-queue`
- `recharge-queue`
- `redeem-queue`
- `general-queue` (fallback)

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
  attempts: 3, // Retry failed jobs up to 3 times
  backoff: {
    type: 'exponential',
    delay: 2000, // Start with 2 seconds delay
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