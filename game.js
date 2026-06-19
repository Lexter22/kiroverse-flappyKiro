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
    let REWARD_DURATION, CHECKPOINT_INTERVAL;
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
        REWARD_DURATION = config.reward.durationSeconds;
        CHECKPOINT_INTERVAL = config.reward.checkpointInterval;
        gravity = config.physics.gravity;
        jumpVelocity = config.physics.jumpVelocity;
        maxVelocity = config.physics.maxVelocity;
    }

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

    // ---------- STATES ----------
    const STATE = { READY: 0, PLAYING: 1, GAME_OVER: 2 };
    let state = STATE.READY;

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

    // ---------- PIPES ----------
    let pipes = [];

    // Difficulty-driven values (per-second / px units from difficultyFor)
    let wallSpeed = 120;   // px/s
    let gapSize = 140;     // px
    let wallSpacing = 350; // px

    // ---------- GROUND ----------
    let groundX = 0;

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

    // ---------- REWARD ANIMATION ----------
    const reward = {
        active: false,      // Whether animation is currently playing
        timeLeft: 0,        // Seconds remaining (1.5 = full duration)
        scale: 0,           // Current scale factor (0 → 1)
        alpha: 1            // Current opacity (1 → 0)
    };

    function triggerReward() {
        reward.active = true;
        reward.timeLeft = REWARD_DURATION;
        reward.scale = 0;
        reward.alpha = 1;
    }

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
        // Reset difficulty to initial values
        var diff = Logic.difficultyFor(0, activeConfig);
        wallSpeed = diff.wallSpeed;
        gapSize = diff.gapSize;
        wallSpacing = diff.wallSpacing;
        shakeTimer = 0;
        flashAlpha = 0;
        reward.active = false;
        reward.timeLeft = 0;
        reward.scale = 0;
        reward.alpha = 0;
    }

    function gameOver() {
        state = STATE.GAME_OVER;
        shakeTimer = 15;
        flashAlpha = 0.6;
        playSound(collisionSound);
        highScore = Logic.nextHighScore(highScore, score);
        saveHighScore();
    }

    // ---------- PIPE SPAWNING ----------
    function spawnPipe() {
        var gapCenter = Logic.computeGapCenter(gapSize, H, GROUND_H, PIPE_CAP_H, Math.random());
        pipes.push({
            x: W,
            gapCenter: gapCenter,
            scored: false
        });
    }

    // ---------- UPDATE ----------
    function update(dt) {
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

        // Bird physics (per-second units integrated with dt)
        bird.vy = Logic.applyGravity(bird.vy, gravity, maxVelocity, dt);
        bird.y = Logic.integratePosition(bird.y, bird.vy, dt);

        // Rotation based on velocity (scaled for per-second vy)
        bird.rotation = Math.min(Math.max(bird.vy * 0.003, -0.5), Math.PI / 2 * 0.8);

        // Squish decay
        if (bird.squish > 0) bird.squish--;

        // Pipe spawning — distance-based
        if (pipes.length === 0) {
            spawnPipe();
        } else {
            var lastPipe = pipes[pipes.length - 1];
            if (Logic.shouldSpawn(lastPipe.x, W, wallSpacing)) {
                spawnPipe();
            }
        }

        // Pipe movement and scoring
        for (let i = pipes.length - 1; i >= 0; i--) {
            var p = pipes[i];
            p.x -= wallSpeed * dt;

            // Scoring
            if (Logic.shouldScore(p, bird.x, PIPE_WIDTH)) {
                var result = Logic.applyScore(p, score);
                pipes[i] = result.pipe;
                p = pipes[i];
                score = result.score;
                playSound(scoreSound);

                // Update difficulty
                var diff = Logic.difficultyFor(score, activeConfig);
                wallSpeed = diff.wallSpeed;
                gapSize = diff.gapSize;
                wallSpacing = diff.wallSpacing;

                // Trigger reward at checkpoints
                if (Logic.isCheckpoint(score, CHECKPOINT_INTERVAL)) {
                    triggerReward();
                }
            }

            // Remove off-screen
            if (p.x + PIPE_WIDTH < -10) {
                pipes.splice(i, 1);
            }
        }

        // Ground scroll with dt
        groundX -= wallSpeed * dt;
        if (groundX <= -24) groundX += 24;

        // Cloud scroll with dt
        for (let c of clouds) {
            c.x -= c.speed * dt;
            if (c.x + c.w < 0) {
                c.x = W + Math.random() * 40;
                c.y = Math.random() * (H * 0.4);
            }
        }

        // Update reward animation
        if (reward.active) {
            reward.timeLeft -= dt;
            if (reward.timeLeft <= 0) {
                reward.active = false;
                reward.timeLeft = 0;
                reward.scale = 0;
                reward.alpha = 0;
            } else {
                // Progress from 0 to 1 over the duration
                var progress = 1 - (reward.timeLeft / REWARD_DURATION);
                // Scale: quick scale-up in the first 30% of duration, then hold at 1
                if (progress < 0.3) {
                    reward.scale = progress / 0.3;
                } else {
                    reward.scale = 1;
                }
                // Alpha: fade from 1 to 0 over the full duration
                reward.alpha = 1 - progress;
            }
        }

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
        var hitbox = Logic.computeHitbox(bird.x, bird.y, bird.w, bird.h, HITBOX_INSET);

        for (const p of pipes) {
            var topPipeBottom = p.gapCenter - gapSize / 2;
            var bottomPipeTop = p.gapCenter + gapSize / 2;

            // Top pipe rect
            if (Logic.aabb(hitbox.x, hitbox.y, hitbox.w, hitbox.h, p.x, 0, PIPE_WIDTH, topPipeBottom)) {
                gameOver();
                return;
            }
            // Bottom pipe rect
            if (Logic.aabb(hitbox.x, hitbox.y, hitbox.w, hitbox.h, p.x, bottomPipeTop, PIPE_WIDTH, H - GROUND_H - bottomPipeTop)) {
                gameOver();
                return;
            }
        }
    }

    // ---------- RENDER ----------
    function render() {
        ctx.save();

        // Screen shake
        if (shakeTimer > 0) {
            const sx = (Math.random() - 0.5) * shakeTimer * 0.8;
            const sy = (Math.random() - 0.5) * shakeTimer * 0.8;
            ctx.translate(sx, sy);
        }

        drawBackground();
        drawClouds();
        drawPipes();
        drawGround();
        drawBird();
        drawUI();
        drawReward();

        ctx.restore();

        // Flash overlay
        if (flashAlpha > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, ' + flashAlpha + ')';
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ---------- DRAW HELPERS ----------
    function drawBackground() {
        // Gradient sky
        const grad = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
        grad.addColorStop(0, '#87ceeb');
        grad.addColorStop(1, '#b8e4f0');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H - GROUND_H);
    }

    function drawClouds() {
        for (const c of clouds) {
            ctx.fillStyle = 'rgba(255, 255, 255, ' + c.opacity + ')';
            ctx.beginPath();
            ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Extra puff
            ctx.beginPath();
            ctx.ellipse(c.x + c.w * 0.3, c.y + c.h * 0.6, c.w * 0.3, c.h * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x + c.w * 0.7, c.y + c.h * 0.55, c.w * 0.25, c.h * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPipes() {
        for (const p of pipes) {
            const topH = p.gapCenter - gapSize / 2;
            const bottomY = p.gapCenter + gapSize / 2;
            const bottomH = H - GROUND_H - bottomY;

            // Top pipe body
            ctx.fillStyle = '#73bf2e';
            ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);
            // Top pipe border
            ctx.strokeStyle = '#558b2f';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, 0, PIPE_WIDTH, topH);
            // Top pipe cap
            ctx.fillStyle = '#73bf2e';
            ctx.fillRect(p.x - PIPE_CAP_EXTEND, topH - PIPE_CAP_H, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            ctx.strokeStyle = '#558b2f';
            ctx.strokeRect(p.x - PIPE_CAP_EXTEND, topH - PIPE_CAP_H, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(p.x + 6, 0, 8, topH - PIPE_CAP_H);

            // Bottom pipe body
            ctx.fillStyle = '#73bf2e';
            ctx.fillRect(p.x, bottomY, PIPE_WIDTH, bottomH);
            ctx.strokeStyle = '#558b2f';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, bottomY, PIPE_WIDTH, bottomH);
            // Bottom pipe cap
            ctx.fillStyle = '#73bf2e';
            ctx.fillRect(p.x - PIPE_CAP_EXTEND, bottomY, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            ctx.strokeStyle = '#558b2f';
            ctx.strokeRect(p.x - PIPE_CAP_EXTEND, bottomY, PIPE_WIDTH + PIPE_CAP_EXTEND * 2, PIPE_CAP_H);
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(p.x + 6, bottomY + PIPE_CAP_H, 8, bottomH - PIPE_CAP_H);
        }
    }

    function drawGround() {
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

        // Squish effect
        let sx = 1, sy = 1;
        if (bird.squish > 0) {
            sx = 1 + bird.squish * 0.02;
            sy = 1 - bird.squish * 0.02;
        }
        ctx.scale(sx, sy);

        if (ghostImgLoaded) {
            // Draw the ghosty.png sprite centered, with glow effect
            ctx.shadowColor = 'rgba(200, 230, 255, 0.6)';
            ctx.shadowBlur = 14;
            ctx.drawImage(ghostImg, -GHOST_RENDER_SIZE / 2, -GHOST_RENDER_SIZE / 2, GHOST_RENDER_SIZE, GHOST_RENDER_SIZE);
            ctx.shadowBlur = 0;
        } else {
            // Fallback: procedural ghost drawing (scaled up)
            var fallbackScale = GHOST_RENDER_SIZE / 34; // original was designed for ~34px wide
            ctx.scale(fallbackScale, fallbackScale);

            // Ghost glow
            ctx.shadowColor = 'rgba(200, 230, 255, 0.6)';
            ctx.shadowBlur = 12;

            // Body
            ctx.fillStyle = '#e8f4f8';
            ctx.beginPath();
            // Ghost shape: rounded top, wavy bottom
            ctx.ellipse(0, -4, 15, 14, 0, Math.PI, 0);
            // Wavy bottom
            ctx.lineTo(15, 10);
            ctx.quadraticCurveTo(12, 5, 9, 10);
            ctx.quadraticCurveTo(6, 15, 3, 10);
            ctx.quadraticCurveTo(0, 5, -3, 10);
            ctx.quadraticCurveTo(-6, 15, -9, 10);
            ctx.quadraticCurveTo(-12, 5, -15, 10);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;

            // Ghost inner highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.ellipse(-4, -8, 6, 5, -0.3, 0, Math.PI * 2);
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

        ctx.restore();
    }

    function drawUI() {
        if (state === STATE.PLAYING || state === STATE.GAME_OVER) {
            // Score
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000000';
            ctx.fillText(score, W / 2 + 2, 52);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(score, W / 2, 50);
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

    function drawReward() {
        if (!reward.active || reward.alpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = reward.alpha;
        ctx.font = (48 * reward.scale) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Render pizza emoji centered above the ghost
        ctx.fillText('\u{1F355}', bird.x, bird.y - 50);
        ctx.restore();
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
        // Set initial difficulty from config
        var diff = Logic.difficultyFor(0, activeConfig);
        wallSpeed = diff.wallSpeed;
        gapSize = diff.gapSize;
        wallSpacing = diff.wallSpacing;
        // Initialize clouds using the logic module
        initClouds();
        requestAnimationFrame(gameLoop);
    });
})();
