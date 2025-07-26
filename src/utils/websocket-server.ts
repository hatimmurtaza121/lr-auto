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
}

class ScreenshotWebSocketServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ConnectionInfo> = new Map();
  private connectionCounter = 0;

  initialize(port: number = 8080) {
    if (this.wss) {
      console.log('WebSocket server already initialized');
      return;
    }

    this.wss = new WebSocketServer({ port });
    
    this.wss.on('connection', (ws: WebSocket) => {
      const connectionId = `conn_${++this.connectionCounter}`;
      
      console.log(`WebSocket client connected: ${connectionId}`);
      
      this.connections.set(connectionId, { ws });
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to screenshot stream',
        connectionId
      }));

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'auth') {
            // Store user info for this connection
            this.connections.set(connectionId, {
              ws,
              userId: data.userId,
              teamId: data.teamId
            });
            console.log(`Authenticated connection ${connectionId} for user ${data.userId}, team ${data.teamId}`);
          }
        } catch (error) {
          console.log('Invalid message format:', error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${connectionId}`);
        this.connections.delete(connectionId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${connectionId}:`, error);
        this.connections.delete(connectionId);
      });
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  broadcastScreenshot(screenshotBuffer: Buffer, gameName: string, action: string) {
    if (!this.wss) {
      console.log('WebSocket server not initialized');
      return;
    }

    const base64Image = screenshotBuffer.toString('base64');
    const message: ScreenshotMessage = {
      type: 'screenshot',
      data: base64Image,
      timestamp: new Date().toISOString(),
      gameName,
      action
    };

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.connections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to ${connectionId}:`, error);
          this.connections.delete(connectionId);
        }
      } else {
        // Remove dead connections
        this.connections.delete(connectionId);
      }
    });

    console.log(`Screenshot broadcasted to ${sentCount} clients`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  close() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.connections.clear();
      console.log('WebSocket server closed');
    }
  }
}

// Export singleton instance
export const screenshotWebSocketServer = new ScreenshotWebSocketServer(); 