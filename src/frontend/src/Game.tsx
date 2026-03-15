import React, { useRef, useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GameScreen =
  | "start"
  | "playing"
  | "level_complete"
  | "game_over"
  | "victory";

interface Vec2 {
  x: number;
  y: number;
}

interface Chor {
  id: number;
  pos: Vec2;
  vel: Vec2;
  caught: boolean;
  wobble: number;
  wobbleDir: number;
}

interface GameState {
  playerPos: Vec2;
  playerVel: Vec2;
  chors: Chor[];
  timeLeft: number;
  score: number;
  level: number;
  lastTime: number;
}

interface LevelConfig {
  chorCount: number;
  timeLimit: number;
  chorSpeed: number;
  playerSpeed: number;
}

const LEVELS: LevelConfig[] = [
  { chorCount: 3, timeLimit: 45, chorSpeed: 2.5, playerSpeed: 4 },
  { chorCount: 5, timeLimit: 50, chorSpeed: 3.2, playerSpeed: 4.2 },
  { chorCount: 7, timeLimit: 55, chorSpeed: 3.8, playerSpeed: 4.5 },
];

const PLAYER_RADIUS = 28;
const CHOR_RADIUS = 24;
const CATCH_DIST = PLAYER_RADIUS + CHOR_RADIUS - 8;
const GRID_SIZE = 80;

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2d5a27";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#265122";
  for (let gx = 0; gx < w; gx += 12) {
    for (let gy = 0; gy < h; gy += 12) {
      if ((gx + gy) % 24 === 0) {
        ctx.fillRect(gx, gy, 2, 2);
      }
    }
  }

  ctx.strokeStyle = "#5a5a5a";
  ctx.lineWidth = GRID_SIZE * 0.45;
  ctx.lineCap = "square";
  for (let x = GRID_SIZE; x < w; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = GRID_SIZE; y < h; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 12]);
  for (let x = GRID_SIZE; x < w; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = GRID_SIZE; y < h; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = "#888";
  for (let x = GRID_SIZE - 18; x < w; x += GRID_SIZE) {
    for (let y = GRID_SIZE - 18; y < h; y += GRID_SIZE) {
      ctx.fillRect(x, y, 36, 36);
    }
  }
}

