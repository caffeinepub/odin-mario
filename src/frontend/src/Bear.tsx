import { useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";
import {
  playBossHit,
  playCoin,
  playGameOver,
  playHit,
  playJump,
} from "./utils/sounds";

interface BearProps {
  onBack: () => void;
}

declare global {
  interface Window {
    __odinUsername?: string;
    actor?: any;
  }
}

const CANVAS_W = 800;
const CANVAS_H = 400;
const GROUND_Y = CANVAS_H - 60;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const BEAR_X = 100;
const BEAR_W = 48;
const BEAR_H = 52;
const DUCK_H = 28;
const BOSS_TRIGGER_SCORE = 3000;

type ObstacleType = "rock" | "stump" | "bee" | "bird";
type Obstacle = {
  x: number;
  w: number;
  h: number;
  type: ObstacleType;
  flyY?: number;
};
type Honey = { x: number; y: number; collected: boolean; isShield: boolean };
type Cloud = { x: number; y: number; w: number };
type PlayerBullet = { x: number; y: number };
type BossBullet = { x: number; y: number; vy: number };
type Boss = {
  active: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invincibleTimer: number;
  shootTimer: number;
  phase: 1 | 2 | 3;
  charging: boolean;
  chargeTimer: number;
  defeated: boolean;
  defeatTimer: number;
  entered: boolean;
  warningTimer: number;
  bobOffset: number;
  defeatAngle: number;
  defeatVY: number;
};

interface GameState {
  running: boolean;
  over: boolean;
  score: number;
  lives: number;
  speed: number;
  bearY: number;
  bearVY: number;
  jumpsLeft: number;
  legAnim: number;
  obstacles: Obstacle[];
  honeys: Honey[];
  clouds: Cloud[];
  spawnTimer: number;
  honeyTimer: number;
  speedTimer: number;
  invincible: number;
  submitted: boolean;
  isDucking: boolean;
  comboCount: number;
  comboMultiplier: number;
  hasShield: boolean;
  shieldTimer: number;
  finishTriggered: boolean;
  finishLineX: number;
  victory: boolean;
  boss: Boss | null;
  playerBullets: PlayerBullet[];
  bossBullets: BossBullet[];
  bossTriggered: boolean;
}

function initState(): GameState {
  return {
    running: false,
    over: false,
    score: 0,
    lives: 3,
    speed: 4,
    bearY: GROUND_Y - BEAR_H,
    bearVY: 0,
    jumpsLeft: 2,
    legAnim: 0,
    obstacles: [],
    honeys: [],
    clouds: [
      { x: 100, y: 50, w: 80 },
      { x: 350, y: 80, w: 60 },
      { x: 600, y: 40, w: 90 },
    ],
    spawnTimer: 80,
    honeyTimer: 120,
    speedTimer: 0,
    invincible: 0,
    submitted: false,
    isDucking: false,
    comboCount: 0,
    comboMultiplier: 1,
    hasShield: false,
    shieldTimer: 0,
    finishTriggered: false,
    finishLineX: -9999,
    victory: false,
    boss: null,
    playerBullets: [],
    bossBullets: [],
    bossTriggered: false,
  };
}

function getComboMultiplier(count: number): number {
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  return 1;
}

function getBossPhase(hp: number): 1 | 2 | 3 {
  if (hp >= 7) return 1;
  if (hp >= 4) return 2;
  return 3;
}

function drawBear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  legAnim: number,
  invincible: number,
  isDucking: boolean,
  hasShield: boolean,
  shieldTimer: number,
) {
  const blink = invincible > 0 && Math.floor(invincible / 6) % 2 === 0;
  if (blink) return;

  ctx.save();

  // Shield glow
  if (hasShield && shieldTimer > 0) {
    const alpha = 0.5 + 0.3 * Math.sin(shieldTimer * 0.1);
    ctx.shadowColor = `rgba(80,160,255,${alpha})`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(
      x + BEAR_W / 2,
      y + (isDucking ? DUCK_H : BEAR_H) / 2,
      BEAR_W / 2 + 8,
      (isDucking ? DUCK_H : BEAR_H) / 2 + 8,
      0,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = `rgba(80,200,255,${alpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (isDucking) {
    const cx = x + BEAR_W / 2;
    const cy = y + DUCK_H / 2;

    ctx.fillStyle = "#8B4513";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#A0522D";
    ctx.beginPath();
    ctx.arc(cx + 14, cy - 2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8B4513";
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 20, cy - 11, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D2691E";
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 20, cy - 11, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1a0a00";
    ctx.beginPath();
    ctx.arc(cx + 18, cy - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx + 19, cy - 4, 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2d1005";
    ctx.beginPath();
    ctx.ellipse(cx + 24, cy, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#DEB887";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8B4513";
    ctx.beginPath();
    ctx.roundRect(cx - 18, cy + 10, 10, 8, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx + 2, cy + 10, 10, 8, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 6, cy + 10, 10, 8, 3);
    ctx.fill();

    ctx.restore();
    return;
  }

  const cx = x + BEAR_W / 2;
  const cy = y + BEAR_H / 2;

  ctx.fillStyle = "#8B4513";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 22, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#A0522D";
  ctx.beginPath();
  ctx.arc(cx, cy - 14, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8B4513";
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 26, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 11, cy - 26, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#D2691E";
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 26, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 11, cy - 26, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#DEB887";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 13, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a0a00";
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, cy - 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 17, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 7, cy - 17, 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2d1005";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 10, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d1005";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  const legSwing = Math.sin(legAnim * 0.3) * 10;
  ctx.fillStyle = "#8B4513";
  ctx.beginPath();
  ctx.roundRect(cx - 16, cy + 18 - legSwing, 10, 14, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx + 6, cy + 18 + legSwing, 10, 14, 4);
  ctx.fill();
  ctx.fillStyle = "#5C3010";
  ctx.beginPath();
  ctx.ellipse(cx - 11, cy + 33 - legSwing, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 11, cy + 33 + legSwing, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBossCharacter(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  t: number,
) {
  const { x, y, invincibleTimer, defeated, defeatTimer, defeatAngle } = boss;
  const flash =
    invincibleTimer > 0 && Math.floor(invincibleTimer / 4) % 2 === 0;
  const cx = x;
  const cy = y + Math.sin(t * 0.05) * 6; // bob up/down

  ctx.save();

  if (defeated) {
    ctx.globalAlpha = Math.max(0, defeatTimer / 90);
    ctx.translate(cx, cy);
    ctx.rotate(defeatAngle);
    ctx.translate(-cx, -cy);
  }

  const fc = flash ? "#ffffff" : "#4a2000";
  const bodyColor = flash ? "#ffffff" : "#5a2800";
  const faceColor = flash ? "#ffffff" : "#6b3410";

  // Shadow under boss
  if (!defeated) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y - 4, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = defeated ? Math.max(0, defeatTimer / 90) : 1;
  }

  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 32, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  if (!flash) {
    ctx.fillStyle = "#c07040";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = faceColor;
  ctx.beginPath();
  ctx.arc(cx, cy - 28, 30, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = fc;
  ctx.beginPath();
  ctx.arc(cx - 24, cy - 52, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 24, cy - 52, 12, 0, Math.PI * 2);
  ctx.fill();
  if (!flash) {
    ctx.fillStyle = "#8b3a10";
    ctx.beginPath();
    ctx.arc(cx - 24, cy - 52, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 24, cy - 52, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Angry brow
  ctx.strokeStyle = flash ? "#fff" : "#1a0800";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy - 42);
  ctx.lineTo(cx - 8, cy - 36);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy - 42);
  ctx.lineTo(cx + 8, cy - 36);
  ctx.stroke();

  // Red angry eyes
  ctx.fillStyle = flash ? "#ff0" : "#cc0000";
  ctx.beginPath();
  ctx.ellipse(cx - 12, cy - 32, 7, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, cy - 32, 7, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 31, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 13, cy - 31, 3, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  if (!flash) {
    ctx.fillStyle = "#c07040";
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nose
  ctx.fillStyle = flash ? "#fff" : "#1a0800";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 22, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Teeth (angry grin)
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.rect(cx - 10, cy - 14, 7, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(cx + 3, cy - 14, 7, 8);
  ctx.fill();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 14);
  ctx.lineTo(cx - 3, cy - 6);
  ctx.stroke();

  // Left fist (raised)
  ctx.fillStyle = fc;
  ctx.beginPath();
  ctx.ellipse(cx - 46, cy - 16, 16, 14, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // arm
  ctx.strokeStyle = fc;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 4);
  ctx.lineTo(cx - 46, cy - 14);
  ctx.stroke();
  // knuckle lines
  ctx.strokeStyle = flash ? "#ccc" : "#3a1800";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx - 50 + i * 4, cy - 16, 4, 0, Math.PI);
    ctx.stroke();
  }

  // Right fist (raised)
  ctx.fillStyle = fc;
  ctx.beginPath();
  ctx.ellipse(cx + 46, cy - 16, 16, 14, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fc;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 30, cy + 4);
  ctx.lineTo(cx + 46, cy - 14);
  ctx.stroke();
  ctx.strokeStyle = flash ? "#ccc" : "#3a1800";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx + 38 + i * 4, cy - 16, 4, 0, Math.PI);
    ctx.stroke();
  }

  // Feet
  ctx.fillStyle = fc;
  ctx.beginPath();
  ctx.ellipse(cx - 18, cy + 46, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 18, cy + 46, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Phase indicator glow
  if (!flash && !defeated) {
    const phaseColor =
      boss.phase === 3 ? "#ff2200" : boss.phase === 2 ? "#ff8800" : "#ffcc00";
    ctx.shadowColor = phaseColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy - 28, 31, 0, Math.PI * 2);
    ctx.strokeStyle = phaseColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, t: number) {
  if (obs.type === "rock" || obs.type === "stump") {
    const y = GROUND_Y - obs.h;
    if (obs.type === "rock") {
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.ellipse(
        obs.x + obs.w / 2,
        y + obs.h / 2 + 4,
        obs.w / 2,
        obs.h / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#aaa";
      ctx.beginPath();
      ctx.ellipse(
        obs.x + obs.w / 2 - 4,
        y + obs.h / 2,
        obs.w / 4,
        obs.h / 4,
        -0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.fillStyle = "#8B6040";
      ctx.fillRect(obs.x + 4, y, obs.w - 8, obs.h);
      ctx.fillStyle = "#A07050";
      ctx.beginPath();
      ctx.ellipse(
        obs.x + obs.w / 2,
        y + 6,
        obs.w / 2 - 2,
        8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = "#7a5030";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.w / 2, y + 6, obs.w / 4, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  const fy = obs.flyY ?? GROUND_Y - 70;
  const bob = Math.sin(t * 0.08 + obs.x * 0.01) * 4;
  const oy = fy + bob;

  if (obs.type === "bee") {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#d0eeff";
    ctx.beginPath();
    ctx.ellipse(obs.x + 20, oy - 10, 14, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(obs.x + 20, oy - 10, 14, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.ellipse(obs.x + 20, oy, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(obs.x + 12 + i * 7, oy, 3, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#c8a000";
    ctx.beginPath();
    ctx.moveTo(obs.x + 36, oy);
    ctx.lineTo(obs.x + 40, oy - 2);
    ctx.lineTo(obs.x + 40, oy + 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(obs.x + 7, oy - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(obs.x + 7, oy - 3, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = "#8B7355";
    ctx.beginPath();
    ctx.ellipse(obs.x + 20, oy, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const wingFlap = Math.sin(t * 0.25) * 0.4;
    ctx.fillStyle = "#6B5335";
    ctx.save();
    ctx.translate(obs.x + 20, oy - 2);
    ctx.rotate(-0.3 + wingFlap);
    ctx.beginPath();
    ctx.ellipse(0, -8, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#A0896A";
    ctx.beginPath();
    ctx.arc(obs.x + 6, oy - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E8A020";
    ctx.beginPath();
    ctx.moveTo(obs.x, oy - 5);
    ctx.lineTo(obs.x - 8, oy - 3);
    ctx.lineTo(obs.x, oy - 1);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(obs.x + 4, oy - 6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(obs.x + 5, oy - 7, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8B7355";
    ctx.beginPath();
    ctx.moveTo(obs.x + 36, oy - 2);
    ctx.lineTo(obs.x + 44, oy - 8);
    ctx.lineTo(obs.x + 44, oy + 2);
    ctx.lineTo(obs.x + 36, oy + 4);
    ctx.fill();
    ctx.restore();
  }
}

function drawHoney(ctx: CanvasRenderingContext2D, h: Honey, t: number) {
  const bob = Math.sin(t * 0.05) * 4;
  const cy = h.y + bob;

  if (h.isShield) {
    const pulse = 0.7 + 0.3 * Math.sin(t * 0.1);
    ctx.save();
    ctx.shadowColor = `rgba(80,160,255,${pulse})`;
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#60a8ff";
    ctx.beginPath();
    ctx.roundRect(h.x - 12, cy - 14, 24, 28, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.roundRect(h.x - 8, cy - 10, 6, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#1a5cc7";
    ctx.fillRect(h.x - 10, cy - 18, 20, 6);
    ctx.fillStyle = "#4090ff";
    ctx.fillRect(h.x - 7, cy - 20, 14, 4);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛡", h.x, cy + 6);
    ctx.textAlign = "left";
    ctx.restore();
  } else {
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.roundRect(h.x - 12, cy - 14, 24, 28, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(h.x - 8, cy - 10, 6, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#B8860B";
    ctx.fillRect(h.x - 10, cy - 18, 20, 6);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(h.x - 7, cy - 20, 14, 4);
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud) {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.w * 0.3, 0, Math.PI * 2);
  ctx.arc(c.x + c.w * 0.25, c.y - c.w * 0.1, c.w * 0.22, 0, Math.PI * 2);
  ctx.arc(c.x + c.w * 0.5, c.y, c.w * 0.28, 0, Math.PI * 2);
  ctx.arc(c.x + c.w * 0.3, c.y + c.w * 0.1, c.w * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

export default function Bear({ onBack }: BearProps) {
  const { actor } = useActor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GameState>(initState());
  const rafRef = useRef<number>(0);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const tokenLogoRef = useRef<HTMLImageElement | null>(null);
  const tickRef = useRef(0);
  const duckingRef = useRef(false);

  const [uiState, setUiState] = useState<
    "start" | "playing" | "over" | "victory"
  >("start");
  const [displayScore, setDisplayScore] = useState(0);
  const tokenPriceRef = useRef<string>("--");
  const [_tokenPrice, setTokenPrice] = useState<string>("--");
  const [submitted, setSubmitted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showShootBtn, setShowShootBtn] = useState(false);

  useEffect(() => {
    setIsMobile(
      window.innerWidth <= 768 ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0,
    );
    const bg = new Image();
    bg.src = "/assets/uploads/19996_11zon-1.jpg";
    bgImgRef.current = bg;
    const logo = new Image();
    logo.src = "/assets/uploads/19952_11zon-1-1.jpg";
    tokenLogoRef.current = logo;

    const fetchPrice = async () => {
      try {
        const res = await fetch("https://api.odin.fun/v1/token/2ip5");
        const data = await res.json();
        const raw = data?.data?.price ?? data?.price ?? 0;
        const sats = (Number(raw) / 1000).toFixed(3);
        tokenPriceRef.current = `${sats} sats`;
        setTokenPrice(`${sats} sats`);
      } catch {
        tokenPriceRef.current = "--";
        setTokenPrice("--");
      }
    };
    fetchPrice();
    const priceInterval = setInterval(fetchPrice, 10000);
    return () => clearInterval(priceInterval);
  }, []);

  function shoot() {
    const gs = stateRef.current;
    if (!gs.running || gs.over || !gs.bossTriggered) return;
    const bearCenterY = gs.bearY + (gs.isDucking ? DUCK_H : BEAR_H) / 2;
    gs.playerBullets.push({ x: BEAR_X + BEAR_W, y: bearCenterY });
  }

  function jump() {
    const gs = stateRef.current;
    if (!gs.running || gs.over) return;
    if (gs.jumpsLeft > 0) {
      gs.bearVY = JUMP_FORCE;
      gs.jumpsLeft -= 1;
      playJump();
      gs.isDucking = false;
      duckingRef.current = false;
    }
  }

  function startDuck() {
    const gs = stateRef.current;
    if (!gs.running || gs.over) return;
    if (gs.bearY >= GROUND_Y - BEAR_H - 5) {
      gs.isDucking = true;
      duckingRef.current = true;
      gs.bearY = GROUND_Y - DUCK_H;
    }
  }

  function stopDuck() {
    const gs = stateRef.current;
    duckingRef.current = false;
    if (gs.isDucking) {
      gs.isDucking = false;
      gs.bearY = GROUND_Y - BEAR_H;
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        jump();
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        startDuck();
      }
      if (e.code === "KeyZ" || e.code === "KeyF") {
        e.preventDefault();
        shoot();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        stopDuck();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function drawHUD(
    ctx: CanvasRenderingContext2D,
    score: number,
    lives: number,
    comboMultiplier: number,
    hasShield: boolean,
    speed: number,
    cw: number,
    boss: Boss | null,
  ) {
    ctx.font = "bold 18px 'Figtree',sans-serif";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(`Score: ${score}`, 60, 34);
    ctx.shadowBlur = 0;
    ctx.font = "16px 'Figtree',sans-serif";
    const livesStr = "❤️".repeat(Math.max(0, lives));
    ctx.fillText(livesStr, 60, 56);

    if (comboMultiplier > 1) {
      ctx.font = "bold 16px 'Figtree',sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.shadowColor = "#c47a00";
      ctx.shadowBlur = 6;
      ctx.fillText(`COMBO x${comboMultiplier}!`, 60, 76);
      ctx.shadowBlur = 0;
    }

    if (hasShield) {
      ctx.font = "bold 15px 'Figtree',sans-serif";
      ctx.fillStyle = "#80d0ff";
      ctx.shadowColor = "#0060ff";
      ctx.shadowBlur = 6;
      ctx.fillText("🛡 SHIELD", 60, comboMultiplier > 1 ? 96 : 76);
      ctx.shadowBlur = 0;
    }

    const speedLevel = Math.max(1, Math.floor((speed - 4) / 0.7) + 1);
    ctx.font = "bold 13px 'Figtree',sans-serif";
    ctx.fillStyle = "#aaffaa";
    ctx.shadowColor = "#004400";
    ctx.shadowBlur = 4;
    const shieldOffset = hasShield
      ? comboMultiplier > 1
        ? 116
        : 96
      : comboMultiplier > 1
        ? 96
        : 76;
    ctx.fillText(`⚡ Lv.${speedLevel}`, 60, shieldOffset);
    ctx.shadowBlur = 0;

    // Token price top right
    const logoSize = 26;
    const priceText = `ODINMARIO  ${tokenPriceRef.current}`;
    ctx.font = "bold 12px 'Figtree',sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    const tw = ctx.measureText(priceText).width;
    const px = cw - tw - logoSize - 20;
    if (tokenLogoRef.current?.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cw - logoSize / 2 - 10, 22, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        tokenLogoRef.current,
        cw - logoSize - 10,
        22 - logoSize / 2,
        logoSize,
        logoSize,
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#FF8C00";
      ctx.beginPath();
      ctx.arc(cw - logoSize / 2 - 10, 22, logoSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#FFD700";
    ctx.fillText(priceText, px, 26);
    ctx.shadowBlur = 0;

    // Boss HP bar
    if (boss?.active && !boss.defeated) {
      const barW = 200;
      const barH = 18;
      const bx = cw / 2 - barW / 2;
      const by = 10;
      const hpFrac = boss.hp / boss.maxHp;
      const hpColor =
        boss.phase === 3 ? "#ff2200" : boss.phase === 2 ? "#ff8800" : "#ff4444";

      // BG
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(bx - 2, by - 2, barW + 4, barH + 4, 4);
      ctx.fill();
      // Empty bar
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.roundRect(bx, by, barW, barH, 3);
      ctx.fill();
      // Fill
      ctx.fillStyle = hpColor;
      ctx.beginPath();
      ctx.roundRect(bx, by, barW * hpFrac, barH, 3);
      ctx.fill();
      // Border
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, barW, barH, 3);
      ctx.stroke();
      // Label
      ctx.font = "bold 11px 'Figtree',sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 2;
      ctx.fillText(`BOSS HP  ${boss.hp} / ${boss.maxHp}`, cw / 2, by + 13);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }
  }

  function startGame() {
    stateRef.current = initState();
    stateRef.current.running = true;
    duckingRef.current = false;
    setUiState("playing");
    setSubmitted(false);
    setShowShootBtn(false);
  }

  async function submitScore(score: number) {
    const username = window.__odinUsername;
    if (!username || submitted) return;
    setSubmitted(true);
    try {
      if (actor && typeof (actor as any).submitBearScore === "function") {
        await (actor as any).submitBearScore(username, BigInt(score));
      } else if (actor) {
        await actor.submitScore(username, BigInt(score));
      }
    } catch {
      // silently ignore
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: game loop uses refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function loop() {
      const canvas2 = canvasRef.current;
      if (!canvas2) return;
      const ctx = canvas2.getContext("2d");
      if (!ctx) return;
      const cw = canvas2.width;
      const ch = canvas2.height;
      const gs = stateRef.current;
      tickRef.current += 1;
      const t = tickRef.current;

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, ch);
      if (gs.bossTriggered) {
        sky.addColorStop(0, "#3a0a0a");
        sky.addColorStop(0.7, "#7a1a0a");
        sky.addColorStop(1, "#4a1008");
      } else {
        sky.addColorStop(0, "#87CEEB");
        sky.addColorStop(0.7, "#E0F4FF");
        sky.addColorStop(1, "#B8E0FF");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, ch);

      if (bgImgRef.current?.complete) {
        ctx.globalAlpha = 0.15;
        ctx.drawImage(bgImgRef.current, 0, 0, cw, ch);
        ctx.globalAlpha = 1;
      }

      for (const c of gs.clouds) {
        if (gs.running) c.x -= gs.speed * 0.3;
        if (c.x + c.w < 0) c.x = cw + 50;
        drawCloud(ctx, c);
      }

      ctx.fillStyle = "#3a7d44";
      ctx.fillRect(0, GROUND_Y, cw, ch - GROUND_Y);
      ctx.fillStyle = "#4a9a55";
      ctx.fillRect(0, GROUND_Y, cw, 8);

      if (gs.running && !gs.over) {
        gs.legAnim += 1;
        gs.speedTimer += 1;
        gs.score += 1;

        // Speed progression: every 300 ticks +0.7, max 18
        if (gs.speedTimer >= 300) {
          gs.speedTimer = 0;
          gs.speed = Math.min(gs.speed + 0.7, 18);
        }

        // Boss trigger
        if (gs.score >= BOSS_TRIGGER_SCORE && !gs.bossTriggered) {
          gs.bossTriggered = true;
          setShowShootBtn(true);
          gs.boss = {
            active: false,
            x: cw + 80,
            y: GROUND_Y - 140,
            hp: 10,
            maxHp: 10,
            invincibleTimer: 0,
            shootTimer: 120,
            phase: 1,
            charging: false,
            chargeTimer: 0,
            defeated: false,
            defeatTimer: 90,
            entered: false,
            warningTimer: 120,
            bobOffset: 0,
            defeatAngle: 0,
            defeatVY: 0,
          };
        }

        // Warning countdown before boss enters
        if (gs.boss && !gs.boss.active && gs.boss.warningTimer > 0) {
          gs.boss.warningTimer -= 1;
          if (gs.boss.warningTimer <= 0) {
            gs.boss.active = true;
          }
        }

        // Boss update
        if (gs.boss?.active) {
          const boss = gs.boss;
          boss.phase = getBossPhase(boss.hp);

          if (boss.defeated) {
            // Defeat animation
            boss.defeatTimer -= 1;
            boss.defeatAngle += 0.18;
            boss.defeatVY += 0.5;
            boss.y += boss.defeatVY;
            if (boss.defeatTimer <= 0) {
              gs.victory = true;
              gs.running = false;
              gs.over = false;
              setUiState("victory");
              setDisplayScore(Math.floor(gs.score / 10));
              submitScore(Math.floor(gs.score / 10));
            }
          } else {
            // Slide in from right
            if (!boss.entered) {
              const targetX = cw - 160;
              if (boss.x > targetX) {
                boss.x -= 4;
              } else {
                boss.x = targetX;
                boss.entered = true;
              }
            }

            // Invincible timer
            if (boss.invincibleTimer > 0) boss.invincibleTimer -= 1;

            // Charge mechanic (phase 2+)
            if (boss.phase >= 2 && boss.entered) {
              boss.chargeTimer -= 1;
              if (boss.chargeTimer <= 0 && !boss.charging) {
                const chargeInterval = boss.phase === 3 ? 180 : 280;
                if (boss.chargeTimer <= -chargeInterval) {
                  boss.charging = true;
                  boss.chargeTimer = 0;
                }
              }
              if (boss.charging) {
                boss.x -= 7;
                if (boss.x < 220) {
                  boss.charging = false;
                  boss.chargeTimer = 0;
                }
              } else if (!boss.charging && boss.x < cw - 160) {
                boss.x += 2;
                if (boss.x > cw - 160) boss.x = cw - 160;
              }
            }

            // Shooting
            if (boss.entered) {
              boss.shootTimer -= 1;
              if (boss.shootTimer <= 0) {
                const shootInterval =
                  boss.phase === 3 ? 50 : boss.phase === 2 ? 80 : 120;
                boss.shootTimer = shootInterval;

                const bearCenterY =
                  gs.bearY + (gs.isDucking ? DUCK_H : BEAR_H) / 2;
                const dy = bearCenterY - boss.y;
                const dist = Math.sqrt((boss.x - BEAR_X) ** 2 + dy ** 2);
                const vy = (dy / dist) * 3 + (Math.random() - 0.5) * 2;

                gs.bossBullets.push({ x: boss.x - 30, y: boss.y, vy });
                if (boss.phase === 3) {
                  gs.bossBullets.push({
                    x: boss.x - 30,
                    y: boss.y + 20,
                    vy: vy + 1.5,
                  });
                }
              }
            }
          }
        }

        // Boss body collision with player
        if (gs.boss?.active && !gs.boss.defeated && gs.invincible <= 0) {
          const boss = gs.boss;
          const bossLeft = boss.x - 50;
          const bossRight = boss.x + 50;
          const bossTop = boss.y - 60;
          const bossBottom = boss.y + 50;
          const bearLeft = BEAR_X + 6;
          const bearRight = BEAR_X + BEAR_W - 6;
          const bearTop = gs.bearY;
          const bearBottom = gs.bearY + (gs.isDucking ? DUCK_H : BEAR_H);
          if (
            bearRight > bossLeft &&
            bearLeft < bossRight &&
            bearBottom > bossTop &&
            bearTop < bossBottom
          ) {
            if (gs.hasShield) {
              gs.hasShield = false;
              gs.shieldTimer = 0;
              gs.invincible = 60;
            } else {
              gs.lives -= 1;
              gs.invincible = 90;
              if (gs.lives <= 0) {
                gs.running = false;
                gs.over = true;
                setUiState("over");
                setDisplayScore(Math.floor(gs.score / 10));
                playGameOver();
                submitScore(Math.floor(gs.score / 10));
              }
            }
          }
        }

        // Move player bullets
        gs.playerBullets = gs.playerBullets.filter((b) => {
          b.x += 12;
          // Hit boss
          if (
            gs.boss?.active &&
            !gs.boss.defeated &&
            gs.boss.invincibleTimer <= 0
          ) {
            const boss = gs.boss;
            if (
              b.x > boss.x - 50 &&
              b.x < boss.x + 50 &&
              b.y > boss.y - 60 &&
              b.y < boss.y + 50
            ) {
              boss.hp -= 1;
              boss.invincibleTimer = 15;
              playBossHit();
              if (boss.hp <= 0) {
                boss.hp = 0;
                boss.defeated = true;
                boss.defeatAngle = 0;
                boss.defeatVY = -3;
              }
              return false;
            }
          }
          return b.x < cw + 20;
        });

        // Move boss bullets
        gs.bossBullets = gs.bossBullets.filter((b) => {
          b.x -= 6 + Math.random() * 2;
          b.y += b.vy;
          // Hit player
          if (gs.invincible <= 0) {
            const bearLeft = BEAR_X + 6;
            const bearRight = BEAR_X + BEAR_W - 6;
            const bearTop = gs.bearY;
            const bearBottom = gs.bearY + (gs.isDucking ? DUCK_H : BEAR_H);
            if (
              b.x > bearLeft &&
              b.x < bearRight &&
              b.y > bearTop &&
              b.y < bearBottom
            ) {
              if (gs.hasShield) {
                gs.hasShield = false;
                gs.shieldTimer = 0;
                gs.invincible = 60;
              } else {
                gs.lives -= 1;
                gs.invincible = 90;
                if (gs.lives <= 0) {
                  gs.running = false;
                  gs.over = true;
                  setUiState("over");
                  setDisplayScore(Math.floor(gs.score / 10));
                  submitScore(Math.floor(gs.score / 10));
                }
              }
              return false;
            }
          }
          return b.x > -20 && b.y > -20 && b.y < CANVAS_H + 20;
        });

        // Only spawn obstacles if boss not triggered
        if (!gs.bossTriggered) {
          gs.spawnTimer -= 1;
          if (gs.spawnTimer <= 0) {
            const roll = Math.random();
            if (roll < 0.35) {
              const flyY = GROUND_Y - 75 - Math.random() * 20;
              gs.obstacles.push({
                x: cw + 20,
                w: 40,
                h: 30,
                type: "bee",
                flyY,
              });
            } else if (roll < 0.6) {
              const flyY = GROUND_Y - 70 - Math.random() * 25;
              gs.obstacles.push({
                x: cw + 20,
                w: 44,
                h: 30,
                type: "bird",
                flyY,
              });
            } else if (roll < 0.8) {
              const h = 30 + Math.random() * 30;
              gs.obstacles.push({ x: cw + 20, w: 36, h, type: "rock" });
            } else {
              const h = 35 + Math.random() * 25;
              gs.obstacles.push({ x: cw + 20, w: 36, h, type: "stump" });
            }
            gs.spawnTimer =
              Math.max(25, 55 - gs.speed * 2) +
              Math.random() * Math.max(20, 65 - gs.speed * 2);
          }
        }

        // Spawn honey
        gs.honeyTimer -= 1;
        if (gs.honeyTimer <= 0) {
          const isShield = Math.random() < 0.2;
          gs.honeys.push({
            x: cw + 20,
            y: GROUND_Y - 60 - Math.random() * 80,
            collected: false,
            isShield,
          });
          gs.honeyTimer = 150 + Math.random() * 100;
        }

        // Ducking on ground logic
        if (duckingRef.current && gs.bearY >= GROUND_Y - BEAR_H - 5) {
          gs.isDucking = true;
          gs.bearY = GROUND_Y - DUCK_H;
          gs.bearVY = 0;
        } else if (
          !duckingRef.current &&
          gs.isDucking &&
          gs.bearY >= GROUND_Y - DUCK_H - 2
        ) {
          gs.isDucking = false;
          gs.bearY = GROUND_Y - BEAR_H;
        }

        // Physics
        if (!gs.isDucking) {
          gs.bearVY += GRAVITY;
          gs.bearY += gs.bearVY;
          const groundLevel = GROUND_Y - BEAR_H;
          if (gs.bearY >= groundLevel) {
            gs.bearY = groundLevel;
            gs.bearVY = 0;
            gs.jumpsLeft = 2;
            if (duckingRef.current) {
              gs.isDucking = true;
              gs.bearY = GROUND_Y - DUCK_H;
            }
          }
        }

        // Decay shield timer
        if (gs.hasShield && gs.shieldTimer > 0) {
          gs.shieldTimer -= 1;
          if (gs.shieldTimer <= 0) {
            gs.hasShield = false;
          }
        }

        // Move obstacles
        gs.obstacles = gs.obstacles.filter((o) => {
          o.x -= gs.speed;
          return o.x + o.w > -20;
        });

        // Collision with obstacles (only if boss not triggered)
        if (gs.invincible <= 0 && !gs.bossTriggered) {
          const currentH = gs.isDucking ? DUCK_H : BEAR_H;
          const bearTop = gs.bearY;
          const bearBottom = gs.bearY + currentH;
          const bearLeft = BEAR_X + 6;
          const bearRight = BEAR_X + BEAR_W - 6;

          for (const o of gs.obstacles) {
            const obsLeft = o.x + 4;
            const obsRight = o.x + o.w - 4;

            let hit = false;
            if (o.type === "rock" || o.type === "stump") {
              const obsTop = GROUND_Y - o.h;
              const obsBottom = GROUND_Y;
              if (
                bearRight > obsLeft &&
                bearLeft < obsRight &&
                bearBottom > obsTop + 4 &&
                bearTop < obsBottom
              ) {
                hit = true;
              }
            } else {
              const flyY = o.flyY ?? GROUND_Y - 70;
              const obsTop = flyY - o.h / 2;
              const obsBottom = flyY + o.h / 2;
              if (
                bearRight > obsLeft &&
                bearLeft < obsRight &&
                bearBottom > obsTop + 4 &&
                bearTop < obsBottom - 4
              ) {
                hit = true;
              }
            }

            if (hit) {
              if (gs.hasShield) {
                gs.hasShield = false;
                gs.shieldTimer = 0;
                gs.invincible = 60;
                gs.comboCount = 0;
                gs.comboMultiplier = 1;
              } else {
                gs.lives -= 1;
                gs.invincible = 90;
                gs.comboCount = 0;
                gs.comboMultiplier = 1;
                if (gs.lives <= 0) {
                  gs.running = false;
                  gs.over = true;
                  setUiState("over");
                  setDisplayScore(Math.floor(gs.score / 10));
                  submitScore(Math.floor(gs.score / 10));
                }
              }
              break;
            }
          }
        } else if (!gs.bossTriggered) {
          gs.invincible -= 1;
        } else if (gs.invincible > 0) {
          gs.invincible -= 1;
        }

        // Move & collect honey
        gs.honeys = gs.honeys.filter((h) => {
          if (h.collected) return false;
          h.x -= gs.speed;
          const bearLeft = BEAR_X + 4;
          const bearRight = BEAR_X + BEAR_W - 4;
          const bearTop = gs.bearY + 4;
          const bearBottom = gs.bearY + (gs.isDucking ? DUCK_H : BEAR_H);
          if (
            bearRight > h.x - 14 &&
            bearLeft < h.x + 14 &&
            bearBottom > h.y - 16 &&
            bearTop < h.y + 16
          ) {
            h.collected = true;
            playCoin();
            if (h.isShield) {
              gs.hasShield = true;
              gs.shieldTimer = 300;
            } else {
              gs.comboCount += 1;
              gs.comboMultiplier = getComboMultiplier(gs.comboCount);
              gs.score += 100 * gs.comboMultiplier;
            }
            return false;
          }
          return h.x + 14 > -10;
        });

        setDisplayScore(Math.floor(gs.score / 10));
      }

      // Draw obstacles
      for (const o of gs.obstacles) drawObstacle(ctx, o, t);

      // Draw honey
      for (const h of gs.honeys) drawHoney(ctx, h, t);

      // Draw boss bullets
      for (const b of gs.bossBullets) {
        ctx.fillStyle = "#cc5500";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff9900";
        ctx.beginPath();
        ctx.arc(b.x - 2, b.y - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw player bullets
      for (const b of gs.playerBullets) {
        ctx.fillStyle = "#FFE040";
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(b.x - 1, b.y - 1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw boss
      if (gs.boss?.active) {
        drawBossCharacter(ctx, gs.boss, t);
      }

      // Draw bear
      drawBear(
        ctx,
        BEAR_X,
        gs.bearY,
        gs.legAnim,
        gs.invincible,
        gs.isDucking,
        gs.hasShield,
        gs.shieldTimer,
      );

      // Warning text
      if (gs.boss && !gs.boss.active && gs.boss.warningTimer > 0) {
        const alpha = Math.min(1, (120 - gs.boss.warningTimer) / 20);
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.25);
        ctx.save();
        ctx.globalAlpha = alpha * pulse;
        ctx.font = "bold 42px 'Figtree',sans-serif";
        ctx.fillStyle = "#ff2200";
        ctx.textAlign = "center";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 20;
        ctx.fillText("⚠️ BOSS FIGHT!", cw / 2, ch / 2 - 20);
        ctx.font = "bold 18px 'Figtree',sans-serif";
        ctx.fillStyle = "#FFD700";
        ctx.shadowBlur = 8;
        ctx.fillText("Press Z / F to SHOOT!", cw / 2, ch / 2 + 18);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // HUD
      drawHUD(
        ctx,
        Math.floor(gs.score / 10),
        gs.lives,
        gs.comboMultiplier,
        gs.hasShield,
        gs.speed,
        cw,
        gs.boss,
      );

      // Hint text during play
      if (gs.running && !gs.over && t < 180) {
        ctx.font = "12px 'Figtree',sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(
          "↑ Jump  ↓ Duck (hold)  🐝🐦 = Duck!  🍯 = +Score  🛡 = Shield",
          cw / 2,
          GROUND_Y - 10,
        );
        ctx.textAlign = "left";
      }

      // Built by label
      ctx.font = "11px 'Figtree',sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.textAlign = "center";
      ctx.fillText("Built by ODINMARIO", cw / 2, ch - 8);
      ctx.textAlign = "left";

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Canvas sizing
  useEffect(() => {
    function resize() {
      const c = canvasRef.current;
      const container = containerRef.current;
      if (!c || !container) return;
      const w = container.offsetWidth;
      const scale = w / CANVAS_W;
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      c.style.width = `${w}px`;
      c.style.height = `${CANVAS_H * scale}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100dvh",
        overflow: "hidden",
        background: "#0a0a1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Figtree',sans-serif",
        position: "relative",
      }}
    >
      {/* Home button */}
      <button
        type="button"
        data-ocid="bear.button"
        onClick={onBack}
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          border: "2px solid rgba(255,255,255,0.3)",
          borderRadius: 8,
          padding: "6px 14px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        🏠 Home
      </button>

      {/* Start screen */}
      {uiState === "start" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            background:
              "linear-gradient(135deg, #e8640a 0%, #f5830a 40%, #f5a020 100%)",
          }}
        >
          <img
            src="/assets/uploads/20260315_101055-1.jpg"
            alt="Tedy Bear"
            style={{
              width: 160,
              height: 160,
              objectFit: "cover",
              borderRadius: "50%",
              marginBottom: 12,
              boxShadow: "0 0 30px rgba(255,180,0,0.6)",
            }}
          />
          <h1
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              color: "#FFD700",
              fontSize: 40,
              fontWeight: 900,
              textShadow: "0 0 20px rgba(255,215,0,0.7)",
              marginBottom: 6,
              letterSpacing: 3,
            }}
          >
            ODIN TEDY
          </h1>
          <p
            style={{
              color: "#fff",
              fontSize: 15,
              marginBottom: 16,
              textAlign: "center",
              maxWidth: 340,
              lineHeight: 1.6,
              textShadow: "0 2px 6px rgba(0,0,0,0.5)",
            }}
          >
            Jump over rocks & stumps. Duck under bees & birds! Collect 🍯 honey
            for combos and 🛡 shield jars for protection! Defeat the BOSS to win!
          </p>
          <div
            style={{
              display: "flex",
              gap: 24,
              marginBottom: 24,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {[
              { icon: "⬆️", label: "Jump / Double Jump" },
              { icon: "⬇️", label: "Duck (hold)" },
              { icon: "🐝🐦", label: "Duck to dodge!" },
              { icon: "🍯x3", label: "Combo bonus" },
              { icon: "⚔️", label: "Z / F = SHOOT!" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  padding: "8px 14px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                >
                  {item.icon}
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            data-ocid="bear.primary_button"
            onClick={startGame}
            style={{
              background: "linear-gradient(90deg, #c47a00, #FFD700)",
              color: "#000",
              fontWeight: 900,
              fontSize: 18,
              borderRadius: 30,
              padding: "12px 40px",
              border: "none",
              cursor: "pointer",
              letterSpacing: 2,
              boxShadow: "0 0 20px rgba(255,215,0,0.5)",
              textTransform: "uppercase",
            }}
          >
            ▶ PLAY
          </button>
        </div>
      )}

      {/* Victory screen */}
      {uiState === "victory" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            background:
              "linear-gradient(135deg, #1a6b1a 0%, #2d9e2d 50%, #FFD700 100%)",
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
          <h2
            style={{
              color: "#FFD700",
              fontFamily: "'Bricolage Grotesque',sans-serif",
              fontSize: 40,
              fontWeight: 900,
              textShadow: "0 0 20px rgba(255,215,0,0.8)",
              marginBottom: 8,
            }}
          >
            BOSS DEFEATED!
          </h2>
          <p
            style={{
              color: "#fff",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Score: {displayScore}
          </p>
          <p style={{ color: "#aaffaa", fontSize: 15, marginBottom: 24 }}>
            Tedy defeated the boss! 🎉
          </p>
          {window.__odinUsername && (
            <p style={{ color: "#88aacc", fontSize: 13, marginBottom: 20 }}>
              {submitted
                ? `✅ Score submitted as ${window.__odinUsername}`
                : "Submitting score..."}
            </p>
          )}
          <button
            type="button"
            data-ocid="bear.primary_button"
            onClick={startGame}
            style={{
              background: "linear-gradient(90deg, #c47a00, #FFD700)",
              color: "#000",
              fontWeight: 900,
              fontSize: 16,
              borderRadius: 30,
              padding: "10px 34px",
              border: "none",
              cursor: "pointer",
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <button
            type="button"
            data-ocid="bear.cancel_button"
            onClick={onBack}
            style={{
              background: "transparent",
              color: "#88aacc",
              border: "1px solid #334",
              borderRadius: 20,
              padding: "8px 24px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🏠 Back to Menu
          </button>
        </div>
      )}

      {/* Game over screen */}
      {uiState === "over" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            background: "rgba(0,0,0,0.88)",
          }}
          data-ocid="bear.modal"
        >
          <div style={{ fontSize: 56, marginBottom: 8 }}>💀</div>
          <h2
            style={{
              color: "#ff4444",
              fontFamily: "'Bricolage Grotesque',sans-serif",
              fontSize: 36,
              fontWeight: 900,
              textShadow: "0 0 16px rgba(255,68,68,0.7)",
              marginBottom: 10,
            }}
          >
            GAME OVER
          </h2>
          <p
            style={{
              color: "#FFD700",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Score: {displayScore}
          </p>
          {window.__odinUsername && (
            <p style={{ color: "#88aacc", fontSize: 13, marginBottom: 20 }}>
              {submitted
                ? `✅ Score submitted as ${window.__odinUsername}`
                : "Submitting score..."}
            </p>
          )}
          <button
            type="button"
            data-ocid="bear.primary_button"
            onClick={startGame}
            style={{
              background: "linear-gradient(90deg, #c47a00, #FFD700)",
              color: "#000",
              fontWeight: 900,
              fontSize: 16,
              borderRadius: 30,
              padding: "10px 34px",
              border: "none",
              cursor: "pointer",
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <button
            type="button"
            data-ocid="bear.cancel_button"
            onClick={onBack}
            style={{
              background: "transparent",
              color: "#88aacc",
              border: "1px solid #334",
              borderRadius: 20,
              padding: "8px 24px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🏠 Back to Menu
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          paddingTop: uiState === "start" ? 0 : 56,
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          data-ocid="bear.canvas_target"
          tabIndex={0}
          style={{
            display: uiState === "playing" ? "block" : "none",
            borderRadius: 12,
            boxShadow: "0 0 30px rgba(0,0,0,0.5)",
            cursor: "pointer",
          }}
        />

        {/* Mobile controls */}
        {isMobile && uiState === "playing" && (
          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "center",
              gap: 20,
              width: "100%",
              paddingBottom: 16,
            }}
          >
            <button
              type="button"
              data-ocid="bear.secondary_button"
              onTouchStart={(e) => {
                e.preventDefault();
                startDuck();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopDuck();
              }}
              onMouseDown={startDuck}
              onMouseUp={stopDuck}
              onMouseLeave={stopDuck}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #1a5cc7, #60a8ff)",
                color: "#fff",
                fontSize: 28,
                fontWeight: 900,
                border: "3px solid rgba(96,168,255,0.6)",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(96,168,255,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
                WebkitUserSelect: "none",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 22 }}>↓</span>
              <span style={{ fontSize: 10, opacity: 0.9, letterSpacing: 1 }}>
                DUCK
              </span>
            </button>
            <button
              type="button"
              data-ocid="bear.toggle"
              onTouchStart={(e) => {
                e.preventDefault();
                jump();
              }}
              onClick={jump}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #c47a00, #FFD700)",
                color: "#000",
                fontSize: 28,
                fontWeight: 900,
                border: "3px solid rgba(255,215,0,0.6)",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(255,215,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
                WebkitUserSelect: "none",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 22 }}>↑</span>
              <span style={{ fontSize: 10, opacity: 0.8, letterSpacing: 1 }}>
                JUMP
              </span>
            </button>
            {showShootBtn && (
              <button
                type="button"
                data-ocid="bear.button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  shoot();
                }}
                onClick={shoot}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #cc4400, #ff8800)",
                  color: "#fff",
                  fontSize: 28,
                  fontWeight: 900,
                  border: "3px solid rgba(255,136,0,0.8)",
                  cursor: "pointer",
                  boxShadow: "0 0 20px rgba(255,100,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 22 }}>🍯</span>
                <span style={{ fontSize: 10, opacity: 0.9, letterSpacing: 1 }}>
                  SHOOT
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
