#!/usr/bin/env node

import 'dotenv/config'; // Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });
import { GlobalWorker } from './workers/global-worker';
import { testRedisConnection } from './config/redis';
import { screenshotWebSocketServer } from '@/utils/websocket-server';

async function startGlobalWorker() {
  try {
    console.log('Starting Global BullMQ Worker (1 job at a time)...');
    
    // Initialize WebSocket server for screenshot broadcasting
    console.log('Initializing WebSocket server...');
    screenshotWebSocketServer.initialize(8080);
    console.log('WebSocket server started on port 8080');
    
    // Test Redis connection
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      console.error('Failed to connect to Redis. Make sure Redis is running.');
      process.exit(1);
    }
    
    // Initialize global worker
    const worker = new GlobalWorker();
    
    console.log('Global worker started successfully');
    console.log('Worker stats:', worker.getWorkerStats());
    console.log('Processing: 1 job at a time globally');
    console.log('WebSocket server ready for connections');
    
    // Keep the process running
    process.on('SIGTERM', async () => {
      console.log('Shutting down global worker...');
      await worker.close();
      screenshotWebSocketServer.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('Shutting down global worker...');
      await worker.close();
      screenshotWebSocketServer.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error starting global worker:', error);
    process.exit(1);
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  startGlobalWorker();
}

export { startGlobalWorker }; 