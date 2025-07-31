# Game Automation Scaffold

## Quick Start

### Prerequisites

1. **Redis Server** - Required for job queue management
   - Install Redis on your system
   - On Windows, you can use:
     - Windows Subsystem for Linux (WSL)
     - Redis for Windows: https://github.com/microsoftarchive/redis/releases
     - Docker: `docker run -d -p 6379:6379 redis:alpine`

2. **Node.js** - Version 18 or higher
3. **npm** - Package manager

### Installation

```bash
npm install
```

### Starting the Project

#### Option 1: Automatic Start (Recommended)
```bash
npm start
```
This will:
- Check if all required ports are available
- Start both the Next.js dev server and global worker
- Show real-time status of all services

#### Option 2: Manual Start
If you prefer to start services manually:

**Terminal 1:**
```bash
npm run dev
```

**Terminal 2:**
```bash
npm run global-worker
```

### Ports Used

- **3000** - Next.js development server
- **8080** - WebSocket server for real-time screenshots
- **6379** - Redis server (must be running)

### How It Works

1. **Queue System**: Actions are added to a Redis-based queue using BullMQ
2. **Worker Processing**: The global worker processes one job at a time
3. **WebSocket Communication**: Real-time screenshots and logs are broadcast via WebSocket
4. **Browser View**: Live screenshots and execution logs are displayed in the browser

### Error Handling

- **No Retries**: Failed jobs are not retried (as per requirements)
- **Unexpected Errors**: Jobs that fail due to unexpected errors are marked as failed with "Unexpected error" message
- **WebSocket Reconnection**: Automatic reconnection with exponential backoff
- **Robust Connection**: Improved WebSocket server with better error handling

### Troubleshooting

1. **Redis not running**: Install and start Redis server
2. **Port conflicts**: Ensure ports 3000, 8080, and 6379 are available
3. **WebSocket connection issues**: The system will automatically attempt to reconnect
4. **Job failures**: Check the logs for specific error messages

## Project Structure

```
src/
├── app/                    # Next.js app router
├── components/             # React components
├── queue/                  # Job queue system
│   ├── config/            # Queue configuration
│   ├── producers/         # Job producers
│   └── workers/           # Job workers
├── utils/                  # Utility functions
└── lib/                   # Library configurations
```

## Features

- ✅ Real-time screenshot broadcasting
- ✅ Job queue with no retries on failure
- ✅ Robust WebSocket connections
- ✅ Live execution logs
- ✅ Multiple action types (new account, password reset, recharge, redeem)
- ✅ Session management
- ✅ Team-based access control 
