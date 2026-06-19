/**
 * Flappy Kiro - Pure Game Logic Module
 *
 * UMD-style export: works as `module.exports` in Node and
 * attaches to `window.FlappyLogic` in the browser.
 *
 * All physics values use per-second units (px/s, px/s²).
 * Delta-time (dt) is in seconds.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FlappyLogic = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Apply gravity to vertical velocity over a time step.
   * @param {number} vy - Current vertical velocity (px/s)
   * @param {number} gravity - Gravitational acceleration (px/s²)
   * @param {number} maxVelocity - Maximum downward velocity clamp (px/s)
   * @param {number} dt - Elapsed time this frame (seconds)
   * @returns {number} New vertical velocity, clamped to maxVelocity
   */
  function applyGravity(vy, gravity, maxVelocity, dt) {
    return Math.min(vy + gravity * dt, maxVelocity);
  }

  /**
   * Return the flap (jump) velocity — replaces current vy on flap.
   * @param {number} jumpVelocity - The upward velocity to apply (negative, px/s)
   * @returns {number} jumpVelocity unchanged
   */
  function flapVelocity(jumpVelocity) {
    return jumpVelocity;
  }

  /**
   * Integrate position over a time step for frame-rate independent movement.
   * @param {number} y - Current position (px)
   * @param {number} vy - Current velocity (px/s)
   * @param {number} dt - Elapsed time this frame (seconds)
   * @returns {number} New position
   */
  function integratePosition(y, vy, dt) {
    return y + vy * dt;
  }

  /**
   * Axis-Aligned Bounding Box collision test.
   * Returns true iff the two rectangles overlap.
   * @param {number} x1 - Left edge of rect 1
   * @param {number} y1 - Top edge of rect 1
   * @param {number} w1 - Width of rect 1
   * @param {number} h1 - Height of rect 1
   * @param {number} x2 - Left edge of rect 2
   * @param {number} y2 - Top edge of rect 2
   * @param {number} w2 - Width of rect 2
   * @param {number} h2 - Height of rect 2
   * @returns {boolean} True if rectangles overlap
   */
  function aabb(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  /**
   * Compute the forgiving hitbox for an entity, inset from its visual bounds.
   * @param {number} x - Center x of the entity
   * @param {number} y - Center y of the entity
   * @param {number} w - Visual width
   * @param {number} h - Visual height
   * @param {number} inset - Pixels to inset on each side
   * @returns {{x: number, y: number, w: number, h: number}} The hitbox rect
   */
  function computeHitbox(x, y, w, h, inset) {
    return {
      x: x - w / 2 + inset,
      y: y - h / 2 + inset,
      w: w - 2 * inset,
      h: h - 2 * inset
    };
  }

  /**
   * Determine whether a new pipe should spawn based on distance from
   * the last pipe to the right edge. Frame-rate independent.
   * @param {number} lastPipeX - X position of the most recent pipe
   * @param {number} W - Canvas width
   * @param {number} wallSpacing - Required horizontal spacing between pipes
   * @returns {boolean} True if a new pipe should spawn
   */
  function shouldSpawn(lastPipeX, W, wallSpacing) {
    return W - lastPipeX >= wallSpacing;
  }

  /**
   * Compute the minimum and maximum allowed gap center Y positions.
   * @param {number} gapSize - Vertical size of the gap between pipes
   * @param {number} H - Canvas height
   * @param {number} GROUND_H - Ground height
   * @param {number} PIPE_CAP_H - Pipe cap height
   * @returns {{minY: number, maxY: number}} Bounds for gap center
   */
  function gapBounds(gapSize, H, GROUND_H, PIPE_CAP_H) {
    var minY = gapSize / 2 + PIPE_CAP_H + 20;
    var maxY = H - GROUND_H - gapSize / 2 - PIPE_CAP_H - 20;
    return { minY: minY, maxY: maxY };
  }

  /**
   * Compute a gap center position using an injected random value [0,1),
   * clamped within the safe bounds.
   * @param {number} gapSize - Vertical size of the gap
   * @param {number} H - Canvas height
   * @param {number} GROUND_H - Ground height
   * @param {number} PIPE_CAP_H - Pipe cap height
   * @param {number} rand - Random value in [0, 1)
   * @returns {number} The computed gap center Y position
   */
  function computeGapCenter(gapSize, H, GROUND_H, PIPE_CAP_H, rand) {
    var bounds = gapBounds(gapSize, H, GROUND_H, PIPE_CAP_H);
    return bounds.minY + rand * (bounds.maxY - bounds.minY);
  }

  /**
   * Determine whether a pipe should be scored (has passed the bird).
   * @param {{x: number, scored: boolean}} pipe - Pipe object
   * @param {number} birdX - Bird's x position
   * @param {number} PIPE_WIDTH - Width of the pipe
   * @returns {boolean} True if the pipe has passed the bird and hasn't been scored
   */
  function shouldScore(pipe, birdX, PIPE_WIDTH) {
    return pipe.x + PIPE_WIDTH < birdX && !pipe.scored;
  }

  /**
   * Apply score to a pipe, returning a new pipe with scored=true and incremented score.
   * @param {{x: number, scored: boolean, gapCenter: number}} pipe - Pipe object
   * @param {number} score - Current score
   * @returns {{pipe: object, score: number}} Updated pipe and score
   */
  function applyScore(pipe, score) {
    return {
      pipe: Object.assign({}, pipe, { scored: true }),
      score: score + 1
    };
  }

  /**
   * Compute difficulty parameters for a given score and config.
   * Difficulty increases in discrete steps based on score milestones.
   * @param {number} score - Current player score
   * @param {object} config - Configuration object with difficulty settings
   * @returns {{wallSpeed: number, gapSize: number, wallSpacing: number}}
   *   wallSpeed in px/s, gapSize in px, wallSpacing in px
   */
  function difficultyFor(score, config) {
    var d = config.difficulty;
    var level = Math.floor(score / d.stepInterval);
    var wallSpeed = Math.min(d.speed.base + level * d.speed.step, d.speed.max);
    var gapSize = Math.max(d.gapSize.base - level * d.gapSize.step, d.gapSize.min);
    var wallSpacing = Math.max(d.spacing.base - level * d.spacing.step, d.spacing.min);
    return { wallSpeed: wallSpeed, gapSize: gapSize, wallSpacing: wallSpacing };
  }

  /**
   * Return the higher of the current high score and the new score.
   * @param {number} current - Current high score
   * @param {number} score - New score to compare
   * @returns {number} The maximum of the two values
   */
  function nextHighScore(current, score) {
    return Math.max(current, score);
  }

  /**
   * Parse a raw value (e.g. from localStorage) into a safe integer high score.
   * Returns 0 for null, undefined, NaN, or non-numeric strings.
   * @param {*} rawValue - The raw stored value
   * @returns {number} Parsed integer or 0
   */
  function parseHighScore(rawValue) {
    return parseInt(rawValue) || 0;
  }

  /**
   * Determine whether the given score is a checkpoint (triggers reward).
   * A checkpoint occurs at every positive multiple of the checkpoint interval.
   * @param {number} score - Current score
   * @param {number} checkpointInterval - Interval between checkpoints (default 5)
   * @returns {boolean} True if score is a positive multiple of checkpointInterval
   */
  function isCheckpoint(score, checkpointInterval) {
    return score > 0 && score % checkpointInterval === 0;
  }

  /**
   * Create an array of cloud objects with parallax properties.
   * Uses an injected RNG for deterministic testing.
   * Speed correlates with opacity: lower opacity → lower or equal speed
   * (simulating depth-based parallax — distant clouds are fainter and slower).
   *
   * @param {function} rand - A function returning a random number in [0, 1)
   * @param {object} config - Configuration object with clouds and canvas settings
   * @returns {Array<{x: number, y: number, w: number, h: number, speed: number, opacity: number}>}
   */
  function createClouds(rand, config) {
    var c = config.clouds;
    var W = config.canvas.width;
    var H = config.canvas.height;

    // Determine count: minCount to maxCount (inclusive)
    var range = c.maxCount - c.minCount + 1;
    var count = c.minCount + Math.floor(rand() * range);

    var clouds = [];
    for (var i = 0; i < count; i++) {
      // Random opacity in [minOpacity, maxOpacity]
      var opacity = c.minOpacity + rand() * (c.maxOpacity - c.minOpacity);

      // Derive speed from opacity via linear interpolation:
      // opacity's normalized position in [minOpacity, maxOpacity] maps to
      // the same normalized position in [minSpeed, maxSpeed].
      var opacityNorm = (opacity - c.minOpacity) / (c.maxOpacity - c.minOpacity);
      var speed = c.minSpeed + opacityNorm * (c.maxSpeed - c.minSpeed);

      // Random position and size
      var x = rand() * W;
      var y = rand() * (H * 0.4); // top 40% of the canvas
      var w = 60 + rand() * 80;   // width between 60–140
      var h = 20 + rand() * 30;   // height between 20–50

      clouds.push({
        x: x,
        y: y,
        w: w,
        h: h,
        speed: speed,
        opacity: opacity
      });
    }

    return clouds;
  }

  return {
    applyGravity: applyGravity,
    flapVelocity: flapVelocity,
    integratePosition: integratePosition,
    aabb: aabb,
    computeHitbox: computeHitbox,
    shouldSpawn: shouldSpawn,
    gapBounds: gapBounds,
    computeGapCenter: computeGapCenter,
    shouldScore: shouldScore,
    applyScore: applyScore,
    difficultyFor: difficultyFor,
    nextHighScore: nextHighScore,
    parseHighScore: parseHighScore,
    isCheckpoint: isCheckpoint,
    createClouds: createClouds
  };
});
