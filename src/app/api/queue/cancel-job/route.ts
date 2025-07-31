import { NextRequest, NextResponse } from 'next/server';
import { createQueue } from '@/queue/config/queues';

export async function POST(request: NextRequest) {
  try {
    const { jobId, action } = await request.json();

    if (!jobId || !action) {
      return NextResponse.json({ 
        error: 'Job ID and action are required' 
      }, { status: 400 });
    }

    // Get the queue
    const queue = createQueue('global-queue');
    
    // Get the job
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return NextResponse.json({ 
        error: 'Job not found' 
      }, { status: 404 });
    }

    // Check if job can be cancelled (only waiting or active jobs)
    const state = await job.getState();
    if (state !== 'waiting' && state !== 'active') {
      return NextResponse.json({ 
        error: 'Job cannot be cancelled - it is not in waiting or active state' 
      }, { status: 400 });
    }

    // Remove the job from the queue
    await job.remove();
    
    console.log(`Job ${jobId} cancelled successfully`);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json({
      error: 'Failed to cancel job',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 