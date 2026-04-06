import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";

type GamePhase =
  | "start"
  | "username"
  | "playing"
  | "paused"
  | "gameOver"
  | "leaderboard";

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromPlayer: boolean;
  width: number;
  height: number;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  type: "soldier" | "tank" | "boss";
  vx: number;
  vy: number;
  onGround: boolean;
  shootTimer: number;
  shootInterval: number;
  dead: boolean;
  deadTimer: number;
  facing: number;
  walkFrame: number;
  walkTimer: number;
}

interface Powerup {
  x: number;
  y: number;
  type: "spread" | "rapid";
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ScoreEntry {
  playerName: string;
  score: bigint;
}

const CANVAS_W = 800;
const CANVAS_H = 450;
const HUD_H = 50;
const GROUND_Y = CANVAS_H - 60;
const GRAVITY = 0.5;
const PLAYER_SPEED = 3;
const JUMP_VEL = -12;
const BULLET_SPEED = 8;
const ENEMY_BULLET_SPEED = 4;

export default function Contra({ onBack }: { onBack?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    phase: "start" as GamePhase,
    score: 0,
    lives: 3,
    level: 1,
    wave: 1,
    totalWaves: 5,
    waveCleared: false,
    waveClearTimer: 0,
    levelClearTimer: 0,
    // Player
    px: 100,
    py: GROUND_Y - 40,
    pvx: 0,
    pvy: 0,
    pOnGround: true,
    pFacing: 1,
    pShootDir: { x: 1, y: 0 },
    pInvincible: 0,
    pFlash: false,
    pDead: false,
    pDeadTimer: 0,
    pFrame: 0,
    pFrameTimer: 0,
    // Input
    keys: {} as Record<string, boolean>,
    // Powerup
    spreadShot: false,
    spreadTimer: 0,
    rapidFire: false,
    rapidTimer: 0,
    shootCooldown: 0,
    // Entities
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    powerups: [] as Powerup[],
    particles: [] as Particle[],
    // Background scroll
    bgScroll: 0,
    // HUD
    tokenPrice: "",
    tokenImg: null as HTMLImageElement | null,
    logoImg: null as HTMLImageElement | null,
    // Frame
    frame: 0,
  });

