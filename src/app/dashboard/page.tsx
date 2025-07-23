'use client';

import { useState, useEffect } from 'react';
import GameWidget from '@/components/GameWidget';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@mui/material';
import Navbar from '@/components/Navbar';
import { getSelectedTeamId } from '@/utils/team';

export default function Dashboard() {
  const games = [
    { id: 'GV', displayName: 'Game Vault' },
    { id: 'OS', displayName: 'Orion Stars' },
    { id: 'ST', displayName: 'Orion Strike' },
    { id: 'A1', displayName: 'Mr. All In One' },
    { id: 'YL', displayName: 'Yolo' },
    { id: 'JW', displayName: 'Juwa City' },
  ];

  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/main_login');
      } else {
        // Check if user has selected a team
        const selectedTeamId = getSelectedTeamId();
        if (!selectedTeamId) {
          router.replace('/choose-team');
        } else {
          setLoading(false);
        }
      }
    });
  }, [router, supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/main_login');
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Removed old header, navbar now handles logout and branding */}
        <div className="columns-1 sm:columns-2 gap-6 space-y-6">
          {games.map((game) => (
            <GameWidget
              key={game.id}
              gameName={game.id}
              displayName={game.displayName}
            />
          ))}
        </div>
      </div>
    </div>
  );
}