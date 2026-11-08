// Pure functions for the workout timeline. No DOM. No browser APIs.
// All times are in milliseconds from the moment Start was tapped.

export const TYPE = Object.freeze({
  PREP: 'Prep',
  WORK: 'Work',
  REST: 'Rest',
  FINISHED: 'Finished',
});

export const BEEP = Object.freeze({
  SHORT: 'short',
  LONG: 'long',
  END: 'end',
});

// The count direction of a segment.
export const DIRECTION = Object.freeze({
  DOWN: 'down',
  UP: 'up',
});

export const MODE = Object.freeze({
  FIGHT_GONE_BAD: 'fightGoneBad',
  FOR_TIME: 'forTime',
  AMRAP: 'amrap',
  EMOM: 'emom',
  TABATA: 'tabata',
  CUSTOM: 'custom',
});

const SECOND_MS = 1000;
const time = (minutes, seconds) => (minutes * 60 + seconds) * SECOND_MS;

const PREP_MS = time(0, 10);
const NO_CAP_MS = time(99, 59);
const COUNTDOWN_MS = [3000, 2000, 1000];
const MAX_ROUND_COUNT = 999;
const FOUR_DIGIT_MS = time(10, 0);

// The ranges in section 4 of SPEC.md. Both ends are allowed.
const RANGE = Object.freeze({
  cap: [time(0, 0), time(99, 59)],
  amrapTime: [time(0, 10), time(99, 59)],
  interval: [time(0, 10), time(10, 0)],
  tabataWork: [time(0, 5), time(5, 0)],
  tabataRest: [time(0, 0), time(5, 0)],
  stepTime: [time(0, 5), time(99, 59)],
  rounds: [1, 99],
  steps: [1, 20],
});

// Settings for each mode. Times are in milliseconds.
// For Time: { capMs }. A cap of 0 means no cap.
// AMRAP: { timeMs }
// EMOM: { intervalMs, rounds }
// Tabata: { workMs, restMs, rounds }
// Custom: { rounds, steps: [{ type, durationMs }] }, with type Work or Rest.
// Fight Gone Bad: fixed Custom settings.
const DEFAULTS = Object.freeze({
  [MODE.FIGHT_GONE_BAD]: {
    rounds: 3,
    steps: [
      { type: TYPE.WORK, durationMs: time(1, 0) },
      { type: TYPE.WORK, durationMs: time(1, 0) },
      { type: TYPE.WORK, durationMs: time(1, 0) },
      { type: TYPE.WORK, durationMs: time(1, 0) },
      { type: TYPE.WORK, durationMs: time(1, 0) },
      { type: TYPE.REST, durationMs: time(1, 0) },
    ],
  },
  [MODE.FOR_TIME]: { capMs: time(0, 0) },
  [MODE.AMRAP]: { timeMs: time(12, 0) },
  [MODE.EMOM]: { intervalMs: time(1, 0), rounds: 10 },
  [MODE.TABATA]: { workMs: time(0, 20), restMs: time(0, 10), rounds: 8 },
  [MODE.CUSTOM]: {
    rounds: 4,
    steps: [
      { type: TYPE.WORK, durationMs: time(4, 0) },
      { type: TYPE.REST, durationMs: time(3, 0) },
    ],
  },
});

const isKnownMode = (mode) => Object.values(MODE).includes(mode);
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Returns a new copy of the default settings of a mode.
export function defaultSettings(mode) {
  if (!isKnownMode(mode)) {
    throw new RangeError(`Unknown mode: ${mode}`);
  }
  return JSON.parse(JSON.stringify(DEFAULTS[mode]));
}

/* ---------- Validation ---------- */

function timeError(value, [min, max]) {
  const isWholeSeconds = Number.isInteger(value) && value % SECOND_MS === 0;
  if (!isWholeSeconds || value < min || value > max) {
    return `Use ${formatClock(min)} to ${formatClock(max)}.`;
  }
  return null;
}

function countError(value, [min, max]) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return `Use ${min} to ${max}.`;
  }
  return null;
}

