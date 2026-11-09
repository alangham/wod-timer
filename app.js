// DOM, screens, state machine, controls and drawing.

import {
  MODE,
  TYPE,
  adjustRoundCount,
  buildBeepSchedule,
  buildSegments,
  clockDigitCount,
  defaultSettings,
  getState,
  totalDurationMs,
  validateSettings,
} from './timeline.js';
import * as audio from './audio.js';
import { loadSettings, saveSettings } from './settings.js';

const STATE = Object.freeze({
  IDLE: 'Idle',
  PREP: 'Prep',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  FINISHED: 'Finished',
});

const SETUP_TITLES = {
  [MODE.FOR_TIME]: 'For Time',
  [MODE.AMRAP]: 'AMRAP',
  [MODE.EMOM]: 'EMOM',
  [MODE.TABATA]: 'Tabata',
  [MODE.CUSTOM]: 'Custom intervals',
};

// The fields of each setup screen, in order.
const SETUP_FIELDS = {
  [MODE.FOR_TIME]: [
    { key: 'capMs', kind: 'time', label: 'Time cap', hint: '0:00 means no cap.' },
  ],
  [MODE.AMRAP]: [
    { key: 'timeMs', kind: 'time', label: 'Time' },
  ],
  [MODE.EMOM]: [
    { key: 'intervalMs', kind: 'time', label: 'Interval' },
    { key: 'rounds', kind: 'count', label: 'Rounds' },
  ],
  [MODE.TABATA]: [
    { key: 'workMs', kind: 'time', label: 'Work' },
    { key: 'restMs', kind: 'time', label: 'Rest' },
    { key: 'rounds', kind: 'count', label: 'Rounds' },
  ],
  [MODE.CUSTOM]: [
    { key: 'rounds', kind: 'count', label: 'Rounds' },
    { key: 'steps', kind: 'steps', label: 'Steps' },
  ],
};

const MAX_STEPS = 20;
const NEW_STEP = { type: TYPE.WORK, durationMs: 60_000 };

/* ---------- Seven-segment drawing ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIGIT_W = 60;
const DIGIT_H = 100;
const DIGIT_GAP = 8;
const COLON_W = 14;
const SLASH_W = 24;
const HALF = 7; // Half the thickness of a segment.
const TIP = 1.5; // Space between the tips of two segments.
// The width of the word REST and the gap before it, in heights of the row below
// the clock. styles.css uses the same 0.5 font size and 0.15 gap.
const REST_ASPECT = 1.5;
const SIDE_GAP = 0.15;

// A space is a digit with all segments unlit.
const SEGMENTS_ON = {
  ' ': '',
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
  const on = SEGMENTS_ON[character] ?? '';
  for (const [letter, element] of Object.entries(segments)) {
    element.classList.toggle('on', on.includes(letter));
  }
}

// Sets a row of digits from text, aligned to the right. A missing digit on
// the left shows with all segments unlit.
function setDigits(digits, text) {
  const characters = text.padStart(digits.length, ' ');
  digits.forEach((digit, index) => setDigit(digit, characters[index]));
}

// `M:SS` with 3 digits, or `MM:SS` with 4 digits.
function buildClock(host, digitCount) {
  const width = DIGIT_W * digitCount + DIGIT_GAP * digitCount + COLON_W;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${DIGIT_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  });

  const digits = [];
  let x = 0;
  for (let index = 0; index < digitCount - 2; index += 1) {
    digits.push(addDigit(svg, x));
    x += DIGIT_W + DIGIT_GAP;
  }
  for (const y of [28, 58]) {
    svg.append(svgElement('rect', {
      class: 'seg on', x, y, width: COLON_W, height: COLON_W,
    }));
  }
  x += COLON_W + DIGIT_GAP;
  digits.push(addDigit(svg, x));
  x += DIGIT_W + DIGIT_GAP;
  digits.push(addDigit(svg, x));

  host.replaceChildren(svg);
  return { digits, width };
}

// `r/R` when layout.total > 0, otherwise a plain count.
function buildRound(host, layout) {
  const svg = svgElement('svg', { 'aria-hidden': 'true' });
  let x = 0;
  const addDigits = (count) => {
    const digits = [];
    for (let index = 0; index < count; index += 1) {
      digits.push(addDigit(svg, x));
      x += DIGIT_W + DIGIT_GAP;
    }
    return digits;
  };

  const current = addDigits(layout.current);
  let total = [];
  if (layout.total > 0) {
    svg.append(polygon([
      [x, DIGIT_H], [x + 9, DIGIT_H],
      [x + SLASH_W, 0], [x + SLASH_W - 9, 0],
    ], 'seg on'));
    x += SLASH_W + DIGIT_GAP;
    total = addDigits(layout.total);
  }

  const width = x - DIGIT_GAP;
  svg.setAttribute('viewBox', `0 0 ${width} ${DIGIT_H}`);
  host.replaceChildren(svg);
  return { current, total, width };
}

// The digit counts of the round display, or null if the mode shows no round.
function roundLayout(mode, segments) {
  if (mode === MODE.AMRAP) {
    return { current: 3, total: 0 };
  }
  const totals = segments
    .filter((segment) => segment.round !== null)
    .map((segment) => segment.round.split('/')[1].length);
  if (totals.length === 0) {
    return null;
  }
  const digits = Math.max(...totals);
  return { current: digits, total: digits };
}

/* ---------- Page elements ---------- */

