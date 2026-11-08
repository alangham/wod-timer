import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BEEP,
  DIRECTION,
  MODE,
  TYPE,
  adjustRoundCount,
  buildBeepSchedule,
  buildFightGoneBad,
  buildSegments,
  clockDigitCount,
  defaultSettings,
  formatClock,
  getState,
  totalDurationMs,
  validateSettings,
} from '../timeline.js';

const countByType = (beeps, type) => beeps.filter((beep) => beep.type === type).length;
const timesOfType = (beeps, type) => beeps
  .filter((beep) => beep.type === type)
  .map((beep) => beep.timeMs);
const time = (minutes, seconds) => (minutes * 60 + seconds) * 1000;
const work = (minutes, seconds) => ({ type: TYPE.WORK, durationMs: time(minutes, seconds) });
const rest = (minutes, seconds) => ({ type: TYPE.REST, durationMs: time(minutes, seconds) });
const shape = (segments) => segments.map((segment) => [segment.type, segment.durationMs, segment.round]);
const fieldsOf = (errors) => errors.map((error) => error.field);

// Section 16.1 acceptance tests: Fight Gone Bad.

test('A1. Fight Gone Bad segment list has 18 segments and a total of 1,030,000 ms', () => {
  const segments = buildFightGoneBad();
  assert.equal(segments.length, 18);
  assert.equal(totalDurationMs(segments), 1_030_000);
  const sum = segments.reduce((total, segment) => total + segment.durationMs, 0);
  assert.equal(sum, 1_030_000);
});

test('A2. Fight Gone Bad start of prep', () => {
  const state = getState(0);
  assert.equal(state.type, TYPE.PREP);
  assert.equal(state.type, 'Prep');
  assert.equal(state.display, '0:10');
  assert.equal(state.round, null);
});

test('A3. Fight Gone Bad start of round 1', () => {
  const state = getState(10_000);
  assert.equal(state.type, 'Work');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '1/3');
});

test('A4. Rounding', () => {
  assert.equal(getState(10_999).display, '1:00');
  assert.equal(getState(11_000).display, '0:59');
});

test('A5. Fight Gone Bad first rest', () => {
  const state = getState(310_000);
  assert.equal(state.type, 'Rest');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '1/3');
});

test('A6. Fight Gone Bad start of round 2', () => {
  const state = getState(370_000);
  assert.equal(state.type, 'Work');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '2/3');
});

test('A7. Fight Gone Bad end', () => {
  const state = getState(1_030_000);
  assert.equal(state.type, 'Finished');
  assert.equal(state.display, '0:00');
  assert.equal(state.round, '3/3');
});

test('A8. Fight Gone Bad beep schedule', () => {
  const beeps = buildBeepSchedule();
  assert.equal(countByType(beeps, BEEP.SHORT), 54);
  assert.equal(countByType(beeps, BEEP.LONG), 17);
  assert.deepEqual(timesOfType(beeps, BEEP.END), [1_030_000]);
  assert.equal(timesOfType(beeps, BEEP.LONG).includes(1_030_000), false);
  assert.equal(beeps.length, 72);
});

// Section 16.1 acceptance tests: the other modes.

test('B1. Fight Gone Bad through Custom', () => {
  const custom = buildSegments(MODE.CUSTOM, {
    rounds: 3,
    steps: [work(1, 0), work(1, 0), work(1, 0), work(1, 0), work(1, 0), rest(1, 0)],
  });
  assert.deepEqual(shape(custom), shape(buildFightGoneBad()));
  assert.deepEqual(custom, buildFightGoneBad());
  assert.deepEqual(buildSegments(MODE.FIGHT_GONE_BAD), buildFightGoneBad());
});

test('B2. EMOM defaults', () => {
  const segments = buildSegments(MODE.EMOM, defaultSettings(MODE.EMOM));
  assert.equal(segments.length, 11);
  assert.equal(segments[0].type, TYPE.PREP);
  assert.equal(segments.filter((segment) => segment.type === TYPE.WORK).length, 10);
  assert.equal(totalDurationMs(segments), 610_000);

  const first = getState(10_000, segments);
  assert.equal(first.type, 'Work');
  assert.equal(first.display, '1:00');
  assert.equal(first.round, '1/10');

  const second = getState(70_000, segments);
  assert.equal(second.type, 'Work');
  assert.equal(second.display, '1:00');
  assert.equal(second.round, '2/10');
});

