#!/usr/bin/env node

const { spawn } = require('child_process');
const net = require('net');

// Ports used by the project
const PORTS = {
  NEXT_DEV: 3000,
  WEBSOCKET: 8080,
  REDIS: 6379
};

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Start Redis with Docker
async function startRedis() {
  return new Promise((resolve, reject) => {
    console.log('Starting Redis with Docker...');
    
    // Try to start existing container first
    const startExisting = spawn('docker', ['start', 'redis'], { stdio: 'pipe' });
    
    startExisting.on('close', (code) => {
      if (code === 0) {
        console.log('Redis container started successfully!');
        setTimeout(() => resolve(), 2000);
      } else {
        // If start failed, create a new container
        console.log('Creating new Redis container...');
        const createNew = spawn('docker', [
          'run', '-d',
          '--name', 'redis',
          '-p', '6379:6379',
          'redis:alpine'
        ], { stdio: 'inherit' });

        createNew.on('close', (runCode) => {
          if (runCode === 0) {
            console.log('Redis container created and started successfully!');
            setTimeout(() => resolve(), 2000);
          } else {
            console.error('Failed to create Redis container');
            reject(new Error('Failed to create Redis container'));
          }
        });

        createNew.on('error', (error) => {
          console.error('Error creating Redis container:', error.message);
          reject(error);
        });
      }
    });

    startExisting.on('error', (error) => {
      console.error('Error starting Redis container:', error.message);
      reject(error);
    });
  });
}

// Check all required ports and start Redis if needed
async function checkPorts() {
  console.log('Checking required ports...');
  
  const portChecks = await Promise.all([
    isPortAvailable(PORTS.NEXT_DEV),
    isPortAvailable(PORTS.WEBSOCKET),
    isPortAvailable(PORTS.REDIS)
  ]);
  
  const [nextDevAvailable, websocketAvailable, redisAvailable] = portChecks;
  
  console.log(`Next.js dev server (port ${PORTS.NEXT_DEV}): ${nextDevAvailable ? 'Available' : 'In use'}`);
  console.log(`WebSocket server (port ${PORTS.WEBSOCKET}): ${websocketAvailable ? 'Available' : 'In use'}`);
  console.log(`Redis server (port ${PORTS.REDIS}): ${redisAvailable ? 'Not running' : 'Running'}`);
  
  // If Redis is not running, start it automatically
  if (redisAvailable) {
    console.log('\nRedis is not running. Starting Redis automatically...');
    try {
      await startRedis();
      console.log('Redis is now running and ready!');
    } catch (error) {
      console.error('\nFailed to start Redis automatically.');
      console.log('Please make sure Docker is installed and running.');
      console.log('You can also start Redis manually with:');
      console.log('docker run -d -p 6379:6379 --name redis redis:alpine');
      process.exit(1);
    }
  }
  
  if (!nextDevAvailable) {
    console.warn('\nPort 3000 is in use. Next.js dev server might fail to start.');
  }
  
  if (!websocketAvailable) {
    console.warn('\nPort 8080 is in use. WebSocket server might fail to start.');
  }
  
  return portChecks;
}

// Start the project
async function startProject() {
  try {
    console.log('Starting Game Automation Project...\n');
    
    // Check ports first
    await checkPorts();
    
    console.log('\nStarting services...');
    console.log('Next.js dev server will be available at: http://localhost:3000');
    console.log('WebSocket server will be available at: ws://localhost:8080');
    console.log('Global worker will process jobs from the queue');
    console.log('\nStarting both services...\n');
    
    // Start both services using concurrently
    const startAll = spawn('npm', ['run', 'start-all'], {
      stdio: 'inherit',
      shell: true
    });
    
    startAll.on('error', (error) => {
      console.error('Failed to start services:', error);
      process.exit(1);
    });
    
    startAll.on('close', (code) => {
      console.log(`\nServices stopped with code: ${code}`);
      process.exit(code);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nShutting down services...');
      startAll.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log('\nShutting down services...');
      startAll.kill('SIGTERM');
    });
    
  } catch (error) {
    console.error('Error starting project:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  startProject();
}

module.exports = { startProject, checkPorts }; 