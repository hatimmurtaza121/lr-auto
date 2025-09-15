import { NextRequest, NextResponse } from 'next/server';
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

    // Get teamId from query params
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    // Fetch insights data using SQL queries
    const insightsData = await getInsightsData(parseInt(teamId));

    return NextResponse.json({ 
      success: true, 
      data: insightsData 
    });

  } catch (error) {
    console.error('Error in insights API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

async function getInsightsData(teamId: number) {
  try {
    // Query to get game insights for a specific team
    const { data: insights, error } = await supabase.rpc('get_game_insights', {
      team_id_param: teamId
    });

    if (error) {
      console.error('Error fetching insights:', error);
      // Fallback to manual query if RPC doesn't exist
      return await getInsightsDataFallback(teamId);
    }

    return insights || [];
  } catch (error) {
    console.error('Error in getInsightsData:', error);
    // Fallback to manual query
    return await getInsightsDataFallback(teamId);
  }
}

async function getInsightsDataFallback(teamId: number) {
  try {
    // Get all games first
    const { data: games, error: gamesError } = await supabase
      .from('game')
      .select('id, name');

    if (gamesError) {
      throw new Error('Failed to fetch games');
    }

    const insights = [];

    for (const game of games) {
      // Get success rate for this game and team
      const { data: gameActions, error: actionsError } = await supabase
        .from('game_action_status')
        .select('status, execution_time_secs')
        .eq('team_id', teamId)
        .eq('game_id', game.id);

      if (actionsError) {
        console.error(`Error fetching actions for game ${game.id}:`, actionsError);
        continue;
      }

      // Get CAPTCHA success rate
      const { data: captchaLogs, error: captchaError } = await supabase
        .from('captcha_log')
        .select('api_status')
        .eq('api_status', 'success');

      if (captchaError) {
        console.error('Error fetching captcha logs:', captchaError);
      }

      // Calculate metrics
      const totalActions = gameActions.length;
      const successfulActions = gameActions.filter(action => action.status === 'success').length;
      const successRate = totalActions > 0 ? (successfulActions / totalActions) * 100 : 0;

      // Calculate average execution time
      const executionTimes = gameActions
        .filter(action => action.execution_time_secs !== null)
        .map(action => action.execution_time_secs);
      const avgExecutionTime = executionTimes.length > 0 
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length 
        : 0;

      // Calculate CAPTCHA success rate
      const totalCaptchaAttempts = captchaLogs ? captchaLogs.length : 0;
      const successfulCaptcha = captchaLogs ? captchaLogs.filter(log => log.api_status === 'success').length : 0;
      const captchaSuccessRate = totalCaptchaAttempts > 0 ? (successfulCaptcha / totalCaptchaAttempts) * 100 : 0;

      insights.push({
        game_id: game.id,
        game_name: game.name,
        success_rate: Math.round(successRate * 10) / 10, // Round to 1 decimal
        captcha_success_rate: Math.round(captchaSuccessRate * 10) / 10,
        avg_execution_time: Math.round(avgExecutionTime * 10) / 10,
        total_requests: totalActions
      });
    }

    return insights;
  } catch (error) {
    console.error('Error in getInsightsDataFallback:', error);
    return [];
  }
}
