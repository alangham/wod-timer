// DOM, state machine, controls and drawing.

import { TYPE, buildBeepSchedule, getState, totalDurationMs } from './timeline.js';
import * as audio from './audio.js';

const STATE = Object.freeze({
  IDLE: 'Idle',
  PREP: 'Prep',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  FINISHED: 'Finished',
});

const BEEPS = buildBeepSchedule();
const TOTAL_MS = totalDurationMs();

/* ---------- Seven-segment drawing ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIGIT_W = 60;
const DIGIT_H = 100;
const DIGIT_GAP = 8;
const COLON_W = 14;
const SLASH_W = 24;
const HALF = 7; // Half the thickness of a segment.
const TIP = 1.5; // Space between the tips of two segments.

const SEGMENTS_ON = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

function horizontalPoints(x1, x2, y) {
  return [
    [x1, y], [x1 + HALF, y - HALF], [x2 - HALF, y - HALF],
    [x2, y], [x2 - HALF, y + HALF], [x1 + HALF, y + HALF],
  ];
}

function verticalPoints(x, y1, y2) {
  return [
    [x, y1], [x + HALF, y1 + HALF], [x + HALF, y2 - HALF],
    [x, y2], [x - HALF, y2 - HALF], [x - HALF, y1 + HALF],
  ];
}

function segmentPoints() {
  const left = HALF;
  const right = DIGIT_W - HALF;
  const top = HALF;
  const middle = DIGIT_H / 2;
  const bottom = DIGIT_H - HALF;
  return {
    a: horizontalPoints(left + TIP, right - TIP, top),
    b: verticalPoints(right, top + TIP, middle - TIP),
    c: verticalPoints(right, middle + TIP, bottom - TIP),
    d: horizontalPoints(left + TIP, right - TIP, bottom),
    e: verticalPoints(left, middle + TIP, bottom - TIP),
    f: verticalPoints(left, top + TIP, middle - TIP),
    g: horizontalPoints(left + TIP, right - TIP, middle),
  };
}

const SEGMENT_POINTS = segmentPoints();

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function polygon(points, className) {
  return svgElement('polygon', {
    class: className,
    points: points.map((point) => point.join(',')).join(' '),
  });
}

// Adds one digit at x. Returns its segments by letter.
function addDigit(svg, x) {
  const group = svgElement('g', { transform: `translate(${x} 0)` });
  const segments = {};
  for (const [letter, points] of Object.entries(SEGMENT_POINTS)) {
    segments[letter] = polygon(points, 'seg');
    group.append(segments[letter]);
  }
  svg.append(group);
  return segments;
}

function setDigit(segments, character) {
  const on = SEGMENTS_ON[character];
  for (const [letter, element] of Object.entries(segments)) {
    element.classList.toggle('on', on.includes(letter));
  }
}

// `M:SS`: three digits and a colon.
function buildClock(host) {
  const width = DIGIT_W * 3 + DIGIT_GAP * 3 + COLON_W;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${DIGIT_H}`,
    preserveAspectRatio: 'xMaxYMid meet',
    'aria-hidden': 'true',
  });

  const minutes = addDigit(svg, 0);
  const colonX = DIGIT_W + DIGIT_GAP;
  for (const y of [28, 58]) {
    svg.append(svgElement('rect', {
      class: 'seg on', x: colonX, y, width: COLON_W, height: COLON_W,
    }));
  }
  const tensX = colonX + COLON_W + DIGIT_GAP;
  const tens = addDigit(svg, tensX);
  const ones = addDigit(svg, tensX + DIGIT_W + DIGIT_GAP);

  host.append(svg);
  return [minutes, tens, ones];
}

// `1/3`: two digits and a slash.
function buildRound(host) {
  const width = DIGIT_W * 2 + DIGIT_GAP * 2 + SLASH_W;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${DIGIT_H}`,
    'aria-hidden': 'true',
  });

  const current = addDigit(svg, 0);
  const slashX = DIGIT_W + DIGIT_GAP;
  svg.append(polygon([
    [slashX, DIGIT_H], [slashX + 9, DIGIT_H],
    [slashX + SLASH_W, 0], [slashX + SLASH_W - 9, 0],
  ], 'seg on'));
  const total = addDigit(svg, slashX + SLASH_W + DIGIT_GAP);

  host.append(svg);
  return [current, total];
}

/* ---------- Page elements ---------- */

const appEl = document.getElementById('app');
const clockEl = document.getElementById('clock');
const roundEl = document.getElementById('round');
const restEl = document.getElementById('rest');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');

const clockDigits = buildClock(clockEl);
const roundDigits = buildRound(roundEl);

let drawnClock = null;
let drawnRound = null;

