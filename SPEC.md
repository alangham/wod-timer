# WOD Timer: Specification, Version 1

## 1. Purpose

A web timer for CrossFit workouts. Version 1 has one preset: Fight Gone Bad.

## 2. Platform and Hosting

- Static web app: HTML, CSS and JavaScript.
- No build step. No framework. No npm dependencies.
- No network calls at run time. Do not load fonts, scripts or styles from a CDN.
- Hosting: GitHub Pages, from the root of the `main` branch.
- All paths must be relative, so the app works under `https://<user>.github.io/<repo>/`.
- Target browsers: iOS Safari and Android Chrome on phones and tablets. Desktop browsers must also work.
- Add a web app manifest and icons, so the user can add the app to the home screen.
- Add a service worker that caches all app files, so the app works offline after the first load. Put a version string in the cache name. Change the version string on each release.

## 3. Look

- Black background.
- Digits in a seven-segment LED style. Draw the segments with SVG or CSS in code. Show unlit segments faintly.
- Format of the clock: `M:SS`.
- Make the digits as large as the screen allows.
- Landscape is the primary layout. Portrait must also work, with smaller digits.
- Show the round number next to the clock, in the format `1/3`.
- Colors:
  - Prep countdown: red digits. No round number.
  - Work: red digits.
  - Rest: green digits and the word `REST` next to the clock.
- Do not use the Rogue name, the Rogue logo, or any other brand name or logo.

## 4. Fight Gone Bad Sequence

The sequence has 18 segments. Each segment has one type and one duration.

| Segment | Type | Duration | Round shown |
|---|---|---|---|
| 1 | Prep | 10 s | none |
| 2 to 6 | Work, stations 1 to 5 | 60 s each | 1/3 |
| 7 | Rest | 60 s | 1/3 |
| 8 to 12 | Work, stations 1 to 5 | 60 s each | 2/3 |
| 13 | Rest | 60 s | 2/3 |
| 14 to 18 | Work, stations 1 to 5 | 60 s each | 3/3 |

- There is no rest after round 3.
- Workout time after prep: 17:00.
- Total time with prep: 17:10.
- During rest, the round number shows the round that just ended.
- The app does not show station numbers or movement names.

## 5. Clock

- The clock counts down inside each segment.
- Prep shows `0:10` down to `0:01`.
- Each work segment and each rest segment shows `1:00` down to `0:01`.
- Displayed seconds = the remaining time in the segment, rounded up to the next whole second.
- When the workout ends, the clock shows `0:00` and the round shows `3/3`.

## 6. Sounds

- Make all sounds with the Web Audio API. Do not use audio files.
- Use a buzzer-like tone, for example a square wave near 2 kHz. Tune it by ear.
- Short beep: 0.2 s.
- Long beep: 1 s.
- End beep: 3 s.
- Beep schedule:
  - At 3, 2 and 1 seconds before the end of each segment, play one short beep.
  - At the start of each segment after prep, play one long beep.
  - When the last segment ends, play the end beep.
- Schedule each beep on the AudioContext clock. Do not schedule beeps with `setTimeout`.
- Create or resume the AudioContext inside the Start tap handler. Phone browsers block sound until the user touches the screen.
- If a beep time passes while the page is hidden, do not play that beep late.

## 7. Controls and States

States: Idle, Prep, Running, Paused, Finished.

- Idle: the clock shows `0:10`. The Start button shows.
- Start: goes from Idle to Prep. Start also turns on sound and requests the screen wake lock.
- Pause: stops the clock and all scheduled beeps.
- Resume: continues from the same remaining time.
- Pause and Resume use one button.
- Reset: shows only in Paused and Finished. Reset goes to Idle.
- Finished: the clock shows `0:00` and the round shows `3/3`.
- Make all buttons large enough to hit with a sweaty finger.

## 8. Timing Accuracy

- Calculate the elapsed time from `performance.now()`. Do not count `setInterval` ticks.
- Draw the display with `requestAnimationFrame`.
- Over a full 17:10 run, the display error must be 100 ms or less.
- When the page comes back from the background or from a locked screen, the clock must show the correct time at once.

## 9. Screen Wake Lock

- Request the Screen Wake Lock on Start.
- Request it again on `visibilitychange` when the page is visible and the timer is in Prep or Running.
- Release it in Paused, Finished and Idle.
- If the browser does not support the Wake Lock API, the app must still work. Show no error.

## 10. Code Structure

