# Requirements Document

## Introduction

Flappy Kiro is a browser-based retro endless scroller game where the player guides a ghost character through gaps between pairs of pipes. The game features a hand-drawn art style with a light blue sky background, green pipes with darker caps, floating clouds, and a dark footer score bar. The player taps or presses a key to make the ghost flap upward against gravity, earning points by successfully passing through pipe gaps. The game progressively increases in difficulty and persists the high score across sessions.

## Glossary

- **Game_Canvas**: The HTML5 canvas element (400×600 pixels) where the game is rendered
- **Ghost**: The player-controlled character, a small white ghost sprite navigating through pipes
- **Pipe_Pair**: A set of two vertical green pipes (top and bottom) with a navigable gap between them
- **Pipe_Cap**: The darker green rim/cap at the opening end of each pipe
- **Gap**: The vertical space between the top and bottom pipes of a Pipe_Pair through which the Ghost must pass
- **Score_Bar**: A dark footer bar at the bottom of the Game_Canvas displaying the current score and high score
- **Game_Loop**: The continuous update-render cycle driving game state at approximately 60 frames per second
- **Hitbox**: The axis-aligned bounding box used for collision detection between the Ghost and obstacles
- **High_Score**: The highest score achieved across all play sessions, persisted in browser local storage
- **Difficulty_System**: The mechanism that increases game challenge as the player's score rises
- **Score_Checkpoint**: A milestone reached every 5 points that triggers a celebratory reward
- **Reward_Animation**: A brief visual animation displaying a pizza emoji/icon when a Score_Checkpoint is reached

## Requirements

### Requirement 1: Game Canvas Rendering

**User Story:** As a player, I want the game to render on an HTML5 canvas in my browser, so that I can play without installing additional software.

#### Acceptance Criteria

1. THE Game_Canvas SHALL render the game at a resolution of 400×600 pixels
2. THE Game_Canvas SHALL display a light blue gradient sky background above the Score_Bar
3. THE Game_Canvas SHALL render at approximately 60 frames per second using requestAnimationFrame
4. THE Game_Canvas SHALL scale to fit the browser viewport while maintaining the aspect ratio

### Requirement 2: Ghost Character Control

**User Story:** As a player, I want to control the ghost by tapping or pressing a key, so that I can navigate through the pipes.

#### Acceptance Criteria

1. WHEN the player taps the Game_Canvas or presses the Space key, THE Ghost SHALL move upward with an immediate velocity change (flap)
2. WHILE no input is received, THE Ghost SHALL accelerate downward due to gravity at a constant rate
3. THE Ghost SHALL have a maximum downward velocity to prevent uncontrollable falling
4. THE Ghost SHALL rotate visually based on the current vertical velocity to indicate movement direction
5. WHEN the Ghost flaps, THE Ghost SHALL display a brief squish animation to provide visual feedback

### Requirement 3: Pipe Generation and Movement

**User Story:** As a player, I want pipes to appear and scroll across the screen, so that I have obstacles to navigate through.

#### Acceptance Criteria

1. THE Game_Loop SHALL generate Pipe_Pairs at regular intervals and position them at the right edge of the Game_Canvas
2. EACH Pipe_Pair SHALL consist of a top pipe extending downward from the top of the Game_Canvas and a bottom pipe extending upward from above the Score_Bar, with a Gap between them
3. THE Gap center position SHALL be randomized vertically within safe bounds for each Pipe_Pair
4. EACH Pipe_Pair SHALL scroll from right to left at a constant speed determined by the Difficulty_System
5. WHEN a Pipe_Pair scrolls completely off the left edge of the Game_Canvas, THE Game_Loop SHALL remove the Pipe_Pair from memory
6. EACH pipe SHALL display a Pipe_Cap (a wider, darker green rim) at its opening end

### Requirement 4: Collision Detection

**User Story:** As a player, I want the game to detect when my ghost hits an obstacle, so that the game ends appropriately.

#### Acceptance Criteria

1. WHEN the Ghost Hitbox overlaps with any pipe body or Pipe_Cap, THE Game_Loop SHALL trigger a game over state
2. WHEN the Ghost reaches the top of the Game_Canvas, THE Game_Loop SHALL stop upward movement and set vertical velocity to zero
3. WHEN the Ghost contacts the ground (top of the Score_Bar area), THE Game_Loop SHALL trigger a game over state
4. THE Hitbox SHALL be slightly smaller than the Ghost visual bounds to provide a forgiving feel

### Requirement 5: Scoring System

**User Story:** As a player, I want to earn points by passing through pipes, so that I can track my performance.

#### Acceptance Criteria

