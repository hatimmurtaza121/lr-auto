import { WebSocketServer, WebSocket } from 'ws';

interface ScreenshotMessage {
  type: 'screenshot';
  data: string; // base64 encoded image
  timestamp: string;
  gameName: string;
  action: string;
}

interface ConnectionInfo {
  ws: WebSocket;
  userId?: string;
  teamId?: string;
  lastHeartbeat?: number;
  connectionTime: number;
  reconnectAttempts: number;
}

class ScreenshotWebSocketServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ConnectionInfo> = new Map();
  private connectionCounter = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private port: number = 8080;

  initialize(port: number = 8080) {
    if (this.isInitialized && this.wss) {
      // console.log('WebSocket server already initialized');
      return;
    }

    this.port = port;
    
    try {
      this.wss = new WebSocketServer({ 
        port,
        // Add better error handling
        clientTracking: true,
        // Handle connection errors
        handleProtocols: () => 'websocket'
      });
      this.isInitialized = true;
      
      this.wss.on('connection', (ws: WebSocket) => {
        this.handleNewConnection(ws);
      });

      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
        // Attempt to restart server after delay
        setTimeout(() => {
          if (!this.isInitialized) {
            // console.log('Attempting to restart WebSocket server...');
            this.initialize(this.port);
          }
        }, 5000);
      });

      // Start heartbeat mechanism
      this.startHeartbeat();
      this.startCleanup();

      // console.log(`WebSocket server started on port ${port}`);
    } catch (error) {
      console.error('Failed to initialize WebSocket server:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  private handleNewConnection(ws: WebSocket) {
    const connectionId = `conn_${++this.connectionCounter}`;
    
    // console.log(`WebSocket client connected: ${connectionId}`);
    
    this.connections.set(connectionId, { 
      ws,
      lastHeartbeat: Date.now(),
      connectionTime: Date.now(),
      reconnectAttempts: 0
    });
    
    // Send welcome message
    try {
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to screenshot stream',
        connectionId,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error(`Failed to send welcome message to ${connectionId}:`, error);
      this.connections.delete(connectionId);
      return;
    }

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'auth') {
          // Store user info for this connection
          const connection = this.connections.get(connectionId);
          if (connection) {
            connection.userId = data.userId;
            connection.teamId = data.teamId;
            connection.lastHeartbeat = Date.now();
          }
          // console.log(`Authenticated connection ${connectionId} for user ${data.userId}, team ${data.teamId}`);
        } else if (data.type === 'heartbeat') {
          // Update heartbeat timestamp
          const connection = this.connections.get(connectionId);
          if (connection) {
            connection.lastHeartbeat = Date.now();
          }
        } else if (data.type === 'ping') {
          // Respond to ping with pong
          try {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          } catch (error) {
            console.error(`Failed to send pong to ${connectionId}:`, error);
          }
        }
      } catch (error) {
        // console.log('Invalid message format:', error);
      }
    });

    ws.on('close', (code, reason) => {
      // console.log(`WebSocket client disconnected: ${connectionId}, code: ${code}, reason: ${reason}`);
      this.connections.delete(connectionId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
      this.connections.delete(connectionId);
    });

    // Set up ping/pong to detect dead connections
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (error) {
          console.error(`Failed to ping ${connectionId}:`, error);
          clearInterval(pingInterval);
          this.connections.delete(connectionId);
        }
      } else {
        clearInterval(pingInterval);
        this.connections.delete(connectionId);
      }
    }, 30000); // Ping every 30 seconds

    ws.on('pong', () => {
      // Connection is alive
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.lastHeartbeat = Date.now();
      }
    });
  }

  private startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const heartbeatMessage = JSON.stringify({ type: 'heartbeat', timestamp: now });

      this.connections.forEach((connection, connectionId) => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          try {
            connection.ws.send(heartbeatMessage);
          } catch (error) {
            console.error(`Failed to send heartbeat to ${connectionId}:`, error);
            this.connections.delete(connectionId);
          }
        } else {
          // Remove dead connections
          this.connections.delete(connectionId);
        }
      });
    }, 30000);
  }

  private startCleanup() {
    // Clean up connections every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      this.connections.forEach((connection, connectionId) => {
        // Remove connections that haven't responded in 90 seconds
        if (connection.lastHeartbeat && (now - connection.lastHeartbeat) > 90000) {
          // console.log(`Removing stale connection: ${connectionId}`);
          this.connections.delete(connectionId);
          try {
            connection.ws.close();
          } catch (error) {
            // Connection already closed
          }
        }
        
        // Remove connections that have been open too long (24 hours)
        if ((now - connection.connectionTime) > 86400000) {
          // console.log(`Removing old connection: ${connectionId}`);
          this.connections.delete(connectionId);
          try {
            connection.ws.close();
          } catch (error) {
            // Connection already closed
          }
        }
      });
    }, 60000);
  }

  broadcastScreenshot(screenshotBuffer: Buffer, gameName: string, action: string) {
    if (!this.wss) {
      // console.log('WebSocket server not initialized');
      return;
    }

    // console.log(`WebSocket Server: Broadcasting screenshot for ${gameName} - ${action} to ${this.connections.size} clients`);
    // console.log(`WebSocket Server: Screenshot buffer size: ${screenshotBuffer.length} bytes`);
    
    const base64Image = screenshotBuffer.toString('base64');
    const message: ScreenshotMessage = {
      type: 'screenshot',
      data: base64Image,
      timestamp: new Date().toISOString(),
      gameName,
      action
    };

    const messageStr = JSON.stringify(message);
    // console.log(`WebSocket Server: Message size: ${messageStr.length} characters`);
    
    let sentCount = 0;
    let failedCount = 0;

    this.connections.forEach((connection, connectionId) => {
      // console.log(`WebSocket Server: Checking connection ${connectionId}, readyState: ${connection.ws.readyState}`);
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(messageStr);
          sentCount++;
          // console.log(`WebSocket Server: Successfully sent to ${connectionId}`);
        } catch (error) {
          console.error(`WebSocket Server: Failed to send to ${connectionId}:`, error);
          this.connections.delete(connectionId);
          failedCount++;
        }
      } else {
        // console.log(`WebSocket Server: Removing dead connection ${connectionId}, readyState: ${connection.ws.readyState}`);
        // Remove dead connections
        this.connections.delete(connectionId);
        failedCount++;
      }
    });

    if (sentCount === 0) {
      // console.log(`WebSocket Server: Screenshot captured but no clients connected (${gameName} - ${action})`);
    } else {
      // console.log(`WebSocket Server: Screenshot broadcasted to ${sentCount} clients, ${failedCount} failed`);
    }
  }

  broadcastWorkerStatus(isExecuting: boolean, currentLog?: string, allLogs?: string[]) {
    if (!this.wss) return;

    const message = JSON.stringify({
      type: 'worker-status',
      isExecuting,
      currentLog,
      allLogs
    });

    let failedCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          failedCount++;
          console.error('Failed to send worker status to client:', error);
        }
      }
    });

    // console.log(`Worker status broadcasted to ${this.wss.clients.size} clients, ${failedCount} failed`);
  }

  broadcastScriptResult(jobId: string, result: any) {
    if (!this.wss) return;

    const message = JSON.stringify({
      type: 'script-result',
      jobId,
      result: result,
      message: result?.message || 'Script completed',
      success: result?.success || false
    });

    let failedCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          failedCount++;
          console.error('Failed to send script result to client:', error);
        }
      }
    });

    // console.log(`Script result broadcasted to ${this.wss.clients.size} clients, ${failedCount} failed`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  isServerInitialized(): boolean {
    return this.isInitialized && this.wss !== null;
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.connections.clear();
      this.isInitialized = false;
      // console.log('WebSocket server closed');
    }
  }
}

// Export singleton instance
export const screenshotWebSocketServer = new ScreenshotWebSocketServer(); 