- `index.html`
- `styles.css`
- `app.js`: DOM, state machine, controls, drawing.
- `timeline.js`: pure functions only. No DOM. No browser APIs. Node must be able to import it.
  - Build the Fight Gone Bad segment list.
  - Given elapsed milliseconds, return the segment index, the segment type, the remaining milliseconds, the displayed `M:SS` text, and the round text.
  - Return the full beep schedule as a list of times and beep types.
- `audio.js`: Web Audio beeps.
- `manifest.webmanifest`, `sw.js`, `icons/`
- `tests/timeline.test.js`: uses `node:test`. Run with `node --test`.
- Use ES modules.

## 11. Out of Scope for Version 1

Other modes, a preset editor, accounts, workout history, sync, a watch app, and voice.

## 12. Rules for Future Modes

- Any mode with rounds shows the clock and the round number.
- Work uses red digits. Rest uses green digits and the word `REST`.

## 13. Acceptance Tests

### 13.1 Automated Tests

Run all automated tests with `node --test` in the repository root. Each test imports `timeline.js` only.

**A1. Segment list**
1. Build the Fight Gone Bad segment list.
2. Expect 18 segments.
3. Expect a total duration of 1,030,000 ms.

**A2. Start of prep**
1. Ask for the state at elapsed 0 ms.
2. Expect type Prep, display `0:10`, no round text.

**A3. Start of round 1**
1. Ask for the state at elapsed 10,000 ms.
2. Expect type Work, display `1:00`, round `1/3`.

**A4. Rounding**
1. Ask for the state at elapsed 10,999 ms.
2. Expect display `1:00`.
3. Ask for the state at elapsed 11,000 ms.
4. Expect display `0:59`.

**A5. First rest**
1. Ask for the state at elapsed 310,000 ms.
2. Expect type Rest, display `1:00`, round `1/3`.

**A6. Start of round 2**
1. Ask for the state at elapsed 370,000 ms.
2. Expect type Work, display `1:00`, round `2/3`.

**A7. End of workout**
1. Ask for the state at elapsed 1,030,000 ms.
2. Expect type Finished, display `0:00`, round `3/3`.

**A8. Beep schedule**
1. Build the beep schedule.
2. Expect 54 short beeps, 3 for each of the 18 segments.
3. Expect 17 long beeps, 1 at the start of each segment after prep.
4. Expect 1 end beep at 1,030,000 ms.
5. Expect no long beep at 1,030,000 ms.

### 13.2 Manual Tests on a Phone

Each test starts from a fresh page load of the GitHub Pages URL, with the phone volume at maximum.

**M1. Home screen install**
1. Open the URL in the phone browser.
2. Add the app to the home screen.
3. Open the app from the home screen icon.
4. Expect the app to open without the browser address bar.

**M2. Prep and first station**
1. Tap Start.
2. Expect red `0:10` with no round number.
3. Expect short beeps at `0:03`, `0:02` and `0:01`.
4. Expect a long beep, then red `1:00` and `1/3`.

**M3. Rest display**
1. Tap Start.
2. Wait until 5:10 after the Start tap.
3. Expect green `1:00`, the word `REST`, and `1/3`.

**M4. Pause and resume**
1. Tap Start.
2. Wait 20 s.
3. Tap Pause.
4. Note the clock value.
5. Wait 10 s.
6. Expect the clock value to stay the same and no beeps.
7. Tap Resume.
8. Expect the clock to continue from the noted value.

**M5. Reset**
1. Tap Start.
2. Expect no Reset button.
3. Tap Pause.
4. Expect the Reset button.
5. Tap Reset.
6. Expect Idle with `0:10`.

**M6. Screen stays on**
1. Set the phone auto-lock to its shortest time.
2. Tap Start.
3. Do not touch the phone for 2 minutes.
4. Expect the screen to stay on.

**M7. Background and return**
1. Tap Start.
2. Wait 30 s.
3. Switch to another app for 30 s.
4. Return to the timer.
5. Expect the clock to show the correct time at once.

**M8. Silent switch, iPhone only**
1. Set the ring/silent switch to ring.
2. Tap Start and listen for the prep beeps.
3. Tap Pause, then Reset.
4. Set the switch to silent.
5. Tap Start and listen for the prep beeps.
6. Record if the beeps play in each position.

**M9. Offline**
1. Open the app once while online.
2. Turn on airplane mode.
3. Close the app fully.
4. Open the app again.
5. Expect the app to load and run.

**M10. Full run**
1. Tap Start.
2. Let the full workout run.
3. Expect the 3 s end beep at 17:10 after the Start tap.
4. Expect `0:00` and `3/3` on the screen.
