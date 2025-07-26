import { NextRequest, NextResponse } from 'next/server';
import { screenshotWebSocketServer } from '@/utils/websocket-server';

export async function POST(request: NextRequest) {
  try {
    // Initialize WebSocket server
    screenshotWebSocketServer.initialize(8080);
    
    return NextResponse.json({ 
      success: true, 
      message: 'WebSocket server initialized',
      port: 8080
    });
  } catch (error) {
    console.error('Error initializing WebSocket server:', error);
    return NextResponse.json({ 
      error: 'Failed to initialize WebSocket server' 
    }, { status: 500 });
  }
} 