// Loads and saves the settings of each mode in localStorage.
// Storage can fail, for example in a private window. Then the app uses the
// defaults and shows no error.

import { defaultSettings, validateSettings } from './timeline.js';

const KEY_PREFIX = 'wod-timer.settings.';

// Returns the saved settings of a mode. If there are none, or if they are not
// valid, returns the defaults.
export function loadSettings(mode) {
  try {
    const text = globalThis.localStorage.getItem(KEY_PREFIX + mode);
    if (text !== null) {
      const saved = JSON.parse(text);
      if (validateSettings(mode, saved).length === 0) {
        return saved;
      }
    }
  } catch {
    // Use the defaults below.
  }
  return defaultSettings(mode);
}

export function saveSettings(mode, settings) {
  try {
    globalThis.localStorage.setItem(KEY_PREFIX + mode, JSON.stringify(settings));
  } catch {
    // The settings are not saved. The timer still works.
  }
}
