# WOD Timer: Specification, Version 2

## 1. Purpose

A web timer for CrossFit workouts.

Version 2 has six choices on the mode menu:
- Fight Gone Bad: a one-tap preset with fixed settings.
- For Time
- AMRAP
- EMOM
- Tabata
- Custom intervals

Version 1 had Fight Gone Bad only. Version 2 keeps all version 1 behavior for Fight Gone Bad.

## 2. Platform and Hosting

- Static web app: HTML, CSS and JavaScript.
- No build step. No framework. No npm dependencies.
- No network calls at run time. Do not load fonts, scripts or styles from a CDN.
- Hosting: GitHub Pages, from the root of the `main` branch.
- All paths must be relative, so the app works under `https://<user>.github.io/<repo>/`.
- Target browsers: iOS Safari and Android Chrome on phones and tablets. Desktop browsers must also work.
- Keep the web app manifest and icons, so the user can add the app to the home screen.
- Keep the service worker that caches all app files for offline use. Add every new file to the cache list. Change the version string in the cache name for this release.

## 3. Screens

The app has three screens.

**Mode menu**
- The first screen when the app opens.
- Six large buttons, in this order: Fight Gone Bad, For Time, AMRAP, EMOM, Tabata, Custom.
- Fight Gone Bad opens the timer screen at once, with the fixed settings in section 4.
- Each other button opens the setup screen for that mode.

**Setup screen**
- Shows the settings for one mode, as in section 4.
- Each time setting has a minutes field and a seconds field. Use `inputmode="numeric"`.
- Each count setting has one number field. Use `inputmode="numeric"`.
- A **Start** button. If all settings are valid, it opens the timer screen in Idle.
- A **Defaults** button. It sets all fields of this mode to the defaults in section 4.
- A **Back** button. It goes to the mode menu.
- If a value is out of range, show a short message next to the field and disable **Start**.

**Timer screen**
- The clock, the round display and the controls, as in sections 6 and 9.
- Same black LED look as version 1.

## 4. Modes and Settings

All modes start with a 10 s prep countdown.

**Fight Gone Bad**
- Fixed settings. No setup screen.
- It is the same as Custom with: rounds 3; steps 5 × Work 1:00, then Rest 1:00.
- The sequence must match version 1 exactly: 18 segments, 1,030,000 ms in total.

**For Time**

| Setting | Range | Default |
|---|---|---|
| Time cap | 0:00 to 99:59. 0:00 means no cap. | 0:00 |

- The clock counts up from `0:00`.
- With a cap, the workout ends at the cap.
- With no cap, the workout ends at `99:59`, or when the user taps **Done**.
- No round display.

**AMRAP**

| Setting | Range | Default |
|---|---|---|
| Time | 0:10 to 99:59 | 12:00 |

- The clock counts down from the set time.
- The round display shows a round count that the user changes. See section 9.

**EMOM**

| Setting | Range | Default |
|---|---|---|
| Interval | 0:10 to 10:00 | 1:00 |
| Rounds | 1 to 99 | 10 |

- Each round is one work segment of the interval length. No rest.

**Tabata**

| Setting | Range | Default |
|---|---|---|
| Work | 0:05 to 5:00 | 0:20 |
| Rest | 0:00 to 5:00 | 0:10 |
| Rounds | 1 to 99 | 8 |

- Each round is one work segment, then one rest segment.
- If Rest is 0:00, there are no rest segments.

**Custom intervals**

| Setting | Range | Default |
|---|---|---|
| Rounds | 1 to 99 | 4 |
| Steps | 1 to 20 steps | Work 4:00, then Rest 3:00 |
| Step type | Work or Rest | |
| Step time | 0:05 to 99:59 | |

- Each round runs all steps in order.
- On the setup screen, each step is one row with: a Work/Rest switch, a minutes field, a seconds field, and a **Remove** button.
- An **Add step** button adds a Work 1:00 row at the end.
- Hide **Remove** when only one step is left. Hide **Add step** when there are 20 steps.

## 5. Sequence Rules

These rules build the segment list for every mode.

1. The first segment is Prep, 10 s.
2. Then add the segments of each round in order.
3. Do not add a segment with a duration of 0.
4. If the last segment of the last round is Rest, do not add it. A workout never ends on rest.
5. For Time has one work segment after prep. Its duration is the cap, or 99:59 if there is no cap. This segment counts up.
6. AMRAP has one work segment after prep, of the set time.
7. All segments except the For Time work segment count down.

Round text for each segment:
- Prep: none.
- EMOM, Tabata, Custom and Fight Gone Bad: `r/R`, where r is the round number and R is the number of rounds. A rest segment shows the round that just ended.
- For Time: none.
- AMRAP: the timeline gives none. The app shows the round count from section 9.