test('B3. Tabata defaults', () => {
  const segments = buildSegments(MODE.TABATA, defaultSettings(MODE.TABATA));
  assert.equal(segments.length, 16);
  assert.equal(segments.filter((segment) => segment.type === TYPE.PREP).length, 1);
  assert.equal(segments.filter((segment) => segment.type === TYPE.WORK).length, 8);
  assert.equal(segments.filter((segment) => segment.type === TYPE.REST).length, 7);
  assert.equal(totalDurationMs(segments), 240_000);

  const state = getState(30_000, segments);
  assert.equal(state.type, 'Rest');
  assert.equal(state.display, '0:10');
  assert.equal(state.round, '1/8');
});

test('B4. Tabata with no rest', () => {
  const segments = buildSegments(MODE.TABATA, { workMs: time(0, 20), restMs: 0, rounds: 8 });
  assert.equal(segments.length, 9);
  assert.equal(segments.some((segment) => segment.type === TYPE.REST), false);
});

test('B5. AMRAP defaults', () => {
  const segments = buildSegments(MODE.AMRAP, defaultSettings(MODE.AMRAP));
  assert.equal(segments.length, 2);
  assert.equal(totalDurationMs(segments), 730_000);

  const start = getState(10_000, segments);
  assert.equal(start.type, 'Work');
  assert.equal(start.display, '12:00');
  assert.equal(start.round, null);

  const end = getState(730_000, segments);
  assert.equal(end.type, 'Finished');
  assert.equal(end.display, '0:00');
});

test('B6. AMRAP round count', () => {
  assert.equal(adjustRoundCount(0, -1), 0);
  assert.equal(adjustRoundCount(4, 1), 5);
  assert.equal(adjustRoundCount(999, 1), 999);
});

test('B7. For Time with a cap', () => {
  const segments = buildSegments(MODE.FOR_TIME, { capMs: time(20, 0) });
  assert.equal(segments.length, 2);
  assert.equal(totalDurationMs(segments), 1_210_000);

  const start = getState(10_000, segments);
  assert.equal(start.type, 'Work');
  assert.equal(start.display, '0:00');

  assert.equal(getState(70_999, segments).display, '1:00');

  const end = getState(1_210_000, segments);
  assert.equal(end.type, 'Finished');
  assert.equal(end.display, '20:00');
});

test('B8. For Time with no cap', () => {
  const segments = buildSegments(MODE.FOR_TIME, { capMs: 0 });
  assert.equal(totalDurationMs(segments), 6_009_000);

  const end = getState(6_009_000, segments);
  assert.equal(end.type, 'Finished');
  assert.equal(end.display, '99:59');
});

test('B9. For Time beep schedule', () => {
  const segments = buildSegments(MODE.FOR_TIME, { capMs: time(20, 0) });
  const beeps = buildBeepSchedule(segments);
  assert.equal(countByType(beeps, BEEP.SHORT), 6);
  assert.deepEqual(timesOfType(beeps, BEEP.LONG), [10_000]);
  assert.deepEqual(timesOfType(beeps, BEEP.END), [1_210_000]);
  assert.equal(beeps.length, 8);
});

test('B10. Custom defaults', () => {
  const segments = buildSegments(MODE.CUSTOM, defaultSettings(MODE.CUSTOM));
  assert.equal(segments.length, 8);
  assert.equal(segments.filter((segment) => segment.type === TYPE.PREP).length, 1);
  assert.equal(segments.filter((segment) => segment.type === TYPE.WORK).length, 4);
  assert.equal(segments.filter((segment) => segment.type === TYPE.REST).length, 3);
  assert.equal(totalDurationMs(segments), 1_510_000);
  assert.equal(segments[segments.length - 1].type, 'Work');
});