// Returns a list of { field, message }. An empty list means valid.
// `field` is a settings key, such as `rounds`, or a step path, such as
// `steps.2.durationMs`.
export function validateSettings(mode, settings) {
  if (!isKnownMode(mode)) {
    return [{ field: 'mode', message: 'Unknown mode.' }];
  }
  if (mode === MODE.FIGHT_GONE_BAD) {
    return [];
  }
  if (!isObject(settings)) {
    return [{ field: 'settings', message: 'No settings.' }];
  }

  const errors = [];
  const check = (field, message) => {
    if (message) {
      errors.push({ field, message });
    }
  };

  switch (mode) {
    case MODE.FOR_TIME:
      check('capMs', timeError(settings.capMs, RANGE.cap));
      break;
    case MODE.AMRAP:
      check('timeMs', timeError(settings.timeMs, RANGE.amrapTime));
      break;
    case MODE.EMOM:
      check('intervalMs', timeError(settings.intervalMs, RANGE.interval));
      check('rounds', countError(settings.rounds, RANGE.rounds));
      break;
    case MODE.TABATA:
      check('workMs', timeError(settings.workMs, RANGE.tabataWork));
      check('restMs', timeError(settings.restMs, RANGE.tabataRest));
      check('rounds', countError(settings.rounds, RANGE.rounds));
      break;
    case MODE.CUSTOM: {
      check('rounds', countError(settings.rounds, RANGE.rounds));
      const { steps } = settings;
      const [minSteps, maxSteps] = RANGE.steps;
      if (!Array.isArray(steps)) {
        check('steps', `Use ${minSteps} to ${maxSteps} steps.`);
        break;
      }
      if (steps.length < minSteps || steps.length > maxSteps) {
        check('steps', `Use ${minSteps} to ${maxSteps} steps.`);
      }
      steps.forEach((step, index) => {
        const isStep = isObject(step);
        if (!isStep || (step.type !== TYPE.WORK && step.type !== TYPE.REST)) {
          check(`steps.${index}.type`, 'Use Work or Rest.');
        }
        check(`steps.${index}.durationMs`, timeError(isStep ? step.durationMs : undefined, RANGE.stepTime));
      });
      break;
    }
    default:
      break;
  }
  return errors;
}

/* ---------- Segments ---------- */

// Returns the work and rest parts of each round, by the rules in section 4.
function roundsOf(mode, settings) {
  switch (mode) {
    case MODE.FIGHT_GONE_BAD:
      return roundsOf(MODE.CUSTOM, DEFAULTS[MODE.FIGHT_GONE_BAD]);
    case MODE.CUSTOM:
      return Array.from({ length: settings.rounds }, () => settings.steps);
    case MODE.EMOM:
      return Array.from({ length: settings.rounds }, () => [
        { type: TYPE.WORK, durationMs: settings.intervalMs },
      ]);
    case MODE.TABATA:
      return Array.from({ length: settings.rounds }, () => [
        { type: TYPE.WORK, durationMs: settings.workMs },
        { type: TYPE.REST, durationMs: settings.restMs },
      ]);
    default:
      return [];
  }
}

// Returns the segment list for a mode, by the rules in section 5.
// Each segment: { type, durationMs, startMs, endMs, round, direction }.
// `round` is the round text to show, or null when no round shows.
// Throws a RangeError if the settings are not valid.
export function buildSegments(mode, settings) {
  const errors = validateSettings(mode, settings);
  if (errors.length > 0) {
    const detail = errors.map((error) => `${error.field}: ${error.message}`).join(' ');
    throw new RangeError(`Settings for ${mode} are not valid. ${detail}`);
  }

  const segments = [];
  let startMs = 0;
  const add = (type, durationMs, round, direction = DIRECTION.DOWN) => {
    // Rule 3: no segment with a duration of 0.
    if (durationMs === 0) {
      return;
    }
    segments.push({ type, durationMs, startMs, endMs: startMs + durationMs, round, direction });
    startMs += durationMs;
  };

  // Rule 1.
  add(TYPE.PREP, PREP_MS, null);

  if (mode === MODE.FOR_TIME) {
    // Rule 5: one count-up work segment.
    add(TYPE.WORK, settings.capMs === 0 ? NO_CAP_MS : settings.capMs, null, DIRECTION.UP);
  } else if (mode === MODE.AMRAP) {
    // Rule 6.
    add(TYPE.WORK, settings.timeMs, null);
  } else {
    // Rule 2. A rest segment shows the round that it follows.
    const rounds = roundsOf(mode, settings);
    rounds.forEach((parts, index) => {
      const roundText = `${index + 1}/${rounds.length}`;
      for (const part of parts) {
        add(part.type, part.durationMs, roundText);
      }
    });
  }

  // Rule 4: a workout never ends on rest.
  while (segments[segments.length - 1].type === TYPE.REST) {
    segments.pop();
  }
  return segments;
}