## 6. Look

- Black background.
- Digits in a seven-segment LED style, drawn with SVG or CSS in code. Show unlit segments faintly.
- Format of the clock: `M:SS` below 10 minutes, `MM:SS` from 10 minutes.
- Make the digits as large as the screen allows.
- Landscape is the primary layout. Portrait must also work, with smaller digits.
- Show the round display next to the clock.
- Colors:
  - Prep countdown: red digits. No round display.
  - Work: red digits.
  - Rest: green digits and the word `REST` next to the clock.
- Do not use the Rogue name, the Rogue logo, or any other brand name or logo.
- The mode menu and the setup screens use the same black background and red accents. They do not use LED digits.

## 7. Clock

- Count-down segments: the displayed seconds are the remaining time in the segment, rounded up to the next whole second.
- Count-up segment: the displayed seconds are the elapsed time in the segment, rounded down to the whole second.
- Prep shows `0:10` down to `0:01`.
- When the workout ends:
  - Count-down modes show `0:00`.
  - For Time with a cap or at 99:59 shows the cap or `99:59`.
  - For Time ended with **Done** shows the elapsed time at the Done tap.

## 8. Sounds

- Make all sounds with the Web Audio API. Do not use audio files.
- Use a buzzer-like tone, for example a square wave near 2 kHz.
- Short beep: 0.2 s. Long beep: 1 s. End beep: 3 s.
- Beep schedule, for all modes:
  - At 3, 2 and 1 seconds before the end of each segment, play one short beep.
  - At the start of each segment after prep, play one long beep.
  - When the last segment ends, play the end beep.
- When the user taps **Done** in For Time, cancel all scheduled beeps and play the end beep at once.
- Schedule each beep on the AudioContext clock. Do not schedule beeps with `setTimeout`.
- Create or resume the AudioContext inside the Start tap handler.
- If a beep time passes while the page is hidden, do not play that beep late.

## 9. Controls and States

States: Idle, Prep, Running, Paused, Finished.

| Button | Shows in | Action |
|---|---|---|
| Start | Idle | Go to Prep. Turn on sound. Request the wake lock. |
| Pause | Prep, Running | Stop the clock and all scheduled beeps. |
| Resume | Paused | Continue from the same remaining time. |
| Reset | Paused, Finished | Go to Idle. Set the AMRAP round count to 0. |
| Menu | Idle, Finished | Go to the mode menu. |
| Done | Running, For Time only | Go to Finished. Keep the elapsed time on the clock. |
| +1 | Running, Paused, AMRAP only | Add 1 to the round count. |
| −1 | Running, Paused, AMRAP only | Subtract 1 from the round count. Not below 0. |

- Pause and Resume use one button.
- In Idle, the clock shows the first prep value `0:10`.
- The AMRAP round count starts at 0. Show it in the round display during Prep, Running, Paused and Finished.
- Make **+1** the largest button on the AMRAP timer screen.
- Make all buttons large enough to hit with a sweaty finger.

## 10. Saved Settings

- When the user taps **Start** on a setup screen, save the settings of that mode in `localStorage`.
- When the user opens a setup screen, load the saved settings of that mode. If there are none, use the defaults.
- Wrap every `localStorage` read and write in try/catch. If storage fails, use the defaults and show no error.
- No named presets in version 2.

## 11. Timing Accuracy

- Calculate the elapsed time from `performance.now()`. Do not count `setInterval` ticks.
- Draw the display with `requestAnimationFrame`.
- Over a full run of any mode, the display error must be 100 ms or less.
- When the page comes back from the background or from a locked screen, the clock must show the correct time at once.

## 12. Screen Wake Lock

- Request the Screen Wake Lock on Start.
- Request it again on `visibilitychange` when the page is visible and the timer is in Prep or Running.
- Release it in Paused, Finished and Idle.
- If the browser does not support the Wake Lock API, the app must still work. Show no error.

## 13. Code Structure

- Keep the version 1 files and extend them.
- `timeline.js`: pure functions only. No DOM. No browser APIs. Node must be able to import it.
  - Keep `buildFightGoneBad()`, `getState()`, `buildBeepSchedule()`, `totalDurationMs()` and `formatClock()`. Existing callers must still work.
  - Add `buildSegments(mode, settings)`. It returns the segment list for any mode in section 4, by the rules in section 5.
  - Add a count direction to each segment: `down` or `up`. `getState()` must use it for the display.
  - Add `defaultSettings(mode)`.
  - Add `validateSettings(mode, settings)`. It returns a list of errors. An empty list means valid.
  - Add `adjustRoundCount(count, delta)`. It returns the new AMRAP round count, not below 0 and not above 999.
