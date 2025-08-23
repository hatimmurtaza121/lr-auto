'use client';

import { useState, useEffect, useRef } from 'react';
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

interface Action {
  id: number;
  game_id: number;
  name: string;
  display_name?: string | null;
  inputs_json: any;
  script_code?: string | null;
  updated_at: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  type: 'team' | 'game' | 'action';
  loading?: boolean;
  editData?: Team | Game | Action | null;
  games?: Game[];
}

function Modal({ isOpen, onClose, onSubmit, type, loading = false, editData, games }: ModalProps) {
  const toSnakeCase = (value: string): string => {
    return value
      .trim()
      .replace(/["']/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  };
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    code: '',
    login_url: '',
    dashboard_url: '',
    game_id: '',
    inputs_json: { fields: [] },
    script_code: ''
  });

  const [actionFields, setActionFields] = useState<Array<{ label: string }>>([]);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);

  // Update form data when editData changes or when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (editData) {
      if (type === 'team') {
        const team = editData as Team;
        setFormData({
          name: team.name,
          display_name: '',
          code: team.code,
          login_url: '',
          dashboard_url: '',
          game_id: '',
          inputs_json: { fields: [] },
          script_code: ''
        });
      } else if (type === 'game') {
        const game = editData as Game;
        setFormData({
          name: game.name,
          display_name: '',
          code: '',
          login_url: game.login_url,
          dashboard_url: game.dashboard_url,
          game_id: '',
          inputs_json: { fields: [] },
          script_code: ''
        });
      } else if (type === 'action') {
        const action = editData as Action;
        setFormData({
          name: action.name,
          display_name: action.display_name || action.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          code: '',
          login_url: '',
          dashboard_url: '',
          game_id: action.game_id.toString(),
          inputs_json: action.inputs_json || { fields: [] },
          script_code: action.script_code || ''
        });
        setActionFields((action.inputs_json?.fields || []).map((f: any) => ({ label: f.label })));
        setShowScriptEditor(false);
      }
    } else {
      setFormData({ name: '', display_name: '', code: '', login_url: '', dashboard_url: '', game_id: '', inputs_json: { fields: [] }, script_code: '' });
      setActionFields([]);
      setGameDropdownOpen(false);
    }
  }, [editData, type, isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.game-dropdown-container')) {
        setGameDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'team') {
      onSubmit({ name: formData.name, code: formData.code });
    } else if (type === 'game') {
      onSubmit({ 
        name: formData.name, 
        login_url: formData.login_url, 
        dashboard_url: formData.dashboard_url 
      });
    } else if (type === 'action') {
      const generatedName = toSnakeCase(formData.display_name || formData.name);
      const normalizedFields = actionFields.map((f) => ({
        label: f.label,
        key: toSnakeCase(f.label),
      }));
      onSubmit({ 
        name: generatedName,
        display_name: formData.display_name || formData.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        game_id: parseInt(formData.game_id),
        inputs_json: { fields: normalizedFields },
        script_code: formData.script_code
      });
    }
  };

  const handleClose = () => {
    setFormData({ name: '', display_name: '', code: '', login_url: '', dashboard_url: '', game_id: '', inputs_json: { fields: [] }, script_code: '' });
    setActionFields([]);
    setShowScriptEditor(false);
    onClose();
  };

  const addActionField = () => {
    setActionFields([...actionFields, { label: '' }]);
  };

  const removeActionField = (index: number) => {
    setActionFields(actionFields.filter((_, i) => i !== index));
  };

  const updateActionField = (index: number, value: string) => {
    const newFields = [...actionFields];
    newFields[index] = { label: value };
    setActionFields(newFields);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => { e.stopPropagation(); }}>
        <h2 className="text-xl font-semibold mb-4">
          {editData ? 'Edit' : 'Add New'} {type === 'team' ? 'Team' : type === 'game' ? 'Game' : 'Action'}
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
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
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
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </>
          ) : type === 'game' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Game Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
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
                  onChange={(e) => setFormData({...formData, login_url: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dashboard URL
                </label>
                <input
                  type="url"
                  value={formData.dashboard_url}
                  onChange={(e) => setFormData({...formData, dashboard_url: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : type === 'action' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Game *
                </label>
                <div className="relative game-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setGameDropdownOpen(!gameDropdownOpen)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-gray-700">
                      {formData.game_id ? games?.find(g => g.id.toString() === formData.game_id)?.name || 'Select a game' : 'Select a game'}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${gameDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {gameDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl py-2 animate-in fade-in z-50 max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({...formData, game_id: ''});
                          setGameDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Select a game
                      </button>
                      {games?.map((game) => (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => {
                            setFormData({...formData, game_id: game.id.toString()});
                            setGameDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {game.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({
                    ...formData,
                    display_name: e.target.value,
                    name: toSnakeCase(e.target.value)
                  })}
                  placeholder="e.g. Password Reset"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Key: <span className="font-mono">{toSnakeCase(formData.display_name || '')}</span>
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Input Fields
                </label>
                <div className="space-y-3">
                  {actionFields.map((field, index) => (
                    <div key={index} className="flex items-start justify-between">
                      <div className="flex-1 mr-2">
                        <input
                          type="text"
                          placeholder="e.g. Account Name"
                          value={field.label}
                          onChange={(e) => updateActionField(index, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Key: <span className="font-mono">{toSnakeCase(field.label || '')}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeActionField(index)}
                        className="p-1 text-red-500 hover:text-red-700 transition-colors"
                        title="Delete field"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addActionField}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                  >
                    + Add Field
                  </button>
                </div>
              </div>

              {/* Script Code Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Script Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScriptEditor(!showScriptEditor)}
                    className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {showScriptEditor ? 'Hide Editor' : 'Edit Script'}
                  </button>
                </div>
                
                {showScriptEditor && (
                  <div className="space-y-2">
                    <textarea
                      value={formData.script_code}
                      onChange={(e) => setFormData({...formData, script_code: e.target.value})}
                      placeholder="// Enter your Playwright automation script here..."
                      className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                      rows={12}
                    />
                  </div>
                )}
                
                {!showScriptEditor && formData.script_code && (
                  <div className="p-3 bg-gray-50 rounded-md border">
                    <p className="text-sm text-gray-600 mb-2">Script code is set (click "Edit Script" to view/edit)</p>
                    <div className="text-xs text-gray-500 font-mono bg-white p-2 rounded border overflow-hidden">
                      {formData.script_code.length > 100 
                        ? `${formData.script_code.substring(0, 100)}...` 
                        : formData.script_code}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (editData ? 'Update' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

function ConfirmDialog({ isOpen, message, onCancel, onConfirm, loading = false }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-4">Confirm Delete</h2>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'team' | 'game' | 'action'>('team');
  const [modalLoading, setModalLoading] = useState(false);
  const [editData, setEditData] = useState<Team | Game | Action | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const confirmOnConfirmRef = useRef<(() => Promise<void> | void) | null>(null);

  // Collapsible state per widget
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const openConfirm = (message: string, onConfirm: () => Promise<void> | void) => {
    setConfirmMessage(message);
    confirmOnConfirmRef.current = onConfirm;
    setConfirmOpen(true);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/main_login');
      return;
    }
    fetchData();
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('team')
        .select('*')
        .order('created_at', { ascending: false });

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
      } else {
        setTeams(teamsData || []);
      }

      // Fetch games
      const { data: gamesData, error: gamesError } = await supabase
        .from('game')
        .select('*')
        .order('created_at', { ascending: false });

      if (gamesError) {
        console.error('Error fetching games:', gamesError);
      } else {
        setGames(gamesData || []);
      }

      // Fetch actions
      await fetchActions();

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActions = async () => {
    try {
      const { data: actionsData, error: actionsError } = await supabase
        .from('actions')
        .select(`
          *,
          game:game_id (id, name)
        `)
        .order('game_id')
        .order('name');

      if (actionsError) {
        console.error('Error fetching actions:', actionsError);
      } else {
        setActions(actionsData || []);
      }
    } catch (error) {
      console.error('Error fetching actions:', error);
    }
  };

  const handleAddTeam = async (data: { name: string; code: string }) => {
    try {
      setModalLoading(true);
      const { error } = await supabase
        .from('team')
        .insert(data);

      if (error) {
        console.error('Error adding team:', error);
        alert('Failed to add team');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error adding team:', error);
      alert('Failed to add team');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateTeam = async (data: { name: string; code: string }) => {
    try {
      setModalLoading(true);
      const team = editData as Team;
      const { error } = await supabase
        .from('team')
        .update(data)
        .eq('id', team.id);

      if (error) {
        console.error('Error updating team:', error);
        alert('Failed to update team');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error updating team:', error);
      alert('Failed to update team');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    openConfirm('Are you sure you want to delete this team?', async () => {
      try {
        setConfirmLoading(true);
        const { error } = await supabase
          .from('team')
          .delete()
          .eq('id', teamId);

        if (error) {
          console.error('Error deleting team:', error);
          alert('Failed to delete team');
          return;
        }

        setConfirmOpen(false);
        fetchData();
      } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team');
      } finally {
        setConfirmLoading(false);
      }
    });
  };

  const handleAddGame = async (data: { name: string; login_url: string; dashboard_url: string }) => {
    try {
      setModalLoading(true);
      const { error } = await supabase
        .from('game')
        .insert(data);

      if (error) {
        console.error('Error adding game:', error);
        alert('Failed to add game');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error adding game:', error);
      alert('Failed to add game');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateGame = async (data: { name: string; login_url: string; dashboard_url: string }) => {
    try {
      setModalLoading(true);
      const game = editData as Game;
      const { error } = await supabase
        .from('game')
        .update(data)
        .eq('id', game.id);

      if (error) {
        console.error('Error updating game:', error);
        alert('Failed to update game');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error updating game:', error);
      alert('Failed to update game');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteGame = async (gameId: number) => {
    openConfirm('Are you sure you want to delete this game?', async () => {
      try {
        setConfirmLoading(true);
        const { error } = await supabase
          .from('game')
          .delete()
          .eq('id', gameId);

        if (error) {
          console.error('Error deleting game:', error);
          alert('Failed to delete game');
          return;
        }

        setConfirmOpen(false);
        fetchData();
      } catch (error) {
        console.error('Error deleting game:', error);
        alert('Failed to delete game');
      } finally {
        setConfirmLoading(false);
      }
    });
  };

  const handleAddAction = async (data: { name: string; display_name?: string; game_id: number; inputs_json: any; script_code?: string }) => {
    try {
      setModalLoading(true);
      const { error } = await supabase
        .from('actions')
        .insert(data);

      if (error) {
        console.error('Error adding action:', error);
        alert('Failed to add action');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error adding action:', error);
      alert('Failed to add action');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateAction = async (data: { name: string; display_name?: string; game_id: number; inputs_json: any; script_code?: string }) => {
    try {
      setModalLoading(true);
      const action = editData as Action;
      const { error } = await supabase
        .from('actions')
        .update(data)
        .eq('id', action.id);

      if (error) {
        console.error('Error updating action:', error);
        alert('Failed to update action');
        return;
      }

      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error updating action:', error);
      alert('Failed to update action');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteAction = async (actionId: number) => {
    openConfirm('Are you sure you want to delete this action?', async () => {
      try {
        setConfirmLoading(true);
        const { error } = await supabase
          .from('actions')
          .delete()
          .eq('id', actionId);

        if (error) {
          console.error('Error deleting action:', error);
          alert('Failed to delete action');
          return;
        }

        setConfirmOpen(false);
        fetchData();
      } catch (error) {
        console.error('Error deleting action:', error);
        alert('Failed to delete action');
      } finally {
        setConfirmLoading(false);
      }
    });
  };

  const handleModalSubmit = (data: any) => {
    if (modalType === 'team') {
      if (editData) {
        handleUpdateTeam(data);
      } else {
        handleAddTeam(data);
      }
    } else if (modalType === 'game') {
      if (editData) {
        handleUpdateGame(data);
      } else {
        handleAddGame(data);
      }
    } else if (modalType === 'action') {
      if (editData) {
        handleUpdateAction(data);
      } else {
        handleAddAction(data);
      }
    }
  };

  const openModal = (type: 'team' | 'game' | 'action', data?: Team | Game | Action) => {
    setModalType(type);
    setEditData(data || null);
    setModalOpen(true);
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
          
          {/* Error display removed as per new_code, assuming it's handled by alerts */}

          <div className="grid grid-cols-1 gap-8 items-start">
            {/* Teams Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 self-start">
              <div className="flex justify-between items-center mb-2">
                <button
                  className="flex items-center space-x-2 text-xl font-semibold text-gray-900"
                  onClick={() => setTeamsOpen((v) => !v)}
                >
                  <span>Teams</span>
                  <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${teamsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => openModal('team')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Team
                </button>
              </div>
              
              {teamsOpen && (
              <div className="divide-y-2 divide-gray-400 mt-4">
                {teams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No teams found</p>
                ) : (
                  teams.map((team) => (
                    <div key={team.id} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{team.name}</p>
                        <p className="text-sm text-gray-500">Code: {team.code}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-xs text-gray-400">{new Date(team.created_at).toLocaleDateString()}</span>
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
              )}
            </div>

            {/* Games Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 self-start">
              <div className="flex justify-between items-center mb-2">
                <button
                  className="flex items-center space-x-2 text-xl font-semibold text-gray-900"
                  onClick={() => setGamesOpen((v) => !v)}
                >
                  <span>Games</span>
                  <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${gamesOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => openModal('game')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Game
                </button>
              </div>
              
              {gamesOpen && (
              <div className="divide-y-2 divide-gray-400 mt-4">
                {games.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No games found</p>
                ) : (
                  games.map((game) => (
                    <div key={game.id} className="flex items-center justify-between px-3 py-2">
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
              )}
            </div>

            {/* Actions Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 self-start">
              <div className="flex justify-between items-center mb-2">
                <button
                  className="flex items-center space-x-2 text-xl font-semibold text-gray-900"
                  onClick={() => setActionsOpen((v) => !v)}
                >
                  <span>Actions</span>
                  <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${actionsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => openModal('action')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Action
                </button>
              </div>
              
              {actionsOpen && (
              <div className="divide-y-2 divide-gray-400 mt-4">
                {actions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No actions found</p>
                ) : (
                  actions.map((action) => {
                    const game = games.find(g => g.id === action.game_id);
                    const displayName = (action.display_name && action.display_name.trim().length > 0)
                      ? action.display_name
                      : action.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    
                    return (
                      <div key={action.id} className="flex items-center justify-between px-3 py-2">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="font-medium text-gray-900">{displayName}</p>
                          <p className="text-sm text-gray-500">Game: {game?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">
                            {action.inputs_json?.fields?.length || 0} input fields
                          </p>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-xs text-gray-400">
                            {new Date(action.updated_at).toLocaleDateString()}
                          </span>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openModal('action', action)}
                              className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                              title="Edit action"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteAction(action.id)}
                              className="p-1 text-red-500 hover:text-red-700 transition-colors"
                              title="Delete action"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditData(null); }}
        onSubmit={handleModalSubmit}
        type={modalType}
        loading={modalLoading}
        editData={editData}
        games={games}
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        message={confirmMessage}
        loading={confirmLoading}
        onCancel={() => { if (!confirmLoading) setConfirmOpen(false); }}
        onConfirm={() => { if (confirmOnConfirmRef.current) confirmOnConfirmRef.current(); }}
      />
    </div>
  );
}
