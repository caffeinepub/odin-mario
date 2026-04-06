import { useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";
import {
  playBossHit,
  playEnemyDie,
  playGameOver,
  playHit,
} from "./utils/sounds";

interface OdinWarriorProps {
  onBack: () => void;
}

declare global {
  interface Window {
    __odinUsername?: string;
    actor?: any;
  }
}

const CANVAS_W = 900;
const CANVAS_H = 480;
const GROUND_Y = CANVAS_H - 80;
const GRAVITY = 0.55;
const ODIN_W = 44;
const ODIN_H = 56;
const ODIN_START_X = 120;
const ODIN_SPEED = 4;
const ATTACK_DURATION = 300;
const ATTACK_RANGE = 70;
const INVINCIBLE_DURATION = 2000;

type EnemyType = "grunt" | "heavy" | "fenrir";
interface Enemy {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  speed: number;
  type: EnemyType;
  dir: 1 | -1;
  attackTimer: number;
  legAnim: number;
  dead: boolean;
  deadTimer: number;
  // Fenrir-specific
  fenrirChargeTimer?: number;
  fenrirLeapTimer?: number;
  fenrirCharging?: boolean;
  fenrirChargeRemaining?: number;
  fenrirLeaping?: boolean;
  fenrirLeapVY?: number;
  fenrirLeapTargetX?: number;
  fenrirLaserTimer?: number;
  fenrirLaserWarning?: boolean;
  fenrirLaserWarningTimer?: number;
  fenrirLaserActive?: boolean;
  fenrirLaserDuration?: number;
  fenrirLaserY?: number;
}

interface Coin {
  x: number;
  y: number;
  vy: number;
  collected: boolean;
  id: number;
}

interface LightningParticle {
  id: number;
  x: number;
  y: number;
  points: { x: number; y: number }[];
  life: number;
  maxLife: number;
  color: string;
}

interface GameState {
  running: boolean;
  over: boolean;
  victory: boolean;
  score: number;
  lives: number;
  wave: number;
  totalWaves: number;
  odinX: number;
  odinY: number;
  odinVY: number;
  onGround: boolean;
  facingLeft: boolean;
  attacking: boolean;
  attackTimer: number;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
  enemies: Enemy[];
  coins: Coin[];
  invincibleTimer: number;
  waveCleared: boolean;
  waveClearTimer: number;
  submitted: boolean;
  nextId: number;
  fightingFenrir: boolean;
  fenrirIntroTimer: number;
  lightningParticles: LightningParticle[];
  fenrirDefeatedBannerTimer: number;
}

function makeEnemy(
  id: number,
  wave: number,
  side: "left" | "right",
  index: number,
): Enemy {
  const isHeavy = index % 3 === 2 || wave >= 3;
  const type: EnemyType = isHeavy ? "heavy" : "grunt";
  const w = type === "heavy" ? 44 : 28;
  const h = type === "heavy" ? 60 : 44;
  const hp = type === "heavy" ? 3 : 1;
  const speed = type === "heavy" ? 1.5 + wave * 0.3 : 2.2 + wave * 0.4;
  const x = side === "right" ? CANVAS_W + 40 + index * 60 : -60 - index * 60;
  return {
    id,
    x,
    y: GROUND_Y - h,
    w,
    h,
    hp,
    maxHp: hp,
    speed,
    type,
    dir: side === "right" ? -1 : 1,
    attackTimer: 0,
    legAnim: 0,
    dead: false,
    deadTimer: 0,
  };
}

function spawnWave(
  wave: number,
  nextId: number,
): { enemies: Enemy[]; nextId: number } {
  if (wave === 4) {
    // Fenrir boss wave
    const fenrir: Enemy = {
      id: nextId,
      x: CANVAS_W / 2 - 60,
      y: GROUND_Y - 100,
      w: 120,
      h: 100,
      hp: 20,
      maxHp: 20,
      speed: 2.5,
      type: "fenrir",
      dir: -1,
      attackTimer: 0,
      legAnim: 0,
      dead: false,
      deadTimer: 0,
      fenrirChargeTimer: 0,
      fenrirLeapTimer: 0,
      fenrirCharging: false,
      fenrirChargeRemaining: 0,
      fenrirLeaping: false,
      fenrirLeapVY: 0,
      fenrirLeapTargetX: 0,
      fenrirLaserTimer: 7000,
      fenrirLaserWarning: false,
      fenrirLaserWarningTimer: 0,
      fenrirLaserActive: false,
      fenrirLaserDuration: 0,
      fenrirLaserY: GROUND_Y - 30,
    };
    return { enemies: [fenrir], nextId: nextId + 1 };
  }
  const count = 3 + wave * 2;
  const enemies: Enemy[] = [];
  let id = nextId;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? "right" : "left";
    enemies.push(makeEnemy(id++, wave, side, Math.floor(i / 2)));
  }
  return { enemies, nextId: id };
}

function initState(): GameState {
  return {
    running: false,
    over: false,
    victory: false,
    score: 0,
    lives: 3,
    wave: 1,
    totalWaves: 4,
    odinX: ODIN_START_X,
    odinY: GROUND_Y - ODIN_H,
    odinVY: 0,
    onGround: true,
    facingLeft: false,
    attacking: false,
    attackTimer: 0,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    enemies: [],
    coins: [],
    invincibleTimer: 0,
    waveCleared: false,
    waveClearTimer: 0,
    submitted: false,
    nextId: 1,
    fightingFenrir: false,
    fenrirIntroTimer: 0,
    lightningParticles: [],
    fenrirDefeatedBannerTimer: 0,
  };
}

function makeLightningPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  segments = 6,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const mx = startX + (endX - startX) * t + (Math.random() - 0.5) * 40;
    const my = startY + (endY - startY) * t + (Math.random() - 0.5) * 40;
    points.push({ x: mx, y: my });
  }
  points.push({ x: endX, y: endY });
  return points;
}

