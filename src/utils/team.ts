// Utility functions for team management

export const getSelectedTeamId = (): number | null => {
  if (typeof window === 'undefined') return null;
  
  // 1. Check URL first (primary source of truth)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTeam = urlParams.get('team');
  if (urlTeam) {
    const parsedTeamId = parseInt(urlTeam, 10);
    if (!isNaN(parsedTeamId)) {
      // Update localStorage for fallback
      localStorage.setItem('selectedTeamId', urlTeam);
      console.log(`getSelectedTeamId: Retrieved from URL '${urlTeam}' -> parsed as ${parsedTeamId}`);
      return parsedTeamId;
    }
  }
  
  // 2. Fallback to localStorage
  const teamId = localStorage.getItem('selectedTeamId');
  const parsedTeamId = teamId ? parseInt(teamId, 10) : null;
  console.log(`getSelectedTeamId: Retrieved from localStorage '${teamId}' -> parsed as ${parsedTeamId}`);
  return parsedTeamId;
};

export const setSelectedTeamId = (teamId: number): void => {
  if (typeof window === 'undefined') return;
  console.log(`setSelectedTeamId: Setting teamId to ${teamId}`);
  
  // Update localStorage
  localStorage.setItem('selectedTeamId', teamId.toString());
  
  // Update URL to include team parameter
  updateURLWithTeam(teamId);
};

export const clearSelectedTeamId = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('selectedTeamId');
  
  // Remove team parameter from URL
  removeTeamFromURL();
};

// Helper function to update URL with team parameter
const updateURLWithTeam = (teamId: number): void => {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  url.searchParams.set('team', teamId.toString());
  
  // Update URL without page reload
  window.history.replaceState({}, '', url.toString());
  console.log(`updateURLWithTeam: Updated URL to include team=${teamId}`);
};

// Helper function to remove team parameter from URL
const removeTeamFromURL = (): void => {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  url.searchParams.delete('team');
  
  // Update URL without page reload
  window.history.replaceState({}, '', url.toString());
  console.log(`removeTeamFromURL: Removed team parameter from URL`);
};

// Function to get team context for API calls
export const getTeamContext = () => {
  const teamId = getSelectedTeamId();
  if (!teamId) {
    throw new Error('No team selected. Please select a team first.');
  }
  return { teamId };
};

// Function to create navigation URLs with team parameter
export const createTeamURL = (path: string, teamId?: number): string => {
  const currentTeamId = teamId || getSelectedTeamId();
  if (!currentTeamId) {
    return path; // Return path without team if no team selected
  }
  
  const url = new URL(path, window.location.origin);
  url.searchParams.set('team', currentTeamId.toString());
  return url.pathname + url.search;
}; 