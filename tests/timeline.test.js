import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BEEP,
  TYPE,
  buildBeepSchedule,
  buildFightGoneBad,
  formatClock,
  getState,
  totalDurationMs,
} from '../timeline.js';

const countByType = (beeps, type) => beeps.filter((beep) => beep.type === type).length;
const timesOfType = (beeps, type) => beeps
  .filter((beep) => beep.type === type)
  .map((beep) => beep.timeMs);

// Section 13.1 acceptance tests.

test('A1. Segment list has 18 segments and a total of 1,030,000 ms', () => {
  const segments = buildFightGoneBad();
  assert.equal(segments.length, 18);
  assert.equal(totalDurationMs(segments), 1_030_000);
  const sum = segments.reduce((total, segment) => total + segment.durationMs, 0);
  assert.equal(sum, 1_030_000);
});

test('A2. Start of prep', () => {
  const state = getState(0);
  assert.equal(state.type, TYPE.PREP);
  assert.equal(state.type, 'Prep');
  assert.equal(state.display, '0:10');
  assert.equal(state.round, null);
});

test('A3. Start of round 1', () => {
  const state = getState(10_000);
  assert.equal(state.type, 'Work');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '1/3');
});

test('A4. Rounding', () => {
  assert.equal(getState(10_999).display, '1:00');
  assert.equal(getState(11_000).display, '0:59');
});

test('A5. First rest', () => {
  const state = getState(310_000);
  assert.equal(state.type, 'Rest');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '1/3');
});

test('A6. Start of round 2', () => {
  const state = getState(370_000);
  assert.equal(state.type, 'Work');
  assert.equal(state.display, '1:00');
  assert.equal(state.round, '2/3');
});

test('A7. End of workout', () => {
  const state = getState(1_030_000);
  assert.equal(state.type, 'Finished');
  assert.equal(state.display, '0:00');
  assert.equal(state.round, '3/3');
});

test('A8. Beep schedule', () => {
  const beeps = buildBeepSchedule();
  assert.equal(countByType(beeps, BEEP.SHORT), 54);
  assert.equal(countByType(beeps, BEEP.LONG), 17);
  assert.deepEqual(timesOfType(beeps, BEEP.END), [1_030_000]);
  assert.equal(timesOfType(beeps, BEEP.LONG).includes(1_030_000), false);
  assert.equal(beeps.length, 72);
});

// Further checks of the sequence, the clock and the beep schedule.

test('Sequence matches the table in section 4', () => {
  const segments = buildFightGoneBad();
  const expected = [
    ['Prep', 10_000, null],
    ...Array(5).fill(['Work', 60_000, '1/3']),
    ['Rest', 60_000, '1/3'],
    ...Array(5).fill(['Work', 60_000, '2/3']),
    ['Rest', 60_000, '2/3'],
    ...Array(5).fill(['Work', 60_000, '3/3']),
  ];
  assert.deepEqual(
    segments.map((segment) => [segment.type, segment.durationMs, segment.round]),
    expected,
  );
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
    if (shown.at(-1) !== display) {
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
      if (shown.at(-1) !== display) {
        shown.push(display);
      }
    }
    assert.equal(shown.length, 60);
    assert.equal(shown[0], '1:00');
    assert.equal(shown[1], '0:59');
    assert.equal(shown.at(-1), '0:01');
    assert.equal(shown.includes('0:00'), false);
  }
});

test('Fractional elapsed times round up', () => {
  assert.equal(formatClock(59_000.5), '1:00');
  assert.equal(formatClock(59_000), '0:59');
  assert.equal(getState(10_999.9).display, '1:00');
  assert.equal(getState(9_999.5).display, '0:01');
});

test('The last moment of the workout is not finished', () => {
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

test('Short beeps fall at 3, 2 and 1 s before the end of each segment', () => {
  const expected = buildFightGoneBad()
    .flatMap((segment) => [segment.endMs - 3000, segment.endMs - 2000, segment.endMs - 1000]);
  assert.deepEqual(timesOfType(buildBeepSchedule(), BEEP.SHORT), expected);
});

test('Long beeps fall at the start of each segment after prep', () => {
  const expected = buildFightGoneBad().slice(1).map((segment) => segment.startMs);
  assert.deepEqual(timesOfType(buildBeepSchedule(), BEEP.LONG), expected);
});

test('The first prep beep plays when the clock shows 0:03', () => {
  const [first] = buildBeepSchedule();
  assert.deepEqual(first, { timeMs: 7000, type: BEEP.SHORT });
  assert.equal(getState(first.timeMs).display, '0:03');
});

test('The beep schedule is sorted by time', () => {
  const times = buildBeepSchedule().map((beep) => beep.timeMs);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});