test('B11. Validation', () => {
  for (const mode of Object.values(MODE)) {
    assert.deepEqual(validateSettings(mode, defaultSettings(mode)), [], mode);
  }

  const emom = validateSettings(MODE.EMOM, { ...defaultSettings(MODE.EMOM), rounds: 0 });
  assert.deepEqual(fieldsOf(emom), ['rounds']);

  const amrap = validateSettings(MODE.AMRAP, { timeMs: time(0, 5) });
  assert.deepEqual(fieldsOf(amrap), ['timeMs']);

  const noSteps = validateSettings(MODE.CUSTOM, { rounds: 4, steps: [] });
  assert.deepEqual(fieldsOf(noSteps), ['steps']);

  const tooManySteps = validateSettings(MODE.CUSTOM, {
    rounds: 4,
    steps: Array.from({ length: 21 }, () => work(1, 0)),
  });
  assert.deepEqual(fieldsOf(tooManySteps), ['steps']);
});

// Further checks: Fight Gone Bad from version 1.

test('Fight Gone Bad sequence matches version 1', () => {
  const expected = [
    ['Prep', 10_000, null],
    ...Array(5).fill(['Work', 60_000, '1/3']),
    ['Rest', 60_000, '1/3'],
    ...Array(5).fill(['Work', 60_000, '2/3']),
    ['Rest', 60_000, '2/3'],
    ...Array(5).fill(['Work', 60_000, '3/3']),
  ];
  assert.deepEqual(shape(buildFightGoneBad()), expected);
});

test('Segments are contiguous from 0 ms', () => {
  let startMs = 0;
  for (const segment of buildFightGoneBad()) {
    assert.equal(segment.startMs, startMs);
    assert.equal(segment.endMs, startMs + segment.durationMs);
    startMs = segment.endMs;
  }
});

test('Every segment boundary belongs to the next segment', () => {
  const segments = buildFightGoneBad();
  segments.forEach((segment, index) => {
    const first = getState(segment.startMs);
    assert.equal(first.segmentIndex, index);
    assert.equal(first.remainingMs, segment.durationMs);
    const last = getState(segment.endMs - 1);
    assert.equal(last.segmentIndex, index);
    assert.equal(last.remainingMs, 1);
    assert.equal(last.display, '0:01');
  });
});

test('Prep shows 0:10 down to 0:01, with no 0:00', () => {
  const shown = [];
  for (let ms = 0; ms < 10_000; ms += 100) {
    const { display } = getState(ms);
    if (shown[shown.length - 1] !== display) {
      shown.push(display);
    }
  }
  assert.deepEqual(shown, [
    '0:10', '0:09', '0:08', '0:07', '0:06', '0:05', '0:04', '0:03', '0:02', '0:01',
  ]);
});

test('Work and rest show 1:00 down to 0:01, with no 0:00', () => {
  for (const segment of buildFightGoneBad().slice(1)) {
    const shown = [];
    for (let ms = segment.startMs; ms < segment.endMs; ms += 250) {
      const { display } = getState(ms);
      if (shown[shown.length - 1] !== display) {
        shown.push(display);
      }
    }
    assert.equal(shown.length, 60);
    assert.equal(shown[0], '1:00');
    assert.equal(shown[1], '0:59');
    assert.equal(shown[shown.length - 1], '0:01');
    assert.equal(shown.includes('0:00'), false);
  }
});

test('Fractional elapsed times round up on a count-down segment', () => {
  assert.equal(formatClock(59_000.5), '1:00');
  assert.equal(formatClock(59_000), '0:59');
  assert.equal(getState(10_999.9).display, '1:00');
  assert.equal(getState(9_999.5).display, '0:01');
});

test('The last moment of Fight Gone Bad is not finished', () => {
  const state = getState(1_029_999);
  assert.equal(state.type, 'Work');
  assert.equal(state.segmentIndex, 17);
  assert.equal(state.display, '0:01');
  assert.equal(state.round, '3/3');
});

test('Elapsed time past the end stays finished', () => {
  const state = getState(5_000_000);
  assert.equal(state.type, 'Finished');
  assert.equal(state.segmentIndex, 18);
  assert.equal(state.remainingMs, 0);
  assert.equal(state.display, '0:00');
  assert.equal(state.round, '3/3');
});

test('Negative elapsed time shows the start of prep', () => {
  const state = getState(-50);
  assert.equal(state.type, 'Prep');
  assert.equal(state.display, '0:10');
});