const menuScreen = document.getElementById('menu');
const setupScreen = document.getElementById('setup');
const timerScreen = document.getElementById('timer');

const setupTitle = document.getElementById('setup-title');
const setupFields = document.getElementById('setup-fields');
const setupBackButton = document.getElementById('setup-back');
const setupDefaultsButton = document.getElementById('setup-defaults');
const setupStartButton = document.getElementById('setup-start');

const displayEl = document.getElementById('display');
const clockEl = document.getElementById('clock');
const sideEl = document.getElementById('side');
const roundEl = document.getElementById('round');
const restEl = document.getElementById('rest');
const controlsEl = document.getElementById('controls');
const menuButton = document.getElementById('menu-button');
const resetIconButton = document.getElementById('reset-icon');
const minusButton = document.getElementById('minus');
const startButton = document.getElementById('start');
const plusButton = document.getElementById('plus');
const doneButton = document.getElementById('done');
const resumeButton = document.getElementById('resume');
const resetButton = document.getElementById('reset');
const pauseButton = document.getElementById('pause');

function showScreen(screen) {
  for (const element of [menuScreen, setupScreen, timerScreen]) {
    element.hidden = element !== screen;
  }
}

/* ---------- Setup screen ---------- */

let setupMode = null;

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function numberInput(label, maxLength) {
  const input = element('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    maxlength: String(maxLength),
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': label,
  });
  input.addEventListener('focus', () => input.select());
  return input;
}

function timeInput(label) {
  const group = element('div', { class: 'time-input', role: 'group', 'aria-label': label });
  const minutes = numberInput(`${label} minutes`, 2);
  minutes.classList.add('minutes');
  const seconds = numberInput(`${label} seconds`, 2);
  seconds.classList.add('seconds');
  group.append(minutes, element('span', { class: 'colon', 'aria-hidden': 'true' }, ':'), seconds);
  return group;
}

function writeTime(container, ms) {
  const totalSeconds = Math.round(ms / 1000);
  container.querySelector('.minutes').value = String(Math.floor(totalSeconds / 60));
  container.querySelector('.seconds').value = String(totalSeconds % 60).padStart(2, '0');
}

// An empty field counts as 0. Any other text that is not a whole number in
// range gives NaN, which validation reports.
function readWholeNumber(input, max) {
  const text = input.value.trim();
  if (text === '') {
    return 0;
  }
  if (!/^\d+$/.test(text)) {
    return Number.NaN;
  }
  const value = Number(text);
  return value <= max ? value : Number.NaN;
}

function readTime(container) {
  const minutes = readWholeNumber(container.querySelector('.minutes'), 99);
  const seconds = readWholeNumber(container.querySelector('.seconds'), 59);
  return (minutes * 60 + seconds) * 1000;
}

