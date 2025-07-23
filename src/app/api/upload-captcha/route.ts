import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagePath } = body;

    if (!imagePath) {
      return NextResponse.json({ error: 'Missing imagePath' }, { status: 400 });
    }

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
    }

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const storagePath = `captcha-images/${Date.now()}-${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('captcha-images')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: false
      });

    if (error) {
      console.error('Error uploading to storage:', error);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('captcha-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({ 
      success: true, 
      storagePath,
      publicUrl: urlData.publicUrl 
    });
  } catch (error) {
    console.error('Error in upload-captcha API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 