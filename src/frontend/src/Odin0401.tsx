import { useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";
import {
  playBossHit,
  playCoin,
  playEnemyDie,
  playGameOver,
  playHit,
  playJump,
  playShoot,
} from "./utils/sounds";

interface Odin0401Props {
  onBack: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 900;
const CANVAS_H = 480;
const GROUND_Y = CANVAS_H - 80;
const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const CHAR_W = 48;
const CHAR_H = 56;
const ATTACK_DURATION = 300;
const ATTACK_RANGE = 75;
const INVINCIBLE_MS = 800;
const BOSS_HP = 41;
const BOSS_W = 90;
const BOSS_H = 110;
const HACK_BEAM_DURATION = 1800;

type CharacterType = "babyodin" | "tedy" | "odinwarrior";
type Phase =
  | "username"
  | "characterSelect"
  | "start"
  | "playing"
  | "gameover"
  | "leaderboard";
type EnemyType = "scriptkiddie" | "blackhat" | "elitehacker" | "boss";

interface Enemy {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  type: EnemyType;
  dir: 1 | -1;
  speed: number;
  attackTimer: number;
  dead: boolean;
  deadTimer: number;
  legAnim: number;
  // elite hacker
  shootTimer?: number;
  // boss only
  chargeTimer?: number;
  charging?: boolean;
  hackBeamTimer?: number;
  hackBeamActive?: boolean;
  hackBeamDuration?: number;
  coinStealTimer?: number;
  hitFlash?: number;
}

interface Coin {
  id: number;
  x: number;
  y: number;
  vy: number;
  collected: boolean;
  fake?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  r: number;
}

interface VirusProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

interface GameState {
  running: boolean;
  over: boolean;
  victory: boolean;
  score: number;
  lives: number;
  wave: number; // 1–3 = normal, 4 = boss
  charX: number;
  charY: number;
  charVY: number;
  onGround: boolean;
  jumpsLeft: number;
  facingLeft: boolean;
  attacking: boolean;
  attackTimer: number;
  specialUsed: boolean;
  specialCooldown: number;
  honeyShieldActive: boolean;
  honeyShieldTimer: number;
  lightningActive: boolean;
  lightningTimer: number;
  legAnim: number;
  moveLeft: boolean;
  moveRight: boolean;
  enemies: Enemy[];
  coins: Coin[];
  particles: Particle[];
  virusProjectiles: VirusProjectile[];
  waveCleared: boolean;
  waveClearTimer: number;
  bossIntroActive: boolean;
  bossIntroTimer: number;
  invincible: number;
  tick: number;
  submitted: boolean;
}

let _nextId = 1;
function nextId() {
  return _nextId++;
}

// ── Wave enemy data ───────────────────────────────────────────────────────────

function waveEnemies(wave: number): Enemy[] {
  if (wave === 1) {
    return Array.from({ length: 3 }, (_, i) => ({
      id: nextId(),
      x: 650 + i * 160,
      y: GROUND_Y - 36,
      w: 34,
      h: 36,
      hp: 2,
      maxHp: 2,
      type: "scriptkiddie" as EnemyType,
      dir: -1 as 1 | -1,
      speed: 1.0,
      attackTimer: 0,
      dead: false,
      deadTimer: 0,
      legAnim: 0,
    }));
  }
  if (wave === 2) {
    return Array.from({ length: 4 }, (_, i) => ({
      id: nextId(),
      x: 600 + i * 150,
      y: GROUND_Y - 42,
      w: 38,
      h: 42,
      hp: 3,
      maxHp: 3,
      type: "blackhat" as EnemyType,
      dir: -1 as 1 | -1,
      speed: 1.6,
      attackTimer: 0,
      dead: false,
      deadTimer: 0,
      legAnim: 0,
    }));
  }
  if (wave === 3) {
    return Array.from({ length: 5 }, (_, i) => ({
      id: nextId(),
      x: 580 + i * 120,
      y: GROUND_Y - 48,
      w: 42,
      h: 48,
      hp: 4,
      maxHp: 4,
      type: "elitehacker" as EnemyType,
      dir: -1 as 1 | -1,
      speed: 2.0,
      attackTimer: 0,
      dead: false,
      deadTimer: 0,
      legAnim: 0,
      shootTimer: Math.random() * 180,
    }));
  }
  // Boss (wave 4)
  return [
    {
      id: nextId(),
      x: CANVAS_W * 0.7,
      y: GROUND_Y - BOSS_H,
      w: BOSS_W,
      h: BOSS_H,
      hp: BOSS_HP,
      maxHp: BOSS_HP,
      type: "boss" as EnemyType,
      dir: -1 as 1 | -1,
      speed: 1.8,
      attackTimer: 0,
      dead: false,
      deadTimer: 0,
      legAnim: 0,
      chargeTimer: 240,
      charging: false,
      hackBeamTimer: 360,
      hackBeamActive: false,
      hackBeamDuration: 0,
      coinStealTimer: 300,
      hitFlash: 0,
    },
  ];
}

function initState(): GameState {
  return {
    running: false,
    over: false,
    victory: false,
    score: 0,
    lives: 3,
    wave: 1,
    charX: 100,
    charY: GROUND_Y - CHAR_H,
    charVY: 0,
    onGround: true,
    jumpsLeft: 2,
    facingLeft: false,
    attacking: false,
    attackTimer: 0,
    specialUsed: false,
    specialCooldown: 0,
    honeyShieldActive: false,
    honeyShieldTimer: 0,
    lightningActive: false,
    lightningTimer: 0,
    legAnim: 0,
    moveLeft: false,
    moveRight: false,
    enemies: waveEnemies(1),
    coins: [],
    particles: [],
    virusProjectiles: [],
    waveCleared: false,
    waveClearTimer: 0,
    bossIntroActive: false,
    bossIntroTimer: 0,
    invincible: 0,
    tick: 0,
    submitted: false,
  };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

const babyOdinImg = new Image();
babyOdinImg.src = "/assets/20260317_100519-3.jpg";
const priceIconImg = new Image();
priceIconImg.src = "/assets/uploads/19952_11zon-1-1.jpg";

function drawBackground(
  ctx: CanvasRenderingContext2D,
  tick: number,
  hackBeamActive: boolean,
) {
  // Cyber dark background
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  if (hackBeamActive) {
    grad.addColorStop(0, "#300010");
    grad.addColorStop(1, "#1a0008");
  } else {
    grad.addColorStop(0, "#050a1e");
    grad.addColorStop(0.6, "#0a1535");
    grad.addColorStop(1, "#060c20");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Circuit lines
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const x = i * 130 - ((tick * 0.3) % 130);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 40, CANVAS_H);
    ctx.stroke();
  }
  for (let j = 0; j < 6; j++) {
    const y = j * 90;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y + 20);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Scrolling ODIN.FUN background text
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 80px monospace";
  ctx.textAlign = "center";
  const textOffset = (tick * 0.4) % 400;
  for (let i = -1; i < 4; i++) {
    ctx.fillText("ODIN.FUN", 200 + i * 400 - textOffset, 160);
    ctx.fillText("ODIN.FUN", 400 + i * 400 - textOffset, 320);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Ground
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  groundGrad.addColorStop(0, "#1a0533");
  groundGrad.addColorStop(1, "#0a0218");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
  // Ground edge glow
  ctx.fillStyle = "rgba(0,212,255,0.3)";
  ctx.fillRect(0, GROUND_Y, CANVAS_W, 3);

  // Hack beam red overlay
  if (hackBeamActive) {
    ctx.fillStyle = "rgba(255,0,30,0.12)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  charType: CharacterType,
  x: number,
  y: number,
  facingLeft: boolean,
  attacking: boolean,
  legAnim: number,
  invincible: number,
  honeyShield: boolean,
  lightningActive: boolean,
  tick: number,
) {
  if (invincible > 0 && Math.floor(invincible / 80) % 2 === 0) return;

  ctx.save();
  if (facingLeft) {
    ctx.translate(x + CHAR_W / 2, y + CHAR_H / 2);
    ctx.scale(-1, 1);
    ctx.translate(-CHAR_W / 2, -CHAR_H / 2);
  } else {
    ctx.translate(x, y);
  }

  if (charType === "babyodin") {
    // Baby Odin - small cute warrior
    // Body (round, light blue)
    ctx.fillStyle = "#a0c8ff";
    ctx.beginPath();
    ctx.ellipse(
      CHAR_W / 2,
      CHAR_H * 0.55,
      CHAR_W * 0.42,
      CHAR_H * 0.28,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Head
    ctx.fillStyle = "#ffd4a0";
    ctx.beginPath();
    ctx.arc(CHAR_W / 2, CHAR_H * 0.28, 14, 0, Math.PI * 2);
    ctx.fill();
    // Hair (blonde)
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(CHAR_W / 2 - 10, CHAR_H * 0.15, 20, 8);
    ctx.beginPath();
    ctx.arc(CHAR_W / 2, CHAR_H * 0.18, 12, Math.PI, 0);
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(CHAR_W / 2 - 6, CHAR_H * 0.24, 4, 4);
    ctx.fillRect(CHAR_W / 2 + 2, CHAR_H * 0.24, 4, 4);
    // Diaper
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(CHAR_W / 2 - 9, CHAR_H * 0.64, 18, 10);
    ctx.fillStyle = "#ddd";
    ctx.fillRect(CHAR_W / 2 - 9, CHAR_H * 0.64, 18, 3);
    // Mini hammer
    const hammerAngle = attacking ? -0.8 : -0.2;
    ctx.save();
    ctx.translate(CHAR_W * 0.8, CHAR_H * 0.42);
    ctx.rotate(hammerAngle);
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, -14, 4, 22);
    ctx.fillStyle = "#888";
    ctx.fillRect(-7, -18, 14, 9);
    ctx.restore();
    // Legs
    const lA = Math.sin(legAnim * 0.1) * 5;
    ctx.fillStyle = "#a0c8ff";
    ctx.fillRect(CHAR_W / 2 - 10, CHAR_H * 0.76, 8, 14 + lA);
    ctx.fillRect(CHAR_W / 2 + 2, CHAR_H * 0.76, 8, 14 - lA);
    ctx.fillStyle = "#555";
    ctx.fillRect(CHAR_W / 2 - 11, CHAR_H * 0.86 + lA, 10, 5);
    ctx.fillRect(CHAR_W / 2 + 1, CHAR_H * 0.86 - lA, 10, 5);
  } else if (charType === "tedy") {
    // Tedy Bear
    ctx.fillStyle = "#8B5E3C";
    // Body
    ctx.beginPath();
    ctx.ellipse(
      CHAR_W / 2,
      CHAR_H * 0.58,
      CHAR_W * 0.4,
      CHAR_H * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(CHAR_W / 2, CHAR_H * 0.28, 16, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.beginPath();
    ctx.arc(CHAR_W / 2 - 12, CHAR_H * 0.13, 7, 0, Math.PI * 2);
    ctx.arc(CHAR_W / 2 + 12, CHAR_H * 0.13, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D08060";
    ctx.beginPath();
    ctx.arc(CHAR_W / 2 - 12, CHAR_H * 0.13, 4, 0, Math.PI * 2);
    ctx.arc(CHAR_W / 2 + 12, CHAR_H * 0.13, 4, 0, Math.PI * 2);
    ctx.fill();
    // Face
    ctx.fillStyle = "#D08060";
    ctx.beginPath();
    ctx.ellipse(CHAR_W / 2, CHAR_H * 0.32, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(CHAR_W / 2 - 6, CHAR_H * 0.23, 4, 4);
    ctx.fillRect(CHAR_W / 2 + 2, CHAR_H * 0.23, 4, 4);
    ctx.beginPath();
    ctx.arc(CHAR_W / 2, CHAR_H * 0.3, 2, 0, Math.PI * 2);
    ctx.fill();
    // Paw swipe
    const pawX = attacking ? CHAR_W * 0.95 : CHAR_W * 0.75;
    ctx.fillStyle = "#8B5E3C";
    ctx.beginPath();
    ctx.arc(pawX, CHAR_H * 0.48, 10, 0, Math.PI * 2);
    ctx.fill();
    // Claws if attacking
    if (attacking) {
      ctx.fillStyle = "#ddd";
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(pawX - 3 + c * 5, CHAR_H * 0.42, 3, 8);
      }
    }
    // Legs
    const lA = Math.sin(legAnim * 0.1) * 5;
    ctx.fillStyle = "#8B5E3C";
    ctx.fillRect(CHAR_W / 2 - 11, CHAR_H * 0.76, 10, 14 + lA);
    ctx.fillRect(CHAR_W / 2 + 1, CHAR_H * 0.76, 10, 14 - lA);
    ctx.fillStyle = "#6B3E1C";
    ctx.fillRect(CHAR_W / 2 - 12, CHAR_H * 0.86 + lA, 12, 6);
    ctx.fillRect(CHAR_W / 2, CHAR_H * 0.86 - lA, 12, 6);
  } else {
    // Odin Warrior
    // Cape
    ctx.fillStyle = "#5500AA";
    ctx.beginPath();
    ctx.moveTo(-6, 20);
    ctx.lineTo(CHAR_W + 6, 20);
    ctx.lineTo(CHAR_W + 10, CHAR_H + 10);
    ctx.lineTo(-10, CHAR_H + 10);
    ctx.fill();
    // Body
    ctx.fillStyle = attacking ? "#6611cc" : "#220055";
    ctx.fillRect(8, 22, CHAR_W - 16, CHAR_H - 36);
    // Armor chest
    ctx.fillStyle = "#884400";
    ctx.fillRect(10, 26, CHAR_W - 20, 24);
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(CHAR_W / 2 - 2, 28, 4, 20);
    ctx.fillRect(12, 36, CHAR_W - 24, 4);
    // Head
    ctx.fillStyle = "#D4A574";
    ctx.fillRect(10, 2, CHAR_W - 20, 22);
    // Helmet
    ctx.fillStyle = "#666";
    ctx.fillRect(6, -4, CHAR_W - 12, 12);
    // Beard
    ctx.fillStyle = "#888";
    for (let b = 0; b < 4; b++) {
      ctx.fillRect(10 + b * 8, 20, 5, 10 + (b % 2) * 4);
    }
    // Eyes (glowing if lightning)
    ctx.fillStyle = lightningActive ? "#00FFFF" : "#FF0000";
    ctx.fillRect(13, 7, 7, 5);
    ctx.fillRect(CHAR_W - 20, 7, 7, 5);
    // Hammer
    const hAngle = attacking ? 0.4 : -0.15;
    ctx.save();
    ctx.translate(CHAR_W * 0.85, CHAR_H * 0.3);
    ctx.rotate(hAngle);
    if (lightningActive) {
      ctx.shadowColor = "#00CFFF";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-3, -20, 6, 32);
    ctx.fillStyle = lightningActive ? "#00CFFF" : "#999";
    ctx.fillRect(-10, -24, 20, 12);
    ctx.shadowBlur = 0;
    ctx.restore();
    // Legs
    const lA = Math.sin(legAnim * 0.1) * 5;
    ctx.fillStyle = "#220055";
    ctx.fillRect(CHAR_W / 2 - 11, CHAR_H * 0.76, 10, 14 + lA);
    ctx.fillRect(CHAR_W / 2 + 1, CHAR_H * 0.76, 10, 14 - lA);
    ctx.fillStyle = "#2B1800";
    ctx.fillRect(CHAR_W / 2 - 12, CHAR_H * 0.86 + lA, 12, 6);
    ctx.fillRect(CHAR_W / 2, CHAR_H * 0.86 - lA, 12, 6);
  }

  ctx.restore();

  // Honey shield aura (Tedy)
  if (honeyShield) {
    ctx.save();
    const alpha = 0.3 + 0.2 * Math.sin(tick * 0.15);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(
      x + CHAR_W / 2,
      y + CHAR_H / 2,
      CHAR_W * 0.7,
      CHAR_H * 0.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, tick: number) {
  if (e.dead && e.deadTimer <= 0) return;
  const alpha = e.dead ? Math.max(0, e.deadTimer / 20) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  if ((e.hitFlash ?? 0) > 0 && Math.floor((e.hitFlash ?? 0) / 3) % 2 === 0) {
    ctx.globalAlpha *= 0.4;
  }

  if (e.type === "boss") {
    drawBoss(ctx, e, tick);
    ctx.restore();
    return;
  }

  const legWalk = Math.floor(tick / 8) % 2;
  const sx = e.x;
  const sy = e.y;
  const w = e.w;
  const h = e.h;

  if (e.type === "scriptkiddie") {
    // Small green hoodie enemy
    ctx.fillStyle = "#2d8a2d";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.38, w * 0.4, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(sx + w * 0.1, sy + h * 0.3, w * 0.8, h * 0.45);
    // Head
    ctx.fillStyle = "#f5d5b8";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.2, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // Hood
    ctx.fillStyle = "#2d8a2d";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.16, w * 0.32, Math.PI, 0);
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#ff0";
    ctx.fillRect(sx + w * 0.28, sy + h * 0.17, 4, 3);
    ctx.fillRect(sx + w * 0.56, sy + h * 0.17, 4, 3);
    // Laptop icon on body
    ctx.fillStyle = "#111";
    ctx.fillRect(sx + w * 0.25, sy + h * 0.44, w * 0.5, h * 0.22);
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(sx + w * 0.28, sy + h * 0.46, w * 0.44, h * 0.16);
  } else if (e.type === "blackhat") {
    // Black hoodie with skull
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.38, w * 0.44, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(sx + w * 0.08, sy + h * 0.3, w * 0.84, h * 0.5);
    // Head
    ctx.fillStyle = "#f5d5b8";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.2, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Black hat
    ctx.fillStyle = "#111";
    ctx.fillRect(sx + w * 0.15, sy + h * 0.05, w * 0.7, 6);
    ctx.fillRect(sx + w * 0.25, sy - h * 0.05, w * 0.5, h * 0.16);
    // Skull on body
    ctx.fillStyle = "#fff";
    ctx.font = `${h * 0.3}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("💀", sx + w / 2, sy + h * 0.7);
  } else if (e.type === "elitehacker") {
    // Dark hoodie with glasses
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.38, w * 0.46, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(sx + w * 0.06, sy + h * 0.3, w * 0.88, h * 0.52);
    // Head
    ctx.fillStyle = "#d4a574";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.18, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Dark hood
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.14, w * 0.34, Math.PI, 0);
    ctx.fill();
    // Glasses
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + w * 0.2, sy + h * 0.13, w * 0.24, h * 0.1);
    ctx.strokeRect(sx + w * 0.56, sy + h * 0.13, w * 0.24, h * 0.1);
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.44, sy + h * 0.18);
    ctx.lineTo(sx + w * 0.56, sy + h * 0.18);
    ctx.stroke();
    // Eyes through glasses
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(sx + w * 0.25, sy + h * 0.15, 6, 5);
    ctx.fillRect(sx + w * 0.6, sy + h * 0.15, 6, 5);
  }

  // HP bar above enemy
  if (!e.dead) {
    const barW = w;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(sx, sy - 10, barW, 6);
    const hpRatio = e.hp / e.maxHp;
    ctx.fillStyle =
      hpRatio > 0.5 ? "#44ff44" : hpRatio > 0.25 ? "#ffaa00" : "#ff2222";
    ctx.fillRect(sx, sy - 10, barW * hpRatio, 6);
  }

  // Legs
  ctx.fillStyle = e.type === "scriptkiddie" ? "#2d8a2d" : "#1a1a1a";
  if (legWalk === 0) {
    ctx.fillRect(sx + w * 0.15, sy + h * 0.76, w * 0.28, h * 0.26);
    ctx.fillRect(sx + w * 0.57, sy + h * 0.76, w * 0.28, h * 0.26);
  } else {
    ctx.fillRect(sx + w * 0.1, sy + h * 0.76, w * 0.28, h * 0.26);
    ctx.fillRect(sx + w * 0.62, sy + h * 0.76, w * 0.28, h * 0.26);
  }
  ctx.fillStyle = "#222";
  ctx.fillRect(sx + w * 0.14, sy + h * 0.98, w * 0.3, h * 0.06);
  ctx.fillRect(sx + w * 0.56, sy + h * 0.98, w * 0.3, h * 0.06);

  ctx.restore();
}

function drawBoss(ctx: CanvasRenderingContext2D, e: Enemy, tick: number) {
  const sx = e.x;
  const sy = e.y;
  const w = e.w;
  const h = e.h;
  const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);

  // Dark cloak
  ctx.fillStyle = e.charging ? "#660000" : "#0d0020";
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy + 28);
  ctx.lineTo(sx + w + 12, sy + 28);
  ctx.lineTo(sx + w + 18, sy + h + 20);
  ctx.lineTo(sx - 18, sy + h + 20);
  ctx.fill();
  // Body
  ctx.fillStyle = "#1a0030";
  ctx.fillRect(sx + 12, sy + 32, w - 24, h - 42);
  // Chest detail
  ctx.fillStyle = "#440000";
  ctx.fillRect(sx + 16, sy + 36, w - 32, 28);
  ctx.fillStyle = `rgba(255,0,50,${0.5 + pulse * 0.5})`;
  ctx.fillRect(sx + w / 2 - 3, sy + 38, 6, 24);
  ctx.fillRect(sx + 18, sy + 48, w - 36, 5);
  // Head
  ctx.fillStyle = "#D4A574";
  ctx.fillRect(sx + 14, sy + 4, w - 28, 30);
  // Dark hood
  ctx.fillStyle = "#0d0020";
  ctx.fillRect(sx + 8, sy - 5, w - 16, 16);
  ctx.fillRect(sx + 4, sy - 3, w - 8, 10);
  // Glowing red eyes
  const eyeGlow = `rgba(255,0,0,${0.7 + pulse * 0.3})`;
  ctx.fillStyle = eyeGlow;
  ctx.shadowColor = "#FF0000";
  ctx.shadowBlur = 12;
  ctx.fillRect(sx + 18, sy + 9, 10, 7);
  ctx.fillRect(sx + w - 28, sy + 9, 10, 7);
  ctx.shadowBlur = 0;
  // Bitcoin bag
  const bagX = sx + w - 8;
  const bagY = sy + h * 0.35;
  ctx.fillStyle = "#8B6914";
  ctx.beginPath();
  ctx.arc(bagX, bagY + 16, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText("₿", bagX, bagY + 22);
  ctx.textAlign = "left";
  // Legs
  ctx.fillStyle = "#0d0020";
  const legWalk = Math.floor(tick / 6) % 2;
  if (legWalk === 0) {
    ctx.fillRect(sx + 14, sy + h - 20, 22, 20);
    ctx.fillRect(sx + w - 36, sy + h - 20, 22, 20);
  } else {
    ctx.fillRect(sx + 10, sy + h - 20, 22, 20);
    ctx.fillRect(sx + w - 32, sy + h - 20, 22, 20);
  }
  ctx.fillStyle = "#1a0020";
  ctx.fillRect(sx + 12, sy + h - 2, 26, 8);
  ctx.fillRect(sx + w - 38, sy + h - 2, 26, 8);

  // Boss HP bar
  const barW = 300;
  const barX = (CANVAS_W - barW) / 2;
  const barY2 = 14;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.beginPath();
  ctx.roundRect(barX - 50, barY2 - 4, barW + 100, 38, 10);
  ctx.fill();
  ctx.fillStyle = "#FF4400";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⚠️ THE 41 BTC THIEF ⚠️", CANVAS_W / 2, barY2 + 10);
  ctx.fillStyle = "#330000";
  ctx.beginPath();
  ctx.roundRect(barX, barY2 + 14, barW, 14, 4);
  ctx.fill();
  const hpRatio = e.hp / BOSS_HP;
  ctx.fillStyle = `rgba(220,${Math.floor(30 * hpRatio)},0,0.9)`;
  ctx.beginPath();
  ctx.roundRect(barX, barY2 + 14, barW * hpRatio, 14, 4);
  ctx.fill();
  ctx.textAlign = "left";
}

function drawCoin(ctx: CanvasRenderingContext2D, c: Coin) {
  if (c.collected) return;
  const r = 9;
  const cx = c.x;
  const cy = c.y;
  ctx.save();
  if (c.fake) {
    ctx.globalAlpha = 0.85;
    const rg = ctx.createRadialGradient(cx - 2, cy - 2, 0, cx, cy, r);
    rg.addColorStop(0, "#ff6666");
    rg.addColorStop(1, "#cc0000");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", cx, cy);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  } else {
    const rg = ctx.createRadialGradient(cx - 2, cy - 2, 0, cx, cy, r);
    rg.addColorStop(0, "#FFD700");
    rg.addColorStop(1, "#FF9900");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${r * 1.1}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₿", cx, cy);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVirusProjectiles(
  ctx: CanvasRenderingContext2D,
  projs: VirusProjectile[],
) {
  for (const vp of projs) {
    if (!vp.alive) continue;
    ctx.save();
    ctx.fillStyle = "#00ff66";
    ctx.shadowColor = "#00ff66";
    ctx.shadowBlur = 8;
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠️", vp.x, vp.y);
    ctx.textBaseline = "alphabetic";
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  lives: number,
  wave: number,
  tokenPrice: number,
  charType: CharacterType,
) {
  // Score + lives panel
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 200, 58, 10);
  ctx.fill();
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 14px monospace";
  ctx.fillText(`SCORE: ${score}`, 20, 30);
  ctx.fillStyle = "#ff4466";
  ctx.font = "16px sans-serif";
  for (let i = 0; i < lives; i++) ctx.fillText("♥", 20 + i * 22, 56);

  // Wave indicator
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 80, 10, 160, 30, 8);
  ctx.fill();
  ctx.fillStyle = wave === 4 ? "#ff2222" : "#00d4ff";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    wave === 4 ? "⚔️ BOSS FIGHT!" : `WAVE ${wave}/3`,
    CANVAS_W / 2,
    30,
  );
  ctx.textAlign = "left";

  // Character portrait
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W - 170, 10, 160, 26, 8);
  ctx.fill();
  const charEmoji =
    charType === "babyodin" ? "👶" : charType === "tedy" ? "🐻" : "⚡";
  const charName =
    charType === "babyodin"
      ? "BABY ODIN"
      : charType === "tedy"
        ? "TEDY"
        : "ODIN";
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "right";
  ctx.fillText(`${charEmoji} ${charName}`, CANVAS_W - 14, 28);
  ctx.textAlign = "left";

  // Token price
  if (tokenPrice > 0) {
    const priceSats = (tokenPrice / 1000).toFixed(3);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(10, 76, 200, 24, 8);
    ctx.fill();
    const iconSz = 14;
    const iconX = 22;
    const iconY = 82;
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX + iconSz / 2, iconY + iconSz / 2, iconSz / 2, 0, Math.PI * 2);
    ctx.clip();
    if (priceIconImg.complete && priceIconImg.naturalWidth > 0) {
      ctx.drawImage(priceIconImg, iconX, iconY, iconSz, iconSz);
    } else {
      ctx.fillStyle = "#FF8C00";
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`ODINMARIO ${priceSats} sats`, iconX + iconSz + 4, 93);
  }

  // Built By ODINMARIO
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Built By ODINMARIO", CANVAS_W / 2, CANVAS_H - 6);
  ctx.textAlign = "left";
}

function drawHackBeam(
  ctx: CanvasRenderingContext2D,
  bossX: number,
  bossY: number,
) {
  ctx.save();
  ctx.shadowColor = "#ff0022";
  ctx.shadowBlur = 20;
  ctx.strokeStyle = "#ff0022";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(bossX, bossY + 60);
  ctx.lineTo(0, bossY + 60);
  ctx.stroke();
  ctx.strokeStyle = "#ffaacc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bossX, bossY + 60);
  ctx.lineTo(0, bossY + 60);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // HACK text on beam
  ctx.fillStyle = "#ff0022";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText("H A C K", bossX - 120, bossY + 54);
  ctx.textAlign = "left";
  ctx.restore();
}

// ── Character select helper ───────────────────────────────────────────────────

const CHAR_INFO: Record<
  CharacterType,
  {
    emoji: string;
    name: string;
    speed: number;
    power: number;
    stars: number;
    special: string;
    color: string;
  }
> = {
  babyodin: {
    emoji: "👶",
    name: "BABY ODIN",
    speed: 3,
    power: 2,
    stars: 3,
    special: "Double Jump",
    color: "#a0c8ff",
  },
  tedy: {
    emoji: "🐻",
    name: "TEDY",
    speed: 2,
    power: 3,
    stars: 3,
    special: "Honey Shield",
    color: "#c8944c",
  },
  odinwarrior: {
    emoji: "⚡",
    name: "ODIN WARRIOR",
    speed: 2,
    power: 4,
    stars: 4,
    special: "Lightning Strike",
    color: "#9944ff",
  },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function Odin0401({ onBack }: Odin0401Props) {
  const { actor } = useActor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const tokenPriceRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef({
    left: false,
    right: false,
    jump: false,
    attack: false,
    special: false,
  });

  const [phase, setPhase] = useState<Phase>("username");
  const [usernameInput, setUsernameInput] = useState(
    localStorage.getItem("odinmario_username") || "",
  );
  const [username, setUsername] = useState(
    localStorage.getItem("odinmario_username") || "",
  );
  const [selectedChar, setSelectedChar] =
    useState<CharacterType>("odinwarrior");
  const [gameScore, setGameScore] = useState(0);
  const [_gameLives, setGameLives] = useState(3);
  const [victory, setVictory] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ score: bigint; playerName: string }>
  >([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [bossIntroVisible, setBossIntroVisible] = useState(false);
  const [waveClearMsg, setWaveClearMsg] = useState("");
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  // Fetch token price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const r = await fetch("https://api.odin.fun/v1/token/2ip5", {
          headers: { Accept: "application/json" },
        });
        const j = await r.json();
        const d = j?.data ?? j ?? {};
        const raw = d?.price ?? 0;
        if (raw > 0) tokenPriceRef.current = raw;
      } catch {}
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Main game loop
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gs = initState();
    gsRef.current = gs;
    gs.running = true;

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW")
        e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let lastJump = false;
    let lastAttack = false;
    let lastSpecial = false;

    function loop() {
      const gs = gsRef.current;
      if (!gs || !gs.running) return;

      const keys = keysRef.current;
      const touch = touchRef.current;

      // Input
      gs.moveLeft = keys.ArrowLeft || keys.KeyA || touch.left;
      gs.moveRight = keys.ArrowRight || keys.KeyD || touch.right;
      const jumpPressed = keys.ArrowUp || keys.KeyW || keys.Space || touch.jump;
      const attackPressed = keys.KeyZ || keys.KeyF || touch.attack;
      const specialPressed = keys.KeyX || keys.KeyG || touch.special;

      // Movement
      const speed =
        selectedChar === "babyodin" ? 5 : selectedChar === "tedy" ? 4 : 4;
      if (gs.moveLeft) {
        gs.charX -= speed;
        gs.facingLeft = true;
      }
      if (gs.moveRight) {
        gs.charX += speed;
        gs.facingLeft = false;
      }
      gs.charX = Math.max(0, Math.min(CANVAS_W - CHAR_W, gs.charX));

      // Gravity
      gs.charVY += GRAVITY;
      gs.charY += gs.charVY;
      if (gs.charY >= GROUND_Y - CHAR_H) {
        gs.charY = GROUND_Y - CHAR_H;
        gs.charVY = 0;
        gs.onGround = true;
        gs.jumpsLeft = selectedChar === "babyodin" ? 2 : 1;
      } else {
        gs.onGround = false;
      }

      // Jump
      const jumpDown = jumpPressed && !lastJump;
      lastJump = jumpPressed;
      if (jumpDown && gs.jumpsLeft > 0) {
        gs.charVY = JUMP_FORCE;
        gs.jumpsLeft--;
        playJump();
        if (selectedChar === "babyodin" && gs.jumpsLeft === 0) {
          // sparkle particles on double jump
          for (let i = 0; i < 6; i++) {
            gs.particles.push({
              id: nextId(),
              x: gs.charX + CHAR_W / 2,
              y: gs.charY + CHAR_H,
              vx: (Math.random() - 0.5) * 3,
              vy: -Math.random() * 2 - 1,
              life: 30,
              maxLife: 30,
              color: "#a0c8ff",
              r: 4,
            });
          }
        }
      }

      // Attack
      const attackDown = attackPressed && !lastAttack;
      lastAttack = attackPressed;
      if (attackDown && !gs.attacking) {
        gs.attacking = true;
        gs.attackTimer = ATTACK_DURATION;
        playShoot();
      }
      if (gs.attacking) {
        gs.attackTimer -= 16;
        if (gs.attackTimer <= 0) gs.attacking = false;
      }

      // Special
      const specialDown = specialPressed && !lastSpecial;
      lastSpecial = specialPressed;
      if (specialDown && gs.specialCooldown <= 0) {
        gs.specialCooldown = 300;
        if (selectedChar === "tedy") {
          gs.honeyShieldActive = true;
          gs.honeyShieldTimer = 500;
        } else if (selectedChar === "odinwarrior") {
          gs.lightningActive = true;
          gs.lightningTimer = 600;
          // damage all enemies
          for (const e of gs.enemies) {
            if (!e.dead) {
              const dmg = e.type === "boss" ? 3 : e.hp;
              e.hp -= dmg;
              if (e.hp <= 0 && !e.dead) {
                e.dead = true;
                e.deadTimer = 30;
                gs.score += e.type === "boss" ? 50 : 10;
                playEnemyDie();
                for (let i = 0; i < 4; i++) {
                  gs.coins.push({
                    id: nextId(),
                    x: e.x + e.w / 2,
                    y: e.y,
                    vy: -3 - Math.random() * 2,
                    collected: false,
                  });
                }
              } else if (e.type === "boss") {
                e.hitFlash = 18;
                playBossHit();
              }
            }
          }
        }
      }
      if (gs.specialCooldown > 0) gs.specialCooldown -= 16;
      if (gs.honeyShieldActive) {
        gs.honeyShieldTimer -= 16;
        if (gs.honeyShieldTimer <= 0) gs.honeyShieldActive = false;
      }
      if (gs.lightningActive) {
        gs.lightningTimer -= 16;
        if (gs.lightningTimer <= 0) gs.lightningActive = false;
      }

      // Invincibility
      if (gs.invincible > 0) gs.invincible -= 16;

      // Tick
      gs.tick++;
      gs.legAnim++;

      // ── Enemies ──
      for (const e of gs.enemies) {
        if (e.dead) {
          e.deadTimer -= 16;
          continue;
        }
        if (e.type === "boss") {
          // Boss logic
          e.legAnim++;
          e.chargeTimer = (e.chargeTimer ?? 240) - 16;
          e.hackBeamTimer = (e.hackBeamTimer ?? 360) - 16;
          e.coinStealTimer = (e.coinStealTimer ?? 300) - 16;
          if ((e.hitFlash ?? 0) > 0) e.hitFlash = (e.hitFlash ?? 0) - 1;

          // Charge
          if (e.chargeTimer! <= 0) {
            e.charging = true;
            e.chargeTimer = 240;
          }
          if (e.charging) {
            const dx = gs.charX - e.x;
            e.x += (dx > 0 ? 1 : -1) * 5;
            e.dir = (dx > 0 ? 1 : -1) as 1 | -1;
            setTimeout(() => {
              if (e.charging) e.charging = false;
            }, 600);
          } else {
            const dx = gs.charX - e.x;
            if (Math.abs(dx) > 200) e.x += (dx > 0 ? 1 : -1) * e.speed;
            e.dir = (dx > 0 ? 1 : -1) as 1 | -1;
          }

          // Hack beam
          if (e.hackBeamTimer! <= 0 && !e.hackBeamActive) {
            e.hackBeamActive = true;
            e.hackBeamDuration = HACK_BEAM_DURATION;
            e.hackBeamTimer = 360;
            playShoot();
          }
          if (e.hackBeamActive) {
            e.hackBeamDuration = (e.hackBeamDuration ?? 0) - 16;
            if (e.hackBeamDuration! <= 0) e.hackBeamActive = false;
            // Player hit by beam
            const beamY = e.y + 60;
            if (
              gs.invincible <= 0 &&
              !gs.honeyShieldActive &&
              gs.charY + CHAR_H > beamY - 8 &&
              gs.charY < beamY + 8 &&
              gs.charX < e.x
            ) {
              gs.lives--;
              gs.invincible = INVINCIBLE_MS;
              playHit();
              if (gs.lives <= 0) {
                gs.running = false;
                gs.over = true;
              }
            }
          }

          // Coin steal (drop fake coins)
          if (e.coinStealTimer! <= 0) {
            e.coinStealTimer = 300;
            for (let i = 0; i < 2; i++) {
              gs.coins.push({
                id: nextId(),
                x: e.x + e.w / 2,
                y: e.y,
                vy: -3,
                collected: false,
                fake: true,
              });
            }
          }

          // Boss melee hit
          if (gs.invincible <= 0 && !gs.honeyShieldActive) {
            const rect1 = { x: gs.charX, y: gs.charY, w: CHAR_W, h: CHAR_H };
            const rect2 = { x: e.x, y: e.y, w: e.w, h: e.h };
            if (rectsOverlap(rect1, rect2)) {
              gs.lives--;
              gs.invincible = INVINCIBLE_MS;
              playHit();
              if (gs.lives <= 0) {
                gs.running = false;
                gs.over = true;
              }
            }
          }
        } else {
          // Regular enemy movement
          e.legAnim++;
          e.x += e.dir * e.speed;
          if (e.x <= 20 || e.x + e.w >= CANVAS_W - 20) e.dir *= -1 as 1 | -1;
          // Face player
          e.dir = (gs.charX < e.x ? -1 : 1) as 1 | -1;

          // Elite hacker shoot virus
          if (e.type === "elitehacker" && e.shootTimer !== undefined) {
            e.shootTimer -= 16;
            if (e.shootTimer <= 0) {
              e.shootTimer = 160 + Math.random() * 80;
              const dx = gs.charX - e.x;
              const dy = gs.charY - e.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              gs.virusProjectiles.push({
                id: nextId(),
                x: e.x + e.w / 2,
                y: e.y + e.h / 2,
                vx: (dx / dist) * 3.5,
                vy: (dy / dist) * 3.5,
                alive: true,
              });
            }
          }

          // Enemy hits player
          if (gs.invincible <= 0 && !gs.honeyShieldActive) {
            const r1 = { x: gs.charX, y: gs.charY, w: CHAR_W, h: CHAR_H };
            const r2 = { x: e.x, y: e.y, w: e.w, h: e.h };
            if (rectsOverlap(r1, r2)) {
              gs.lives--;
              gs.invincible = INVINCIBLE_MS;
              playHit();
              if (gs.lives <= 0) {
                gs.running = false;
                gs.over = true;
              }
            }
          }
        }

        // Player attack hits enemy
        if (gs.attacking) {
          const atkX = gs.facingLeft
            ? gs.charX - ATTACK_RANGE
            : gs.charX + CHAR_W;
          const atkW = ATTACK_RANGE;
          const r1 = { x: atkX, y: gs.charY, w: atkW, h: CHAR_H };
          const r2 = { x: e.x, y: e.y, w: e.w, h: e.h };
          if (rectsOverlap(r1, r2) && gs.tick % 10 === 0) {
            const dmg = selectedChar === "odinwarrior" ? 2 : 1;
            e.hp -= dmg;
            if (e.type === "boss") {
              e.hitFlash = 12;
              playBossHit();
              gs.score += 50;
            }
            if (e.hp <= 0 && !e.dead) {
              e.dead = true;
              e.deadTimer = 30;
              playEnemyDie();
              if (e.type === "boss") {
                gs.victory = true;
                gs.running = false;
                gs.score += 500;
                for (let i = 0; i < 3; i++)
                  setTimeout(() => playCoin(), i * 200);
              } else {
                gs.score += 10;
                for (let k = 0; k < 3; k++) {
                  gs.coins.push({
                    id: nextId(),
                    x: e.x + e.w / 2,
                    y: e.y,
                    vy: -3 - Math.random() * 2,
                    collected: false,
                  });
                }
              }
            }
          }
        }
      }

      // ── Virus projectiles ──
      for (const vp of gs.virusProjectiles) {
        if (!vp.alive) continue;
        vp.x += vp.vx;
        vp.y += vp.vy;
        if (vp.x < 0 || vp.x > CANVAS_W || vp.y < 0 || vp.y > CANVAS_H) {
          vp.alive = false;
          continue;
        }
        if (gs.invincible <= 0 && !gs.honeyShieldActive) {
          if (
            vp.x > gs.charX &&
            vp.x < gs.charX + CHAR_W &&
            vp.y > gs.charY &&
            vp.y < gs.charY + CHAR_H
          ) {
            vp.alive = false;
            gs.lives--;
            gs.invincible = INVINCIBLE_MS;
            playHit();
            if (gs.lives <= 0) {
              gs.running = false;
              gs.over = true;
            }
          }
        }
      }

      // ── Coins ──
      for (const c of gs.coins) {
        if (c.collected) continue;
        c.vy += 0.4;
        c.y += c.vy;
        if (c.y >= GROUND_Y - 10) {
          c.y = GROUND_Y - 10;
          c.vy = 0;
        }
        // Collect
        if (
          Math.abs(c.x - (gs.charX + CHAR_W / 2)) < 22 &&
          Math.abs(c.y - (gs.charY + CHAR_H / 2)) < 22
        ) {
          c.collected = true;
          if (c.fake) {
            gs.lives = Math.max(0, gs.lives - 1);
            playHit();
            if (gs.lives <= 0) {
              gs.running = false;
              gs.over = true;
            }
          } else {
            gs.score += 5;
            playCoin();
          }
        }
      }

      // ── Particles ──
      for (const p of gs.particles) {
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 1;
      }

      // ── Wave clear check ──
      const aliveEnemies = gs.enemies.filter((e) => !e.dead);
      if (
        aliveEnemies.length === 0 &&
        !gs.waveCleared &&
        gs.wave <= 4 &&
        gs.running
      ) {
        gs.waveCleared = true;
        if (gs.wave < 3) {
          setWaveClearMsg(`WAVE ${gs.wave} CLEARED!`);
          setTimeout(() => {
            setWaveClearMsg("");
            gs.wave++;
            gs.enemies = waveEnemies(gs.wave);
            gs.waveCleared = false;
            setGameScore(gs.score);
          }, 2000);
        } else if (gs.wave === 3) {
          setWaveClearMsg("🔥 BOSS INCOMING!");
          setBossIntroVisible(true);
          playBossHit();
          setTimeout(() => {
            setBossIntroVisible(false);
            setWaveClearMsg("");
            gs.wave = 4;
            gs.enemies = waveEnemies(4);
            gs.waveCleared = false;
            setGameScore(gs.score);
          }, 3000);
        }
      }

      // ── Sync React state occasionally ──
      if (gs.tick % 60 === 0) {
        setGameScore(gs.score);
        setGameLives(gs.lives);
      }

      // ── End of loop check ──
      if (!gs.running) {
        cancelAnimationFrame(rafRef.current);
        setGameScore(gs.score);
        setGameLives(gs.lives);
        setVictory(gs.victory);
        if (gs.over || gs.victory) {
          playGameOver();
          setPhase("gameover");
        }
        return;
      }

      // ── Draw ──
      const boss = gs.enemies.find((e) => e.type === "boss" && !e.dead);
      const hackBeamActive = !!boss?.hackBeamActive;
      drawBackground(ctx!, gs.tick, hackBeamActive);
      drawParticles(ctx!, gs.particles);
      for (const c of gs.coins) drawCoin(ctx!, c);
      drawVirusProjectiles(ctx!, gs.virusProjectiles);
      for (const e of gs.enemies) drawEnemy(ctx!, e, gs.tick);
      drawCharacter(
        ctx!,
        selectedChar,
        gs.charX,
        gs.charY,
        gs.facingLeft,
        gs.attacking,
        gs.legAnim,
        gs.invincible,
        gs.honeyShieldActive,
        gs.lightningActive,
        gs.tick,
      );
      // Lightning bolt visual
      if (gs.lightningActive && gs.tick % 6 < 3) {
        ctx!.save();
        ctx!.strokeStyle = "#00CFFF";
        ctx!.lineWidth = 3;
        ctx!.shadowColor = "#00CFFF";
        ctx!.shadowBlur = 16;
        ctx!.beginPath();
        ctx!.moveTo(gs.charX + CHAR_W / 2, 0);
        ctx!.lineTo(gs.charX + CHAR_W / 2 + 10, 100);
        ctx!.lineTo(gs.charX + CHAR_W / 2 - 8, 200);
        ctx!.lineTo(gs.charX + CHAR_W / 2, gs.charY);
        ctx!.stroke();
        ctx!.shadowBlur = 0;
        ctx!.restore();
      }
      // Boss hack beam
      if (hackBeamActive && boss) drawHackBeam(ctx!, boss.x, boss.y);
      drawHUD(
        ctx!,
        gs.score,
        gs.lives,
        gs.wave,
        tokenPriceRef.current,
        selectedChar,
      );

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (gsRef.current) gsRef.current.running = false;
    };
  }, [phase, selectedChar]);

  // Leaderboard fetch
  async function fetchLeaderboard() {
    setLeaderboardLoading(true);
    try {
      if (!actor) return;
      const data = await actor.getLeaderboard();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch {}
    setLeaderboardLoading(false);
  }

  async function handleSubmitScore() {
    if (scoreSubmitted || !actor) return;
    try {
      await actor.submitScore(username, BigInt(gameScore));
      setScoreSubmitted(true);
    } catch {}
    fetchLeaderboard();
    setPhase("leaderboard");
  }

  const commonBoxStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #05091e 0%, #0a1535 100%)",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Press Start 2P', 'Courier New', monospace",
    color: "#fff",
    padding: 20,
  };

  // ── Phase: Username ──
  if (phase === "username") {
    return (
      <div style={commonBoxStyle}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 28, marginBottom: 16 }}>⚔️</div>
          <h1
            style={{
              fontSize: 18,
              color: "#FFD700",
              textShadow: "0 0 10px #FFD700",
              marginBottom: 8,
            }}
          >
            ODIN 0401
          </h1>
          <p style={{ fontSize: 10, color: "#00d4ff", marginBottom: 24 }}>
            Enter your warrior name
          </p>
          <input
            data-ocid="odin0401.username_input"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && usernameInput.trim()) {
                const n = usernameInput.trim();
                setUsername(n);
                localStorage.setItem("odinmario_username", n);
                setPhase("characterSelect");
              }
            }}
            placeholder="WARRIOR NAME"
            style={{
              background: "#0a1535",
              border: "2px solid #00d4ff",
              borderRadius: 8,
              color: "#fff",
              padding: "10px 16px",
              fontSize: 12,
              width: "100%",
              marginBottom: 16,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            type="button"
            data-ocid="odin0401.username_submit"
            onClick={() => {
              if (!usernameInput.trim()) return;
              const n = usernameInput.trim();
              setUsername(n);
              localStorage.setItem("odinmario_username", n);
              setPhase("characterSelect");
            }}
            style={{
              background: "linear-gradient(180deg,#0080ff,#0050cc)",
              border: "2px solid #00d4ff",
              borderRadius: 8,
              color: "#fff",
              padding: "12px 32px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            CONTINUE ▶
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.back_btn"
            onClick={onBack}
            style={{
              marginTop: 20,
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← BACK
          </button>
          <div style={{ marginTop: 24, fontSize: 8, color: "#444" }}>
            Built By ODINMARIO
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Character Select ──
  if (phase === "characterSelect") {
    return (
      <div style={commonBoxStyle}>
        <div style={{ textAlign: "center", maxWidth: 700, width: "100%" }}>
          <div style={{ fontSize: 13, color: "#00d4ff", marginBottom: 6 }}>
            ⭐ ODIN 0401 ⭐
          </div>
          <h2
            style={{
              fontSize: 16,
              color: "#FFD700",
              textShadow: "0 0 10px #FFD700",
              marginBottom: 24,
            }}
          >
            SELECT YOUR FIGHTER
          </h2>
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: 24,
            }}
          >
            {(
              Object.entries(CHAR_INFO) as [
                CharacterType,
                (typeof CHAR_INFO)["tedy"],
              ][]
            ).map(([key, info]) => (
              <button
                type="button"
                data-ocid={`odin0401.char_${key}`}
                key={key}
                onClick={() => setSelectedChar(key)}
                style={{
                  background:
                    selectedChar === key
                      ? `linear-gradient(180deg, ${info.color}33, ${info.color}11)`
                      : "rgba(0,0,0,0.4)",
                  border: `2px solid ${selectedChar === key ? info.color : "#333"}`,
                  boxShadow:
                    selectedChar === key ? `0 0 18px ${info.color}88` : "none",
                  borderRadius: 16,
                  padding: "20px 16px",
                  cursor: "pointer",
                  width: 180,
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>
                  {info.emoji}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: info.color,
                    marginBottom: 12,
                    fontWeight: "bold",
                  }}
                >
                  {info.name}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#aaa",
                    textAlign: "left",
                    lineHeight: 1.8,
                  }}
                >
                  <div>Speed: {"⭐".repeat(info.speed)}</div>
                  <div>Power: {"⭐".repeat(info.power)}</div>
                  <div style={{ color: "#FFD700", marginTop: 4 }}>
                    ✨ {info.special}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            data-ocid="odin0401.fight_btn"
            onClick={() => setPhase("start")}
            style={{
              background: "linear-gradient(180deg,#FFD700,#FF8800)",
              border: "none",
              borderRadius: 10,
              color: "#000",
              padding: "14px 40px",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: "bold",
              boxShadow: "0 0 20px #FFD70066",
            }}
          >
            ⚔️ FIGHT!
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.char_back_btn"
            onClick={() => setPhase("username")}
            style={{
              marginTop: 16,
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← BACK
          </button>
          <div style={{ marginTop: 24, fontSize: 8, color: "#444" }}>
            Built By ODINMARIO
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Start ──
  if (phase === "start") {
    return (
      <div style={commonBoxStyle}>
        <div
          style={{
            textAlign: "center",
            maxWidth: 520,
            background: "rgba(0,0,0,0.7)",
            border: "2px solid #FFD700",
            borderRadius: 16,
            padding: 32,
            boxShadow: "0 0 30px #FFD70044",
          }}
        >
          <div style={{ fontSize: 13, color: "#00d4ff", marginBottom: 4 }}>
            ⭐ SPECIAL GAME ⭐
          </div>
          <h1
            style={{
              fontSize: 22,
              color: "#FFD700",
              textShadow: "0 0 16px #FFD700",
              marginBottom: 4,
            }}
          >
            ODIN 0401
          </h1>
          <div style={{ fontSize: 11, color: "#ff4466", marginBottom: 16 }}>
            ⚔️ FIGHT FOR ODIN.FUN ⚔️
          </div>
          <p
            style={{
              fontSize: 9,
              color: "#ccc",
              lineHeight: 1.8,
              marginBottom: 20,
            }}
          >
            Hackers stole 41 BTC from odin.fun.
            <br />
            As a warrior of the Odin community,
            <br />
            you must fight back and recover what was stolen.
            <br />
            <span style={{ color: "#FFD700" }}>
              Show them we stand together!
            </span>
          </p>
          <div
            style={{
              fontSize: 9,
              color: "#888",
              marginBottom: 8,
              textAlign: "left",
            }}
          >
            {isDesktop ? (
              <>
                <div>← → / A D: Move</div>
                <div>W / Space / ↑: Jump</div>
                <div>Z / F: Attack</div>
                <div>X / G: Special Ability</div>
              </>
            ) : (
              <div style={{ color: "#00d4ff" }}>
                Use on-screen buttons below
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, color: "#555", marginBottom: 20 }}>
            Playing as:{" "}
            <span style={{ color: CHAR_INFO[selectedChar].color }}>
              {CHAR_INFO[selectedChar].emoji} {CHAR_INFO[selectedChar].name}
            </span>
          </div>
          <button
            type="button"
            data-ocid="odin0401.start_btn"
            onClick={() => setPhase("playing")}
            style={{
              background: "linear-gradient(180deg,#FFD700,#FF8800)",
              border: "none",
              borderRadius: 10,
              color: "#000",
              padding: "14px 40px",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: "bold",
              boxShadow: "0 0 20px #FFD70066",
              marginBottom: 12,
            }}
          >
            ⚔️ FIGHT!
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.start_back_btn"
            onClick={() => setPhase("characterSelect")}
            style={{
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← CHANGE CHARACTER
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.home_btn"
            onClick={onBack}
            style={{
              marginTop: 8,
              background: "transparent",
              border: "none",
              color: "#444",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🏠 HOME
          </button>
          <div style={{ marginTop: 20, fontSize: 8, color: "#444" }}>
            Built By ODINMARIO
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Playing ──
  if (phase === "playing") {
    const charInfo = CHAR_INFO[selectedChar];
    return (
      <div
        style={{
          background: "#050a1e",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {bossIntroVisible && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 200,
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 20,
                color: "#FF0000",
                fontFamily: "monospace",
                textShadow: "0 0 20px #FF0000",
                marginBottom: 12,
              }}
            >
              ⚠️ THE 41 BTC THIEF ⚠️
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#FF8888",
                fontFamily: "monospace",
              }}
            >
              BOSS FIGHT BEGINS!
            </div>
          </div>
        )}
        {waveClearMsg && (
          <div
            style={{
              position: "fixed",
              top: "40%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 18,
              color: "#FFD700",
              fontFamily: "monospace",
              textShadow: "0 0 20px #FFD700",
              zIndex: 200,
              pointerEvents: "none",
            }}
          >
            {waveClearMsg}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            display: "block",
            width: "100%",
            maxWidth: CANVAS_W,
            imageRendering: "pixelated",
          }}
        />
        {/* Mobile controls */}
        {!isDesktop && (
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: 16,
              justifyContent: "space-between",
              width: "100%",
              maxWidth: CANVAS_W,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                data-ocid="odin0401.btn_left"
                onPointerDown={() => {
                  touchRef.current.left = true;
                }}
                onPointerUp={() => {
                  touchRef.current.left = false;
                }}
                style={dpadBtnStyle}
              >
                ◀
              </button>
              <button
                type="button"
                data-ocid="odin0401.btn_right"
                onPointerDown={() => {
                  touchRef.current.right = true;
                }}
                onPointerUp={() => {
                  touchRef.current.right = false;
                }}
                style={dpadBtnStyle}
              >
                ▶
              </button>
              <button
                type="button"
                data-ocid="odin0401.btn_jump"
                onPointerDown={() => {
                  touchRef.current.jump = true;
                }}
                onPointerUp={() => {
                  touchRef.current.jump = false;
                }}
                style={{
                  ...dpadBtnStyle,
                  background: "rgba(0,200,255,0.2)",
                  borderColor: "#00d4ff",
                }}
              >
                ▲ JUMP
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                data-ocid="odin0401.btn_attack"
                onPointerDown={() => {
                  touchRef.current.attack = true;
                }}
                onPointerUp={() => {
                  touchRef.current.attack = false;
                }}
                style={{
                  ...dpadBtnStyle,
                  background: "rgba(255,150,0,0.2)",
                  borderColor: "#FF8800",
                }}
              >
                ⚔️ ATK
              </button>
              <button
                type="button"
                data-ocid="odin0401.btn_special"
                onPointerDown={() => {
                  touchRef.current.special = true;
                  setTimeout(() => {
                    touchRef.current.special = false;
                  }, 100);
                }}
                style={{
                  ...dpadBtnStyle,
                  background: `rgba(${selectedChar === "tedy" ? "255,215,0" : selectedChar === "odinwarrior" ? "130,0,255" : "120,180,255"},0.2)`,
                  borderColor: charInfo.color,
                }}
              >
                ✨ {charInfo.special.substring(0, 6)}
              </button>
              <button
                type="button"
                data-ocid="odin0401.btn_home"
                onClick={onBack}
                style={{
                  ...dpadBtnStyle,
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "#555",
                  fontSize: 9,
                }}
              >
                🏠
              </button>
            </div>
          </div>
        )}
        {isDesktop && (
          <button
            type="button"
            data-ocid="odin0401.desktop_home_btn"
            onClick={onBack}
            style={{
              marginTop: 10,
              background: "rgba(0,0,0,0.5)",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#888",
              fontSize: 10,
              padding: "6px 16px",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            🏠 HOME
          </button>
        )}
      </div>
    );
  }

  // ── Phase: Game Over ──
  if (phase === "gameover") {
    return (
      <div style={commonBoxStyle}>
        <div
          style={{
            textAlign: "center",
            maxWidth: 480,
            background: "rgba(0,0,0,0.8)",
            border: `2px solid ${victory ? "#FFD700" : "#FF2222"}`,
            borderRadius: 16,
            padding: 32,
            boxShadow: `0 0 30px ${victory ? "#FFD70044" : "#FF222244"}`,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>
            {victory ? "🏆" : "💀"}
          </div>
          <h1
            style={{
              fontSize: 16,
              color: victory ? "#FFD700" : "#FF4444",
              textShadow: `0 0 16px ${victory ? "#FFD700" : "#FF4444"}`,
              marginBottom: 8,
            }}
          >
            {victory ? "41 BTC RECOVERED!" : "YOU WERE HACKED!"}
          </h1>
          <div style={{ fontSize: 11, color: "#ccc", marginBottom: 20 }}>
            {victory
              ? "You defeated the 41 BTC Thief! Justice for odin.fun! 🎉"
              : "The hackers got away... Stand together and try again!"}
          </div>
          <div style={{ fontSize: 14, color: "#FFD700", marginBottom: 8 }}>
            SCORE: {gameScore}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 24 }}>
            Warrior: {username}
          </div>
          {!scoreSubmitted && (
            <button
              type="button"
              data-ocid="odin0401.submit_score_btn"
              onClick={handleSubmitScore}
              style={{
                background: "linear-gradient(180deg,#FFD700,#FF8800)",
                border: "none",
                borderRadius: 8,
                color: "#000",
                padding: "12px 28px",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: "bold",
                marginBottom: 8,
              }}
            >
              📊 SUBMIT SCORE
            </button>
          )}
          <br />
          <button
            type="button"
            data-ocid="odin0401.play_again_btn"
            onClick={() => {
              setGameScore(0);
              setGameLives(3);
              setVictory(false);
              setScoreSubmitted(false);
              setWaveClearMsg("");
              setBossIntroVisible(false);
              setPhase("characterSelect");
            }}
            style={{
              background: "linear-gradient(180deg,#0080ff,#0050cc)",
              border: "2px solid #00d4ff",
              borderRadius: 8,
              color: "#fff",
              padding: "12px 28px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: 8,
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.gameover_home_btn"
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🏠 HOME
          </button>
          <div style={{ marginTop: 20, fontSize: 8, color: "#444" }}>
            Built By ODINMARIO
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Leaderboard ──
  if (phase === "leaderboard") {
    return (
      <div style={commonBoxStyle}>
        <div
          style={{
            textAlign: "center",
            maxWidth: 480,
            background: "rgba(0,0,0,0.8)",
            border: "2px solid #FFD700",
            borderRadius: 16,
            padding: 32,
            width: "100%",
          }}
        >
          <h2 style={{ fontSize: 14, color: "#FFD700", marginBottom: 20 }}>
            🏆 LEADERBOARD
          </h2>
          {leaderboardLoading ? (
            <div style={{ color: "#888", fontSize: 10 }}>Loading...</div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {leaderboard.length === 0 ? (
                <div style={{ color: "#555", fontSize: 10 }}>
                  No scores yet. Be the first!
                </div>
              ) : (
                leaderboard.slice(0, 10).map((entry) => (
                  <div
                    key={entry.playerName}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                      color: "#ccc",
                      marginBottom: 6,
                      padding: "4px 8px",
                      borderRadius: 4,
                    }}
                  >
                    <span>{entry.playerName}</span>
                    <span>{Number(entry.score)}</span>
                  </div>
                ))
              )}
            </div>
          )}
          <button
            type="button"
            data-ocid="odin0401.play_again_lb_btn"
            onClick={() => {
              setGameScore(0);
              setGameLives(3);
              setVictory(false);
              setScoreSubmitted(false);
              setPhase("characterSelect");
            }}
            style={{
              background: "linear-gradient(180deg,#FFD700,#FF8800)",
              border: "none",
              borderRadius: 8,
              color: "#000",
              padding: "12px 28px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: "bold",
              marginBottom: 8,
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <br />
          <button
            type="button"
            data-ocid="odin0401.lb_home_btn"
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🏠 HOME
          </button>
          <div style={{ marginTop: 20, fontSize: 8, color: "#444" }}>
            Built By ODINMARIO
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function rectsOverlap(
  r1: { x: number; y: number; w: number; h: number },
  r2: { x: number; y: number; w: number; h: number },
) {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
}

const dpadBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "2px solid rgba(255,255,255,0.2)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 11,
  padding: "12px 14px",
  cursor: "pointer",
  fontFamily: "'Press Start 2P', monospace",
  minWidth: 54,
  touchAction: "none",
};