function drawPolice(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(
    x - r * 0.3,
    y - r * 0.3,
    r * 0.1,
    x,
    y,
    r,
  );
  bodyGrad.addColorStop(0, "#4a90e2");
  bodyGrad.addColorStop(1, "#1a4a8a");
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#0d2d5e";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#1a3a6e";
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.55, r * 0.65, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0d2d5e";
  ctx.fillRect(x - r * 0.4, y - r * 0.82, r * 0.8, r * 0.32);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#ffd700";
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 1;
  const starR = r * 0.32;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const innerAngle = outerAngle + (2 * Math.PI) / 10;
    const ox = x + Math.cos(outerAngle) * starR;
    const oy = y + r * 0.1 + Math.sin(outerAngle) * starR;
    const ix = x + Math.cos(innerAngle) * starR * 0.42;
    const iy = y + r * 0.1 + Math.sin(innerAngle) * starR * 0.42;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.22, r * 0.13, 0, Math.PI * 2);
  ctx.arc(x + r * 0.28, y - r * 0.22, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.arc(x - r * 0.27, y - r * 0.21, r * 0.07, 0, Math.PI * 2);
  ctx.arc(x + r * 0.27, y - r * 0.21, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawChor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  wobble: number,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(
    x - r * 0.3,
    y - r * 0.3,
    r * 0.1,
    x,
    y,
    r,
  );
  bodyGrad.addColorStop(0, "#ff6b6b");
  bodyGrad.addColorStop(1, "#b91c1c");
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#7f1d1d";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5, r * 0.65, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(x - r * 0.65, y - r * 0.58, r * 1.3, r * 0.18);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(20,20,20,0.85)";
  ctx.beginPath();
  ctx.ellipse(
    x - r * 0.3,
    y - r * 0.12,
    r * 0.25,
    r * 0.15,
    wobble * 0.1,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    x + r * 0.3,
    y - r * 0.12,
    r * 0.25,
    r * 0.15,
    -wobble * 0.1,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillRect(x - r * 0.3, y - r * 0.22, r * 0.6, r * 0.18);

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.14, r * 0.1, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.14, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff0000";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.13, r * 0.055, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.13, r * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#8B6914";
  ctx.beginPath();
  ctx.arc(x + r * 0.6, y + r * 0.5, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a4510";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#a07820";
  ctx.font = `bold ${r * 0.22}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", x + r * 0.6, y + r * 0.5);
  ctx.restore();
}

function drawCatchEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
) {
  const alpha = 1 - progress;
  const radius = CHOR_RADIUS + progress * 40;
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = progress * 50;
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(sx, sy, 4 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

function fleeVector(
  chor: Chor,
  player: Vec2,
  canvasW: number,
  canvasH: number,
): Vec2 {
  const dx = chor.pos.x - player.x;
  const dy = chor.pos.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  let fx = dx / dist;
  let fy = dy / dist;
  fx += Math.sin(chor.wobble) * 0.4;
  fy += Math.cos(chor.wobble * 0.7) * 0.4;
  const margin = 60;
  if (chor.pos.x < margin) fx += (margin - chor.pos.x) / margin;
  if (chor.pos.x > canvasW - margin)
    fx -= (chor.pos.x - (canvasW - margin)) / margin;
  if (chor.pos.y < margin) fy += (margin - chor.pos.y) / margin;
  if (chor.pos.y > canvasH - margin)
    fy -= (chor.pos.y - (canvasH - margin)) / margin;
  const mag = Math.sqrt(fx * fx + fy * fy) || 1;
  return { x: fx / mag, y: fy / mag };
}

function separationVector(chor: Chor, chors: Chor[]): Vec2 {
  let sx = 0;
  let sy = 0;
  const SEP_DIST = CHOR_RADIUS * 3;
  for (const other of chors) {
    if (other.id === chor.id || other.caught) continue;
    const dx = chor.pos.x - other.pos.x;
    const dy = chor.pos.y - other.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < SEP_DIST) {
      sx += ((dx / dist) * (SEP_DIST - dist)) / SEP_DIST;
      sy += ((dy / dist) * (SEP_DIST - dist)) / SEP_DIST;
    }
  }
  return { x: sx, y: sy };
}

function spawnChors(
  count: number,
  canvasW: number,
  canvasH: number,
  playerPos: Vec2,
): Chor[] {
  const chors: Chor[] = [];
  for (let i = 0; i < count; i++) {
    let pos: Vec2 = { x: 0, y: 0 };
    let attempts = 0;
    do {
      pos = {
        x: CHOR_RADIUS + Math.random() * (canvasW - CHOR_RADIUS * 2),
        y: CHOR_RADIUS + Math.random() * (canvasH - CHOR_RADIUS * 2),
      };
      attempts++;
    } while (
      Math.hypot(pos.x - playerPos.x, pos.y - playerPos.y) < 120 &&
      attempts < 20
    );
    chors.push({
      id: i,
      pos,
      vel: { x: 0, y: 0 },
      caught: false,
      wobble: Math.random() * Math.PI * 2,
      wobbleDir: Math.random() > 0.5 ? 1 : -1,
    });
  }
  return chors;
}

// ─── Main Game Component ──────────────────────────────────────────────────────

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const catchEffectsRef = useRef<
    Array<{ x: number; y: number; progress: number }>
  >([]);
  const levelConfigRef = useRef<LevelConfig>(LEVELS[0]);
  const joystickRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
  });

  const [screen, setScreen] = useState<GameScreen>("start");
  const [uiScore, setUiScore] = useState(0);
  const [uiLevel, setUiLevel] = useState(1);
  const [uiTimeLeft, setUiTimeLeft] = useState(45);
  const [uiChorsLeft, setUiChorsLeft] = useState(3);
  const [finalScore, setFinalScore] = useState(0);
  const [levelBonus, setLevelBonus] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 560 });

  // Stable refs so game loop can read latest values without closure issues
  const setScreenRef = useRef(setScreen);
  const setUiScoreRef = useRef(setUiScore);
  const setUiTimeLRef = useRef(setUiTimeLeft);
  const setUiChorsLRef = useRef(setUiChorsLeft);
  const setFinalScoreRef = useRef(setFinalScore);
  const setLevelBonusRef = useRef(setLevelBonus);

  // ── Canvas sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    function resize() {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setCanvasSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Initialize level ─────────────────────────────────────────────────────────
  const startLevel = useCallback(
    (level: number, carryScore: number, canvasW: number, canvasH: number) => {
      const cfg = LEVELS[level - 1];
      levelConfigRef.current = cfg;
      const playerPos: Vec2 = { x: canvasW / 2, y: canvasH / 2 };
      gameStateRef.current = {
        playerPos,
        playerVel: { x: 0, y: 0 },
        chors: spawnChors(cfg.chorCount, canvasW, canvasH, playerPos),
        timeLeft: cfg.timeLimit,
        score: carryScore,
        level,
        lastTime: performance.now(),
      };
      catchEffectsRef.current = [];
      setUiLevel(level);
      setUiScore(carryScore);
      setUiTimeLeft(cfg.timeLimit);
      setUiChorsLeft(cfg.chorCount);
    },
    [],
  );

  const startGame = useCallback(
    (level: number, carryScore: number) => {
      startLevel(level, carryScore, canvasSize.w, canvasSize.h);
      setScreen("playing");
    },
    [canvasSize.w, canvasSize.h, startLevel],
  );

  // ── Game loop (ref-based, no self-referential useCallback) ───────────────────
  useEffect(() => {
    if (screen !== "playing") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    if (gameStateRef.current) {
      gameStateRef.current.lastTime = performance.now();
    }

    function loop(timestamp: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const gs = gameStateRef.current;
      if (!gs) return;

      const dt = Math.min((timestamp - gs.lastTime) / 1000, 0.05);
      gs.lastTime = timestamp;

      const cfg = levelConfigRef.current;
      const W = canvas.width;
      const H = canvas.height;

      // Player movement
      const keys = keysRef.current;
      const joy = joystickRef.current;
      let mvx = 0;
      let mvy = 0;

      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) mvx -= 1;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) mvx += 1;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) mvy -= 1;
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) mvy += 1;

      if (joy.active) {
        const jmag = Math.sqrt(joy.dx * joy.dx + joy.dy * joy.dy) || 1;
        const scale = Math.min(jmag / 40, 1);
        mvx += (joy.dx / jmag) * scale;
        mvy += (joy.dy / jmag) * scale;
      }

      const mvMag = Math.sqrt(mvx * mvx + mvy * mvy);
      if (mvMag > 0) {
        mvx = (mvx / mvMag) * cfg.playerSpeed;
        mvy = (mvy / mvMag) * cfg.playerSpeed;
      }

      gs.playerPos.x = Math.max(
        PLAYER_RADIUS,
        Math.min(W - PLAYER_RADIUS, gs.playerPos.x + mvx),
      );
      gs.playerPos.y = Math.max(
        PLAYER_RADIUS,
        Math.min(H - PLAYER_RADIUS, gs.playerPos.y + mvy),
      );

      // Timer
      gs.timeLeft -= dt;
      setUiTimeLRef.current(Math.ceil(gs.timeLeft));

      if (gs.timeLeft <= 0) {
        cancelAnimationFrame(rafRef.current);
        setFinalScoreRef.current(gs.score);
        setScreenRef.current("game_over");
        return;
      }

      // Chor AI
      let activeChors = 0;
      for (const chor of gs.chors) {
        if (chor.caught) continue;
        activeChors++;

        chor.wobble += chor.wobbleDir * dt * 1.8 + (Math.random() - 0.5) * 0.3;

        const flee = fleeVector(chor, gs.playerPos, W, H);
        const sep = separationVector(chor, gs.chors);

        let steerX = flee.x * 0.8 + sep.x * 0.2;
        let steerY = flee.y * 0.8 + sep.y * 0.2;
        const steerMag = Math.sqrt(steerX * steerX + steerY * steerY) || 1;
        steerX = (steerX / steerMag) * cfg.chorSpeed;
        steerY = (steerY / steerMag) * cfg.chorSpeed;

        chor.vel.x = chor.vel.x * 0.85 + steerX * 0.15;
        chor.vel.y = chor.vel.y * 0.85 + steerY * 0.15;

        chor.pos.x += chor.vel.x;
        chor.pos.y += chor.vel.y;

        if (chor.pos.x < CHOR_RADIUS) {
          chor.pos.x = CHOR_RADIUS;
          chor.vel.x *= -1;
        }
        if (chor.pos.x > W - CHOR_RADIUS) {
          chor.pos.x = W - CHOR_RADIUS;
          chor.vel.x *= -1;
        }
        if (chor.pos.y < CHOR_RADIUS) {
          chor.pos.y = CHOR_RADIUS;
          chor.vel.y *= -1;
        }
        if (chor.pos.y > H - CHOR_RADIUS) {
          chor.pos.y = H - CHOR_RADIUS;
          chor.vel.y *= -1;
        }

        const cdx = gs.playerPos.x - chor.pos.x;
        const cdy = gs.playerPos.y - chor.pos.y;
        if (Math.sqrt(cdx * cdx + cdy * cdy) < CATCH_DIST) {
          chor.caught = true;
          gs.score += 100;
          activeChors--;
          catchEffectsRef.current.push({
            x: chor.pos.x,
            y: chor.pos.y,
            progress: 0,
          });
          setUiScoreRef.current(gs.score);
          setUiChorsLRef.current((prev) => Math.max(0, prev - 1));
        }
      }

      if (activeChors === 0) {
        cancelAnimationFrame(rafRef.current);
        const bonus = Math.ceil(gs.timeLeft) * 10;
        gs.score += bonus;
        setLevelBonusRef.current(bonus);
        setFinalScoreRef.current(gs.score);
        setUiScoreRef.current(gs.score);
        if (gs.level >= 3) {
          setScreenRef.current("victory");
        } else {
          setScreenRef.current("level_complete");
        }
        return;
      }

      catchEffectsRef.current = catchEffectsRef.current
        .map((e) => ({ ...e, progress: e.progress + dt * 2 }))
        .filter((e) => e.progress < 1);

      // Render
      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx, W, H);

      for (const effect of catchEffectsRef.current) {
        drawCatchEffect(ctx, effect.x, effect.y, effect.progress);
      }

      for (const chor of gs.chors) {
        if (!chor.caught) {
          drawChor(ctx, chor.pos.x, chor.pos.y, CHOR_RADIUS, chor.wobble);
        }
      }

      drawPolice(ctx, gs.playerPos.x, gs.playerPos.y, PLAYER_RADIUS);

      // Joystick visual
      const joyX = 70;
      const joyY = H - 70;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(joyX, joyY, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (joy.active) {
        const thumbX = joyX + Math.max(-35, Math.min(35, joy.dx));
        const thumbY = joyY + Math.max(-35, Math.min(35, joy.dy));
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(thumbX, thumbY, 22, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(joyX, joyY, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen]);

  // ── Focus canvas when playing ─────────────────────────────────────────────────
  useEffect(() => {
    if (screen === "playing") {
      canvasRef.current?.focus();
    }
  }, [screen]);

  // ── Keyboard controls ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      keysRef.current.add(e.key);
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.key);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Touch joystick ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      joystickRef.current = {
        active: true,
        startX: (touch.clientX - rect.left) * scaleX,
        startY: (touch.clientY - rect.top) * scaleY,
        dx: 0,
        dy: 0,
      };
      e.preventDefault();
    }

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      const joy = joystickRef.current;
      joy.dx = (touch.clientX - rect.left) * scaleX - joy.startX;
      joy.dy = (touch.clientY - rect.top) * scaleY - joy.startY;
      e.preventDefault();
    }

    function onTouchEnd() {
      joystickRef.current.active = false;
      joystickRef.current.dx = 0;
      joystickRef.current.dy = 0;
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [screen]);

  const timerColor =
    uiTimeLeft > 15
      ? "text-green-400"
      : uiTimeLeft > 8
        ? "text-yellow-400"
        : "text-red-400";

  const currentYear = new Date().getFullYear();

  return (
    <div
      className="flex flex-col min-h-screen game-container"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* ── Start Screen ─────────────────────────────────────────────────────── */}
      {screen === "start" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 screen-enter">
          <div className="relative mb-6">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, oklch(52 0.18 250), oklch(32 0.1 250))",
                boxShadow:
                  "0 0 40px oklch(52 0.18 250 / 0.6), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <span style={{ fontSize: 48 }}>⭐</span>
            </div>
          </div>

          <h1
            className="arcade-title text-5xl sm:text-7xl font-extrabold mb-2"
            style={{ color: "oklch(85 0.22 55)" }}
          >
            CHOR POLICE
          </h1>
          <p
            className="text-lg sm:text-xl mb-8 font-semibold tracking-wide"
            style={{ color: "oklch(72 0.08 200)" }}
          >
            Catch all the Chors! 🏃
          </p>

          <div className="hud-panel rounded-2xl p-5 mb-8 max-w-sm w-full">
            <h3
              className="font-bold text-sm uppercase tracking-widest mb-3"
              style={{ color: "oklch(72 0.19 55)" }}
            >
              How to Play
            </h3>
            <ul
              className="space-y-2 text-sm"
              style={{ color: "oklch(80 0.04 240)" }}
            >
              <li className="flex items-center gap-2">
                <span className="text-base">🎮</span> Arrow keys or WASD to move
              </li>
              <li className="flex items-center gap-2">
                <span className="text-base">📱</span> Touch &amp; drag on mobile
              </li>
              <li className="flex items-center gap-2">
                <span className="text-base">🚔</span> Chase and catch the red
                Chors
              </li>
              <li className="flex items-center gap-2">
                <span className="text-base">⏱️</span> Catch all before time runs
                out!
              </li>
            </ul>
          </div>

          <div className="flex gap-3 mb-8">
            {LEVELS.map((cfg, i) => (
              <div
                key={`level-preview-${i + 1}`}
                className="hud-panel rounded-xl p-3 text-center w-24"
              >
                <div
                  className="text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color: "oklch(72 0.19 55)" }}
                >
                  Level {i + 1}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "oklch(70 0.04 240)" }}
                >
                  {cfg.chorCount} Chors
                </div>
                <div
                  className="text-xs"
                  style={{ color: "oklch(70 0.04 240)" }}
                >
                  {cfg.timeLimit}s
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            data-ocid="game.start_button"
            className="btn-arcade px-10 py-4 rounded-2xl font-extrabold text-xl tracking-wide transition-transform hover:scale-105 active:scale-95"
            style={{
              background:
                "linear-gradient(135deg, oklch(72 0.22 55), oklch(60 0.2 45))",
              color: "oklch(15 0.02 240)",
              border: "2px solid oklch(80 0.2 65)",
            }}
            onClick={() => startGame(1, 0)}
          >
            START GAME 🚔
          </button>
        </div>
      )}

      {/* ── Playing Screen ───────────────────────────────────────────────────── */}
      {screen === "playing" && (
        <div className="flex-1 flex flex-col">
          <div
            className="hud-panel flex items-center justify-between px-4 py-2 gap-4"
            style={{ borderBottom: "1px solid oklch(72 0.19 55 / 0.2)" }}
          >
            <div className="flex items-center gap-1">
              <span
                className="text-xs uppercase tracking-widest font-bold"
                style={{ color: "oklch(72 0.19 55)" }}
              >
                Level
              </span>
              <span
                className="text-lg font-extrabold"
                style={{ color: "oklch(85 0.22 55)" }}
              >
                {uiLevel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="text-xs uppercase tracking-widest font-bold"
                style={{ color: "oklch(72 0.08 200)" }}
              >
                Chors
              </span>
              <span
                className="text-lg font-extrabold"
                style={{ color: "oklch(70 0.22 25)" }}
              >
                {uiChorsLeft}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="text-xs uppercase tracking-widest font-bold"
                style={{ color: "oklch(70 0.04 240)" }}
              >
                Time
              </span>
              <span
                className={`text-lg font-extrabold tabular-nums ${timerColor}`}
              >
                {uiTimeLeft}s
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="text-xs uppercase tracking-widest font-bold"
                style={{ color: "oklch(78 0.2 145)" }}
              >
                Score
              </span>
              <span
                className="text-lg font-extrabold"
                style={{ color: "oklch(85 0.22 55)" }}
              >
                {uiScore}
              </span>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 relative overflow-hidden">
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              tabIndex={0}
              data-ocid="game.canvas_target"
              className="block w-full h-full outline-none"
              style={{ touchAction: "none" }}
            />
          </div>
        </div>
      )}

      {/* ── Level Complete Screen ────────────────────────────────────────────── */}
      {screen === "level_complete" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 screen-enter">
          <div
            className="hud-panel rounded-3xl p-8 max-w-sm w-full text-center"
            style={{ border: "2px solid oklch(78 0.2 145 / 0.5)" }}
          >
            <div className="text-5xl mb-3">🎉</div>
            <h2
              className="arcade-title text-4xl font-extrabold mb-1"
              style={{ color: "oklch(78 0.2 145)" }}
            >
              Level {uiLevel} Complete!
            </h2>
            <p className="text-sm mb-5" style={{ color: "oklch(65 0.05 240)" }}>
              All Chors caught!
            </p>
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm font-semibold">
                <span style={{ color: "oklch(65 0.05 240)" }}>Catch score</span>
                <span style={{ color: "oklch(85 0.22 55)" }}>
                  {uiScore - levelBonus}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span style={{ color: "oklch(65 0.05 240)" }}>
                  ⏱ Time bonus
                </span>
                <span style={{ color: "oklch(78 0.2 145)" }}>
                  +{levelBonus}
                </span>
              </div>
              <div
                className="flex justify-between text-base font-extrabold pt-2"
                style={{ borderTop: "1px solid oklch(72 0.19 55 / 0.3)" }}
              >
                <span style={{ color: "oklch(70 0.04 240)" }}>Total</span>
                <span style={{ color: "oklch(85 0.22 55)" }}>{uiScore}</span>
              </div>
            </div>
            <button
              type="button"
              data-ocid="game.next_level_button"
              className="w-full py-3 rounded-xl font-extrabold text-lg transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, oklch(78 0.2 145), oklch(62 0.18 145))",
                color: "oklch(15 0.02 240)",
                border: "2px solid oklch(85 0.15 145)",
                boxShadow: "0 0 20px oklch(78 0.2 145 / 0.5)",
              }}
              onClick={() => startGame(uiLevel + 1, uiScore)}
            >
              Next Level →
            </button>
          </div>
        </div>
      )}

      {/* ── Game Over Screen ─────────────────────────────────────────────────── */}
      {screen === "game_over" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 screen-enter">
          <div
            className="hud-panel rounded-3xl p-8 max-w-sm w-full text-center"
            style={{ border: "2px solid oklch(55 0.22 25 / 0.5)" }}
          >
            <div className="text-5xl mb-3">😱</div>
            <h2
              className="arcade-title text-4xl font-extrabold mb-1"
              style={{ color: "oklch(70 0.22 25)" }}
            >
              Time&apos;s Up!
            </h2>
            <p
              className="text-base mb-2 font-semibold"
              style={{ color: "oklch(65 0.08 30)" }}
            >
              The Chors escaped! 🏃
            </p>
            <p className="text-sm mb-6" style={{ color: "oklch(60 0.05 240)" }}>
              Score:{" "}
              <span
                className="font-extrabold"
                style={{ color: "oklch(85 0.22 55)" }}
              >
                {finalScore}
              </span>
            </p>
            <button
              type="button"
              data-ocid="game.try_again_button"
              className="w-full py-3 rounded-xl font-extrabold text-lg transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, oklch(72 0.22 55), oklch(60 0.2 45))",
                color: "oklch(15 0.02 240)",
                border: "2px solid oklch(80 0.2 65)",
                boxShadow: "0 0 20px oklch(72 0.19 55 / 0.5)",
              }}
              onClick={() => startGame(1, 0)}
            >
              Try Again 🚔
            </button>
          </div>
        </div>
      )}

      {/* ── Victory Screen ───────────────────────────────────────────────────── */}
      {screen === "victory" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 screen-enter">
          <div
            className="hud-panel rounded-3xl p-8 max-w-sm w-full text-center"
            style={{ border: "2px solid oklch(72 0.19 55 / 0.6)" }}
          >
            <div className="text-5xl mb-3">🏆</div>
            <h2
              className="arcade-title text-4xl font-extrabold mb-1"
              style={{ color: "oklch(85 0.22 55)" }}
            >
              YOU WIN!
            </h2>
            <p
              className="text-base mb-2 font-semibold"
              style={{ color: "oklch(78 0.2 145)" }}
            >
              All Chors behind bars! 👮
            </p>
            <p className="text-sm mb-1" style={{ color: "oklch(65 0.05 240)" }}>
              Time bonus:{" "}
              <span
                className="font-bold"
                style={{ color: "oklch(78 0.2 145)" }}
              >
                +{levelBonus}
              </span>
            </p>
            <p
              className="text-xl font-extrabold mb-6"
              style={{ color: "oklch(85 0.22 55)" }}
            >
              Final Score: {finalScore}
            </p>
            <div className="flex justify-center gap-2 mb-6">
              {["s1", "s2", "s3", "s4", "s5"].map((s) => (
                <span key={s} style={{ fontSize: 24 }}>
                  ⭐
                </span>
              ))}
            </div>
            <button
              type="button"
              data-ocid="game.play_again_button"
              className="btn-arcade w-full py-3 rounded-xl font-extrabold text-lg transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, oklch(72 0.22 55), oklch(60 0.2 45))",
                color: "oklch(15 0.02 240)",
                border: "2px solid oklch(80 0.2 65)",
              }}
              onClick={() => startGame(1, 0)}
            >
              Play Again 🚔
            </button>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {screen !== "playing" && (
        <footer
          className="py-3 text-center text-xs"
          style={{ color: "oklch(50 0.04 240)" }}
        >
          © {currentYear}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(
              typeof window !== "undefined" ? window.location.hostname : "",
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80 transition-opacity"
            style={{ color: "oklch(60 0.08 200)" }}
          >
            caffeine.ai
          </a>
        </footer>
      )}
    </div>
  );
}
