(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const sizeSelect = document.getElementById('sizeSelect');
  const speedSelect = document.getElementById('speedSelect');
  const cameraSelect = document.getElementById('cameraSelect');
  const restartBtn = document.getElementById('restartBtn');
  const headBoundsToggle = document.getElementById('headBoundsToggle');

  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');

  const highscoreListEl = document.getElementById('highscoreList');

  const MAX_HIGHSCORES = 10;
  const NAME_KEY = 'rp2snake_last_name';

  function sizeKey() {
    return `rp2snake_highscores_${config.W}x${config.H}`;
  }

  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlayTitle');
  const overlayScoreEl = document.getElementById('overlayScore');
  const overlaySizeEl = document.getElementById('overlaySize');
  const overlayHighscoreListEl = document.getElementById('overlayHighscoreList');

  const newHighScoreEl = document.getElementById('newHighScore');
  const nameEntryEl = document.getElementById('nameEntry');
  const nameInputEl = document.getElementById('nameInput');
  const submitScoreBtn = document.getElementById('submitScoreBtn');

  const playAgainBtn = document.getElementById('playAgainBtn');
  const closeOverlayBtn = document.getElementById('closeOverlayBtn');

  /** @type {{W:number,H:number, tickHz:number}} */
  let config = { W: 32, H: 24, tickHz: 10 };

  /** @type {{x:number,y:number}[]} */
  let snake = [];
  let snakeFlip = []; // boolean per segment: true means objective flanks swapped
  /** @type {{x:number,y:number}} */
  let food = { x: 0, y: 0 };

  /** direction */
  let dx = 1, dy = 0;
  let pendingDx = 1, pendingDy = 0;
  let intent = null; // 'U'|'D'|'L'|'R' or null

  let alive = true;
  let paused = false;
  let score = 0;

  let cameraMode = 'world'; // 'world' | 'head'

  let showHeadBoundaries = false;
  
  let camFlipX = false; // whether camera's +x points to decreasing world-x
  let camFlipY = false; // whether camera's +y points to decreasing world-y

  // A continuous (unwrapped) head position used only for head-centred rendering.
  // Think: head position in the cover, so it never jumps.
  let headU = 0, headV = 0;

  let tickInterval = null;

  // Rendering
  let cell = 20; // computed
  let pad = 10;

  // Snake styling
  const SNAKE_STYLE = {
    // Core fill
    core: 'rgba(232, 238, 247, 0.62)',
    coreHead: 'rgba(232, 238, 247, 0.92)',
    // Flanks (left/right relative to travel direction)
    flankL: 'rgba(120, 210, 255, 0.85)',
    flankR: 'rgba(255, 160, 210, 0.85)',
    outline: 'rgba(0, 0, 0, 0.22)',
    eye: 'rgba(10, 12, 18, 0.85)',
  };

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * Find the single-step direction from cell a -> cell b on RP^2.
   * a and b are known to be adjacent along the snake.
   */
  function dirBetweenCells(a, b) {
    const opts = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const o of opts) {
      const w = wrapRP2(a.x + o.dx, a.y + o.dy, o.dx, o.dy);
      if (w.x === b.x && w.y === b.y) return o;
    }
    // Should never happen if the snake data is consistent.
    return { dx: 0, dy: 0 };
  }

  function linkBetweenCells(a, b) {
    const opts = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const o of opts) {
      const w = wrapRP2(a.x + o.dx, a.y + o.dy, o.dx, o.dy);
      if (w.x === b.x && w.y === b.y) {
        return { dx: o.dx, dy: o.dy, crossed: (w.crossX || w.crossY) };
      }
    }
    return { dx: 0, dy: 0, crossed: false };
  }

  /**
   * Draw a snake segment with coloured flanks.
   * dirS is direction of travel (screen-space): one of the 4 cardinal directions.
   */
  function drawSnakeSegment(px, py, dirS, isHead, isTail, fade01, swapFlanks = false) {
    const inset = Math.max(1, Math.floor(cell * 0.12));
    const x = px + inset;
    const y = py + inset;
    const w = cell - 2 * inset;
    const h = cell - 2 * inset;

    const r = Math.max(2, Math.floor(w * 0.28));
    const stripe = Math.max(2, Math.floor(w * 0.28));

    // Left/right perpendiculars in screen coords (y increases downward)
    const lpx = dirS.dy;
    const lpy = -dirS.dx;
    const rpx = -dirS.dy;
    const rpy = dirS.dx;

    ctx.save();
    // A gentle tail fade improves readability
    ctx.globalAlpha *= (1 - 0.35 * fade01);

    // Clip to rounded core so stripes inherit the silhouette
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();

    // Core
    ctx.fillStyle = isHead ? SNAKE_STYLE.coreHead : SNAKE_STYLE.core;
    ctx.fillRect(x, y, w, h);

    const leftCol = swapFlanks ? SNAKE_STYLE.flankR : SNAKE_STYLE.flankL;
    const rightCol = swapFlanks ? SNAKE_STYLE.flankL : SNAKE_STYLE.flankR;

    // Left flank stripe
    ctx.fillStyle = leftCol;
    if (lpx === -1 && lpy === 0) ctx.fillRect(x, y, stripe, h);
    else if (lpx === 1 && lpy === 0) ctx.fillRect(x + w - stripe, y, stripe, h);
    else if (lpx === 0 && lpy === -1) ctx.fillRect(x, y, w, stripe);
    else if (lpx === 0 && lpy === 1) ctx.fillRect(x, y + h - stripe, w, stripe);

    // Right flank stripe
    ctx.fillStyle = rightCol;
    if (rpx === -1 && rpy === 0) ctx.fillRect(x, y, stripe, h);
    else if (rpx === 1 && rpy === 0) ctx.fillRect(x + w - stripe, y, stripe, h);
    else if (rpx === 0 && rpy === -1) ctx.fillRect(x, y, w, stripe);
    else if (rpx === 0 && rpy === 1) ctx.fillRect(x, y + h - stripe, w, stripe);

    ctx.restore();

    // Outline
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = SNAKE_STYLE.outline;
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    ctx.restore();

    // Head eyes (subtle)
    if (isHead && (dirS.dx !== 0 || dirS.dy !== 0)) {
      const cx = px + cell / 2;
      const cy = py + cell / 2;
      const fwd = Math.floor(cell * 0.18);
      const sep = Math.floor(cell * 0.14);
      const ex1 = cx + dirS.dx * fwd + lpx * sep;
      const ey1 = cy + dirS.dy * fwd + lpy * sep;
      const ex2 = cx + dirS.dx * fwd + rpx * sep;
      const ey2 = cy + dirS.dy * fwd + rpy * sep;
      const er = Math.max(1, Math.floor(cell * 0.06));
      ctx.save();
      ctx.fillStyle = SNAKE_STYLE.eye;
      ctx.beginPath();
      ctx.arc(ex1, ey1, er, 0, Math.PI * 2);
      ctx.arc(ex2, ey2, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function parseSize(v) {
    const m = /^(\d+)x(\d+)$/.exec(v);
    if (!m) return { W: 32, H: 24 };
    return { W: Number(m[1]), H: Number(m[2]) };
  }

  function resizeCanvas() {
    // Choose a smaller max display size (CSS pixels).
    const maxW = Math.min(1100, Math.floor(window.innerWidth * 0.90));
    const maxH = Math.min(900, Math.floor(window.innerHeight * 0.60));

    const cellW = Math.floor((maxW - 2 * pad) / config.W);
    const cellH = Math.floor((maxH - 2 * pad) / config.H);
    cell = Math.max(8, Math.min(cellW, cellH));

    const cssW = config.W * cell + 2 * pad;
    const cssH = config.H * cell + 2 * pad;

    // This is what makes it actually smaller in the browser (overrides stretchy CSS).
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // Keep it crisp (internal buffer scaled for HiDPI).
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // Draw using CSS-pixel coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cellToPx(x, y) {
    return { px: pad + x * cell, py: pad + y * cell };
  }

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  function loadHighscores() {
    try {
      const raw = localStorage.getItem(sizeKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveHighscores(entries) {
    localStorage.setItem(sizeKey(), JSON.stringify(entries));
  }

  function formatEntry(e) {
    const nm = (e.name || 'Anonymous').trim() || 'Anonymous';
    return `${nm} — ${e.score}`;
  }

  function renderOverlayList(entries, highlightTs = null) {
    overlayHighscoreListEl.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      li.textContent = formatEntry(e);
      if (highlightTs && e.ts === highlightTs) {
        li.style.fontWeight = '800';
        li.style.textDecoration = 'underline';
      }
      overlayHighscoreListEl.appendChild(li);
    }
  }

  function qualifiesForTop10(scoreVal, entries) {
    if (entries.length < MAX_HIGHSCORES) return scoreVal > 0;
    const worst = entries[entries.length - 1]?.score ?? -Infinity;
    return scoreVal > worst;
  }

  function showOverlay() {
    overlayEl.classList.remove('hidden');
    overlayEl.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
    overlayEl.setAttribute('aria-hidden', 'true');
  }

  let pendingHighscore = null; // { score, entries }

  function onGameOver() {
    overlayTitleEl.textContent = 'Game Over';
    overlayScoreEl.textContent = String(score);
    overlaySizeEl.textContent = `${config.W}×${config.H}`;

    const entries = loadHighscores().sort((a,b) => b.score - a.score);
    const isNew = qualifiesForTop10(score, entries);

    newHighScoreEl.classList.toggle('hidden', !isNew);
    nameEntryEl.classList.toggle('hidden', !isNew);

    if (isNew) {
      pendingHighscore = { score, entries };

      // preload last used name
      const last = (localStorage.getItem(NAME_KEY) || '').slice(0, 12);
      nameInputEl.value = last;
      nameInputEl.focus();
      nameInputEl.select();
    } else {
      pendingHighscore = null;
    }

    renderOverlayList(entries);
    showOverlay();
  }

  function submitPendingHighscore() {
    if (!pendingHighscore) return;

    const name = (nameInputEl.value || '').trim().slice(0, 12) || 'Anonymous';
    localStorage.setItem(NAME_KEY, name);

    const entry = { name, score: pendingHighscore.score, ts: Date.now() };

    const merged = [...pendingHighscore.entries, entry]
      .sort((a,b) => b.score - a.score)
      .slice(0, MAX_HIGHSCORES);

    saveHighscores(merged);

    // Hide input after submit, keep overlay visible
    newHighScoreEl.classList.add('hidden');
    nameEntryEl.classList.add('hidden');
    pendingHighscore = null;

    renderOverlayList(merged, entry.ts);
  }

  function reset() {
    alive = true;
    paused = false;
    score = 0;
    scoreEl.textContent = '0';
    setStatus('');
    hideOverlay();

    // Start snake near center
    const cx = Math.floor(config.W / 2);
    const cy = Math.floor(config.H / 2);
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];

    snakeFlip = new Array(snake.length).fill(false);

    dx = 1; dy = 0;
    pendingDx = 1; pendingDy = 0;

    camFlipX = false;
    camFlipY = false;

    // Initialise unwrapped head coords to match starting head.
    headU = snake[0].x;
    headV = snake[0].y;

    spawnFood();
    resizeCanvas();
    draw();

  }

  function isOnSnake(x, y) {
    for (const s of snake) if (s.x === x && s.y === y) return true;
    return false;
  }

  function spawnFood() {
    // Try random; fallback scan if needed
    for (let k = 0; k < 2000; k++) {
      const x = (Math.random() * config.W) | 0;
      const y = (Math.random() * config.H) | 0;
      if (!isOnSnake(x, y)) {
        food = { x, y };
        return;
      }
    }
    for (let y = 0; y < config.H; y++) {
      for (let x = 0; x < config.W; x++) {
        if (!isOnSnake(x, y)) { food = { x, y }; return; }
      }
    }
  }

  /**
   * Apply RP^2 wrap to a single step result.
   * Returns wrapped position and possibly-flipped direction.
   */
  function wrapRP2(nx, ny, ndx, ndy) {
    let x = nx, y = ny, ddx = ndx, ddy = ndy;
    let crossX = false;
    let crossY = false;

    if (x < 0) {
      crossX = true;
      x = config.W - 1;
      y = (config.H - 1) - y;
      ddy = -ddy;
    } else if (x >= config.W) {
      crossX = true;
      x = 0;
      y = (config.H - 1) - y;
      ddy = -ddy;
    }

    if (y < 0) {
      crossY = true;
      y = config.H - 1;
      x = (config.W - 1) - x;
      ddx = -ddx;
    } else if (y >= config.H) {
      crossY = true;
      y = 0;
      x = (config.W - 1) - x;
      ddx = -ddx;
    }

    return { x, y, dx: ddx, dy: ddy, crossX, crossY };
  }
  /**
   * Map arbitrary integer world coords into the fundamental tile for RP^2 rendering.
   * This applies the same edge identifications (reflections) but without direction handling.
   */

  function worldAtScreenOffset(ox, oy) {
    // Screen offsets (camera space) -> world coords in the fundamental RP² tile.
    // This is *not* path-dependent: we apply the full offset first, then fold back.
    // That ensures the left/right neighbour tiles are clean reflections (no vertical "sliding").
    const hx = snake[0].x;
    const hy = snake[0].y;

    const wx = hx + (camFlipX ? -ox : ox);
    const wy = hy + (camFlipY ? -oy : oy);

    return mapRP2(wx, wy);
  }

  function mapRP2(x, y) {
    let X = x, Y = y;

    // Track whether we've applied an odd number of reflections of each axis.
    // - Crossing left/right edges reflects Y (so flipY toggles)
    // - Crossing top/bottom edges reflects X (so flipX toggles)
    let flipX = false;
    let flipY = false;

    // Repeatedly fold back into range. Offsets are small in our camera window,
    // so loops are cheap and avoid tricky parity math.
    while (X < 0) { X += config.W; Y = (config.H - 1) - Y; flipY = !flipY; }
    while (X >= config.W) { X -= config.W; Y = (config.H - 1) - Y; flipY = !flipY; }

    while (Y < 0) { Y += config.H; X = (config.W - 1) - X; flipX = !flipX; }
    while (Y >= config.H) { Y -= config.H; X = (config.W - 1) - X; flipX = !flipX; }

    // In case reflections pushed us out again (rare), loop once more.
    while (X < 0) { X += config.W; Y = (config.H - 1) - Y; flipY = !flipY; }
    while (X >= config.W) { X -= config.W; Y = (config.H - 1) - Y; flipY = !flipY; }
    while (Y < 0) { Y += config.H; X = (config.W - 1) - X; flipX = !flipX; }
    while (Y >= config.H) { Y -= config.H; X = (config.W - 1) - X; flipX = !flipX; }

    return { x: X, y: Y, flipX, flipY };
  }


function step() {
  if (!alive || paused) return;

  // 1) Decide desired screen-direction for this tick
  // (If no new intent, keep going the same way.)
  let ndx = dx, ndy = dy;
  let turned = false;

  if (intent) {
    turned = true;
    if (intent === 'U') { ndx = 0; ndy = -1; }
    else if (intent === 'D') { ndx = 0; ndy = 1; }
    else if (intent === 'L') { ndx = -1; ndy = 0; }
    else if (intent === 'R') { ndx = 1; ndy = 0; }

    // optional: consume intent so a single keypress is one "turn"
    intent = null;
  }

  // In head-centred camera, interpret *turn inputs* in screen space.
  // (When not turning, we keep the current world direction; RP² wrapping already updates it.)
  if (cameraMode === 'head' && turned) {
    if (camFlipX) ndx = -ndx;
    if (camFlipY) ndy = -ndy;
  }

  // 2) Prevent immediate reversal into the neck
  if (!(ndx === -dx && ndy === -dy)) {
    dx = ndx;
    dy = ndy;
  }

  // 3) Move head by one cell in world coords
  const head = snake[0];
  let nx = head.x + dx;
  let ny = head.y + dy;

  // 4) Apply RP² wrap (this returns canonical tile coords + possibly flipped direction)
  const w = wrapRP2(nx, ny, dx, dy);

  nx = w.x;
  ny = w.y;
  dx = w.dx;
  dy = w.dy;

  const crossed = (w.crossX || w.crossY);

  // 5) In head-centred mode, crossing an identified edge flips the local frame on RP².
  // Toggle the camera frame so the view stays continuous and inputs remain screen-aligned.
  if (cameraMode === 'head') {
    // When we cross an identified edge, the local frame flips on RP².
    // Toggle the camera frame so the view stays continuous (controls stay screen-aligned via the turn mapping above).
    if (w.crossX) camFlipY = !camFlipY; // left/right seam => reflect Y
    if (w.crossY) camFlipX = !camFlipX; // top/bottom seam => reflect X
  }

  // 6) Add new head
  snake.unshift({ x: nx, y: ny });

  const prevFlip = snakeFlip.length ? snakeFlip[0] : false;
  snakeFlip.unshift(prevFlip ^ crossed);

  // 7) Eat / grow
  if (nx === food.x && ny === food.y) {
    score++;
    scoreEl.textContent = String(score);
    spawnFood();
  } else {
    snake.pop();
    snakeFlip.pop();
  }

  // 8) Self-collision
  for (let i = 1; i < snake.length; i++) {
    if (snake[i].x === nx && snake[i].y === ny) {
      alive = false;
      setStatus('Game over');
      onGameOver();
      break;
    }
  }
}

  function drawGrid() {
    // Subtle grid
    ctx.save();
    ctx.globalAlpha = 0.20;
    for (let x = 0; x <= config.W; x++) {
      const X = pad + x * cell;
      ctx.beginPath();
      ctx.moveTo(X, pad);
      ctx.lineTo(X, pad + config.H * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= config.H; y++) {
      const Y = pad + y * cell;
      ctx.beginPath();
      ctx.moveTo(pad, Y);
      ctx.lineTo(pad + config.W * cell, Y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBorder() {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,238,247,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, pad + 0.5, config.W * cell, config.H * cell);
    ctx.restore();
  }

  function draw() {
    resizeCanvas();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(232,238,247,0.15)';
    drawGrid();
    drawBorder();

    const head = snake[0];

    if (cameraMode === 'world') {
      // Food
      {
        const { px, py } = cellToPx(food.x, food.y);
        const r = Math.max(3, Math.floor(cell * 0.32));
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80, 255, 140, 0.95)';
        ctx.fill();
      }

      // swapByIdx[i] = whether segment i should have flanks swapped in world view
      const swapByIdx = new Array(snake.length).fill(false);

      // Walk from head (0) to tail, toggling whenever the body crosses an identified edge
      for (let i = 1; i < snake.length; i++) {
        const link = linkBetweenCells(snake[i - 1], snake[i]); // headward -> tailward
        swapByIdx[i] = swapByIdx[i - 1] ^ link.crossed;
      }

      // Snake
      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i];
        const { px, py } = cellToPx(s.x, s.y);

        // Direction along the snake toward the head.
        let dirW = { dx, dy };
        if (snake.length > 1) {
          if (i === 0) dirW = dirBetweenCells(snake[1], snake[0]);
          else dirW = dirBetweenCells(snake[i], snake[i - 1]);
        }

        const denom = Math.max(1, snake.length - 1);
        const fade01 = i / denom; // tail -> 1
        drawSnakeSegment(px, py, dirW, i === 0, i === snake.length - 1, fade01, snakeFlip[i] || false);
      }
    } else {
      // Head-centred camera: render a seamless window around the head by sampling
      // world cells via RP^2 mapping.
      const viewW = config.W;
      const viewH = config.H;
      const cx = Math.floor(viewW / 2);
      const cy = Math.floor(viewH / 2);

      // Snake index lookup by world cell.
      const idxByKey = new Map();
      for (let i = 0; i < snake.length; i++) idxByKey.set(snake[i].x + ',' + snake[i].y, i);

      // Precompute the sampling grid so we can reuse flip parity for snake rendering.
      const mgrid = Array.from({ length: viewH }, () => new Array(viewW));
      for (let sy = 0; sy < viewH; sy++) {
        for (let sx = 0; sx < viewW; sx++) {
          const ox = sx - cx;
          const oy = sy - cy;
          mgrid[sy][sx] = worldAtScreenOffset(ox, oy);
        }
      }

      const snakeDraw = [];

      // First pass: portal markers + food, and collect snake occurrences.
      for (let sy = 0; sy < viewH; sy++) {
        for (let sx = 0; sx < viewW; sx++) {
          const m = mgrid[sy][sx];
          const { px, py } = cellToPx(sx, sy);

        // Faint portal/border markers (objective world boundary)
        if (showHeadBoundaries) {  
          const a = 0.22;
            ctx.strokeStyle = `rgba(232,238,247,${a})`;
            ctx.lineWidth = 1;

            // Left boundary (world x == 0) => draw left edge of this screen cell
            if (m.x === 0) {
              ctx.beginPath();
              ctx.moveTo(px + 0.5, py);
              ctx.lineTo(px + 0.5, py + cell);
              ctx.stroke();
            }

            // Right boundary (world x == W-1) => draw right edge
            if (m.x === config.W ) {
              ctx.beginPath();
              ctx.moveTo(px + cell - 0.5, py);
              ctx.lineTo(px + cell - 0.5, py + cell);
              ctx.stroke();
            }

            // Top boundary (world y == 0) => draw top edge
            if (m.y === 0) {
              ctx.beginPath();
              ctx.moveTo(px, py + 0.5);
              ctx.lineTo(px + cell, py + 0.5);
              ctx.stroke();
            }

            // Bottom boundary (world y == H-1) => draw bottom edge
            if (m.y === config.H ) {
              ctx.beginPath();
              ctx.moveTo(px, py + cell - 0.5);
              ctx.lineTo(px + cell, py + cell - 0.5);
              ctx.stroke();
            }
          }  

          // Food
          if (m.x === food.x && m.y === food.y) {
            const r = Math.max(3, Math.floor(cell * 0.32));
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(80, 255, 140, 0.95)';
            ctx.fill();
          }

          // Snake occurrence?
          const key = m.x + ',' + m.y;
          const idx = idxByKey.get(key);
          if (idx !== undefined) {
            snakeDraw.push({ sx, sy, idx, m });
          }
        }
      }

      // Second pass: draw the snake tail->head so overlaps look natural.
      snakeDraw.sort((a, b) => b.idx - a.idx);
      for (const it of snakeDraw) {
        const { px, py } = cellToPx(it.sx, it.sy);

        // World direction along the snake toward the head
        let dirW = { dx, dy };
        if (snake.length > 1) {
          if (it.idx === 0) dirW = dirBetweenCells(snake[1], snake[0]);
          else dirW = dirBetweenCells(snake[it.idx], snake[it.idx - 1]);
        }

        // Transform the world direction into *screen direction* for this occurrence,
        // accounting for camera flips and the local RP^2 reflection parity used to
        // sample this screen cell.
        const sgnX = (camFlipX ? -1 : 1) * (it.m.flipX ? -1 : 1);
        const sgnY = (camFlipY ? -1 : 1) * (it.m.flipY ? -1 : 1);
        const dirS = { dx: dirW.dx * sgnX, dy: dirW.dy * sgnY };

        const objFlip = !!snakeFlip[it.idx];                 // Level 1
        const viewFlip = (!!camFlipX) ^ (!!camFlipY);        // Level 3 (camera chart)
        const portalFlip = ((!!it.m.flipX) ^ (!!it.m.flipY)) ^ viewFlip;  // Level 2, corrected
        const swapFlanks = objFlip ^ portalFlip;

        const denom = Math.max(1, snake.length - 1);
        const fade01 = it.idx / denom;
        drawSnakeSegment(px, py, dirS, it.idx === 0, it.idx === snake.length - 1, fade01, swapFlanks);
      }
    }

    // Overlay paused
    if (paused && alive) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(232,238,247,0.95)';
      ctx.font = '600 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }
  }

  function startLoop() {
    if (tickInterval) clearInterval(tickInterval);
    const ms = Math.max(10, Math.floor(1000 / config.tickHz));
    tickInterval = setInterval(() => {
      step();
      draw();
    }, ms);
  }

  function setConfigFromUI() {
    const s = parseSize(sizeSelect.value);
    config.W = s.W;
    config.H = s.H;
    config.tickHz = Number(speedSelect.value) || 10;
    cameraMode = (cameraSelect && cameraSelect.value === 'head') ? 'head' : 'world';
  }

  function handleKey(e) {
    const k = e.key.toLowerCase();

    // Pause
    if (k === ' ') {
      paused = !paused;
      setStatus(paused ? 'Paused' : '');
      e.preventDefault();
      draw();
      return;
    }

    // Restart
    if (k === 'r') {
      reset();
      e.preventDefault();
      hideOverlay();
      return;
    }

    // Direction intent (screen-space)
    if (k === 'arrowup' || k === 'w') intent = 'U';
    else if (k === 'arrowdown' || k === 's') intent = 'D';
    else if (k === 'arrowleft' || k === 'a') intent = 'L';
    else if (k === 'arrowright' || k === 'd') intent = 'R';
    else return;

    e.preventDefault();
  }

  // UI wiring
  sizeSelect.addEventListener('change', () => {
    setConfigFromUI();
    reset();
    startLoop();
  });

  speedSelect.addEventListener('change', () => {
    setConfigFromUI();
    startLoop();
  });

  cameraSelect.addEventListener('change', () => {
    cameraMode = cameraSelect.value === 'head' ? 'head' : 'world';
    draw();
  });

  restartBtn.addEventListener('click', () => {
    reset();
    startLoop();
  });

  if (headBoundsToggle) {
    // default unchecked -> false
    showHeadBoundaries = headBoundsToggle.checked;

    headBoundsToggle.addEventListener('change', () => {
      showHeadBoundaries = headBoundsToggle.checked;
      draw();
    });
  }

  submitScoreBtn.addEventListener('click', () => submitPendingHighscore());
    nameInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPendingHighscore();
    });

    playAgainBtn.addEventListener('click', () => {
      hideOverlay();
      reset();
      startLoop();
    });

    closeOverlayBtn.addEventListener('click', () => hideOverlay());

  window.addEventListener('keydown', handleKey, { passive: false });
  window.addEventListener('resize', () => draw());

  // init
  setConfigFromUI();
  reset();
  startLoop();
  updateHighscoreList();
})();
