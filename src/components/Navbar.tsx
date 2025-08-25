import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearSelectedTeamId, getSelectedTeamId, setSelectedTeamId } from '@/utils/team';

interface Team {
  id: number;
  name: string;
  code: string;
}

export default function Navbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsDropdownOpen, setTeamsDropdownOpen] = useState(false);
  const [sidebarTeamsDropdownOpen, setSidebarTeamsDropdownOpen] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const teamsDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Close dropdown/sidebar on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setSidebarOpen(false);
      }
      if (teamsDropdownRef.current && !teamsDropdownRef.current.contains(event.target as Node)) {
        setTeamsDropdownOpen(false);
      }
    }
    if (dropdownOpen || sidebarOpen || teamsDropdownOpen || sidebarTeamsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen, sidebarOpen, teamsDropdownOpen, sidebarTeamsDropdownOpen]);

  // Fetch selected team name
  useEffect(() => {
    const fetchTeamName = async () => {
      const teamId = getSelectedTeamId();
      if (teamId) {
        try {
          const response = await fetch(`/api/team?teamId=${teamId}`);
          if (response.ok) {
            const data = await response.json();
            setSelectedTeamName(data.team.name);
          }
        } catch (error) {
          console.error('Error fetching team name:', error);
        }
      }
    };

    fetchTeamName();
  }, []);

  // Fetch teams for dropdown
  const fetchTeams = async () => {
    if (teams.length > 0) return; // Don't refetch if we already have teams
    
    setIsLoadingTeams(true);
    try {
      const response = await fetch('/api/team');
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const handleTeamSelect = async (team: Team) => {
    setSelectedTeamId(team.id);
    setSelectedTeamName(team.name);
    setTeamsDropdownOpen(false);
    setSidebarTeamsDropdownOpen(false);
    // Force a hard refresh to ensure the new team context is loaded
    window.location.reload();
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    setSidebarOpen(false);
    clearSelectedTeamId();
    await supabase.auth.signOut();
    router.replace('/main_login');
  };

  const handleDropdownOption = () => {
    setDropdownOpen(false);
  };

  const handleNavigation = (path: string) => {
    setSidebarOpen(false);
    router.push(path);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 w-full bg-white shadow-lg z-50 h-16 flex items-center px-6">
        {/* Left - Brand and Burger (Mobile) */}
        <div className="flex-1 flex items-center">
          {/* Burger Menu - Mobile Only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <span className="text-2xl font-bold text-black tracking-wide">LR Automation</span>
        </div>

        {/* Center - Navigation (Desktop Only) */}
        <div className="hidden lg:flex flex-1 justify-center items-center space-x-8">
          {/* Dashboard Link */}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer group"
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Dashboard
          </button>

          {/* Status Link */}
          <button
            onClick={() => router.push('/status')}
            className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer group"
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Status
          </button>

          {/* Logs Link */}
          <button
            onClick={() => router.push('/logs')}
            className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer group"
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Logs
          </button>

          {/* Team Dropdown */}
          {selectedTeamName && (
            <div className="relative" ref={teamsDropdownRef}>
              <button
                onClick={() => {
                  setTeamsDropdownOpen(!teamsDropdownOpen);
                  if (!teamsDropdownOpen) {
                    fetchTeams();
                  }
                }}
                className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer group border border-gray-300 hover:border-gray-400"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="whitespace-nowrap">{selectedTeamName}</span>
                <svg className={`w-4 h-4 transition-transform ${teamsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {teamsDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50 max-h-60 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden">
                  {isLoadingTeams ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mx-auto"></div>
                      <span className="ml-2">Loading teams...</span>
                    </div>
                  ) : teams.length > 0 ? (
                    teams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => handleTeamSelect(team)}
                        className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                          team.id === getSelectedTeamId() ? 'bg-blue-50 text-blue-700 font-medium' : ''
                        }`}
                      >
                        <span className="truncate">{team.name}</span>
                        {team.id === getSelectedTeamId() && (
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">No teams found</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right - Profile (Desktop Only) */}
        <div className="hidden lg:flex flex-1 justify-end items-center relative" ref={dropdownRef}>
          <button
            className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg"
            onClick={() => setDropdownOpen((open) => !open)}
            aria-label="Profile"
          >
            <span>LR</span>
          </button>
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-3 w-48 bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50">
              <button
                className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                onClick={() => handleNavigation('/settings')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                disabled
                onClick={handleDropdownOption}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Support
              </button>
              <div className="border-t border-gray-100 my-1"></div>
              <button
                className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-medium transition-colors flex items-center gap-3"
                onClick={handleLogout}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden">
          <div 
            ref={sidebarRef}
            className="fixed left-0 top-1/2 transform -translate-y-1/2 h-[80vh] w-3/5 bg-white shadow-xl rounded-tr-3xl rounded-br-3xl transform transition-transform duration-300 ease-in-out"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
              <span className="text-xl font-bold text-gray-800">Welcome</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Items */}
            <div className="p-4 space-y-2">
              {/* Dashboard */}
              <button
                onClick={() => handleNavigation('/dashboard')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Dashboard
              </button>

              {/* Status */}
              <button
                onClick={() => handleNavigation('/status')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Status
              </button>

              {/* Logs */}
              <button
                onClick={() => handleNavigation('/logs')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Logs
              </button>

              {/* Team - Mobile version with dropdown */}
              {selectedTeamName && (
                <div className="relative">
                                     <button
                     onClick={() => {
                       if (!sidebarTeamsDropdownOpen) {
                         fetchTeams();
                       }
                       setSidebarTeamsDropdownOpen(!sidebarTeamsDropdownOpen);
                     }}
                     className="w-full flex items-center justify-between gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border-2 border-gray-300 min-w-0"
                   >
                                         <div className="flex items-center gap-3 min-w-0 flex-1">
                       <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                       </svg>
                       <span className="truncate min-w-0">{selectedTeamName}</span>
                     </div>
                    <svg className={`w-4 h-4 transition-transform ${sidebarTeamsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {sidebarTeamsDropdownOpen && (
                    <div className="mt-2 bg-gray-50 rounded-lg py-2 max-h-40 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden">
                      {isLoadingTeams ? (
                        <div className="px-4 py-2 text-gray-500 text-center text-sm">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900 mx-auto"></div>
                          <span className="ml-2">Loading...</span>
                        </div>
                      ) : teams.length > 0 ? (
                        teams.map((team) => (
                          <button
                            key={team.id}
                            onClick={() => handleTeamSelect(team)}
                            className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between ${
                              team.id === getSelectedTeamId() ? 'bg-blue-100 text-blue-700 font-medium' : ''
                            }`}
                          >
                            <span className="truncate">{team.name}</span>
                            {team.id === getSelectedTeamId() && (
                              <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-2 text-gray-500 text-center text-sm">No teams found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="border-t-2 border-gray-200 mx-4 my-4"></div>

            {/* Settings, Support */}
            <div className="p-4 space-y-2">
              <button
                onClick={() => handleNavigation('/settings')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled
                onClick={handleDropdownOption}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Support
              </button>
            </div>

            {/* Logout Button - Bottom Center */}
            <div className="absolute bottom-6 left-0 right-0 px-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 