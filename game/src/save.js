// Solmar Bay save: localStorage persistence for cash, progress and position.
// One job: remember the run, and forget it on request.

const SAVE_KEY = 'solmar-bay-save-v1';

/** Write the current run to localStorage. Returns true on success. */
export function saveGame(state) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(state.cash),
      missionIndex: state.missions.missionIndex,
      missionsDone: state.missions.done,
      playerX: state.player.x,
      playerZ: state.player.z,
      playerAngle: state.player.angle,
      health: state.player.health,
      clockMinutes: state.clockMinutes,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read a saved run, or null when there is none / it is unreadable. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** Delete the saved run. */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/** Whether a saved run exists. */
export function hasSave() {
  return loadGame() !== null;
}