function draw(view) {
  if (view.display !== drawnClock) {
    drawnClock = view.display;
    const characters = view.display.replace(':', '');
    clockDigits.forEach((digit, index) => setDigit(digit, characters[index]));
    clockEl.setAttribute('aria-label', view.display);
  }

  if (view.round !== drawnRound) {
    drawnRound = view.round;
    roundEl.classList.toggle('blank', view.round === null);
    if (view.round === null) {
      roundEl.removeAttribute('aria-label');
    } else {
      const [current, total] = view.round.split('/');
      setDigit(roundDigits[0], current);
      setDigit(roundDigits[1], total);
      roundEl.setAttribute('aria-label', view.round);
    }
  }

  const isRest = view.type === TYPE.REST;
  appEl.dataset.tone = isRest ? 'green' : 'red';
  restEl.classList.toggle('blank', !isRest);
}

function showControls() {
  startButton.hidden = state !== STATE.IDLE;
  pauseButton.hidden = !(isCounting() || state === STATE.PAUSED);
  pauseButton.textContent = state === STATE.PAUSED ? 'Resume' : 'Pause';
  resetButton.hidden = !(state === STATE.PAUSED || state === STATE.FINISHED);
}

/* ---------- Clock ---------- */

let state = STATE.IDLE;
let bankedMs = 0; // Elapsed time before the current Start or Resume.
let legStartPerf = 0;
let frameId = null;

function isCounting() {
  return state === STATE.PREP || state === STATE.RUNNING;
}

function beginLeg() {
  legStartPerf = performance.now();
}

function elapsedNow() {
  return isCounting() ? bankedMs + (performance.now() - legStartPerf) : bankedMs;
}

// Reads the clock once, and brings the state, the beeps and the display up to
// date. Returns the elapsed time that it read.
function tick() {
  const elapsedMs = elapsedNow();
  const view = getState(elapsedMs);
  audio.sync(elapsedMs);
  if (view.type === TYPE.FINISHED) {
    finish();
  } else {
    state = view.type === TYPE.PREP ? STATE.PREP : STATE.RUNNING;
  }
  draw(view);
  return elapsedMs;
}

function frame() {
  frameId = null;
  if (!isCounting()) {
    return;
  }
  tick();
  startFrames();
}

function startFrames() {
  if (isCounting() && frameId === null) {
    frameId = requestAnimationFrame(frame);
  }
}

function stopFrames() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

/* ---------- Screen wake lock ---------- */

let wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) {
    return;
  }
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!isCounting() || wakeLock) {
      lock.release().catch(() => {});
      return;
    }
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) {
        wakeLock = null;
      }
    });
  } catch {
    // The browser refused the lock. The timer still works, so show no error.
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

/* ---------- Transitions ---------- */

function onStart() {
  audio.enable();
  bankedMs = 0;
  beginLeg();
  state = STATE.PREP;
  audio.arm(BEEPS);
  requestWakeLock();
  tick();
  showControls();
  startFrames();
}

function onPause() {
  const elapsedMs = tick();
  if (!isCounting()) {
    showControls();
    return;
  }
  bankedMs = elapsedMs;
  state = STATE.PAUSED;
  stopFrames();
  audio.disarm();
  releaseWakeLock();
  showControls();
}

function onResume() {
  audio.enable();
  beginLeg();
  state = getState(bankedMs).type === TYPE.PREP ? STATE.PREP : STATE.RUNNING;
  audio.arm(BEEPS);
  requestWakeLock();
  tick();
  showControls();
  startFrames();
}

function onReset() {
  state = STATE.IDLE;
  bankedMs = 0;
  stopFrames();
  audio.disarm();
  releaseWakeLock();
  draw(getState(0));
  showControls();
}

// The end beep is already on the audio clock, so it keeps sounding here.
function finish() {
  state = STATE.FINISHED;
  bankedMs = TOTAL_MS;
  audio.finish();
  stopFrames();
  releaseWakeLock();
  showControls();
}

function onReturnToPage() {
  audio.handleReturn(elapsedNow());
  if (!isCounting()) {
    return;
  }
  tick();
  requestWakeLock();
  startFrames();
}

/* ---------- Events ---------- */

startButton.addEventListener('click', onStart);
pauseButton.addEventListener('click', () => {
  if (state === STATE.PAUSED) {
    onResume();
  } else {
    onPause();
  }
});
resetButton.addEventListener('click', onReset);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    onReturnToPage();
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    onReturnToPage();
  }
});

// A phone can leave the audio clock stopped after a return to the page. A touch
// starts it again, and the next frame then puts the beeps back on the clock.
function resumeAudioOnTouch() {
  if (isCounting()) {
    audio.enable();
  }
}
document.addEventListener('touchend', resumeAudioOnTouch, { passive: true });
document.addEventListener('click', resumeAudioOnTouch);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

draw(getState(0));
showControls();
