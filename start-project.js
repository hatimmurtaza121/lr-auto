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

// Check all required ports
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
  
  if (redisAvailable) {
    console.error('\nRedis is not running on port 6379!');
    console.log('Please start Redis before running this project.');
    process.exit(1);
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