function readCount(input) {
  const text = input.value.trim();
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

function errorSlot() {
  return element('span', { class: 'field-error', 'aria-live': 'polite' });
}

function setStepType(row, type) {
  row.dataset.type = type;
  for (const button of row.querySelectorAll('.type-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.type === type));
  }
}

function stepRow(step) {
  const row = element('li', { class: 'step-row' });
  const number = element('span', { class: 'step-number' });
  const typeSwitch = element('div', { class: 'type-switch', role: 'group', 'aria-label': 'Step type' });
  for (const type of [TYPE.WORK, TYPE.REST]) {
    const button = element('button', { type: 'button', 'data-type': type }, type);
    button.addEventListener('click', () => {
      setStepType(row, type);
      validateSetup();
    });
    typeSwitch.append(button);
  }
  const time = timeInput('Step time');
  const remove = element('button', { type: 'button', class: 'remove' }, 'Remove');
  remove.addEventListener('click', () => {
    row.remove();
    updateSteps();
  });
  row.append(number, typeSwitch, time, remove, errorSlot());
  setStepType(row, step.type);
  writeTime(time, step.durationMs);
  return row;
}

function stepList() {
  return setupFields.querySelector('.step-list');
}

// Numbers the steps, shows Remove and Add step as section 4 says, and checks
// the settings again.
function updateSteps() {
  const rows = [...stepList().children];
  rows.forEach((row, index) => {
    row.querySelector('.step-number').textContent = String(index + 1);
    row.querySelector('.remove').hidden = rows.length <= 1;
  });
  setupFields.querySelector('.add-step').hidden = rows.length >= MAX_STEPS;
  validateSetup();
}

function renderSetup(settings) {
  const fields = SETUP_FIELDS[setupMode].map((definition) => {
    const field = element('div', { class: 'field', 'data-field': definition.key });
    field.append(element('span', { class: 'field-label' }, definition.label));

    if (definition.kind === 'time') {
      const time = timeInput(definition.label);
      writeTime(time, settings[definition.key]);
      field.append(time, errorSlot());
    } else if (definition.kind === 'count') {
      const input = numberInput(definition.label, 2);
      input.classList.add('count');
      input.value = String(settings[definition.key]);
      field.append(input, errorSlot());
    } else {
      const list = element('ol', { class: 'step-list' });
      list.append(...settings.steps.map(stepRow));
      const add = element('button', { type: 'button', class: 'add-step' }, 'Add step');
      add.addEventListener('click', () => {
        stepList().append(stepRow(NEW_STEP));
        updateSteps();
      });
      field.append(list, errorSlot(), add);
    }

    if (definition.hint) {
      field.append(element('span', { class: 'field-hint' }, definition.hint));
    }
    return field;
  });

  setupFields.replaceChildren(...fields);
  if (setupMode === MODE.CUSTOM) {
    updateSteps();
  } else {
    validateSetup();
  }
}

function readSetup() {
  const settings = {};
  for (const definition of SETUP_FIELDS[setupMode]) {
    const field = setupFields.querySelector(`[data-field="${definition.key}"]`);
    if (definition.kind === 'time') {
      settings[definition.key] = readTime(field);
    } else if (definition.kind === 'count') {
      settings[definition.key] = readCount(field.querySelector('.count'));
    } else {
      settings.steps = [...stepList().children].map((row) => ({
        type: row.dataset.type,
        durationMs: readTime(row),
      }));
    }
  }
  return settings;
}

// Returns the element that holds a field, for an error from validateSettings.
function errorTarget(fieldName) {
  const step = /^steps\.(\d+)\./.exec(fieldName);
  if (step) {
    return stepList().children[Number(step[1])] ?? null;
  }
  return setupFields.querySelector(`[data-field="${fieldName}"]`);
}

// Shows a message next to each field that is out of range, and disables Start
// if there is one.
function validateSetup() {
  const errors = validateSettings(setupMode, readSetup());

  for (const slot of setupFields.querySelectorAll('.field-error')) {
    slot.textContent = '';
  }
  for (const input of setupFields.querySelectorAll('input')) {
    input.removeAttribute('aria-invalid');
  }

  for (const error of errors) {
    const target = errorTarget(error.field);
    if (!target) {
      continue;
    }
    // Each field and each step row has one error slot as a direct child.
    const slot = [...target.children].find((child) => child.classList.contains('field-error'));
    if (slot && !slot.textContent) {
      slot.textContent = error.message;
    }
    // A time or count error marks the inputs of that field or step row.
    if (error.field !== 'steps' && !error.field.endsWith('.type')) {
      for (const input of target.querySelectorAll('input')) {
        input.setAttribute('aria-invalid', 'true');
      }
    }
  }

  setupStartButton.disabled = errors.length > 0;
  return errors;
}

function openSetup(mode) {
  setupMode = mode;
  setupTitle.textContent = SETUP_TITLES[mode];
  renderSetup(loadSettings(mode));
  showScreen(setupScreen);
  setupFields.scrollTop = 0;
}

function onSetupStart() {
  const settings = readSetup();
  if (validateSetup().length > 0) {
    return;
  }
  saveSettings(setupMode, settings);
  openTimer(setupMode, settings);
}

setupFields.addEventListener('input', validateSetup);
setupBackButton.addEventListener('click', () => showScreen(menuScreen));
setupDefaultsButton.addEventListener('click', () => renderSetup(defaultSettings(setupMode)));
setupStartButton.addEventListener('click', onSetupStart);

/* ---------- Mode menu ---------- */

for (const button of menuScreen.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    const { mode } = button.dataset;
    if (mode === MODE.FIGHT_GONE_BAD) {
      openTimer(mode, defaultSettings(mode));
    } else {
      openSetup(mode);
    }
  });
}

