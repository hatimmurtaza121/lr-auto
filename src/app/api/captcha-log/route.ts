import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagePath, apiResponse, apiStatus } = body;

    if (!imagePath || !apiResponse || !apiStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert into captcha_log table
    const { data, error } = await supabase
      .from('captcha_log')
      .insert([
        {
          image_path: imagePath,
          api_response: apiResponse,
          api_status: apiStatus
        }
      ])
      .select();

    if (error) {
      console.error('Error inserting captcha log:', error);
      return NextResponse.json({ error: 'Failed to log captcha attempt' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in captcha-log API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 