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

const PREP_MS = 10_000;
const WORK_MS = 60_000;
const REST_MS = 60_000;
const ROUNDS = 3;
const STATIONS = 5;
const COUNTDOWN_MS = [3000, 2000, 1000];

// Returns the 18 segments of Fight Gone Bad.
// Each segment: { type, durationMs, startMs, endMs, round }.
// `round` is the round text to show, or null when no round shows.
export function buildFightGoneBad() {
  const segments = [];
  let startMs = 0;

  const add = (type, durationMs, round) => {
    segments.push({ type, durationMs, startMs, endMs: startMs + durationMs, round });
    startMs += durationMs;
  };

  add(TYPE.PREP, PREP_MS, null);
  for (let round = 1; round <= ROUNDS; round += 1) {
    const roundText = `${round}/${ROUNDS}`;
    for (let station = 1; station <= STATIONS; station += 1) {
      add(TYPE.WORK, WORK_MS, roundText);
    }
    if (round < ROUNDS) {
      add(TYPE.REST, REST_MS, roundText);
    }
  }
  return segments;
}

const FIGHT_GONE_BAD = buildFightGoneBad();

export function totalDurationMs(segments = FIGHT_GONE_BAD) {
  return segments[segments.length - 1].endMs;
}

// Returns `M:SS`. Seconds are the remaining time rounded up to the next whole second.
export function formatClock(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Returns { segmentIndex, type, remainingMs, display, round } for an elapsed time.
// A segment owns its start time but not its end time, so elapsed 10,000 is the
// first work segment. From the total duration onward the type is Finished, and
// segmentIndex equals the segment count, one past the last segment.
export function getState(elapsedMs, segments = FIGHT_GONE_BAD) {
  const clampedMs = Math.max(0, elapsedMs);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (clampedMs < segment.endMs) {
      const remainingMs = segment.endMs - clampedMs;
      return {
        segmentIndex: index,
        type: segment.type,
        remainingMs,
        display: formatClock(remainingMs),
        round: segment.round,
      };
    }
  }

  return {
    segmentIndex: segments.length,
    type: TYPE.FINISHED,
    remainingMs: 0,
    display: formatClock(0),
    round: segments[segments.length - 1].round,
  };
}

// Returns the full beep schedule as [{ timeMs, type }], sorted by time.
export function buildBeepSchedule(segments = FIGHT_GONE_BAD) {
  const beeps = [];

  segments.forEach((segment, index) => {
    if (index > 0) {
      beeps.push({ timeMs: segment.startMs, type: BEEP.LONG });
    }
    for (const beforeEndMs of COUNTDOWN_MS) {
      beeps.push({ timeMs: segment.endMs - beforeEndMs, type: BEEP.SHORT });
    }
  });
  beeps.push({ timeMs: totalDurationMs(segments), type: BEEP.END });

  return beeps.sort((a, b) => a.timeMs - b.timeMs);
}
