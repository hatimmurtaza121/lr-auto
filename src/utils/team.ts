// Utility functions for team management

export const getSelectedTeamId = (): number | null => {
  if (typeof window === 'undefined') return null;
  const teamId = localStorage.getItem('selectedTeamId');
  return teamId ? parseInt(teamId, 10) : null;
};

export const setSelectedTeamId = (teamId: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('selectedTeamId', teamId.toString());
};

export const clearSelectedTeamId = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('selectedTeamId');
};

// Function to get team context for API calls
export const getTeamContext = () => {
  const teamId = getSelectedTeamId();
  if (!teamId) {
    throw new Error('No team selected. Please select a team first.');
  }
  return { teamId };
}; 