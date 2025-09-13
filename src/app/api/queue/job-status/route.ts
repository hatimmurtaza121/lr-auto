import { NextRequest, NextResponse } from 'next/server';
import { ActionProducer } from '@/queue/producers/action-producer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const teamId = searchParams.get('teamId');

    if (!jobId || !teamId) {
      return NextResponse.json({ 
        error: 'Job ID and team ID are required' 
      }, { status: 400 });
    }

    // Get job status from team queue
    const status = await ActionProducer.getJobStatus(jobId, parseInt(teamId));

    if (!status) {
      return NextResponse.json({ 
        error: 'Job not found' 
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status
    });

  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json({
      error: 'Failed to get job status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 