// Small UI preferences (v0.10), remembered on this device. Storage can be unavailable (private
// windows, blocked site data): every read and write is guarded and the defaults always work.
import { create } from 'zustand';

const HINTS_KEY = 'summitline.hideKeyHints';

function load(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function save(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* not remembered this time — fine */
  }
}

interface Prefs {
  /** desktop key hints panel hidden by the player */
  hintsHidden: boolean;
  /** quick actions menu open (not remembered) */
  quickOpen: boolean;
  setHintsHidden: (v: boolean) => void;
  setQuickOpen: (v: boolean) => void;
}

export const usePrefs = create<Prefs>((set) => ({
  hintsHidden: load(HINTS_KEY),
  quickOpen: false,
  setHintsHidden: (v) => {
    save(HINTS_KEY, v);
    set({ hintsHidden: v });
  },
  setQuickOpen: (v) => set({ quickOpen: v }),
}));
