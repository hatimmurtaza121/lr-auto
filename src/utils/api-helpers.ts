import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to get team context from request headers or query params
export const getTeamContextFromRequest = async (request: NextRequest) => {
  // Try to get team ID from headers first (for client-side requests)
  const teamIdHeader = request.headers.get('x-team-id');
  if (teamIdHeader) {
    return { teamId: parseInt(teamIdHeader, 10) };
  }

  // Try to get from query params
  const { searchParams } = new URL(request.url);
  const teamIdParam = searchParams.get('teamId');
  if (teamIdParam) {
    return { teamId: parseInt(teamIdParam, 10) };
  }

  // Try to get from request body
  try {
    const body = await request.json();
    if (body.teamId) {
      return { teamId: parseInt(body.teamId, 10) };
    }
  } catch {
    // Body might not be JSON or might not have teamId
  }

  throw new Error('Team ID is required');
};

// Helper function to validate team exists
export const validateTeam = async (teamId: number) => {
  const { data: team, error } = await supabase
    .from('team')
    .select('id, name, code')
    .eq('id', teamId)
    .single();

  if (error || !team) {
    throw new Error('Team not found');
  }

  return team;
};

// Helper function to get user session
export const getUserSession = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header required');
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid token');
  }

  return user;
}; 