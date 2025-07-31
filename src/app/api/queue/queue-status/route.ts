import { NextRequest, NextResponse } from 'next/server';
import { ActionProducer } from '@/queue/producers/action-producer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (!action) {
      return NextResponse.json({ 
        error: 'Action is required' 
      }, { status: 400 });
    }

    // Get queue statistics
    const stats = await ActionProducer.getQueueStats(action);

    if (!stats) {
      return NextResponse.json({ 
        error: 'Failed to get queue stats' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action,
      stats
    });

  } catch (error) {
    console.error('Error getting queue status:', error);
    return NextResponse.json({
      error: 'Failed to get queue status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 