function drawLightningBolt(
  ctx: CanvasRenderingContext2D,
  p: LightningParticle,
) {
  const alpha = p.life / p.maxLife;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.points[0].x, p.points[0].y);
  for (let i = 1; i < p.points.length; i++) {
    ctx.lineTo(p.points[i].x, p.points[i].y);
  }
  ctx.stroke();
  // inner bright core
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(p.points[0].x, p.points[0].y);
  for (let i = 1; i < p.points.length; i++) {
    ctx.lineTo(p.points[i].x, p.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawOdin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facingLeft: boolean,
  attacking: boolean,
  attackTimer: number,
  invincible: boolean,
  fightingFenrir: boolean,
) {
  ctx.save();
  if (invincible && Math.floor(Date.now() / 100) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }
  const cx = x + ODIN_W / 2;
  const flip = facingLeft ? -1 : 1;
  ctx.save();
  ctx.translate(cx, y + ODIN_H / 2);
  ctx.scale(flip, 1);

  // Legs
  ctx.fillStyle = "#2244aa";
  ctx.fillRect(-10, 20, 8, 22);
  ctx.fillRect(2, 20, 8, 22);

  // Torso
  ctx.fillStyle = "#2255cc";
  ctx.fillRect(-14, -2, 28, 26);

  // Arms
  ctx.fillStyle = "#c8a060";
  ctx.fillRect(-20, 0, 8, 18);
  ctx.fillRect(12, 0, 8, 18);

  // Head
  ctx.fillStyle = "#e8c090";
  ctx.beginPath();
  ctx.ellipse(0, -16, 12, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Beard
  ctx.fillStyle = "#d0d0d0";
  ctx.beginPath();
  ctx.ellipse(0, -5, 10, 8, 0, 0, Math.PI);
  ctx.fill();

  // Helmet
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.ellipse(0, -24, 13, 10, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-13, -26, 26, 6);

  // Horns
  ctx.fillStyle = "#d4a820";
  // Left horn
  ctx.beginPath();
  ctx.moveTo(-12, -28);
  ctx.lineTo(-20, -40);
  ctx.lineTo(-8, -30);
  ctx.fill();
  // Right horn
  ctx.beginPath();
  ctx.moveTo(12, -28);
  ctx.lineTo(20, -40);
  ctx.lineTo(8, -30);
  ctx.fill();

  // Hammer
  const attackProgress = attacking ? 1 - attackTimer / ATTACK_DURATION : 0;
  const hammerAngle = attacking
    ? -Math.PI / 6 + attackProgress * (Math.PI * 0.7)
    : -Math.PI / 8;
  ctx.save();
  ctx.translate(16, 2);
  ctx.rotate(hammerAngle);
  // Handle
  ctx.fillStyle = "#8B5E3C";
  ctx.fillRect(-3, 0, 6, 36);
  // Head - electric blue glow when fighting Fenrir and attacking
  if (fightingFenrir && attacking) {
    ctx.shadowColor = "#4488ff";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#4488ff";
  } else {
    ctx.fillStyle = "#999";
  }
  ctx.fillRect(-10, -8, 26, 14);

  // Lightning arcs around hammer when fighting Fenrir
  if (fightingFenrir && attacking) {
    ctx.strokeStyle = "#88aaff";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#88aaff";
    ctx.shadowBlur = 8;
    // Arc 1
    ctx.beginPath();
    ctx.arc(3, -8, 12, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
    // Arc 2
    ctx.beginPath();
    ctx.arc(3, 6, 10, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    // Arc 3
    ctx.beginPath();
    ctx.arc(12, -1, 8, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();

  ctx.restore();
  ctx.restore();
}

function drawFenrir(ctx: CanvasRenderingContext2D, enemy: Enemy, t: number) {
  if (enemy.dead) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, enemy.deadTimer / 500);
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💥", enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    ctx.restore();
    return;
  }
  ctx.save();
  const cx = enemy.x + enemy.w / 2;
  const cy = enemy.y + enemy.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(enemy.dir, 1);

  // Body (large dark wolf)
  ctx.fillStyle = "#3a3a4a";
  ctx.beginPath();
  ctx.ellipse(0, 10, 52, 35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fur texture lines (dark grey)
  ctx.strokeStyle = "#2a2a38";
  ctx.lineWidth = 2;
  for (let i = -40; i < 40; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, -10);
    ctx.lineTo(i + 5, 20);
    ctx.stroke();
  }

  // Head
  ctx.fillStyle = "#4a4a5a";
  ctx.beginPath();
  ctx.ellipse(38, -15, 28, 22, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Snout / muzzle
  ctx.fillStyle = "#5a5a6a";
  ctx.beginPath();
  ctx.ellipse(58, -8, 16, 12, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Fangs (white, sharp)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(52, -3);
  ctx.lineTo(56, 8);
  ctx.lineTo(60, -3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(62, -3);
  ctx.lineTo(66, 8);
  ctx.lineTo(70, -3);
  ctx.closePath();
  ctx.fill();

  // Glowing red eyes
  const eyeGlow = 0.6 + 0.4 * Math.sin(t * 0.005);
  if (enemy.fenrirLaserWarning) {
    const warnFlash = Math.sin(t * 0.02) > 0;
    ctx.fillStyle = warnFlash ? "#ffffff" : "#ff6600";
    ctx.shadowColor = "#ff6600";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(30, -22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(44, -22, 8, 0, Math.PI * 2);
    ctx.fill();
    // LASER! warning label above HP bar
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#ff6600";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚡ LASER! ⚡", 0, -88);
  } else {
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 15 * eyeGlow;
    ctx.fillStyle = `rgba(255, 50, 0, ${eyeGlow})`;
    ctx.beginPath();
    ctx.arc(30, -22, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(44, -22, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Pupils
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(31, -22, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(45, -22, 3, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = "#3a3a4a";
  ctx.beginPath();
  ctx.moveTo(22, -32);
  ctx.lineTo(10, -55);
  ctx.lineTo(36, -36);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(38, -35);
  ctx.lineTo(30, -58);
  ctx.lineTo(52, -36);
  ctx.closePath();
  ctx.fill();

  // Inner ear
  ctx.fillStyle = "#8a3a4a";
  ctx.beginPath();
  ctx.moveTo(24, -34);
  ctx.lineTo(16, -50);
  ctx.lineTo(32, -38);
  ctx.closePath();
  ctx.fill();

  // Legs (4 legs)
  ctx.fillStyle = "#3a3a4a";
  const legSwing = Math.sin(enemy.legAnim * 0.15) * 10;
  ctx.fillRect(-40, 30, 18, 30 + legSwing);
  ctx.fillRect(-15, 30, 18, 30 - legSwing);
  ctx.fillRect(15, 28, 18, 28 + legSwing);
  ctx.fillRect(35, 28, 18, 28 - legSwing);

  // Tail (curved)
  ctx.strokeStyle = "#4a4a5a";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-48, 0);
  ctx.quadraticCurveTo(-80, -20 + Math.sin(t * 0.003) * 10, -70, -45);
  ctx.stroke();

  // HP bar (prominent, above head)
  const barW = 100;
  const barX = -barW / 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(barX - 2, -75, barW + 4, 14);
  ctx.fillStyle = "#cc0000";
  ctx.fillRect(barX, -73, barW * (enemy.hp / enemy.maxHp), 10);
  ctx.fillStyle = "#ff4444";
  ctx.fillRect(barX, -73, barW * (enemy.hp / enemy.maxHp) * 0.6, 5);
  ctx.strokeStyle = "#ff0000";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2, -75, barW + 4, 14);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`FENRIR ${enemy.hp}/${enemy.maxHp}`, 0, -67);

  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, t: number) {
  if (enemy.type === "fenrir") {
    drawFenrir(ctx, enemy, t);
    // Draw laser beam in world coordinates after the wolf body
    if (enemy.fenrirLaserActive && !enemy.dead) {
      const eyeWorldX = enemy.x + enemy.w / 2 + enemy.dir * 35;
      const eyeWorldY = enemy.y + enemy.h / 2 - 22;
      const targetX = enemy.dir === 1 ? CANVAS_W + 50 : -50;
      const alpha = Math.min(1, (enemy.fenrirLaserDuration ?? 0) / 1500);
      // Outer glow
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = "#ff4400";
      ctx.lineWidth = 24;
      ctx.shadowColor = "#ff2200";
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.moveTo(eyeWorldX, eyeWorldY);
      ctx.lineTo(targetX, eyeWorldY);
      ctx.stroke();
      // Mid beam
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = "#ff8800";
      ctx.lineWidth = 12;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(eyeWorldX, eyeWorldY);
      ctx.lineTo(targetX, eyeWorldY);
      ctx.stroke();
      // White core
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(eyeWorldX, eyeWorldY);
      ctx.lineTo(targetX, eyeWorldY);
      ctx.stroke();
      // Particle sparks near origin
      for (let i = 0; i < 3; i++) {
        const sx = eyeWorldX + (Math.random() - 0.5) * 20;
        const sy = eyeWorldY + (Math.random() - 0.5) * 20;
        ctx.globalAlpha = alpha * Math.random();
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    return;
  }
  if (enemy.dead) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (1 - enemy.deadTimer / 500));
    ctx.fillStyle = enemy.type === "heavy" ? "#8b0000" : "#cc2222";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💥", enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    ctx.restore();
    return;
  }
  ctx.save();
  const cx = enemy.x + enemy.w / 2;
  const cy = enemy.y + enemy.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(enemy.dir, 1);

  if (enemy.type === "grunt") {
    // Head
    ctx.fillStyle = "#cc2222";
    ctx.beginPath();
    ctx.arc(0, -16, 9, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillRect(-8, -8, 16, 18);
    // Legs with animation
    const legSwing = Math.sin(enemy.legAnim * 0.2) * 6;
    ctx.fillStyle = "#aa1111";
    ctx.fillRect(-8, 10, 6, 14 + legSwing);
    ctx.fillRect(2, 10, 6, 14 - legSwing);
    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3, -18, 3, 0, Math.PI * 2);
    ctx.arc(3, -18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-3, -18, 1.5, 0, Math.PI * 2);
    ctx.arc(3, -18, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Heavy enemy
    ctx.fillStyle = "#8b0000";
    // Head
    ctx.beginPath();
    ctx.arc(0, -22, 14, 0, Math.PI * 2);
    ctx.fill();
    // Helmet
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.ellipse(0, -30, 15, 10, 0, Math.PI, 0);
    ctx.fill();
    // Body
    ctx.fillStyle = "#8b0000";
    ctx.fillRect(-16, -10, 32, 28);
    // Arms
    ctx.fillRect(-26, -8, 12, 22);
    ctx.fillRect(14, -8, 12, 22);
    // Legs
    const legSwing = Math.sin(enemy.legAnim * 0.15) * 8;
    ctx.fillStyle = "#660000";
    ctx.fillRect(-14, 18, 10, 20 + legSwing);
    ctx.fillRect(4, 18, 10, 20 - legSwing);
    // Eyes
    ctx.fillStyle = "#ff4400";
    ctx.beginPath();
    ctx.arc(-5, -24, 4, 0, Math.PI * 2);
    ctx.arc(5, -24, 4, 0, Math.PI * 2);
    ctx.fill();
    // HP bar
    const barW = 40;
    const barX = -barW / 2;
    ctx.fillStyle = "#333";
    ctx.fillRect(barX, -46, barW, 6);
    ctx.fillStyle = "#ff2200";
    ctx.fillRect(barX, -46, barW * (enemy.hp / enemy.maxHp), 6);
  }
  ctx.restore();
}

function drawCoin(ctx: CanvasRenderingContext2D, coin: Coin) {
  if (coin.collected) return;
  ctx.save();
  ctx.fillStyle = "#ff9900";
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₿", coin.x, coin.y);
  ctx.restore();
}

export default function OdinWarrior({ onBack }: OdinWarriorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initState());
  const keysRef = useRef<Set<string>>(new Set());
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const tokenPriceRef = useRef<string>("--");
  const tokenTimerRef = useRef<number>(0);
  const { actor } = useActor();

  const [uiState, setUiState] = useState<
    "start" | "username" | "playing" | "gameover" | "victory" | "leaderboard"
  >("start");
  const [username, setUsername] = useState<string>("");
  const [usernameInput, setUsernameInput] = useState<string>("");
  const [score, setScore] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<
    { name: string; score: number }[]
  >([]);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem("odinUsername");
    if (stored) {
      setUsername(stored);
      window.__odinUsername = stored;
    }
    setIsMobile("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (actor) window.actor = actor;
  }, [actor]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = "/assets/uploads/2002-1.jpeg";
    img.onload = () => {
      bgImgRef.current = img;
    };
  }, []);

  // Token price fetch
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("https://api.odin.fun/v1/token/2ip5");
        const data = await res.json();
        const raw = data?.price ?? data?.data?.price ?? 0;
        tokenPriceRef.current = (raw / 1000).toFixed(3);
      } catch {
        // keep current
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard listeners
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
      if (
        (e.key === "z" || e.key === "Z" || e.key === "f" || e.key === "F") &&
        stateRef.current.running
      ) {
        stateRef.current.attacking = true;
        stateRef.current.attackTimer = ATTACK_DURATION;
      }
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  function startGame() {
    const s = initState();
    s.running = true;
    const spawnResult = spawnWave(s.wave, s.nextId);
    s.enemies = spawnResult.enemies;
    s.nextId = spawnResult.nextId;
    stateRef.current = s;
    setUiState("playing");
    lastTimeRef.current = performance.now();
  }

  function handlePlay() {
    if (!username) {
      setUiState("username");
    } else {
      startGame();
    }
  }

  function handleUsernameSubmit() {
    const name = usernameInput.trim();
    if (!name) return;
    localStorage.setItem("odinUsername", name);
    window.__odinUsername = name;
    setUsername(name);
    startGame();
  }

  const submitScoreRef = useRef<(score: number) => void>(() => {});
  submitScoreRef.current = (finalScore: number) => {
    const name = username || window.__odinUsername || "Anonymous";
    const a = actor || window.actor;
    if (a) {
      a.submitScore(name, BigInt(finalScore)).catch(() => {});
    }
  };

  async function fetchLeaderboard() {
    try {
      const a = actor || window.actor;
      if (!a) return;
      const res = await a.getLeaderboard();
      const entries = (res || []).map((e: any) => ({
        name: e[0] || e.name || "?",
        score: Number(e[1] ?? e.score ?? 0),
      }));
      entries.sort((a: any, b: any) => b.score - a.score);
      setLeaderboard(entries.slice(0, 10));
    } catch {
      // ignore
    }
  }

  // Game loop
  useEffect(() => {
    if (uiState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let nextLightningId = 1000;

    function gameLoop(now: number) {
      if (!ctx || !canvas) return;
      const dt = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;
      tokenTimerRef.current += dt;

      const s = stateRef.current;
      if (!s.running) {
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Input
      const keys = keysRef.current;
      s.moveLeft = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
      s.moveRight = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
      s.moveUp = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
      s.moveDown = keys.has("ArrowDown") || keys.has("s") || keys.has("S");

      // Movement
      if (s.moveLeft) {
        s.odinX -= ODIN_SPEED;
        s.facingLeft = true;
      }
      if (s.moveRight) {
        s.odinX += ODIN_SPEED;
        s.facingLeft = false;
      }
      s.odinX = Math.max(0, Math.min(CANVAS_W - ODIN_W, s.odinX));

      // Vertical movement (limited, like fighting game)
      const vertSpeed = 3;
      if (s.moveUp)
        s.odinY = Math.max(GROUND_Y - ODIN_H - 120, s.odinY - vertSpeed);
      if (s.moveDown)
        s.odinY = Math.min(GROUND_Y - ODIN_H, s.odinY + vertSpeed);

      // Attack timer
      const wasAttacking = s.attacking;
      if (s.attacking) {
        s.attackTimer -= dt;
        if (s.attackTimer <= 0) {
          s.attacking = false;
          s.attackTimer = 0;
        }
      }

      // Generate lightning when attack starts during Fenrir fight
      if (s.attacking && !wasAttacking && s.fightingFenrir) {
        // hammer tip position (approx)
        const hammerX = s.facingLeft ? s.odinX - 10 : s.odinX + ODIN_W + 10;
        const hammerY = s.odinY + 8;
        const count = 3 + Math.floor(Math.random() * 3);
        const lightningColors = ["#88aaff", "#ccddff", "#4466ff"];
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const length = 60 + Math.random() * 40;
          const endX = hammerX + Math.cos(angle) * length;
          const endY = hammerY + Math.sin(angle) * length;
          s.lightningParticles.push({
            id: nextLightningId++,
            x: hammerX,
            y: hammerY,
            points: makeLightningPath(hammerX, hammerY, endX, endY, 6),
            life: 300,
            maxLife: 300,
            color: lightningColors[i % lightningColors.length],
          });
        }
      }

      // Update lightning particles
      for (const lp of s.lightningParticles) {
        lp.life -= dt;
      }
      s.lightningParticles = s.lightningParticles.filter((lp) => lp.life > 0);

      // Invincibility timer
      if (s.invincibleTimer > 0) s.invincibleTimer -= dt;

      // Fenrir intro timer
      if (s.fenrirIntroTimer > 0) {
        s.fenrirIntroTimer -= dt;
      }

      // Fenrir defeated banner timer
      if (s.fenrirDefeatedBannerTimer > 0) {
        s.fenrirDefeatedBannerTimer -= dt;
      }

      // Wave clear timer
      if (s.waveCleared) {
        s.waveClearTimer -= dt;
        if (s.waveClearTimer <= 0) {
          s.waveCleared = false;
          if (s.wave < s.totalWaves) {
            s.wave++;
            const spawnResult = spawnWave(s.wave, s.nextId);
            s.enemies = spawnResult.enemies;
            s.nextId = spawnResult.nextId;
            if (s.wave === 4) {
              s.fightingFenrir = true;
              s.fenrirIntroTimer = 3000;
            }
          } else {
            s.victory = true;
            s.running = false;
            const finalScore = s.score;
            setScore(finalScore);
            if (!s.submitted) {
              s.submitted = true;
              submitScoreRef.current(finalScore);
            }
            setUiState("victory");
            return;
          }
        }
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Update enemies
      const odinCX = s.odinX + ODIN_W / 2;
      const odinCY = s.odinY + ODIN_H / 2;

      for (const enemy of s.enemies) {
        if (enemy.dead) {
          enemy.deadTimer -= dt;
          continue;
        }
        enemy.legAnim++;

        if (enemy.type === "fenrir") {
          // Fenrir AI
          enemy.fenrirChargeTimer = (enemy.fenrirChargeTimer ?? 0) + dt;
          enemy.fenrirLeapTimer = (enemy.fenrirLeapTimer ?? 0) + dt;

          // Charge every 3000ms
          if (
            !enemy.fenrirCharging &&
            !enemy.fenrirLeaping &&
            !enemy.fenrirLaserWarning &&
            !enemy.fenrirLaserActive &&
            enemy.fenrirChargeTimer >= 3000
          ) {
            enemy.fenrirCharging = true;
            enemy.fenrirChargeRemaining = 500;
            enemy.fenrirChargeTimer = 0;
          }

          // Leap every 5000ms
          if (
            !enemy.fenrirLeaping &&
            !enemy.fenrirCharging &&
            !enemy.fenrirLaserWarning &&
            !enemy.fenrirLaserActive &&
            enemy.fenrirLeapTimer >= 5000
          ) {
            enemy.fenrirLeaping = true;
            enemy.fenrirLeapVY = -12;
            enemy.fenrirLeapTargetX = odinCX - enemy.w / 2;
            enemy.fenrirLeapTimer = 0;
          }

          // Laser attack every 7000ms
          enemy.fenrirLaserTimer = (enemy.fenrirLaserTimer ?? 7000) - dt;
          if (
            !enemy.fenrirLaserWarning &&
            !enemy.fenrirLaserActive &&
            !enemy.fenrirCharging &&
            !enemy.fenrirLeaping &&
            (enemy.fenrirLaserTimer ?? 0) <= 0
          ) {
            enemy.fenrirLaserWarning = true;
            enemy.fenrirLaserWarningTimer = 1200;
            enemy.fenrirLaserTimer = 7000;
          }
          if (enemy.fenrirLaserWarning) {
            enemy.fenrirLaserWarningTimer =
              (enemy.fenrirLaserWarningTimer ?? 1200) - dt;
            if ((enemy.fenrirLaserWarningTimer ?? 0) <= 0) {
              enemy.fenrirLaserWarning = false;
              enemy.fenrirLaserActive = true;
              enemy.fenrirLaserDuration = 1500;
              const ex = enemy.x + enemy.w / 2;
              enemy.dir = odinCX >= ex ? 1 : -1;
            }
          }
          if (enemy.fenrirLaserActive) {
            enemy.fenrirLaserDuration =
              (enemy.fenrirLaserDuration ?? 1500) - dt;
            if ((enemy.fenrirLaserDuration ?? 0) <= 0) {
              enemy.fenrirLaserActive = false;
              enemy.fenrirLaserDuration = 0;
            }
            // Laser collision with Odin
            if (s.invincibleTimer <= 0) {
              const eyeWorldX = enemy.x + enemy.w / 2 + enemy.dir * 35;
              const eyeWorldY = enemy.y + enemy.h / 2 - 22;
              const laserMinX = enemy.dir === 1 ? eyeWorldX : -50;
              const laserMaxX = enemy.dir === 1 ? CANVAS_W + 50 : eyeWorldX;
              const laserThickness = 20;
              const odinInBeamX =
                s.odinX < laserMaxX && s.odinX + ODIN_W > laserMinX;
              const odinInBeamY =
                s.odinY < eyeWorldY + laserThickness &&
                s.odinY + ODIN_H > eyeWorldY - laserThickness;
              if (odinInBeamX && odinInBeamY) {
                s.lives -= 1;
                playHit();
                s.invincibleTimer = INVINCIBLE_DURATION;
                if (s.lives <= 0) {
                  s.lives = 0;
                  s.over = true;
                  s.running = false;
                  const finalScore = s.score;
                  setScore(finalScore);
                  if (!s.submitted) {
                    s.submitted = true;
                    submitScoreRef.current(finalScore);
                  }
                  playGameOver();
                  setUiState("gameover");
                  return;
                }
              }
            }
          }

          // Stop movement during laser phases
          if (enemy.fenrirLaserWarning || enemy.fenrirLaserActive) {
            // Fenrir stands still while laser is active
          } else if (enemy.fenrirCharging) {
            // Rapid charge toward Odin
            const ex = enemy.x + enemy.w / 2;
            if (ex < odinCX - 4) {
              enemy.x += enemy.speed * 4;
              enemy.dir = 1;
            } else if (ex > odinCX + 4) {
              enemy.x -= enemy.speed * 4;
              enemy.dir = -1;
            }
            enemy.fenrirChargeRemaining =
              (enemy.fenrirChargeRemaining ?? 0) - dt;
            if ((enemy.fenrirChargeRemaining ?? 0) <= 0) {
              enemy.fenrirCharging = false;
              enemy.fenrirChargeRemaining = 0;
            }
          } else if (enemy.fenrirLeaping) {
            // Leap physics
            enemy.fenrirLeapVY = (enemy.fenrirLeapVY ?? 0) + GRAVITY * 0.8;
            enemy.y += enemy.fenrirLeapVY ?? 0;
            // Move toward target X
            const targetX = enemy.fenrirLeapTargetX ?? odinCX;
            const ex = enemy.x + enemy.w / 2;
            if (ex < targetX - 4) enemy.x += enemy.speed * 2;
            else if (ex > targetX + 4) enemy.x -= enemy.speed * 2;
            // Land on ground
            if (enemy.y >= GROUND_Y - enemy.h) {
              enemy.y = GROUND_Y - enemy.h;
              enemy.fenrirLeaping = false;
              enemy.fenrirLeapVY = 0;
            }
          } else {
            // Normal approach
            const ex = enemy.x + enemy.w / 2;
            const ey = enemy.y + enemy.h / 2;
            if (ex < odinCX - 4) {
              enemy.x += enemy.speed;
              enemy.dir = 1;
            } else if (ex > odinCX + 4) {
              enemy.x -= enemy.speed;
              enemy.dir = -1;
            }
            if (ey < odinCY - 4) enemy.y += enemy.speed * 0.5;
            else if (ey > odinCY + 4) enemy.y -= enemy.speed * 0.5;
          }

          enemy.y = Math.max(
            GROUND_Y - CANVAS_H / 2,
            Math.min(GROUND_Y - enemy.h, enemy.y),
          );
          enemy.x = Math.max(-60, Math.min(CANVAS_W + 60 - enemy.w, enemy.x));

          // Fenrir attacks Odin on contact (damage 2)
          if (s.invincibleTimer <= 0) {
            const overlap =
              enemy.x < s.odinX + ODIN_W &&
              enemy.x + enemy.w > s.odinX &&
              enemy.y < s.odinY + ODIN_H &&
              enemy.y + enemy.h > s.odinY;
            if (overlap) {
              enemy.attackTimer += dt;
              if (enemy.attackTimer >= 800) {
                enemy.attackTimer = 0;
                s.lives -= 2;
                s.invincibleTimer = INVINCIBLE_DURATION;
                if (s.lives <= 0) {
                  s.lives = 0;
                  s.over = true;
                  s.running = false;
                  const finalScore = s.score;
                  setScore(finalScore);
                  if (!s.submitted) {
                    s.submitted = true;
                    submitScoreRef.current(finalScore);
                  }
                  playGameOver();
                  setUiState("gameover");
                  return;
                }
              }
            } else {
              enemy.attackTimer = 0;
            }
          }
        } else {
          // Normal enemy movement
          const ex = enemy.x + enemy.w / 2;
          const ey = enemy.y + enemy.h / 2;
          if (ex < odinCX - 4) {
            enemy.x += enemy.speed;
            enemy.dir = 1;
          } else if (ex > odinCX + 4) {
            enemy.x -= enemy.speed;
            enemy.dir = -1;
          }
          if (ey < odinCY - 4) enemy.y += enemy.speed * 0.5;
          else if (ey > odinCY + 4) enemy.y -= enemy.speed * 0.5;
          enemy.y = Math.max(
            GROUND_Y - CANVAS_H / 2,
            Math.min(GROUND_Y - enemy.h, enemy.y),
          );

          // Enemy attacks Odin on contact
          if (s.invincibleTimer <= 0) {
            const overlap =
              enemy.x < s.odinX + ODIN_W &&
              enemy.x + enemy.w > s.odinX &&
              enemy.y < s.odinY + ODIN_H &&
              enemy.y + enemy.h > s.odinY;
            if (overlap) {
              enemy.attackTimer += dt;
              if (enemy.attackTimer >= 800) {
                enemy.attackTimer = 0;
                s.lives--;
                s.invincibleTimer = INVINCIBLE_DURATION;
                if (s.lives <= 0) {
                  s.over = true;
                  s.running = false;
                  const finalScore = s.score;
                  setScore(finalScore);
                  if (!s.submitted) {
                    s.submitted = true;
                    submitScoreRef.current(finalScore);
                  }
                  playGameOver();
                  setUiState("gameover");
                  return;
                }
              }
            } else {
              enemy.attackTimer = 0;
            }
          }
        }

        // Player attack hits enemies
        if (s.attacking) {
          const attackX = s.facingLeft
            ? s.odinX - ATTACK_RANGE
            : s.odinX + ODIN_W;
          const attackX2 = s.facingLeft
            ? s.odinX
            : s.odinX + ODIN_W + ATTACK_RANGE;
          const attackY1 = s.odinY - 10;
          const attackY2 = s.odinY + ODIN_H + 10;
          const hit =
            enemy.x < attackX2 &&
            enemy.x + enemy.w > attackX &&
            enemy.y < attackY2 &&
            enemy.y + enemy.h > attackY1;
          if (hit && !enemy.dead) {
            enemy.hp--;
            if (enemy.hp <= 0) {
              enemy.dead = true;
              enemy.deadTimer = 500;
              playEnemyDie();
              if (enemy.type === "fenrir") {
                playBossHit();
                s.score += 200;
                s.fightingFenrir = false;
                s.fenrirDefeatedBannerTimer = 3000;
              } else {
                s.score += enemy.type === "heavy" ? 30 : 10;
              }
              // Drop coin
              s.coins.push({
                x: enemy.x + enemy.w / 2,
                y: enemy.y,
                vy: -3,
                collected: false,
                id: s.nextId++,
              });
            }
          }
        }
      }

      // Remove fully-dead enemies
      s.enemies = s.enemies.filter((e) => !e.dead || e.deadTimer > 0);

      // Update coins
      for (const coin of s.coins) {
        if (coin.collected) continue;
        coin.vy += GRAVITY * 0.4;
        coin.y += coin.vy;
        const groundCoinY = GROUND_Y - 12;
        if (coin.y > groundCoinY) {
          coin.y = groundCoinY;
          coin.vy = 0;
        }
        // Collect if Odin touches
        if (
          coin.x > s.odinX - 20 &&
          coin.x < s.odinX + ODIN_W + 20 &&
          coin.y > s.odinY - 20 &&
          coin.y < s.odinY + ODIN_H + 20
        ) {
          coin.collected = true;
          s.score += 5;
        }
      }
      s.coins = s.coins.filter((c) => !c.collected || c.vy !== 0);
      s.coins = s.coins.filter((c) => !c.collected);

      // Check wave cleared
      const aliveEnemies = s.enemies.filter((e) => !e.dead);
      if (aliveEnemies.length === 0 && !s.waveCleared) {
        s.waveCleared = true;
        s.waveClearTimer = 2000;
      }

      // ====== DRAW ======
      const W = canvas.width;
      const H = canvas.height;

      // Background image (draw first, full canvas)
      if (bgImgRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(bgImgRef.current, 0, 0, W, H);
        ctx.restore();
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#1a3a6e");
        grad.addColorStop(1, "#0d1f3c");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Dark overlay for gameplay readability
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Extra purple/storm tint when fighting Fenrir
      if (s.fightingFenrir) {
        ctx.save();
        const pulseAlpha = 0.08 + 0.06 * Math.sin(now * 0.002);
        ctx.fillStyle = `rgba(80, 40, 140, ${pulseAlpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // Ground
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
      groundGrad.addColorStop(0, "#2a4a1a");
      groundGrad.addColorStop(1, "#1a2e0f");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

      // Ground line
      ctx.strokeStyle = s.fightingFenrir ? "#8844ff" : "#4a8a2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();

      // Draw coins
      for (const coin of s.coins) drawCoin(ctx, coin);

      // Draw enemies
      for (const enemy of s.enemies) drawEnemy(ctx, enemy, now);

      // Laser warning HUD
      const laserWarningEnemy = s.enemies.find(
        (e) => e.type === "fenrir" && !e.dead && e.fenrirLaserWarning,
      );
      if (laserWarningEnemy) {
        ctx.save();
        ctx.font = `bold ${Math.round(W * 0.06)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff6600";
        ctx.shadowColor = "#ff2200";
        ctx.shadowBlur = 20;
        ctx.fillText("⚡ LASER! JUMP! ⚡", W / 2, H * 0.15);
        ctx.restore();
      }

      // Draw Odin
      drawOdin(
        ctx,
        s.odinX,
        s.odinY,
        s.facingLeft,
        s.attacking,
        s.attackTimer,
        s.invincibleTimer > 0,
        s.fightingFenrir,
      );

      // Draw lightning particles
      for (const lp of s.lightningParticles) {
        drawLightningBolt(ctx, lp);
      }

      // Fenrir intro banner
      if (s.fenrirIntroTimer > 0) {
        const bannerAlpha = Math.min(1, s.fenrirIntroTimer / 500);
        ctx.save();
        ctx.globalAlpha = bannerAlpha;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, H / 2 - 60, W, 120);
        ctx.shadowColor = "#aa44ff";
        ctx.shadowBlur = 30;
        ctx.fillStyle = "#FFD700";
        ctx.font = `bold ${Math.round(W * 0.065)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚡ FENRIR APPEARS! ⚡", W / 2, H / 2 - 10);
        ctx.shadowColor = "#ffaa00";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#cc88ff";
        ctx.font = `bold ${Math.round(W * 0.028)}px sans-serif`;
        ctx.fillText("The Giant Wolf of Odin!", W / 2, H / 2 + 30);
        ctx.restore();
      }

      // Fenrir defeated banner
      if (s.fenrirDefeatedBannerTimer > 0) {
        const bannerAlpha = Math.min(1, s.fenrirDefeatedBannerTimer / 500);
        ctx.save();
        ctx.globalAlpha = bannerAlpha;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, H / 2 - 50, W, 100);
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 40;
        ctx.fillStyle = "#FFD700";
        ctx.font = `bold ${Math.round(W * 0.058)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚡ FENRIR DEFEATED! ⚡", W / 2, H / 2);
        ctx.restore();
      }

      // Wave clear banner
      if (s.waveCleared) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, H / 2 - 40, W, 80);
        ctx.fillStyle = "#FFD700";
        ctx.font = `bold ${Math.round(W * 0.06)}px 'Bricolage Grotesque', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          s.wave < s.totalWaves
            ? `Wave ${s.wave} Cleared! Next Wave...`
            : "Final Wave Cleared!",
          W / 2,
          H / 2,
        );
        ctx.restore();
      }

      // HUD
      const hudH = 44;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, hudH);

      // Lives
      const livesDisplay = Math.max(0, s.lives);
      ctx.font = `${Math.round(W * 0.025)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("❤️".repeat(livesDisplay), 12, hudH / 2);

      // Score
      ctx.font = `bold ${Math.round(W * 0.028)}px 'Figtree', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`SCORE: ${s.score}`, W / 2, hudH / 2 - 6);
      ctx.font = `${Math.round(W * 0.022)}px sans-serif`;
      ctx.fillStyle = s.fightingFenrir ? "#cc88ff" : "#aaddff";
      ctx.fillText(
        s.fightingFenrir
          ? `⚡ WAVE ${s.wave}/${s.totalWaves} — BOSS ⚡`
          : `WAVE ${s.wave}/${s.totalWaves}`,
        W / 2,
        hudH / 2 + 10,
      );

      // Token price
      ctx.font = `bold ${Math.round(W * 0.022)}px sans-serif`;
      ctx.textAlign = "right";
      ctx.fillStyle = "#ff9900";
      ctx.fillText(`ODINMARIO ${tokenPriceRef.current} sats`, W - 12, hudH / 2);

      // Boss HP bar at top during Fenrir fight
      const fenrirEnemy = s.enemies.find((e) => e.type === "fenrir" && !e.dead);
      if (fenrirEnemy && s.fightingFenrir) {
        const bossBarW = W * 0.5;
        const bossBarX = (W - bossBarW) / 2;
        const bossBarY = hudH + 4;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(bossBarX - 2, bossBarY, bossBarW + 4, 18);
        ctx.fillStyle = "#880000";
        ctx.fillRect(
          bossBarX,
          bossBarY + 2,
          bossBarW * (fenrirEnemy.hp / fenrirEnemy.maxHp),
          14,
        );
        ctx.fillStyle = "#ff2200";
        ctx.fillRect(
          bossBarX,
          bossBarY + 2,
          bossBarW * (fenrirEnemy.hp / fenrirEnemy.maxHp) * 0.5,
          7,
        );
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bossBarX - 2, bossBarY, bossBarW + 4, 18);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(W * 0.022)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(
          `⚡ FENRIR ⚡  ${fenrirEnemy.hp} / ${fenrirEnemy.maxHp}`,
          W / 2,
          bossBarY + 13,
        );
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState]);

  // Canvas resize — only runs when playing (canvas is in DOM)
  useEffect(() => {
    if (uiState !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h > 0 ? h : Math.round((w * CANVAS_H) / CANVAS_W)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [uiState]);

  const mobileAttack = () => {
    stateRef.current.attacking = true;
    stateRef.current.attackTimer = ATTACK_DURATION;
  };

  const mobilePress = (dir: string, val: boolean) => {
    const s = stateRef.current;
    if (dir === "left") s.moveLeft = val;
    if (dir === "right") s.moveRight = val;
    if (dir === "up") s.moveUp = val;
    if (dir === "down") s.moveDown = val;
    if (val) {
      if (dir === "left") {
        keysRef.current.add("ArrowLeft");
        s.facingLeft = true;
      } else keysRef.current.delete("ArrowLeft");
      if (dir === "right") {
        keysRef.current.add("ArrowRight");
        s.facingLeft = false;
      } else if (dir !== "left") keysRef.current.delete("ArrowRight");
      if (dir === "up") keysRef.current.add("ArrowUp");
      else keysRef.current.delete("ArrowUp");
      if (dir === "down") keysRef.current.add("ArrowDown");
      else keysRef.current.delete("ArrowDown");
    } else {
      keysRef.current.delete(
        `Arrow${dir.charAt(0).toUpperCase()}${dir.slice(1)}`,
      );
    }
  };

  const dpadBtn = (label: string, dir: string) => (
    <button
      type="button"
      onPointerDown={() => mobilePress(dir, true)}
      onPointerUp={() => mobilePress(dir, false)}
      onPointerLeave={() => mobilePress(dir, false)}
      style={{
        width: 52,
        height: 52,
        background: "rgba(255,255,255,0.15)",
        border: "2px solid rgba(255,255,255,0.4)",
        borderRadius: 10,
        color: "#fff",
        fontSize: 22,
        fontWeight: 900,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );

  // Start screen
  if (uiState === "start") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #0a1a3a 0%, #1a0a2e 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "'Bricolage Grotesque', sans-serif",
        }}
      >
        <button
          type="button"
          data-ocid="warrior.button"
          onClick={onBack}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "sans-serif",
            fontSize: 14,
            zIndex: 100,
          }}
        >
          🏠 Home
        </button>
        <div style={{ fontSize: 72, marginBottom: 8 }}>⚔️</div>
        <h1
          style={{
            color: "#FFD700",
            fontSize: "clamp(28px, 6vw, 52px)",
            fontWeight: 900,
            letterSpacing: 4,
            margin: "0 0 8px",
            textShadow:
              "0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,165,0,0.5)",
            textAlign: "center",
          }}
        >
          ODIN WARRIOR
        </h1>
        <p
          style={{
            color: "#aac",
            fontSize: 16,
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          Fight waves of enemies — face Fenrir in Wave 4!
        </p>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,215,0,0.3)",
            borderRadius: 14,
            padding: "16px 24px",
            marginBottom: 32,
            maxWidth: 340,
            width: "100%",
          }}
        >
          <p
            style={{
              color: "#FFD700",
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            CONTROLS
          </p>
          <div style={{ color: "#ccc", fontSize: 13, lineHeight: 1.8 }}>
            <div>🕹️ Arrow Keys / WASD — Move</div>
            <div>⚔️ Z / F — Attack</div>
            <div>📱 Mobile: D-Pad + ATTACK button</div>
            <div style={{ color: "#aa88ff", marginTop: 6 }}>
              ⚡ Wave 4: Fenrir Boss — lightning sword!
            </div>
          </div>
        </div>
        <button
          type="button"
          data-ocid="warrior.primary_button"
          onClick={handlePlay}
          style={{
            background: "linear-gradient(135deg, #FFD700, #ff8800)",
            color: "#1a0a00",
            border: "none",
            borderRadius: 12,
            padding: "16px 56px",
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 2,
            cursor: "pointer",
            boxShadow: "0 0 30px rgba(255,180,0,0.6)",
          }}
        >
          ▶ PLAY
        </button>
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: 11,
            marginTop: 40,
            textAlign: "center",
          }}
        >
          Built by ODINMARIO
        </p>
      </div>
    );
  }

  if (uiState === "username") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #0a1a3a 0%, #1a0a2e 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <button
          type="button"
          data-ocid="warrior.close_button"
          onClick={onBack}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "sans-serif",
            fontSize: 14,
            zIndex: 100,
          }}
        >
          🏠 Home
        </button>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "2px solid rgba(255,215,0,0.5)",
            borderRadius: 18,
            padding: 32,
            maxWidth: 340,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p
            style={{
              color: "#FFD700",
              fontFamily: "'Bricolage Grotesque',sans-serif",
              fontWeight: 900,
              fontSize: 20,
              marginBottom: 8,
            }}
          >
            Enter Your Name
          </p>
          <p style={{ color: "#aac", fontSize: 13, marginBottom: 20 }}>
            Your name will appear on the leaderboard
          </p>
          <input
            data-ocid="warrior.input"
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUsernameSubmit();
            }}
            placeholder="Your warrior name..."
            maxLength={20}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "2px solid rgba(255,215,0,0.4)",
              background: "rgba(0,0,0,0.4)",
              color: "#fff",
              fontSize: 16,
              fontFamily: "sans-serif",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            data-ocid="warrior.submit_button"
            onClick={handleUsernameSubmit}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #FFD700, #ff8800)",
              color: "#1a0a00",
              border: "none",
              borderRadius: 10,
              padding: "12px",
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            START GAME
          </button>
        </div>
      </div>
    );
  }

  if (uiState === "gameover" || uiState === "victory") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #0a1a3a 0%, #1a0a2e 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "'Bricolage Grotesque', sans-serif",
        }}
      >
        <button
          type="button"
          data-ocid="warrior.close_button"
          onClick={onBack}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "sans-serif",
            fontSize: 14,
            zIndex: 100,
          }}
        >
          🏠 Home
        </button>
        <div style={{ fontSize: 64, marginBottom: 12 }}>
          {uiState === "victory" ? "🏆" : "💀"}
        </div>
        <h2
          style={{
            color: uiState === "victory" ? "#FFD700" : "#ff4444",
            fontSize: 36,
            fontWeight: 900,
            margin: "0 0 8px",
            textShadow:
              uiState === "victory" ? "0 0 20px rgba(255,215,0,0.8)" : "none",
          }}
        >
          {uiState === "victory" ? "VICTORY!" : "GAME OVER"}
        </h2>
        <p style={{ color: "#aac", fontSize: 16, marginBottom: 24 }}>
          Score: <strong style={{ color: "#FFD700" }}>{score}</strong>
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 32,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            data-ocid="warrior.primary_button"
            onClick={handlePlay}
            style={{
              background: "linear-gradient(135deg, #FFD700, #ff8800)",
              color: "#1a0a00",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <button
            type="button"
            data-ocid="warrior.secondary_button"
            onClick={() => {
              fetchLeaderboard();
              setUiState("leaderboard");
            }}
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#FFD700",
              border: "2px solid #FFD700",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🏆 LEADERBOARD
          </button>
          <button
            type="button"
            data-ocid="warrior.cancel_button"
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#aac",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            🏠 Home
          </button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
          Built by ODINMARIO
        </p>
      </div>
    );
  }

  if (uiState === "leaderboard") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #0a1a3a 0%, #1a0a2e 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "'Bricolage Grotesque', sans-serif",
        }}
      >
        <button
          type="button"
          data-ocid="warrior.close_button"
          onClick={onBack}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "sans-serif",
            fontSize: 14,
            zIndex: 100,
          }}
        >
          🏠 Home
        </button>
        <h2
          style={{
            color: "#FFD700",
            fontSize: 28,
            fontWeight: 900,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          🏆 LEADERBOARD
        </h2>
        <div style={{ width: "100%", maxWidth: 400 }}>
          {leaderboard.length === 0 ? (
            <p
              data-ocid="warrior.empty_state"
              style={{ color: "#aac", textAlign: "center" }}
            >
              No scores yet. Be the first!
            </p>
          ) : (
            leaderboard.map((entry, i) => (
              <div
                key={`${entry.name}-${entry.score}-${i}`}
                data-ocid={`warrior.item.${i + 1}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background:
                    i === 0 ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.05)",
                  border:
                    i === 0
                      ? "1px solid rgba(255,215,0,0.4)"
                      : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    color: i === 0 ? "#FFD700" : "#aac",
                    fontWeight: 700,
                  }}
                >
                  {i + 1}. {entry.name}
                </span>
                <span style={{ color: "#FFD700", fontWeight: 900 }}>
                  {entry.score}
                </span>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          data-ocid="warrior.secondary_button"
          onClick={handlePlay}
          style={{
            marginTop: 24,
            background: "linear-gradient(135deg, #FFD700, #ff8800)",
            color: "#1a0a00",
            border: "none",
            borderRadius: 10,
            padding: "12px 32px",
            fontSize: 16,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ▶ PLAY AGAIN
        </button>
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: 11,
            marginTop: 20,
          }}
        >
          Built by ODINMARIO
        </p>
      </div>
    );
  }

  // Playing state
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "unset",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <button
        type="button"
        data-ocid="warrior.button"
        onClick={onBack}
        style={{
          position: "fixed",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 8,
          padding: "6px 12px",
          cursor: "pointer",
          fontFamily: "sans-serif",
          fontSize: 13,
          zIndex: 200,
        }}
      >
        🏠 Home
      </button>
      <div
        data-ocid="warrior.canvas_target"
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "stretch",
          minHeight: 0,
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
      </div>
      {isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px 20px 24px",
            background: "rgba(0,0,0,0.8)",
            flexShrink: 0,
          }}
        >
          {/* D-pad */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "52px 52px 52px",
              gridTemplateRows: "52px 52px 52px",
              gap: 4,
            }}
          >
            <div />
            {dpadBtn("▲", "up")}
            <div />
            {dpadBtn("◀", "left")}
            <div />
            {dpadBtn("▶", "right")}
            <div />
            {dpadBtn("▼", "down")}
            <div />
          </div>
          {/* Attack button */}
          <button
            type="button"
            data-ocid="warrior.primary_button"
            onPointerDown={mobileAttack}
            style={{
              width: 80,
              height: 80,
              background: "linear-gradient(135deg, #ff6600, #ff3300)",
              border: "3px solid #FFD700",
              borderRadius: "50%",
              color: "#fff",
              fontSize: 28,
              fontWeight: 900,
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(255,100,0,0.6)",
            }}
          >
            ⚔️
          </button>
        </div>
      )}
      <p
        style={{
          color: "rgba(255,255,255,0.2)",
          fontSize: 11,
          padding: "4px 8px",
          textAlign: "center",
          flexShrink: 0,
          margin: 0,
        }}
      >
        Built by ODINMARIO
      </p>
    </div>
  );
}
