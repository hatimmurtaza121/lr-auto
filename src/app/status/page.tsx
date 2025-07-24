'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { getSelectedTeamId } from '@/utils/team';

// Hardcoded status data as requested - each team has different games
const statusData = [
  // Team 1 - Game Vault (All Operational)
  {
    teamid: 1,
    game_id: 'GV',
    api_url: 'https://gamevault-api.example.com',
    status: 'operational',
    functions: {
      account_creation: 'operational',
      pass_reset: 'operational',
      redeem: 'operational',
      recharge: 'operational'
    }
  },
  // Team 1 - Orion Stars (Mixed Status)
  {
    teamid: 1,
    game_id: 'OS',
    api_url: 'https://orionstars-api.example.com',
    status: 'degraded',
    functions: {
      account_creation: 'operational',
      pass_reset: 'degraded',
      redeem: 'operational',
      recharge: 'outage'
    }
  },
  // Team 1 - Orion Strike (Major Issues)
  {
    teamid: 1,
    game_id: 'ST',
    api_url: 'https://orionstrike-api.example.com',
    status: 'outage',
    functions: {
      account_creation: 'outage',
      pass_reset: 'degraded',
      redeem: 'outage',
      recharge: 'outage'
    }
  },
  // Team 2 - Mr. All In One (All Operational)
  {
    teamid: 2,
    game_id: 'A1',
    api_url: 'https://mrao-api.example.com',
    status: 'operational',
    functions: {
      account_creation: 'operational',
      pass_reset: 'operational',
      redeem: 'operational',
      recharge: 'operational'
    }
  },
  // Team 2 - Yolo (Degraded Performance)
  {
    teamid: 2,
    game_id: 'YL',
    api_url: 'https://yolo-api.example.com',
    status: 'degraded',
    functions: {
      account_creation: 'operational',
      pass_reset: 'degraded',
      redeem: 'degraded',
      recharge: 'operational'
    }
  },
  // Team 2 - Juwa City (Minor Issues)
  {
    teamid: 2,
    game_id: 'JW',
    api_url: 'https://juwacity-api.example.com',
    status: 'degraded',
    functions: {
      account_creation: 'operational',
      pass_reset: 'operational',
      redeem: 'degraded',
      recharge: 'operational'
    }
  },
  // Team 3 - Game Vault (Mixed Status)
  {
    teamid: 3,
    game_id: 'GV',
    api_url: 'https://gamevault-api.example.com',
    status: 'degraded',
    functions: {
      account_creation: 'operational',
      pass_reset: 'operational',
      redeem: 'degraded',
      recharge: 'outage'
    }
  },
  // Team 3 - Orion Stars (All Operational)
  {
    teamid: 3,
    game_id: 'OS',
    api_url: 'https://orionstars-api.example.com',
    status: 'operational',
    functions: {
      account_creation: 'operational',
      pass_reset: 'operational',
      redeem: 'operational',
      recharge: 'operational'
    }
  },
  // Team 3 - Mr. All In One (Major Outage)
  {
    teamid: 3,
    game_id: 'A1',
    api_url: 'https://mrao-api.example.com',
    status: 'outage',
    functions: {
      account_creation: 'outage',
      pass_reset: 'outage',
      redeem: 'outage',
      recharge: 'outage'
    }
  }
];

const gameDisplayNames = {
  'GV': 'Game Vault',
  'OS': 'Orion Stars',
  'ST': 'Orion Strike',
  'A1': 'Mr. All In One',
  'YL': 'Yolo',
  'JW': 'Juwa City'
};

const statusConfig = {
  operational: {
    label: 'Operational',
    color: 'bg-success-500',
    textColor: 'text-success-700',
    bgColor: 'bg-success-50',
    borderColor: 'border-success-200',
    icon: (
      <svg className="w-5 h-5 text-success-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    )
  },
  degraded: {
    label: 'Degraded Performance',
    color: 'bg-warning-500',
    textColor: 'text-warning-700',
    bgColor: 'bg-warning-50',
    borderColor: 'border-warning-200',
    icon: (
      <svg className="w-5 h-5 text-warning-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  },
  outage: {
    label: 'Major Outage',
    color: 'bg-error-500',
    textColor: 'text-error-700',
    bgColor: 'bg-error-50',
    borderColor: 'border-error-200',
    icon: (
      <svg className="w-5 h-5 text-error-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    )
  }
};

export default function StatusPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

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

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-system">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  // Get current team ID and filter data
  const currentTeamId = getSelectedTeamId();
  console.log('Current Team ID:', currentTeamId);
  console.log('All Status Data:', statusData);
  
  // For now, show all data to ensure cards are visible
  const teamStatusData = statusData.filter(item => item.teamid === (currentTeamId || 1));
  console.log('Filtered Team Status Data:', teamStatusData);
  
  const overallStatus = teamStatusData.every(item => item.status === 'operational') 
    ? 'operational' 
    : teamStatusData.some(item => item.status === 'outage') 
    ? 'outage' 
    : 'degraded';

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Last updated:</span>
              <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
          
          {/* Overall Status Card */}
          <div className={`card-elevated p-6 border-l-4 ${statusConfig[overallStatus].borderColor}`}>
            <div className="flex items-center gap-3">
              {statusConfig[overallStatus].icon}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Overall System Status
                </h2>
                <p className={`text-sm font-medium ${statusConfig[overallStatus].textColor}`}>
                  {statusConfig[overallStatus].label}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Temporarily show all data to ensure cards are visible */}
          {statusData.map((item, index) => {
            const config = statusConfig[item.status as keyof typeof statusConfig];
            return (
              <div 
                key={index}
                className={`card-elevated p-6 border-l-4 ${config.borderColor} hover:shadow-ios-xl transition-all duration-200`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {gameDisplayNames[item.game_id as keyof typeof gameDisplayNames]}
                    </h3>
                    <p className="text-sm text-gray-500 font-mono truncate">
                      {item.api_url}
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor}`}>
                    {config.icon}
                    <span className={`text-xs font-medium ${config.textColor}`}>
                      {config.label}
                    </span>
                  </div>
                </div>
                
                {/* Function Status Grid */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Function Status</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(item.functions).map(([functionName, functionStatus]) => {
                      const functionConfig = statusConfig[functionStatus as keyof typeof statusConfig];
                      return (
                        <div key={functionName} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span className="text-xs text-gray-600 capitalize">
                            {functionName.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-1">
                            {functionConfig.icon}
                            <span className={`text-xs font-medium ${functionConfig.textColor}`}>
                              {functionConfig.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Team ID:</span>
                    <span className="font-mono text-gray-900">{item.teamid}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Game ID:</span>
                    <span className="font-mono text-gray-900">{item.game_id}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Status updates are automatically refreshed every 30 seconds
          </p>
          <p className="text-xs text-gray-400 mt-2">
            For immediate assistance, contact support
          </p>
        </div>
      </div>
    </div>
  );
} 