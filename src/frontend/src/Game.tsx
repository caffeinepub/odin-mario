import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

import {
  playCoin,
  playEnemyDie,
  playGameOver,
  playJump,
  playPowerUp,
  playShoot,
} from "./utils/sounds";

// ─── Types ───────────────────────────────────────────────────────────────────

type GameState = "start" | "playing" | "boss" | "victory" | "gameover";

interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  jumpsLeft: number;
  facingRight: boolean;
  deathAnim: number;
}

interface Enemy {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  alive: boolean;
  stompAnim: number;
  id: number;
  isFlying?: boolean;
  patrolMinY?: number;
  patrolMaxY?: number;
  patrolDir?: number;
}

interface Coin {
  x: number;
  y: number;
  r: number;
  collected: boolean;
  bobOffset: number;
  id: number;
}

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  moving?: boolean;
  vx?: number;
  vy?: number;
  moveSpeed?: number;
  moveRange?: number;
  moveDir?: number;
  originX?: number;
  originY?: number;
  moveAxis?: "x" | "y";
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy?: number;
  alive: boolean;
  id: number;
}

interface QuestionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  used: boolean;
  animOffset: number;
  animTimer: number;
}

interface PowerUpPickup {
  x: number;
  y: number;
  vy: number;
  collected: boolean;
  id: number;
}

interface BossProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  id: number;
}

interface Boss {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  vx: number;
  facingRight: boolean;
  shootTimer: number;
  chargeTimer: number;
  isCharging: boolean;
  hitFlash: number;
  alive: boolean;
  deathAnim: number;
}

interface GameStateRef {
  player: Player;
  enemies: Enemy[];
  coins: Coin[];
  platforms: Platform[];
  clouds: Cloud[];
  bullets: Bullet[];
  bossProjectiles: BossProjectile[];
  boss: Boss | null;
  bossIntroTimer: number;
  cameraX: number;
  score: number;
  lives: number;
  keys: Record<string, boolean>;
  touch: { left: boolean; right: boolean; jump: boolean; shoot: boolean };
  frame: number;
  nextEnemyId: number;
  nextCoinId: number;
  nextBulletId: number;
  worldWidth: number;
  invincible: number;
  gameState: GameState;
  bossArenaX: number;
  currentWorld: number;
  questionBoxes: QuestionBox[];
  powerupPickups: PowerUpPickup[];
  tripleShotTimer: number;
  finishLine: {
    x: number;
    y: number;
    active: boolean;
    animFrame: number;
  } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GRAVITY = 0.5;
const PLAYER_SPEED = 4;
const JUMP_FORCE = -12;
const GROUND_Y_RATIO = 0.75;
const GROUND_H = 80;
const PLATFORM_H = 20;
const CHUNK_W = 800;
const BOSS_SPAWN_X = 3200;
const BULLET_SPEED = 10;
const BOSS_HP = 12;
const BOSS_HP_W2 = 22;
const BOSS_HP_W3 = 30;
const BOSS_HP_W4 = 35;

const SKY_TOP = "#5BC8F5";
const SKY_BOT = "#87DBFF";
const SKY_TOP_W2 = "#0B0B2A";
const SKY_BOT_W2 = "#1A1060";
const SKY_TOP_W3 = "#1a0000";
const SKY_BOT_W3 = "#2d0800";
const SKY_TOP_W4 = "#4EC3F7";
const SKY_BOT_W4 = "#E8F8FF";
const PLAT_COLOR_W4 = "#DDEFFF";
const PLAT_DARK_W4 = "#AACCEE";
const GROUND_TOP_W4 = "#c8e8ff";
const GROUND_MID_W4 = "#a0c8e8";
const CLOUD_COLOR = "#FFFFFF";
const GROUND_TOP = "#5DC44B";
const GROUND_MID = "#A0622A";
const GROUND_TOP_W2 = "#8B3A62";
const GROUND_MID_W2 = "#5A1A3A";
const GROUND_TOP_W3 = "#cc2200";
const GROUND_MID_W3 = "#881100";
const PLAT_COLOR = "#5DC44B";
const PLAT_DARK = "#3A8A2E";
const PLAT_COLOR_W2 = "#9B59B6";
const PLAT_DARK_W2 = "#6C3483";
const PLAT_COLOR_W3 = "#cc3300";
const PLAT_DARK_W3 = "#884400";
const PLAYER_HAT = "#D62B1E";
const PLAYER_SKIN = "#FACA8A";
const PLAYER_OVERALLS = "#2563EB";
const PLAYER_SHIRT = "#D62B1E";
const ENEMY_BODY = "#8B4513";
const COIN_COLOR = "#FFD700";
const STAR_COLOR = "#FFE600";

// ─── Price icon image ─────────────────────────────────────────────────────────
const _priceIconImg = new Image();
_priceIconImg.src = "/assets/uploads/19952_11zon-1-1.jpg";
function getPriceIconImg(): HTMLImageElement {
  return _priceIconImg;
}

// ─── Vibration helper ─────────────────────────────────────────────────────────

function hapticFeedback(ms = 30) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch (_) {
    // Ignore unsupported browsers
  }
}

// ─── Question Boxes ───────────────────────────────────────────────────────────

function initQuestionBoxes(worldNum: number): QuestionBox[] {
  const positions: number[][] =
    worldNum === 4
      ? [
          [450, 260],
          [850, 240],
          [1250, 280],
          [1850, 250],
          [2650, 270],
        ]
      : worldNum === 3
        ? [
            [420, 280],
            [820, 260],
            [1220, 300],
            [1820, 270],
            [2620, 290],
          ]
        : worldNum === 2
          ? [
              [400, 270],
              [800, 250],
              [1200, 290],
              [1820, 260],
              [2600, 280],
            ]
          : [
              [400, 300],
              [800, 280],
              [1200, 320],
              [1800, 290],
              [2600, 310],
            ];
  return positions.map(([x, y]) => ({
    x,
    y,
    width: 40,
    height: 40,
    used: false,
    animOffset: 0,
    animTimer: 0,
  }));
}

// ─── Level Generation ─────────────────────────────────────────────────────────

function generateChunk(
  chunkIndex: number,
  canvasH: number,
  gs: GameStateRef,
  worldNum = 1,
) {
  const groundY = Math.floor(canvasH * GROUND_Y_RATIO);
  const startX = chunkIndex * CHUNK_W;

  const numPlatforms =
    worldNum === 4
      ? 6 + Math.floor(Math.random() * 3)
      : worldNum === 3
        ? 5 + Math.floor(Math.random() * 3)
        : 3 + Math.floor(Math.random() * 3);
  const newPlatforms: Platform[] = [];

  for (let i = 0; i < numPlatforms; i++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const px = startX + 80 + Math.random() * (CHUNK_W - 250);
      const ph = groundY - 100 - Math.random() * 200;
      const pw = 90 + Math.random() * 120;

      let tooClose = false;
      const checkPlats = [...gs.platforms, ...newPlatforms];
      for (const existing of checkPlats) {
        const hGap = Math.max(
          0,
          Math.max(px, existing.x) - Math.min(px + pw, existing.x + existing.w),
        );
        const vGap = Math.max(
          0,
          Math.max(ph, existing.y) -
            Math.min(ph + PLATFORM_H, existing.y + PLATFORM_H),
        );
        if (Math.abs(px - existing.x) < 300) {
          if (hGap < 50 && vGap < 50) {
            tooClose = true;
            break;
          }
          if (hGap === 0 && vGap < 40) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) {
        // World 3: horizontal moving, World 4: vertical floating
        const isMoving =
          (worldNum === 3 || worldNum === 4) && Math.random() < 0.4;
        const isVertical = worldNum === 4 && isMoving;
        const plat: Platform = {
          x: px,
          y: ph,
          w: pw,
          h: PLATFORM_H,
          moving: isMoving,
          moveSpeed: isMoving
            ? worldNum === 4
              ? 0.6 + Math.random() * 0.8
              : 0.8 + Math.random() * 1.2
            : 0,
          moveRange: isMoving
            ? worldNum === 4
              ? 30 + Math.random() * 40
              : 60 + Math.random() * 80
            : 0,
          moveDir: isMoving ? (Math.random() > 0.5 ? 1 : -1) : 0,
          originX: px,
          originY: isVertical ? ph : undefined,
          moveAxis: isVertical ? "y" : "x",
        };
        newPlatforms.push(plat);
        gs.platforms.push(plat);

        const numCoins =
          1 +
          Math.floor(
            Math.random() *
              (worldNum === 4
                ? 7
                : worldNum === 3
                  ? 6
                  : worldNum === 2
                    ? 5
                    : 4),
          );
        for (let c = 0; c < numCoins; c++) {
          gs.coins.push({
            x: px + 15 + c * 22,
            y: ph - 30,
            r: 10,
            collected: false,
            bobOffset: Math.random() * Math.PI * 2,
            id: gs.nextCoinId++,
          });
        }
        break;
      }
    }
  }

  if (chunkIndex > 0) {
    const numEnemies =
      (worldNum === 4 ? 4 : worldNum === 3 ? 3 : worldNum === 2 ? 2 : 1) +
      Math.floor(
        Math.random() *
          (worldNum === 4 ? 4 : worldNum === 3 ? 4 : worldNum === 2 ? 3 : 2),
      );
    for (let i = 0; i < numEnemies; i++) {
      const speed =
        (worldNum === 4
          ? 0
          : worldNum === 3
            ? 2.8
            : worldNum === 2
              ? 2.2
              : 1.5) + (worldNum === 4 ? 0 : Math.random() * 0.8);
      const isFlying = worldNum === 4;
      const flyMinY = groundY - 200 - Math.random() * 100;
      const flyMaxY = groundY - 80 - Math.random() * 60;
      gs.enemies.push({
        x: startX + 100 + Math.random() * (CHUNK_W - 200),
        y: isFlying ? flyMinY + (flyMaxY - flyMinY) * 0.5 : groundY - 36,
        w: 32,
        h: 32,
        vx:
          (Math.random() > 0.5 ? 1 : -1) *
          (isFlying ? 1.2 + Math.random() * 0.8 : speed),
        vy: 0,
        alive: true,
        stompAnim: 0,
        id: gs.nextEnemyId++,
        isFlying,
        patrolMinY: isFlying ? flyMinY : undefined,
        patrolMaxY: isFlying ? flyMaxY : undefined,
        patrolDir: isFlying ? 1 : undefined,
      });
    }
  }

  const numGroundCoins =
    2 +
    Math.floor(
      Math.random() *
        (worldNum === 4 ? 7 : worldNum === 3 ? 6 : worldNum === 2 ? 5 : 3),
    );
  for (let i = 0; i < numGroundCoins; i++) {
    gs.coins.push({
      x: startX + 60 + Math.random() * (CHUNK_W - 120),
      y: groundY - 45,
      r: 10,
      collected: false,
      bobOffset: Math.random() * Math.PI * 2,
      id: gs.nextCoinId++,
    });
  }
}

function initClouds(canvasW: number, canvasH: number): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 8; i++) {
    clouds.push({
      x: Math.random() * canvasW * 2,
      y: 20 + Math.random() * canvasH * 0.3,
      w: 80 + Math.random() * 100,
      speed: 0.2 + Math.random() * 0.3,
    });
  }
  return clouds;
}