/* ---------- Timer screen ---------- */

let workout = null; // { mode, segments, beeps, totalMs }
let clockDisplay = null; // { digits, width }
let roundDisplay = null; // { current, total, width }, or null
let drawnClock = null;
let drawnRound = null;
let roundCount = 0; // The AMRAP round count.

function openTimer(mode, settings) {
  const segments = buildSegments(mode, settings);
  workout = {
    mode,
    segments,
    beeps: buildBeepSchedule(segments),
    totalMs: totalDurationMs(segments),
  };

  const layout = roundLayout(mode, segments);
  const hasRest = segments.some((segment) => segment.type === TYPE.REST);
  const hasSide = layout !== null || hasRest;
  sideEl.hidden = !hasSide;
  roundEl.hidden = layout === null;
  restEl.hidden = !hasRest;
  displayEl.classList.toggle('no-side', !hasSide);

  clockDisplay = buildClock(clockEl, clockDigitCount(segments));
  roundDisplay = layout ? buildRound(roundEl, layout) : null;
  // The width of the row below the clock, in heights of that row.
  let sideAspect = 0;
  if (roundDisplay) {
    sideAspect += roundDisplay.width / DIGIT_H;
    timerScreen.style.setProperty('--round-aspect', String(roundDisplay.width / DIGIT_H));
  }
  if (hasRest) {
    sideAspect += REST_ASPECT + (roundDisplay ? SIDE_GAP : 0);
  }
  timerScreen.style.setProperty('--clock-aspect', String(clockDisplay.width / DIGIT_H));
  timerScreen.style.setProperty('--side-aspect', String(sideAspect || 1));

  setState(STATE.IDLE);
  bankedMs = 0;
  roundCount = 0;
  hidePause();
  drawnClock = null;
  drawnRound = undefined;
  draw(getState(0, segments));
  showControls();
  showScreen(timerScreen);
}

// The AMRAP round count shows in Prep, Running, Paused and Finished, as
// section 9 says.
function roundText(view) {
  if (workout.mode === MODE.AMRAP) {
    return state === STATE.IDLE ? null : String(roundCount);
  }
  return view.round;
}

function draw(view) {
  if (view.display !== drawnClock) {
    drawnClock = view.display;
    setDigits(clockDisplay.digits, view.display.replace(':', ''));
    clockEl.setAttribute('aria-label', view.display);
  }

  const round = roundText(view);
  if (roundDisplay && round !== drawnRound) {
    drawnRound = round;
    roundEl.classList.toggle('blank', round === null);
    if (round === null) {
      roundEl.removeAttribute('aria-label');
    } else {
      const [current, total = ''] = round.split('/');
      setDigits(roundDisplay.current, current);
      setDigits(roundDisplay.total, total);
      roundEl.setAttribute('aria-label', workout.mode === MODE.AMRAP ? `${round} rounds` : `Round ${round}`);
    }
  }

  const isRest = view.type === TYPE.REST;
  timerScreen.dataset.tone = isRest ? 'green' : 'red';
  restEl.classList.toggle('blank', !isRest);
}