test('Fight Gone Bad short beeps fall at 3, 2 and 1 s before the end of each segment', () => {
  const expected = buildFightGoneBad()
    .flatMap((segment) => [segment.endMs - 3000, segment.endMs - 2000, segment.endMs - 1000]);
  assert.deepEqual(timesOfType(buildBeepSchedule(), BEEP.SHORT), expected);
});

test('Fight Gone Bad long beeps fall at the start of each segment after prep', () => {
  const expected = buildFightGoneBad().slice(1).map((segment) => segment.startMs);
  assert.deepEqual(timesOfType(buildBeepSchedule(), BEEP.LONG), expected);
});

test('The first prep beep plays when the clock shows 0:03', () => {
  const [first] = buildBeepSchedule();
  assert.deepEqual(first, { timeMs: 7000, type: BEEP.SHORT });
  assert.equal(getState(first.timeMs).display, '0:03');
});

test('Existing callers with no segment list use Fight Gone Bad', () => {
  assert.equal(totalDurationMs(), 1_030_000);
  assert.deepEqual(buildBeepSchedule(), buildBeepSchedule(buildFightGoneBad()));
  assert.deepEqual(getState(370_000), getState(370_000, buildFightGoneBad()));
  assert.equal(clockDigitCount(), 3);
});

// Further checks: every mode.

test('Every mode starts with a 10 s prep and has a contiguous segment list', () => {
  for (const mode of Object.values(MODE)) {
    const segments = buildSegments(mode, defaultSettings(mode));
    assert.equal(segments[0].type, TYPE.PREP, mode);
    assert.equal(segments[0].durationMs, 10_000, mode);
    assert.equal(segments[0].round, null, mode);
    let startMs = 0;
    for (const segment of segments) {
      assert.equal(segment.startMs, startMs, mode);
      assert.equal(segment.endMs, startMs + segment.durationMs, mode);
      assert.ok(segment.durationMs > 0, mode);
      startMs = segment.endMs;
    }
    assert.notEqual(segments[segments.length - 1].type, TYPE.REST, mode);
  }
});

test('Only the For Time work segment counts up', () => {
  for (const mode of Object.values(MODE)) {
    const segments = buildSegments(mode, defaultSettings(mode));
    segments.forEach((segment, index) => {
      const expected = mode === MODE.FOR_TIME && index === 1 ? DIRECTION.UP : DIRECTION.DOWN;
      assert.equal(segment.direction, expected, `${mode} segment ${index}`);
    });
  }
});

test('Round text is r/R for EMOM, Tabata, Custom and Fight Gone Bad, and none for For Time and AMRAP', () => {
  const tabata = buildSegments(MODE.TABATA, defaultSettings(MODE.TABATA));
  assert.deepEqual(
    tabata.slice(1).map((segment) => [segment.type, segment.round]),
    [
      ['Work', '1/8'], ['Rest', '1/8'], ['Work', '2/8'], ['Rest', '2/8'],
      ['Work', '3/8'], ['Rest', '3/8'], ['Work', '4/8'], ['Rest', '4/8'],
      ['Work', '5/8'], ['Rest', '5/8'], ['Work', '6/8'], ['Rest', '6/8'],
      ['Work', '7/8'], ['Rest', '7/8'], ['Work', '8/8'],
    ],
  );

  const custom = buildSegments(MODE.CUSTOM, defaultSettings(MODE.CUSTOM));
  assert.deepEqual(
    custom.slice(1).map((segment) => segment.round),
    ['1/4', '1/4', '2/4', '2/4', '3/4', '3/4', '4/4'],
  );

  for (const mode of [MODE.FOR_TIME, MODE.AMRAP]) {
    const segments = buildSegments(mode, defaultSettings(mode));
    assert.equal(segments.every((segment) => segment.round === null), true, mode);
    assert.equal(getState(totalDurationMs(segments), segments).round, null, mode);
  }
});

test('Count-down modes show 0:00 at the end, with the last round', () => {
  const emom = buildSegments(MODE.EMOM, defaultSettings(MODE.EMOM));
  const end = getState(610_000, emom);
  assert.equal(end.type, 'Finished');
  assert.equal(end.display, '0:00');
  assert.equal(end.round, '10/10');
  assert.equal(getState(609_999, emom).display, '0:01');
});

