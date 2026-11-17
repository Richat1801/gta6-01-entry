// Solmar Bay: localStorage save. One job: persist cash, mission progress,
// health and position — and read them back. Nothing else touches storage.

const SAVE_KEY = 'solmarbay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(state.cash),
      missionIndex: state.missionIndex,
      health: Math.round(state.health),
      position: { x: state.playerX, y: state.playerY, z: state.playerZ },
      yaw: state.playerYaw,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
}