/* ---------- Controls ---------- */

// The controls in each state, as in section 9. The order on the screen is set
// by index.html: the small Menu, Reset and -1 first, the large button next, and
// Pause last. So a quick second tap on Pause hits Resume, not the small Reset.
//   Idle:     Menu, Start
//   Prep:     Pause when revealed
//   Running:  -1 and +1 in AMRAP, Done in For Time, Pause when revealed
//   Paused:   Reset, Resume
//   Finished: Menu, Reset
// With no control, the controls section is hidden and the display uses the full
// screen. A hidden button takes no space.
function showControls() {
  const isAmrap = workout.mode === MODE.AMRAP;
  const isForTime = workout.mode === MODE.FOR_TIME;
  const isRunning = state === STATE.RUNNING;
  const small = new Map([
    [menuButton, state === STATE.IDLE || state === STATE.FINISHED],
    [resetIconButton, state === STATE.PAUSED],
    [minusButton, isAmrap && isRunning],
    [pauseButton, isCounting() && pauseRevealed],
  ]);
  const large = new Map([
    [startButton, state === STATE.IDLE],
    [plusButton, isAmrap && isRunning],
    [doneButton, isForTime && isRunning],
    [resumeButton, state === STATE.PAUSED],
    [resetButton, state === STATE.FINISHED],
  ]);
  for (const [button, show] of [...small, ...large]) {
    button.hidden = !show;
  }
  const hasLarge = [...large.values()].some(Boolean);
  const hasSmall = [...small.values()].some(Boolean);
  controlsEl.hidden = !hasLarge && !hasSmall;
  controlsEl.classList.toggle('compact', !hasLarge);
  timerScreen.dataset.state = state;
}

// The tap guard of section 9. A new button can show where the finger just
// tapped, so a late tap or a double tap could hit it.
// - After each change of state, every control except Pause ignores taps for
//   0.5 s.
// - After the change to Finished, every control ignores taps for 1.5 s.
// - A tap on the display is not guarded.
// setState() starts the guard.
const TAP_GUARD_MS = 500;
const FINISHED_TAP_GUARD_MS = 1500;
let guardUntil = 0;
let guardCoversPause = false;

function startTapGuard(toFinished) {
  guardUntil = performance.now() + (toFinished ? FINISHED_TAP_GUARD_MS : TAP_GUARD_MS);
  guardCoversPause = toFinished;
}

function isGuarded(button) {
  if (performance.now() >= guardUntil) {
    return false;
  }
  return button !== pauseButton || guardCoversPause;
}

// A guarded tap does nothing. The controls are outside the display, so the tap
// does not show Pause either.
function onControl(button, action) {
  button.addEventListener('click', () => {
    if (!isGuarded(button)) {
      action();
    }
  });
}

// Pause is hidden in Prep and Running. A tap on the display shows it for 3 s,
// and each new tap starts the 3 s again. The tap only shows Pause. It never
// pauses the timer.
const PAUSE_SHOW_MS = 3000;
let pauseRevealed = false;
let pauseHideTimer = null;

function revealPause() {
  clearTimeout(pauseHideTimer);
  pauseHideTimer = setTimeout(() => {
    hidePause();
    showControls();
  }, PAUSE_SHOW_MS);
  if (!pauseRevealed) {
    pauseRevealed = true;
    showControls();
  }
}

// Clears the reveal. The caller updates the controls.
function hidePause() {
  clearTimeout(pauseHideTimer);
  pauseHideTimer = null;
  pauseRevealed = false;
}

function onDisplayTap() {
  if (workout && isCounting()) {
    revealPause();
  }
}

/* ---------- Clock ---------- */

let state = STATE.IDLE;
let bankedMs = 0; // Elapsed time before the current Start or Resume.
let legStartPerf = 0;
let frameId = null;