1. WHEN the Ghost passes completely beyond a Pipe_Pair horizontally, THE Score_Bar SHALL increment the current score by one
2. THE Score_Bar SHALL display the current score during gameplay as white text centered at the top of the Game_Canvas
3. THE Score_Bar SHALL display both the current score and the High_Score in the dark footer area in the format "Score: N | High: N"
4. WHEN the current score exceeds the stored High_Score, THE Game_Loop SHALL update the High_Score value

### Requirement 6: High Score Persistence

**User Story:** As a player, I want my high score saved between sessions, so that I can track my best performance over time.

#### Acceptance Criteria

1. WHEN a game over occurs and the current score is higher than the stored High_Score, THE Game_Loop SHALL persist the new High_Score to browser local storage
2. WHEN the game loads, THE Game_Loop SHALL retrieve the previously stored High_Score from local storage
3. IF local storage is unavailable or empty, THEN THE Game_Loop SHALL default the High_Score to zero

### Requirement 7: Game States

**User Story:** As a player, I want clear game states (ready, playing, game over), so that I understand what is happening and what actions to take.

#### Acceptance Criteria

1. WHEN the game first loads, THE Game_Canvas SHALL display a "ready" screen showing the game title, the Ghost hovering with a gentle animation, and instructions to tap or press Space
2. WHEN the player provides input on the ready screen, THE Game_Loop SHALL transition to the playing state and apply the first flap
3. WHEN a collision occurs, THE Game_Loop SHALL transition to the game over state
4. WHILE in the game over state, THE Game_Canvas SHALL display a semi-transparent overlay with the text "Game Over", the final score, the High_Score, and a prompt to restart
5. WHEN the player provides input during the game over state, THE Game_Loop SHALL reset all game objects and transition to the ready state

### Requirement 8: Visual Style

**User Story:** As a player, I want the game to have a retro, hand-drawn visual style, so that the experience feels charming and distinct.

#### Acceptance Criteria

1. THE Game_Canvas SHALL render pipes in a bright green color (#73bf2e) with a darker green border (#558b2f)
2. THE Game_Canvas SHALL render Pipe_Caps that extend 4 pixels wider than the pipe body on each side
3. THE Game_Canvas SHALL render between 3 and 5 white clouds at varying opacity levels (ranging from 0.2 to 0.6) that scroll from right to left, wrapping to the right edge when they exit the left edge
4. THE Game_Canvas SHALL assign each cloud a different scroll speed (ranging from 0.2 to 1.0 pixels per frame) where lower-opacity clouds move slower to simulate distance and higher-opacity clouds move faster to simulate proximity, creating a parallax perspective effect
5. THE Ghost SHALL be rendered as a white semi-transparent character with a rounded top, wavy bottom edge, dark eyes with white highlights, and a glow effect
6. THE Score_Bar (ground area) SHALL be rendered as a dark bar (#5a5a6e) with a darker top edge and textured stripes

### Requirement 9: Difficulty Progression

**User Story:** As a player, I want the game to get harder as my score increases, so that the experience remains challenging.

#### Acceptance Criteria

1. WHEN the score increases, THE Difficulty_System SHALL increase the pipe scrolling speed up to a defined maximum
2. WHEN the score increases, THE Difficulty_System SHALL decrease the Gap size between pipes down to a defined minimum
3. WHEN the score increases, THE Difficulty_System SHALL decrease the interval between Pipe_Pair spawns down to a defined minimum
4. THE Difficulty_System SHALL apply changes in discrete steps based on every 5 points scored

### Requirement 10: Game Over Effects

**User Story:** As a player, I want visual feedback when the game ends, so that the collision feels impactful.

#### Acceptance Criteria

1. WHEN a game over occurs, THE Game_Canvas SHALL display a brief white flash overlay that fades out
2. WHEN a game over occurs, THE Game_Canvas SHALL apply a screen shake effect that decays over approximately 15 frames

### Requirement 11: Score Checkpoint Rewards

**User Story:** As a player, I want to see a celebratory pizza reward every 5 points, so that I feel motivated to keep playing and reaching new milestones.

#### Acceptance Criteria

1. WHEN the current score reaches a Score_Checkpoint (every 5 points), THE Game_Canvas SHALL display a pizza emoji (🍕) as a Reward_Animation
2. THE Reward_Animation SHALL appear centered on the Game_Canvas above the Ghost for approximately 1.5 seconds
3. THE Reward_Animation SHALL scale up from 0 to full size and then fade out to create a celebratory bounce effect
4. WHILE the Reward_Animation is playing, THE Game_Loop SHALL continue running without interruption
5. THE Reward_Animation SHALL not obscure the Ghost or pipes in a way that causes unfair collisions
