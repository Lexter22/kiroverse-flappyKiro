# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro incrementally in vanilla JavaScript with HTML5 Canvas. The existing `game.js` already implements core gameplay (physics, pipes, collisions, scoring, difficulty, clouds, effects), so the work focuses on: (1) extracting the pure game logic into testable functions so the 10 correctness properties can be verified with `fast-check`, (2) adding the missing Reward System and Audio System defined in the design, (3) hardening error handling for local storage and audio, and (4) wiring everything back into the browser game loop with no orphaned code.

To enable property-based and unit testing of browser game logic, pure logic functions are extracted into a separate module (`src/logic.js`) using a UMD-style export that works both in the browser (attached to a global) and under Node's test runner. The IIFE in `game.js` consumes these functions, keeping a single runtime entry point while making the logic importable by tests.

## Tasks

- [ ] 1. Set up testing infrastructure and project tooling
  - Initialize `package.json` with a test script (Node's built-in `node:test` runner or Vitest in `--run` mode)
  - Add `fast-check` as a dev dependency for property-based testing
  - Create `src/` directory for extracted logic and `test/` directory for test files
  - Configure the test runner to execute `test/**/*.test.js` in single-run (non-watch) mode
  - _Requirements: 1.3_

- [ ] 2. Extract pure ghost physics logic
  - [ ] 2.1 Create `src/logic.js` and implement pure physics functions
    - Define shared constants (W, H, GROUND_H, PIPE_WIDTH, PIPE_CAP_H, PIPE_CAP_EXTEND, HITBOX_INSET, REWARD_DURATION, CHECKPOINT_INTERVAL) and bird config (gravity, flapStrength, maxVel, w, h)
    - Implement `applyGravity(vy, gravity, maxVel)` returning `min(vy + gravity, maxVel)`
    - Implement `flapVelocity(flapStrength)` returning `flapStrength`
    - Use a UMD-style export so functions are available as `module.exports` in Node and on a global (e.g., `window.FlappyLogic`) in the browser
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.2 Write property test for gravity clamping
    - **Property 1: Gravity increases downward velocity with clamping**
    - Generate random `vy` in [-20, 20]; assert result equals `min(vy + gravity, maxVel)` and never exceeds `maxVel`
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 2.3 Write property test for flap velocity
    - **Property 2: Flap sets upward velocity**
    - Generate random current `vy` in [-20, 20]; assert flap result equals `flapStrength` (-7) regardless of input
    - **Validates: Requirements 2.1**

- [ ] 3. Extract collision and hitbox logic
  - [ ] 3.1 Implement pure collision functions in `src/logic.js`
    - Implement `aabb(x1, y1, w1, h1, x2, y2, w2, h2)` as a pure boolean rectangle-overlap test
    - Implement `computeHitbox(x, y, w, h, inset)` returning `{ x: x - w/2 + inset, y: y - h/2 + inset, w: w - 2*inset, h: h - 2*inset }`
    - _Requirements: 4.1, 4.4_

  - [ ]* 3.2 Write property test for AABB correctness
    - **Property 3: AABB collision correctness**
    - Generate random rectangles with positive dimensions; assert `aabb` returns true iff the overlap formula holds
    - **Validates: Requirements 4.1**

  - [ ]* 3.3 Write property test for forgiving hitbox inset
    - **Property 9: Hitbox inset provides forgiving collision**
    - Generate random ghost dimensions and inset; assert computed hitbox position/dimensions match the formula and are strictly smaller than visual bounds
    - **Validates: Requirements 4.4**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Extract pipe spawning and scoring logic
  - [ ] 5.1 Implement pure pipe functions in `src/logic.js`
    - Implement `gapBounds(gapSize)` returning `{ minY, maxY }` per the design formula
    - Implement `computeGapCenter(gapSize, rand)` that takes an injected random value [0,1) and returns a `gapCenter` clamped within bounds
    - Implement `shouldScore(pipe, birdX)` returning true when `pipe.x + PIPE_WIDTH < birdX && !pipe.scored`
    - Implement `applyScore(pipe, score)` that returns the incremented score and a pipe with `scored: true`
    - _Requirements: 3.1, 3.2, 3.3, 5.1_

  - [ ]* 5.2 Write property test for gap bounds
    - **Property 4: Pipe gap center stays within safe bounds**
    - Generate random `gapSize` in [100, 150]; assert `gapCenter` satisfies the lower and upper bound formulas
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 5.3 Write property test for scoring exactly once
    - **Property 5: Score increments exactly once per pipe**
    - Generate random pipe x-positions relative to bird and simulate multiple frames; assert score increments exactly once and `scored` flips false→true only once
    - **Validates: Requirements 5.1**

- [ ] 6. Extract difficulty scaling logic
  - [ ] 6.1 Implement pure difficulty function in `src/logic.js`
    - Implement `difficultyFor(score)` returning `{ pipeSpeed, gapSize, pipeInterval }` using `level = floor(score / CHECKPOINT_INTERVAL)` and the bounded formulas from the design
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 6.2 Write property test for difficulty monotonicity and bounds
    - **Property 6: Difficulty scaling is monotonic and bounded**
    - Generate random score pairs `a < b`; assert `pipeSpeed(b) >= pipeSpeed(a)`, `gapSize(b) <= gapSize(a)`, `pipeInterval(b) <= pipeInterval(a)`, and all values stay within [2,4], [100,150], [55,90]
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [ ] 7. Extract high score and checkpoint logic
  - [ ] 7.1 Implement pure high-score and checkpoint functions in `src/logic.js`
    - Implement `nextHighScore(current, score)` returning `max(current, score)`
    - Implement `parseHighScore(rawValue)` returning `parseInt(rawValue) || 0` for null/NaN safety
    - Implement `isCheckpoint(score)` returning `score > 0 && score % CHECKPOINT_INTERVAL === 0`
    - _Requirements: 5.4, 6.1, 6.3, 11.1_

  - [ ]* 7.2 Write property test for non-decreasing high score
    - **Property 7: High score is non-decreasing**
    - Generate random score sequences; fold with `nextHighScore` and assert the result equals the running max and never decreases between events
    - **Validates: Requirements 5.4, 6.1**

  - [ ]* 7.3 Write property test for reward checkpoint trigger
    - **Property 8: Reward triggers at exactly checkpoint intervals**
    - Generate random scores in [1, 200]; assert `isCheckpoint(score)` is true iff `score % 5 === 0`
    - **Validates: Requirements 11.1**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Extract cloud initialization logic with parallax invariants
  - [ ] 9.1 Implement pure cloud factory in `src/logic.js`
    - Implement `createClouds(rand)` (injected RNG) that generates 3-5 clouds, each with `opacity` in [0.2, 0.6] and `speed` in [0.2, 1.0], where speed correlates with opacity (lower opacity → lower or equal speed)
    - _Requirements: 8.3, 8.4_

  - [ ]* 9.2 Write property test for cloud parallax invariants
    - **Property 10: Cloud parallax invariants**
    - Generate clouds with random seeds; assert count in [3,5], opacity in [0.2,0.6], speed in [0.2,1.0], and that sorting by opacity yields non-decreasing speed
    - **Validates: Requirements 8.3, 8.4**

- [ ] 10. Implement the Reward System in `game.js`
  - [ ] 10.1 Add reward animation state and logic
    - Add the reward animation state object (`active`, `timer`, `scale`, `alpha`) per the design data model
    - Implement `triggerReward()` invoked when `isCheckpoint(score)` is true after scoring
    - Update reward animation each frame (scale 0→1 bounce, alpha 1→0, timer countdown over `REWARD_DURATION` frames) while the game loop continues uninterrupted
    - Render the pizza emoji (🍕) centered above the ghost without blocking collisions
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 10.2 Write unit tests for reward animation lifecycle
    - Test that triggering sets `active=true` and `timer=REWARD_DURATION`, that updates decrement the timer and deactivate at zero, and that scale/alpha stay within valid ranges
    - _Requirements: 11.2, 11.3_

- [ ] 11. Implement the Audio System in `game.js`
  - [ ] 11.1 Add audio elements and playback
    - Add `jump.wav` and `game_over.wav` audio elements (preloaded) referencing the existing assets
    - Implement `playSound(audioElement)` that resets `currentTime` and plays, wrapping the play promise in `.catch(() => {})` to satisfy autoplay policies and missing-file failures
    - Trigger flap sound in `flap()`/`startGame()` and game-over sound in `gameOver()`
    - _Requirements: 2.1, 7.3_

  - [ ]* 11.2 Write unit tests for audio playback safety
    - Mock an audio element whose `play()` rejects; assert `playSound` does not throw and resets `currentTime`
    - _Requirements: 7.3_

- [ ] 12. Wire extracted logic into `game.js` and harden error handling
  - [ ] 12.1 Replace inline logic with calls into `src/logic.js`
    - Include `src/logic.js` via a `<script>` tag in `index.html` before `game.js` and consume it through the browser global
    - Replace inline physics, collision, pipe spawning, scoring, difficulty, high-score, and cloud-init code with calls to the extracted pure functions, removing duplicated logic
    - Update the Score_Bar to display current score and high score in the dark footer in the format "Score: N | High: N"
    - Wrap `localStorage.getItem`/`setItem` in try/catch so read/write failures default to 0 and silently continue
    - _Requirements: 1.2, 5.2, 5.3, 6.1, 6.2, 6.3, 8.6_

  - [ ]* 12.2 Write integration tests for the full scoring + difficulty cycle
    - Simulate flaps and pipes passing the ghost using the extracted logic; assert score increments, difficulty scales at multiples of 5, and high score persists via a mocked storage
    - _Requirements: 5.1, 5.4, 6.1, 9.4_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core implementation tasks are never optional.
- Each task references specific requirements (granular sub-clauses) for traceability.
- The 10 correctness properties from the design are each implemented as their own property-test sub-task, annotated with the property number and validated requirements, and placed immediately after the logic they exercise to catch errors early.
- Property tests use `fast-check` with a minimum of 100 iterations each and the tag format `Feature: flappy-kiro, Property {N}: {title}`.
- Pure logic is extracted into `src/logic.js` so it is testable under Node while the browser still runs a single game via the `game.js` IIFE — no orphaned code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.1", "6.1", "7.1", "9.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.2", "7.2", "7.3", "9.2"] },
    { "id": 5, "tasks": ["10.1", "11.1"] },
    { "id": 6, "tasks": ["10.2", "11.2", "12.1"] },
    { "id": 7, "tasks": ["12.2"] }
  ]
}
```
