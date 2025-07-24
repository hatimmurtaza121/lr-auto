import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearSelectedTeamId, getSelectedTeamId } from '@/utils/team';

export default function Navbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Fetch selected team name
  useEffect(() => {
    const fetchTeamName = async () => {
      const teamId = getSelectedTeamId();
      if (teamId) {
        try {
          const response = await fetch(`/api/team-selection?teamId=${teamId}`);
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

  const handleLogout = async () => {
    setDropdownOpen(false);
    clearSelectedTeamId();
    await supabase.auth.signOut();
    router.replace('/main_login');
  };

  const handleDropdownOption = () => {
    setDropdownOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 w-full bg-white shadow z-50 h-16 flex items-center px-6">
      {/* Left */}
      <div className="flex-1 flex items-center">
        <span className="text-2xl font-bold text-black tracking-wide">Dashboard</span>
        {selectedTeamName && (
          <button
            onClick={() => router.push('/choose-team')}
            className="ml-4 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
          >
            {selectedTeamName}
          </button>
        )}
        {/* Status Button */}
        <button
          onClick={() => router.push('/status')}
          className="ml-4 flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Status
        </button>
      </div>
      {/* Center (removed) */}
      {/* Right */}
      <div className="flex-1 flex justify-end items-center relative" ref={dropdownRef}>
        <button
          className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-label="Profile"
        >
          <span>LR</span>
        </button>
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-3 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-2 animate-in fade-in z-50">
            <button
              className="w-full text-left px-4 py-2 text-black hover:bg-gray-100 transition"
              disabled
              onClick={handleDropdownOption}
            >
              Settings
            </button>
            <button
              className="w-full text-left px-4 py-2 text-black hover:bg-gray-100 transition"
              disabled
              onClick={handleDropdownOption}
            >
              Support
            </button>
            <button
              className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 font-semibold transition"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
} 