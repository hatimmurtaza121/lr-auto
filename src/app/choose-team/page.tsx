'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import Image from 'next/image';
import lrlogo from '../../../assets/images/lrlogo.png';
import { setSelectedTeamId as saveTeamId } from '@/utils/team';
import Navbar from '@/components/Navbar';

interface Team {
  id: number;
  code: string;
  name: string;
  created_at: string;
}

export default function ChooseTeamPage() {
  const supabase = createClient();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user is authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/main_login');
        return;
      }
      
      // Fetch teams
      fetchTeams();
    });
  }, [router, supabase.auth]);

  const fetchTeams = async () => {
    try {
      const response = await fetch('/api/teams');
      const data = await response.json();
      
      if (response.ok) {
        setTeams(data.teams);
      } else {
        setError('Failed to load teams');
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTeamId) {
      setError('Please select a team');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Store selected team using utility function
      saveTeamId(selectedTeamId as number);
      
      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Error saving team selection:', error);
      setError('Failed to save team selection');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-col h-screen items-center px-4 overflow-hidden"
        style={{ 
          paddingTop: "15vh", 
          paddingBottom: "15vh",
          background: "white",
        }}
      >
        {/* Top spacing */}
        <div className="flex-1"></div>
        
        {/* Loading content in middle */}
        <div className="flex flex-col items-center space-y-6 z-10">
          <CircularProgress 
            size={60}
            sx={{ 
              color: "#000",
            }}
          />
          <Typography 
            variant="h6" 
            className="text-gray-700"
            sx={{ fontWeight: 500 }}
          >
            Loading teams...
          </Typography>
        </div>
        
        {/* Bottom spacing */}
        <div className="flex-1"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="flex flex-col h-screen items-center justify-center px-4 overflow-hidden">

      {/* Form */}
      <div className="max-w-7xl space-y-10 px-16 z-10">
        <Card
          className="backdrop-blur-xl border border-white/20 w-full"
          sx={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.2), 0 12px 24px rgba(0, 0, 0, 0.25)",
            width: '100%',
            maxWidth: '100%',
            minHeight: '400px',
          }}
        >
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-8 py-12 px-12">
              <Box textAlign="center" mb={3}>
                <Typography
                  variant="h5"
                  component="h3"
                  className="text-gray-800 font-bold mb-2"
                  sx={{ fontWeight: 700 }}
                >
                  Choose Your Team
                </Typography>
                <Typography variant="body1" className="text-gray-600">
                  Select a team to continue
                </Typography>
              </Box>

              <FormControl fullWidth margin="normal" sx={{ width: '100%' }}>
                <Select
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(e.target.value as number);
                    setError('');
                  }}
                  displayEmpty
                  fullWidth
                  renderValue={(value) => {
                    if (!value) {
                      return <span style={{ color: 'rgba(0,0,0,0.6)' }}>Select a team</span>;
                    }
                    const selectedTeam = teams.find(team => team.id === value);
                    return selectedTeam ? selectedTeam.name : '';
                  }}
                  sx={{
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.95)" },
                    "&.Mui-focused": { backgroundColor: "rgba(255,255,255,1)" },
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(0,0,0,0.2)",
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(0,0,0,0.3)",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(0,0,0,0.5)",
                    },
                  }}
                >
                  {teams.map((team) => (
                    <MenuItem key={team.id} value={team.id}>
                      {team.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </CardContent>

            <Box className="flex flex-col items-center gap-6 py-8 w-full px-12">
              {/* Error Message - Positioned between dropdown and continue button */}
              {error && (
                <Alert
                  severity="error"
                  className="w-full rounded-xl mb-2 animate-fade-in"
                  sx={{
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    animation: "fadeIn 0.3s ease-in-out",
                    "& .MuiAlert-icon": {
                      color: "#dc2626",
                    },
                    "& .MuiAlert-message": {
                      fontWeight: 500,
                    },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {error}
                  </Typography>
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={submitting || !selectedTeamId}
                startIcon={
                  submitting ? (
                    <CircularProgress size={20} sx={{ color: "#fff" }} />
                  ) : undefined
                }
                className="py-1 px-4 font-semibold text-base hover:scale-[1.02]"
                sx={{
                  backgroundColor: "#000",
                  color: "#fff",
                  height: 50,
                  width: '80%',
                  maxWidth: '400px',
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  textTransform: "none",
                  borderRadius: "25px",
                  boxShadow: "0 8px 20px -5px rgba(0,0,0,0.3)",
                  "&:hover": {
                    backgroundColor: "#1a1a1a",
                    boxShadow: "0 12px 28px -5px rgba(0,0,0,0.4)",
                  },
                  "&:disabled": {
                    backgroundColor: "#666",
                    color: "#fff",
                  },
                }}
              >
                Continue
              </Button>
            </Box>
          </form>
        </Card>
      </div>
    </div>
    </div>
  );
} 