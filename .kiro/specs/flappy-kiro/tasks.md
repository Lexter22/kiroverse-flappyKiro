# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro incrementally in vanilla JavaScript with HTML5 Canvas. The existing `game.js` already implements core gameplay (physics, pipes, collisions, scoring, difficulty, clouds, effects), so the work focuses on: (1) introducing an external `game-config.json` file plus a configuration loading/validation system with an embedded `DEFAULT_CONFIG` fallback, (2) converting physics to a frame-rate independent **delta-time** model (per-second units, `pos += v*dt`, `v += a*dt`) including a delta-time driven game loop, (3) extracting the pure game logic into testable functions so the 11 correctness properties can be verified with `fast-check`, (4) adding the missing Reward System and Audio System defined in the design, (5) hardening error handling for config loading, local storage, and audio, and (6) wiring everything back into the browser game loop with no orphaned code.

Configuration is a prerequisite for the per-second logic and the game loop, so the config file and config-loading system are created early. To enable property-based and unit testing of browser game logic, pure logic functions are extracted into a separate module (`src/logic.js`) using a UMD-style export that works both in the browser (attached to a global) and under Node's test runner. The IIFE in `game.js` consumes these functions, keeping a single runtime entry point while making the logic importable by tests.

## Tasks

- [x] 1. Set up testing infrastructure and project tooling
  - Initialize `package.json` with a test script (Node's built-in `node:test` runner or Vitest in `--run` mode)
  - Add `fast-check` as a dev dependency for property-based testing
  - Create `src/` directory for extracted logic and `test/` directory for test files
  - Configure the test runner to execute `test/**/*.test.js` in single-run (non-watch) mode
  - _Requirements: 1.3_

- [x] 2. Create external configuration and the config loading system
  - [x] 2.1 Create `game-config.json` at the project root with documented defaults
    - Author the full config structure: `canvas` (width 400, height 600, groundHeight 60), `physics` (gravity 800 px/s², jumpVelocity -300 px/s, maxVelocity 600 px/s), `walls` (speed 120 px/s, gapSize 140 px, spacing 350 px, width 52, capHeight 20, capExtend 4), `difficulty` (stepInterval 5, speed base/step/max 120/9/240, gapSize base/step/min 140/3/100, spacing base/step/min 350/9/230), `reward` (checkpointInterval 5, durationSeconds 1.5, emoji 🍕), `clouds` (minCount 3, maxCount 5, minOpacity 0.2, maxOpacity 0.6, minSpeed 7, maxSpeed 36), and `hitboxInset` 4
    - Values MUST match the Configuration Object table in the design exactly
    - _Requirements: 1.1, 9.1, 9.2, 9.3, 9.4_

  - [x] 2.2 Implement `DEFAULT_CONFIG`, `loadConfig()`, and `validateConfig()` in `game.js`
    - Embed a hardcoded `DEFAULT_CONFIG` object in `game.js` mirroring the structure of `game-config.json` (used as both fallback and deep-merge base)
    - Implement `loadConfig()` returning a promise that `fetch('game-config.json')`, parses and validates JSON on success, then deep-merges over `DEFAULT_CONFIG`; on fetch error, non-OK status, parse error, or validation failure it resolves with a complete config (defaults for any missing/invalid field)
    - Implement `validateConfig(obj)` that checks required numeric fields are present and finite, returning the merged config or falling back to defaults per-field
    - Derive runtime constants (W, H, GROUND_H, PIPE_WIDTH, PIPE_CAP_H, PIPE_CAP_EXTEND, HITBOX_INSET, REWARD_DURATION, CHECKPOINT_INTERVAL, MAX_FRAME_DT = 0.05) from the resolved config
    - _Requirements: 1.1, 1.3_

  - [ ]* 2.3 Write property test for config fallback completeness
    - **Property 11: Config loading falls back to defaults on failure**
    - Generate random partial/invalid config objects (missing fields, non-finite/NaN values, malformed input); assert the merged result is always complete, equals `DEFAULT_CONFIG` for every absent/invalid field, and equals the loaded value only for present-and-valid fields
    - **Validates: Requirements 1.1, 1.3**

  - [ ]* 2.4 Write unit tests for config merge behavior
    - Test that a valid partial config overrides only its own fields and defaults the rest, and that an empty/invalid object yields a config deep-equal to `DEFAULT_CONFIG`
    - _Requirements: 1.1_

- [x] 3. Extract pure ghost physics logic (delta-time, per-second units)
  - [x] 3.1 Create `src/logic.js` and implement pure delta-time physics functions
    - Implement `applyGravity(vy, gravity, maxVelocity, dt)` returning `Math.min(vy + gravity * dt, maxVelocity)` (vy in px/s, gravity in px/s², dt in seconds)
    - Implement `flapVelocity(jumpVelocity)` returning `jumpVelocity` (-300 px/s)
    - Implement `integratePosition(y, vy, dt)` returning `y + vy * dt` for frame-rate independent position updates
    - Use a UMD-style export so functions are available as `module.exports` in Node and on a global (e.g., `window.FlappyLogic`) in the browser
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.2 Write property test for gravity integration over delta-time
    - **Property 1: Gravity integrates over delta-time with clamping**
    - Generate random `vy` in [-600, 600] px/s and random `dt` in (0, 0.05] s; assert result equals `min(vy + gravity*dt, maxVelocity)` and never exceeds `maxVelocity`
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 3.3 Write property test for flap velocity
    - **Property 2: Flap sets upward velocity**
    - Generate random current `vy` in [-600, 600] px/s; assert flap result equals `jumpVelocity` (-300) regardless of input
    - **Validates: Requirements 2.1**

- [x] 4. Extract collision and hitbox logic
  - [x] 4.1 Implement pure collision functions in `src/logic.js`
    - Implement `aabb(x1, y1, w1, h1, x2, y2, w2, h2)` as a pure boolean rectangle-overlap test
    - Implement `computeHitbox(x, y, w, h, inset)` returning `{ x: x - w/2 + inset, y: y - h/2 + inset, w: w - 2*inset, h: h - 2*inset }`
    - _Requirements: 4.1, 4.4_

  - [ ]* 4.2 Write property test for AABB correctness
    - **Property 3: AABB collision correctness**
    - Generate random rectangles with positive dimensions; assert `aabb` returns true iff the overlap formula holds
    - **Validates: Requirements 4.1**

  - [ ]* 4.3 Write property test for forgiving hitbox inset
    - **Property 9: Hitbox inset provides forgiving collision**
    - Generate random ghost dimensions and inset; assert computed hitbox position/dimensions match the formula and are strictly smaller than visual bounds
    - **Validates: Requirements 4.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extract pipe spawning and scoring logic (distance-based spawning)
  - [x] 6.1 Implement pure pipe functions in `src/logic.js`
    - Implement `shouldSpawn(lastPipeX, W, wallSpacing)` returning `W - lastPipeX >= wallSpacing` so spacing is distance-based (frame-rate independent) rather than interval-based
    - Implement `gapBounds(gapSize)` returning `{ minY, maxY }` per the design formula (`gapSize/2 + PIPE_CAP_H + 20` and `H - GROUND_H - gapSize/2 - PIPE_CAP_H - 20`)
    - Implement `computeGapCenter(gapSize, rand)` that takes an injected random value [0,1) and returns a `gapCenter` clamped within bounds
    - Implement `shouldScore(pipe, birdX)` returning true when `pipe.x + PIPE_WIDTH < birdX && !pipe.scored`
    - Implement `applyScore(pipe, score)` that returns the incremented score and a pipe with `scored: true`
    - _Requirements: 3.1, 3.2, 3.3, 5.1_

  - [ ]* 6.2 Write property test for gap bounds
    - **Property 4: Pipe gap center stays within safe bounds**
    - Generate random `gapSize` in [100, 140] (default 140); assert `gapCenter` satisfies the lower and upper bound formulas for every generated value
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 6.3 Write property test for scoring exactly once
    - **Property 5: Score increments exactly once per pipe**
    - Generate random pipe x-positions relative to bird and simulate multiple frames; assert score increments exactly once and `scored` flips false→true only once
    - **Validates: Requirements 5.1**

- [x] 7. Extract difficulty scaling logic (config-driven, per-second units)
  - [x] 7.1 Implement pure difficulty function in `src/logic.js`
    - Implement `difficultyFor(score, config)` returning `{ wallSpeed, gapSize, wallSpacing }` using `level = Math.floor(score / config.difficulty.stepInterval)` and the bounded formulas from `config.difficulty`: `wallSpeed = min(speed.base + level*speed.step, speed.max)`, `gapSize = max(gapSize.base - level*gapSize.step, gapSize.min)`, `wallSpacing = max(spacing.base - level*spacing.step, spacing.min)`
    - Returned values are in per-second (px/s) and pixel units
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 7.2 Write property test for difficulty monotonicity and bounds
    - **Property 6: Difficulty scaling is monotonic and bounded**
    - Generate random score pairs `a < b`; assert `wallSpeed(b) >= wallSpeed(a)`, `gapSize(b) <= gapSize(a)`, `wallSpacing(b) <= wallSpacing(a)`, and all values stay within `wallSpeed` [120, 240] px/s, `gapSize` [100, 140] px, `wallSpacing` [230, 350] px
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 8. Extract high score and checkpoint logic
  - [x] 8.1 Implement pure high-score and checkpoint functions in `src/logic.js`
    - Implement `nextHighScore(current, score)` returning `max(current, score)`
    - Implement `parseHighScore(rawValue)` returning `parseInt(rawValue) || 0` for null/NaN safety
    - Implement `isCheckpoint(score)` returning `score > 0 && score % CHECKPOINT_INTERVAL === 0`
    - _Requirements: 5.4, 6.1, 6.3, 11.1_

  - [ ]* 8.2 Write property test for non-decreasing high score
    - **Property 7: High score is non-decreasing**
    - Generate random score sequences; fold with `nextHighScore` and assert the result equals the running max and never decreases between events
    - **Validates: Requirements 5.4, 6.1**

  - [ ]* 8.3 Write property test for reward checkpoint trigger
    - **Property 8: Reward triggers at exactly checkpoint intervals**
    - Generate random scores in [1, 200]; assert `isCheckpoint(score)` is true iff `score % 5 === 0`
    - **Validates: Requirements 11.1**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Extract cloud initialization logic with parallax invariants
  - [x] 10.1 Implement pure cloud factory in `src/logic.js`
    - Implement `createClouds(rand, config)` (injected RNG) that generates `clouds.minCount`–`clouds.maxCount` clouds, each with `opacity` in [0.2, 0.6] and `speed` in [7, 36] px/s, where speed correlates with opacity (lower opacity → lower or equal speed)
    - Speed is expressed in per-second units sourced from `config.clouds.minSpeed`/`maxSpeed`
    - _Requirements: 8.3, 8.4_

  - [ ]* 10.2 Write property test for cloud parallax invariants
    - **Property 10: Cloud parallax invariants**
    - Generate clouds with random seeds; assert count in [3,5], opacity in [0.2,0.6], speed in [7,36] px/s, and that sorting by opacity yields non-decreasing speed
    - **Validates: Requirements 8.3, 8.4**

- [x] 11. Implement the Reward System in `game.js`
  - [x] 11.1 Add reward animation state and logic
    - Add the reward animation state object (`active`, `timeLeft`, `scale`, `alpha`) per the design data model, with `timeLeft` measured in seconds
    - Implement `triggerReward()` invoked when `isCheckpoint(score)` is true after scoring
    - Update reward animation each frame using `dt` (scale 0→1 bounce, alpha 1→0, `timeLeft` decremented by `dt` over `REWARD_DURATION` seconds) while the game loop continues uninterrupted
    - Render the pizza emoji (🍕) centered above the ghost without blocking collisions
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 11.2 Write unit tests for reward animation lifecycle
    - Test that triggering sets `active=true` and `timeLeft=REWARD_DURATION`, that `dt`-based updates decrement `timeLeft` and deactivate at zero, and that scale/alpha stay within valid ranges
    - _Requirements: 11.2, 11.3_

- [x] 12. Implement the Audio System in `game.js`
  - [x] 12.1 Create the sound design specification document `audio-assets.md`
    - Create `audio-assets.md` at the project root documenting the character and duration of the three sounds: flap whoosh (~0.1s, `jump.wav`), score chime (~0.2s, `score.wav`), collision thud (~0.3s, `game_over.wav`), each within a ±0.05s tolerance
    - Document the graceful-failure guidelines (autoplay-policy blocks and missing/failed-to-load files must fail silently without interrupting the game loop) and the accessibility guideline that all game state changes are conveyed visually so gameplay remains fully understandable when audio is unavailable
    - This is a documentation artifact with no code dependencies and can be authored independently/early
    - _Requirements: 12.8, 12.9_

  - [x] 12.2 Source/create the new `score.wav` asset
    - Create or source a new `score.wav` (the score chime ~0.2s per `audio-assets.md`) — this asset does not yet exist
    - Place it in the `assets/` directory alongside the existing `jump.wav` and `game_over.wav`
    - This asset has no code dependencies and can be added independently/early
    - _Requirements: 12.2, 12.9_

  - [x] 12.3 Add the three preloaded audio elements and playback covering all sounds
    - Create three separate preloaded `Audio` elements: `flapSound` (`jump.wav`), `scoreSound` (`score.wav`), and `collisionSound` (`game_over.wav`), each preloaded (e.g. `preload='auto'`/`.load()`) so playback begins on a triggering event without further file loading
    - Implement `playSound(audioElement)` that resets `audioElement.currentTime` to `0` (so a rapid re-trigger restarts the sound from the beginning) and calls `play()`, wrapping the returned promise in `.catch(() => {})` for autoplay-block and missing/failed-to-load safety
    - Trigger `playSound(flapSound)` on `flap()`/`startGame()`, `playSound(scoreSound)` on score increment (after passing a pipe pair), and `playSound(collisionSound)` on `gameOver()`
    - Because each sound uses its own separate element, the three sounds play independently/concurrently without one cancelling or interrupting another
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ]* 12.4 Write unit tests for audio playback safety and triggers
    - Mock `Audio` elements whose `play()` rejects; assert `playSound` does not throw and resets `currentTime` to 0 on each trigger
    - Assert `playSound(scoreSound)` is invoked when the score increments on passing a pipe pair, and that `currentTime` is reset to 0 on each trigger
    - _Requirements: 12.2, 12.5, 12.6, 12.7_