test('For Time counts up and rounds down to the whole second', () => {
  const segments = buildSegments(MODE.FOR_TIME, { capMs: time(20, 0) });
  assert.equal(getState(9_999, segments).display, '0:01');
  assert.equal(getState(10_999, segments).display, '0:00');
  assert.equal(getState(11_000, segments).display, '0:01');
  assert.equal(getState(10_000 + time(9, 59) + 999, segments).display, '9:59');
  assert.equal(getState(10_000 + time(10, 0), segments).display, '10:00');
  assert.equal(getState(1_209_999, segments).display, '19:59');
  assert.equal(getState(1_209_999, segments).type, 'Work');
});

test('For Time with no cap has one 99:59 count-up work segment', () => {
  const segments = buildSegments(MODE.FOR_TIME, { capMs: 0 });
  assert.equal(segments.length, 2);
  assert.equal(segments[1].type, TYPE.WORK);
  assert.equal(segments[1].durationMs, time(99, 59));
  assert.equal(segments[1].direction, DIRECTION.UP);
  assert.equal(getState(6_008_999, segments).display, '99:58');
});

test('AMRAP counts down from the set time', () => {
  const segments = buildSegments(MODE.AMRAP, defaultSettings(MODE.AMRAP));
  assert.equal(getState(10_999, segments).display, '12:00');
  assert.equal(getState(11_000, segments).display, '11:59');
  assert.equal(getState(10_000 + time(2, 1), segments).display, '9:59');
  assert.equal(getState(729_999, segments).display, '0:01');
});

test('Clock format is M:SS below 10 minutes and MM:SS from 10 minutes', () => {
  assert.equal(formatClock(time(9, 59)), '9:59');
  assert.equal(formatClock(time(10, 0)), '10:00');
  assert.equal(formatClock(time(99, 59)), '99:59');
  assert.equal(formatClock(time(1, 0) - 1, DIRECTION.UP), '0:59');
  assert.equal(formatClock(time(10, 0), DIRECTION.UP), '10:00');
});

test('The clock has 4 digits only when a segment reaches 10:00', () => {
  assert.equal(clockDigitCount(buildFightGoneBad()), 3);
  assert.equal(clockDigitCount(buildSegments(MODE.AMRAP, { timeMs: time(9, 59) })), 3);
  assert.equal(clockDigitCount(buildSegments(MODE.AMRAP, { timeMs: time(10, 0) })), 4);
  assert.equal(clockDigitCount(buildSegments(MODE.FOR_TIME, { capMs: 0 })), 4);
  assert.equal(clockDigitCount(buildSegments(MODE.EMOM, { intervalMs: time(10, 0), rounds: 2 })), 4);
  assert.equal(clockDigitCount(buildSegments(MODE.TABATA, defaultSettings(MODE.TABATA))), 3);
});

test('Custom keeps rest steps inside rounds and never ends on rest', () => {
  const segments = buildSegments(MODE.CUSTOM, {
    rounds: 2,
    steps: [work(0, 30), rest(0, 15), rest(0, 10)],
  });
  assert.deepEqual(shape(segments), [
    ['Prep', 10_000, null],
    ['Work', 30_000, '1/2'],
    ['Rest', 15_000, '1/2'],
    ['Rest', 10_000, '1/2'],
    ['Work', 30_000, '2/2'],
  ]);
});

test('Custom with one step repeats it for each round', () => {
  const segments = buildSegments(MODE.CUSTOM, { rounds: 3, steps: [work(0, 5)] });
  assert.deepEqual(shape(segments), [
    ['Prep', 10_000, null],
    ['Work', 5_000, '1/3'],
    ['Work', 5_000, '2/3'],
    ['Work', 5_000, '3/3'],
  ]);
});

test('EMOM with 99 rounds shows two-digit round text', () => {
  const segments = buildSegments(MODE.EMOM, { intervalMs: time(0, 10), rounds: 99 });
  assert.equal(segments.length, 100);
  assert.equal(segments[1].round, '1/99');
  assert.equal(segments[99].round, '99/99');
});