function isCounting() {
  return state === STATE.PREP || state === STATE.RUNNING;
}

// Every change of state goes through here, so each one starts the tap guard.
function setState(next) {
  if (next !== state) {
    startTapGuard(next === STATE.FINISHED);
  }
  state = next;
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
  const view = getState(elapsedMs, workout.segments);
  const stateBefore = state;
  audio.sync(elapsedMs);
  if (view.type === TYPE.FINISHED) {
    finish();
  } else {
    setState(view.type === TYPE.PREP ? STATE.PREP : STATE.RUNNING);
  }
  draw(view);
  if (state !== stateBefore) {
    // Prep to Running shows Done in For Time, and +1 and -1 in AMRAP.
    showControls();
  }
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
  if (state !== STATE.IDLE) {
    return;
  }
  beginLeg();
  audio.enable();
  bankedMs = 0;
  roundCount = 0;
  setState(STATE.PREP);
  audio.arm(workout.beeps);
  requestWakeLock();
  tick();
  showControls();
  startFrames();
}

function onPause() {
  if (!isCounting()) {
    return;
  }
  // The workout can reach its end in this tick.
  const elapsedMs = tick();
  if (!isCounting()) {
    return;
  }
  bankedMs = elapsedMs;
  setState(STATE.PAUSED);
  hidePause();
  stopFrames();
  audio.disarm();
  releaseWakeLock();
  showControls();
}

function onResume() {
  if (state !== STATE.PAUSED) {
    return;
  }
  beginLeg();
  audio.enable();
  setState(getState(bankedMs, workout.segments).type === TYPE.PREP ? STATE.PREP : STATE.RUNNING);
  audio.arm(workout.beeps);
  requestWakeLock();
  tick();
  showControls();
  startFrames();
}

// Stops the workout and goes to Idle.
function stopWorkout() {
  setState(STATE.IDLE);
  bankedMs = 0;
  roundCount = 0;
  hidePause();
  stopFrames();
  audio.disarm();
  releaseWakeLock();
}

function onReset() {
  stopWorkout();
  draw(getState(0, workout.segments));
  showControls();
}

function onMenu() {
  stopWorkout();
  showScreen(menuScreen);
}

// For Time: ends the workout and keeps the elapsed time on the clock.
function onDone() {
  if (workout.mode !== MODE.FOR_TIME || state !== STATE.RUNNING) {
    return;
  }
  const elapsedMs = tick();
  if (state !== STATE.RUNNING) {
    // The workout reached its end in this tick.
    return;
  }
  audio.enable();
  audio.playEndNow();
  setState(STATE.FINISHED);
  bankedMs = elapsedMs;
  hidePause();
  stopFrames();
  releaseWakeLock();
  draw({ ...getState(elapsedMs, workout.segments), type: TYPE.FINISHED });
  showControls();
}

// +1 and -1 show only in Running, as section 9 says. The clock is read first,
// so a tap that comes after the end of the workout, before the next frame, does
// not change the final count.
function onRoundCount(delta) {
  if (workout.mode !== MODE.AMRAP || state !== STATE.RUNNING) {
    return;
  }
  const elapsedMs = tick();
  if (state !== STATE.RUNNING) {
    return;
  }
  roundCount = adjustRoundCount(roundCount, delta);
  draw(getState(elapsedMs, workout.segments));
}

// The end beep is already on the audio clock, so it keeps sounding here.
function finish() {
  setState(STATE.FINISHED);
  bankedMs = workout.totalMs;
  hidePause();
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
  if (isCounting()) {
    requestWakeLock();
    startFrames();
  }
}

/* ---------- Events ---------- */

onControl(startButton, onStart);
onControl(pauseButton, onPause);
onControl(resumeButton, onResume);
onControl(resetButton, onReset);
onControl(resetIconButton, onReset);
onControl(doneButton, onDone);
onControl(menuButton, onMenu);
onControl(plusButton, () => onRoundCount(1));
onControl(minusButton, () => onRoundCount(-1));
displayEl.addEventListener('click', onDisplayTap);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    onReturnToPage();
  } else {
    audio.handleHide();
  }
});
window.addEventListener('pagehide', () => audio.handleHide());
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

showScreen(menuScreen);
