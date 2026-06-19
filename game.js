// Flappy Kiro — Game Engine
(function () {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;   // 400
    const H = canvas.height;  // 600

    // ---------- STATES ----------
    const STATE = { READY: 0, PLAYING: 1, GAME_OVER: 2 };
    let state = STATE.READY;

    // ---------- BIRD ----------
    const bird = {
        x: 80,
        y: H / 2,
        w: 34,
        h: 28,
        vy: 0,
        gravity: 0.4,
        flapStrength: -7,
        maxVel: 10,
        rotation: 0,
        squish: 0  // animation counter for flap squish
    };

    // ---------- PIPES ----------
    let pipes = [];
    const PIPE_WIDTH = 52;
    const PIPE_CAP_H = 20;
    let pipeSpeed = 2;
    let gapSize = 150;
    let pipeTimer = 0;
    let pipeInterval = 90; // frames between spawns

    // ---------- GROUND ----------
    const GROUND_H = 60;
    let groundX = 0;

    // ---------- CLOUDS ----------
    let clouds = [];
    function initClouds() {
        clouds = [];
        for (let i = 0; i < 5; i++) {
            clouds.push({
                x: Math.random() * W,
                y: 40 + Math.random() * 200,
                w: 60 + Math.random() * 80,
                h: 25 + Math.random() * 20,
                speed: 0.3 + Math.random() * 0.4
            });
        }
    }
    initClouds();

    // ---------- SCORING ----------
    let score = 0;
    let highScore = parseInt(localStorage.getItem('flappyKiroHigh')) || 0;

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
        bird.vy = bird.flapStrength;
        bird.squish = 8;
    }

    function flap() {
        bird.vy = bird.flapStrength;
        bird.squish = 8;
    }

    function resetGame() {
        state = STATE.READY;
        bird.y = H / 2;
        bird.vy = 0;
        bird.rotation = 0;
        bird.squish = 0;
        pipes = [];
        pipeTimer = 0;
        pipeSpeed = 2;
        gapSize = 150;
        pipeInterval = 90;
        score = 0;
        shakeTimer = 0;
        flashAlpha = 0;
    }

    function gameOver() {
        state = STATE.GAME_OVER;
        shakeTimer = 15;
        flashAlpha = 0.6;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('flappyKiroHigh', highScore);
        }
    }

    // ---------- DIFFICULTY ----------
    function applyDifficulty() {
        const level = Math.floor(score / 5);
        pipeSpeed = Math.min(2 + level * 0.15, 4);
        gapSize = Math.max(150 - level * 3, 100);
        pipeInterval = Math.max(90 - level * 3, 55);
    }

    // ---------- PIPE SPAWNING ----------
    function spawnPipe() {
        const minY = gapSize / 2 + PIPE_CAP_H + 20;
        const maxY = H - GROUND_H - gapSize / 2 - PIPE_CAP_H - 20;
        const gapCenter = minY + Math.random() * (maxY - minY);
        pipes.push({
            x: W,
            gapCenter: gapCenter,
            scored: false
        });
    }

    // ---------- UPDATE ----------
    function update() {
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

        // Bird physics
        bird.vy += bird.gravity;
        if (bird.vy > bird.maxVel) bird.vy = bird.maxVel;
        bird.y += bird.vy;

        // Rotation
        bird.rotation = Math.min(Math.max(bird.vy * 0.08, -0.5), Math.PI / 2 * 0.8);

        // Squish decay
        if (bird.squish > 0) bird.squish--;

        // Pipe logic
        pipeTimer++;
        if (pipeTimer >= pipeInterval) {
            pipeTimer = 0;
            spawnPipe();
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= pipeSpeed;

            // Scoring
            if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
                p.scored = true;
                score++;
                applyDifficulty();
            }

            // Remove off-screen
            if (p.x + PIPE_WIDTH < -10) {
                pipes.splice(i, 1);
            }
        }

        // Ground scroll
        groundX -= pipeSpeed;
        if (groundX <= -24) groundX += 24;

        // Cloud scroll
        for (let c of clouds) {
            c.x -= c.speed;
            if (c.x + c.w < 0) {
                c.x = W + Math.random() * 40;
                c.y = 40 + Math.random() * 200;
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

        // Pipes (AABB with slight inset for forgiving hitbox)
        const inset = 4;
        const bx = bird.x - bird.w / 2 + inset;
        const by = bird.y - bird.h / 2 + inset;
        const bw = bird.w - inset * 2;
        const bh = bird.h - inset * 2;

        for (const p of pipes) {
            const topPipeBottom = p.gapCenter - gapSize / 2;
            const bottomPipeTop = p.gapCenter + gapSize / 2;

            // Top pipe rect
            if (aabb(bx, by, bw, bh, p.x, 0, PIPE_WIDTH, topPipeBottom)) {
                gameOver();
                return;
            }
            // Bottom pipe rect
            if (aabb(bx, by, bw, bh, p.x, bottomPipeTop, PIPE_WIDTH, H - GROUND_H - bottomPipeTop)) {
                gameOver();
                return;
            }
        }
    }

    function aabb(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
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

        ctx.restore();

        // Flash overlay
        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (const c of clouds) {
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
            ctx.fillRect(p.x - 4, topH - PIPE_CAP_H, PIPE_WIDTH + 8, PIPE_CAP_H);
            ctx.strokeStyle = '#558b2f';
            ctx.strokeRect(p.x - 4, topH - PIPE_CAP_H, PIPE_WIDTH + 8, PIPE_CAP_H);
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
            ctx.fillRect(p.x - 4, bottomY, PIPE_WIDTH + 8, PIPE_CAP_H);
            ctx.strokeStyle = '#558b2f';
            ctx.strokeRect(p.x - 4, bottomY, PIPE_WIDTH + 8, PIPE_CAP_H);
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

    // ---------- GAME LOOP ----------
    function gameLoop() {
        update();
        render();
        requestAnimationFrame(gameLoop);
    }

    // Start
    requestAnimationFrame(gameLoop);
})();
