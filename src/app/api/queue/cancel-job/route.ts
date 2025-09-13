import { NextRequest, NextResponse } from 'next/server';
import { ActionProducer } from '@/queue/producers/action-producer';

export async function POST(request: NextRequest) {
  try {
    const { jobId, teamId } = await request.json();

    console.log(`=== CANCEL API CALLED ===`);
    console.log(`Request body:`, { jobId, teamId });

    if (!jobId || !teamId) {
      console.log(`❌ Missing jobId or teamId`);
      return NextResponse.json({ 
        error: 'Job ID and team ID are required' 
      }, { status: 400 });
    }

    console.log(`✅ Attempting to cancel job ${jobId} for team ${teamId}`);

    // Use ActionProducer to cancel the job
    const success = await ActionProducer.cancelJob(jobId, parseInt(teamId));
    
    if (!success) {
      return NextResponse.json({ 
        error: 'Failed to cancel job - job not found or cannot be cancelled' 
      }, { status: 400 });
    }

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