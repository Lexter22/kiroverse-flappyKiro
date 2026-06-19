/**
 * Flappy Kiro - Game Logic Tests
 *
 * Uses Node's built-in test runner (node:test) and fast-check
 * for property-based testing of pure game logic.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const logic = require('../src/logic.js');

describe('Flappy Kiro Logic', () => {
  it('module exports an object', () => {
    assert.equal(typeof logic, 'object');
    assert.notEqual(logic, null);
  });

  describe('applyGravity', () => {
    it('increases velocity by gravity * dt', () => {
      // vy=0, gravity=800, maxVelocity=600, dt=1/60
      const result = logic.applyGravity(0, 800, 600, 1 / 60);
      assert.ok(Math.abs(result - (800 / 60)) < 1e-10);
    });

    it('clamps velocity to maxVelocity', () => {
      // vy=590, gravity=800, dt=0.05 → 590 + 40 = 630, clamped to 600
      const result = logic.applyGravity(590, 800, 600, 0.05);
      assert.equal(result, 600);
    });

    it('handles negative velocity correctly', () => {
      // vy=-300, gravity=800, dt=0.05 → -300 + 40 = -260
      const result = logic.applyGravity(-300, 800, 600, 0.05);
      assert.ok(Math.abs(result - (-260)) < 1e-10);
    });
  });

  describe('flapVelocity', () => {
    it('returns the jumpVelocity value', () => {
      assert.equal(logic.flapVelocity(-300), -300);
    });

    it('works with any negative value', () => {
      assert.equal(logic.flapVelocity(-250), -250);
    });
  });

  describe('integratePosition', () => {
    it('moves position by velocity * dt', () => {
      // y=300, vy=-300, dt=1/60 → 300 + (-300/60) = 295
      const result = logic.integratePosition(300, -300, 1 / 60);
      assert.ok(Math.abs(result - 295) < 1e-10);
    });

    it('returns same position when velocity is 0', () => {
      assert.equal(logic.integratePosition(100, 0, 0.016), 100);
    });

    it('moves downward with positive velocity', () => {
      const result = logic.integratePosition(200, 400, 0.05);
      assert.ok(Math.abs(result - 220) < 1e-10);
    });
  });

  describe('aabb', () => {
    it('returns true for overlapping rectangles', () => {
      // Two 10x10 squares that overlap
      assert.equal(logic.aabb(0, 0, 10, 10, 5, 5, 10, 10), true);
    });

    it('returns false for non-overlapping rectangles (side by side)', () => {
      assert.equal(logic.aabb(0, 0, 10, 10, 20, 0, 10, 10), false);
    });

    it('returns false for non-overlapping rectangles (above/below)', () => {
      assert.equal(logic.aabb(0, 0, 10, 10, 0, 20, 10, 10), false);
    });

    it('returns false when rectangles touch edges exactly (no overlap)', () => {
      // Touching at edge: x1+w1 == x2, so NOT overlapping
      assert.equal(logic.aabb(0, 0, 10, 10, 10, 0, 10, 10), false);
    });

    it('returns true for fully contained rectangle', () => {
      assert.equal(logic.aabb(0, 0, 100, 100, 20, 20, 10, 10), true);
    });

    it('returns true for identical rectangles', () => {
      assert.equal(logic.aabb(5, 5, 20, 20, 5, 5, 20, 20), true);
    });
  });

  describe('computeHitbox', () => {
    it('computes hitbox with standard ghost dimensions', () => {
      // x=80, y=300, w=34, h=28, inset=4
      const hb = logic.computeHitbox(80, 300, 34, 28, 4);
      assert.ok(Math.abs(hb.x - (80 - 17 + 4)) < 1e-10); // 67
      assert.ok(Math.abs(hb.y - (300 - 14 + 4)) < 1e-10); // 290
      assert.ok(Math.abs(hb.w - (34 - 8)) < 1e-10); // 26
      assert.ok(Math.abs(hb.h - (28 - 8)) < 1e-10); // 20
    });

    it('hitbox is smaller than visual bounds when inset > 0', () => {
      const hb = logic.computeHitbox(50, 50, 40, 30, 5);
      assert.ok(hb.w < 40);
      assert.ok(hb.h < 30);
    });

    it('hitbox equals visual bounds when inset is 0', () => {
      const hb = logic.computeHitbox(50, 50, 40, 30, 0);
      assert.equal(hb.w, 40);
      assert.equal(hb.h, 30);
      assert.ok(Math.abs(hb.x - (50 - 20)) < 1e-10);
      assert.ok(Math.abs(hb.y - (50 - 15)) < 1e-10);
    });
  });

  describe('shouldSpawn', () => {
    it('returns true when distance from last pipe to right edge >= wallSpacing', () => {
      // W=400, lastPipeX=50, wallSpacing=350 → 400-50=350 >= 350
      assert.equal(logic.shouldSpawn(50, 400, 350), true);
    });

    it('returns false when distance is less than wallSpacing', () => {
      // W=400, lastPipeX=100, wallSpacing=350 → 400-100=300 < 350
      assert.equal(logic.shouldSpawn(100, 400, 350), false);
    });

    it('returns true when last pipe has moved far left', () => {
      // W=400, lastPipeX=-100, wallSpacing=350 → 400-(-100)=500 >= 350
      assert.equal(logic.shouldSpawn(-100, 400, 350), true);
    });

    it('returns true when spacing exactly equals wallSpacing', () => {
      // W=400, lastPipeX=150, wallSpacing=250 → 400-150=250 >= 250
      assert.equal(logic.shouldSpawn(150, 400, 250), true);
    });
  });

  describe('gapBounds', () => {
    it('computes correct bounds with default config values', () => {
      // gapSize=140, H=600, GROUND_H=60, PIPE_CAP_H=20
      const bounds = logic.gapBounds(140, 600, 60, 20);
      // minY = 140/2 + 20 + 20 = 110
      assert.ok(Math.abs(bounds.minY - 110) < 1e-10);
      // maxY = 600 - 60 - 140/2 - 20 - 20 = 430
      assert.ok(Math.abs(bounds.maxY - 430) < 1e-10);
    });

    it('computes correct bounds with smaller gap', () => {
      // gapSize=100, H=600, GROUND_H=60, PIPE_CAP_H=20
      const bounds = logic.gapBounds(100, 600, 60, 20);
      // minY = 100/2 + 20 + 20 = 90
      assert.ok(Math.abs(bounds.minY - 90) < 1e-10);
      // maxY = 600 - 60 - 100/2 - 20 - 20 = 450
      assert.ok(Math.abs(bounds.maxY - 450) < 1e-10);
    });

    it('minY is always less than maxY for valid game parameters', () => {
      const bounds = logic.gapBounds(140, 600, 60, 20);
      assert.ok(bounds.minY < bounds.maxY);
    });
  });

  describe('computeGapCenter', () => {
    it('returns minY when rand is 0', () => {
      const result = logic.computeGapCenter(140, 600, 60, 20, 0);
      // minY = 110
      assert.ok(Math.abs(result - 110) < 1e-10);
    });

    it('approaches maxY when rand is close to 1', () => {
      const result = logic.computeGapCenter(140, 600, 60, 20, 0.999);
      // maxY = 430, result should be close to 430
      assert.ok(result > 429);
      assert.ok(result < 430);
    });

    it('returns midpoint when rand is 0.5', () => {
      const result = logic.computeGapCenter(140, 600, 60, 20, 0.5);
      // minY=110, maxY=430, midpoint = 110 + 0.5*(430-110) = 270
      assert.ok(Math.abs(result - 270) < 1e-10);
    });

    it('result is always within gapBounds', () => {
      const bounds = logic.gapBounds(140, 600, 60, 20);
      for (let r = 0; r < 1; r += 0.1) {
        const result = logic.computeGapCenter(140, 600, 60, 20, r);
        assert.ok(result >= bounds.minY - 1e-10);
        assert.ok(result <= bounds.maxY + 1e-10);
      }
    });
  });

  describe('shouldScore', () => {
    it('returns true when pipe has passed bird and is not scored', () => {
      const pipe = { x: 10, scored: false };
      // birdX=80, PIPE_WIDTH=52 → 10+52=62 < 80 → true
      assert.equal(logic.shouldScore(pipe, 80, 52), true);
    });

    it('returns false when pipe has not yet passed bird', () => {
      const pipe = { x: 50, scored: false };
      // birdX=80, PIPE_WIDTH=52 → 50+52=102 < 80 → false
      assert.equal(logic.shouldScore(pipe, 80, 52), false);
    });

    it('returns false when pipe has passed but is already scored', () => {
      const pipe = { x: 10, scored: true };
      assert.equal(logic.shouldScore(pipe, 80, 52), false);
    });

    it('returns false when pipe trailing edge equals birdX exactly', () => {
      const pipe = { x: 28, scored: false };
      // 28 + 52 = 80, not strictly less than 80
      assert.equal(logic.shouldScore(pipe, 80, 52), false);
    });
  });

  describe('applyScore', () => {
    it('returns new pipe with scored=true and incremented score', () => {
      const pipe = { x: 10, gapCenter: 250, scored: false };
      const result = logic.applyScore(pipe, 3);
      assert.equal(result.pipe.scored, true);
      assert.equal(result.score, 4);
    });

    it('does not mutate the original pipe object', () => {
      const pipe = { x: 10, gapCenter: 250, scored: false };
      logic.applyScore(pipe, 5);
      assert.equal(pipe.scored, false);
    });

    it('preserves all original pipe properties', () => {
      const pipe = { x: 20, gapCenter: 300, scored: false };
      const result = logic.applyScore(pipe, 0);
      assert.equal(result.pipe.x, 20);
      assert.equal(result.pipe.gapCenter, 300);
      assert.equal(result.pipe.scored, true);
    });
  });
});

describe('difficultyFor', () => {
  const config = {
    difficulty: {
      stepInterval: 5,
      speed: { base: 120, step: 9, max: 240 },
      gapSize: { base: 140, step: 3, min: 100 },
      spacing: { base: 350, step: 9, min: 230 }
    }
  };

  it('returns base values at score 0', () => {
    const result = logic.difficultyFor(0, config);
    assert.equal(result.wallSpeed, 120);
    assert.equal(result.gapSize, 140);
    assert.equal(result.wallSpacing, 350);
  });

  it('returns base values for scores below stepInterval', () => {
    const result = logic.difficultyFor(4, config);
    assert.equal(result.wallSpeed, 120);
    assert.equal(result.gapSize, 140);
    assert.equal(result.wallSpacing, 350);
  });

  it('increases difficulty at first step (score=5, level=1)', () => {
    const result = logic.difficultyFor(5, config);
    assert.equal(result.wallSpeed, 129);   // 120 + 1*9
    assert.equal(result.gapSize, 137);     // 140 - 1*3
    assert.equal(result.wallSpacing, 341); // 350 - 1*9
  });

  it('increases difficulty at second step (score=10, level=2)', () => {
    const result = logic.difficultyFor(10, config);
    assert.equal(result.wallSpeed, 138);   // 120 + 2*9
    assert.equal(result.gapSize, 134);     // 140 - 2*3
    assert.equal(result.wallSpacing, 332); // 350 - 2*9
  });

  it('clamps wallSpeed to max', () => {
    // level needs to be >= (240-120)/9 = 13.33 → level 14, score=70
    const result = logic.difficultyFor(70, config);
    assert.equal(result.wallSpeed, 240);
  });

  it('clamps gapSize to min', () => {
    // level needs to be >= (140-100)/3 = 13.33 → level 14, score=70
    const result = logic.difficultyFor(70, config);
    assert.equal(result.gapSize, 100);
  });

  it('clamps wallSpacing to min', () => {
    // level needs to be >= (350-230)/9 = 13.33 → level 14, score=70
    const result = logic.difficultyFor(70, config);
    assert.equal(result.wallSpacing, 230);
  });

  it('all values stay clamped at very high scores', () => {
    const result = logic.difficultyFor(1000, config);
    assert.equal(result.wallSpeed, 240);
    assert.equal(result.gapSize, 100);
    assert.equal(result.wallSpacing, 230);
  });

  it('uses floor division for level calculation', () => {
    // score=9 → level = floor(9/5) = 1
    const result = logic.difficultyFor(9, config);
    assert.equal(result.wallSpeed, 129);   // 120 + 1*9
    assert.equal(result.gapSize, 137);     // 140 - 1*3
    assert.equal(result.wallSpacing, 341); // 350 - 1*9
  });
});

describe('nextHighScore', () => {
  it('returns the new score when it exceeds current high score', () => {
    assert.equal(logic.nextHighScore(5, 10), 10);
  });

  it('returns the current high score when it is higher', () => {
    assert.equal(logic.nextHighScore(10, 5), 10);
  });

  it('returns the same value when both are equal', () => {
    assert.equal(logic.nextHighScore(7, 7), 7);
  });

  it('handles zero current and positive score', () => {
    assert.equal(logic.nextHighScore(0, 3), 3);
  });

  it('handles zero score (no improvement)', () => {
    assert.equal(logic.nextHighScore(8, 0), 8);
  });
});

describe('parseHighScore', () => {
  it('parses a valid integer string', () => {
    assert.equal(logic.parseHighScore('42'), 42);
  });

  it('returns 0 for null', () => {
    assert.equal(logic.parseHighScore(null), 0);
  });

  it('returns 0 for undefined', () => {
    assert.equal(logic.parseHighScore(undefined), 0);
  });

  it('returns 0 for NaN-producing strings', () => {
    assert.equal(logic.parseHighScore('abc'), 0);
  });

  it('returns 0 for empty string', () => {
    assert.equal(logic.parseHighScore(''), 0);
  });

  it('parses a string with leading digits', () => {
    assert.equal(logic.parseHighScore('15px'), 15);
  });

  it('returns 0 for "0" (parseInt returns 0, || falls through)', () => {
    assert.equal(logic.parseHighScore('0'), 0);
  });
});

describe('isCheckpoint', () => {
  it('returns true when score is a positive multiple of checkpointInterval', () => {
    assert.equal(logic.isCheckpoint(5, 5), true);
    assert.equal(logic.isCheckpoint(10, 5), true);
    assert.equal(logic.isCheckpoint(15, 5), true);
  });

  it('returns false when score is not a multiple of checkpointInterval', () => {
    assert.equal(logic.isCheckpoint(1, 5), false);
    assert.equal(logic.isCheckpoint(7, 5), false);
    assert.equal(logic.isCheckpoint(13, 5), false);
  });

  it('returns false when score is 0 (not a positive multiple)', () => {
    assert.equal(logic.isCheckpoint(0, 5), false);
  });

  it('returns false for negative scores', () => {
    assert.equal(logic.isCheckpoint(-5, 5), false);
    assert.equal(logic.isCheckpoint(-10, 5), false);
  });

  it('works with different checkpoint intervals', () => {
    assert.equal(logic.isCheckpoint(3, 3), true);
    assert.equal(logic.isCheckpoint(4, 3), false);
    assert.equal(logic.isCheckpoint(10, 10), true);
    assert.equal(logic.isCheckpoint(9, 10), false);
  });
});

describe('createClouds', () => {
  const config = {
    canvas: { width: 400, height: 600, groundHeight: 60 },
    clouds: {
      minCount: 3,
      maxCount: 5,
      minOpacity: 0.2,
      maxOpacity: 0.6,
      minSpeed: 7,
      maxSpeed: 36
    }
  };

  // Helper: create a deterministic rand that cycles through given values
  function makeRand(values) {
    let i = 0;
    return function () {
      return values[i++ % values.length];
    };
  }

  it('generates between minCount and maxCount clouds', () => {
    // rand()=0 for count → minCount + floor(0 * 3) = 3
    const clouds = logic.createClouds(makeRand([0]), config);
    assert.equal(clouds.length, 3);

    // rand()=0.99 for count → minCount + floor(0.99 * 3) = 3 + 2 = 5
    const clouds2 = logic.createClouds(makeRand([0.99]), config);
    assert.equal(clouds2.length, 5);
  });

  it('each cloud has required properties', () => {
    const clouds = logic.createClouds(makeRand([0.5]), config);
    for (const cloud of clouds) {
      assert.equal(typeof cloud.x, 'number');
      assert.equal(typeof cloud.y, 'number');
      assert.equal(typeof cloud.w, 'number');
      assert.equal(typeof cloud.h, 'number');
      assert.equal(typeof cloud.speed, 'number');
      assert.equal(typeof cloud.opacity, 'number');
    }
  });

  it('opacity is within [minOpacity, maxOpacity]', () => {
    const clouds = logic.createClouds(makeRand([0.5]), config);
    for (const cloud of clouds) {
      assert.ok(cloud.opacity >= 0.2 - 1e-10, `opacity ${cloud.opacity} < 0.2`);
      assert.ok(cloud.opacity <= 0.6 + 1e-10, `opacity ${cloud.opacity} > 0.6`);
    }
  });

  it('speed is within [minSpeed, maxSpeed]', () => {
    const clouds = logic.createClouds(makeRand([0.5]), config);
    for (const cloud of clouds) {
      assert.ok(cloud.speed >= 7 - 1e-10, `speed ${cloud.speed} < 7`);
      assert.ok(cloud.speed <= 36 + 1e-10, `speed ${cloud.speed} > 36`);
    }
  });

  it('speed correlates with opacity (lower opacity → lower or equal speed)', () => {
    // Use varying rand values to produce different opacities
    let idx = 0;
    const values = [0.5]; // count rand → minCount + floor(0.5*3) = 4
    // For 4 clouds, provide opacity rands: 0.0, 0.3, 0.7, 1.0 (close to)
    // Then remaining rands for x, y, w, h
    const opacityRands = [0.0, 0.3, 0.7, 0.99];
    const fillerRands = [0.5, 0.5, 0.5, 0.5]; // x, y, w, h for each cloud
    const allValues = [0.5, ...opacityRands.flatMap(o => [o, ...fillerRands])];
    const clouds = logic.createClouds(makeRand(allValues), config);

    // Sort clouds by opacity and verify speed correlation
    const sorted = [...clouds].sort((a, b) => a.opacity - b.opacity);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(
        sorted[i].speed >= sorted[i - 1].speed - 1e-10,
        `Cloud with opacity ${sorted[i].opacity} has speed ${sorted[i].speed} ` +
        `which is less than cloud with opacity ${sorted[i - 1].opacity} speed ${sorted[i - 1].speed}`
      );
    }
  });

  it('speed is derived via linear interpolation from opacity', () => {
    // Use rand=0 for count (gives minCount=3), then 0 for first cloud opacity
    // opacity=0.2 → opacityNorm=0 → speed=7
    const clouds = logic.createClouds(makeRand([0, 0, 0.5, 0.5, 0.5, 0.5]), config);
    const firstCloud = clouds[0];
    assert.ok(Math.abs(firstCloud.opacity - 0.2) < 1e-10);
    assert.ok(Math.abs(firstCloud.speed - 7) < 1e-10);
  });

  it('maximum opacity produces maximum speed', () => {
    // For count: rand=0 → 3 clouds. For first cloud opacity: rand≈1 → opacity near maxOpacity
    // opacity = 0.2 + 0.99*(0.6-0.2) = 0.2 + 0.396 = 0.596
    // opacityNorm = (0.596-0.2)/(0.6-0.2) = 0.99
    // speed = 7 + 0.99*(36-7) = 7 + 28.71 = 35.71
    const clouds = logic.createClouds(makeRand([0, 0.99, 0.5, 0.5, 0.5, 0.5]), config);
    const firstCloud = clouds[0];
    assert.ok(firstCloud.speed > 35, `Expected speed > 35, got ${firstCloud.speed}`);
    assert.ok(firstCloud.speed <= 36 + 1e-10);
  });

  it('x is within [0, canvas width]', () => {
    const clouds = logic.createClouds(makeRand([0.5]), config);
    for (const cloud of clouds) {
      assert.ok(cloud.x >= 0);
      assert.ok(cloud.x <= 400);
    }
  });

  it('y is within top portion of canvas', () => {
    const clouds = logic.createClouds(makeRand([0.5]), config);
    for (const cloud of clouds) {
      assert.ok(cloud.y >= 0);
      assert.ok(cloud.y <= 600 * 0.4 + 1e-10); // top 40%
    }
  });
});