function createInitialState(
  canvasW: number,
  canvasH: number,
  worldNum = 1,
  startScore = 0,
  startLives = 3,
): GameStateRef {
  const groundY = Math.floor(canvasH * GROUND_Y_RATIO);
  const gs: GameStateRef = {
    player: {
      x: 80,
      y: groundY - 48,
      w: 32,
      h: 48,
      vx: 0,
      vy: 0,
      onGround: true,
      jumpsLeft: 2,
      facingRight: true,
      deathAnim: 0,
    },
    enemies: [],
    coins: [],
    platforms: [],
    clouds: initClouds(canvasW, canvasH),
    bullets: [],
    bossProjectiles: [],
    boss: null,
    bossIntroTimer: 0,
    cameraX: 0,
    score: startScore,
    lives: startLives,
    keys: {},
    touch: { left: false, right: false, jump: false, shoot: false },
    frame: 0,
    nextEnemyId: 1,
    nextCoinId: 1,
    nextBulletId: 1,
    worldWidth: 0,
    invincible: 0,
    gameState: "playing",
    bossArenaX: 0,
    currentWorld: worldNum,
    questionBoxes: initQuestionBoxes(worldNum),
    powerupPickups: [],
    tripleShotTimer: 0,
    finishLine: null,
  };

  for (let i = 0; i < 4; i++) {
    generateChunk(i, canvasH, gs, worldNum);
  }
  gs.worldWidth = 4 * CHUNK_W;

  return gs;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: Player,
  frame: number,
  camX: number,
  invincible: number,
) {
  const sx = p.x - camX;
  const sy = p.y;
  if (p.deathAnim > 0) {
    if (Math.floor(p.deathAnim / 4) % 2 === 0) return;
  }
  if (invincible > 0 && Math.floor(invincible / 5) % 2 === 0) return;

  ctx.save();
  if (!p.facingRight) {
    ctx.translate(sx + p.w / 2, sy + p.h / 2);
    ctx.scale(-1, 1);
    ctx.translate(-(p.w / 2), -(p.h / 2));
  } else {
    ctx.translate(sx, sy);
  }

  const walk = p.onGround ? Math.floor(frame / 8) % 2 : 0;

  ctx.fillStyle = PLAYER_HAT;
  ctx.fillRect(0, 0, p.w, 12);
  ctx.fillRect(4, -6, p.w - 8, 10);

  ctx.fillStyle = PLAYER_SKIN;
  ctx.fillRect(4, 12, p.w - 8, 12);

  ctx.fillStyle = "#5C3317";
  ctx.fillRect(6, 20, 10, 4);
  ctx.fillRect(14, 18, 10, 4);

  ctx.fillStyle = "#000";
  ctx.fillRect(6, 14, 4, 4);
  ctx.fillRect(18, 14, 4, 4);

  ctx.fillStyle = PLAYER_SHIRT;
  ctx.fillRect(2, 24, p.w - 4, 8);

  ctx.fillStyle = PLAYER_OVERALLS;
  ctx.fillRect(0, 32, p.w, 10);
  ctx.fillRect(2, 24, 10, 12);
  ctx.fillRect(p.w - 12, 24, 10, 12);

  ctx.fillStyle = PLAYER_OVERALLS;
  if (walk === 0) {
    ctx.fillRect(2, 42, 12, 6);
    ctx.fillRect(p.w - 14, 42, 12, 6);
  } else {
    ctx.fillRect(0, 42, 12, 6);
    ctx.fillRect(p.w - 12, 42, 12, 6);
  }

  ctx.fillStyle = "#2B1800";
  if (walk === 0) {
    ctx.fillRect(0, 46, 14, 4);
    ctx.fillRect(p.w - 14, 46, 14, 4);
  } else {
    ctx.fillRect(-2, 46, 14, 4);
    ctx.fillRect(p.w - 12, 46, 14, 4);
  }

  ctx.restore();
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  frame: number,
  camX: number,
  worldNum = 1,
) {
  if (!e.alive && e.stompAnim <= 0) return;
  const sx = e.x - camX;
  const sy = e.stompAnim > 0 ? e.y + e.h - 8 : e.y;
  const sh = e.stompAnim > 0 ? 8 : e.h;

  if (worldNum === 4) {
    // Sky Goblin - winged green enemy
    if (e.stompAnim > 0) {
      ctx.fillStyle = "#22AA44";
      ctx.fillRect(sx, sy + sh * 0.45, e.w, sh * 0.55);
      return;
    }
    const wingFlap = Math.floor(frame / 8) % 2;
    // Wings
    ctx.fillStyle = "rgba(150,220,255,0.85)";
    const wW = 18;
    const wH = 10;
    if (wingFlap === 0) {
      ctx.beginPath();
      ctx.ellipse(sx - 6, sy + 10, wW, wH, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + e.w + 6, sy + 10, wW, wH, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(sx - 4, sy + 16, wW, wH * 0.6, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + e.w + 4, sy + 16, wW, wH * 0.6, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body
    ctx.fillStyle = "#22AA44";
    ctx.beginPath();
    ctx.arc(sx + e.w / 2, sy + sh * 0.55, e.w / 2, Math.PI, 0);
    ctx.fillRect(sx, sy + sh * 0.45, e.w, sh * 0.55);
    ctx.fill();
    // Face
    ctx.fillStyle = "#88FFAA";
    ctx.fillRect(sx + e.w * 0.2, sy + sh * 0.2, e.w * 0.6, sh * 0.4);
    // Eyes
    ctx.fillStyle = "#FF2200";
    ctx.fillRect(sx + e.w * 0.22, sy + sh * 0.28, 5, 5);
    ctx.fillRect(sx + e.w * 0.6, sy + sh * 0.28, 5, 5);
    // Horns
    ctx.fillStyle = "#FF8800";
    ctx.fillRect(sx + 4, sy, 4, 8);
    ctx.fillRect(sx + e.w - 8, sy, 4, 8);
    // Feet
    ctx.fillStyle = "#22AA44";
    const walkFrame = Math.floor(frame / 10) % 2;
    if (walkFrame === 0) {
      ctx.fillRect(sx + 2, sy + sh - 8, 10, 8);
      ctx.fillRect(sx + e.w - 12, sy + sh - 8, 10, 8);
    } else {
      ctx.fillRect(sx + 5, sy + sh - 8, 10, 8);
      ctx.fillRect(sx + e.w - 15, sy + sh - 8, 10, 8);
    }
    return;
  }

  const bodyColor =
    worldNum === 3 ? "#CC2200" : worldNum === 2 ? "#5B1A8B" : ENEMY_BODY;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(sx + e.w / 2, sy + sh * 0.55, e.w / 2, Math.PI, 0);
  ctx.fillRect(sx, sy + sh * 0.45, e.w, sh * 0.55);
  ctx.fill();

  if (e.stompAnim > 0) return;

  ctx.fillStyle =
    worldNum === 3 ? "#FF9966" : worldNum === 2 ? "#D9A0FF" : "#FFCC88";
  ctx.fillRect(sx + e.w * 0.2, sy + sh * 0.2, e.w * 0.6, sh * 0.4);

  ctx.fillStyle = "#000";
  const eyeFrame = Math.floor(frame / 20) % 2 === 0 ? 0 : 1;
  ctx.fillRect(sx + e.w * 0.22, sy + sh * 0.28, 5, eyeFrame === 0 ? 5 : 3);
  ctx.fillRect(sx + e.w * 0.6, sy + sh * 0.28, 5, eyeFrame === 0 ? 5 : 3);

  ctx.fillStyle = worldNum === 3 ? "#FF6600" : "#CC2200";
  ctx.fillRect(sx + e.w * 0.3, sy + sh * 0.55, e.w * 0.4, 4);

  const walkFrame = Math.floor(frame / 10) % 2;
  ctx.fillStyle = bodyColor;
  if (walkFrame === 0) {
    ctx.fillRect(sx + 2, sy + sh - 8, 10, 8);
    ctx.fillRect(sx + e.w - 12, sy + sh - 8, 10, 8);
  } else {
    ctx.fillRect(sx + 5, sy + sh - 8, 10, 8);
    ctx.fillRect(sx + e.w - 15, sy + sh - 8, 10, 8);
  }
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  coin: Coin,
  frame: number,
  camX: number,
) {
  if (coin.collected) return;
  const sx = coin.x - camX;
  const sy = coin.y + Math.sin(frame * 0.08 + coin.bobOffset) * 5;
  const r = coin.r;

  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.5);
  glow.addColorStop(0, "rgba(255,153,0,0.3)");
  glow.addColorStop(1, "rgba(255,153,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(
    sx - r * 0.3,
    sy - r * 0.3,
    0,
    sx,
    sy,
    r,
  );
  grad.addColorStop(0, "#FFB347");
  grad.addColorStop(0.5, "#FF9900");
  grad.addColorStop(1, "#CC7700");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#FF6600";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${r * 1.2}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₿", sx, sy + 0.5);
  ctx.textBaseline = "alphabetic";
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  plat: Platform,
  camX: number,
  worldNum = 1,
) {
  const sx = plat.x - camX;
  if (sx > ctx.canvas.width + 10 || sx + plat.w < -10) return;

  let pc: string;
  let pd: string;
  if (worldNum === 4) {
    pc = PLAT_COLOR_W4;
    pd = PLAT_DARK_W4;
  } else if (worldNum === 3) {
    pc = PLAT_COLOR_W3;
    pd = PLAT_DARK_W3;
  } else if (worldNum === 2) {
    pc = PLAT_COLOR_W2;
    pd = PLAT_DARK_W2;
  } else {
    pc = PLAT_COLOR;
    pd = PLAT_DARK;
  }

  ctx.fillStyle = pc;
  ctx.fillRect(sx, plat.y, plat.w, plat.h);
  ctx.fillStyle = pd;
  ctx.fillRect(sx, plat.y + 5, plat.w, plat.h - 5);
  ctx.fillStyle = pc;
  ctx.fillRect(sx, plat.y, plat.w, 8);
  ctx.fillStyle = pd;
  for (let bx = 0; bx < plat.w; bx += 20) {
    ctx.fillRect(sx + bx, plat.y, 2, 8);
  }

  if (worldNum === 4) {
    // Cloud puff highlights
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(sx, plat.y, plat.w, 4);
    // Cloud puff bumps on top
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let bx = 0; bx < plat.w; bx += 16) {
      ctx.beginPath();
      ctx.arc(sx + bx + 8, plat.y, 7, Math.PI, 0);
      ctx.fill();
    }
    if (plat.moving) {
      ctx.fillStyle = "rgba(100,180,255,0.6)";
      ctx.fillRect(sx + plat.w / 2 - 4, plat.y + 6, 8, 3);
    }
  } else if (worldNum === 2) {
    ctx.fillStyle = "rgba(200,100,255,0.25)";
    ctx.fillRect(sx, plat.y, plat.w, 3);
  } else if (worldNum === 3) {
    // Lava glow on top edge
    ctx.fillStyle = "rgba(255,100,0,0.4)";
    ctx.fillRect(sx, plat.y, plat.w, 3);
    // Moving platform indicator (dashed arrows)
    if (plat.moving) {
      ctx.fillStyle = "rgba(255,200,0,0.6)";
      ctx.fillRect(sx + plat.w / 2 - 4, plat.y + 6, 8, 3);
    }
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  camX: number,
  worldNum = 1,
) {
  const groundY = Math.floor(canvasH * GROUND_Y_RATIO);

  let gt: string;
  let gm: string;
  let gd: string;
  if (worldNum === 4) {
    gt = GROUND_TOP_W4;
    gm = GROUND_MID_W4;
    gd = "#88AABB";
  } else if (worldNum === 3) {
    gt = GROUND_TOP_W3;
    gm = GROUND_MID_W3;
    gd = "#550800";
  } else if (worldNum === 2) {
    gt = GROUND_TOP_W2;
    gm = GROUND_MID_W2;
    gd = "#3A0A22";
  } else {
    gt = GROUND_TOP;
    gm = GROUND_MID;
    gd = "#7A4010";
  }

  ctx.fillStyle = gt;
  ctx.fillRect(0, groundY, canvasW, 18);

  ctx.fillStyle = gm;
  ctx.fillRect(0, groundY + 18, canvasW, GROUND_H - 18);

  ctx.fillStyle = gd;
  for (let y = groundY + 22; y < canvasH; y += 18) {
    ctx.fillRect(0, y, canvasW, 2);
  }
  const offset = (camX * 0.5) % 40;
  for (let x = -offset; x < canvasW; x += 40) {
    ctx.fillRect(x, groundY + 18, 2, canvasH - groundY);
  }

  if (worldNum === 4) {
    // Cloud shimmer on top of sky ground
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, groundY, canvasW, 5);
    ctx.fillStyle = "rgba(180,220,255,0.3)";
    for (let x = 0; x < canvasW; x += 50) {
      const cx = x - ((camX * 0.15) % 50);
      ctx.beginPath();
      ctx.arc(cx + 25, groundY, 14, Math.PI, 0);
      ctx.fill();
    }
  } else if (worldNum === 2) {
    ctx.fillStyle = "rgba(255,200,255,0.4)";
    for (let x = 20; x < canvasW; x += 60) {
      ctx.fillRect(x - ((camX * 0.2) % 60), groundY + 4, 3, 3);
    }
  } else if (worldNum === 3) {
    // Lava glow on top of ground
    ctx.fillStyle = "rgba(255,80,0,0.3)";
    ctx.fillRect(0, groundY, canvasW, 6);
  }
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  cloud: Cloud,
  camX: number,
  worldNum = 1,
) {
  const sx = cloud.x - camX * 0.3;
  if (worldNum === 4) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
  } else if (worldNum === 3) {
    ctx.fillStyle = "rgba(120,30,0,0.5)";
  } else if (worldNum === 2) {
    ctx.fillStyle = "rgba(120,80,180,0.5)";
  } else {
    ctx.fillStyle = CLOUD_COLOR;
  }
  ctx.beginPath();
  ctx.arc(sx + cloud.w * 0.3, cloud.y + 20, 22, 0, Math.PI * 2);
  ctx.arc(sx + cloud.w * 0.55, cloud.y + 12, 28, 0, Math.PI * 2);
  ctx.arc(sx + cloud.w * 0.8, cloud.y + 20, 20, 0, Math.PI * 2);
  ctx.fill();
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  isBoss: boolean,
  frame: number,
  worldNum = 1,
) {
  if (isBoss) {
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.03);
    let basePurple = 0;
    let baseRed = 0;
    if (worldNum === 2) basePurple = 30;
    if (worldNum === 3) baseRed = 40;
    if (worldNum === 4) basePurple = 20;
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * GROUND_Y_RATIO);
    grad.addColorStop(
      0,
      `rgb(${Math.floor(20 + pulse * 20 + baseRed)},${basePurple},${Math.floor(40 + pulse * 30 + basePurple)})`,
    );
    grad.addColorStop(
      1,
      `rgb(${Math.floor(60 + pulse * 20 + baseRed)},${basePurple},${Math.floor(80 + pulse * 20 + basePurple)})`,
    );
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (Math.floor(frame / 60) % 3 === 0 && frame % 5 < 2) {
      let flashColor: string;
      if (worldNum === 4) flashColor = "rgba(100,200,255,0.25)";
      else if (worldNum === 3) flashColor = "rgba(255,80,0,0.2)";
      else if (worldNum === 2) flashColor = "rgba(255,50,50,0.15)";
      else flashColor = "rgba(180,100,255,0.15)";
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
  } else if (worldNum === 4) {
    // World 4 - bright sky blue gradient with drifting clouds
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * GROUND_Y_RATIO);
    grad.addColorStop(0, SKY_TOP_W4);
    grad.addColorStop(1, SKY_BOT_W4);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Drifting small cloud puffs as particles
    const groundY4 = Math.floor(canvasH * GROUND_Y_RATIO);
    for (let i = 0; i < 30; i++) {
      const camX4 =
        (ctx as CanvasRenderingContext2D & { _camX?: number })._camX ?? 0;
      const cx =
        ((i * 211 + frame * (0.2 + (i % 4) * 0.1)) % (canvasW + 200)) - 100;
      const cy = 30 + ((i * 97) % (groundY4 * 0.7));
      const cr = 8 + (i % 5) * 4;
      const alpha = 0.15 + 0.25 * Math.abs(Math.sin(frame * 0.02 + i * 0.8));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cx - camX4 * 0.05, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Subtle sun glow
    const sunGrad = ctx.createRadialGradient(
      canvasW * 0.85,
      canvasH * 0.12,
      0,
      canvasW * 0.85,
      canvasH * 0.12,
      80,
    );
    sunGrad.addColorStop(0, "rgba(255,240,120,0.35)");
    sunGrad.addColorStop(1, "rgba(255,240,120,0)");
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (worldNum === 3) {
    // World 3 - dark red volcanic sky with ember particles
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * GROUND_Y_RATIO);
    grad.addColorStop(0, SKY_TOP_W3);
    grad.addColorStop(1, SKY_BOT_W3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw ember/spark particles drifting upward
    const groundY = Math.floor(canvasH * GROUND_Y_RATIO);
    for (let i = 0; i < 50; i++) {
      const ex =
        ((i * 173 + 17) % (canvasW + 100)) -
        ((ctx as CanvasRenderingContext2D & { _camX?: number })._camX ?? 0) *
          0.04;
      const baseY =
        groundY - ((i * 43 + frame * (0.3 + (i % 3) * 0.2)) % groundY);
      const alpha = 0.3 + 0.7 * Math.abs(Math.sin(frame * 0.04 + i * 0.6));
      ctx.globalAlpha = alpha;
      ctx.fillStyle =
        i % 3 === 0 ? "#FF6600" : i % 3 === 1 ? "#FF9900" : "#FFCC00";
      const r = 1 + (i % 3);
      ctx.beginPath();
      ctx.arc(ex % canvasW, baseY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Lava glow at horizon
    const lavGrad = ctx.createLinearGradient(0, groundY - 60, 0, groundY);
    lavGrad.addColorStop(0, "rgba(200,50,0,0)");
    lavGrad.addColorStop(1, "rgba(200,50,0,0.3)");
    ctx.fillStyle = lavGrad;
    ctx.fillRect(0, groundY - 60, canvasW, 60);
  } else if (worldNum === 2) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * GROUND_Y_RATIO);
    grad.addColorStop(0, SKY_TOP_W2);
    grad.addColorStop(1, SKY_BOT_W2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const starSeed = 42;
    for (let i = 0; i < 60; i++) {
      const sx =
        ((i * 137 + starSeed) % (canvasW + 200)) -
        ((ctx as CanvasRenderingContext2D & { _camX?: number })._camX ?? 0) *
          0.05;
      const sy = ((i * 97 + starSeed) % (canvasH * GROUND_Y_RATIO * 0.8)) + 10;
      const tw = (frame * 0.05 + i * 0.5) % (Math.PI * 2);
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(tw));
      ctx.globalAlpha = alpha;
      ctx.fillRect(sx % canvasW, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.beginPath();
    ctx.arc(canvasW * 0.8, canvasH * 0.15, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKY_TOP_W2;
    ctx.beginPath();
    ctx.arc(canvasW * 0.83, canvasH * 0.12, 26, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * GROUND_Y_RATIO);
    grad.addColorStop(0, SKY_TOP);
    grad.addColorStop(1, SKY_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  frame: number,
  camX: number,
  worldNum = 1,
) {
  if (!boss.alive && boss.deathAnim <= 0) return;

  const sx = boss.x - camX;
  const sy = boss.y;
  const w = boss.w;
  const h = boss.h;

  if (!boss.alive) {
    const t = 1 - boss.deathAnim / 90;
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      const r = (t * 200 + i * 30) * (1 - i * 0.1);
      const alpha = Math.max(0, 1 - t * 2 - i * 0.15);
      let col: string;
      if (worldNum === 4) col = `rgba(100,200,255,${alpha})`;
      else if (worldNum === 3) col = `rgba(255,100,0,${alpha})`;
      else if (worldNum === 2) col = `rgba(255,50,50,${alpha})`;
      else col = `rgba(255,${150 + i * 20},0,${alpha})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx + w / 2, sy + h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  if (boss.hitFlash > 0 && Math.floor(boss.hitFlash / 3) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  ctx.save();
  if (boss.facingRight) {
    ctx.translate(sx + w / 2, sy + h / 2);
    ctx.scale(-1, 1);
    ctx.translate(-(w / 2), -(h / 2));
  } else {
    ctx.translate(sx, sy);
  }

  // Cape
  const capeColor =
    worldNum === 4
      ? "#0044AA"
      : worldNum === 3
        ? "#550000"
        : worldNum === 2
          ? "#800000"
          : "#4A0080";
  ctx.fillStyle = capeColor;
  ctx.beginPath();
  ctx.moveTo(-10, 20);
  ctx.lineTo(w + 10, 20);
  ctx.lineTo(w + 14, h + 20);
  ctx.lineTo(-14, h + 20);
  ctx.fill();

  // Body
  const bodyColor =
    worldNum === 4
      ? boss.isCharging
        ? "#0088FF"
        : "#002244"
      : worldNum === 3
        ? "#1A0000"
        : worldNum === 2
          ? "#1A0010"
          : boss.isCharging
            ? "#CC2200"
            : "#1A1A2E";
  ctx.fillStyle = bodyColor;
  ctx.fillRect(8, 28, w - 16, h - 40);

  // Chest plate
  const chestColor =
    worldNum === 3 ? "#880000" : worldNum === 2 ? "#AA0000" : "#8B0000";
  ctx.fillStyle = chestColor;
  ctx.fillRect(12, 32, w - 24, 30);
  const detailColor =
    worldNum === 3 ? "#FF6600" : worldNum === 2 ? "#FF4400" : "#FFD700";
  ctx.fillStyle = detailColor;
  ctx.fillRect(w / 2 - 3, 34, 6, 26);
  ctx.fillRect(14, 44, w - 28, 6);

  // Head
  ctx.fillStyle = "#D4A574";
  ctx.fillRect(10, 4, w - 20, 26);

  // Helmet
  const helmetColor =
    worldNum === 3 ? "#660000" : worldNum === 2 ? "#AA0000" : "#888888";
  ctx.fillStyle = helmetColor;
  ctx.fillRect(6, -4, w - 12, 14);
  ctx.fillRect(4, -2, w - 8, 8);
  // Horns
  const hornColor =
    worldNum === 3 ? "#FF4400" : worldNum === 2 ? "#FF6600" : "#BBBBBB";
  ctx.fillStyle = hornColor;
  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.lineTo(-8, -24);
  ctx.lineTo(2, -4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w - 6, -4);
  ctx.lineTo(w + 8, -24);
  ctx.lineTo(w - 2, -4);
  ctx.fill();

  // Eyes
  const eyeColor =
    worldNum === 3 ? "#FF6600" : worldNum === 2 ? "#FF4400" : "#FF0000";
  ctx.fillStyle = eyeColor;
  ctx.fillRect(14, 8, 8, 6);
  ctx.fillRect(w - 22, 8, 8, 6);
  const eyeGlow =
    worldNum === 3
      ? "rgba(255,100,0,0.6)"
      : worldNum === 2
        ? "rgba(255,100,0,0.5)"
        : "rgba(255,0,0,0.4)";
  ctx.fillStyle = eyeGlow;
  ctx.beginPath();
  ctx.arc(18, 11, 8, 0, Math.PI * 2);
  ctx.arc(w - 18, 11, 8, 0, Math.PI * 2);
  ctx.fill();

  // Beard
  const beardColor =
    worldNum === 3 ? "#CC4400" : worldNum === 2 ? "#AA6600" : "#888888";
  ctx.fillStyle = beardColor;
  ctx.fillRect(12, 24, 6, 12);
  ctx.fillRect(18, 26, 5, 14);
  ctx.fillRect(23, 25, 5, 12);
  ctx.fillRect(w - 22, 24, 6, 12);
  ctx.fillRect(w - 27, 26, 5, 14);
  ctx.fillRect(w - 32, 25, 5, 12);

  // Weapon
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(w - 4, -20, 6, h + 30);
  const spearColor =
    worldNum === 3 ? "#FF6600" : worldNum === 2 ? "#FF4400" : "#888888";
  ctx.fillStyle = spearColor;
  ctx.beginPath();
  ctx.moveTo(w - 4, -20);
  ctx.lineTo(w + 2, -20);
  ctx.lineTo(w - 1, -40);
  ctx.fill();
  const orbPulse = 0.5 + 0.5 * Math.sin(frame * 0.1);
  const orbColor =
    worldNum === 3
      ? `rgba(255,80,0,${0.7 + orbPulse * 0.3})`
      : worldNum === 2
        ? `rgba(255,50,0,${0.7 + orbPulse * 0.3})`
        : `rgba(180,0,255,${0.7 + orbPulse * 0.3})`;
  ctx.fillStyle = orbColor;
  ctx.beginPath();
  ctx.arc(w - 1, -12, 8 + orbPulse * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(w - 3, -14, 3, 0, Math.PI * 2);
  ctx.fill();

  if (worldNum === 2 || worldNum === 3 || worldNum === 4) {
    const aura = 0.3 + 0.2 * Math.sin(frame * 0.15);
    const auraColor =
      worldNum === 4
        ? `rgba(100,200,255,${aura})`
        : worldNum === 3
          ? `rgba(255,80,0,${aura})`
          : `rgba(255,50,0,${aura})`;
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.8 + orbPulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    // World 3: extra fiery outer ring
    if (worldNum === 4) {
      // Lightning bolt crackles around Storm Odin
      const lightFrame = Math.floor(frame / 4) % 3;
      if (lightFrame < 2) {
        ctx.strokeStyle = `rgba(150,230,255,${0.3 + lightFrame * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const offsetX =
          boss.x -
          ((ctx as CanvasRenderingContext2D & { _camX?: number })._camX ?? 0);
        ctx.moveTo(offsetX + boss.w / 2, boss.y - 10);
        ctx.lineTo(
          offsetX + boss.w / 2 + (lightFrame === 0 ? 15 : -15),
          boss.y + 20,
        );
        ctx.lineTo(
          offsetX + boss.w / 2 + (lightFrame === 0 ? 5 : -5),
          boss.y + 40,
        );
        ctx.stroke();
      }
    } else if (worldNum === 3) {
      ctx.strokeStyle = `rgba(255,160,0,${aura * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 1.1 + orbPulse * 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Legs
  const legColor =
    worldNum === 3 ? "#1A0000" : worldNum === 2 ? "#1A0010" : "#1A1A2E";
  ctx.fillStyle = legColor;
  const legWalk = boss.isCharging
    ? Math.floor(frame / 3) % 2
    : Math.floor(frame / 12) % 2;
  if (legWalk === 0) {
    ctx.fillRect(12, h - 16, 18, 16);
    ctx.fillRect(w - 30, h - 16, 18, 16);
  } else {
    ctx.fillRect(8, h - 16, 18, 16);
    ctx.fillRect(w - 26, h - 16, 18, 16);
  }
  ctx.fillStyle = "#2B1800";
  if (legWalk === 0) {
    ctx.fillRect(10, h - 2, 22, 6);
    ctx.fillRect(w - 32, h - 2, 22, 6);
  } else {
    ctx.fillRect(6, h - 2, 22, 6);
    ctx.fillRect(w - 28, h - 2, 22, 6);
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  // Name tag
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  const nameW = 180;
  ctx.beginPath();
  ctx.roundRect(sx + w / 2 - nameW / 2, sy - 60, nameW, 28, 6);
  ctx.fill();
  const nameColor =
    worldNum === 4
      ? "#00CCFF"
      : worldNum === 3
        ? "#FF6600"
        : worldNum === 2
          ? "#FF4400"
          : "#FFD700";
  ctx.fillStyle = nameColor;
  ctx.font = "bold 14px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "center";
  const bossName =
    worldNum === 4
      ? "⚡ STORM ODIN ⚡"
      : worldNum === 3
        ? "🔥 LAVA ODIN 🔥"
        : worldNum === 2
          ? "⚡ ODIN UNLEASHED ⚡"
          : "⚡ ODIN ⚡";
  ctx.fillText(bossName, sx + w / 2, sy - 40);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawQuestionBoxes(
  ctx: CanvasRenderingContext2D,
  boxes: QuestionBox[],
  camX: number,
  frame: number,
) {
  for (const box of boxes) {
    const sx = box.x - camX;
    const sy = box.y + box.animOffset;

    if (box.used) {
      // Used box - grey
      ctx.fillStyle = "#8B7355";
      ctx.fillRect(sx, sy, box.width, box.height);
      ctx.strokeStyle = "#5A4A35";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, box.width - 2, box.height - 2);
      ctx.fillStyle = "#7A6345";
      ctx.fillRect(sx + 4, sy + 4, box.width - 8, box.height - 8);
    } else {
      // Unused - golden yellow with ?
      const pulse = 0.85 + 0.15 * Math.sin(frame * 0.08);
      ctx.fillStyle = `rgba(255, ${Math.floor(200 * pulse)}, 0, 1)`;
      ctx.fillRect(sx, sy, box.width, box.height);
      ctx.strokeStyle = "#CC8800";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, box.width - 2, box.height - 2);
      // Inner highlight
      ctx.fillStyle = "rgba(255,255,100,0.3)";
      ctx.fillRect(sx + 3, sy + 3, box.width - 6, 8);
      // ? symbol
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#FF8800";
      ctx.shadowBlur = 6;
      ctx.fillText("?", sx + box.width / 2, sy + box.height / 2 + 1);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
}

function drawPowerupPickups(
  ctx: CanvasRenderingContext2D,
  pickups: PowerUpPickup[],
  camX: number,
  frame: number,
) {
  for (const pu of pickups) {
    if (pu.collected) continue;
    const sx = pu.x - camX;
    const sy = pu.y;
    const pulse = 0.6 + 0.4 * Math.sin(frame * 0.15);
    // Glow effect
    ctx.shadowColor = "#00FFFF";
    ctx.shadowBlur = 12 * pulse;
    // Draw lightning bolt symbol
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", sx + 16, sy + 16);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  bullets: Bullet[],
  bossProjectiles: BossProjectile[],
  camX: number,
  frame: number,
  worldNum = 1,
) {
  for (const b of bullets) {
    if (!b.alive) continue;
    const sx = b.x - camX;
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.3);
    ctx.fillStyle = `rgba(255,${200 + Math.floor(pulse * 55)},0,0.9)`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#FFD700";
    ctx.beginPath();
    ctx.ellipse(sx, b.y, 12, 5, b.vx > 0 ? 0 : Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const bp of bossProjectiles) {
    if (!bp.alive) continue;
    const sx = bp.x - camX;
    if (worldNum === 4) {
      // Lightning bolt projectile - slim bright yellow/white line
      ctx.save();
      ctx.strokeStyle = "#FFFF88";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#00CCFF";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(sx - bp.vx * 2, bp.y - bp.vy * 2);
      ctx.lineTo(sx + bp.vx * 1, bp.y + bp.vy * 1);
      ctx.stroke();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - bp.vx * 1.5, bp.y - bp.vy * 1.5);
      ctx.lineTo(sx + bp.vx * 0.5, bp.y + bp.vy * 0.5);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      continue;
    }
    let projColor: string;
    let glowColor: string;
    if (worldNum === 3) {
      projColor = "rgba(255,100,0,0.95)";
      glowColor = "#FF4400";
    } else if (worldNum === 2) {
      projColor = "rgba(255,80,0,0.9)";
      glowColor = "#FF4400";
    } else {
      projColor = "rgba(200,50,255,0.9)";
      glowColor = "#AA00FF";
    }
    ctx.strokeStyle = projColor;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = glowColor;
    ctx.beginPath();
    const len = 20;
    ctx.moveTo(sx - len, bp.y);
    ctx.lineTo(sx - len * 0.5, bp.y - 6);
    ctx.lineTo(sx, bp.y + 4);
    ctx.lineTo(sx + len * 0.5, bp.y - 4);
    ctx.lineTo(sx + len, bp.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // World 3: lava ball appearance
    if (worldNum === 3) {
      ctx.fillStyle = "#FF6600";
      ctx.beginPath();
      ctx.arc(sx, bp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFCC00";
      ctx.beginPath();
      ctx.arc(sx - 1, bp.y - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(sx, bp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBossHPBar(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  canvasW: number,
  frame: number,
  worldNum = 1,
) {
  const barW = Math.min(canvasW * 0.6, 500);
  const barX = (canvasW - barW) / 2;
  const barY = 14;
  const barH = 22;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.roundRect(barX - 60, barY - 4, barW + 120, barH + 20, 10);
  ctx.fill();

  let labelColor: string;
  let labelText: string;
  let bgColor: string;
  if (worldNum === 4) {
    labelColor = "#00CCFF";
    labelText = "⚡ STORM ODIN - WORLD 4 BOSS ⚡";
    bgColor = "#001133";
  } else if (worldNum === 3) {
    labelColor = "#FF6600";
    labelText = "🔥 LAVA ODIN - WORLD 3 BOSS 🔥";
    bgColor = "#330000";
  } else if (worldNum === 2) {
    labelColor = "#FF6622";
    labelText = "⚡ ODIN UNLEASHED - WORLD 2 BOSS ⚡";
    bgColor = "#330000";
  } else {
    labelColor = "#FFD700";
    labelText = "⚡ ODIN - LORD OF THUNDER ⚡";
    bgColor = "#330033";
  }

  ctx.fillStyle = labelColor;
  ctx.font = "bold 12px 'Figtree', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(labelText, canvasW / 2, barY + 9);

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY + 14, barW, barH - 8, 4);
  ctx.fill();

  const hpRatio = boss.hp / boss.maxHp;
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.1);
  const r = Math.floor(200 + 55 * (1 - hpRatio));
  const g = worldNum === 1 ? Math.floor(50 * hpRatio) : 0;
  const bComp = worldNum === 1 ? Math.floor(100 + pulse * 50) : 0;
  ctx.fillStyle = `rgba(${r},${g},${bComp},0.9)`;
  ctx.beginPath();
  ctx.roundRect(barX, barY + 14, barW * hpRatio, barH - 8, 4);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.roundRect(barX, barY + 14, barW * hpRatio, (barH - 8) / 2, 4);
  ctx.fill();

  ctx.textAlign = "left";
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  lives: number,
  canvasW: number,
  worldNum = 1,
  tripleShotTimer = 0,
  tokenPrice = 0,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 200, 50, 12);
  ctx.fill();

  ctx.fillStyle = COIN_COLOR;
  ctx.font = "bold 14px 'Figtree', sans-serif";
  ctx.fillText(`₿ ${score}`, 24, 32);

  ctx.fillStyle = "#FF3366";
  ctx.font = "16px sans-serif";
  for (let i = 0; i < lives; i++) {
    ctx.fillText("♥", 24 + i * 22, 54);
  }

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(canvasW - 210, 10, 200, 36, 10);
  ctx.fill();

  let worldColor: string;
  let worldLabel: string;
  if (worldNum === 4) {
    worldColor = "#00CCFF";
    worldLabel = "⚡ WORLD 4 - SKY ⚡";
  } else if (worldNum === 3) {
    worldColor = "#FF6600";
    worldLabel = "🔥 WORLD 3 - LAVA 🔥";
  } else if (worldNum === 2) {
    worldColor = "#FF6622";
    worldLabel = "★ WORLD 2 - NIGHT ★";
  } else {
    worldColor = STAR_COLOR;
    worldLabel = "✶ ODIN MARIO";
  }

  ctx.fillStyle = worldColor;
  ctx.font = "bold 16px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(worldLabel, canvasW - 110, 33);
  ctx.textAlign = "left";

  // Triple shot indicator
  if (tripleShotTimer > 0) {
    const TRIPLE_MAX = 600;
    const ratio = tripleShotTimer / TRIPLE_MAX;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(10, 68, 200, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#00FFFF";
    ctx.shadowColor = "#00FFFF";
    ctx.shadowBlur = 8;
    ctx.font = "bold 13px 'Figtree', sans-serif";
    ctx.fillText("⚡ 3x SHOT", 24, 83);
    ctx.shadowBlur = 0;
    // Timer bar
    ctx.fillStyle = "rgba(0,255,255,0.2)";
    ctx.fillRect(24, 90, 172, 6);
    ctx.fillStyle = "#00FFFF";
    ctx.fillRect(24, 90, Math.floor(172 * ratio), 6);
  }

  // Token price pill
  if (tokenPrice > 0) {
    const priceSats = (tokenPrice / 1000).toFixed(3);
    const label = `ODINMARIO ${priceSats} sats`;
    const iconSize = 16;
    ctx.font = "bold 11px 'Figtree', sans-serif";
    const tw = ctx.measureText(label).width;
    const px = 10;
    const py = 115;
    const pw = tw + iconSize + 26;
    const ph = 22;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 8);
    ctx.fill();
    // Draw circular icon
    const iconX = px + 10 + iconSize / 2;
    const iconY = py + ph / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
    ctx.clip();
    const img = getPriceIconImg();
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(
        img,
        iconX - iconSize / 2,
        iconY - iconSize / 2,
        iconSize,
        iconSize,
      );
    } else {
      ctx.fillStyle = "#FF8C00";
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#FFD700";
    ctx.fillText(label, px + 10 + iconSize + 6, py + 15);
  }

  ctx.restore();
}

function drawShootHint(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  isBoss: boolean,
) {
  if (!isBoss) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(canvasW / 2 - 90, 70, 180, 26, 8);
  ctx.fill();
  ctx.fillStyle = "#FF9900";
  ctx.font = "bold 12px 'Figtree', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🔫 Z / F key = SHOOT!", canvasW / 2, 88);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  fl: { x: number; y: number; active: boolean; animFrame: number },
  camX: number,
  groundY: number,
  worldNum: number,
) {
  if (!fl.active) return;
  const sx = fl.x - camX;
  const poleH = groundY - 40;
  const poleX = sx + 20;
  const flagColors =
    worldNum === 4
      ? ["#00CFFF", "#0080FF"]
      : worldNum === 3
        ? ["#FF4400", "#FF8800"]
        : worldNum === 2
          ? ["#CC44FF", "#8800FF"]
          : ["#00DD44", "#FFDD00"];

  ctx.save();

  // Glow effect
  const glowAmt = Math.sin(fl.animFrame * 0.1) * 0.5 + 0.5;
  ctx.shadowColor = flagColors[0];
  ctx.shadowBlur = 20 + glowAmt * 15;

  // Pole
  ctx.fillStyle = "#CCCCCC";
  ctx.fillRect(poleX - 4, groundY - poleH, 8, poleH);

  // Flag waving
  const wave = Math.sin(fl.animFrame * 0.12) * 8;
  ctx.fillStyle = flagColors[0];
  ctx.beginPath();
  ctx.moveTo(poleX + 4, groundY - poleH + 10);
  ctx.quadraticCurveTo(
    poleX + 44 + wave,
    groundY - poleH + 25,
    poleX + 4,
    groundY - poleH + 40,
  );
  ctx.closePath();
  ctx.fill();

  // Star on top
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#FFD700";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("★", poleX, groundY - poleH + 5);

  // FINISH text
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(sx - 10, groundY - poleH - 36, 80, 28, 8);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = 'bold 14px "Figtree", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("FINISH!", sx + 20, groundY - poleH - 17);

  // Arrow hint
  const arrAlpha = 0.5 + glowAmt * 0.5;
  ctx.fillStyle = `rgba(255,255,100,${arrAlpha})`;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(
    "→",
    sx - 30 + Math.sin(fl.animFrame * 0.15) * 6,
    groundY - poleH + 60,
  );

  ctx.restore();
}

// ─── Physics helpers ──────────────────────────────────────────────────────────

function rectOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolvePlatformCollision(
  entity: {
    x: number;
    y: number;
    w: number;
    h: number;
    vy: number;
    vx: number;
    onGround: boolean;
    jumpsLeft: number;
  },
  plat: Platform,
): boolean {
  if (
    !rectOverlap(
      entity.x,
      entity.y,
      entity.w,
      entity.h,
      plat.x,
      plat.y,
      plat.w,
      plat.h,
    )
  )
    return false;

  const overlapLeft = entity.x + entity.w - plat.x;
  const overlapRight = plat.x + plat.w - entity.x;
  const overlapTop = entity.y + entity.h - plat.y;
  const overlapBottom = plat.y + plat.h - entity.y;

  const overlapX = Math.min(overlapLeft, overlapRight);
  const overlapY = Math.min(overlapTop, overlapBottom);

  const SEP = 1;

  if (overlapY <= overlapX) {
    if (overlapTop <= overlapBottom) {
      entity.y = plat.y - entity.h - SEP;
      entity.vy = 0;
      entity.onGround = true;
      entity.jumpsLeft = 2;
    } else {
      entity.y = plat.y + plat.h + SEP;
      entity.vy = 0;
    }
  } else {
    if (overlapLeft <= overlapRight) {
      entity.x = plat.x - entity.w - SEP;
    } else {
      entity.x = plat.x + plat.w + SEP;
    }
    entity.vx = 0;
  }

  return true;
}

function spawnBoss(
  canvasW: number,
  canvasH: number,
  arenaX: number,
  worldNum = 1,
): Boss {
  const groundY = Math.floor(canvasH * GROUND_Y_RATIO);
  let hp: number;
  if (worldNum === 4) hp = BOSS_HP_W4;
  else if (worldNum === 3) hp = BOSS_HP_W3;
  else if (worldNum === 2) hp = BOSS_HP_W2;
  else hp = BOSS_HP;

  const shootTimer =
    worldNum === 4 ? 28 : worldNum === 3 ? 35 : worldNum === 2 ? 50 : 80;

  return {
    x: arenaX + canvasW * 0.75,
    y: groundY - 100,
    w: 72,
    h: 100,
    hp,
    maxHp: hp,
    vx: 0,
    facingRight: false,
    shootTimer,
    chargeTimer: 0,
    isCharging: false,
    hitFlash: 0,
    alive: true,
    deathAnim: 0,
  };
}

// ─── Game Component ───────────────────────────────────────────────────────────

export default function Game({
  onLaunchPacMan,
  onLaunchContra,
  onLaunchSnake,
  onLaunchChess,
  onLaunchBear,
  onLaunchOdinWarrior,
  onLaunchBabyOdin,
  onLaunchOdinSpace,
  onLaunchPvPFighting: _onLaunchPvPFighting,
  onLaunchChessPvP,
  onLaunchPenalty,
  onLogout,
  walletAddress,
}: {
  onLaunchPacMan?: () => void;
  onLaunchContra?: () => void;
  onLaunchSnake?: () => void;
  onLaunchChess?: () => void;
  onLaunchBear?: () => void;
  onLaunchOdinWarrior?: () => void;
  onLaunchBabyOdin?: () => void;
  onLaunchOdinSpace?: () => void;
  onLaunchPvPFighting?: () => void;
  onLaunchChessPvP?: () => void;
  onLaunchPenalty?: () => void;
  onLogout?: () => void;
  walletAddress?: string;
}) {
  const { actor } = useActor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameStateRef | null>(null);
  const rafRef = useRef<number>(0);
  const lastJumpKeyRef = useRef(false);
  const lastTouchJumpRef = useRef(false);
  const lastShootKeyRef = useRef(false);
  const lastTouchShootRef = useRef(false);
  const chunksGeneratedRef = useRef(4);
  const transitionToWorld2Ref = useRef<
    ((score: number, lives: number) => void) | null
  >(null);
  const transitionToWorld3Ref = useRef<
    ((score: number, lives: number) => void) | null
  >(null);
  const transitionToWorld4Ref = useRef<
    ((score: number, lives: number) => void) | null
  >(null);

  const [gameState, setGameState] = useState<GameState>("start");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [bossIntroVisible, setBossIntroVisible] = useState(false);
  const [bossCountdown, setBossCountdown] = useState<number | null>(null);
  const [currentWorld, setCurrentWorld] = useState(1);
  const [world2IntroVisible, setWorld2IntroVisible] = useState(false);
  const [world3IntroVisible, setWorld3IntroVisible] = useState(false);
  const [world4IntroVisible, setWorld4IntroVisible] = useState(false);
  const [tripleShotTimeLeft, setTripleShotTimeLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const autoSubmitFiredRef = useRef(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<
    Array<{ score: bigint; playerName: string }>
  >([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showScoreSubmit, setShowScoreSubmit] = useState(false);
  const [playerName, setPlayerName] = useState(
    localStorage.getItem("odinmario_username") || "",
  );
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [usernameInput, setUsernameInput] = useState(
    localStorage.getItem("odinmario_username") || "",
  );
  const [usernameSaved, setUsernameSaved] = useState(false);

  // Sync wallet address to username when walletAddress prop changes
  useEffect(() => {
    if (!walletAddress) return;
    const stored = localStorage.getItem("odinmario_username") || "";
    const name = stored || truncateAddress(walletAddress);
    setPlayerName(name);
    setUsernameInput(name);
  }, [walletAddress]);
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [tokenStats, setTokenStats] = useState<{
    price: number;
    holders: number;
    mcap: number;
  } | null>(null);
  const [btcUsdPrice, setBtcUsdPrice] = useState<number>(0);
  const tokenPriceRef = useRef<number>(0);
  const prevPriceRef = useRef<number>(0);
  const [priceAlert, setPriceAlert] = useState<{
    direction: "up" | "down";
    pct: number;
  } | null>(null);
  const [topHolders, setTopHolders] = useState<
    { address: string; username: string; balance: number }[]
  >([]);
  const [topHoldersLoading, setTopHoldersLoading] = useState(true);
  const [topHoldersError, setTopHoldersError] = useState(false);
  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        );
        const json = await res.json();
        const price = json?.bitcoin?.usd ?? 0;
        if (price > 0) setBtcUsdPrice(price);
      } catch {}
    };
    fetchBtcPrice();
    const btcInterval = setInterval(fetchBtcPrice, 60000);
    return () => clearInterval(btcInterval);
  }, []);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("https://api.odin.fun/v1/token/2ip5", {
          headers: { Accept: "application/json" },
        });
        const json = await res.json();
        const d = json?.data ?? json ?? {};
        const raw = d?.price ?? 0;
        if (raw > 0) {
          if (prevPriceRef.current > 0) {
            const pctChange =
              ((raw - prevPriceRef.current) / prevPriceRef.current) * 100;
            if (Math.abs(pctChange) >= 5) {
              const dir: "up" | "down" = pctChange > 0 ? "up" : "down";
              setPriceAlert({ direction: dir, pct: Math.abs(pctChange) });
              setTimeout(() => setPriceAlert(null), 4000);
            }
          }
          prevPriceRef.current = raw;
          tokenPriceRef.current = raw;
        }
        setTokenStats({
          price: d?.price ?? 0,
          holders: d?.holder_count ?? 0,
          mcap: d?.marketcap ?? 0,
        });
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    const fetchHolders = async () => {
      try {
        setTopHoldersLoading(true);
        setTopHoldersError(false);
        const res = await fetch(
          "https://api.odin.fun/v1/token/2ip5/owners?limit=10&sort=balance:desc",
          { headers: { Accept: "application/json" } },
        );
        const json = await res.json();
        const list: any[] = Array.isArray(json) ? json : (json?.data ?? []);
        const mapped = list
          .slice(0, 10)
          .map((h: any) => ({
            address: h?.user ?? "",
            username: h?.user_username ?? "",
            balance: Number(h?.balance ?? 0),
          }))
          .filter((h) => h.address !== "");
        setTopHolders(mapped);
        setTopHoldersLoading(false);
      } catch {
        setTopHoldersError(true);
        setTopHoldersLoading(false);
      }
    };
    fetchHolders();
    const holdersInterval = setInterval(fetchHolders, 60000);
    return () => {
      clearInterval(interval);
      clearInterval(holdersInterval);
    };
  }, []);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const transitionToWorld2 = useCallback(
    (savedScore: number, savedLives: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setCurrentWorld(2);
      const gs2 = createInitialState(
        canvas.width,
        canvas.height,
        2,
        savedScore,
        savedLives,
      );
      gsRef.current = gs2;
      chunksGeneratedRef.current = 4;
      setScore(savedScore);
      setLives(savedLives);
      setBossIntroVisible(false);
      setWorld2IntroVisible(true);
      setWorld3IntroVisible(false);
      setGameState("playing");
      setTimeout(() => setWorld2IntroVisible(false), 3500);
    },
    [],
  );

  const transitionToWorld3 = useCallback(
    (savedScore: number, savedLives: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setCurrentWorld(3);
      const gs3 = createInitialState(
        canvas.width,
        canvas.height,
        3,
        savedScore,
        savedLives,
      );
      gsRef.current = gs3;
      chunksGeneratedRef.current = 4;
      setScore(savedScore);
      setLives(savedLives);
      setBossIntroVisible(false);
      setWorld2IntroVisible(false);
      setWorld3IntroVisible(true);
      setWorld4IntroVisible(false);
      setGameState("playing");
      setTimeout(() => setWorld3IntroVisible(false), 3500);
    },
    [],
  );

  const transitionToWorld4 = useCallback(
    (savedScore: number, savedLives: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setCurrentWorld(4);
      const gs4 = createInitialState(
        canvas.width,
        canvas.height,
        4,
        savedScore,
        savedLives,
      );
      gsRef.current = gs4;
      chunksGeneratedRef.current = 4;
      setScore(savedScore);
      setLives(savedLives);
      setBossIntroVisible(false);
      setWorld2IntroVisible(false);
      setWorld3IntroVisible(false);
      setWorld4IntroVisible(true);
      setGameState("playing");
      setTimeout(() => setWorld4IntroVisible(false), 3500);
    },
    [],
  );

  transitionToWorld2Ref.current = transitionToWorld2;
  transitionToWorld3Ref.current = transitionToWorld3;
  transitionToWorld4Ref.current = transitionToWorld4;

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gs = createInitialState(canvas.width, canvas.height, 1, 0, 3);
    gsRef.current = gs;
    chunksGeneratedRef.current = 4;
    setScore(0);
    setLives(3);
    setCurrentWorld(1);
    setBossIntroVisible(false);
    setWorld2IntroVisible(false);
    setWorld3IntroVisible(false);
    setWorld4IntroVisible(false);
    setGameState("playing");
    setShowScoreSubmit(false);
    setScoreSubmitted(false);
    setPlayerName(localStorage.getItem("odinmario_username") || "");
    setPaused(false);
    pausedRef.current = false;
    setShowLeaderboard(false);
    autoSubmitFiredRef.current = false;
  }, []);

  // Auto-submit score if username is already saved
  useEffect(() => {
    if (!showScoreSubmit || scoreSubmitted) return;
    if (autoSubmitFiredRef.current) return;
    const savedName = localStorage.getItem("odinmario_username") || "";
    if (!savedName.trim()) return;
    autoSubmitFiredRef.current = true;
    setPlayerName(savedName);
    setScoreSubmitting(true);
    (async () => {
      try {
        await actor?.submitScore(savedName.trim(), BigInt(score));
        setScoreSubmitted(true);
        setShowLeaderboard(true);
        setLeaderboardLoading(true);
        const d = (await actor?.getTop10Scores()) ?? [];
        setLeaderboardData(d);
        setLeaderboardLoading(false);
      } catch {
        autoSubmitFiredRef.current = false;
      }
      setScoreSubmitting(false);
    })();
  }, [showScoreSubmit, scoreSubmitted, score, actor]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys[e.key] = true;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys[e.key] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional game loop
  useEffect(() => {
    if (gameState !== "playing" && gameState !== "boss") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let localScore = score;
    let localLives = lives;

    const loop = () => {
      const gs = gsRef.current;
      if (!gs) return;
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (gs.gameState !== "playing" && gs.gameState !== "boss") return;

      const W = canvas.width;
      const H = canvas.height;
      const groundY = Math.floor(H * GROUND_Y_RATIO);
      const worldNum = gs.currentWorld;

      gs.frame++;

      // ── Input ──
      const left = gs.keys.ArrowLeft || gs.keys.a || gs.keys.A || gs.touch.left;
      const right =
        gs.keys.ArrowRight || gs.keys.d || gs.keys.D || gs.touch.right;
      const jumpKey =
        gs.keys.ArrowUp ||
        gs.keys.w ||
        gs.keys.W ||
        gs.keys[" "] ||
        gs.touch.jump;
      const shootKey =
        gs.keys.z || gs.keys.Z || gs.keys.f || gs.keys.F || gs.touch.shoot;

      const jumpPressed = jumpKey && !lastJumpKeyRef.current;
      const touchJumpPressed = gs.touch.jump && !lastTouchJumpRef.current;
      const shootPressed = shootKey && !lastShootKeyRef.current;
      const touchShootPressed = gs.touch.shoot && !lastTouchShootRef.current;

      lastJumpKeyRef.current = jumpKey && !gs.touch.jump;
      lastTouchJumpRef.current = gs.touch.jump;
      lastShootKeyRef.current = shootKey && !gs.touch.shoot;
      lastTouchShootRef.current = gs.touch.shoot;

      const p = gs.player;

      // ── Check boss spawn ──
      if (gs.gameState === "playing" && p.x > BOSS_SPAWN_X && !gs.boss) {
        gs.bossArenaX = gs.cameraX;
        gs.boss = spawnBoss(W, H, gs.bossArenaX, worldNum);
        gs.gameState = "boss";
        gs.bossIntroTimer = 180;
        setGameState("boss");
        setBossIntroVisible(true);
        setBossCountdown(3);
        setTimeout(() => setBossCountdown(2), 1000);
        setTimeout(() => setBossCountdown(1), 2000);
        setTimeout(() => setBossCountdown(0), 3000);
        setTimeout(() => {
          setBossIntroVisible(false);
          setBossCountdown(null);
        }, 3800);
      }

      if (gs.bossIntroTimer > 0) gs.bossIntroTimer--;

      // ── Player movement ──
      if (p.deathAnim > 0) {
        p.deathAnim--;
        p.vy += GRAVITY;
        p.y += p.vy;
        if (p.deathAnim <= 0) {
          localLives--;
          gs.lives = localLives;
          setLives(localLives);
          if (localLives <= 0) {
            gs.gameState = "gameover";
            setGameState("gameover");
            playGameOver();
            setShowScoreSubmit(true);
            return;
          }
          if (gs.gameState === "boss" && gs.bossArenaX > 0) {
            p.x = gs.bossArenaX + W * 0.2;
          } else {
            p.x = gs.cameraX + 80;
          }
          p.y = groundY - p.h;
          p.vx = 0;
          p.vy = 0;
          p.onGround = true;
          p.jumpsLeft = 2;
          p.deathAnim = 0;
          gs.invincible = 120;
        }
      } else {
        if (left) {
          p.vx = -PLAYER_SPEED;
          p.facingRight = false;
        } else if (right) {
          p.vx = PLAYER_SPEED;
          p.facingRight = true;
        } else p.vx = 0;

        if ((jumpPressed || touchJumpPressed) && p.jumpsLeft > 0) {
          p.vy = JUMP_FORCE;
          p.jumpsLeft--;
          p.onGround = false;
          playJump();
        }

        if (
          (shootPressed || touchShootPressed) &&
          (gs.tripleShotTimer > 0 || gs.gameState === "boss")
        ) {
          playShoot();
          const bx = p.x + (p.facingRight ? p.w + 4 : -4);
          const by = p.y + p.h / 2;
          const bvx = p.facingRight ? BULLET_SPEED : -BULLET_SPEED;
          if (gs.tripleShotTimer > 0) {
            // Triple shot: straight + angled up + angled down
            const angles = [0, 15, -15];
            for (const deg of angles) {
              const rad = (deg * Math.PI) / 180;
              gs.bullets.push({
                x: bx,
                y: by,
                vx: bvx * Math.cos(rad),
                vy: Math.abs(bvx) * Math.sin(rad) * (p.facingRight ? 1 : -1),
                alive: true,
                id: gs.nextBulletId++,
              } as Bullet & { vy?: number });
            }
          } else {
            gs.bullets.push({
              x: bx,
              y: by,
              vx: bvx,
              alive: true,
              id: gs.nextBulletId++,
            });
          }
        }

        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.onGround = false;

        if (p.y + p.h >= groundY) {
          p.y = groundY - p.h;
          p.vy = 0;
          p.onGround = true;
          p.jumpsLeft = 2;
        }

        for (const plat of gs.platforms) {
          resolvePlatformCollision(p, plat);
        }

        if (gs.gameState === "boss") {
          const arenaLeft = gs.bossArenaX;
          const arenaRight = gs.bossArenaX + W - p.w;
          if (p.x < arenaLeft) p.x = arenaLeft;
          if (p.x > arenaRight) p.x = arenaRight;
        } else {
          if (p.x < gs.cameraX) p.x = gs.cameraX;
        }

        if (p.y > H + 100) {
          p.deathAnim = 60;
        }
      }

      // ── Camera ──
      if (gs.gameState === "boss") {
        gs.cameraX = gs.bossArenaX;
      } else {
        const targetCam = p.x - W * 0.3;
        if (targetCam > gs.cameraX) gs.cameraX = targetCam;
      }

      // ── Update moving platforms (World 3 horizontal, World 4 vertical) ──
      for (const plat of gs.platforms) {
        if (
          plat.moving &&
          plat.moveRange !== undefined &&
          plat.moveSpeed !== undefined &&
          plat.moveDir !== undefined
        ) {
          if (plat.moveAxis === "y" && plat.originY !== undefined) {
            // World 4 vertical float
            if (!plat.vy) plat.vy = plat.moveDir * plat.moveSpeed;
            plat.y += plat.vy;
            const distY = plat.y - plat.originY;
            if (distY > plat.moveRange || distY < -plat.moveRange) {
              plat.moveDir *= -1;
              plat.vy = plat.moveDir * plat.moveSpeed;
            }
          } else if (plat.originX !== undefined) {
            // World 3 horizontal
            plat.x += plat.vx || plat.moveDir * plat.moveSpeed;
            if (!plat.vx) plat.vx = plat.moveDir * plat.moveSpeed;
            const dist = plat.x - plat.originX;
            if (dist > plat.moveRange || dist < -plat.moveRange) {
              plat.moveDir *= -1;
              plat.vx = plat.moveDir * plat.moveSpeed;
            }
          }
        }
      }

      // ── Generate new chunks (only in normal play) ──
      if (gs.gameState === "playing") {
        const chunksNeeded = Math.ceil((gs.cameraX + W + CHUNK_W) / CHUNK_W);
        while (chunksGeneratedRef.current < chunksNeeded) {
          generateChunk(chunksGeneratedRef.current, H, gs, worldNum);
          chunksGeneratedRef.current++;
          gs.worldWidth = chunksGeneratedRef.current * CHUNK_W;
        }
      }

      // ── Enemy update (only in playing mode) ──
      if (gs.gameState === "playing") {
        for (const e of gs.enemies) {
          if (!e.alive) {
            if (e.stompAnim > 0) e.stompAnim--;
            continue;
          }

          if (e.isFlying) {
            // Sky Goblin - vertical patrol
            e.x += e.vx;
            if (
              e.patrolDir !== undefined &&
              e.patrolMinY !== undefined &&
              e.patrolMaxY !== undefined
            ) {
              e.y += e.patrolDir * 1.2;
              if (e.y <= e.patrolMinY) e.patrolDir = 1;
              if (e.y >= e.patrolMaxY) e.patrolDir = -1;
            }
            // Horizontal edge bounce
            if (e.x < gs.cameraX - 50) e.vx = Math.abs(e.vx);
            if (e.x > gs.cameraX + W + 50) e.vx = -Math.abs(e.vx);
          } else {
            e.x += e.vx;
            e.vy += GRAVITY;
            e.y += e.vy;
            if (e.y + e.h >= groundY) {
              e.y = groundY - e.h;
              e.vy = 0;
            }
            for (const plat of gs.platforms) {
              if (
                rectOverlap(e.x, e.y, e.w, e.h, plat.x, plat.y, plat.w, plat.h)
              ) {
                const et = {
                  x: e.x,
                  y: e.y,
                  w: e.w,
                  h: e.h,
                  vy: e.vy,
                  vx: e.vx,
                  onGround: false,
                  jumpsLeft: 0,
                };
                resolvePlatformCollision(et, plat);
                e.y = et.y;
                if (et.onGround) e.vy = 0;
              }
            }

            const onPlatEdge = () => {
              const lookAheadX = e.vx > 0 ? e.x + e.w + 4 : e.x - 4;
              const belowY = e.y + e.h + 4;
              let hasFloor = belowY >= groundY;
              if (!hasFloor) {
                for (const plat of gs.platforms) {
                  if (
                    lookAheadX >= plat.x &&
                    lookAheadX <= plat.x + plat.w &&
                    belowY >= plat.y &&
                    belowY <= plat.y + plat.h + 4
                  ) {
                    hasFloor = true;
                    break;
                  }
                }
              }
              return !hasFloor;
            };

            if (onPlatEdge() || e.x < 0) e.vx *= -1;
          } // end !isFlying

          if (
            p.deathAnim <= 0 &&
            gs.invincible <= 0 &&
            rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)
          ) {
            const stompTop = p.vy > 0 && p.y + p.h < e.y + e.h * 0.6;
            if (stompTop) {
              e.alive = false;
              e.stompAnim = 30;
              playEnemyDie();
              p.vy = -8;
              localScore += 100;
              gs.score = localScore;
              setScore(localScore);
            } else {
              p.deathAnim = 80;
              p.vy = -10;
            }
          }
        }
      }

      // ── Boss AI ──
      if (gs.gameState === "boss" && gs.boss && gs.boss.alive) {
        const boss = gs.boss;

        boss.facingRight = boss.x > p.x;

        if (boss.hitFlash > 0) boss.hitFlash--;

        if (boss.isCharging) {
          const dir = p.x > boss.x ? 1 : -1;
          const chargeSpeed =
            worldNum === 4 ? 14 : worldNum === 3 ? 10 : worldNum === 2 ? 8 : 6;
          boss.x += dir * chargeSpeed;
          boss.chargeTimer--;
          if (boss.chargeTimer <= 0) {
            boss.isCharging = false;
            boss.vx = 0;
          }
        } else {
          const dir = p.x > boss.x ? 1 : -1;
          const patrolSpeed =
            worldNum === 4
              ? 2.5
              : worldNum === 3
                ? 2.0
                : worldNum === 2
                  ? 1.4
                  : 0.8;
          boss.x += dir * patrolSpeed;

          boss.shootTimer--;
          if (boss.shootTimer <= 0) {
            const halfHp = boss.hp < boss.maxHp / 2;
            let numShots: number;
            if (worldNum === 4) numShots = halfHp ? 5 : 3;
            else if (worldNum === 3) numShots = halfHp ? 6 : 4;
            else if (worldNum === 2) numShots = halfHp ? 5 : 3;
            else numShots = halfHp ? 4 : 2;

            // World 3: burst pattern (4 in a fan)
            for (let i = 0; i < numShots; i++) {
              const spread = worldNum === 4 ? 18 : worldNum === 3 ? 20 : 15;
              const angle = ((i - (numShots - 1) / 2) * spread * Math.PI) / 180;
              const baseSpeed =
                worldNum === 4
                  ? 9.0
                  : worldNum === 3
                    ? 6.5
                    : worldNum === 2
                      ? 5.5
                      : 4;
              const speed = baseSpeed + (boss.maxHp - boss.hp) * 0.25;
              const bdir = p.x < boss.x ? -1 : 1;
              gs.bossProjectiles.push({
                x: boss.x + boss.w / 2,
                y: boss.y + boss.h / 2,
                vx: bdir * speed * Math.cos(angle),
                vy: speed * Math.sin(angle) - 1,
                alive: true,
                id: gs.nextBulletId++,
              });
            }

            const baseRate =
              worldNum === 4
                ? 28
                : worldNum === 3
                  ? 35
                  : worldNum === 2
                    ? 45
                    : 90;
            boss.shootTimer = halfHp ? Math.floor(baseRate / 2) : baseRate;

            const chargeChance =
              worldNum === 4
                ? 0.6
                : worldNum === 3
                  ? 0.5
                  : worldNum === 2
                    ? 0.4
                    : 0.3;
            if (Math.random() < chargeChance) {
              boss.isCharging = true;
              const chargeFrames =
                worldNum === 4
                  ? 22
                  : worldNum === 3
                    ? 30
                    : worldNum === 2
                      ? 40
                      : 30;
              boss.chargeTimer = chargeFrames;
            }
          }
        }

        // Check player bullets hitting boss
        for (const bullet of gs.bullets) {
          if (!bullet.alive) continue;
          if (
            rectOverlap(
              bullet.x - 12,
              bullet.y - 5,
              24,
              10,
              boss.x,
              boss.y,
              boss.w,
              boss.h,
            )
          ) {
            bullet.alive = false;
            boss.hp--;
            boss.hitFlash = 15;
            localScore += 50;
            gs.score = localScore;
            setScore(localScore);

            if (boss.hp <= 0) {
              boss.alive = false;
              boss.deathAnim = 90;

              let bonusScore: number;
              if (worldNum === 4) bonusScore = 5000;
              else if (worldNum === 3) bonusScore = 3000;
              else if (worldNum === 2) bonusScore = 2000;
              else bonusScore = 1000;

              localScore += bonusScore;
              gs.score = localScore;
              setScore(localScore);

              // Spawn finish line after boss death
              setTimeout(() => {
                if (gsRef.current) {
                  gsRef.current.finishLine = {
                    x: gsRef.current.bossArenaX + W * 0.75,
                    y: groundY,
                    active: true,
                    animFrame: 0,
                  };
                  gsRef.current.gameState = "playing";
                  setGameState("playing");
                }
              }, 1800);
            }
          }
        }

        // Boss projectiles hitting player
        if (p.deathAnim <= 0 && gs.invincible <= 0) {
          for (const bp of gs.bossProjectiles) {
            if (!bp.alive) continue;
            if (
              rectOverlap(
                p.x + 4,
                p.y + 4,
                p.w - 8,
                p.h - 8,
                bp.x - 6,
                bp.y - 6,
                12,
                12,
              )
            ) {
              bp.alive = false;
              p.deathAnim = 80;
              p.vy = -10;
            }
          }
        }

        // Player touching boss directly
        if (
          p.deathAnim <= 0 &&
          gs.invincible <= 0 &&
          rectOverlap(p.x, p.y, p.w, p.h, boss.x, boss.y, boss.w, boss.h)
        ) {
          p.deathAnim = 80;
          p.vy = -10;
        }
      }

      // Check player bullets hitting regular enemies
      for (const bullet of gs.bullets) {
        if (!bullet.alive) continue;
        for (const e of gs.enemies) {
          if (!e.alive || e.stompAnim > 0) continue;
          if (
            rectOverlap(bullet.x - 12, bullet.y - 5, 24, 10, e.x, e.y, e.w, e.h)
          ) {
            bullet.alive = false;
            e.alive = false;
            e.stompAnim = 30;
            localScore += 100;
            gs.score = localScore;
            setScore(localScore);
            break;
          }
        }
      }

      // ── Update bullets ──
      for (const bullet of gs.bullets) {
        if (!bullet.alive) continue;
        bullet.x += bullet.vx;
        if (bullet.vy) bullet.y += bullet.vy;
        if (bullet.x < gs.cameraX - 50 || bullet.x > gs.cameraX + W + 50)
          bullet.alive = false;
      }
      if (gs.bullets.length > 40) gs.bullets.splice(0, gs.bullets.length - 40);

      // ── Update boss projectiles ──
      for (const bp of gs.bossProjectiles) {
        if (!bp.alive) continue;
        bp.x += bp.vx;
        bp.y += bp.vy;
        if (worldNum !== 4) bp.vy += GRAVITY * 0.3;
        if (
          bp.y > H + 50 ||
          bp.x < gs.cameraX - 100 ||
          bp.x > gs.cameraX + W + 100
        )
          bp.alive = false;
      }
      if (gs.bossProjectiles.length > 60)
        gs.bossProjectiles.splice(0, gs.bossProjectiles.length - 60);

      if (gs.invincible > 0) gs.invincible--;

      // ── Coin collection ──
      for (const coin of gs.coins) {
        if (coin.collected) continue;
        const bobY = coin.y + Math.sin(gs.frame * 0.08 + coin.bobOffset) * 5;
        if (
          rectOverlap(
            p.x,
            p.y,
            p.w,
            p.h,
            coin.x - coin.r,
            bobY - coin.r,
            coin.r * 2,
            coin.r * 2,
          )
        ) {
          coin.collected = true;
          localScore += 10;
          playCoin();
          gs.score = localScore;
          setScore(localScore);
        }
      }

      // ── Cloud update ──
      for (const cloud of gs.clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.w < gs.cameraX - 100) {
          cloud.x = gs.cameraX + W + 50;
          cloud.y = 20 + Math.random() * H * 0.3;
        }
      }

      // ── Question Boxes (only in playing mode) ──
      if (gs.gameState === "playing") {
        for (const box of gs.questionBoxes) {
          if (box.used) {
            // Animate bounce back
            if (box.animOffset < 0)
              box.animOffset = Math.min(0, box.animOffset + 1.5);
            continue;
          }
          // Animate bounce
          if (box.animTimer > 0) {
            box.animTimer--;
            box.animOffset =
              -8 * Math.sin(((20 - box.animTimer) / 20) * Math.PI);
          }
          // Detect headbutt: player top hits box bottom while moving upward
          const boxBottom = box.y + box.height;
          const boxRight = box.x + box.width;
          if (
            p.vy < 0 &&
            p.x + p.w > box.x &&
            p.x < boxRight &&
            p.y <= boxBottom + 8 &&
            p.y >= box.y &&
            p.y + p.vy <= boxBottom
          ) {
            box.used = true;
            box.animTimer = 20;
            box.animOffset = -10;
            p.vy = Math.abs(p.vy) * 0.5; // Bounce player down
            gs.powerupPickups.push({
              x: box.x + 6,
              y: box.y - 34,
              vy: -5,
              collected: false,
              id: gs.nextBulletId++,
            });
          }
        }

        // ── Update power-up pickups ──
        for (const pu of gs.powerupPickups) {
          if (pu.collected) continue;
          pu.vy += GRAVITY;
          pu.y += pu.vy;
          // Land on ground
          if (pu.y + 32 >= groundY) {
            pu.y = groundY - 32;
            pu.vy = 0;
          }
          // Land on platforms
          for (const plat of gs.platforms) {
            if (
              28 > plat.x &&
              pu.x + 28 > plat.x &&
              pu.x < plat.x + plat.w &&
              pu.y + 32 >= plat.y &&
              pu.y + 32 <= plat.y + plat.h + 8 &&
              pu.vy >= 0
            ) {
              pu.y = plat.y - 32;
              pu.vy = 0;
            }
          }
          // Player collision
          if (rectOverlap(p.x, p.y, p.w, p.h, pu.x, pu.y, 32, 32)) {
            pu.collected = true;
            gs.tripleShotTimer = 600;
            playPowerUp(); // 10 seconds at 60fps
            // Auto-fire first burst when collected
            {
              const bx = p.x + (p.facingRight ? p.w + 4 : -4);
              const by = p.y + p.h / 2;
              const bvx = p.facingRight ? BULLET_SPEED : -BULLET_SPEED;
              const angles = [0, 15, -15];
              for (const deg of angles) {
                const rad = (deg * Math.PI) / 180;
                gs.bullets.push({
                  x: bx,
                  y: by,
                  vx: bvx * Math.cos(rad),
                  vy: Math.abs(bvx) * Math.sin(rad) * (p.facingRight ? 1 : -1),
                  alive: true,
                  id: gs.nextBulletId++,
                } as Bullet & { vy?: number });
              }
            }
          }
        }
        gs.powerupPickups = gs.powerupPickups.filter(
          (pu) => !pu.collected || pu.y < H + 50,
        );

        // ── Triple shot timer ──
        if (gs.tripleShotTimer > 0) gs.tripleShotTimer--;
        setTripleShotTimeLeft(Math.ceil(gs.tripleShotTimer / 60));
      }

      // ── Draw ──
      const isBoss = gs.gameState === "boss";

      // Expose camX for sky drawing
      (ctx as CanvasRenderingContext2D & { _camX?: number })._camX = gs.cameraX;

      drawSky(ctx, W, H, isBoss, gs.frame, worldNum);

      // Draw ceiling brand text
      ctx.save();
      ctx.textAlign = "center";
      const brandAlpha = 0.55 + 0.1 * Math.sin(gs.frame * 0.04);
      ctx.globalAlpha = brandAlpha;
      ctx.font = "bold 22px 'Bricolage Grotesque', sans-serif";
      ctx.fillStyle = "#FF6B00";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 6;
      ctx.fillText("ODIN MARIO", W / 2, 28);
      ctx.font = "bold 10px 'Figtree', sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.shadowBlur = 4;
      ctx.fillText("Building GameFi project on Odin.fun", W / 2, 44);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
      for (const cloud of gs.clouds)
        drawCloud(ctx, cloud, gs.cameraX, worldNum);

      if (isBoss) {
        const gY = Math.floor(H * GROUND_Y_RATIO);
        let arenaFloorColor = "#1A0030";
        let arenaFloorDark = "#0A0018";
        let runeColor = "rgba(180,0,255,0.3)";
        if (worldNum === 4) {
          arenaFloorColor = "#003366";
          arenaFloorDark = "#001133";
          runeColor = "rgba(100,200,255,0.4)";
        } else if (worldNum === 3) {
          arenaFloorColor = "#330000";
          arenaFloorDark = "#1a0000";
          runeColor = "rgba(255,80,0,0.4)";
        } else if (worldNum === 2) {
          arenaFloorColor = "#1A0000";
          arenaFloorDark = "#0A0000";
          runeColor = "rgba(255,50,0,0.3)";
        }
        ctx.fillStyle = arenaFloorColor;
        ctx.fillRect(0, gY, W, 18);
        ctx.fillStyle = arenaFloorDark;
        ctx.fillRect(0, gY + 18, W, GROUND_H - 18);
        ctx.fillStyle = runeColor;
        for (let rx = 0; rx < W; rx += 60) {
          ctx.fillRect(rx, gY, 4, 18);
        }
      } else {
        drawGround(ctx, W, H, gs.cameraX, worldNum);
      }

      for (const plat of gs.platforms)
        drawPlatform(ctx, plat, gs.cameraX, worldNum);
      for (const coin of gs.coins) drawCoin(ctx, coin, gs.frame, gs.cameraX);
      if (!isBoss) {
        drawQuestionBoxes(ctx, gs.questionBoxes, gs.cameraX, gs.frame);
        drawPowerupPickups(ctx, gs.powerupPickups, gs.cameraX, gs.frame);
        for (const e of gs.enemies)
          drawEnemy(ctx, e, gs.frame, gs.cameraX, worldNum);
      }

      drawBullets(
        ctx,
        gs.bullets,
        gs.bossProjectiles,
        gs.cameraX,
        gs.frame,
        worldNum,
      );

      if (gs.boss) {
        drawBoss(ctx, gs.boss, gs.frame, gs.cameraX, worldNum);
        if (!gs.boss.alive && gs.boss.deathAnim > 0) gs.boss.deathAnim--;
      }
      drawPlayer(ctx, p, gs.frame, gs.cameraX, gs.invincible);
      drawHUD(
        ctx,
        localScore,
        localLives,
        W,
        worldNum,
        gs.tripleShotTimer,
        tokenPriceRef.current,
      );
      if (isBoss && gs.boss && gs.boss.alive)
        drawBossHPBar(ctx, gs.boss, W, gs.frame, worldNum);
      drawShootHint(ctx, W, isBoss && gs.bossIntroTimer <= 0);

      // Draw finish line if active
      if (gs.finishLine?.active) {
        gs.finishLine.animFrame++;
        drawFinishLine(ctx, gs.finishLine, gs.cameraX, groundY, worldNum);

        // Check if player reached finish line
        if (
          p.deathAnim <= 0 &&
          p.x + p.w > gs.finishLine.x - 30 &&
          p.x < gs.finishLine.x + 60
        ) {
          gs.finishLine.active = false;
          if (worldNum === 1) {
            const savedScore = gs.score;
            const savedLives = gs.lives;
            setTimeout(() => {
              const fn = transitionToWorld2Ref.current;
              if (fn) fn(savedScore, savedLives);
            }, 500);
          } else if (worldNum === 2) {
            const savedScore = gs.score;
            const savedLives = gs.lives;
            setTimeout(() => {
              const fn = transitionToWorld3Ref.current;
              if (fn) fn(savedScore, savedLives);
            }, 500);
          } else if (worldNum === 3) {
            const savedScore = gs.score;
            const savedLives = gs.lives;
            setTimeout(() => {
              const fn = transitionToWorld4Ref.current;
              if (fn) fn(savedScore, savedLives);
            }, 500);
          } else {
            // World 4 - ULTIMATE VICTORY!
            setTimeout(() => {
              gs.gameState = "victory";
              setGameState("victory");
              setShowScoreSubmit(true);
            }, 500);
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const setTouch = (key: "left" | "right" | "jump" | "shoot", val: boolean) => {
    if (gsRef.current) gsRef.current.touch[key] = val;
  };

  const handleTouchDown = (key: "left" | "right" | "jump" | "shoot") => {
    setTouch(key, true);
    hapticFeedback(30);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#5BC8F5",
      }}
    >
      {priceAlert && (
        <div
          data-ocid="price.toast"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            animation: "priceAlertIn 0.35s ease-out",
          }}
        >
          <div
            style={{
              background:
                priceAlert.direction === "up"
                  ? "linear-gradient(135deg, #065f46 0%, #064e3b 100%)"
                  : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
              border: `1.5px solid ${priceAlert.direction === "up" ? "#34d399" : "#f87171"}`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
              padding: "10px 28px",
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 15,
              color: priceAlert.direction === "up" ? "#6ee7b7" : "#fca5a5",
              boxShadow: `0 4px 20px ${
                priceAlert.direction === "up"
                  ? "rgba(52,211,153,0.4)"
                  : "rgba(248,113,113,0.4)"
              }`,
              letterSpacing: 1,
            }}
          >
            {priceAlert.direction === "up"
              ? `PRICE UP +${priceAlert.pct.toFixed(1)}%`
              : `PRICE DOWN -${priceAlert.pct.toFixed(1)}%`}
          </div>
        </div>
      )}
      <style>{`
        @keyframes priceAlertIn {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes countPop {
          0% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
          30% { opacity: 1; }
          70% { transform: translate(-50%, -50%) scale(1); }
          100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
        }
        @keyframes tripleShootPulse {
          from { box-shadow: 0 0 10px #FFD700, 0 0 20px #FFA500; }
          to { box-shadow: 0 0 22px #FFD700, 0 0 44px #FF6600; }
        }
      `}</style>
      <canvas ref={canvasRef} data-ocid="game.canvas_target" />

      {/* BOSS INTRO BANNER - transparent, no dark overlay */}
      {bossIntroVisible && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {/* Boss name at top */}
          <div
            style={{
              position: "absolute",
              top: "8%",
              left: 0,
              right: 0,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "clamp(2.5rem,8vw,5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: currentWorld === 3 ? "#FF6600" : "#FF3D00",
                textShadow: `0 0 30px ${currentWorld === 3 ? "#FF4400" : "#FF0000"}, 3px 3px 0 #000, -1px -1px 0 #000`,
                lineHeight: 1,
              }}
            >
              {currentWorld === 3 ? "LAVA ODIN" : "ODIN"}
            </div>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.2rem)",
                color: "#FFE066",
                fontFamily: "'Figtree',sans-serif",
                marginTop: 6,
                textShadow: "2px 2px 0 #000, 0 0 10px #000",
                fontWeight: 700,
              }}
            >
              {currentWorld === 3
                ? "KING OF THE LAVA KINGDOM"
                : currentWorld === 2
                  ? "ODIN UNLEASHED"
                  : "LORD OF THUNDER"}
            </div>
            <div
              style={{
                fontSize: "clamp(0.75rem,2vw,0.95rem)",
                color: "#fff",
                fontFamily: "'Figtree',sans-serif",
                marginTop: 8,
                textShadow: "1px 1px 0 #000, 0 0 8px #000",
              }}
            >
              Press Z / F to SHOOT!
            </div>
          </div>
          {/* Countdown number in center */}
          {bossCountdown !== null && (
            <div
              key={bossCountdown}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                animation:
                  "countPop 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(6rem,20vw,10rem)",
                  fontWeight: 900,
                  fontFamily: "'Bricolage Grotesque',sans-serif",
                  lineHeight: 1,
                  color:
                    bossCountdown === 3
                      ? "#FFD700"
                      : bossCountdown === 2
                        ? "#FF8C00"
                        : bossCountdown === 1
                          ? "#FF2222"
                          : "#00FF88",
                  textShadow:
                    bossCountdown === 3
                      ? "0 0 40px #FFD700, 4px 4px 0 #000"
                      : bossCountdown === 2
                        ? "0 0 40px #FF8C00, 4px 4px 0 #000"
                        : bossCountdown === 1
                          ? "0 0 40px #FF0000, 4px 4px 0 #000"
                          : "0 0 40px #00FF88, 4px 4px 0 #000",
                }}
              >
                {bossCountdown === 0 ? "FIGHT!" : bossCountdown}
              </div>
            </div>
          )}
        </div>
      )}

      {/* WORLD 2 INTRO BANNER */}
      {world2IntroVisible && (
        <div
          style={{
            ...overlayStyle,
            background: "rgba(5,0,20,0.88)",
            zIndex: 20,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#AA88FF",
                letterSpacing: 6,
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              ★ You Defeated Odin ★
            </div>
            <div
              style={{
                fontSize: "clamp(2.5rem,9vw,5.5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#CC44FF",
                textShadow: "0 0 40px #8800FF, 4px 4px 0 #000",
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              WORLD 2
            </div>
            <div
              style={{
                fontSize: "clamp(1.5rem,5vw,3rem)",
                fontWeight: 800,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FF9900",
                textShadow: "3px 3px 0 #000",
                marginBottom: 12,
              }}
            >
              NIGHT OF FURY
            </div>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#FFD700",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              ⚡ Odin Unleashed awaits...
            </div>
          </div>
        </div>
      )}

      {/* WORLD 3 INTRO BANNER */}
      {world3IntroVisible && (
        <div
          style={{
            ...overlayStyle,
            background: "rgba(20,0,0,0.92)",
            zIndex: 20,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#FF9944",
                letterSpacing: 6,
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              🔥 You Defeated Odin Unleashed 🔥
            </div>
            <div
              style={{
                fontSize: "clamp(2.5rem,9vw,5.5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FF4400",
                textShadow: "0 0 40px #FF2200, 4px 4px 0 #000",
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              WORLD 3
            </div>
            <div
              style={{
                fontSize: "clamp(1.5rem,5vw,3rem)",
                fontWeight: 800,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FF9900",
                textShadow: "3px 3px 0 #000",
                marginBottom: 12,
              }}
            >
              LAVA KINGDOM
            </div>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#FFCC00",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              🔥 Lava Odin awaits your doom...
            </div>
          </div>
        </div>
      )}

      {/* WORLD 4 INTRO BANNER */}
      {world4IntroVisible && (
        <div
          style={{
            ...overlayStyle,
            background: "rgba(0,20,60,0.94)",
            zIndex: 20,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#00CCFF",
                letterSpacing: 6,
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              ⚡ You Defeated Lava Odin ⚡
            </div>
            <div
              style={{
                fontSize: "clamp(2.5rem,9vw,5.5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#4EC3F7",
                textShadow: "0 0 40px #00AAFF, 4px 4px 0 #000",
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              WORLD 4
            </div>
            <div
              style={{
                fontSize: "clamp(1.5rem,5vw,3rem)",
                fontWeight: 800,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FFD700",
                textShadow: "3px 3px 0 #000",
                marginBottom: 12,
              }}
            >
              SKY KINGDOM
            </div>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.1rem)",
                color: "#A0E8FF",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              ⚡ Storm Odin commands the skies...
            </div>
          </div>
        </div>
      )}

      {/* START SCREEN */}
      {gameState === "start" && (
        <div
          style={
            isDesktop
              ? {
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  background:
                    "url(/assets/uploads/20013_11zon-1.png) center center / cover no-repeat",
                  overflowY: "auto",
                  padding: "40px 20px",
                }
              : {
                  ...overlayStyle,
                  flexDirection: "column",
                  gap: 0,
                  overflowY: "auto",
                  paddingTop: 20,
                  paddingBottom: 20,
                }
          }
        >
          <div
            style={
              isDesktop
                ? {
                    width: "100%",
                    maxWidth: "700px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 0,
                    boxShadow: "none",
                    padding: 0,
                    textAlign: "center",
                  }
                : panelStyle
            }
          >
            <img
              src="/assets/uploads/19943_11zon-1-1.png"
              alt="ODIN MARIO"
              style={{
                display: "block",
                maxWidth: "280px",
                width: "100%",
                margin: "0 auto 12px auto",
                borderRadius: 12,
                imageRendering: "crisp-edges",
                objectFit: "contain",
                transform: "none",
              }}
            />
            <p
              style={{
                fontFamily: "'Figtree',sans-serif",
                color: "#e8f4ff",
                fontSize: 14,
                marginBottom: 8,
                textShadow: "1px 1px 2px #000",
              }}
            >
              🕹️ Arrow Keys / WASD · Space to Jump · Double Jump!
            </p>
            <p
              style={{
                fontFamily: "'Figtree',sans-serif",
                color: "#FFD700",
                fontSize: 13,
                marginBottom: 4,
                textShadow: "1px 1px 2px #000",
              }}
            >
              🔫 Z / F = Shoot (during boss fight)
            </p>
            <p
              style={{
                fontFamily: "'Figtree',sans-serif",
                color: "#FF9944",
                fontSize: 12,
                marginBottom: 20,
                textShadow: "1px 1px 2px #000",
              }}
            >
              🗺️ World 1 → World 2 → World 3 → World 4 → Victory!
            </p>
            <button
              type="button"
              data-ocid="game.primary_button"
              onClick={startGame}
              style={startBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.06) rotate(-1deg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1) rotate(0deg)";
              }}
            >
              ▶ START GAME
            </button>
            <button
              type="button"
              data-ocid="leaderboard.button"
              onClick={async () => {
                setShowLeaderboard(true);
                setLeaderboardLoading(true);
                setLeaderboardData([]);
                try {
                  const d = (await actor?.getTop10Scores()) ?? [];
                  setLeaderboardData(d);
                } catch {}
                setLeaderboardLoading(false);
              }}
              style={{
                ...startBtnStyle,
                marginTop: 10,
                background: "linear-gradient(180deg, #1a6644 0%, #0a3322 100%)",
                borderColor: "#00FF88",
                boxShadow: "0 6px 0 #003311, 0 8px 20px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.06) rotate(-1deg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1) rotate(0deg)";
              }}
            >
              🏆 LEADERBOARD
            </button>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <label
                htmlFor="username-input"
                style={{
                  fontSize: 13,
                  color: "#c0d8f0",
                  fontFamily: "'Figtree',sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                Your Name:
              </label>
              <input
                id="username-input"
                data-ocid="username.input"
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                maxLength={20}
                placeholder="Enter username..."
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid #f4c430",
                  borderRadius: 6,
                  color: "#fff",
                  fontFamily: "'Figtree',sans-serif",
                  fontSize: 13,
                  padding: "4px 8px",
                  width: 130,
                  outline: "none",
                }}
              />
              <button
                type="button"
                data-ocid="username.save_button"
                onClick={() => {
                  const val = usernameInput.trim();
                  setPlayerName(val);
                  localStorage.setItem("odinmario_username", val);
                  setUsernameSaved(true);
                  setTimeout(() => setUsernameSaved(false), 2000);
                }}
                style={{
                  background: "#f4c430",
                  color: "#1a1a2e",
                  border: "none",
                  borderRadius: 6,
                  fontFamily: "'Figtree',sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "4px 12px",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              {usernameSaved && (
                <span
                  style={{
                    fontSize: 12,
                    color: "#4ade80",
                    fontFamily: "'Figtree',sans-serif",
                  }}
                >
                  Saved!
                </span>
              )}
            </div>
            {walletAddress && (
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "#fbbf24",
                    fontFamily: "monospace",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(251,146,60,0.4)",
                    borderRadius: 6,
                    padding: "3px 10px",
                  }}
                >
                  {`Wallet: ${
                    walletAddress.length > 12
                      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                      : walletAddress
                  }`}
                </span>
              </div>
            )}
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "#c0d8f0",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              Mobile: Use on-screen buttons below
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 12,
                justifyContent: "center",
              }}
            >
              <a
                href="https://x.com/odinmariogame"
                target="_blank"
                rel="noopener noreferrer"
                data-ocid="start.x_link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#fff",
                  background: "#000",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontFamily: "'Figtree',sans-serif",
                  textDecoration: "none",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="white"
                  role="img"
                  aria-label="X (Twitter)"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://odin.fun/token/2ip5"
                target="_blank"
                rel="noopener noreferrer"
                data-ocid="start.token_link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#000",
                  background: "#FFD700",
                  borderRadius: 20,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontFamily: "'Figtree',sans-serif",
                  textDecoration: "none",
                  fontWeight: 700,
                  boxShadow: "0 2px 8px rgba(255,215,0,0.5)",
                  letterSpacing: 1,
                }}
              >
                TOKEN
              </a>
            </div>

            {/* LEADERBOARD PANEL */}
            {showLeaderboard && (
              <div
                data-ocid="leaderboard.panel"
                style={{
                  marginTop: 16,
                  width: "min(400px, 90vw)",
                  background:
                    "linear-gradient(135deg, rgba(0,20,60,0.97) 0%, rgba(10,40,80,0.97) 100%)",
                  border: "3px solid #FFD700",
                  borderRadius: 16,
                  padding: "24px 28px",
                  boxShadow: "0 0 40px rgba(255,215,0,0.25)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.3rem",
                      fontWeight: 900,
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      color: "#FFD700",
                      textShadow: "2px 2px 0 #000",
                    }}
                  >
                    🏆 TOP 10
                  </div>
                  <button
                    type="button"
                    data-ocid="leaderboard.close_button"
                    onClick={() => setShowLeaderboard(false)}
                    style={{
                      background: "none",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: "pointer",
                      padding: "4px 10px",
                      fontSize: 13,
                    }}
                  >
                    ← BACK
                  </button>
                </div>
                {leaderboardLoading ? (
                  <div
                    data-ocid="leaderboard.loading_state"
                    style={{
                      color: "#ccc",
                      fontFamily: "'Figtree',sans-serif",
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    Loading...
                  </div>
                ) : leaderboardData.length === 0 ? (
                  <div
                    data-ocid="leaderboard.empty_state"
                    style={{
                      color: "#aaa",
                      fontFamily: "'Figtree',sans-serif",
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    No scores yet! Be the first!
                  </div>
                ) : (
                  <div>
                    {leaderboardData.map((entry, i) => (
                      <div
                        key={`${entry.playerName}-${i}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          color:
                            i === 0
                              ? "#FFD700"
                              : i === 1
                                ? "#C0C0C0"
                                : i === 2
                                  ? "#CD7F32"
                                  : "#e0e0e0",
                          fontFamily: "'Figtree',sans-serif",
                          fontSize: 14,
                          padding: "6px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <span style={{ fontWeight: i < 3 ? 700 : 400 }}>
                          #{i + 1}{" "}
                          {i === 0
                            ? "🥇"
                            : i === 1
                              ? "🥈"
                              : i === 2
                                ? "🥉"
                                : ""}{" "}
                          {entry.playerName}
                        </span>
                        <span style={{ fontWeight: 700 }}>
                          ₿ {entry.score.toString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LIVE STATS DASHBOARD */}
            <div
              style={{
                marginTop: 20,
                marginBottom: 4,
                padding: "14px 16px",
                background:
                  "linear-gradient(135deg, rgba(10,20,50,0.97) 0%, rgba(20,10,60,0.97) 100%)",
                border: "2px solid rgba(255,215,0,0.85)",
                borderRadius: 14,
                boxShadow:
                  "0 0 18px rgba(255,215,0,0.25), inset 0 0 30px rgba(0,0,255,0.05)",
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img
                    src="https://image.odin.fun/token/2ip5"
                    alt="ODINMARIO"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "2px solid #FFD700",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#FFD700",
                      letterSpacing: 1,
                    }}
                  >
                    ODINMARIO
                  </span>
                </div>
                <a
                  href="https://odin.fun/token/2ip5"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ocid="stats.link"
                  style={{
                    color: "#aac4ff",
                    fontFamily: "monospace",
                    fontSize: 11,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "3px 8px",
                    border: "1px solid rgba(100,150,255,0.4)",
                    borderRadius: 8,
                    background: "rgba(50,80,200,0.2)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "rgba(50,80,200,0.45)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "rgba(50,80,200,0.2)";
                  }}
                >
                  View on odin.fun →
                </a>
              </div>
              {/* Stats grid */}
              {tokenStats ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  {[
                    {
                      label: "PRICE",
                      value: `${(tokenStats.price / 1000).toFixed(2)} sats`,
                      color: "#FFD700",
                      icon: (
                        <img
                          alt="ODINMARIO"
                          src="/assets/uploads/20343-019d3153-e329-70aa-b5d4-ed4be335b3ac-2.jpg"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "4px",
                            objectFit: "cover",
                            display: "inline-block",
                          }}
                        />
                      ),
                    },
                    {
                      label: "HOLDERS",
                      value: tokenStats.holders.toLocaleString(),
                      color: "#a78bfa",
                      icon: "👥",
                    },
                    {
                      label: "MCAP",
                      value:
                        btcUsdPrice > 0
                          ? `$${Math.round((tokenStats.mcap / 100000000000) * btcUsdPrice).toLocaleString()}`
                          : `${(tokenStats.mcap / 100000000000).toFixed(7)} BTC`,
                      color: "#34d399",
                      icon: "📈",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "8px 6px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 2 }}>
                        {stat.icon}
                      </div>
                      <div
                        style={{
                          fontFamily: "monospace",
                          fontSize: 10,
                          color: "rgba(255,255,255,0.5)",
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        {stat.label}
                      </div>
                      <div
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          color: stat.color,
                          wordBreak: "break-all",
                        }}
                      >
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 0",
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,215,0,0.4)",
                      borderTopColor: "#FFD700",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Loading stats...
                </div>
              )}
            </div>

            {/* Top Holders Section */}
            <div
              data-ocid="holders.panel"
              style={{
                marginTop: 16,
                background:
                  "linear-gradient(135deg, rgba(20,15,0,0.95) 0%, rgba(40,30,0,0.9) 100%)",
                border: "1.5px solid rgba(255,215,0,0.7)",
                borderRadius: 14,
                padding: "12px 14px",
                boxShadow: "0 0 20px rgba(255,215,0,0.2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <img
                  src="https://image.odin.fun/token/2ip5"
                  alt="ODINMARIO"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "#FFD700",
                    letterSpacing: 1,
                  }}
                >
                  TOP HOLDERS
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 9,
                    color: "rgba(255,215,0,0.5)",
                    fontFamily: "monospace",
                  }}
                >
                  ODINMARIO
                </span>
              </div>
              {topHoldersLoading && (
                <div
                  data-ocid="holders.loading_state"
                  style={{
                    textAlign: "center",
                    padding: "12px 0",
                    color: "rgba(255,215,0,0.5)",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  Loading holders...
                </div>
              )}
              {topHoldersError && !topHoldersLoading && (
                <div
                  data-ocid="holders.error_state"
                  style={{ textAlign: "center", padding: "8px 0" }}
                >
                  <div
                    style={{
                      color: "rgba(255,100,100,0.8)",
                      fontFamily: "monospace",
                      fontSize: 11,
                      marginBottom: 6,
                    }}
                  >
                    Data unavailable
                  </div>
                  <button
                    type="button"
                    data-ocid="holders.retry_button"
                    onClick={() => {
                      setTopHoldersError(false);
                      setTopHoldersLoading(true);
                      fetch(
                        "https://api.odin.fun/v1/token/2ip5/owners?limit=10&sort=balance:desc",
                        { headers: { Accept: "application/json" } },
                      )
                        .then((r) => r.json())
                        .then((json) => {
                          const list: any[] = Array.isArray(json)
                            ? json
                            : (json?.data ?? []);
                          const mapped = list
                            .slice(0, 10)
                            .map((h: any) => ({
                              address: h?.user ?? "",
                              username: h?.user_username ?? "",
                              balance: Number(h?.balance ?? 0),
                            }))
                            .filter((h) => h.address !== "");
                          setTopHolders(mapped);
                          setTopHoldersLoading(false);
                        })
                        .catch(() => {
                          setTopHoldersError(true);
                          setTopHoldersLoading(false);
                        });
                    }}
                    style={{
                      background: "rgba(255,215,0,0.15)",
                      border: "1px solid rgba(255,215,0,0.4)",
                      borderRadius: 6,
                      color: "#FFD700",
                      fontFamily: "monospace",
                      fontSize: 10,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!topHoldersLoading &&
                !topHoldersError &&
                topHolders.length === 0 && (
                  <div
                    data-ocid="holders.empty_state"
                    style={{
                      textAlign: "center",
                      padding: "12px 0",
                      color: "rgba(255,215,0,0.4)",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    No holder data available
                  </div>
                )}
              {topHolders.map((h, i) => (
                <div
                  key={h.address}
                  data-ocid={`holders.item.${i + 1}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 0",
                    borderBottom:
                      i < topHolders.length - 1
                        ? "1px solid rgba(255,215,0,0.1)"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color:
                        i === 0
                          ? "#FFD700"
                          : i === 1
                            ? "#C0C0C0"
                            : i === 2
                              ? "#CD7F32"
                              : "rgba(255,255,255,0.4)",
                      width: 18,
                      fontWeight: 700,
                    }}
                  >
                    {`#${i + 1}`}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.75)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.username
                      ? h.username
                      : h.address.length > 12
                        ? `${h.address.slice(0, 6)}...${h.address.slice(-4)}`
                        : h.address}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "#34d399",
                      fontWeight: 700,
                    }}
                  >
                    {(h.balance / 1e11).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>

            {/* Disconnect Wallet Button */}
            {onLogout && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 8,
                  marginBottom: 4,
                }}
              >
                <button
                  type="button"
                  onClick={onLogout}
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    border: "1.5px solid rgba(255,100,0,0.5)",
                    borderRadius: 10,
                    color: "#ff9955",
                    fontSize: 13,
                    padding: "7px 18px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    letterSpacing: 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,100,0,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(0,0,0,0.45)";
                  }}
                >
                  🔌 Disconnect Wallet
                </button>
              </div>
            )}

            {/* SPECIAL GAME */}
            <div
              style={{
                marginTop: 24,
                marginBottom: 4,
                padding: "16px 12px",
                background:
                  "linear-gradient(135deg, rgba(60,40,0,0.95) 0%, rgba(100,70,0,0.9) 50%, rgba(60,40,0,0.95) 100%)",
                border: "2px solid rgba(255,215,0,0.9)",
                borderRadius: 18,
                boxShadow:
                  "0 0 30px rgba(255,215,0,0.5), inset 0 0 20px rgba(255,180,0,0.1)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Glow overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse at center top, rgba(255,215,0,0.15) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <p
                style={{
                  fontFamily: "'Bricolage Grotesque',sans-serif",
                  color: "#FFD700",
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 14,
                  textShadow:
                    "0 0 12px rgba(255,215,0,0.9), 0 0 24px rgba(255,180,0,0.6)",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                ⭐ SPECIAL GAME ⭐
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <div
                  data-ocid="special_partner.card"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, rgba(80,50,0,0.9) 0%, rgba(120,80,0,0.85) 50%, rgba(80,50,0,0.9) 100%)",
                    border: "2px solid #FFD700",
                    borderRadius: 16,
                    padding: "16px 12px",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow:
                      "0 0 20px rgba(255,215,0,0.6), 0 4px 24px rgba(0,0,0,0.4)",
                    textAlign: "center",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onClick={() => onLaunchBear?.()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onLaunchBear?.();
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 6 }}>🐻</div>
                  <div
                    style={{
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      color: "#FFD700",
                      fontSize: 17,
                      fontWeight: 900,
                      letterSpacing: 2,
                      marginBottom: 4,
                      textShadow: "0 0 10px rgba(255,215,0,0.8)",
                    }}
                  >
                    TEDY
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ffe580",
                      fontFamily: "'Figtree',sans-serif",
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    Thank you for adding ODINMARIO as your partner!
                  </div>
                  <button
                    type="button"
                    data-ocid="special_partner.primary_button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchBear?.();
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
                      color: "#1a0a00",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      fontWeight: 900,
                      fontSize: 12,
                      letterSpacing: 1,
                      cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(255,165,0,0.6)",
                    }}
                  >
                    ▶ PLAY NOW
                  </button>
                </div>
                <div
                  data-ocid="special_partner.card"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, rgba(30,0,80,0.9) 0%, rgba(60,20,120,0.85) 50%, rgba(30,0,80,0.9) 100%)",
                    border: "2px solid #FFD700",
                    borderRadius: 16,
                    padding: "16px 12px",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow:
                      "0 0 20px rgba(255,215,0,0.6), 0 4px 24px rgba(0,0,0,0.4)",
                    textAlign: "center",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onClick={() => onLaunchOdinWarrior?.()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onLaunchOdinWarrior?.();
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 6 }}>⚔️</div>
                  <div
                    style={{
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      color: "#FFD700",
                      fontSize: 17,
                      fontWeight: 900,
                      letterSpacing: 2,
                      marginBottom: 4,
                      textShadow: "0 0 10px rgba(255,215,0,0.8)",
                    }}
                  >
                    ODIN WARRIOR
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ffe580",
                      fontFamily: "'Figtree',sans-serif",
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    Thank you for building an amazing platform — Odin Mario is
                    proud to be part of it!
                  </div>
                  <button
                    type="button"
                    data-ocid="special_partner.secondary_button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchOdinWarrior?.();
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
                      color: "#1a0a00",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      fontWeight: 900,
                      fontSize: 12,
                      letterSpacing: 1,
                      cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(255,165,0,0.6)",
                    }}
                  >
                    ▶ PLAY NOW
                  </button>
                </div>
                <div
                  data-ocid="baby_odin.card"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, rgba(60,30,0,0.9) 0%, rgba(120,60,0,0.85) 50%, rgba(60,30,0,0.9) 100%)",
                    border: "2px solid #FFD700",
                    borderRadius: 16,
                    padding: "16px 12px",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow:
                      "0 0 20px rgba(255,215,0,0.6), 0 4px 24px rgba(0,0,0,0.4)",
                    textAlign: "center",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onClick={() => onLaunchBabyOdin?.()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onLaunchBabyOdin?.();
                  }}
                >
                  <div style={{ fontSize: 50, marginBottom: 6, lineHeight: 1 }}>
                    👶
                  </div>
                  <div
                    style={{
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      color: "#FFD700",
                      fontSize: 17,
                      fontWeight: 900,
                      letterSpacing: 2,
                      marginBottom: 4,
                      textShadow: "0 0 10px rgba(255,215,0,0.8)",
                    }}
                  >
                    BABY ODIN
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ffe580",
                      fontFamily: "'Figtree',sans-serif",
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    Thank you for building an amazing tools on odin.fun!
                  </div>
                  <button
                    type="button"
                    data-ocid="baby_odin.primary_button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchBabyOdin?.();
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
                      color: "#1a0a00",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      fontWeight: 900,
                      fontSize: 12,
                      letterSpacing: 1,
                      cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(255,165,0,0.6)",
                    }}
                  >
                    ▶ PLAY NOW
                  </button>
                </div>
              </div>
            </div>

            {/* PvP Game Section */}
            <div
              style={{
                marginTop: 20,
                marginBottom: 4,
                padding: "16px 12px",
                background:
                  "linear-gradient(135deg, rgba(150,20,20,0.35) 0%, rgba(180,60,0,0.25) 100%)",
                border: "2px solid rgba(220,60,0,0.6)",
                borderRadius: 12,
                boxShadow: "0 0 24px rgba(220,60,0,0.3)",
              }}
            >
              <p
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  color: "#ff6b35",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 12,
                  textShadow: "0 0 12px rgba(255,100,0,0.7)",
                  textAlign: "center",
                }}
              >
                ⚔️ PvP GAME ⚔️
              </p>

              {/* PvP Cards Row */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                {/* CHESS PvP Card */}
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, #0a0a1a 0%, #1a1030 100%)",
                    border: "2px solid rgba(181,136,99,0.7)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    flex: "1 1 220px",
                    maxWidth: 280,
                    boxShadow: "0 0 20px rgba(181,136,99,0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        fontSize: 40,
                        lineHeight: 1,
                        flexShrink: 0,
                        filter: "drop-shadow(0 0 8px rgba(181,136,99,0.6))",
                      }}
                    >
                      ♟️
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: "'Press Start 2P', monospace",
                          color: "#f0d9b5",
                          fontSize: 10,
                          fontWeight: 700,
                          marginBottom: 4,
                          textShadow: "1px 1px 0 #4a3220",
                        }}
                      >
                        CHESS PvP
                      </div>
                      <div
                        style={{
                          fontFamily: "'Figtree', sans-serif",
                          color: "rgba(255,255,255,0.65)",
                          fontSize: 10,
                          lineHeight: 1.5,
                        }}
                      >
                        Challenge players worldwide! Create a room, share the
                        code, and battle in turn-based chess.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["♟️ Online PvP", "🏆 Turn-Based", "🌐 Cross-Device"].map(
                      (tag) => (
                        <span
                          key={tag}
                          style={{
                            background: "rgba(181,136,99,0.15)",
                            border: "1px solid rgba(181,136,99,0.4)",
                            borderRadius: 4,
                            color: "#b58863",
                            fontSize: 8,
                            fontFamily: "'Press Start 2P', monospace",
                            padding: "2px 6px",
                          }}
                        >
                          {tag}
                        </span>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    data-ocid="pvpgame.chess.primary_button"
                    onClick={() => onLaunchChessPvP?.()}
                    style={{
                      background:
                        "linear-gradient(180deg, #b58863 0%, #8b6340 100%)",
                      border: "3px solid #f0d9b5",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 9,
                      fontFamily: "'Press Start 2P', 'Courier New', monospace",
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontWeight: 700,
                      boxShadow:
                        "0 4px 0 #4a3220, 0 0 12px rgba(181,136,99,0.4)",
                      textShadow: "1px 1px 0 rgba(0,0,0,0.5)",
                      transition: "transform 0.1s",
                      alignSelf: "flex-start",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    ⚔️ PLAY CHESS
                  </button>
                </div>

                {/* PENALTY SHOOTOUT PvP Card */}
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, #0a1a0a 0%, #102010 100%)",
                    border: "2px solid rgba(34,197,94,0.7)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    flex: "1 1 220px",
                    maxWidth: 280,
                    boxShadow: "0 0 20px rgba(34,197,94,0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        fontSize: 40,
                        lineHeight: 1,
                        flexShrink: 0,
                        filter: "drop-shadow(0 0 8px rgba(34,197,94,0.6))",
                      }}
                    >
                      ⚽
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: "'Press Start 2P', monospace",
                          color: "#ffe066",
                          fontSize: 10,
                          fontWeight: 700,
                          marginBottom: 4,
                          textShadow: "1px 1px 0 #065f46",
                        }}
                      >
                        PENALTY SHOOTOUT
                      </div>
                      <div
                        style={{
                          fontFamily: "'Figtree', sans-serif",
                          color: "rgba(255,255,255,0.65)",
                          fontSize: 10,
                          lineHeight: 1.5,
                        }}
                      >
                        Challenge a friend to a penalty shootout! Take turns
                        kicking and saving. First to score 5 goals wins!
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      "⚽ Penalty Kicks",
                      "⚡ Online PvP",
                      "🌐 Cross-Device",
                    ].map((tag) => (
                      <span
                        key={tag}
                        style={{
                          background: "rgba(34,197,94,0.15)",
                          border: "1px solid rgba(34,197,94,0.4)",
                          borderRadius: 4,
                          color: "#86efac",
                          fontSize: 8,
                          fontFamily: "'Press Start 2P', monospace",
                          padding: "2px 6px",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-ocid="pvpgame.penalty.primary_button"
                    onClick={() => onLaunchPenalty?.()}
                    style={{
                      background:
                        "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                      border: "3px solid #ffe066",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 9,
                      fontFamily: "'Press Start 2P', 'Courier New', monospace",
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontWeight: 700,
                      boxShadow:
                        "0 4px 0 #065f46, 0 0 12px rgba(34,197,94,0.4)",
                      textShadow: "1px 1px 0 rgba(0,0,0,0.5)",
                      transition: "transform 0.1s",
                      alignSelf: "flex-start",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    ⚽ PLAY PENALTY
                  </button>
                </div>
              </div>
            </div>

            {/* MORE GAMES - horizontal scroll */}
            <div
              style={{
                marginTop: 20,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "'Figtree',sans-serif",
                  color: "#FFD700",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 10,
                  textShadow: "0 0 8px rgba(255,215,0,0.5)",
                }}
              >
                🎮 More Games
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  overflowX: "auto",
                  paddingBottom: 8,
                  paddingLeft: 4,
                  paddingRight: 4,
                  scrollSnapType: "x mandatory",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {[
                  { title: "SNAKE", icon: "🐍", desc: "Classic snake game" },
                  {
                    title: "PAC-MAN",
                    icon: "👻",
                    desc: "Pac-Man style arcade",
                  },
                  { title: "CHESS", icon: "♟️", desc: "Classic chess game" },
                  { title: "CONTRA", icon: "🔫", desc: "Run & gun action" },
                  {
                    title: "ODIN SPACE",
                    icon: "🚀",
                    desc: "Defend the galaxy as Odin!",
                  },
                ].map((game) => {
                  const isPacMan = game.title === "PAC-MAN";
                  const isContra = game.title === "CONTRA";
                  const isSnake = game.title === "SNAKE";
                  const isChess = game.title === "CHESS";
                  const isBear = game.title === "TEDY";
                  const isOdinSpace = game.title === "ODIN SPACE";
                  const isUnlocked =
                    isPacMan ||
                    isContra ||
                    isSnake ||
                    isChess ||
                    isBear ||
                    isOdinSpace;
                  function handleCardClick() {
                    if (isPacMan) onLaunchPacMan?.();
                    else if (isContra) onLaunchContra?.();
                    else if (isSnake) onLaunchSnake?.();
                    else if (isChess) onLaunchChess?.();
                    else if (isBear) onLaunchBear?.();
                    else if (isOdinSpace) onLaunchOdinSpace?.();
                  }
                  return (
                    <div
                      key={game.title}
                      style={{
                        flexShrink: 0,
                        scrollSnapAlign: "start",
                        width: 140,
                        background:
                          "linear-gradient(135deg, rgba(20,60,120,0.9) 0%, rgba(40,10,80,0.9) 100%)",
                        border: isContra
                          ? "2px solid #ff4400"
                          : isPacMan
                            ? "2px solid #44ff44"
                            : isSnake
                              ? "2px solid #00ff88"
                              : isChess
                                ? "2px solid #f0d9b5"
                                : "2px solid rgba(255,215,0,0.4)",
                        borderRadius: 14,
                        padding: "16px 10px",
                        cursor: isUnlocked ? "pointer" : "default",
                        position: "relative",
                        overflow: "hidden",
                        boxShadow: isContra
                          ? "0 0 16px rgba(255,68,0,0.4)"
                          : isPacMan
                            ? "0 0 16px rgba(68,255,68,0.4)"
                            : isSnake
                              ? "0 0 16px rgba(0,255,136,0.4)"
                              : isChess
                                ? "0 0 16px rgba(240,217,181,0.3)"
                                : undefined,
                      }}
                      onClick={isUnlocked ? handleCardClick : undefined}
                      onKeyDown={
                        isUnlocked
                          ? (e) => {
                              if (e.key === "Enter") handleCardClick();
                            }
                          : undefined
                      }
                    >
                      {!isUnlocked && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(0,0,0,0.35)",
                            backdropFilter: "blur(1px)",
                            borderRadius: 14,
                          }}
                        />
                      )}
                      <div
                        style={{
                          fontSize: 36,
                          marginBottom: 6,
                          position: "relative",
                        }}
                      >
                        {game.icon}
                      </div>
                      <div
                        style={{
                          fontFamily: "'Bricolage Grotesque',sans-serif",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: 1,
                          marginBottom: 4,
                          position: "relative",
                        }}
                      >
                        {game.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#c0d8f0",
                          fontFamily: "'Figtree',sans-serif",
                          marginBottom: 8,
                          position: "relative",
                        }}
                      >
                        {game.desc}
                      </div>
                      {isUnlocked ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick();
                          }}
                          style={{
                            background: isContra
                              ? "linear-gradient(90deg, #cc2200, #ff4400)"
                              : isSnake
                                ? "linear-gradient(90deg, #009944, #00ff88)"
                                : isChess
                                  ? "linear-gradient(90deg, #8a6640, #f0d9b5)"
                                  : "linear-gradient(90deg, #00aa22, #44ff44)",
                            color: isContra
                              ? "#fff"
                              : isChess
                                ? "#222"
                                : "#000",
                            fontSize: 10,
                            fontWeight: 800,
                            fontFamily: "'Figtree',sans-serif",
                            borderRadius: 20,
                            padding: "3px 10px",
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            display: "inline-block",
                            position: "relative",
                            boxShadow: isContra
                              ? "0 0 8px rgba(255,68,0,0.6)"
                              : isSnake
                                ? "0 0 8px rgba(0,255,136,0.6)"
                                : isChess
                                  ? "0 0 8px rgba(240,217,181,0.4)"
                                  : "0 0 8px rgba(68,255,68,0.6)",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          ▶ PLAY NOW
                        </button>
                      ) : (
                        <div
                          style={{
                            background:
                              "linear-gradient(90deg, #FF6B00, #D62B1E)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 800,
                            fontFamily: "'Figtree',sans-serif",
                            borderRadius: 20,
                            padding: "3px 10px",
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            display: "inline-block",
                            position: "relative",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                          }}
                        >
                          ⏳ Coming Soon
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p
                style={{
                  fontFamily: "'Figtree',sans-serif",
                  color: "#8899bb",
                  fontSize: 11,
                  marginTop: 6,
                }}
              >
                ← swipe to see more →
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE BUTTON */}
      {(gameState === "playing" || gameState === "boss") && !paused && (
        <button
          type="button"
          data-ocid="game.pause_button"
          onClick={() => {
            setPaused(true);
            pausedRef.current = true;
          }}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 50,
            background: "rgba(0,0,0,0.5)",
            border: "2px solid rgba(255,255,255,0.4)",
            borderRadius: 10,
            color: "#fff",
            fontSize: 22,
            width: 44,
            height: 44,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          ⏸
        </button>
      )}

      {/* PAUSE OVERLAY */}
      {paused && (
        <div style={overlayStyle}>
          <div style={panelStyle}>
            <div
              style={{
                fontSize: "clamp(2rem,7vw,3.5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FFD700",
                textShadow: "4px 4px 0 #000",
                marginBottom: 28,
              }}
            >
              ⏸ PAUSED
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button
                type="button"
                data-ocid="game.resume_button"
                onClick={() => {
                  setPaused(false);
                  pausedRef.current = false;
                }}
                style={{
                  ...startBtnStyle,
                  background:
                    "linear-gradient(180deg, #00CC44 0%, #007722 100%)",
                  borderColor: "#00FF88",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                ▶ RESUME
              </button>
              <button
                type="button"
                data-ocid="game.menu_button"
                onClick={() => {
                  setPaused(false);
                  pausedRef.current = false;
                  setGameState("start");
                  setShowScoreSubmit(false);
                }}
                style={{
                  ...startBtnStyle,
                  background:
                    "linear-gradient(180deg, #334488 0%, #112244 100%)",
                  borderColor: "#6699FF",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                🏠 BACK TO MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {gameState === "gameover" && (
        <div style={overlayStyle}>
          <div style={panelStyle}>
            <div
              style={{
                fontSize: "clamp(2rem,7vw,4rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FF3D00",
                textShadow: "4px 4px 0 #000",
                marginBottom: 8,
              }}
            >
              GAME OVER
            </div>
            <div
              style={{
                fontSize: "clamp(1rem,3vw,1.3rem)",
                color: "#ccc",
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 4,
              }}
            >
              World {currentWorld}
            </div>
            <div
              style={{
                fontSize: "clamp(1.2rem,4vw,2rem)",
                fontFamily: "'Figtree',sans-serif",
                color: COIN_COLOR,
                fontWeight: 700,
                textShadow: "2px 2px 0 #000",
                marginBottom: 24,
              }}
            >
              ₿ {score}
            </div>
            {showScoreSubmit && !scoreSubmitted ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    color: "#FFD700",
                    fontFamily: "'Figtree',sans-serif",
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  Enter your name for the leaderboard:
                </div>
                <input
                  type="text"
                  data-ocid="score.input"
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid #FFD700",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 14px",
                    fontSize: 15,
                    fontFamily: "'Figtree',sans-serif",
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: 10,
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    data-ocid="score.submit_button"
                    disabled={scoreSubmitting || !playerName.trim()}
                    onClick={async () => {
                      if (!playerName.trim()) return;
                      autoSubmitFiredRef.current = true;
                      setScoreSubmitting(true);
                      try {
                        await actor?.submitScore(
                          playerName.trim(),
                          BigInt(score),
                        );
                        localStorage.setItem(
                          "odinmario_username",
                          playerName.trim(),
                        );
                        setScoreSubmitted(true);
                        setShowLeaderboard(true);
                        setLeaderboardLoading(true);
                        const d = (await actor?.getTop10Scores()) ?? [];
                        setLeaderboardData(d);
                        setLeaderboardLoading(false);
                      } catch {
                        autoSubmitFiredRef.current = false;
                      }
                      setScoreSubmitting(false);
                    }}
                    style={{
                      ...startBtnStyle,
                      flex: 1,
                      padding: "10px 16px",
                      fontSize: 13,
                      opacity: !playerName.trim() || scoreSubmitting ? 0.5 : 1,
                    }}
                  >
                    {scoreSubmitting ? "..." : "🏆 SUBMIT"}
                  </button>
                  <button
                    type="button"
                    data-ocid="score.cancel_button"
                    onClick={() => {
                      setShowScoreSubmit(false);
                      startGame();
                    }}
                    style={{
                      ...startBtnStyle,
                      flex: 1,
                      padding: "10px 16px",
                      fontSize: 13,
                      background: "linear-gradient(180deg, #555 0%, #333 100%)",
                      borderColor: "#888",
                    }}
                  >
                    SKIP
                  </button>
                </div>
              </div>
            ) : scoreSubmitted && showLeaderboard ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    color: "#00FF88",
                    fontFamily: "'Figtree',sans-serif",
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  ✅ Score submitted!
                </div>
                {leaderboardLoading ? (
                  <div style={{ color: "#ccc" }}>Loading...</div>
                ) : (
                  <div>
                    {leaderboardData.length === 0 ? (
                      <div style={{ color: "#ccc" }}>No scores yet!</div>
                    ) : (
                      leaderboardData.map((entry, i) => (
                        <div
                          key={`${entry.playerName}-${i}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            color: i === 0 ? "#FFD700" : "#e0e0e0",
                            fontFamily: "'Figtree',sans-serif",
                            fontSize: 14,
                            padding: "3px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          <span>
                            #{i + 1} {entry.playerName}
                          </span>
                          <span>₿ {entry.score.toString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {!showScoreSubmit || scoreSubmitted ? (
              <button
                type="button"
                data-ocid="game.primary_button"
                onClick={startGame}
                style={startBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.06) rotate(-1deg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1) rotate(0deg)";
                }}
              >
                🔄 TRY AGAIN
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* VICTORY SCREEN */}
      {gameState === "victory" && (
        <div style={overlayStyle}>
          <div
            style={{
              ...panelStyle,
              background:
                "linear-gradient(135deg, rgba(0,20,60,0.97) 0%, rgba(0,40,100,0.97) 100%)",
              border: "3px solid #00CCFF",
              boxShadow:
                "0 0 80px rgba(0,200,255,0.5), 0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                fontSize: "clamp(1rem,3vw,1.2rem)",
                color: "#00CCFF",
                letterSpacing: 3,
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 4,
              }}
            >
              ⚡ STORM ODIN DEFEATED! ⚡
            </div>
            <div
              style={{
                fontSize: "clamp(2.5rem,8vw,5rem)",
                fontWeight: 900,
                fontFamily: "'Bricolage Grotesque',sans-serif",
                color: "#FFD700",
                textShadow: "0 0 30px #00CCFF, 4px 4px 0 #000",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              VICTORY!
            </div>
            <div
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.2rem)",
                color: "#A0E8FF",
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 4,
              }}
            >
              All 4 worlds conquered!
            </div>
            <div
              style={{
                fontSize: "clamp(1rem,3vw,1.5rem)",
                color: "#FFFFFF",
                fontFamily: "'Figtree',sans-serif",
                marginBottom: 8,
                textShadow: "0 0 10px #FF6600",
              }}
            >
              ODIN REIGNS SUPREME!
            </div>
            <div
              style={{
                fontSize: "clamp(1.2rem,4vw,2rem)",
                fontFamily: "'Figtree',sans-serif",
                color: COIN_COLOR,
                fontWeight: 700,
                textShadow: "2px 2px 0 #000",
                marginBottom: 24,
              }}
            >
              ₿ {score}
            </div>
            {showScoreSubmit && !scoreSubmitted ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    color: "#FFD700",
                    fontFamily: "'Figtree',sans-serif",
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  Enter your name for the leaderboard:
                </div>
                <input
                  type="text"
                  data-ocid="score.input"
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid #FFD700",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 14px",
                    fontSize: 15,
                    fontFamily: "'Figtree',sans-serif",
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: 10,
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    data-ocid="score.submit_button"
                    disabled={scoreSubmitting || !playerName.trim()}
                    onClick={async () => {
                      if (!playerName.trim()) return;
                      autoSubmitFiredRef.current = true;
                      setScoreSubmitting(true);
                      try {
                        await actor?.submitScore(
                          playerName.trim(),
                          BigInt(score),
                        );
                        localStorage.setItem(
                          "odinmario_username",
                          playerName.trim(),
                        );
                        setScoreSubmitted(true);
                        setShowLeaderboard(true);
                        setLeaderboardLoading(true);
                        const d = (await actor?.getTop10Scores()) ?? [];
                        setLeaderboardData(d);
                        setLeaderboardLoading(false);
                      } catch {
                        autoSubmitFiredRef.current = false;
                      }
                      setScoreSubmitting(false);
                    }}
                    style={{
                      ...startBtnStyle,
                      flex: 1,
                      padding: "10px 16px",
                      fontSize: 13,
                      opacity: !playerName.trim() || scoreSubmitting ? 0.5 : 1,
                    }}
                  >
                    {scoreSubmitting ? "..." : "🏆 SUBMIT"}
                  </button>
                  <button
                    type="button"
                    data-ocid="score.cancel_button"
                    onClick={() => {
                      setShowScoreSubmit(false);
                      startGame();
                    }}
                    style={{
                      ...startBtnStyle,
                      flex: 1,
                      padding: "10px 16px",
                      fontSize: 13,
                      background: "linear-gradient(180deg, #555 0%, #333 100%)",
                      borderColor: "#888",
                    }}
                  >
                    SKIP
                  </button>
                </div>
              </div>
            ) : scoreSubmitted && showLeaderboard ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    color: "#00FF88",
                    fontFamily: "'Figtree',sans-serif",
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  ✅ Score submitted!
                </div>
                {leaderboardLoading ? (
                  <div style={{ color: "#ccc" }}>Loading...</div>
                ) : (
                  <div>
                    {leaderboardData.length === 0 ? (
                      <div style={{ color: "#ccc" }}>No scores yet!</div>
                    ) : (
                      leaderboardData.map((entry, i) => (
                        <div
                          key={`${entry.playerName}-${i}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            color: i === 0 ? "#FFD700" : "#e0e0e0",
                            fontFamily: "'Figtree',sans-serif",
                            fontSize: 14,
                            padding: "3px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          <span>
                            #{i + 1} {entry.playerName}
                          </span>
                          <span>₿ {entry.score.toString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {!showScoreSubmit || scoreSubmitted ? (
              <button
                type="button"
                data-ocid="game.primary_button"
                onClick={startGame}
                style={startBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.06) rotate(-1deg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1) rotate(0deg)";
                }}
              >
                🔄 PLAY AGAIN
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* TOUCH CONTROLS */}
      {(gameState === "playing" || gameState === "boss") && (
        <div style={touchControlsContainer}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              data-ocid="controls.left_button"
              onPointerDown={() => handleTouchDown("left")}
              onPointerUp={() => setTouch("left", false)}
              onPointerCancel={() => setTouch("left", false)}
              onPointerLeave={() => setTouch("left", false)}
              style={touchBtnStyle}
            >
              ◄
            </button>
            <button
              type="button"
              data-ocid="controls.right_button"
              onPointerDown={() => handleTouchDown("right")}
              onPointerUp={() => setTouch("right", false)}
              onPointerCancel={() => setTouch("right", false)}
              onPointerLeave={() => setTouch("right", false)}
              style={touchBtnStyle}
            >
              ►
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {(gameState === "boss" || tripleShotTimeLeft > 0) && (
              <button
                type="button"
                data-ocid="controls.shoot_button"
                onPointerDown={() => handleTouchDown("shoot")}
                onPointerUp={() => setTouch("shoot", false)}
                onPointerCancel={() => setTouch("shoot", false)}
                onPointerLeave={() => setTouch("shoot", false)}
                style={{
                  ...touchBtnStyle,
                  ...shootBtnStyle,
                  ...(tripleShotTimeLeft > 0
                    ? {
                        background: "rgba(255, 200, 0, 0.35)",
                        border: "3px solid #FFD700",
                        boxShadow: "0 0 14px #FFD700, 0 0 28px #FFA500",
                        animation:
                          "tripleShootPulse 0.6s ease-in-out infinite alternate",
                      }
                    : {}),
                }}
              >
                🔫
                {tripleShotTimeLeft > 0 && gameState !== "boss"
                  ? ` ${tripleShotTimeLeft}s`
                  : ""}
              </button>
            )}
            <button
              type="button"
              data-ocid="controls.jump_button"
              onPointerDown={() => handleTouchDown("jump")}
              onPointerUp={() => setTouch("jump", false)}
              onPointerCancel={() => setTouch("jump", false)}
              onPointerLeave={() => setTouch("jump", false)}
              style={{ ...touchBtnStyle, ...jumpBtnStyle }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
      <div
        style={{
          textAlign: "center",
          marginTop: 4,
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "1px",
          fontFamily: "monospace",
          paddingBottom: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>Built by ODINMARIO</span>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "url(/assets/uploads/20013_11zon-1.png) center center / cover no-repeat",
  backdropFilter: "blur(2px)",
};

const panelStyle: React.CSSProperties = {
  background:
    "linear-gradient(135deg, rgba(20,60,120,0.95) 0%, rgba(40,10,80,0.95) 100%)",
  border: "3px solid #FFD700",
  borderRadius: 20,
  padding: "clamp(16px, 4vw, 40px) clamp(16px, 4vw, 48px)",
  textAlign: "center",
  boxShadow: "0 0 60px rgba(255,215,0,0.3), 0 20px 60px rgba(0,0,0,0.6)",
  width: "min(520px, 94vw)",
  maxHeight: "calc(100vh - 40px)",
  overflowY: "auto",
};

const startBtnStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #FF6B00 0%, #D62B1E 100%)",
  color: "#fff",
  border: "3px solid #FFD700",
  borderRadius: 12,
  padding: "14px 36px",
  fontSize: "clamp(1rem, 3vw, 1.25rem)",
  fontWeight: 800,
  fontFamily: "'Bricolage Grotesque', sans-serif",
  cursor: "pointer",
  letterSpacing: 2,
  boxShadow: "0 6px 0 #8B1500, 0 8px 20px rgba(0,0,0,0.4)",
  transition: "transform 0.12s",
  userSelect: "none",
};

const touchControlsContainer: React.CSSProperties = {
  position: "absolute",
  bottom: 80,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  padding: "0 16px",
  pointerEvents: "none",
  alignItems: "flex-end",
};

const touchBtnStyle: React.CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  border: "2.5px solid rgba(255,255,255,0.5)",
  color: "#fff",
  fontSize: 32,
  fontWeight: 700,
  cursor: "pointer",
  pointerEvents: "auto",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
  boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
};

const jumpBtnStyle: React.CSSProperties = {
  width: 90,
  height: 90,
  borderRadius: "50%",
  background: "rgba(255, 60, 0, 0.4)",
  border: "2.5px solid rgba(255,150,50,0.8)",
  fontSize: 32,
};

const shootBtnStyle: React.CSSProperties = {
  width: 86,
  height: 86,
  borderRadius: "50%",
  background: "rgba(180,0,255,0.4)",
  border: "2.5px solid rgba(200,100,255,0.8)",
  fontSize: 32,
};
