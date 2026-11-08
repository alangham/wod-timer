// Web Audio beeps. Every beep starts on the AudioContext clock through
// OscillatorNode.start(when). No audio files.

const FREQUENCY_HZ = 2000;
const VOLUME = 0.8;
const DURATION_S = { short: 0.2, long: 1, end: 3 };

// The audio clock may differ from the workout clock by this much before the
// remaining beeps move to the new time.
const MAX_DRIFT_S = 0.05;
// A larger difference means that the audio clock stopped for a time. A beep that
// is sounding then is already late, so it stops. This is also the most that a
// beep can be late on a visible page.
const STALE_DRIFT_S = 0.5;

let ctx = null;
let plan = [];
let voices = [];
// The audio clock time that matches workout elapsed time 0. Null means that no
// beeps are on the audio clock yet.
let originS = null;
let lastAudioTimeS = null;

// Creates or resumes the AudioContext. Call this only inside a tap handler,
// because phone browsers block sound until the user touches the screen.
export function enable() {
  if (!ctx) {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    ctx = new AudioContextClass();
    ctx.onstatechange = handleStateChange;
    playSilence();
  }
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
  }
}

// Sets the beeps for this run. The next sync() puts them on the audio clock.
export function arm(beeps) {
  stopVoices();
  plan = beeps;
  originS = null;
}

// Stops all sound and removes all scheduled beeps.
export function disarm() {
  stopVoices();
  plan = [];
  originS = null;
}

// The workout ended. The end beep keeps sounding, and no more beeps move.
export function finish() {
  plan = [];
}

// Call this on each frame. Puts the remaining beeps on the audio clock, and moves
// them if the audio clock and the workout clock no longer agree.
// currentTime moves in steps, and it does not move while the audio clock is
// stopped. Only a frame that sees a new value gives a true reading of the clock.
export function sync(elapsedMs) {
  if (ctx && originS !== null && ctx.currentTime === lastAudioTimeS) {
    return;
  }
  moveBeeps(elapsedMs, STALE_DRIFT_S * 1000);
}

// Call this when the page becomes visible. A beep with a time that passed while
// the page was hidden never plays late.
export function handleReturn(elapsedMs) {
  if (!ctx) {
    return;
  }
  if (ctx.state !== 'running') {
    forgetVoices();
    return;
  }
  moveBeeps(elapsedMs, 0);
}

// lateLimitMs: a waiting beep can be this far past its time and still play.
function moveBeeps(elapsedMs, lateLimitMs) {
  if (!ctx || ctx.state !== 'running' || plan.length === 0) {
    return;
  }

  const nowS = ctx.currentTime;
  lastAudioTimeS = nowS;
  const newOriginS = nowS - elapsedMs / 1000;
  const driftS = originS === null ? Infinity : Math.abs(newOriginS - originS);
  if (driftS <= MAX_DRIFT_S) {
    return;
  }

  const stopSounding = driftS > STALE_DRIFT_S;
  const startedBeeps = new Set();
  const waitingBeeps = new Set();
  voices = voices.filter((voice) => {
    const hasStarted = voice.whenS <= nowS;
    if (hasStarted && !stopSounding) {
      startedBeeps.add(voice.beep);
      return true;
    }
    if (!hasStarted) {
      waitingBeeps.add(voice.beep);
    }
    stopVoice(voice);
    return false;
  });

  originS = newOriginS;
  for (const beep of plan) {
    const isAhead = beep.timeMs >= elapsedMs;
    const isLateButAllowed = waitingBeeps.has(beep) && beep.timeMs >= elapsedMs - lateLimitMs;
    if (!startedBeeps.has(beep) && (isAhead || isLateButAllowed)) {
      voices.push(startVoice(beep, Math.max(nowS, originS + beep.timeMs / 1000)));
    }
  }
}

// The audio clock stopped, so the scheduled times no longer match the workout.
// Remove the beeps before the clock runs again, so that none plays late.
function handleStateChange() {
  if (ctx.state !== 'running') {
    forgetVoices();
  }
}

function forgetVoices() {
  stopVoices();
  originS = null;
}

// Some iOS versions need a sound to start inside the tap before they allow sound.
function playSilence() {
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  source.connect(ctx.destination);
  source.start(0);
}

function startVoice(beep, whenS) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = FREQUENCY_HZ;
  gain.gain.value = VOLUME;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(whenS);
  oscillator.stop(whenS + DURATION_S[beep.type]);
  return { beep, whenS, oscillator, gain };
}

function stopVoice(voice) {
  try {
    voice.oscillator.stop();
  } catch {
    // The oscillator already stopped. Disconnecting below is still safe.
  }
  voice.oscillator.disconnect();
  voice.gain.disconnect();
}

function stopVoices() {
  voices.forEach(stopVoice);
  voices = [];
}
