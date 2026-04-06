import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onBack: () => void;
}

const CANVAS_W = 800;
const CANVAS_H = 450;
const GROUND_Y = 370;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const MOVE_SPEED = 4;
const MAX_HP = 100;
const LIGHT_DAMAGE = 10;
const HEAVY_DAMAGE = 25;
const HEAVY_COOLDOWN = 2000;
const INVINCIBLE_DURATION = 500;
const KNOCKBACK = 7;

const PLATFORMS = [
  { x: 200, y: 280, w: 140, h: 16 },
  { x: 460, y: 280, w: 140, h: 16 },
  { x: 330, y: 200, w: 140, h: 16 },
];

type Phase = "countdown" | "fight" | "roundover" | "matchover";

interface Fighter {
  x: number;
  y: number;
  vy: number;
  hp: number;
  facing: 1 | -1;
  isJumping: boolean;
  attackTimer: number; // frames
  attackType: "none" | "light" | "heavy";
  invTimer: number; // ms
  heavyCooldownEnd: number; // ms
  wins: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  owner: 0 | 1;
  r: number;
}

function getStoredWallet(): string | null {
  try {
    const s = localStorage.getItem("odinmario_wallet");
    if (!s) return null;
    const parsed = JSON.parse(s);
    return parsed?.address ?? null;
  } catch {
    return null;
  }
}

function truncate(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

const audioCtx: AudioContext | null = (() => {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
})();

function playSound(type: "jump" | "hit" | "heavy" | "ko" | "start") {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const o = ctx.createOscillator();
  o.connect(g);
  const now = ctx.currentTime;
  switch (type) {
    case "jump":
      o.frequency.setValueAtTime(300, now);
      o.frequency.exponentialRampToValueAtTime(600, now + 0.1);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now);
      o.stop(now + 0.15);
      break;
    case "hit":
      o.type = "sawtooth";
      o.frequency.setValueAtTime(200, now);
      o.frequency.exponentialRampToValueAtTime(80, now + 0.08);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      o.start(now);
      o.stop(now + 0.1);
      break;
    case "heavy":
      o.type = "sawtooth";
      o.frequency.setValueAtTime(400, now);
      o.frequency.exponentialRampToValueAtTime(50, now + 0.2);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      o.start(now);
      o.stop(now + 0.25);
      break;
    case "ko":
      o.type = "square";
      o.frequency.setValueAtTime(440, now);
      o.frequency.setValueAtTime(220, now + 0.15);
      o.frequency.setValueAtTime(110, now + 0.3);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      o.start(now);
      o.stop(now + 0.6);
      break;
    case "start":
      o.type = "square";
      o.frequency.setValueAtTime(523, now);
      o.frequency.setValueAtTime(659, now + 0.1);
      o.frequency.setValueAtTime(784, now + 0.2);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      o.start(now);
      o.stop(now + 0.4);
      break;
  }
}

function makeFighter(x: number, facing: 1 | -1, wins: number): Fighter {
  return {
    x,
    y: GROUND_Y - 60,
    vy: 0,
    hp: MAX_HP,
    facing,
    isJumping: false,
    attackTimer: 0,
    attackType: "none",
    invTimer: 0,
    heavyCooldownEnd: 0,
    wins,
  };
}

