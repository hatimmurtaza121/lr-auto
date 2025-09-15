import { NextRequest, NextResponse } from 'next/server';
import { ActionProducer } from '@/queue/producers/action-producer';
import { teamQueueManager } from '@/queue/config/queues';
import { createClient } from '@supabase/supabase-js';
import { getUserSession } from '@/utils/api-helpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUserSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const gameId = searchParams.get('gameId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!teamId || !gameId) {
      return NextResponse.json({ 
        error: 'Team ID and Game ID are required' 
      }, { status: 400 });
    }

    // Get action display names for this game FIRST
    const { data: actionsData, error: actionsError } = await supabase
      .from('actions')
      .select('name, display_name')
      .eq('game_id', parseInt(gameId));

    if (actionsError) {
      console.error('Error fetching actions:', actionsError);
    }

    // Create a map of action names to display names
    const actionDisplayMap = new Map();
    if (actionsData) {
      actionsData.forEach((action: any) => {
        actionDisplayMap.set(action.name, action.display_name);
      });
    }

    // Get all jobs from the team queue
    const teamQueue = teamQueueManager.getTeamQueue(parseInt(teamId));
    
    // For grouped jobs, use getGroupJobs to get waiting jobs in the specific game group
    const groupId = `game-${gameId}`;
    const waiting = await teamQueue.getGroupJobs(groupId, 0, -1, 'waiting');
    
    const active = await teamQueue.getActive();
    const completed = await teamQueue.getCompleted();
    const failed = await teamQueue.getFailed();

    // Filter jobs by game ID (team is already filtered by queue)
    const filterAndTransformJobs = (jobs: any[], status: string) => {
      return jobs
        .filter(job => {
          const jobData = job.data;
          // For waiting jobs, getGroupJobs already filters by group, so no additional filtering needed
          // For other statuses, check if job belongs to the specific game (using group ID)
          if (status === 'waiting') {
            return jobData; // getGroupJobs already filtered by group
          }
          const groupId = job.opts?.group?.id;
          return jobData && 
                 groupId === `game-${gameId}`;
        })
        .map(job => {
          const jobData = job.data;
          // Better fallback logic for action display names
          const actionName = jobData.action || 'Unknown Action';
          const displayName = actionDisplayMap.get(actionName) || actionName;
          
          return {
            jobId: job.id,
            action: actionName,
            actionDisplayName: displayName,
            status: status,
            message: ActionProducer.getStatusMessage(status, job.progress || 0),
            timestamp: job.timestamp,
            progress: job.progress || 0,
            params: jobData.params,
            userId: jobData.userId,
            executionTime: job.processedOn && job.finishedOn ? 
              (job.finishedOn - job.processedOn) / 1000 : undefined
          };
        });
    };

    // Get completed jobs from database for this game and team
    const { data: completedLogs, error: logsError } = await supabase
      .from('game_action_status')
      .select(`
        id,
        team_id,
        game_id,
        action,
        status,
        message,
        inputs,
        execution_time_secs,
        updated_at
      `)
      .eq('team_id', parseInt(teamId))
      .eq('game_id', parseInt(gameId))
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1); // Use range for pagination

    if (logsError) {
      console.error('Error fetching completed logs:', logsError);
    }

    // Transform completed logs to match job format
    const completedJobs = (completedLogs || [])
      .filter(log => log.action && log.action.trim() !== '') // Filter out empty action names
      .map(log => {
        // Better fallback logic for action names
        const actionName = log.action || 'Unknown Action';
        const displayName = actionDisplayMap.get(actionName) || actionName;
        
        return {
          jobId: log.id.toString(),
          action: actionName,
          actionDisplayName: displayName,
          status: log.status === 'success' ? 'completed' : 'failed',
          message: log.message || 'Action completed',
          timestamp: new Date(log.updated_at).getTime(),
          progress: 100,
          params: log.inputs,
          executionTime: log.execution_time_secs
        };
      });

    // Combine all job types - newest jobs first, then older ones
    // Mix active and waiting jobs together, then sort by timestamp (newest first)
    const currentJobs = [
      ...filterAndTransformJobs(active, 'active'),
      ...filterAndTransformJobs(waiting, 'waiting')
    ];
    
    // Sort ALL current jobs by timestamp (newest first) regardless of status
    // This ensures the newest job (whether running or queued) appears at the top
    currentJobs.sort((a, b) => b.timestamp - a.timestamp);
    
    // Completed jobs are already ordered by updated_at DESC (newest first)
    // So we put them after current jobs, maintaining their newest-first order
    const allJobs = [
      ...currentJobs,
      ...completedJobs
    ];

    // The order is now: newest jobs first (running or queued), then older jobs, then completed jobs
    // This ensures the most recent activity appears at the top regardless of job status

    // Check if there are more logs available
    const hasMore = completedJobs.length === limit;
    const totalCompleted = completedJobs.filter(j => j.status === 'completed').length;
    const totalFailed = completedJobs.filter(j => j.status === 'failed').length;

    return NextResponse.json({
      success: true,
      jobs: allJobs,
      hasMore: hasMore,
      nextOffset: offset + limit,
      stats: {
        active: filterAndTransformJobs(active, 'active').length,
        waiting: filterAndTransformJobs(waiting, 'waiting').length,
        completed: totalCompleted,
        failed: totalFailed
      }
    });

  } catch (error) {
    console.error('Error getting game jobs:', error);
    return NextResponse.json({
      error: 'Failed to get game jobs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