test('Every mode has a long beep at each segment start after prep and one end beep', () => {
  for (const mode of Object.values(MODE)) {
    const segments = buildSegments(mode, defaultSettings(mode));
    const beeps = buildBeepSchedule(segments);
    assert.deepEqual(
      timesOfType(beeps, BEEP.LONG),
      segments.slice(1).map((segment) => segment.startMs),
      mode,
    );
    assert.deepEqual(timesOfType(beeps, BEEP.END), [totalDurationMs(segments)], mode);
    assert.equal(countByType(beeps, BEEP.SHORT), segments.length * 3, mode);
  }
});

test('EMOM default beep schedule', () => {
  const beeps = buildBeepSchedule(buildSegments(MODE.EMOM, defaultSettings(MODE.EMOM)));
  assert.equal(countByType(beeps, BEEP.SHORT), 33);
  assert.equal(countByType(beeps, BEEP.LONG), 10);
  assert.deepEqual(timesOfType(beeps, BEEP.END), [610_000]);
});

test('A 3 s segment gets a short beep and a long beep at its start', () => {
  const segments = buildSegments(MODE.TABATA, { workMs: time(0, 20), restMs: time(0, 3), rounds: 2 });
  // Prep 0-10 s, work 10-30 s, rest 30-33 s, work 33-53 s.
  const beeps = buildBeepSchedule(segments);
  const at30 = beeps.filter((beep) => beep.timeMs === 30_000).map((beep) => beep.type).sort();
  assert.deepEqual(at30, [BEEP.LONG, BEEP.SHORT]);
  assert.deepEqual(timesOfType(beeps, BEEP.SHORT), [7_000, 8_000, 9_000, 27_000, 28_000, 29_000, 30_000, 31_000, 32_000, 50_000, 51_000, 52_000]);
});

test('A segment shorter than 3 s shares a short beep with the previous segment', () => {
  const segments = buildSegments(MODE.TABATA, { workMs: time(0, 20), restMs: time(0, 2), rounds: 2 });
  // Prep 0-10 s, work 10-30 s, rest 30-32 s, work 32-52 s.
  // The rest asks for short beeps at 29, 30 and 31 s. The work before it
  // already has a short beep at 29 s, so that beep plays once.
  const beeps = buildBeepSchedule(segments);
  assert.deepEqual(beeps, [
    { timeMs: 7_000, type: BEEP.SHORT },
    { timeMs: 8_000, type: BEEP.SHORT },
    { timeMs: 9_000, type: BEEP.SHORT },
    { timeMs: 10_000, type: BEEP.LONG },
    { timeMs: 27_000, type: BEEP.SHORT },
    { timeMs: 28_000, type: BEEP.SHORT },
    { timeMs: 29_000, type: BEEP.SHORT },
    { timeMs: 30_000, type: BEEP.LONG },
    { timeMs: 30_000, type: BEEP.SHORT },
    { timeMs: 31_000, type: BEEP.SHORT },
    { timeMs: 32_000, type: BEEP.LONG },
    { timeMs: 49_000, type: BEEP.SHORT },
    { timeMs: 50_000, type: BEEP.SHORT },
    { timeMs: 51_000, type: BEEP.SHORT },
    { timeMs: 52_000, type: BEEP.END },
  ]);
});

test('The beep schedule is sorted by time for every mode', () => {
  for (const mode of Object.values(MODE)) {
    const times = buildBeepSchedule(buildSegments(mode, defaultSettings(mode))).map((beep) => beep.timeMs);
    assert.deepEqual(times, [...times].sort((a, b) => a - b), mode);
  }
});

// Further checks: settings.

test('Default settings match section 4', () => {
  assert.deepEqual(defaultSettings(MODE.FOR_TIME), { capMs: 0 });
  assert.deepEqual(defaultSettings(MODE.AMRAP), { timeMs: time(12, 0) });
  assert.deepEqual(defaultSettings(MODE.EMOM), { intervalMs: time(1, 0), rounds: 10 });
  assert.deepEqual(defaultSettings(MODE.TABATA), { workMs: time(0, 20), restMs: time(0, 10), rounds: 8 });
  assert.deepEqual(defaultSettings(MODE.CUSTOM), { rounds: 4, steps: [work(4, 0), rest(3, 0)] });
});

test('defaultSettings returns a new copy each time', () => {
  const first = defaultSettings(MODE.CUSTOM);
  first.steps.push(work(1, 0));
  first.rounds = 9;
  assert.deepEqual(defaultSettings(MODE.CUSTOM), { rounds: 4, steps: [work(4, 0), rest(3, 0)] });
  assert.throws(() => defaultSettings('unknown'), RangeError);
});