export default function PvPFighting({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [round, setRound] = useState(1);
  const [announcement, setAnnouncement] = useState("ROUND 1");
  const [wins, setWins] = useState([0, 0]);
  const [isMobile, setIsMobile] = useState(false);

  const stateRef = useRef<{
    f: [Fighter, Fighter];
    projectiles: Projectile[];
    keys: Set<string>;
    phase: Phase;
    round: number;
    wins: [number, number];
    lastTime: number;
    animId: number;
    p1Name: string;
    p2Name: string;
    mobileInput: {
      p1: {
        left: boolean;
        right: boolean;
        jump: boolean;
        light: boolean;
        heavy: boolean;
      };
      p2: {
        left: boolean;
        right: boolean;
        jump: boolean;
        light: boolean;
        heavy: boolean;
      };
    };
  }>({
    f: [makeFighter(140, 1, 0), makeFighter(660, -1, 0)],
    projectiles: [],
    keys: new Set(),
    phase: "countdown",
    round: 1,
    wins: [0, 0],
    lastTime: 0,
    animId: 0,
    p1Name: "",
    p2Name: "PLAYER 2",
    mobileInput: {
      p1: {
        left: false,
        right: false,
        jump: false,
        light: false,
        heavy: false,
      },
      p2: {
        left: false,
        right: false,
        jump: false,
        light: false,
        heavy: false,
      },
    },
  });

  // Init player names
  useEffect(() => {
    const wallet = getStoredWallet();
    stateRef.current.p1Name = wallet ? truncate(wallet) : "PLAYER 1";
    setIsMobile(
      /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
        window.innerWidth <= 768,
    );
  }, []);

  // Key handlers
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      stateRef.current.keys.add(e.key.toLowerCase());
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(
          e.key.toLowerCase(),
        )
      ) {
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) =>
      stateRef.current.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const startRound = useCallback((r: number, w: [number, number]) => {
    const s = stateRef.current;
    s.f = [makeFighter(140, 1, w[0]), makeFighter(660, -1, w[1])];
    s.f[0].wins = w[0];
    s.f[1].wins = w[1];
    s.projectiles = [];
    s.phase = "countdown";
    s.round = r;
    s.wins = w;
    setRound(r);
    setWins([...w]);
    setAnnouncement(`ROUND ${r}`);
    setPhase("countdown");
    playSound("start");
    setTimeout(() => {
      stateRef.current.phase = "fight";
      setPhase("fight");
      setAnnouncement("FIGHT!");
      setTimeout(() => setAnnouncement(""), 900);
    }, 1500);
  }, []);

  useEffect(() => {
    startRound(1, [0, 0]);
  }, [startRound]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    function onPlatform(f: Fighter): boolean {
      for (const p of PLATFORMS) {
        if (
          f.vy >= 0 &&
          f.x + 18 > p.x &&
          f.x - 18 < p.x + p.w &&
          f.y + 60 >= p.y &&
          f.y + 60 <= p.y + p.h + Math.abs(f.vy) + 2
        ) {
          return true;
        }
      }
      return false;
    }

    function landOnPlatform(f: Fighter) {
      for (const p of PLATFORMS) {
        if (
          f.vy >= 0 &&
          f.x + 18 > p.x &&
          f.x - 18 < p.x + p.w &&
          f.y + 60 >= p.y &&
          f.y + 60 <= p.y + p.h + Math.abs(f.vy) + 2
        ) {
          f.y = p.y - 60;
          f.vy = 0;
          f.isJumping = false;
          return;
        }
      }
    }

    function update(dt: number) {
      const s = stateRef.current;
      if (s.phase !== "fight") return;

      const now = Date.now();
      const keys = s.keys;
      const mi = s.mobileInput;

      for (let i = 0; i < 2; i++) {
        const f = s.f[i];
        const other = s.f[1 - i];

        // Invincibility
        if (f.invTimer > 0) f.invTimer -= dt;

        // Attack timer
        if (f.attackTimer > 0) {
          f.attackTimer -= 1;
          if (f.attackTimer === 0) f.attackType = "none";
        }

        // Input
        let moveLeft = false;
        let moveRight = false;
        let jump = false;
        let lightAtk = false;
        let heavyAtk = false;

        if (i === 0) {
          moveLeft = keys.has("a") || mi.p1.left;
          moveRight = keys.has("d") || mi.p1.right;
          jump = keys.has("w") || mi.p1.jump;
          lightAtk = keys.has("j") || mi.p1.light;
          heavyAtk = keys.has("k") || mi.p1.heavy;
        } else {
          moveLeft = keys.has("arrowleft") || mi.p2.left;
          moveRight = keys.has("arrowright") || mi.p2.right;
          jump = keys.has("arrowup") || mi.p2.jump;
          lightAtk = keys.has(",") || mi.p2.light;
          heavyAtk = keys.has(".") || mi.p2.heavy;
        }

        // Move
        if (moveLeft) {
          f.x -= MOVE_SPEED;
          f.facing = -1;
        }
        if (moveRight) {
          f.x += MOVE_SPEED;
          f.facing = 1;
        }
        f.x = Math.max(20, Math.min(CANVAS_W - 20, f.x));

        // Jump
        if (jump && !f.isJumping) {
          f.vy = JUMP_FORCE;
          f.isJumping = true;
          playSound("jump");
        }

        // Gravity
        f.vy += GRAVITY;

        // Platform collision
        f.y += f.vy;

        // Ground
        if (f.y >= GROUND_Y - 60) {
          f.y = GROUND_Y - 60;
          f.vy = 0;
          f.isJumping = false;
        } else {
          // Check platforms only going down
          if (onPlatform(f)) {
            landOnPlatform(f);
          }
        }

        // Light attack
        if (lightAtk && f.attackTimer === 0 && f.attackType === "none") {
          f.attackType = "light";
          f.attackTimer = 14;
          playSound("hit");
          // Check hit
          const reach = 55;
          const dx = other.x - f.x;
          if (
            Math.abs(dx) < reach &&
            Math.abs(other.y - f.y) < 50 &&
            other.invTimer <= 0
          ) {
            other.hp = Math.max(0, other.hp - LIGHT_DAMAGE);
            other.invTimer = INVINCIBLE_DURATION;
            other.x += KNOCKBACK * Math.sign(dx || 1);
          }
        }

        // Heavy/fireball
        if (
          heavyAtk &&
          f.attackTimer === 0 &&
          f.attackType === "none" &&
          now >= f.heavyCooldownEnd
        ) {
          f.attackType = "heavy";
          f.attackTimer = 18;
          f.heavyCooldownEnd = now + HEAVY_COOLDOWN;
          playSound("heavy");
          s.projectiles.push({
            x: f.x + f.facing * 30,
            y: f.y + 20,
            vx: f.facing * 9,
            owner: i as 0 | 1,
            r: 8,
          });
        }
      }

      // Projectiles
      s.projectiles = s.projectiles.filter((p) => p.x > 0 && p.x < CANVAS_W);
      for (const proj of s.projectiles) {
        proj.x += proj.vx;
        const other = s.f[1 - proj.owner];
        const dx = proj.x - other.x;
        const dy = proj.y - (other.y + 20);
        if (Math.sqrt(dx * dx + dy * dy) < 24 && other.invTimer <= 0) {
          other.hp = Math.max(0, other.hp - HEAVY_DAMAGE);
          other.invTimer = INVINCIBLE_DURATION;
          other.x += KNOCKBACK * Math.sign(dx || 1);
          proj.x = -999; // mark for removal
        }
      }

      // Face each other
      const [f0, f1] = s.f;
      if (f0.attackType === "none") f0.facing = f1.x > f0.x ? 1 : -1;
      if (f1.attackType === "none") f1.facing = f0.x < f1.x ? -1 : 1;

      // Check KO
      if (f0.hp <= 0 || f1.hp <= 0) {
        s.phase = "roundover";
        setPhase("roundover");
        const winner = f0.hp <= 0 ? 1 : 0;
        const newWins: [number, number] = [s.wins[0], s.wins[1]];
        newWins[winner] += 1;
        s.wins = newWins;
        setWins([...newWins]);
        playSound("ko");
        setAnnouncement("KO!");

        if (newWins[0] >= 2 || newWins[1] >= 2) {
          setTimeout(() => {
            s.phase = "matchover";
            setPhase("matchover");
            setAnnouncement(`P${winner + 1} WINS!`);
          }, 1500);
        } else {
          setTimeout(() => {
            const nextRound = s.round + 1;
            startRound(nextRound, newWins);
          }, 2000);
        }
      }
    }

    function drawBackground(c: CanvasRenderingContext2D) {
      // Sky gradient
      const sky = c.createLinearGradient(0, 0, 0, CANVAS_H);
      sky.addColorStop(0, "#5c94fc");
      sky.addColorStop(0.6, "#87ceeb");
      sky.addColorStop(1, "#a0d8ef");
      c.fillStyle = sky;
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Clouds
      c.fillStyle = "rgba(255,255,255,0.9)";
      for (const [cx, cy, sc] of [
        [80, 60, 1.2],
        [220, 40, 0.9],
        [500, 70, 1.1],
        [680, 50, 1.0],
      ]) {
        c.save();
        c.translate(cx as number, cy as number);
        c.scale(sc as number, sc as number);
        c.beginPath();
        c.arc(0, 0, 20, 0, Math.PI * 2);
        c.arc(22, -6, 16, 0, Math.PI * 2);
        c.arc(40, 0, 20, 0, Math.PI * 2);
        c.arc(20, 6, 18, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // Background hills
      c.fillStyle = "#4caf50";
      c.beginPath();
      c.ellipse(150, GROUND_Y + 30, 120, 60, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(650, GROUND_Y + 20, 100, 50, 0, 0, Math.PI * 2);
      c.fill();

      // Ground
      c.fillStyle = "#5a9e2f";
      c.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
      // Ground detail line
      c.fillStyle = "#3d7a1e";
      c.fillRect(0, GROUND_Y, CANVAS_W, 6);
      // Ground stripe pattern
      c.fillStyle = "rgba(0,0,0,0.07)";
      for (let gx = 0; gx < CANVAS_W; gx += 40) {
        c.fillRect(gx, GROUND_Y + 6, 20, CANVAS_H - GROUND_Y);
      }

      // Platforms - Mario block style
      for (const p of PLATFORMS) {
        // Shadow
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(p.x + 3, p.y + 4, p.w, p.h);
        // Main
        c.fillStyle = "#e88a1a";
        c.fillRect(p.x, p.y, p.w, p.h);
        // Top highlight
        c.fillStyle = "#f4aa40";
        c.fillRect(p.x, p.y, p.w, 4);
        // Block dividers
        c.fillStyle = "rgba(0,0,0,0.15)";
        for (let bx = p.x; bx < p.x + p.w; bx += 20) {
          c.fillRect(bx, p.y, 2, p.h);
        }
        // Question mark pattern on middle block
        const mid = p.x + Math.floor(p.w / 2 / 20) * 20;
        c.fillStyle = "#fff";
        c.font = "bold 10px sans-serif";
        c.textAlign = "center";
        c.fillText("?", mid + 10, p.y + 12);
      }
    }

    function drawFighter(c: CanvasRenderingContext2D, f: Fighter, idx: number) {
      const isP1 = idx === 0;
      // Flicker if invincible
      if (f.invTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;

      const x = f.x;
      const y = f.y;
      const sc = f.facing;

      c.save();
      c.translate(x, y);
      c.scale(sc, 1);

      // Shadow
      c.fillStyle = "rgba(0,0,0,0.2)";
      c.beginPath();
      c.ellipse(0, 62, 16, 5, 0, 0, Math.PI * 2);
      c.fill();

      // Body
      const bodyColor = isP1 ? "#e53e3e" : "#38a169";
      const overallsColor = isP1 ? "#2b6cb0" : "#2b6cb0";
      const hatColor = isP1 ? "#e53e3e" : "#38a169";
      const skinColor = "#f6ad55";

      // Legs
      c.fillStyle = overallsColor;
      if (f.isJumping) {
        // legs up
        c.fillRect(-8, 36, 14, 16);
        c.fillRect(2, 38, 14, 14);
      } else {
        c.fillRect(-10, 36, 14, 20);
        c.fillRect(4, 36, 14, 20);
      }

      // Boots
      c.fillStyle = "#7b4a00";
      if (f.isJumping) {
        c.fillRect(-10, 50, 16, 8);
        c.fillRect(4, 52, 16, 6);
      } else {
        c.fillRect(-12, 54, 16, 8);
        c.fillRect(2, 54, 16, 8);
      }

      // Torso
      c.fillStyle = bodyColor;
      c.fillRect(-12, 14, 24, 24);

      // Overalls bib
      c.fillStyle = overallsColor;
      c.fillRect(-8, 16, 16, 16);
      // Buttons
      c.fillStyle = "#f6e05e";
      c.fillRect(-5, 24, 4, 4);
      c.fillRect(1, 24, 4, 4);

      // Head
      c.fillStyle = skinColor;
      c.fillRect(-10, -10, 20, 20);

      // Hat
      c.fillStyle = hatColor;
      c.fillRect(-12, -12, 24, 8); // brim
      c.fillRect(-8, -22, 16, 12); // top

      // Letter on hat
      c.fillStyle = "#fff";
      c.font = "bold 9px 'Arial', sans-serif";
      c.textAlign = "center";
      c.fillText(isP1 ? "M" : "L", 0, -14);

      // Eyes
      c.fillStyle = "#1a1a1a";
      c.fillRect(0, -6, 4, 5); // one eye (facing right side)
      // Nose
      c.fillStyle = "#c97d30";
      c.fillRect(2, -1, 5, 4);

      // Mustache
      c.fillStyle = "#5c3000";
      c.fillRect(-2, 4, 14, 3);
      c.fillRect(2, 7, 8, 2);

      // Attack effect
      if (f.attackType === "light" && f.attackTimer > 6) {
        c.fillStyle = "rgba(255,220,50,0.9)";
        c.beginPath();
        c.arc(24, 20, 12, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.font = "bold 10px sans-serif";
        c.textAlign = "center";
        c.fillText("!", 24, 25);
      }
      if (f.attackType === "heavy" && f.attackTimer > 10) {
        c.fillStyle = "rgba(255,100,20,0.85)";
        c.beginPath();
        c.arc(28, 18, 16, 0, Math.PI * 2);
        c.fill();
        // Fireball lines
        c.strokeStyle = "#ffe066";
        c.lineWidth = 2;
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          c.beginPath();
          c.moveTo(28 + Math.cos(ang) * 10, 18 + Math.sin(ang) * 10);
          c.lineTo(28 + Math.cos(ang) * 20, 18 + Math.sin(ang) * 20);
          c.stroke();
        }
      }

      c.restore();
    }

    function drawProjectile(c: CanvasRenderingContext2D, p: Projectile) {
      const isP1 = p.owner === 0;
      // Outer glow
      c.save();
      c.shadowColor = isP1 ? "#ff4500" : "#00cc66";
      c.shadowBlur = 12;
      const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(0.4, isP1 ? "#ff9900" : "#00ff88");
      grad.addColorStop(1, isP1 ? "#ff2200" : "#00aa44");
      c.fillStyle = grad;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
      // Flame tail
      c.fillStyle = isP1 ? "rgba(255,150,0,0.5)" : "rgba(0,200,100,0.5)";
      c.beginPath();
      c.arc(p.x - p.vx * 1.5, p.y, p.r * 0.6, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    function drawHUD(c: CanvasRenderingContext2D, s: typeof stateRef.current) {
      const [f0, f1] = s.f;
      const BAR_W = 220;
      const BAR_H = 18;

      // P1 HP
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(20, 14, BAR_W + 4, BAR_H + 4);
      c.fillStyle = "#c0392b";
      c.fillRect(22, 16, BAR_W, BAR_H);
      const p1pct = f0.hp / MAX_HP;
      const hpColor1 =
        p1pct > 0.5 ? "#2ecc71" : p1pct > 0.25 ? "#f39c12" : "#e74c3c";
      c.fillStyle = hpColor1;
      c.fillRect(22, 16, BAR_W * p1pct, BAR_H);
      c.fillStyle = "#fff";
      c.font = "bold 10px 'Press Start 2P', monospace";
      c.textAlign = "left";
      c.fillText(s.p1Name, 22, 50);
      // Win dots P1
      for (let i = 0; i < 2; i++) {
        c.fillStyle = i < f0.wins ? "#f1c40f" : "rgba(255,255,255,0.2)";
        c.beginPath();
        c.arc(22 + i * 16, 62, 6, 0, Math.PI * 2);
        c.fill();
      }

      // P2 HP
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(CANVAS_W - BAR_W - 24, 14, BAR_W + 4, BAR_H + 4);
      c.fillStyle = "#c0392b";
      c.fillRect(CANVAS_W - BAR_W - 22, 16, BAR_W, BAR_H);
      const p2pct = f1.hp / MAX_HP;
      const hpColor2 =
        p2pct > 0.5 ? "#2ecc71" : p2pct > 0.25 ? "#f39c12" : "#e74c3c";
      c.fillStyle = hpColor2;
      c.fillRect(
        CANVAS_W - BAR_W - 22 + BAR_W * (1 - p2pct),
        16,
        BAR_W * p2pct,
        BAR_H,
      );
      c.fillStyle = "#fff";
      c.font = "bold 10px 'Press Start 2P', monospace";
      c.textAlign = "right";
      c.fillText(s.p2Name, CANVAS_W - 22, 50);
      // Win dots P2
      for (let i = 0; i < 2; i++) {
        c.fillStyle = i < f1.wins ? "#f1c40f" : "rgba(255,255,255,0.2)";
        c.beginPath();
        c.arc(CANVAS_W - 22 - i * 16, 62, 6, 0, Math.PI * 2);
        c.fill();
      }

      // Round indicator
      c.fillStyle = "rgba(0,0,0,0.5)";
      c.fillRect(CANVAS_W / 2 - 50, 10, 100, 24);
      c.fillStyle = "#ffe066";
      c.font = "bold 11px 'Press Start 2P', monospace";
      c.textAlign = "center";
      c.fillText(`ROUND ${s.round}`, CANVAS_W / 2, 26);

      // HP numbers
      c.fillStyle = "#fff";
      c.font = "bold 9px monospace";
      c.textAlign = "left";
      c.fillText(`${f0.hp}HP`, 22, 12);
      c.textAlign = "right";
      c.fillText(`${f1.hp}HP`, CANVAS_W - 22, 12);
    }

    let lastTime = performance.now();

    function loop(ts: number) {
      const dt = Math.min(ts - lastTime, 33);
      lastTime = ts;

      const s = stateRef.current;
      ctx!.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawBackground(ctx!);

      update(dt);

      // Draw fighters
      for (const proj of s.projectiles) drawProjectile(ctx!, proj);
      drawFighter(ctx!, s.f[0], 0);
      drawFighter(ctx!, s.f[1], 1);

      drawHUD(ctx!, s);

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    stateRef.current.animId = animId;

    return () => cancelAnimationFrame(animId);
  }, [startRound]);

  // Draw announcement overlay on separate layer (handled in the loop, but also drive re-render)
  // Reset on keydown if match over
  useEffect(() => {
    const handler = (_e: KeyboardEvent) => {
      if (stateRef.current.phase === "matchover") {
        startRound(1, [0, 0]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startRound]);

  // Overlay announcement draw via React state
  const [overlayText, setOverlayText] = useState("");
  useEffect(() => {
    setOverlayText(announcement);
  }, [announcement]);

  // Mobile button helpers
  function mobilePress(
    player: 0 | 1,
    btn: keyof typeof stateRef.current.mobileInput.p1,
    val: boolean,
  ) {
    const mi = stateRef.current.mobileInput;
    if (player === 0) mi.p1[btn] = val;
    else mi.p2[btn] = val;
  }

  function MobileBtn({
    label,
    player,
    btn,
    color,
  }: {
    label: string;
    player: 0 | 1;
    btn: keyof typeof stateRef.current.mobileInput.p1;
    color?: string;
  }) {
    return (
      <button
        type="button"
        onPointerDown={() => mobilePress(player, btn, true)}
        onPointerUp={() => mobilePress(player, btn, false)}
        onPointerLeave={() => mobilePress(player, btn, false)}
        style={{
          width: 52,
          height: 52,
          borderRadius: 8,
          background: color ?? "rgba(255,255,255,0.15)",
          border: "2px solid rgba(255,255,255,0.4)",
          color: "#fff",
          fontSize: 11,
          fontFamily: "'Press Start 2P', monospace",
          fontWeight: 700,
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
  }

  const matchOverText = phase === "matchover" ? overlayText : "";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 8,
      }}
    >
      {/* Home button */}
      <button
        type="button"
        data-ocid="pvpfighting.close_button"
        onClick={onBack}
        style={{
          position: "fixed",
          top: 10,
          left: 10,
          zIndex: 100,
          background: "rgba(0,0,0,0.6)",
          border: "2px solid rgba(255,255,255,0.3)",
          borderRadius: 8,
          color: "#fff",
          fontSize: 10,
          fontFamily: "'Press Start 2P', monospace",
          padding: "6px 12px",
          cursor: "pointer",
        }}
      >
        🏠 HOME
      </button>

      {/* Title */}
      <div
        style={{
          color: "#ffe066",
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 14,
          textShadow: "2px 2px 0 #c43a00",
          marginBottom: 6,
          marginTop: 10,
        }}
      >
        ⚔️ MARIO FIGHTER 1v1 ⚔️
      </div>

      {/* Controls hint */}
      <div
        style={{
          color: "rgba(255,255,255,0.55)",
          fontSize: 8,
          fontFamily: "'Press Start 2P', monospace",
          marginBottom: 6,
          textAlign: "center",
        }}
      >
        P1: A/D move | W jump | J attack | K fireball &nbsp;&nbsp; P2: ←/→ move
        | ↑ jump | , attack | . fireball
      </div>

      {/* Canvas wrapper */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: CANVAS_W,
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 4,
            boxShadow: "0 0 30px rgba(255,100,0,0.3)",
          }}
        />

        {/* Announcement overlay */}
        {overlayText && phase !== "matchover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: "clamp(28px, 8vw, 48px)",
                fontFamily: "'Press Start 2P', monospace",
                fontWeight: 900,
                color: "#ffe066",
                textShadow: "3px 3px 0 #c43a00, 0 0 20px rgba(255,150,0,0.8)",
                letterSpacing: 2,
              }}
            >
              {overlayText}
            </div>
          </div>
        )}

        {/* Match over overlay */}
        {phase === "matchover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: "clamp(24px, 7vw, 42px)",
                fontFamily: "'Press Start 2P', monospace",
                fontWeight: 900,
                color: "#ffe066",
                textShadow: "3px 3px 0 #c43a00",
              }}
            >
              {matchOverText}
            </div>
            <div
              style={{
                fontSize: "clamp(8px, 2vw, 12px)",
                fontFamily: "'Press Start 2P', monospace",
                color: "#fff",
              }}
            >
              PRESS ANY KEY TO PLAY AGAIN
            </div>
            <button
              type="button"
              data-ocid="pvpfighting.primary_button"
              onClick={() => startRound(1, [0, 0])}
              style={{
                marginTop: 8,
                background: "linear-gradient(180deg, #f97316 0%, #ea580c 100%)",
                border: "3px solid #fff",
                borderRadius: 8,
                color: "#fff",
                fontSize: 10,
                fontFamily: "'Press Start 2P', monospace",
                padding: "10px 20px",
                cursor: "pointer",
                fontWeight: 700,
                textShadow: "1px 1px 0 #7a2800",
                boxShadow: "0 4px 0 #7a2800",
              }}
            >
              🔄 PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Mobile D-Pads */}
      {isMobile && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: CANVAS_W,
            padding: "10px 8px",
            gap: 8,
            marginTop: 4,
          }}
        >
          {/* P1 Controls - left side */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: "#e53e3e",
                fontSize: 8,
                fontFamily: "'Press Start 2P', monospace",
                marginBottom: 2,
              }}
            >
              P1
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <MobileBtn label="◀" player={0} btn="left" />
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <MobileBtn
                  label="▲"
                  player={0}
                  btn="jump"
                  color="rgba(50,150,255,0.25)"
                />
                <div style={{ width: 52, height: 10 }} />
              </div>
              <MobileBtn label="▶" player={0} btn="right" />
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <MobileBtn
                label="ATK"
                player={0}
                btn="light"
                color="rgba(255,200,0,0.25)"
              />
              <MobileBtn
                label="🔥"
                player={0}
                btn="heavy"
                color="rgba(255,80,0,0.25)"
              />
            </div>
          </div>

          {/* Win counters */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                color: "#ffe066",
                fontSize: 8,
                fontFamily: "'Press Start 2P', monospace",
              }}
            >
              ROUND {round}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background:
                        i < wins[0] ? "#f1c40f" : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
              <div style={{ color: "white", fontSize: 10 }}>⚔️</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background:
                        i < wins[1] ? "#f1c40f" : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* P2 Controls - right side */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: "#38a169",
                fontSize: 8,
                fontFamily: "'Press Start 2P', monospace",
                marginBottom: 2,
              }}
            >
              P2
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <MobileBtn label="◀" player={1} btn="left" />
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <MobileBtn
                  label="▲"
                  player={1}
                  btn="jump"
                  color="rgba(50,150,255,0.25)"
                />
                <div style={{ width: 52, height: 10 }} />
              </div>
              <MobileBtn label="▶" player={1} btn="right" />
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <MobileBtn
                label="ATK"
                player={1}
                btn="light"
                color="rgba(255,200,0,0.25)"
              />
              <MobileBtn
                label="🔥"
                player={1}
                btn="heavy"
                color="rgba(255,80,0,0.25)"
              />
            </div>
          </div>
        </div>
      )}

      {/* Built by */}
      <div
        style={{
          color: "rgba(255,255,255,0.25)",
          fontSize: 7,
          fontFamily: "'Press Start 2P', monospace",
          marginTop: 8,
        }}
      >
        Built by ODINMARIO
      </div>
    </div>
  );
}
