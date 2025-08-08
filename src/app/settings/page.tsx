'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Loader from '@/components/Loader';

interface Team {
  id: number;
  code: string;
  name: string;
  created_at: string;
}

interface Game {
  id: number;
  name: string;
  login_url: string;
  dashboard_url: string;
  created_at: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  type: 'team' | 'game';
  loading?: boolean;
  editData?: Team | Game | null;
}

function Modal({ isOpen, onClose, onSubmit, type, loading = false, editData }: ModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    login_url: '',
    dashboard_url: ''
  });

  // Update form data when editData changes
  useEffect(() => {
    if (editData) {
      if (type === 'team') {
        const team = editData as Team;
        setFormData({
          name: team.name,
          code: team.code,
          login_url: '',
          dashboard_url: ''
        });
      } else {
        const game = editData as Game;
        setFormData({
          name: game.name,
          code: '',
          login_url: game.login_url,
          dashboard_url: game.dashboard_url
        });
      }
    } else {
      setFormData({ name: '', code: '', login_url: '', dashboard_url: '' });
    }
  }, [editData, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'team') {
      onSubmit({ name: formData.name, code: formData.code });
    } else {
      onSubmit({ 
        name: formData.name, 
        login_url: formData.login_url, 
        dashboard_url: formData.dashboard_url 
      });
    }
  };

  const handleClose = () => {
    setFormData({ name: '', code: '', login_url: '', dashboard_url: '' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold mb-4">
          {editData ? 'Edit' : 'Add New'} {type === 'team' ? 'Team' : 'Game'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'team' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Game Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Login URL *
                </label>
                <input
                  type="url"
                  value={formData.login_url}
                  onChange={(e) => setFormData({ ...formData, login_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dashboard URL *
                </label>
                <input
                  type="url"
                  value={formData.dashboard_url}
                  onChange={(e) => setFormData({ ...formData, dashboard_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? (editData ? 'Updating...' : 'Adding...') : (editData ? 'Update' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'team' | 'game'>('team');
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editData, setEditData] = useState<Team | Game | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/main_login');
        return;
      }
      fetchData();
    };

    checkAuth();
  }, [router, supabase.auth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch teams
      const teamsResponse = await fetch('/api/team');
      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json();
        setTeams(teamsData.teams || []);
      }

      // Fetch games
      const gamesResponse = await fetch('/api/game');
      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        setGames(gamesData.games || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load settings data');
      setLoading(false);
    }
  };

  const handleAddTeam = async (data: { name: string; code: string }) => {
    try {
      setModalLoading(true);
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const newTeam = await response.json();
        setTeams([...teams, newTeam]);
        setModalOpen(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to add team');
      }
    } catch (error) {
      console.error('Error adding team:', error);
      setError('Failed to add team');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateTeam = async (data: { name: string; code: string }) => {
    if (!editData || !('id' in editData)) return;
    
    try {
      setModalLoading(true);
      const response = await fetch(`/api/team/${editData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updatedTeam = await response.json();
        setTeams(teams.map(team => team.id === editData.id ? updatedTeam : team));
        setModalOpen(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update team');
      }
    } catch (error) {
      console.error('Error updating team:', error);
      setError('Failed to update team');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!confirm('Are you sure you want to delete this team?')) return;
    
    try {
      const response = await fetch(`/api/team/${teamId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTeams(teams.filter(team => team.id !== teamId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete team');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      setError('Failed to delete team');
    }
  };

  const handleAddGame = async (data: { name: string; login_url: string; dashboard_url: string }) => {
    try {
      setModalLoading(true);
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const newGame = await response.json();
        setGames([...games, newGame]);
        setModalOpen(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to add game');
      }
    } catch (error) {
      console.error('Error adding game:', error);
      setError('Failed to add game');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateGame = async (data: { name: string; login_url: string; dashboard_url: string }) => {
    if (!editData || !('id' in editData)) return;
    
    try {
      setModalLoading(true);
      const response = await fetch(`/api/game/${editData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updatedGame = await response.json();
        setGames(games.map(game => game.id === editData.id ? updatedGame : game));
        setModalOpen(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update game');
      }
    } catch (error) {
      console.error('Error updating game:', error);
      setError('Failed to update game');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteGame = async (gameId: number) => {
    if (!confirm('Are you sure you want to delete this game?')) return;
    
    try {
      const response = await fetch(`/api/game/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setGames(games.filter(game => game.id !== gameId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete game');
      }
    } catch (error) {
      console.error('Error deleting game:', error);
      setError('Failed to delete game');
    }
  };

  const handleModalSubmit = (data: any) => {
    if (modalType === 'team') {
      if (editData) {
        handleUpdateTeam(data);
      } else {
        handleAddTeam(data);
      }
    } else {
      if (editData) {
        handleUpdateGame(data);
      } else {
        handleAddGame(data);
      }
    }
  };

  const openModal = (type: 'team' | 'game', data?: Team | Game) => {
    setModalType(type);
    setEditData(data || null);
    setModalOpen(true);
    setError(null);
  };

  if (loading) {
    return <Loader message="Loading settings..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-system">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
          
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Teams Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Teams</h2>
                <button
                  onClick={() => openModal('team')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Team
                </button>
              </div>
              
              <div className="space-y-3">
                {teams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No teams found</p>
                ) : (
                                     teams.map((team) => (
                     <div key={team.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                       <div>
                         <p className="font-medium text-gray-900">{team.name}</p>
                         <p className="text-sm text-gray-500">Code: {team.code}</p>
                       </div>
                       <div className="flex items-center space-x-3">
                         <span className="text-xs text-gray-400">
                           {new Date(team.created_at).toLocaleDateString()}
                         </span>
                         <div className="flex space-x-2">
                                                       <button
                              onClick={() => openModal('team', team)}
                              className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                              title="Edit team"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                                                       <button
                              onClick={() => handleDeleteTeam(team.id)}
                              className="p-1 text-red-500 hover:text-red-700 transition-colors"
                              title="Delete team"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                         </div>
                       </div>
                     </div>
                   ))
                )}
              </div>
            </div>

            {/* Games Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Games</h2>
                <button
                  onClick={() => openModal('game')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Game
                </button>
              </div>
              
              <div className="space-y-3">
                {games.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No games found</p>
                ) : (
                                     games.map((game) => (
                                           <div key={game.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="font-medium text-gray-900">{game.name}</p>
                          <p className="text-sm text-gray-500 truncate">
                            Login: {game.login_url}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            Dashboard: {game.dashboard_url}
                          </p>
                        </div>
                                               <div className="flex items-center space-x-4">
                          <span className="text-xs text-gray-400">
                            {new Date(game.created_at).toLocaleDateString()}
                          </span>
                          <div className="flex space-x-2">
                           <button
                             onClick={() => openModal('game', game)}
                             className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                             title="Edit game"
                           >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                             </svg>
                           </button>
                           <button
                             onClick={() => handleDeleteGame(game.id)}
                             className="p-1 text-red-500 hover:text-red-700 transition-colors"
                             title="Delete game"
                           >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                             </svg>
                           </button>
                         </div>
                       </div>
                     </div>
                   ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        type={modalType}
        loading={modalLoading}
        editData={editData}
      />
    </div>
  );
}
