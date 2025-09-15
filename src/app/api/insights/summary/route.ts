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

    // Fetch summary metrics
    const summaryData = await getSummaryMetrics();

    return NextResponse.json({ 
      success: true, 
      data: summaryData 
    });

  } catch (error) {
    console.error('Error in insights summary API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

async function getSummaryMetrics() {
  try {
    // Get CAPTCHA success rate
    const { data: captchaData, error: captchaError } = await supabase
      .from('captcha_log')
      .select('api_status');

    let captchaSuccessRate = 0;
    if (!captchaError && captchaData && captchaData.length > 0) {
      const totalCaptcha = captchaData.length;
      const successfulCaptcha = captchaData.filter(log => log.api_status === 'success').length;
      captchaSuccessRate = (successfulCaptcha / totalCaptcha) * 100;
    }

    // Get overall success rate and average execution time
    const { data: actionData, error: actionError } = await supabase
      .from('game_action_status')
      .select('status, execution_time_secs');

    let overallSuccessRate = 0;
    let avgExecutionTime = 0;

    if (!actionError && actionData && actionData.length > 0) {
      const totalActions = actionData.length;
      const successfulActions = actionData.filter(action => action.status === 'success').length;
      overallSuccessRate = (successfulActions / totalActions) * 100;

      // Calculate average execution time
      const executionTimes = actionData
        .filter(action => action.execution_time_secs !== null)
        .map(action => action.execution_time_secs);
      
      if (executionTimes.length > 0) {
        avgExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
      }
    }

    return {
      captchaSuccessRate: Math.round(captchaSuccessRate * 10) / 10, // Round to 1 decimal
      overallSuccessRate: Math.round(overallSuccessRate * 10) / 10,
      avgExecutionTime: Math.round(avgExecutionTime * 10) / 10
    };
  } catch (error) {
    console.error('Error in getSummaryMetrics:', error);
    return {
      captchaSuccessRate: 0,
      overallSuccessRate: 0,
      avgExecutionTime: 0
    };
  }
}
