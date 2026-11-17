// Solmar Bay — localStorage save and continue.
// One job: persist the run and restore it exactly.
// The mission index is written AFTER it is incremented, never before, so a
// completed mission can never pay twice.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try { return !!window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function saveGame(state) {
  const data = {
    version: 1,
    cash: Math.floor(state.cash),
    missionIndex: state.missionIndex,
    missionStep: state.missionStep,
    health: Math.round(state.health),
    wanted: state.wanted,
    px: +(state.player ? state.player.position.x : 0).toFixed(2),
    pz: +(state.player ? state.player.position.z : 0).toFixed(2),
    pyaw: +state.playerYaw.toFixed(3),
    clock: Math.floor(state.clockSeconds),
    completed: state.completedMissions.slice(),
    savedAt: Date.now(),
  };
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) {}
  return data;
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return null;
    return d;
  } catch (e) { return null; }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