// Returns the 18 segments of Fight Gone Bad. This is Custom with 3 rounds of
// 5 x Work 1:00, then Rest 1:00.
export function buildFightGoneBad() {
  return buildSegments(MODE.FIGHT_GONE_BAD);
}

const FIGHT_GONE_BAD = buildFightGoneBad();

export function totalDurationMs(segments = FIGHT_GONE_BAD) {
  return segments[segments.length - 1].endMs;
}

// The clock needs 4 digits if any segment shows 10:00 or more. Otherwise it
// needs 3 digits.
export function clockDigitCount(segments = FIGHT_GONE_BAD) {
  return segments.some((segment) => segment.durationMs >= FOUR_DIGIT_MS) ? 4 : 3;
}

/* ---------- Clock ---------- */

// Returns `M:SS` below 10 minutes and `MM:SS` from 10 minutes.
// Count down: the seconds are rounded up to the next whole second.
// Count up: the seconds are rounded down to the whole second.
export function formatClock(ms, direction = DIRECTION.DOWN) {
  const totalSeconds = direction === DIRECTION.UP
    ? Math.floor(ms / SECOND_MS)
    : Math.ceil(ms / SECOND_MS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Returns { segmentIndex, type, direction, remainingMs, display, round } for
// an elapsed time.
// A segment owns its start time but not its end time, so elapsed 10,000 is the
// first segment after prep. From the total duration onward the type is
// Finished, and segmentIndex equals the segment count, one past the last
// segment.
export function getState(elapsedMs, segments = FIGHT_GONE_BAD) {
  const clampedMs = Math.max(0, elapsedMs);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (clampedMs < segment.endMs) {
      const direction = segment.direction ?? DIRECTION.DOWN;
      const remainingMs = segment.endMs - clampedMs;
      const shownMs = direction === DIRECTION.UP ? clampedMs - segment.startMs : remainingMs;
      return {
        segmentIndex: index,
        type: segment.type,
        direction,
        remainingMs,
        display: formatClock(shownMs, direction),
        round: segment.round,
      };
    }
  }

  // Count-down modes end on 0:00. For Time ends on the cap, or on 99:59.
  const last = segments[segments.length - 1];
  const direction = last.direction ?? DIRECTION.DOWN;
  return {
    segmentIndex: segments.length,
    type: TYPE.FINISHED,
    direction,
    remainingMs: 0,
    display: direction === DIRECTION.UP ? formatClock(last.durationMs, direction) : formatClock(0),
    round: last.round,
  };
}

// Returns the new AMRAP round count, from 0 to 999.
export function adjustRoundCount(count, delta) {
  return Math.min(MAX_ROUND_COUNT, Math.max(0, count + delta));
}

/* ---------- Beeps ---------- */

// Returns the full beep schedule as [{ timeMs, type }], sorted by time.
// A segment shorter than 3 s asks for a short beep at a time where the
// previous segment already has one. That beep plays once.
export function buildBeepSchedule(segments = FIGHT_GONE_BAD) {
  const beeps = [];
  const seen = new Set();
  const add = (timeMs, type) => {
    const key = `${timeMs} ${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      beeps.push({ timeMs, type });
    }
  };

  segments.forEach((segment, index) => {
    if (index > 0) {
      add(segment.startMs, BEEP.LONG);
    }
    for (const beforeEndMs of COUNTDOWN_MS) {
      add(segment.endMs - beforeEndMs, BEEP.SHORT);
    }
  });
  add(totalDurationMs(segments), BEEP.END);

  return beeps.sort((a, b) => a.timeMs - b.timeMs);
}
