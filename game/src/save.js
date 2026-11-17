// Save: cash, mission progress and position persist in localStorage so a
// session can be continued from the start screen.

import { CONFIG } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      playerX: state.playerX,
      playerZ: state.playerZ,
      playerHeading: state.playerHeading,
      health: state.health,
    };
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(CONFIG.saveKey);
  } catch (err) {
    // Storage unavailable; nothing to clear.
  }
}
