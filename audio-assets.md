# Sound Design Specification

This document defines the audio assets used in Flappy Kiro, including the character, duration, and source file for each sound effect. It also describes graceful-failure and accessibility guidelines for the Audio System.

## Sound Effects

| Event | File | Character | Target Duration | Tolerance |
|-------|------|-----------|-----------------|-----------|
| Flap (ghost jumps) | `assets/jump.wav` | Short, airy whoosh | ~0.1 s | ±0.05 s |
| Score (pipe pair passed) | `assets/score.wav` | Bright, short chime | ~0.2 s | ±0.05 s |
| Collision (game over) | `assets/game_over.wav` | Low, punchy thud | ~0.3 s | ±0.05 s |

### Flap Whoosh (`jump.wav`)

A brief, soft whoosh that conveys upward motion. It should feel light and airy, matching the ghost character's ethereal nature. Duration target is 0.1 seconds (acceptable range: 0.05 s – 0.15 s).

### Score Chime (`score.wav`)

A bright, positive chime that provides instant feedback when the player passes through a pipe pair. It should feel rewarding but not distracting. Duration target is 0.2 seconds (acceptable range: 0.15 s – 0.25 s).

### Collision Thud (`game_over.wav`)

A low, impactful thud that signals the end of a run. It should feel definitive without being harsh or startling. Duration target is 0.3 seconds (acceptable range: 0.25 s – 0.35 s).

## Graceful-Failure Guidelines

The Audio System must never interrupt the game loop. The following failure scenarios must be handled silently:

1. **Autoplay policy blocks**: Modern browsers may block audio playback until the user has interacted with the page. If `play()` is rejected by the browser's autoplay policy, the error must be caught silently (`.catch(() => {})`) and the game loop continues uninterrupted.

2. **Missing audio files**: If any `.wav` file is missing from the `assets/` directory or fails to load (404, network error, corrupt file), the Audio System must fail silently. No errors should propagate to the game loop or console.

3. **General playback errors**: Any unexpected error from the Web Audio API or HTMLMediaElement must be swallowed. The game must remain fully functional without sound.

## Accessibility Guideline

All game state changes are conveyed visually so that gameplay remains fully understandable when audio is unavailable. Sound effects are supplementary feedback only — they reinforce visual cues but never serve as the sole indicator of any game event.

Specifically:
- The flap is accompanied by a visible squish animation on the ghost
- Scoring is shown via the on-screen score counter updating
- Collision/game over is indicated by visual effects (screen shake, white flash) and the game over overlay

Players who are deaf, hard of hearing, or have audio muted/blocked will have an identical gameplay experience in terms of information and playability.
