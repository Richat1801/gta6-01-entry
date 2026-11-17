// Solmar Bay — save / load via localStorage: cash, story progress, position,
// health and the in-game clock. Saves are small, plain JSON, no secrets.
import { GAME } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      v: 1,
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionActive: state.missionActive,
      health: state.health,
      wanted: state.wanted,
      pos: [state.pos.x, state.pos.z],
      heading: state.heading,
      clock: state.clock,
      storyDone: state.storyDone,
    };
    localStorage.setItem(GAME.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(GAME.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try { return localStorage.getItem(GAME.saveKey) !== null; } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(GAME.saveKey); } catch { /* ignore */ }
}
