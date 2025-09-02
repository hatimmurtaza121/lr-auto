import { WebSocketServer, WebSocket } from 'ws';

interface ScreenshotMessage {
  type: 'screenshot';
  data: string; // base64 encoded image
  timestamp: string;
  gameId: number; // NEW: Game ID for reliable matching
  gameName: string;
  action: string;
  teamId: string;
  sessionId: string; // NEW: Session that initiated the action
}

interface LogUpdateMessage {
  type: 'log_update';
  gameId: number; // NEW: Game ID for reliable matching
  gameName: string;
  currentLog?: string;
  allLogs?: string[];
  timestamp: string;
  teamId: string; // NEW: Team context for filtering
}

interface ConnectionInfo {
  ws: WebSocket;
  userId?: string;
  teamId?: string;
  gameId?: number; // NEW: Game ID for reliable matching
  gameName?: string;
  sessionId: string; // NEW: Unique session identifier
  subscribedGameIds: number[]; // NEW: Game IDs this session is watching
  subscribedGames: string[]; // Legacy: Game names for backward compatibility
  subscribedTeams: string[]; // NEW: Teams this session is subscribed to
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

  // NEW: Generate unique session ID
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  initialize(port: number = 8080) {
    if (this.isInitialized && this.wss) {
      // console.log('WebSocket server already initialized');
      return;
    }

    this.port = port;
    
    try {
      this.wss = new WebSocketServer({ 
        port,
        host: '0.0.0.0', // Bind to all network interfaces
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
    const sessionId = this.generateSessionId();
    
    console.log(`WebSocket client connected: ${connectionId}, session: ${sessionId}`);
    
    this.connections.set(connectionId, { 
      ws,
      sessionId,
      subscribedGameIds: [],
      subscribedGames: [],
      subscribedTeams: ['all'], // Default to all teams
      lastHeartbeat: Date.now(),
      connectionTime: Date.now(),
      reconnectAttempts: 0
    });
    
    // Send welcome message with session ID
    try {
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to screenshot stream',
        connectionId,
        sessionId,
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
            connection.gameId = data.gameId;
            connection.gameName = data.gameName;
            connection.lastHeartbeat = Date.now();
            
            // NEW: Subscribe to the specified game using both ID and name
            if (data.gameId && !connection.subscribedGameIds.includes(data.gameId)) {
              connection.subscribedGameIds.push(data.gameId);
              // console.log(`WebSocket Server: Connection ${connectionId} subscribed to game ID: ${data.gameId}`);
            }
            if (data.gameName && !connection.subscribedGames.includes(data.gameName)) {
              connection.subscribedGames.push(data.gameName);
              // console.log(`WebSocket Server: Connection ${connectionId} subscribed to game: "${data.gameName}"`);
            }
            
            // NEW: Handle team subscriptions
            if (data.subscribeToTeams) {
              if (Array.isArray(data.subscribeToTeams)) {
                connection.subscribedTeams = data.subscribeToTeams;
              } else if (data.subscribeToTeams === 'all') {
                connection.subscribedTeams = ['all'];
              } else if (data.subscribeToTeams === 'own') {
                connection.subscribedTeams = [data.teamId?.toString() || 'all'];
              }
                         } else {
               // Default: subscribe to own team only for security
               connection.subscribedTeams = [data.teamId?.toString() || 'all'];
             }
            
            // console.log(`WebSocket Server: All subscribed game IDs for ${connectionId}: [${connection.subscribedGameIds.join(', ')}]`);
            // console.log(`WebSocket Server: All subscribed games for ${connectionId}: [${connection.subscribedGames.join(', ')}]`);
            console.log(`WebSocket Server: Connection ${connectionId} subscribed to teams: [${connection.subscribedTeams.join(', ')}]`);
          }
          console.log(`Authenticated connection ${connectionId} for user ${data.userId}, team ${data.teamId}, game ${data.gameName}`);
        } else if (data.type === 'subscribe') {
          // Handle game subscriptions (gameId is already handled above)
          // Legacy subscribedGames is kept for backward compatibility but not used for matching
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
      console.log(`WebSocket client disconnected: ${connectionId}, code: ${code}, reason: ${reason}`);
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

  // NEW: Enhanced screenshot broadcasting with session filtering and game ID
  broadcastScreenshot(screenshotBuffer: Buffer, gameId: number, gameName: string, action: string, teamId: string, initiatedBySessionId: string) {
    if (!this.wss) {
      // console.log('WebSocket server not initialized');
      return;
    }

    // console.log(`WebSocket Server: Broadcasting screenshot for ${gameName} - ${action} to session ${initiatedBySessionId}`);
    // console.log(`WebSocket Server: Screenshot buffer size: ${screenshotBuffer.length} bytes`);
    
    const base64Image = screenshotBuffer.toString('base64');
    const message: ScreenshotMessage = {
      type: 'screenshot',
      data: base64Image,
      timestamp: new Date().toISOString(),
      gameId,
      gameName,
      action,
      teamId,
      sessionId: initiatedBySessionId
    };

    const messageStr = JSON.stringify(message);
    // console.log(`WebSocket Server: Message size: ${messageStr.length} characters`);
    
    let sentCount = 0;
    let failedCount = 0;

    // Send to connections subscribed to this game AND team (team filtering added)
    this.connections.forEach((connection, connectionId) => {
      // Game ID matching (more reliable than game name)
      const connectionHasGame = connection.subscribedGameIds.includes(gameId);
      
             // Team filtering - only send to connections from the same team
       // Convert both to strings for comparison to handle number/string mismatches
       const connectionHasTeam = connection.subscribedTeams.includes(teamId);
      
      console.log(`WebSocket Server: Checking connection ${connectionId} for game ID ${gameId} (name: "${gameName}")`);
      console.log(`  → Subscribed game IDs: [${connection.subscribedGameIds.join(', ')}]`);
      console.log(`  → Has game ID ${gameId}: ${connectionHasGame}`);
      console.log(`  → Connection subscribed to teams: [${connection.subscribedTeams.join(', ')}], Screenshot team: ${teamId}, Match: ${connectionHasTeam}`);
      
      if (connection.ws.readyState === WebSocket.OPEN && connectionHasGame && connectionHasTeam) {
        
        try {
          connection.ws.send(messageStr);
          sentCount++;
          // console.log(`WebSocket Server: Screenshot sent to connection ${connectionId} (Team: ${connection.teamId}, Session: ${connection.sessionId})`);
        } catch (error) {
          console.error(`WebSocket Server: Failed to send to connection ${connectionId}:`, error);
          this.connections.delete(connectionId);
          failedCount++;
        }
      }
    });

    if (sentCount === 0) {
      console.log(`WebSocket Server: Screenshot captured but no connections found for game ID ${gameId} (${gameName}) - ${action}`);
      console.log(`Looking for game ID: ${gameId}`);
      console.log(`Available connections: ${this.connections.size}`);
      this.connections.forEach((conn, id) => {
        console.log(`  - Connection ${id}: Team ${conn.teamId}, Game IDs: [${conn.subscribedGameIds.join(', ')}], Subscribed Teams: [${conn.subscribedTeams.join(', ')}]`);
        const hasGame = conn.subscribedGameIds.includes(gameId);
        console.log(`    → Has game ID ${gameId}: ${hasGame}`);
      });
    } else {
      console.log(`WebSocket Server: Screenshot sent to ${sentCount} connections for game ID ${gameId} (${gameName}) - ${action}`);
    }
  }

  // NEW: Legacy method for backward compatibility (will be deprecated)
  broadcastScreenshotLegacy(screenshotBuffer: Buffer, gameName: string, action: string) {
    // For legacy calls, we need to get game ID from game name
    // This is a temporary solution until all callers are updated
    this.broadcastScreenshot(screenshotBuffer, 0, gameName, action, 'all', 'all'); // gameId = 0 for legacy
  }

  // NEW: Enhanced log update broadcasting with team filtering and game ID
  broadcastLogUpdate(gameId: number, gameName: string, currentLog?: string, allLogs?: string[], teamId?: string) {
    if (!this.wss) return;

    const message: LogUpdateMessage = {
      type: 'log_update',
      gameId,
      gameName,
      currentLog,
      allLogs,
      timestamp: new Date().toISOString(),
      teamId: teamId || 'all'
    };

    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    let failedCount = 0;

    this.connections.forEach((connection, connectionId) => {
      // Game ID matching (more reliable than game name)
      const connectionHasGame = connection.subscribedGameIds.includes(gameId);
      
      // Only send to connections that are interested in this specific game and team
      // Convert both to strings for comparison to handle number/string mismatches
             if (connection.ws.readyState === WebSocket.OPEN && 
           connectionHasGame &&
           (!teamId || connection.subscribedTeams.includes(teamId))) {
        try {
          connection.ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send log update to ${connectionId}:`, error);
          this.connections.delete(connectionId);
          failedCount++;
        }
      }
    });

    // console.log(`WebSocket Server: Log update broadcasted for game ID ${gameId} (${gameName}) (team: ${teamId}) to ${sentCount} clients, ${failedCount} failed`);
    if (sentCount === 0) {
      // console.log(`WebSocket Server: No connections received log update for game ID ${gameId} (${gameName})`);
      // console.log(`Available connections: ${this.connections.size}`);
      // this.connections.forEach((conn, id) => {
      //   const hasGame = conn.subscribedGameIds.includes(gameId);
      //   console.log(`  - Connection ${id}: Team ${conn.teamId}, Game IDs: [${conn.subscribedGameIds.join(', ')}], Has game ID ${gameId}: ${hasGame}`);
      // });
    }
  }

  // NEW: Legacy method for backward compatibility
  broadcastLogUpdateLegacy(gameName: string, currentLog?: string, allLogs?: string[]) {
    // For legacy calls, we need to get game ID from game name
    // This is a temporary solution until all callers are updated
    this.broadcastLogUpdate(0, gameName, currentLog, allLogs); // gameId = 0 for legacy
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