- [x] 13. Wire delta-time game loop, config, and extracted logic into `game.js`
  - [x] 13.1 Implement the delta-time loop, config startup, and consume extracted logic
    - Start the game only after `loadConfig()` settles: `loadConfig()` → apply config to entity initial values and difficulty bounds → `initClouds()` → `requestAnimationFrame(gameLoop)`
    - Implement the delta-time `gameLoop(timestamp)`: seed `lastTime` on the first frame, compute `dt = (timestamp - lastTime) / 1000`, clamp to `MAX_FRAME_DT` (0.05s), then call `update(dt)` and `render()`
    - Integrate all physics with `dt`: `bird.vy = applyGravity(bird.vy, gravity, maxVelocity, dt)`, `bird.y = integratePosition(bird.y, bird.vy, dt)`, pipes move by `wallSpeed * dt`, clouds scroll by `speed * dt`, and reward countdown uses `dt`
    - Replace inline pipe spawning with distance-based `shouldSpawn(lastPipe.x, W, wallSpacing)` and consume the extracted collision, scoring, `difficultyFor(score, config)`, high-score, and cloud-init functions, removing duplicated logic
    - Include `src/logic.js` via a `<script>` tag in `index.html` before `game.js` and consume it through the browser global
    - Update the Score_Bar to display current score and high score in the dark footer in the format "Score: N | High: N"
    - Wrap `localStorage.getItem`/`setItem` in try/catch so read/write failures default to 0 and silently continue
    - _Requirements: 1.2, 1.3, 5.2, 5.3, 6.1, 6.2, 6.3, 8.6_

  - [ ]* 13.2 Write integration tests for the full scoring + difficulty cycle
    - Simulate flaps and pipes passing the ghost using the extracted logic; assert score increments, difficulty scales at multiples of 5, and high score persists via a mocked storage
    - _Requirements: 5.1, 5.4, 6.1, 9.4_

  - [ ]* 13.3 Write integration tests for delta-time integration and frame-rate independence
    - Verify `bird.y`/`bird.vy` advance correctly for representative `dt` values (1/60s, 1/120s)
    - Run a fixed sequence of inputs at simulated 60fps and 120fps over the same elapsed time and assert the ghost reaches equivalent positions, plus a config-load success/failure pair asserting the game starts playable either way
    - _Requirements: 1.1, 1.3, 2.2_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core implementation tasks are never optional.
- Each task references specific requirements (granular sub-clauses) for traceability.
- The config file (`game-config.json`) and the config-loading system are created early because they are prerequisites for the per-second logic and the delta-time game loop.
- Physics are frame-rate independent: velocities/accelerations are in per-second units and all motion integrates as `pos += v*dt` / `v += a*dt`, with `dt` clamped to `MAX_FRAME_DT` (0.05s).
- The 11 correctness properties from the design are each implemented as their own property-test sub-task, annotated with the property number and validated requirements, and placed immediately after the logic they exercise to catch errors early.
- Property tests use `fast-check` with a minimum of 100 iterations each and the tag format `Feature: flappy-kiro, Property {N}: {title}`.
- Pure logic is extracted into `src/logic.js` so it is testable under Node while the browser still runs a single game via the `game.js` IIFE — no orphaned code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "12.1", "12.2"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "10.1"] },
    { "id": 7, "tasks": ["10.2", "11.1"] },
    { "id": 8, "tasks": ["12.3", "11.2"] },
    { "id": 9, "tasks": ["13.1", "12.4"] },
    { "id": 10, "tasks": ["13.2", "13.3"] }
  ]
}
```