- `settings.js`: load and save settings in `localStorage`.
- `app.js`: DOM, screens, state machine, controls and drawing.
- `audio.js`: Web Audio beeps.
- `tests/timeline.test.js`: uses `node:test`. Run with `node --test`.
- Use ES modules.

## 14. Out of Scope for Version 2

Named presets, workout history, accounts, sync, a watch app, voice, station numbers and movement names.

## 15. Rules for Future Modes

- Any mode with rounds shows the clock and the round display.
- Work uses red digits. Rest uses green digits and the word `REST`.
- Build every new mode with `buildSegments()` and the rules in section 5.

## 16. Acceptance Tests

### 16.1 Automated Tests

Run all automated tests with `node --test` in the repository root. Each test imports `timeline.js` only. All times are elapsed milliseconds from the Start tap.

**A1. Fight Gone Bad segment list**
1. Build the Fight Gone Bad segment list.
2. Expect 18 segments.
3. Expect a total duration of 1,030,000 ms.

**A2. Fight Gone Bad start of prep**
1. Ask for the Fight Gone Bad state at 0 ms.
2. Expect type Prep, display `0:10`, no round text.

**A3. Fight Gone Bad start of round 1**
1. Ask for the Fight Gone Bad state at 10,000 ms.
2. Expect type Work, display `1:00`, round `1/3`.

**A4. Rounding**
1. Ask for the Fight Gone Bad state at 10,999 ms.
2. Expect display `1:00`.
3. Ask for the Fight Gone Bad state at 11,000 ms.
4. Expect display `0:59`.

**A5. Fight Gone Bad first rest**
1. Ask for the Fight Gone Bad state at 310,000 ms.
2. Expect type Rest, display `1:00`, round `1/3`.

**A6. Fight Gone Bad start of round 2**
1. Ask for the Fight Gone Bad state at 370,000 ms.
2. Expect type Work, display `1:00`, round `2/3`.

**A7. Fight Gone Bad end**
1. Ask for the Fight Gone Bad state at 1,030,000 ms.
2. Expect type Finished, display `0:00`, round `3/3`.

**A8. Fight Gone Bad beep schedule**
1. Build the Fight Gone Bad beep schedule.
2. Expect 54 short beeps.
3. Expect 17 long beeps.
4. Expect 1 end beep at 1,030,000 ms.
5. Expect no long beep at 1,030,000 ms.

**B1. Fight Gone Bad through Custom**
1. Build Custom segments with rounds 3 and steps 5 × Work 1:00, then Rest 1:00.
2. Expect the same types, durations and round texts as `buildFightGoneBad()`.

**B2. EMOM defaults**
1. Build EMOM segments with the default settings.
2. Expect 11 segments: prep and 10 work.
3. Expect a total duration of 610,000 ms.
4. Ask for the state at 10,000 ms. Expect Work, display `1:00`, round `1/10`.
5. Ask for the state at 70,000 ms. Expect Work, display `1:00`, round `2/10`.

**B3. Tabata defaults**
1. Build Tabata segments with the default settings.
2. Expect 16 segments: prep, 8 work and 7 rest.
3. Expect a total duration of 240,000 ms.
4. Ask for the state at 30,000 ms. Expect Rest, display `0:10`, round `1/8`.

**B4. Tabata with no rest**
1. Build Tabata segments with work 0:20, rest 0:00, rounds 8.
2. Expect 9 segments and no Rest segment.

**B5. AMRAP defaults**
1. Build AMRAP segments with the default settings.
2. Expect 2 segments and a total duration of 730,000 ms.
3. Ask for the state at 10,000 ms. Expect Work, display `12:00`, no round text.
4. Ask for the state at 730,000 ms. Expect Finished, display `0:00`.

**B6. AMRAP round count**
1. Expect `adjustRoundCount(0, -1)` to return 0.
2. Expect `adjustRoundCount(4, 1)` to return 5.
3. Expect `adjustRoundCount(999, 1)` to return 999.

**B7. For Time with a cap**
1. Build For Time segments with a cap of 20:00.
2. Expect 2 segments and a total duration of 1,210,000 ms.
3. Ask for the state at 10,000 ms. Expect Work, display `0:00`.
4. Ask for the state at 70,999 ms. Expect display `1:00`.
5. Ask for the state at 1,210,000 ms. Expect Finished, display `20:00`.

**B8. For Time with no cap**
1. Build For Time segments with a cap of 0:00.
2. Expect a total duration of 6,009,000 ms.
3. Ask for the state at 6,009,000 ms. Expect Finished, display `99:59`.

**B9. For Time beep schedule**
1. Build the beep schedule for For Time with a cap of 20:00.
2. Expect 6 short beeps, 1 long beep at 10,000 ms, and 1 end beep at 1,210,000 ms.

