// Flappy Kiro — Game Engine
(function () {
    'use strict';

    // ---------- CONFIGURATION ----------
    // Config functions are loaded from src/config.js (FlappyConfig global)
    var FlappyConfig = window.FlappyConfig;
    var DEFAULT_CONFIG = FlappyConfig.DEFAULT_CONFIG;
    var validateConfig = FlappyConfig.validateConfig;
    var loadConfig = FlappyConfig.loadConfig;

    // Pure logic functions from src/logic.js (FlappyLogic global)
    var Logic = window.FlappyLogic;

    // ---------- RUNTIME CONSTANTS (derived from config after load) ----------
    let W, H, GROUND_H, PIPE_WIDTH, PIPE_CAP_H, PIPE_CAP_EXTEND, HITBOX_INSET;
    const MAX_FRAME_DT = 0.05;

    // Active config reference for difficultyFor and other config-driven logic
    let activeConfig = DEFAULT_CONFIG;

    // Physics parameters (per-second units, from config)
    let gravity, jumpVelocity, maxVelocity;

    function applyConfig(config) {
        activeConfig = config;
        W = config.canvas.width;
        H = config.canvas.height;
        GROUND_H = config.canvas.groundHeight;
        PIPE_WIDTH = config.walls.width;
        PIPE_CAP_H = config.walls.capHeight;
        PIPE_CAP_EXTEND = config.walls.capExtend;
        HITBOX_INSET = config.hitboxInset;
        gravity = config.physics.gravity;
        jumpVelocity = config.physics.jumpVelocity;
        maxVelocity = config.physics.maxVelocity;
        // Invalidate cached gradient when dimensions change
        bgGradient = null;
    }

    // Cached background gradient (invalidated on config/canvas change)
    let bgGradient = null;

    // Apply defaults synchronously so canvas setup works immediately
    applyConfig(DEFAULT_CONFIG);

    // ---------- AUDIO SYSTEM ----------
    // Create three separate preloaded Audio elements so sounds play independently/concurrently
    const flapSound = new Audio('assets/jump.wav');
    flapSound.preload = 'auto';
    flapSound.load();

    const scoreSound = new Audio('assets/score.wav');
    scoreSound.preload = 'auto';
    scoreSound.load();

    const collisionSound = new Audio('assets/game_over.wav');
    collisionSound.preload = 'auto';
    collisionSound.load();

    // Resets currentTime so rapid re-triggers restart from the beginning,
    // wraps play() promise in .catch(() => {}) for autoplay-block and missing file safety
    function playSound(audioElement) {
        audioElement.currentTime = 0;
        audioElement.play().catch(function () {});
    }

    // ---------- GHOST SPRITE ----------
    const ghostImg = new Image();
    ghostImg.src = 'assets/ghosty.png';
    let ghostImgLoaded = false;
    ghostImg.onload = function () { ghostImgLoaded = true; };

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // ---------- CANVAS SIZING ----------
    // Scale canvas to fill viewport while maintaining 2:3 aspect ratio
    // Game logic stays in 400x600 coordinate space via ctx.scale()
    function resizeCanvas() {
        var targetW = window.innerWidth;
        var targetH = window.innerHeight;
        var scale;

        // Fit 2:3 aspect ratio within the viewport
        if (targetW / targetH < 2 / 3) {
            // Width-constrained
            scale = targetW / 400;
        } else {
            // Height-constrained
            scale = targetH / 600;
        }

        var displayW = Math.floor(400 * scale);
        var displayH = Math.floor(600 * scale);

        canvas.width = displayW;
        canvas.height = displayH;
        canvas.style.width = displayW + 'px';
        canvas.style.height = displayH + 'px';

        // Scale context so all drawing uses 400x600 coordinates
        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        // Invalidate cached gradient since context changed
        bgGradient = null;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ---------- STATES ----------
    const STATE = { READY: 0, PLAYING: 1, DYING: 2, GAME_OVER: 3 };
    let state = STATE.READY;

    // Death animation
    let deathTimer = 0;
    const DEATH_DURATION = 0.8;

    // ---------- BIRD ----------
    const bird = {
        x: 80,
        y: 300, // will be reset after config load
        w: 40,
        h: 40,
        vy: 0,          // px/s (per-second units)
        rotation: 0,
        squish: 0       // animation counter for flap squish
    };

    // Visual render size for the ghost sprite (larger than hitbox for visual appeal)
    const GHOST_RENDER_SIZE = 52;

    // ---------- DIFFICULTY STAGES ----------
    const STAGES = [
        { name: 'day',    minScore: 0,  skyTop: '#87ceeb', skyBottom: '#b8e4f0', wallSpeed: 120, gapSize: 140, wallSpacing: 350, pipeBody: '#73bf2e', pipeBorder: '#558b2f' },
        { name: 'sunset', minScore: 10, skyTop: '#ff7e5f', skyBottom: '#feb47b', wallSpeed: 150, gapSize: 125, wallSpacing: 310, pipeBody: '#e85d04', pipeBorder: '#9d0208' },
        { name: 'dusk',   minScore: 25, skyTop: '#4a0072', skyBottom: '#c31432', wallSpeed: 180, gapSize: 115, wallSpacing: 280, pipeBody: '#6a0572', pipeBorder: '#3c096c' },
        { name: 'night',  minScore: 45, skyTop: '#0f0c29', skyBottom: '#1a1a2e', wallSpeed: 210, gapSize: 105, wallSpacing: 250, pipeBody: '#2d3436', pipeBorder: '#1a1a2e' },
    ];
    let currentStage = STAGES[0];

    function getStageForScore(score) {
        for (var i = STAGES.length - 1; i >= 0; i--) {
            if (score >= STAGES[i].minScore) return STAGES[i];
        }
        return STAGES[0];
    }

    // Smooth difficulty interpolation
    function getDifficulty(score) {
        // Find which two stages we're between
        var stageIdx = 0;
        for (var i = STAGES.length - 1; i >= 0; i--) {
            if (score >= STAGES[i].minScore) { stageIdx = i; break; }
        }
        var current = STAGES[stageIdx];
        var next = STAGES[Math.min(stageIdx + 1, STAGES.length - 1)];

        if (stageIdx >= STAGES.length - 1) {
            return { wallSpeed: current.wallSpeed, gapSize: current.gapSize, wallSpacing: current.wallSpacing };
        }

        // Interpolation factor (0 to 1) within the current stage range
        var rangeStart = current.minScore;
        var rangeEnd = next.minScore;
        var t = Math.min((score - rangeStart) / (rangeEnd - rangeStart), 1);

        return {
            wallSpeed: current.wallSpeed + (next.wallSpeed - current.wallSpeed) * t,
            gapSize: current.gapSize + (next.gapSize - current.gapSize) * t,
            wallSpacing: current.wallSpacing + (next.wallSpacing - current.wallSpacing) * t
        };
    }

    // Stage notification system
    let stageNotification = '';
    let stageNotifyTimer = 0;

    // Generate fixed star positions for night/dusk stages
    const stars = [];
    for (var i = 0; i < 30; i++) {
        stars.push({ x: Math.random() * 400, y: Math.random() * 350, size: 1 + Math.random() * 2 });
    }

    // ---------- PIPES ----------
    let pipes = [];

    // Difficulty-driven values (per-second / px units from difficultyFor)
    let wallSpeed = 120;   // px/s
    let gapSize = 140;     // px
    let wallSpacing = 350; // px

    // ---------- GROUND ----------
    let groundX = 0;
    let groundX2 = 0; // slower parallax layer

    // ---------- CLOUDS ----------
    let clouds = [];
    function initClouds() {
        clouds = Logic.createClouds(Math.random, activeConfig);
    }

    // ---------- SCORING ----------
    let score = 0;
    let highScore = 0;

    // Safe localStorage read
    function loadHighScore() {
        try {
            highScore = Logic.parseHighScore(localStorage.getItem('flappyKiroHigh'));
        } catch (e) {
            highScore = 0;
        }
    }

    // Safe localStorage write
    function saveHighScore() {
        try {
            localStorage.setItem('flappyKiroHigh', highScore);
        } catch (e) {
            // silently continue
        }
    }

    loadHighScore();

    // ---------- POWER-UP SYSTEM ----------
    let powerUp = null; // { x, y, size, type, emoji } or null when not active
    let powerUpCounter = 0;
    let nextPowerUpAt = 8 + Math.floor(Math.random() * 5);
    let shieldActive = false;
    let invincibleTimer = 0; // brief invincibility after shield breaks
    const INVINCIBLE_AFTER_SHIELD = 0.5; // 0.5 seconds of invincibility
    let activeEffect = null; // { type, timeLeft } for timed effects
    const POWERUP_SIZE = 28;
    const POWERUP_TYPES = [
        { type: 'shield', emoji: '\u{1F355}', weight: 3 },  // pizza - 1 hit immunity
        { type: 'slowmo', emoji: '\u{1F9CA}', weight: 2 },  // ice - slow pipes 3s
        { type: 'shrink', emoji: '\u2B50', weight: 2 },      // star - tiny hitbox 4s
    ];
    const SLOWMO_DURATION = 3;
    const SHRINK_DURATION = 4;

    function pickPowerUpType() {
        var totalWeight = 0;
        for (var i = 0; i < POWERUP_TYPES.length; i++) totalWeight += POWERUP_TYPES[i].weight;
        var r = Math.random() * totalWeight;
        for (var i = 0; i < POWERUP_TYPES.length; i++) {
            r -= POWERUP_TYPES[i].weight;
            if (r <= 0) return POWERUP_TYPES[i];
        }
        return POWERUP_TYPES[0];
    }

    // ---------- GHOST TRAIL ----------
    const TRAIL_LENGTH = 3;
    let trail = []; // [{x, y, rotation}]

    // ---------- SCORE POP ----------
    let scorePop = 0; // decays from 1 to 0

    // ---------- INPUT BUFFERING ----------
    let inputQueued = false;
    let inputQueueTimer = 0;
    const INPUT_BUFFER_TIME = 0.15; // 150ms buffer window

    // ---------- EFFECTS ----------
    let shakeTimer = 0;
    let flashAlpha = 0;

    // ---------- INPUT ----------
    function onInput(e) {
        e.preventDefault();
        switch (state) {
            case STATE.READY:
                startGame();
                break;
            case STATE.PLAYING:
                flap();
                break;
            case STATE.DYING:
                inputQueued = true;
                inputQueueTimer = INPUT_BUFFER_TIME;
                break;
            case STATE.GAME_OVER:
                resetGame();
                break;
        }
    }

    canvas.addEventListener('click', onInput);
    canvas.addEventListener('touchstart', onInput, { passive: false });
    document.addEventListener('keydown', function (e) {
        if (e.code === 'Space' || e.key === ' ') {
            onInput(e);
        }
    });

    // ---------- GAME ACTIONS ----------
    function startGame() {
        state = STATE.PLAYING;
        bird.vy = Logic.flapVelocity(jumpVelocity);
        bird.squish = 8;
        playSound(flapSound);
    }

    function flap() {
        bird.vy = Logic.flapVelocity(jumpVelocity);
        bird.squish = 8;
        playSound(flapSound);
    }

    function resetGame() {
        state = STATE.READY;
        bird.y = H / 2;
        bird.vy = 0;
        bird.rotation = 0;
        bird.squish = 0;
        pipes = [];
        score = 0;
        // Reset stage to day
        currentStage = STAGES[0];
        bgGradient = null;
        wallSpeed = STAGES[0].wallSpeed;
        gapSize = STAGES[0].gapSize;
        wallSpacing = STAGES[0].wallSpacing;
        // Reset stage notification
        stageNotification = '';
        stageNotifyTimer = 0;
        shakeTimer = 0;
        flashAlpha = 0;
        powerUp = null;
        powerUpCounter = 0;
        shieldActive = false;
        invincibleTimer = 0;
        activeEffect = null;
        // Reset new systems
        inputQueued = false;
        inputQueueTimer = 0;
        deathTimer = 0;
        trail = [];
        scorePop = 0;
        groundX2 = 0;
    }

    function gameOver() {
        state = STATE.DYING;
        deathTimer = DEATH_DURATION;
        bird.vy = -200; // pop upward first
        playSound(collisionSound);
    }

    function showGameOver() {
        state = STATE.GAME_OVER;
        shakeTimer = 15;
        flashAlpha = 0.6;
        highScore = Logic.nextHighScore(highScore, score);
        saveHighScore();
    }

    // ---------- PIPE SPAWNING ----------
    function spawnPipe() {
        var gapCenter = Logic.computeGapCenter(gapSize, H, GROUND_H, PIPE_CAP_H, Math.random());
        var hasPowerUp = false;

        // Spawn power-up roughly every N pipes (after score >= 3)
        // Spawn timing tied to difficulty (more often in harder stages)
        if (!powerUp && !shieldActive && !activeEffect && score >= 3) {
            powerUpCounter++;
            if (powerUpCounter >= nextPowerUpAt) {
                hasPowerUp = true;
                powerUpCounter = 0;
                var stageIdx = STAGES.indexOf(currentStage);
                var baseInterval = 10 - stageIdx * 2; // day=10, sunset=8, dusk=6, night=4
                nextPowerUpAt = Math.max(3, baseInterval + Math.floor(Math.random() * 3));
            }
        }

        pipes.push({
            x: W,
            gapCenter: gapCenter,
            scored: false
        });

        // Place power-up exactly in the pipe gap center
        if (hasPowerUp) {
            var pType = pickPowerUpType();
            powerUp = { x: W + PIPE_WIDTH / 2, y: gapCenter, size: POWERUP_SIZE, type: pType.type, emoji: pType.emoji };
        }
    }

    // ---------- UPDATE ----------
    function update(dt) {
        // Input buffer decay
        if (inputQueued) {
            inputQueueTimer -= dt;
            if (inputQueueTimer <= 0) inputQueued = false;
        }
        // Consume buffered input when entering GAME_OVER
        if (state === STATE.GAME_OVER && inputQueued) {
            inputQueued = false;
            resetGame();
            return;
        }

        // DYING state — death animation
        if (state === STATE.DYING) {
            deathTimer -= dt;
            bird.vy += 1200 * dt; // fast gravity during death
            bird.y += bird.vy * dt;
            bird.rotation += 8 * dt; // spin
            if (deathTimer <= 0 || bird.y > H + 50) {
                showGameOver();
            }
            return;
        }

        if (state !== STATE.PLAYING) {
            // Animate bird hovering on ready screen
            if (state === STATE.READY) {
                bird.y = H / 2 + Math.sin(Date.now() * 0.004) * 10;
            }
            // Decay effects
            if (shakeTimer > 0) shakeTimer--;
            if (flashAlpha > 0) flashAlpha -= 0.03;
            return;
        }

        // Ghost trail — record position at the start of bird physics
        trail.push({ x: bird.x, y: bird.y, rotation: bird.rotation });
        if (trail.length > TRAIL_LENGTH) trail.shift();

        // Bird physics (per-second units integrated with dt)
        bird.vy = Logic.applyGravity(bird.vy, gravity, maxVelocity, dt);
        bird.y = Logic.integratePosition(bird.y, bird.vy, dt);

        // Rotation based on velocity (scaled for per-second vy)
        bird.rotation = Math.min(Math.max(bird.vy * 0.003, -0.5), Math.PI / 2 * 0.8);

        // Squish decay
        if (bird.squish > 0) bird.squish--;

        // Score pop decay
        if (scorePop > 0) scorePop = Math.max(0, scorePop - dt * 4);

        // Pipe spawning — distance-based
        if (pipes.length === 0) {
            spawnPipe();
        } else {
            var lastPipe = pipes[pipes.length - 1];
            if (Logic.shouldSpawn(lastPipe.x, W, wallSpacing)) {
                spawnPipe();
            }
        }

        // Compute effective speed once (slow-mo affects movement)
        var effectiveSpeed = wallSpeed;
        if (activeEffect && activeEffect.type === 'slowmo') effectiveSpeed *= 0.5;

        // Pipe movement and scoring
        for (let i = pipes.length - 1; i >= 0; i--) {
            var p = pipes[i];
            p.x -= effectiveSpeed * dt;

            // Scoring
            if (Logic.shouldScore(p, bird.x, PIPE_WIDTH)) {
                var result = Logic.applyScore(p, score);
                pipes[i] = result.pipe;
                p = pipes[i];
                score = result.score;
                scorePop = 1;
                playSound(scoreSound);

                // Update difficulty based on stage
                var newStage = getStageForScore(score);
                if (newStage !== currentStage) {
                    currentStage = newStage;
                    stageNotification = currentStage.name.toUpperCase();
                    stageNotifyTimer = 2.0; // show for 2 seconds
                    bgGradient = null;
                }
                // Smooth difficulty interpolation
                var diff = getDifficulty(score);
                wallSpeed = diff.wallSpeed;
                gapSize = diff.gapSize;
                wallSpacing = diff.wallSpacing;
            }

            // Remove off-screen
            if (p.x + PIPE_WIDTH < -10) {
                pipes.splice(i, 1);
            }
        }

        // Ground scroll with dt (using effectiveSpeed)
        groundX -= effectiveSpeed * dt;
        if (groundX <= -24) groundX += 24;

        // Parallax ground layer (60% speed for depth)
        groundX2 -= effectiveSpeed * 0.6 * dt;
        if (groundX2 <= -48) groundX2 += 48;

        // Cloud scroll with dt
        for (let c of clouds) {
            c.x -= c.speed * dt;
            if (c.x + c.w < 0) {
                c.x = W + Math.random() * 40;
                c.y = Math.random() * (H * 0.4);
            }
        }

        // Move power-up with pipes (using effectiveSpeed)
        if (powerUp) {
            powerUp.x -= effectiveSpeed * dt;

            // Check collection
            var dx = bird.x - powerUp.x;
            var dy = bird.y - powerUp.y;
            if (Math.abs(dx) < 28 && Math.abs(dy) < 28) {
                if (powerUp.type === 'shield') {
                    shieldActive = true;
                } else if (powerUp.type === 'slowmo') {
                    activeEffect = { type: 'slowmo', timeLeft: SLOWMO_DURATION };
                } else if (powerUp.type === 'shrink') {
                    activeEffect = { type: 'shrink', timeLeft: SHRINK_DURATION };
                }
                powerUp = null;
                playSound(scoreSound);
            }

            // Remove if off-screen
            if (powerUp && powerUp.x < -40) {
                powerUp = null;
            }
        }

        // Active effect countdown
        if (activeEffect) {
            activeEffect.timeLeft -= dt;
            if (activeEffect.timeLeft <= 0) {
                activeEffect = null;
            }
        }

        // Invincibility timer countdown
        if (invincibleTimer > 0) invincibleTimer -= dt;

        // Update stage notification timer
        if (stageNotifyTimer > 0) stageNotifyTimer -= dt;

        // Collision detection
        checkCollisions();
    }

    // ---------- COLLISION ----------
    function checkCollisions() {
        // Ground
        if (bird.y + bird.h / 2 >= H - GROUND_H) {
            bird.y = H - GROUND_H - bird.h / 2;
            gameOver();
            return;
        }
        // Ceiling
        if (bird.y - bird.h / 2 <= 0) {
            bird.y = bird.h / 2;
            bird.vy = 0;
        }

        // Pipes (AABB with forgiving hitbox inset)
        var shrinkFactor = (activeEffect && activeEffect.type === 'shrink') ? 0.5 : 1;
        var hitbox = Logic.computeHitbox(bird.x, bird.y, bird.w * shrinkFactor, bird.h * shrinkFactor, HITBOX_INSET);

        for (const p of pipes) {
            var topPipeBottom = p.gapCenter - gapSize / 2;
            var bottomPipeTop = p.gapCenter + gapSize / 2;

            // Top pipe rect
            if (Logic.aabb(hitbox.x, hitbox.y, hitbox.w, hitbox.h, p.x, 0, PIPE_WIDTH, topPipeBottom)) {
                if (shieldActive || invincibleTimer > 0) {
                    if (shieldActive) {
                        shieldActive = false;
                        invincibleTimer = INVINCIBLE_AFTER_SHIELD;
                    }
                } else {
                    gameOver();
                    return;
                }
            }
            // Bottom pipe rect
            if (Logic.aabb(hitbox.x, hitbox.y, hitbox.w, hitbox.h, p.x, bottomPipeTop, PIPE_WIDTH, H - GROUND_H - bottomPipeTop)) {
                if (shieldActive || invincibleTimer > 0) {
                    if (shieldActive) {
                        shieldActive = false;
                        invincibleTimer = INVINCIBLE_AFTER_SHIELD;
                    }
                } else {
                    gameOver();
                    return;
                }
            }
        }
    }

    // ---------- RENDER ----------
    function render() {
        // Reset to base scale transform (clears any leftover state)
        var scale = canvas.width / 400;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        // Screen shake
        if (shakeTimer > 0) {
            var sx = (Math.random() - 0.5) * shakeTimer * 0.8;
            var sy = (Math.random() - 0.5) * shakeTimer * 0.8;
            ctx.translate(sx, sy);
        }

        drawBackground();
        drawClouds();
        drawPipes();
        drawPowerUp();
        drawGround();

        // Ghost trail (drawn before bird for afterimage effect)
        for (var i = 0; i < trail.length; i++) {
            var t = trail[i];
            var alpha = (i + 1) / (TRAIL_LENGTH + 1) * 0.25;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(t.x, t.y);
            ctx.rotate(t.rotation);
            if (ghostImgLoaded) {
                ctx.drawImage(ghostImg, -GHOST_RENDER_SIZE / 2, -GHOST_RENDER_SIZE / 2, GHOST_RENDER_SIZE, GHOST_RENDER_SIZE);
            }
            ctx.restore();
        }

        drawBird();
        drawUI();

        // Flash overlay (reset transform for full-canvas coverage)
        if (flashAlpha > 0) {
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.fillStyle = 'rgba(255, 255, 255, ' + flashAlpha + ')';
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ---------- DRAW HELPERS ----------
    function drawBackground() {
        if (!bgGradient) {
            bgGradient = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
            bgGradient.addColorStop(0, currentStage.skyTop);
            bgGradient.addColorStop(1, currentStage.skyBottom);
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, W, H - GROUND_H);

        // Draw stars in darker stages
        if (currentStage.name === 'night' || currentStage.name === 'dusk') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            for (var i = 0; i < stars.length; i++) {
                ctx.fillRect(stars[i].x, stars[i].y, stars[i].size, stars[i].size);
            }
        }
    }

    function drawClouds() {
        for (const c of clouds) {
            ctx.fillStyle = 'rgba(255, 255, 255, ' + c.opacity + ')';
            ctx.beginPath();
            ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPipes() {
        for (const p of pipes) {
            const topH = p.gapCenter - gapSize / 2;
            const bottomY = p.gapCenter + gapSize / 2;
            const bottomH = H - GROUND_H - bottomY;

            // Top pipe body
            ctx.fillStyle = currentStage.pipeBody;
            ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);
            // Top pipe border
            ctx.strokeStyle = currentStage.pipeBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, 0, PIPE_WIDTH, topH);
            // Top pipe cap
            ctx.fillStyle = currentStage.pipeBody;
            ctx.fillRect(p.x - PIPE_CAP_EXTEND, topH - PIPE_CAP_H, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            ctx.strokeStyle = currentStage.pipeBorder;
            ctx.strokeRect(p.x - PIPE_CAP_EXTEND, topH - PIPE_CAP_H, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(p.x + 6, 0, 8, topH - PIPE_CAP_H);

            // Bottom pipe body
            ctx.fillStyle = currentStage.pipeBody;
            ctx.fillRect(p.x, bottomY, PIPE_WIDTH, bottomH);
            ctx.strokeStyle = currentStage.pipeBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, bottomY, PIPE_WIDTH, bottomH);
            // Bottom pipe cap
            ctx.fillStyle = currentStage.pipeBody;
            ctx.fillRect(p.x - PIPE_CAP_EXTEND, bottomY, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            ctx.strokeStyle = currentStage.pipeBorder;
            ctx.strokeRect(p.x - PIPE_CAP_EXTEND, bottomY, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(p.x + 6, bottomY + PIPE_CAP_H, 8, bottomH - PIPE_CAP_H);
        }
    }

    function drawGround() {
        // Parallax back layer (darker, scrolls slower)
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(0, H - GROUND_H - 8, W, 12);
        ctx.strokeStyle = '#3d3d4d';
        ctx.lineWidth = 1;
        for (let i = 0; i < W + 48; i += 48) {
            var x2 = groundX2 + i;
            ctx.beginPath();
            ctx.moveTo(x2, H - GROUND_H - 8);
            ctx.lineTo(x2 + 24, H - GROUND_H + 4);
            ctx.stroke();
        }

        // Ground fill
        ctx.fillStyle = '#5a5a6e';
        ctx.fillRect(0, H - GROUND_H, W, GROUND_H);

        // Ground top edge
        ctx.fillStyle = '#3d3d4d';
        ctx.fillRect(0, H - GROUND_H, W, 4);

        // Ground texture stripes
        ctx.strokeStyle = '#4a4a5a';
        ctx.lineWidth = 1;
        for (let i = 0; i < W + 24; i += 24) {
            const x = groundX + i;
            ctx.beginPath();
            ctx.moveTo(x, H - GROUND_H + 15);
            ctx.lineTo(x + 12, H - GROUND_H + GROUND_H);
            ctx.stroke();
        }

        // Score bar text in the dark footer: "Score: N | High: N"
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Score: ' + score + ' | High: ' + highScore, W / 2, H - GROUND_H / 2);
    }

    function drawBird() {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rotation);

        // Blink during invincibility frames
        if (invincibleTimer > 0) {
            if (Math.floor(Date.now() / 80) % 2 === 0) {
                ctx.globalAlpha = 0.3;
            }
        }

        // Squish effect
        let sx = 1, sy = 1;
        if (bird.squish > 0) {
            sx = 1 + bird.squish * 0.02;
            sy = 1 - bird.squish * 0.02;
        }
        ctx.scale(sx, sy);

        // Shrink visual when shrink effect is active
        if (activeEffect && activeEffect.type === 'shrink') {
            ctx.scale(0.7, 0.7);
        }

        if (ghostImgLoaded) {
            ctx.drawImage(ghostImg, -GHOST_RENDER_SIZE / 2, -GHOST_RENDER_SIZE / 2, GHOST_RENDER_SIZE, GHOST_RENDER_SIZE);
        } else {
            // Fallback procedural ghost - no shadowBlur for performance
            var fallbackScale = GHOST_RENDER_SIZE / 34;
            ctx.scale(fallbackScale, fallbackScale);

            ctx.fillStyle = '#e8f4f8';
            ctx.beginPath();
            ctx.ellipse(0, -4, 15, 14, 0, Math.PI, 0);
            ctx.lineTo(15, 10);
            ctx.quadraticCurveTo(12, 5, 9, 10);
            ctx.quadraticCurveTo(6, 15, 3, 10);
            ctx.quadraticCurveTo(0, 5, -3, 10);
            ctx.quadraticCurveTo(-6, 15, -9, 10);
            ctx.quadraticCurveTo(-12, 5, -15, 10);
            ctx.closePath();
            ctx.fill();

            // Eyes
            ctx.fillStyle = '#2d2d2d';
            ctx.beginPath();
            ctx.arc(-5, -4, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(5, -4, 3, 0, Math.PI * 2);
            ctx.fill();

            // Eye highlights
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-4, -5, 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(6, -5, 1.2, 0, Math.PI * 2);
            ctx.fill();

            // Mouth
            ctx.fillStyle = '#2d2d2d';
            ctx.beginPath();
            ctx.ellipse(0, 3, 2.5, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Shield indicator
        if (shieldActive) {
            ctx.strokeStyle = 'rgba(0, 200, 255, ' + (0.4 + Math.sin(Date.now() * 0.01) * 0.3) + ')';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, GHOST_RENDER_SIZE / 2 + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawUI() {
        if (state === STATE.PLAYING || state === STATE.DYING || state === STATE.GAME_OVER) {
            // Score with pop animation
            var popScale = 1 + scorePop * 0.3;
            var fontSize = Math.floor(36 * popScale);
            ctx.font = 'bold ' + fontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000000';
            ctx.fillText(score, W / 2 + 2, 52);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(score, W / 2, 50);
        }

        // Power-up effect timer bar
        if (state === STATE.PLAYING && activeEffect) {
            var maxDuration = activeEffect.type === 'slowmo' ? SLOWMO_DURATION : SHRINK_DURATION;
            var progress = activeEffect.timeLeft / maxDuration; // 1 to 0
            var barWidth = 80;
            var barHeight = 6;
            var barX = W / 2 - barWidth / 2;
            var barY = 68;

            // Background bar (dark)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Progress fill (colored based on type)
            var barColor = activeEffect.type === 'slowmo' ? '#00BFFF' : '#FFD700';
            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barWidth * progress, barHeight);

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Emoji icon to the left of the bar
            var emoji = activeEffect.type === 'slowmo' ? '\u{1F9CA}' : '\u2B50';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, barX - 4, barY + barHeight / 2);
        }

        // Shield indicator in UI (no timer — lasts until hit)
        if (state === STATE.PLAYING && shieldActive) {
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('\u{1F355} SHIELD', W / 2, 78);
        }

        // Stage notification
        if (state === STATE.PLAYING && stageNotifyTimer > 0) {
            ctx.globalAlpha = Math.min(stageNotifyTimer, 1);
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(stageNotification, W / 2, H / 2 - 80);
            ctx.globalAlpha = 1;
        }

        if (state === STATE.READY) {
            // Title
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000000';
            ctx.fillText('Flappy Kiro', W / 2 + 2, 152);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Flappy Kiro', W / 2, 150);

            // Subtitle
            ctx.font = '18px sans-serif';
            ctx.fillStyle = '#000000';
            ctx.fillText('Tap or press Space to start', W / 2 + 1, 201);
            ctx.fillStyle = '#f0f0f0';
            ctx.fillText('Tap or press Space to start', W / 2, 200);

            // High score
            if (highScore > 0) {
                ctx.font = '16px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('High Score: ' + highScore, W / 2, 240);
            }
        }

        if (state === STATE.GAME_OVER) {
            // Overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(0, 0, W, H);

            // Game Over text
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000000';
            ctx.fillText('Game Over', W / 2 + 2, H / 2 - 38);
            ctx.fillStyle = '#ff6b6b';
            ctx.fillText('Game Over', W / 2, H / 2 - 40);

            // Score
            ctx.font = '24px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Score: ' + score, W / 2, H / 2 + 10);

            // High score
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('Best: ' + highScore, W / 2, H / 2 + 45);

            // Restart prompt
            ctx.font = '16px sans-serif';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Tap or press Space to restart', W / 2, H / 2 + 90);
        }
    }

    function drawPowerUp() {
        if (!powerUp) return;

        // Telegraph: pulsing indicator on right edge when power-up hasn't entered yet
        if (powerUp.x > W - 20) {
            var pulse = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
            ctx.globalAlpha = pulse;
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(powerUp.emoji, W - 12, powerUp.y);
            ctx.globalAlpha = 1;
            return;
        }

        ctx.font = POWERUP_SIZE + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Gentle bobbing animation
        var bob = Math.sin(Date.now() * 0.005) * 4;
        ctx.fillText(powerUp.emoji, powerUp.x, powerUp.y + bob);
    }

    // ---------- GAME LOOP ----------
    let lastTime = 0;

    function gameLoop(timestamp) {
        // First frame: seed lastTime so initial dt is ~0
        if (!lastTime) lastTime = timestamp;
        let dt = (timestamp - lastTime) / 1000; // seconds elapsed
        lastTime = timestamp;
        // Clamp dt to avoid large jumps after tab switches / stalls
        dt = Math.min(dt, MAX_FRAME_DT);

        update(dt);
        render();
        requestAnimationFrame(gameLoop);
    }

    // ---------- STARTUP ----------
    // Start — load config first, then begin game loop
    loadConfig().then(function (config) {
        applyConfig(config);
        // Set initial bird position from config dimensions
        bird.y = H / 2;
        // Set initial difficulty from stage 0
        currentStage = STAGES[0];
        wallSpeed = currentStage.wallSpeed;
        gapSize = currentStage.gapSize;
        wallSpacing = currentStage.wallSpacing;
        // Initialize clouds using the logic module
        initClouds();
        requestAnimationFrame(gameLoop);
    });
})();
