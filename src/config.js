/**
 * Flappy Kiro - Configuration Module
 *
 * UMD-style export: works as `module.exports` in Node and
 * attaches to `window.FlappyConfig` in the browser.
 *
 * Provides DEFAULT_CONFIG, deepMerge, validateConfig, and loadConfig.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FlappyConfig = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ---------- DEFAULT CONFIGURATION ----------
  var DEFAULT_CONFIG = {
    canvas: {
      width: 400,
      height: 600,
      groundHeight: 60
    },
    physics: {
      gravity: 800,
      jumpVelocity: -300,
      maxVelocity: 600
    },
    walls: {
      speed: 120,
      gapSize: 140,
      spacing: 350,
      width: 52,
      capHeight: 20,
      capExtend: 4
    },
    difficulty: {
      stepInterval: 5,
      speed: { base: 120, step: 9, max: 240 },
      gapSize: { base: 140, step: 3, min: 100 },
      spacing: { base: 350, step: 9, min: 230 }
    },
    reward: {
      checkpointInterval: 5,
      durationSeconds: 1.5,
      emoji: '\u{1F355}'
    },
    clouds: {
      minCount: 3,
      maxCount: 5,
      minOpacity: 0.2,
      maxOpacity: 0.6,
      minSpeed: 7,
      maxSpeed: 36
    },
    hitboxInset: 4
  };

  /**
   * Deep-merges source into target recursively.
   * Only merges keys present in target (the schema).
   * Returns a new object — does not mutate inputs.
   */
  function deepMerge(target, source) {
    var result = {};
    var keys = Object.keys(target);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (
        source != null &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key], source[key]);
      } else if (source != null && key in source) {
        result[key] = source[key];
      } else {
        result[key] = target[key];
      }
    }
    return result;
  }

  /**
   * Validates a config object. Checks required numeric fields are present and finite.
   * Returns a complete config with defaults for any missing/invalid field.
   */
  function validateConfig(obj) {
    if (obj == null || typeof obj !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    // Deep-merge loaded values over defaults first
    var merged = deepMerge(DEFAULT_CONFIG, obj);

    // Now validate numeric fields — replace non-finite values with defaults
    function validateNumericFields(target, defaults) {
      var keys = Object.keys(defaults);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = target[key];
        var def = defaults[key];
        if (typeof def === 'object' && def !== null && !Array.isArray(def)) {
          if (typeof val !== 'object' || val === null) {
            target[key] = JSON.parse(JSON.stringify(def));
          } else {
            validateNumericFields(val, def);
          }
        } else if (typeof def === 'number') {
          if (typeof val !== 'number' || !isFinite(val)) {
            target[key] = def;
          }
        }
        // String fields (like emoji) are kept as-is from the merge
      }
    }

    validateNumericFields(merged, DEFAULT_CONFIG);
    return merged;
  }

  /**
   * Loads game configuration from game-config.json, validates it,
   * and deep-merges over DEFAULT_CONFIG.
   * On any failure (fetch error, non-OK status, parse error, validation failure),
   * resolves with a complete config using defaults for any missing/invalid field.
   */
  function loadConfig() {
    if (typeof fetch === 'undefined') {
      // Node environment without fetch — return defaults
      return Promise.resolve(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    }
    return fetch('game-config.json')
      .then(function (response) {
        if (!response.ok) {
          return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
        return response.json().then(function (data) {
          return validateConfig(data);
        });
      })
      .catch(function () {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      });
  }

  return {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    deepMerge: deepMerge,
    validateConfig: validateConfig,
    loadConfig: loadConfig
  };
});