test('Validation accepts both ends of each range and rejects values outside', () => {
  const cases = [
    [MODE.FOR_TIME, 'capMs', time(0, 0), time(99, 59), [-1000, time(100, 0)]],
    [MODE.AMRAP, 'timeMs', time(0, 10), time(99, 59), [time(0, 9), time(100, 0)]],
    [MODE.EMOM, 'intervalMs', time(0, 10), time(10, 0), [time(0, 9), time(10, 1)]],
    [MODE.EMOM, 'rounds', 1, 99, [0, 100]],
    [MODE.TABATA, 'workMs', time(0, 5), time(5, 0), [time(0, 4), time(5, 1)]],
    [MODE.TABATA, 'restMs', time(0, 0), time(5, 0), [-1000, time(5, 1)]],
    [MODE.TABATA, 'rounds', 1, 99, [0, 100]],
    [MODE.CUSTOM, 'rounds', 1, 99, [0, 100]],
  ];
  for (const [mode, key, min, max, bad] of cases) {
    for (const value of [min, max]) {
      const settings = { ...defaultSettings(mode), [key]: value };
      assert.deepEqual(validateSettings(mode, settings), [], `${mode} ${key} ${value}`);
    }
    for (const value of [...bad, Number.NaN, undefined, '10', 1.5]) {
      const settings = { ...defaultSettings(mode), [key]: value };
      assert.deepEqual(fieldsOf(validateSettings(mode, settings)), [key], `${mode} ${key} ${value}`);
    }
  }
});

test('Validation rejects a time that is not whole seconds', () => {
  assert.deepEqual(fieldsOf(validateSettings(MODE.AMRAP, { timeMs: 60_500 })), ['timeMs']);
});

test('Validation checks each Custom step', () => {
  const steps = [work(0, 5), work(99, 59), work(0, 4), { type: 'Swim', durationMs: time(1, 0) }, null];
  const errors = validateSettings(MODE.CUSTOM, { rounds: 1, steps });
  assert.deepEqual(fieldsOf(errors), [
    'steps.2.durationMs',
    'steps.3.type',
    'steps.4.type',
    'steps.4.durationMs',
  ]);
  assert.deepEqual(
    validateSettings(MODE.CUSTOM, { rounds: 1, steps: Array.from({ length: 20 }, () => rest(0, 5)) }),
    [],
  );
});

test('Validation messages are short and name the range', () => {
  const [emom] = validateSettings(MODE.EMOM, { intervalMs: time(0, 5), rounds: 10 });
  assert.equal(emom.message, 'Use 0:10 to 10:00.');
  const [rounds] = validateSettings(MODE.TABATA, { workMs: time(0, 20), restMs: 0, rounds: 0 });
  assert.equal(rounds.message, 'Use 1 to 99.');
  const [steps] = validateSettings(MODE.CUSTOM, { rounds: 1, steps: [] });
  assert.equal(steps.message, 'Use 1 to 20 steps.');
});

test('Validation rejects missing settings and unknown modes', () => {
  assert.deepEqual(fieldsOf(validateSettings(MODE.EMOM, null)), ['settings']);
  assert.deepEqual(fieldsOf(validateSettings(MODE.EMOM, [])), ['settings']);
  assert.deepEqual(fieldsOf(validateSettings(MODE.CUSTOM, { rounds: 1 })), ['steps']);
  assert.deepEqual(fieldsOf(validateSettings('unknown', {})), ['mode']);
  assert.deepEqual(validateSettings(MODE.FIGHT_GONE_BAD), []);
});

test('buildSegments throws on settings that are not valid', () => {
  assert.throws(() => buildSegments(MODE.EMOM, { intervalMs: time(1, 0), rounds: 0 }), RangeError);
  assert.throws(() => buildSegments('unknown', {}), RangeError);
});

test('The AMRAP round count stays from 0 to 999', () => {
  assert.equal(adjustRoundCount(1, -1), 0);
  assert.equal(adjustRoundCount(998, 1), 999);
  assert.equal(adjustRoundCount(5, -1), 4);
});