**B10. Custom defaults**
1. Build Custom segments with the default settings.
2. Expect 8 segments: prep, 4 work and 3 rest.
3. Expect a total duration of 1,510,000 ms.
4. Expect the last segment to be Work.

**B11. Validation**
1. Expect no errors for the default settings of each mode.
2. Expect an error for EMOM rounds 0.
3. Expect an error for AMRAP time 0:05.
4. Expect an error for Custom with 0 steps.
5. Expect an error for Custom with 21 steps.

### 16.2 Manual Tests on a Phone

Each test starts from a fresh page load of the GitHub Pages URL, with the phone volume at maximum.

**M1. Mode menu**
1. Open the app.
2. Expect six buttons: Fight Gone Bad, For Time, AMRAP, EMOM, Tabata, Custom.

**M2. Fight Gone Bad**
1. Tap **Fight Gone Bad**.
2. Expect the timer screen in Idle with `0:10`.
3. Tap **Start**.
4. Expect short beeps at `0:03`, `0:02` and `0:01`.
5. Expect a long beep, then red `1:00` and `1/3`.

**M3. EMOM setup and run**
1. Tap **EMOM**.
2. Set Interval to 0:15 and Rounds to 3.
3. Tap **Start**, then **Start** on the timer screen.
4. Expect red `0:15` and `1/3` after prep.
5. Expect a long beep and `2/3` after 15 s.
6. Expect the end beep after round 3.

**M4. Tabata rest display**
1. Tap **Tabata**.
2. Tap **Defaults**.
3. Tap **Start**, then **Start** on the timer screen.
4. Wait 30 s after the Start tap.
5. Expect green `0:10`, the word `REST`, and `1/8`.

**M5. AMRAP round count**
1. Tap **AMRAP**.
2. Set Time to 1:00.
3. Tap **Start**, then **Start** on the timer screen.
4. After prep, tap **+1** three times.
5. Expect the round display to show `3`.
6. Tap **−1** once.
7. Expect `2`.
8. Wait for the end beep.
9. Expect `0:00` and `2`.

**M6. For Time with Done**
1. Tap **For Time**.
2. Set Time cap to 0:00.
3. Tap **Start**, then **Start** on the timer screen.
4. After prep, wait about 20 s.
5. Tap **Done**.
6. Expect the end beep and the clock to stop at the elapsed time.

**M7. Custom steps**
1. Tap **Custom**.
2. Tap **Defaults**.
3. Expect 2 rows: Work 4:00 and Rest 3:00, and Rounds 4.
4. Tap **Add step**.
5. Expect a third row: Work 1:00.
6. Remove rows until one row is left.
7. Expect no **Remove** button on the last row.

**M8. Validation**
1. Tap **EMOM**.
2. Set Rounds to 0.
3. Expect a message next to Rounds and a disabled **Start** button.

**M9. Saved settings**
1. Tap **EMOM**.
2. Set Interval to 0:45 and Rounds to 12.
3. Tap **Start**.
4. Tap **Menu**.
5. Close the app fully and open it again.
6. Tap **EMOM**.
7. Expect Interval 0:45 and Rounds 12.

**M10. Pause, resume and reset**
1. Tap **Fight Gone Bad**, then **Start**.
2. Wait 20 s.
3. Tap **Pause** and note the clock value.
4. Wait 10 s.
5. Expect the same clock value and no beeps.
6. Tap **Resume**.
7. Expect the clock to continue from the noted value.
8. Tap **Pause**, then **Reset**.
9. Expect Idle with `0:10`.

**M11. Screen stays on**
1. Set the phone auto-lock to its shortest time.
2. Tap **Fight Gone Bad**, then **Start**.
3. Do not touch the phone for 2 minutes.
4. Expect the screen to stay on.

**M12. Background and return**
1. Tap **Fight Gone Bad**, then **Start**.
2. Wait 30 s.
3. Switch to another app for 30 s.
4. Return to the timer.
5. Expect the clock to show the correct time at once.

**M13. Silent switch, iPhone only**
1. Set the ring/silent switch to ring.
2. Tap **Fight Gone Bad**, then **Start**, and listen for the prep beeps.
3. Tap **Pause**, then **Reset**.
4. Set the switch to silent.
5. Tap **Start** and listen for the prep beeps.
6. Record if the beeps play in each position.

**M14. Offline**
1. Open the app once while online.
2. Turn on airplane mode.
3. Close the app fully.
4. Open the app again.
5. Expect the mode menu, and expect each mode to run.

**M15. Home screen install**
1. Open the URL in the phone browser.
2. Add the app to the home screen.
3. Open the app from the home screen icon.
4. Expect the app to open without the browser address bar.