  const [phase, setPhase] = useState<GamePhase>("start");
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const [finalScore, setFinalScore] = useState(0);
  const { actor } = useActor();
  const rafRef = useRef<number>(0);
  const tokenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = "/assets/uploads/19943_11zon-2-1.png";
    img.onload = () => {
      bgImageRef.current = img;
    };
  }, []);

  // Load images
  useEffect(() => {
    const s = stateRef.current;
    const logo = new Image();
    logo.src = "/assets/uploads/19943_11zon-1-1.png";
    logo.onload = () => {
      s.logoImg = logo;
    };
    const token = new Image();
    token.src = "/assets/uploads/19952_11zon-1-1.jpg";
    token.onload = () => {
      s.tokenImg = token;
    };
  }, []);

  const fetchTokenPrice = useCallback(async () => {
    try {
      const res = await fetch("https://api.odin.fun/v1/token/2ip5");
      const json = await res.json();
      const raw = json?.data?.price ?? json?.price ?? 0;
      stateRef.current.tokenPrice = `${(raw / 1000).toFixed(3)} sats`;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTokenPrice();
    tokenIntervalRef.current = setInterval(fetchTokenPrice, 10000);
    return () => {
      if (tokenIntervalRef.current) clearInterval(tokenIntervalRef.current);
    };
  }, [fetchTokenPrice]);

  // Saved username
  useEffect(() => {
    const saved = localStorage.getItem("odinContraUsername") || "";
    setUsername(saved);
  }, []);

  function spawnWave(wave: number, level: number) {
    const s = stateRef.current;
    s.enemies = [];
    s.powerups = [];
    const isBoss = wave === 5;
    if (isBoss) {
      s.enemies.push({
        x: CANVAS_W - 120,
        y: GROUND_Y - 80,
        width: 80,
        height: 80,
        hp: 20,
        maxHp: 20,
        type: "boss",
        vx: -0.5,
        vy: 0,
        onGround: true,
        shootTimer: 0,
        shootInterval: 60,
        dead: false,
        deadTimer: 0,
        facing: -1,
        walkFrame: 0,
        walkTimer: 0,
      });
      return;
    }
    const numSoldiers = 5;
    const numTanks = wave >= 2 ? Math.min(wave - 1, 3) : 0;
    const baseSpeed = 0.8 + level * 0.2 + wave * 0.1;
    for (let i = 0; i < numSoldiers; i++) {
      s.enemies.push({
        x: CANVAS_W + 80 + i * 140,
        y: GROUND_Y - 36,
        width: 24,
        height: 36,
        hp: 1,
        maxHp: 1,
        type: "soldier",
        vx: -(baseSpeed + Math.random() * 0.4),
        vy: 0,
        onGround: true,
        shootTimer: Math.floor(Math.random() * 120),
        shootInterval: Math.max(60, 150 - wave * 10 - level * 10),
        dead: false,
        deadTimer: 0,
        facing: -1,
        walkFrame: 0,
        walkTimer: 0,
      });
    }
    for (let i = 0; i < numTanks; i++) {
      s.enemies.push({
        x: CANVAS_W + 200 + i * 200,
        y: GROUND_Y - 50,
        width: 50,
        height: 50,
        hp: 3,
        maxHp: 3,
        type: "tank",
        vx: -(baseSpeed * 0.5),
        vy: 0,
        onGround: true,
        shootTimer: 40,
        shootInterval: Math.max(40, 90 - wave * 8),
        dead: false,
        deadTimer: 0,
        facing: -1,
        walkFrame: 0,
        walkTimer: 0,
      });
    }
    // Possibly drop a powerup
    if (Math.random() < 0.5) {
      s.powerups.push({
        x: CANVAS_W + 300 + Math.random() * 200,
        y: GROUND_Y - 20,
        type: Math.random() < 0.5 ? "spread" : "rapid",
        collected: false,
      });
    }
  }

  function initGame() {
    const s = stateRef.current;
    s.score = 0;
    s.lives = 3;
    s.level = 1;
    s.wave = 1;
    s.waveCleared = false;
    s.waveClearTimer = 0;
    s.levelClearTimer = 0;
    s.px = 100;
    s.py = GROUND_Y - 40;
    s.pvx = 0;
    s.pvy = 0;
    s.pOnGround = true;
    s.pFacing = 1;
    s.pShootDir = { x: 1, y: 0 };
    s.pInvincible = 0;
    s.pDead = false;
    s.pDeadTimer = 0;
    s.pFrame = 0;
    s.spreadShot = false;
    s.spreadTimer = 0;
    s.rapidFire = false;
    s.rapidTimer = 0;
    s.shootCooldown = 0;
    s.bullets = [];
    s.particles = [];
    s.bgScroll = 0;
    spawnWave(1, 1);
  }

  function spawnParticles(x: number, y: number, color: string, count: number) {
    const s = stateRef.current;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      s.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 30 + Math.floor(Math.random() * 20),
        maxLife: 50,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  function fireBullet(
    fromX: number,
    fromY: number,
    dx: number,
    dy: number,
    fromPlayer: boolean,
  ) {
    const s = stateRef.current;
    const speed = fromPlayer ? BULLET_SPEED : ENEMY_BULLET_SPEED;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    s.bullets.push({
      x: fromX,
      y: fromY,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      fromPlayer,
      width: fromPlayer ? 8 : 6,
      height: fromPlayer ? 4 : 4,
    });
  }

  function update() {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    s.frame++;

    // Wave clear check
    if (s.waveCleared) {
      s.waveClearTimer--;
      if (s.waveClearTimer <= 0) {
        s.waveCleared = false;
        if (s.wave >= s.totalWaves) {
          // Level clear
          s.levelClearTimer = 180;
          s.wave = 1;
          s.level++;
        } else {
          s.wave++;
          spawnWave(s.wave, s.level);
        }
      }
      return;
    }

    if (s.levelClearTimer > 0) {
      s.levelClearTimer--;
      if (s.levelClearTimer <= 0) {
        spawnWave(s.wave, s.level);
      }
      return;
    }

    // Player dead
    if (s.pDead) {
      s.pDeadTimer--;
      if (s.pDeadTimer <= 0) {
        s.pDead = false;
        s.px = 100;
        s.py = GROUND_Y - 40;
        s.pvx = 0;
        s.pvy = 0;
        s.pInvincible = 120;
      }
      return;
    }

    // Input
    const { keys } = s;
    let moving = false;
    if (keys.ArrowLeft || keys.a || keys.A) {
      s.pvx = -PLAYER_SPEED;
      s.pFacing = -1;
      s.pShootDir = { x: -1, y: 0 };
      moving = true;
    } else if (keys.ArrowRight || keys.d || keys.D) {
      s.pvx = PLAYER_SPEED;
      s.pFacing = 1;
      s.pShootDir = { x: 1, y: 0 };
      moving = true;
    } else {
      s.pvx = 0;
    }
    if ((keys.ArrowUp || keys.w || keys.W || keys[" "]) && s.pOnGround) {
      s.pvy = JUMP_VEL;
      s.pOnGround = false;
    }
    // Shoot direction: if up held, aim up or diagonal
    if (keys.ArrowUp || keys.w || keys.W) {
      if (moving) {
        s.pShootDir = { x: s.pFacing, y: -1 };
      } else {
        s.pShootDir = { x: 0, y: -1 };
      }
    }

    // Player physics
    s.pvy += GRAVITY;
    s.px += s.pvx;
    s.py += s.pvy;
    if (s.py >= GROUND_Y - 40) {
      s.py = GROUND_Y - 40;
      s.pvy = 0;
      s.pOnGround = true;
    }
    s.px = Math.max(20, Math.min(CANVAS_W - 30, s.px));

    // Walk animation
    if (s.pvx !== 0 && s.pOnGround) {
      s.pFrameTimer++;
      if (s.pFrameTimer >= 8) {
        s.pFrameTimer = 0;
        s.pFrame = (s.pFrame + 1) % 4;
      }
    }

    // Shooting
    if (s.shootCooldown > 0) s.shootCooldown--;
    const shootInterval = s.rapidFire ? 5 : 15;
    if (
      (keys.z || keys.Z || keys.f || keys.F || keys.x || keys.X) &&
      s.shootCooldown <= 0
    ) {
      s.shootCooldown = shootInterval;
      const bx = s.px + (s.pFacing > 0 ? 20 : -20);
      const by = s.py + 15;
      if (s.spreadShot) {
        fireBullet(bx, by, s.pShootDir.x, s.pShootDir.y, true);
        fireBullet(bx, by, s.pShootDir.x + 0.4, s.pShootDir.y - 0.4, true);
        fireBullet(bx, by, s.pShootDir.x - 0.4, s.pShootDir.y + 0.4, true);
      } else {
        fireBullet(bx, by, s.pShootDir.x, s.pShootDir.y, true);
      }
    }

    // Powerup timers
    if (s.spreadShot) {
      s.spreadTimer--;
      if (s.spreadTimer <= 0) s.spreadShot = false;
    }
    if (s.rapidFire) {
      s.rapidTimer--;
      if (s.rapidTimer <= 0) s.rapidFire = false;
    }

    // Invincibility
    if (s.pInvincible > 0) s.pInvincible--;

    // Scroll bg
    s.bgScroll = (s.bgScroll + 1) % 800;

    // Update bullets
    s.bullets = s.bullets.filter((b) => {
      b.x += b.vx;
      b.y += b.vy;
      return (
        b.x > -20 && b.x < CANVAS_W + 20 && b.y > HUD_H && b.y < CANVAS_H + 20
      );
    });

    // Update powerups & check collection
    for (const pu of s.powerups) {
      pu.x -= 1;
      if (!pu.collected) {
        const dx = Math.abs(pu.x - s.px);
        const dy = Math.abs(pu.y - (s.py + 10));
        if (dx < 20 && dy < 20) {
          pu.collected = true;
          s.score += 50;
          if (pu.type === "spread") {
            s.spreadShot = true;
            s.spreadTimer = 600;
          } else {
            s.rapidFire = true;
            s.rapidTimer = 600;
          }
          spawnParticles(pu.x, pu.y, "#ffff00", 10);
        }
      }
    }
    s.powerups = s.powerups.filter((pu) => !pu.collected && pu.x > -50);

    // Update enemies
    let _allDead = true;
    for (const e of s.enemies) {
      if (e.dead) {
        e.deadTimer--;
        continue;
      }
      _allDead = false;

      // Move
      e.vy += GRAVITY;
      e.x += e.vx;
      e.y += e.vy;
      if (e.y >= GROUND_Y - e.height) {
        e.y = GROUND_Y - e.height;
        e.vy = 0;
        e.onGround = true;
      }
      // Boss bounces
      if (e.type === "boss") {
        if (e.x < 300) e.vx = 0.5;
        if (e.x > CANVAS_W - 120) e.vx = -0.5;
      } else {
        if (e.x < -200) e.x = -200; // off screen left is ok
      }

      // Walk animation
      e.walkTimer++;
      if (e.walkTimer >= 10) {
        e.walkTimer = 0;
        e.walkFrame = (e.walkFrame + 1) % 4;
      }

      // Enemy shooting
      e.shootTimer++;
      if (e.shootTimer >= e.shootInterval) {
        e.shootTimer = 0;
        const dx = s.px - e.x;
        const dy = s.py - e.y;
        if (e.type === "boss") {
          // Spread shot - 5 bullets
          for (let i = -2; i <= 2; i++) {
            fireBullet(e.x, e.y, dx + i * 30, dy, false);
          }
        } else {
          fireBullet(e.x, e.y, dx, dy, false);
        }
      }

      // Bullet hits on enemy
      for (const b of s.bullets) {
        if (!b.fromPlayer) continue;
        if (
          b.x > e.x - e.width / 2 &&
          b.x < e.x + e.width / 2 &&
          b.y > e.y &&
          b.y < e.y + e.height
        ) {
          b.x = -9999; // remove
          e.hp--;
          spawnParticles(b.x, b.y, "#ff4400", 5);
          if (e.hp <= 0) {
            e.dead = true;
            e.deadTimer = 40;
            if (e.type === "soldier") s.score += 100;
            else if (e.type === "tank") s.score += 300;
            else s.score += 1000;
            spawnParticles(e.x, e.y, "#ff6600", 20);
          }
        }
      }

      // Enemy hits player
      if (s.pInvincible <= 0 && !s.pDead) {
        const pdx = Math.abs(e.x - s.px);
        const pdy = Math.abs(e.y + e.height / 2 - s.py);
        if (pdx < e.width / 2 + 12 && pdy < e.height / 2 + 18) {
          s.lives--;
          s.pInvincible = 120;
          spawnParticles(s.px, s.py, "#ff0000", 15);
          if (s.lives <= 0) {
            s.pDead = true;
            s.pDeadTimer = 60;
            s.phase = "gameOver";
            setFinalScore(s.score);
            setPhase("gameOver");
          } else {
            s.pDead = true;
            s.pDeadTimer = 60;
          }
        }
      }
    }

    // Enemy bullet hits player
    for (const b of s.bullets) {
      if (b.fromPlayer) continue;
      if (s.pInvincible > 0 || s.pDead) continue;
      if (
        b.x > s.px - 14 &&
        b.x < s.px + 14 &&
        b.y > s.py - 20 &&
        b.y < s.py + 20
      ) {
        b.x = -9999;
        s.lives--;
        s.pInvincible = 120;
        spawnParticles(s.px, s.py, "#ff0000", 12);
        if (s.lives <= 0) {
          s.pDead = true;
          s.pDeadTimer = 60;
          s.phase = "gameOver";
          setFinalScore(s.score);
          setPhase("gameOver");
        } else {
          s.pDead = true;
          s.pDeadTimer = 60;
        }
      }
    }

    // Clean dead bullets
    s.bullets = s.bullets.filter((b) => b.x !== -9999);

    // Clean dead enemies after animation
    s.enemies = s.enemies.filter((e) => !e.dead || e.deadTimer > 0);

    // Check wave cleared
    if (
      !s.waveCleared &&
      s.enemies.every((e) => e.dead || e.deadTimer <= 0) &&
      s.enemies.length >= 0
    ) {
      const livingEnemies = s.enemies.filter((e) => !e.dead);
      if (livingEnemies.length === 0 && s.enemies.length >= 0) {
        // Check if wave was fully spawned (enemies array cleared means wave done)
        // We re-check: if enemy list is empty, wave is done
        // But we need at least one frame after spawn
        if (s.frame > 60 && s.enemies.length === 0) {
          s.waveCleared = true;
          s.waveClearTimer = 120;
        }
      }
    }

    // Update particles
    s.particles = s.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
      return p.life > 0;
    });
  }

  function drawPlayer(
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current,
  ) {
    const { px, py, pFacing, pInvincible, pDead, pOnGround, pFrame } = s;
    if (pDead) return;
    if (pInvincible > 0 && Math.floor(pInvincible / 5) % 2 === 0) return;

    ctx.save();
    ctx.translate(px, py);
    if (pFacing < 0) ctx.scale(-1, 1);

    // Legs animation
    const legOffset = pOnGround ? Math.sin((pFrame * Math.PI) / 2) * 5 : 0;
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-6, 14, 8, 16 + legOffset);
    ctx.fillRect(2, 14, 8, 16 - legOffset);

    // Body
    ctx.fillStyle = "#ff8800";
    ctx.fillRect(-10, -10, 20, 26);

    // Chest stripe
    ctx.fillStyle = "#cc5500";
    ctx.fillRect(-10, 2, 20, 6);

    // Head
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(-8, -28, 16, 18);

    // Helmet
    ctx.fillStyle = "#333";
    ctx.fillRect(-9, -32, 18, 8);
    ctx.fillStyle = "#555";
    ctx.fillRect(-7, -38, 14, 10);

    // Eye
    ctx.fillStyle = "#000";
    ctx.fillRect(2, -24, 4, 4);

    // Gun
    ctx.fillStyle = "#444";
    ctx.fillRect(6, -5, 16, 5);
    ctx.fillStyle = "#222";
    ctx.fillRect(18, -6, 6, 7);

    ctx.restore();
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    if (e.dead) {
      // Flash animation
      if (e.deadTimer % 6 < 3) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#ff8800";
        ctx.fillRect(e.x - e.width / 2, e.y, e.width, e.height);
        ctx.globalAlpha = 1;
      }
      return;
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.facing > 0) ctx.scale(-1, 1);

    if (e.type === "boss") {
      // Boss: big menacing figure
      ctx.fillStyle = "#880000";
      ctx.fillRect(-40, 0, 80, 80);
      ctx.fillStyle = "#aa0000";
      ctx.fillRect(-30, -20, 60, 30);
      ctx.fillStyle = "#cc2200";
      ctx.fillRect(-20, -40, 40, 25);
      // Eyes
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-15, -30, 10, 8);
      ctx.fillRect(5, -30, 10, 8);
      // HP bar
      ctx.fillStyle = "#333";
      ctx.fillRect(-40, -50, 80, 8);
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-40, -50, 80 * (e.hp / e.maxHp), 8);
      ctx.fillStyle = "#ff4400";
      ctx.fillRect(-40, 40, 80, 8);
      ctx.fillStyle = "#ff8800";
      ctx.fillRect(-30, 42, 60 * (e.hp / e.maxHp), 4);
    } else if (e.type === "tank") {
      // Tank soldier
      const legOff = Math.sin((e.walkFrame * Math.PI) / 2) * 4;
      ctx.fillStyle = "#444";
      ctx.fillRect(-10, 25, 10, 16 + legOff);
      ctx.fillRect(4, 25, 10, 16 - legOff);
      ctx.fillStyle = "#556622";
      ctx.fillRect(-14, 0, 28, 30);
      ctx.fillStyle = "#778833";
      ctx.fillRect(-12, -18, 24, 20);
      ctx.fillStyle = "#888";
      ctx.fillRect(-12, -25, 24, 10);
      ctx.fillStyle = "#000";
      ctx.fillRect(4, -18, 5, 5);
      ctx.fillStyle = "#333";
      ctx.fillRect(12, -5, 18, 6);
      // HP bar
      ctx.fillStyle = "#333";
      ctx.fillRect(-14, -30, 28, 5);
      ctx.fillStyle = "#ff2200";
      ctx.fillRect(-14, -30, 28 * (e.hp / e.maxHp), 5);
    } else {
      // Soldier
      const legOff = Math.sin((e.walkFrame * Math.PI) / 2) * 4;
      ctx.fillStyle = "#444";
      ctx.fillRect(-5, 18, 7, 12 + legOff);
      ctx.fillRect(3, 18, 7, 12 - legOff);
      ctx.fillStyle = "#556622";
      ctx.fillRect(-8, 0, 16, 22);
      ctx.fillStyle = "#ffcc88";
      ctx.fillRect(-6, -16, 12, 18);
      ctx.fillStyle = "#445522";
      ctx.fillRect(-7, -20, 14, 8);
      ctx.fillStyle = "#000";
      ctx.fillRect(2, -13, 4, 4);
      ctx.fillStyle = "#333";
      ctx.fillRect(8, -3, 14, 4);
    }

    ctx.restore();
  }

  function drawBg(ctx: CanvasRenderingContext2D, scroll: number) {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, HUD_H, 0, CANVAS_H);
    grad.addColorStop(0, "#0a2010");
    grad.addColorStop(0.6, "#1a4020");
    grad.addColorStop(1, "#0d2810");
    ctx.fillStyle = grad;
    ctx.fillRect(0, HUD_H, CANVAS_W, CANVAS_H - HUD_H);
    // Background image overlay
    if (bgImageRef.current) {
      ctx.globalAlpha = 0.12;
      ctx.drawImage(bgImageRef.current, 0, HUD_H, CANVAS_W, CANVAS_H - HUD_H);
      ctx.globalAlpha = 1.0;
    }

    // 3 parallax tree layers
    const layers = [
      {
        speed: 0.2,
        color: "#0a2808",
        width: 30,
        height: 120,
        spacing: 120,
        yBase: GROUND_Y - 80,
        topR: 25,
      },
      {
        speed: 0.5,
        color: "#0d3510",
        width: 22,
        height: 90,
        spacing: 90,
        yBase: GROUND_Y - 60,
        topR: 18,
      },
      {
        speed: 0.8,
        color: "#134018",
        width: 16,
        height: 60,
        spacing: 70,
        yBase: GROUND_Y - 40,
        topR: 14,
      },
    ];
    for (const layer of layers) {
      const offset = (scroll * layer.speed) % layer.spacing;
      const count = Math.ceil(CANVAS_W / layer.spacing) + 2;
      for (let i = -1; i < count; i++) {
        const tx = i * layer.spacing - offset;
        const ty = layer.yBase - layer.height;
        // Trunk
        ctx.fillStyle = layer.color;
        ctx.fillRect(
          tx + layer.width / 2 - 4,
          ty + layer.height * 0.5,
          8,
          layer.height * 0.5,
        );
        // Canopy
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.arc(
          tx + layer.width / 2,
          ty + layer.topR,
          layer.topR,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
          tx + layer.width / 2 - 8,
          ty + layer.topR * 1.4,
          layer.topR * 0.8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
          tx + layer.width / 2 + 8,
          ty + layer.topR * 1.4,
          layer.topR * 0.8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    // Ground
    ctx.fillStyle = "#5c3d1e";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
    ctx.fillStyle = "#3a2510";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 4);
    // Ground detail
    ctx.fillStyle = "#4a6620";
    for (let gx = 0; gx < CANVAS_W; gx += 60) {
      const ox = (gx - scroll * 0.9) % CANVAS_W;
      ctx.fillRect(ox, GROUND_Y, 20, 4);
    }
  }

  function drawHUD(ctx: CanvasRenderingContext2D, s: typeof stateRef.current) {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.strokeStyle = "#ff4400";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, HUD_H);
    ctx.lineTo(CANVAS_W, HUD_H);
    ctx.stroke();

    // Title
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#ff4400";
    ctx.fillText("ODIN CONTRA", 10, 32);

    // Wave/Level
    ctx.font = "12px monospace";
    ctx.fillStyle = "#ffcc00";
    ctx.fillText(
      `LVL ${s.level}  WAVE ${s.wave}/${s.totalWaves}`,
      CANVAS_W / 2 - 60,
      22,
    );

    // Score
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`SCORE: ${s.score}`, CANVAS_W / 2 - 50, 40);

    // Lives (small icons)
    for (let i = 0; i < s.lives; i++) {
      const lx = CANVAS_W - 180 + i * 24;
      ctx.fillStyle = "#ff8800";
      ctx.fillRect(lx, 12, 14, 20);
      ctx.fillStyle = "#ffcc88";
      ctx.fillRect(lx + 2, 6, 10, 10);
    }

    // Powerup status
    if (s.spreadShot) {
      ctx.fillStyle = "#44ff44";
      ctx.font = "10px monospace";
      ctx.fillText(
        `SPREAD ${Math.ceil(s.spreadTimer / 60)}s`,
        CANVAS_W - 140,
        42,
      );
    }
    if (s.rapidFire) {
      ctx.fillStyle = "#44aaff";
      ctx.font = "10px monospace";
      ctx.fillText(
        `RAPID ${Math.ceil(s.rapidTimer / 60)}s`,
        CANVAS_W - 140,
        42,
      );
    }

    // Token price
    if (s.tokenPrice) {
      const txt = `ODINMARIO ${s.tokenPrice}`;
      ctx.font = "10px monospace";
      ctx.fillStyle = "#aaffaa";
      if (s.tokenImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(CANVAS_W - 130, 14, 8, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(s.tokenImg, CANVAS_W - 138, 6, 16, 16);
        ctx.restore();
        ctx.fillText(txt, CANVAS_W - 118, 18);
      } else {
        ctx.fillText(txt, CANVAS_W - 130, 18);
      }
    }
  }

  function drawPowerup(ctx: CanvasRenderingContext2D, pu: Powerup) {
    if (pu.collected) return;
    const pulse = Math.sin(Date.now() / 200) * 3;
    ctx.save();
    if (pu.type === "spread") {
      ctx.fillStyle = "#44ff44";
      ctx.shadowColor = "#44ff44";
    } else {
      ctx.fillStyle = "#44aaff";
      ctx.shadowColor = "#44aaff";
    }
    ctx.shadowBlur = 8 + pulse;
    ctx.beginPath();
    ctx.roundRect(pu.x - 14, pu.y - 14, 28, 28, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(pu.type === "spread" ? "S" : "R", pu.x, pu.y + 5);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = stateRef.current;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    drawBg(ctx, s.bgScroll);

    // Powerups
    for (const pu of s.powerups) drawPowerup(ctx, pu);

    // Bullets
    for (const b of s.bullets) {
      ctx.fillStyle = b.fromPlayer ? "#ffee00" : "#ff3300";
      ctx.shadowColor = b.fromPlayer ? "#ffee00" : "#ff3300";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.ellipse(
        b.x,
        b.y,
        b.width / 2,
        b.height / 2,
        Math.atan2(b.vy, b.vx),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Enemies
    for (const e of s.enemies) drawEnemy(ctx, e);

    // Player
    drawPlayer(ctx, s);

    // Particles
    for (const p of s.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Wave clear overlay
    if (s.waveCleared) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, HUD_H, CANVAS_W, CANVAS_H - HUD_H);
      ctx.font = "bold 32px monospace";
      ctx.fillStyle = "#44ff44";
      ctx.textAlign = "center";
      if (s.wave >= s.totalWaves) {
        ctx.fillText("LEVEL CLEAR!", CANVAS_W / 2, CANVAS_H / 2);
      } else {
        ctx.fillText(`WAVE ${s.wave} CLEAR!`, CANVAS_W / 2, CANVAS_H / 2);
      }
      ctx.textAlign = "left";
    }

    if (s.levelClearTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, HUD_H, CANVAS_W, CANVAS_H - HUD_H);
      ctx.font = "bold 32px monospace";
      ctx.fillStyle = "#ffcc00";
      ctx.textAlign = "center";
      ctx.fillText(
        `LEVEL ${s.level - 1} COMPLETE!`,
        CANVAS_W / 2,
        CANVAS_H / 2 - 20,
      );
      ctx.font = "18px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`Score: ${s.score}`, CANVAS_W / 2, CANVAS_H / 2 + 20);
      ctx.textAlign = "left";
    }

    drawHUD(ctx, s);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: game loop
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    update();
    draw(ctx);
    rafRef.current = requestAnimationFrame(loop);
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

  useEffect(() => {
    if (phase === "playing") {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, loop]);

  // Keyboard
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      const s = stateRef.current;
      stateRef.current.keys[e.key] = true;
      if (e.key === "Escape" && s.phase === "playing") {
        s.phase = "paused";
        setPhase("paused");
        cancelAnimationFrame(rafRef.current);
      } else if (e.key === "Escape" && s.phase === "paused") {
        s.phase = "playing";
        setPhase("playing");
      }
      if (
        [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
      }
    }
    function onUp(e: KeyboardEvent) {
      stateRef.current.keys[e.key] = false;
      // Reset shoot direction on up-release if not moving up
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        stateRef.current.pShootDir = { x: stateRef.current.pFacing, y: 0 };
      }
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  function handlePlay() {
    const savedName = localStorage.getItem("odinContraUsername") || "";
    if (savedName) {
      setUsername(savedName);
      initGame();
      stateRef.current.phase = "playing";
      setPhase("playing");
    } else {
      stateRef.current.phase = "username";
      setPhase("username");
    }
  }

  function handleSaveName() {
    const name = inputName.trim() || "Player";
    localStorage.setItem("odinContraUsername", name);
    setUsername(name);
    initGame();
    stateRef.current.phase = "playing";
    setPhase("playing");
  }

  async function handleSubmitScore() {
    const s = stateRef.current;
    const name =
      username || localStorage.getItem("odinContraUsername") || "Player";
    setSubmitting(true);
    try {
      await actor?.submitScore(name, BigInt(s.score));
      const top = (await actor?.getTop10Scores()) ?? [];
      setScores(top as ScoreEntry[]);
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
    stateRef.current.phase = "leaderboard";
    setPhase("leaderboard");
  }

  async function handleShowLeaderboard() {
    try {
      const top = (await actor?.getTop10Scores()) ?? [];
      setScores(top as ScoreEntry[]);
    } catch (e) {
      console.error(e);
    }
    stateRef.current.phase = "leaderboard";
    setPhase("leaderboard");
  }

  // Mobile control helpers
  const mobileKeys = useRef<Record<string, boolean>>({});
  function mobilePress(key: string) {
    stateRef.current.keys[key] = true;
    mobileKeys.current[key] = true;
    navigator.vibrate?.(30);
  }
  function mobileRelease(key: string) {
    stateRef.current.keys[key] = false;
    mobileKeys.current[key] = false;
  }

  const dpadBtnStyle: React.CSSProperties = {
    background: "rgba(20,10,5,0.85)",
    border: "2px solid #ff4400",
    borderRadius: 10,
    color: "#ff4400",
    fontSize: 22,
    fontWeight: "bold",
    cursor: "pointer",
    touchAction: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    width: 60,
    height: 60,
  };

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.93)",
    zIndex: 10,
    fontFamily: "monospace",
    padding: 24,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#050f05",
        overflow: "hidden",
      }}
    >
      {/* Game canvas area */}
      <div
        ref={containerRef}
        style={{
          flex: "0 0 auto",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-ocid="game.home_button"
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              zIndex: 100,
              background: "rgba(0,0,0,0.6)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            🏠 Home
          </button>
        )}

        {/* START SCREEN */}
        {phase === "start" && (
          <div style={overlayStyle}>
            <img
              src="/assets/uploads/19943_11zon-1-1.png"
              alt="Odin"
              style={{
                width: 90,
                height: 90,
                objectFit: "contain",
                marginBottom: 12,
              }}
            />
            <h1
              style={{
                color: "#ff4400",
                fontSize: "clamp(20px,5vw,36px)",
                textShadow: "0 0 30px #ff4400, 0 0 60px #ff2200",
                margin: 0,
                letterSpacing: 4,
              }}
            >
              ODIN CONTRA
            </h1>
            <p
              style={{
                color: "#ffcc00",
                fontSize: 11,
                marginTop: 6,
                animation: "blink 1s step-end infinite",
              }}
            >
              Building GameFi project on Odin.fun
            </p>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="contra.play.primary_button"
                onClick={handlePlay}
                style={{
                  background: "linear-gradient(90deg,#cc2200,#ff4400)",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px 28px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  letterSpacing: 2,
                }}
              >
                ▶ START
              </button>
              <button
                type="button"
                data-ocid="contra.leaderboard.secondary_button"
                onClick={handleShowLeaderboard}
                style={{
                  background: "#002244",
                  border: "2px solid #0088ff",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px 20px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
              >
                🏆 LEADERBOARD
              </button>
            </div>
            <div
              style={{
                marginTop: 20,
                color: "#aaa",
                fontSize: 11,
                textAlign: "center",
                lineHeight: 2,
              }}
            >
              <div>Arrow Keys / WASD: Move</div>
              <div>Up / W / Space: Jump</div>
              <div>Z / F / X: Shoot</div>
              <div>Esc: Pause</div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <a
                href="https://x.com/odinmariogame"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "white",
                  textDecoration: "none",
                  fontSize: 12,
                  background: "#111",
                  border: "1px solid #444",
                  padding: "5px 12px",
                  borderRadius: 6,
                }}
              >
                𝕏 Twitter
              </a>
              <a
                href="https://odin.fun/token/2ip5"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "black",
                  textDecoration: "none",
                  fontSize: 12,
                  background: "#ffcc00",
                  padding: "5px 12px",
                  borderRadius: 6,
                  fontWeight: "bold",
                }}
              >
                TOKEN
              </a>
            </div>
            {onBack && (
              <button
                type="button"
                data-ocid="contra.back.secondary_button"
                onClick={onBack}
                style={{
                  marginTop: 14,
                  background: "transparent",
                  border: "2px solid #444",
                  borderRadius: 8,
                  color: "#888",
                  padding: "7px 18px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                ← Back to Mario
              </button>
            )}
          </div>
        )}

        {/* USERNAME */}
        {phase === "username" && (
          <div style={overlayStyle}>
            <h2 style={{ color: "#ffcc00", marginBottom: 16, fontSize: 18 }}>
              Enter Your Name
            </h2>
            <input
              data-ocid="contra.username.input"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
              }}
              placeholder="Your name..."
              style={{
                padding: "10px 16px",
                fontSize: 16,
                borderRadius: 8,
                border: "2px solid #ff4400",
                background: "#111",
                color: "white",
                width: 200,
                textAlign: "center",
                outline: "none",
              }}
            />
            <button
              type="button"
              data-ocid="contra.save_name.primary_button"
              onClick={handleSaveName}
              style={{
                marginTop: 14,
                background: "#ff4400",
                border: "none",
                borderRadius: 8,
                color: "white",
                padding: "10px 24px",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "monospace",
              }}
            >
              Save &amp; Play
            </button>
          </div>
        )}

        {/* PAUSED */}
        {phase === "paused" && (
          <div style={overlayStyle}>
            <h2 style={{ color: "#ffcc00", fontSize: 28, marginBottom: 24 }}>
              PAUSED
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                width: 200,
              }}
            >
              <button
                type="button"
                data-ocid="contra.resume.primary_button"
                onClick={() => {
                  stateRef.current.phase = "playing";
                  setPhase("playing");
                }}
                style={{
                  background: "#ff4400",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                  fontWeight: "bold",
                }}
              >
                ▶ RESUME
              </button>
              <button
                type="button"
                data-ocid="contra.menu.secondary_button"
                onClick={() => {
                  stateRef.current.phase = "start";
                  setPhase("start");
                }}
                style={{
                  background: "#222",
                  border: "2px solid #666",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                }}
              >
                ⬅ MAIN MENU
              </button>
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {phase === "gameOver" && (
          <div style={overlayStyle}>
            <h2
              style={{
                color: "#ff2200",
                fontSize: 28,
                marginBottom: 8,
                textShadow: "0 0 20px #ff2200",
              }}
            >
              GAME OVER
            </h2>
            <p style={{ color: "white", fontSize: 20 }}>Score: {finalScore}</p>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 24,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="contra.submit_score.primary_button"
                onClick={handleSubmitScore}
                disabled={submitting}
                style={{
                  background: "#ff4400",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontSize: 14,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Submitting..." : "Submit Score"}
              </button>
              <button
                type="button"
                data-ocid="contra.play_again.secondary_button"
                onClick={handlePlay}
                style={{
                  background: "#002244",
                  border: "2px solid #0088ff",
                  borderRadius: 8,
                  color: "white",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {phase === "leaderboard" && (
          <div style={overlayStyle}>
            <h2 style={{ color: "#ffcc00", marginBottom: 16, fontSize: 20 }}>
              🏆 Leaderboard
            </h2>
            <div style={{ width: "100%", maxWidth: 320 }}>
              {scores.length === 0 && (
                <p style={{ color: "#aaa", textAlign: "center" }}>
                  No scores yet.
                </p>
              )}
              {scores.map((s, i) => (
                <div
                  key={s.playerName + String(i)}
                  data-ocid={`contra.leaderboard.item.${i + 1}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 12px",
                    background:
                      i === 0 ? "rgba(255,68,0,0.2)" : "rgba(255,255,255,0.05)",
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: i === 0 ? "#ff8844" : "white" }}>
                    #{i + 1} {s.playerName}
                  </span>
                  <span style={{ color: "#ff4400", fontWeight: "bold" }}>
                    {String(s.score)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 20,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="contra.play_again.primary_button"
                onClick={handlePlay}
                style={{
                  background: "#ff4400",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Play Again
              </button>
              <button
                type="button"
                data-ocid="contra.menu.secondary_button"
                onClick={() => {
                  setPhase("start");
                  stateRef.current.phase = "start";
                }}
                style={{
                  background: "#222",
                  border: "2px solid #666",
                  borderRadius: 8,
                  color: "white",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile D-PAD (below canvas, not overlapping) */}
      {phase === "playing" && isTouchDevice && (
        <div
          style={{
            background: "#050a05",
            borderTop: "1px solid #1a2a1a",
            flexShrink: 0,
            padding: "12px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 32,
          }}
        >
          {/* D-Pad */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 60px 60px",
              gridTemplateRows: "60px 60px 60px",
              gap: 4,
            }}
          >
            <div />
            <button
              type="button"
              style={dpadBtnStyle}
              onTouchStart={(e) => {
                e.preventDefault();
                mobilePress("ArrowUp");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                mobileRelease("ArrowUp");
              }}
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              style={dpadBtnStyle}
              onTouchStart={(e) => {
                e.preventDefault();
                mobilePress("ArrowLeft");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                mobileRelease("ArrowLeft");
              }}
            >
              ◀
            </button>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8 }} />
            <button
              type="button"
              style={dpadBtnStyle}
              onTouchStart={(e) => {
                e.preventDefault();
                mobilePress("ArrowRight");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                mobileRelease("ArrowRight");
              }}
            >
              ▶
            </button>
            <div />
            <button
              type="button"
              style={dpadBtnStyle}
              onTouchStart={(e) => {
                e.preventDefault();
                mobileRelease("ArrowUp");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
              }}
            >
              ▼
            </button>
            <div />
          </div>
          {/* Jump + Shoot */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              style={{
                ...dpadBtnStyle,
                width: 80,
                height: 60,
                background: "rgba(0,20,80,0.9)",
                border: "2px solid #0088ff",
                color: "#0088ff",
                fontSize: 13,
                fontWeight: "bold",
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                mobilePress(" ");
                navigator.vibrate?.(30);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                mobileRelease(" ");
              }}
            >
              JUMP
            </button>
            <button
              type="button"
              style={{
                ...dpadBtnStyle,
                width: 80,
                height: 60,
                background: "rgba(80,0,0,0.9)",
                border: "2px solid #ff2200",
                color: "#ff2200",
                fontSize: 13,
                fontWeight: "bold",
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                mobilePress("z");
                navigator.vibrate?.(30);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                mobileRelease("z");
              }}
            >
              FIRE
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
        }}
      >
        Built by ODINMARIO
      </div>
    </div>
  );
}
