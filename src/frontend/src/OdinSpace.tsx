import { useCallback, useEffect, useRef, useState } from "react";
import { playEnemyDie, playGameOver, playShoot } from "./utils/sounds";

interface Props {
  onBack: () => void;
}

interface LeaderboardEntry {
  name: string;
  score: number;
}

const STORAGE_KEY = "odinspace_leaderboard";
const USERNAME_KEY = "odinmario_username";

function getLeaderboard(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveScore(name: string, score: number) {
  const lb = getLeaderboard();
  lb.push({ name, score });
  lb.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lb.slice(0, 10)));
}

export default function OdinSpace({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<
    "start" | "playing" | "gameover" | "victory"
  >("start");
  const [finalScore, setFinalScore] = useState(0);
  const [username, setUsername] = useState(
    () => localStorage.getItem(USERNAME_KEY) || "",
  );
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] =
    useState<LeaderboardEntry[]>(getLeaderboard);
  const [tokenPrice, setTokenPrice] = useState("--");
  const gameStateRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());

  // Token price fetch
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("https://api.odin.fun/v1/token/2ip5");
        const data = await res.json();
        const price = data?.price ?? data?.data?.price;
        if (price !== undefined) {
          const sats = (Number(price) / 1e8).toFixed(3);
          setTokenPrice(sats);
        }
      } catch {
        /* ignore */
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  const initGame = useCallback((wave = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    // Stars
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
    }));

    // Aliens grid: 5 rows x 10 cols
    const aliens: any[] = [];
    const cols = 10;
    const rows = 5;
    const startX = 60;
    const startY = 80;
    const spacingX = (W - 120) / (cols - 1);
    const spacingY = 42;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const type = r < 1 ? "small" : r < 3 ? "medium" : "large";
        aliens.push({
          x: startX + c * spacingX,
          y: startY + r * spacingY,
          type,
          alive: true,
          animFrame: 0,
        });
      }
    }

    // Shields
    const shieldCount = 4;
    const shields: any[] = [];
    for (let i = 0; i < shieldCount; i++) {
      shields.push({
        x: 80 + i * ((W - 160) / (shieldCount - 1)),
        y: H - 130,
        hp: 5,
      });
    }

    const baseSpeed = 0.5 + (wave - 1) * 0.3;

    gameStateRef.current = {
      W,
      H,
      wave,
      score: gameStateRef.current?.score ?? 0,
      lives: gameStateRef.current?.lives ?? 3,
      stars,
      aliens,
      shields,
      alienDir: 1,
      alienSpeed: baseSpeed,
      alienDropDist: 18,
      alienDropping: false,
      alienDropY: 0,
      alienShootTimer: 0,
      alienShootInterval: Math.max(40, 90 - wave * 10),
      playerX: W / 2,
      playerW: 36,
      playerH: 28,
      playerSpeed: 4.5,
      bullets: [] as any[],
      alienBullets: [] as any[],
      coins: [] as any[],
      ufo: null as any,
      ufoTimer: 0,
      ufoInterval: 400 + Math.floor(Math.random() * 200),
      boss: null as any,
      bossDefeated: false,
      playerInvincible: 0,
      gameOver: false,
      victory: false,
      animTick: 0,
      shootCooldown: 0,
    };
  }, []);

  const startGame = useCallback(() => {
    gameStateRef.current = null;
    setSubmitted(false);
    setScreen("playing");
  }, []);

  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Initialize game after canvas is mounted with proper dimensions
    if (!gameStateRef.current) {
      initGame(1);
    }

    const handleKey = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Space") e.preventDefault();
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKeyUp);

    const ctx = canvas.getContext("2d")!;

    function drawShip(x: number, y: number, w: number, h: number, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      // Body
      ctx.fillStyle = "#4af";
      ctx.beginPath();
      ctx.moveTo(x, y - h / 2);
      ctx.lineTo(x - w / 2, y + h / 2);
      ctx.lineTo(x + w / 2, y + h / 2);
      ctx.closePath();
      ctx.fill();
      // Helmet horns
      ctx.fillStyle = "#fa0";
      ctx.beginPath();
      ctx.moveTo(x - w * 0.25, y - h * 0.1);
      ctx.lineTo(x - w * 0.45, y - h * 0.55);
      ctx.lineTo(x - w * 0.1, y - h * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.25, y - h * 0.1);
      ctx.lineTo(x + w * 0.45, y - h * 0.55);
      ctx.lineTo(x + w * 0.1, y - h * 0.15);
      ctx.closePath();
      ctx.fill();
      // Cockpit
      ctx.fillStyle = "#0ff";
      ctx.beginPath();
      ctx.ellipse(x, y + 2, w * 0.15, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Engine glow
      ctx.fillStyle = "#f80";
      ctx.beginPath();
      ctx.ellipse(x, y + h / 2, w * 0.12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawAlien(x: number, y: number, type: string, tick: number) {
      const frame = Math.floor(tick / 20) % 2;
      ctx.save();
      if (type === "small") {
        // Small: skull-like
        ctx.fillStyle = "#a0f";
        ctx.beginPath();
        ctx.ellipse(x, y, 10, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(x - 4, y - 1, 3, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 4, y - 1, 3, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(x - 4, y - 1, 1.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 4, y - 1, 1.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // antennae
        ctx.strokeStyle = "#a0f";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 9);
        ctx.lineTo(x - 6, y - 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 9);
        ctx.lineTo(x + 6, y - 14);
        ctx.stroke();
        // legs
        ctx.beginPath();
        ctx.moveTo(x - 8, y + 6);
        ctx.lineTo(x - 12 + frame * 2, y + 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 6);
        ctx.lineTo(x + 12 - frame * 2, y + 12);
        ctx.stroke();
      } else if (type === "medium") {
        // Medium: crab-like troll
        ctx.fillStyle = "#0c8";
        ctx.fillRect(x - 11, y - 7, 22, 14);
        ctx.fillStyle = "#fa0";
        ctx.beginPath();
        ctx.ellipse(x - 5, y - 2, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 5, y - 2, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(x - 5, y - 2, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 5, y - 2, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // claws animate
        ctx.fillStyle = "#0c8";
        ctx.fillRect(x - 18 + frame * 2, y - 3, 8, 6);
        ctx.fillRect(x + 10 - frame * 2, y - 3, 8, 6);
      } else {
        // Large: dragon-ish
        ctx.fillStyle = "#f44";
        ctx.beginPath();
        ctx.ellipse(x, y, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff8";
        ctx.beginPath();
        ctx.ellipse(x - 6, y - 3, 3, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 6, y - 3, 3, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(x - 6, y - 3, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 6, y - 3, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // wings
        ctx.fillStyle = "rgba(244,68,68,0.5)";
        if (frame === 0) {
          ctx.beginPath();
          ctx.moveTo(x - 14, y);
          ctx.lineTo(x - 26, y - 10);
          ctx.lineTo(x - 14, y + 6);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + 14, y);
          ctx.lineTo(x + 26, y - 10);
          ctx.lineTo(x + 14, y + 6);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x - 14, y);
          ctx.lineTo(x - 22, y + 6);
          ctx.lineTo(x - 14, y + 10);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + 14, y);
          ctx.lineTo(x + 22, y + 6);
          ctx.lineTo(x + 14, y + 10);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawBoss(
      x: number,
      y: number,
      hp: number,
      maxHp: number,
      tick: number,
    ) {
      const frame = Math.floor(tick / 15) % 2;
      ctx.save();
      // Body
      ctx.fillStyle = "#c80";
      ctx.beginPath();
      ctx.ellipse(x, y, 36, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Helmet
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.ellipse(x, y - 16, 18, 12, 0, 0, Math.PI, true);
      ctx.fill();
      // Horns
      ctx.fillStyle = "#fa0";
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 16);
      ctx.lineTo(x - 28, y - 36);
      ctx.lineTo(x - 8, y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 16, y - 16);
      ctx.lineTo(x + 28, y - 36);
      ctx.lineTo(x + 8, y - 16);
      ctx.closePath();
      ctx.fill();
      // Eyes glowing
      ctx.fillStyle = "#f00";
      ctx.beginPath();
      ctx.ellipse(x - 10, y - 6, 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 6, 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff8";
      ctx.beginPath();
      ctx.ellipse(x - 10, y - 6, 2.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 6, 2.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Arms
      ctx.strokeStyle = "#c80";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - 36, y);
      ctx.lineTo(x - 56 + frame * 4, y + 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 36, y);
      ctx.lineTo(x + 56 - frame * 4, y + 12);
      ctx.stroke();
      // HP bar
      const bw = 80;
      ctx.fillStyle = "#333";
      ctx.fillRect(x - bw / 2, y - 44, bw, 8);
      ctx.fillStyle =
        hp / maxHp > 0.5 ? "#0f0" : hp / maxHp > 0.25 ? "#fa0" : "#f00";
      ctx.fillRect(x - bw / 2, y - 44, bw * (hp / maxHp), 8);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bw / 2, y - 44, bw, 8);
      ctx.restore();
    }

    function drawUFO(x: number, y: number) {
      ctx.save();
      ctx.fillStyle = "#f0f";
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200,100,255,0.6)";
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 12, 9, 0, 0, Math.PI, true);
      ctx.fill();
      ctx.strokeStyle = "#f8f";
      ctx.lineWidth = 1;
      ctx.stroke();
      // lights
      [x - 12, x, x + 12].forEach((lx, i) => {
        ctx.fillStyle = i % 2 === 0 ? "#ff0" : "#0ff";
        ctx.beginPath();
        ctx.arc(lx, y + 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function loop() {
      const gs = gameStateRef.current;
      if (!gs || screen !== "playing") return;
      const { W, H } = gs;
      gs.animTick++;

      // Input
      if (keysRef.current.has("ArrowLeft") || keysRef.current.has("KeyA")) {
        gs.playerX = Math.max(gs.playerW / 2, gs.playerX - gs.playerSpeed);
      }
      if (keysRef.current.has("ArrowRight") || keysRef.current.has("KeyD")) {
        gs.playerX = Math.min(W - gs.playerW / 2, gs.playerX + gs.playerSpeed);
      }
      if (
        (keysRef.current.has("Space") || keysRef.current.has("KeyZ")) &&
        gs.shootCooldown <= 0
      ) {
        gs.bullets.push({ x: gs.playerX, y: H - 50, dy: -9 });
        gs.shootCooldown = 18;
        playShoot();
      }
      if (gs.shootCooldown > 0) gs.shootCooldown--;

      // Player invincibility
      if (gs.playerInvincible > 0) gs.playerInvincible--;

      // Move bullets
      gs.bullets = gs.bullets.filter((b: any) => b.y > -10);
      for (const b of gs.bullets) {
        b.y += b.dy;
      }
      gs.alienBullets = gs.alienBullets.filter((b: any) => b.y < H + 10);
      for (const b of gs.alienBullets) {
        b.y += b.dy;
      }

      // Move coins
      gs.coins = gs.coins.filter((c: any) => c.y < H + 20 && c.life > 0);
      for (const c of gs.coins) {
        c.y += 1.5;
        c.life--;
      }

      // Move UFO
      gs.ufoTimer++;
      if (gs.ufoTimer >= gs.ufoInterval && !gs.ufo) {
        gs.ufo = { x: -30, y: 35, dir: 1, speed: 2.5 };
        gs.ufoTimer = 0;
        gs.ufoInterval = 400 + Math.floor(Math.random() * 200);
      }
      if (gs.ufo) {
        gs.ufo.x += gs.ufo.speed * gs.ufo.dir;
        if (gs.ufo.x > W + 30) gs.ufo = null;
      }

      // Alien movement
      const aliveAliens = gs.aliens.filter((a: any) => a.alive);
      if (!gs.boss) {
        if (!gs.alienDropping) {
          const speed = gs.alienSpeed * (1 + (50 - aliveAliens.length) * 0.02);
          for (const a of gs.aliens) {
            if (a.alive) a.x += speed * gs.alienDir;
          }
          const leftmost = Math.min(...aliveAliens.map((a: any) => a.x));
          const rightmost = Math.max(...aliveAliens.map((a: any) => a.x));
          if (rightmost >= W - 25 || leftmost <= 25) {
            gs.alienDir *= -1;
            gs.alienDropping = true;
            gs.alienDropY = 0;
          }
        } else {
          for (const a of gs.aliens) {
            if (a.alive) a.y += 2;
          }
          gs.alienDropY += 2;
          if (gs.alienDropY >= gs.alienDropDist) gs.alienDropping = false;
        }

        // Alien shoot
        gs.alienShootTimer++;
        if (
          gs.alienShootTimer >= gs.alienShootInterval &&
          aliveAliens.length > 0
        ) {
          gs.alienShootTimer = 0;
          const shooter =
            aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
          gs.alienBullets.push({
            x: shooter.x,
            y: shooter.y + 12,
            dy: 4 + gs.wave * 0.3,
          });
        }

        // Check wave clear
        if (aliveAliens.length === 0 && !gs.boss) {
          // Spawn boss
          const maxHp = 15 + gs.wave * 5;
          gs.boss = {
            x: W / 2,
            y: 80,
            hp: maxHp,
            maxHp,
            dir: 1,
            speed: 1.5 + gs.wave * 0.3,
            shootTimer: 0,
            shootInterval: 60,
          };
        }
      } else {
        // Boss movement
        gs.boss.x += gs.boss.speed * gs.boss.dir;
        if (gs.boss.x >= W - 60) gs.boss.dir = -1;
        if (gs.boss.x <= 60) gs.boss.dir = 1;
        // Boss shoot
        gs.boss.shootTimer++;
        if (gs.boss.shootTimer >= gs.boss.shootInterval) {
          gs.boss.shootTimer = 0;
          gs.alienBullets.push({ x: gs.boss.x - 15, y: gs.boss.y + 30, dy: 5 });
          gs.alienBullets.push({ x: gs.boss.x + 15, y: gs.boss.y + 30, dy: 5 });
        }
      }

      // Bullet-alien collisions
      gs.bullets = gs.bullets.filter((b: any) => {
        let hit = false;
        for (const a of gs.aliens) {
          if (!a.alive) continue;
          if (Math.abs(b.x - a.x) < 14 && Math.abs(b.y - a.y) < 14) {
            a.alive = false;
            const points =
              a.type === "small" ? 30 : a.type === "medium" ? 20 : 10;
            gs.score += points;
            playEnemyDie();
            gs.coins.push({ x: a.x, y: a.y, life: 80, val: points });
            hit = true;
            break;
          }
        }
        // UFO hit
        if (
          !hit &&
          gs.ufo &&
          Math.abs(b.x - gs.ufo.x) < 24 &&
          Math.abs(b.y - gs.ufo.y) < 10
        ) {
          gs.score += 100;
          gs.coins.push({ x: gs.ufo.x, y: gs.ufo.y, life: 80, val: 100 });
          gs.ufo = null;
          hit = true;
        }
        // Boss hit
        if (
          !hit &&
          gs.boss &&
          Math.abs(b.x - gs.boss.x) < 38 &&
          Math.abs(b.y - gs.boss.y) < 26
        ) {
          gs.boss.hp--;
          hit = true;
          if (gs.boss.hp <= 0) {
            gs.score += 500;
            gs.coins.push({ x: gs.boss.x, y: gs.boss.y, life: 80, val: 500 });
            gs.boss = null;
            gs.bossDefeated = true;
            gs.victory = true;
          }
        }
        // Shield hit
        if (!hit) {
          for (const s of gs.shields) {
            if (
              s.hp > 0 &&
              Math.abs(b.x - s.x) < 22 &&
              Math.abs(b.y - s.y) < 16
            ) {
              s.hp--;
              hit = true;
              break;
            }
          }
        }
        return !hit;
      });

      // Alien bullets vs player + shields
      gs.alienBullets = gs.alienBullets.filter((b: any) => {
        // shield
        for (const s of gs.shields) {
          if (
            s.hp > 0 &&
            Math.abs(b.x - s.x) < 22 &&
            Math.abs(b.y - s.y) < 16
          ) {
            s.hp = Math.max(0, s.hp - 1);
            return false;
          }
        }
        // player
        const py = H - 44;
        if (
          gs.playerInvincible <= 0 &&
          Math.abs(b.x - gs.playerX) < 18 &&
          Math.abs(b.y - py) < 16
        ) {
          gs.lives--;
          gs.playerInvincible = 120;
          if (gs.lives <= 0) gs.gameOver = true;
          return false;
        }
        return true;
      });

      // Aliens reach bottom
      if (!gs.boss) {
        for (const a of gs.aliens) {
          if (a.alive && a.y >= H - 70) {
            gs.gameOver = true;
            break;
          }
        }
      }

      // Draw
      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#050015");
      grad.addColorStop(0.5, "#0a003a");
      grad.addColorStop(1, "#060020");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (const s of gs.stars) {
        s.twinkle += 0.04;
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Shields
      for (const s of gs.shields) {
        if (s.hp <= 0) continue;
        const alpha = s.hp / 5;
        ctx.save();
        ctx.globalAlpha = Math.max(0.2, alpha);
        ctx.fillStyle = "#0f8";
        ctx.beginPath();
        ctx.roundRect(s.x - 22, s.y - 14, 44, 28, 6);
        ctx.fill();
        ctx.strokeStyle = "#0fc";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Aliens
      for (const a of gs.aliens) {
        if (!a.alive) continue;
        drawAlien(a.x, a.y, a.type, gs.animTick);
      }

      // Boss
      if (gs.boss)
        drawBoss(gs.boss.x, gs.boss.y, gs.boss.hp, gs.boss.maxHp, gs.animTick);

      // UFO
      if (gs.ufo) drawUFO(gs.ufo.x, gs.ufo.y);

      // Bullets
      ctx.fillStyle = "#0ff";
      for (const b of gs.bullets) {
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
      }
      ctx.fillStyle = "#f80";
      for (const b of gs.alienBullets) {
        ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
      }

      // Coins
      for (const c of gs.coins) {
        const alpha = Math.min(1, c.life / 30);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#f80";
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`₿+${c.val}`, c.x, c.y);
        ctx.restore();
      }

      // Player ship
      const playerAlpha =
        gs.playerInvincible > 0
          ? Math.floor(gs.animTick / 4) % 2 === 0
            ? 0.3
            : 1
          : 1;
      drawShip(gs.playerX, H - 44, gs.playerW, gs.playerH, playerAlpha);

      // HUD
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, 34);
      ctx.font = "bold 14px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#0ff";
      ctx.fillText(`SCORE: ${gs.score}`, 8, 22);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fa0";
      ctx.fillText(`WAVE ${gs.wave}`, W / 2, 22);
      ctx.textAlign = "right";
      // Lives as ship icons
      for (let i = 0; i < gs.lives; i++) {
        ctx.save();
        ctx.fillStyle = "#4af";
        ctx.beginPath();
        const lx = W - 12 - i * 22;
        ctx.moveTo(lx, H - (H - 14));
        ctx.lineTo(lx - 8, H - (H - 26));
        ctx.lineTo(lx + 8, H - (H - 26));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // Token price
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,200,0,0.8)";
      ctx.font = "10px monospace";
      ctx.fillText(`ODINMARIO: ${tokenPrice} sats`, 8, H - 6);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("Built by ODINMARIO", W - 6, H - 6);
      ctx.restore();

      if (gs.gameOver) {
        setFinalScore(gs.score);
        playGameOver();
        setScreen("gameover");
        return;
      }
      if (gs.victory) {
        setFinalScore(gs.score);
        setScreen("victory");
        return;
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [screen, tokenPrice, initGame]);

  // Mobile controls
  const mobileLeft = useRef(false);
  const mobileRight = useRef(false);
  const mobileShoot = useRef(false);

  useEffect(() => {
    if (screen !== "playing") return;
    const interval = setInterval(() => {
      if (mobileLeft.current) keysRef.current.add("ArrowLeft");
      else keysRef.current.delete("ArrowLeft");
      if (mobileRight.current) keysRef.current.add("ArrowRight");
      else keysRef.current.delete("ArrowRight");
      if (mobileShoot.current) {
        keysRef.current.add("Space");
        mobileShoot.current = false;
      }
    }, 16);
    return () => clearInterval(interval);
  }, [screen]);

  const canvasSize = {
    width:
      typeof window !== "undefined" ? Math.min(window.innerWidth, 600) : 400,
    height:
      typeof window !== "undefined"
        ? Math.min(window.innerHeight - 180, 520)
        : 480,
  };

  const handleSubmit = () => {
    const name = username.trim() || "Anonymous";
    localStorage.setItem(USERNAME_KEY, name);
    saveScore(name, finalScore);
    setLeaderboard(getLeaderboard());
    setSubmitted(true);
  };

  const nextWave = () => {
    const nextW = (gameStateRef.current?.wave ?? 1) + 1;
    gameStateRef.current = {
      score: gameStateRef.current?.score ?? 0,
      lives: gameStateRef.current?.lives ?? 3,
    };
    initGame(nextW);
    if (gameStateRef.current) gameStateRef.current.wave = nextW;
    setScreen("playing");
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #050015 0%, #0a003a 60%, #060020 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Courier New', monospace",
        color: "#fff",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Home button */}
      <button
        type="button"
        data-ocid="space.home_button"
        onClick={onBack}
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 100,
          background: "rgba(0,0,0,0.6)",
          border: "1px solid #4af",
          borderRadius: 8,
          color: "#4af",
          fontSize: 20,
          width: 40,
          height: 40,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        🏠
      </button>

      {/* Start Screen */}
      {screen === "start" && (
        <div style={{ textAlign: "center", padding: "20px", maxWidth: 460 }}>
          <div
            style={{
              fontSize: 14,
              color: "#a0f",
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            ⚡ ODIN UNIVERSE PRESENTS ⚡
          </div>
          <h1
            style={{
              fontSize: "clamp(2.2rem, 10vw, 3.5rem)",
              fontWeight: 900,
              color: "#0ff",
              textShadow: "0 0 20px #0ff, 0 0 40px #0af",
              letterSpacing: 4,
              margin: "0 0 4px",
            }}
          >
            ODIN SPACE
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "#fa0",
              marginBottom: 24,
              letterSpacing: 2,
            }}
          >
            DEFEND THE GALAXY AS ODIN!
          </div>

          {/* Instructions */}
          <div
            style={{
              background: "rgba(0,255,255,0.07)",
              border: "1px solid rgba(0,255,255,0.2)",
              borderRadius: 10,
              padding: "12px 20px",
              marginBottom: 20,
              textAlign: "left",
              fontSize: 13,
              lineHeight: 1.8,
              color: "#cef",
            }}
          >
            <div>
              🖥️ <b>PC:</b> ← → / A D to move, SPACE to shoot
            </div>
            <div>
              📱 <b>Mobile:</b> Use buttons below the game
            </div>
            <div>💀 Destroy all invaders to face the BOSS!</div>
            <div>🛸 Shoot the UFO for BONUS points!</div>
            <div>🛡️ Use barriers for protection</div>
          </div>

          <input
            data-ocid="space.input"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              localStorage.setItem(USERNAME_KEY, e.target.value);
            }}
            placeholder="Enter your username"
            maxLength={20}
            style={{
              background: "rgba(0,255,255,0.1)",
              border: "1px solid #0ff",
              borderRadius: 8,
              color: "#fff",
              padding: "10px 16px",
              fontSize: 15,
              width: "100%",
              marginBottom: 14,
              boxSizing: "border-box",
              outline: "none",
              textAlign: "center",
            }}
          />

          <button
            type="button"
            data-ocid="space.primary_button"
            onClick={startGame}
            style={{
              background: "linear-gradient(135deg, #0ff, #0af)",
              color: "#000",
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: 3,
              border: "none",
              borderRadius: 10,
              padding: "14px 40px",
              cursor: "pointer",
              width: "100%",
              marginBottom: 20,
              textShadow: "none",
              boxShadow: "0 0 18px #0ff8",
            }}
          >
            🚀 LAUNCH!
          </button>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div style={{ fontSize: 12, textAlign: "left" }}>
              <div
                style={{
                  color: "#fa0",
                  fontWeight: 700,
                  marginBottom: 6,
                  letterSpacing: 2,
                }}
              >
                🏆 TOP SCORES
              </div>
              {leaderboard.slice(0, 5).map((e, i) => (
                <div
                  key={`lb-${e.name}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: i === 0 ? "#ff0" : "#aaf",
                    padding: "2px 0",
                  }}
                >
                  <span>
                    {i + 1}. {e.name}
                  </span>
                  <span>{e.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Game Canvas */}
      {screen === "playing" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              display: "block",
              border: "1px solid #1a2a5a",
              borderRadius: 4,
            }}
          />
          {/* Mobile controls */}
          <div
            className="space-dpad"
            style={{
              display: "flex",
              gap: 12,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              data-ocid="space.toggle"
              onTouchStart={() => {
                mobileLeft.current = true;
              }}
              onTouchEnd={() => {
                mobileLeft.current = false;
              }}
              onMouseDown={() => {
                mobileLeft.current = true;
              }}
              onMouseUp={() => {
                mobileLeft.current = false;
              }}
              style={btnStyle}
            >
              ◀
            </button>
            <button
              type="button"
              data-ocid="space.secondary_button"
              onTouchStart={() => {
                mobileShoot.current = true;
              }}
              onMouseDown={() => {
                mobileShoot.current = true;
              }}
              style={{
                ...btnStyle,
                background: "rgba(0,255,80,0.2)",
                border: "2px solid #0f8",
                color: "#0f8",
                fontSize: 22,
                padding: "14px 22px",
              }}
            >
              🔫
            </button>
            <button
              type="button"
              data-ocid="space.tab"
              onTouchStart={() => {
                mobileRight.current = true;
              }}
              onTouchEnd={() => {
                mobileRight.current = false;
              }}
              onMouseDown={() => {
                mobileRight.current = true;
              }}
              onMouseUp={() => {
                mobileRight.current = false;
              }}
              style={btnStyle}
            >
              ▶
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {screen === "gameover" && (
        <div style={{ textAlign: "center", maxWidth: 400, padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💥</div>
          <h2
            style={{
              fontSize: 36,
              color: "#f44",
              textShadow: "0 0 20px #f44",
              letterSpacing: 3,
              margin: "0 0 8px",
            }}
          >
            GAME OVER
          </h2>
          <div style={{ fontSize: 24, color: "#fa0", marginBottom: 20 }}>
            SCORE: {finalScore}
          </div>

          <input
            data-ocid="space.input"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              localStorage.setItem(USERNAME_KEY, e.target.value);
            }}
            placeholder="Your username"
            maxLength={20}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid #f44",
              borderRadius: 8,
              color: "#fff",
              padding: "10px 16px",
              fontSize: 15,
              width: "100%",
              marginBottom: 12,
              boxSizing: "border-box",
              textAlign: "center",
            }}
          />

          {!submitted ? (
            <button
              type="button"
              data-ocid="space.submit_button"
              onClick={handleSubmit}
              style={{
                background: "linear-gradient(135deg, #f44, #f80)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 16,
                border: "none",
                borderRadius: 10,
                padding: "12px 32px",
                cursor: "pointer",
                width: "100%",
                marginBottom: 10,
                letterSpacing: 2,
              }}
            >
              🏆 SUBMIT SCORE
            </button>
          ) : (
            <div
              data-ocid="space.success_state"
              style={{ color: "#0f8", fontWeight: 700, marginBottom: 10 }}
            >
              ✅ Score submitted!
            </div>
          )}

          <button
            type="button"
            data-ocid="space.secondary_button"
            onClick={startGame}
            style={{
              background: "rgba(0,255,255,0.15)",
              color: "#0ff",
              fontWeight: 700,
              fontSize: 15,
              border: "1px solid #0ff",
              borderRadius: 10,
              padding: "10px 24px",
              cursor: "pointer",
              width: "100%",
              marginBottom: 8,
              letterSpacing: 2,
            }}
          >
            🔄 PLAY AGAIN
          </button>

          <button
            type="button"
            data-ocid="space.cancel_button"
            onClick={onBack}
            style={{
              background: "transparent",
              color: "#aaa",
              border: "1px solid #555",
              borderRadius: 10,
              padding: "10px 24px",
              cursor: "pointer",
              width: "100%",
              fontSize: 14,
            }}
          >
            🏠 Back to Menu
          </button>

          {leaderboard.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, textAlign: "left" }}>
              <div style={{ color: "#fa0", fontWeight: 700, marginBottom: 6 }}>
                🏆 TOP SCORES
              </div>
              {leaderboard.slice(0, 5).map((e, i) => (
                <div
                  key={`lb-${e.name}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: i === 0 ? "#ff0" : "#aaf",
                    padding: "2px 0",
                  }}
                >
                  <span>
                    {i + 1}. {e.name}
                  </span>
                  <span>{e.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Victory Screen */}
      {screen === "victory" && (
        <div style={{ textAlign: "center", maxWidth: 400, padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <h2
            style={{
              fontSize: 32,
              color: "#0f8",
              textShadow: "0 0 20px #0f8",
              letterSpacing: 3,
              margin: "0 0 8px",
            }}
          >
            WAVE CLEARED!
          </h2>
          <div style={{ color: "#fa0", fontSize: 20, marginBottom: 6 }}>
            BOSS DEFEATED! +500
          </div>
          <div style={{ fontSize: 22, color: "#0ff", marginBottom: 24 }}>
            SCORE: {finalScore}
          </div>
          <button
            type="button"
            data-ocid="space.primary_button"
            onClick={nextWave}
            style={{
              background: "linear-gradient(135deg, #0f8, #0af)",
              color: "#000",
              fontWeight: 900,
              fontSize: 18,
              border: "none",
              borderRadius: 10,
              padding: "14px 40px",
              cursor: "pointer",
              width: "100%",
              marginBottom: 10,
              letterSpacing: 2,
            }}
          >
            ⚡ NEXT WAVE
          </button>
          <button
            type="button"
            data-ocid="space.cancel_button"
            onClick={onBack}
            style={{
              background: "transparent",
              color: "#aaa",
              border: "1px solid #555",
              borderRadius: 10,
              padding: "10px 24px",
              cursor: "pointer",
              width: "100%",
              fontSize: 14,
            }}
          >
            🏠 Back to Menu
          </button>
        </div>
      )}

      {/* Hidden canvas for game state (always mount to avoid ref issues) */}
      {screen !== "playing" && (
        <canvas
          ref={canvasRef}
          width={1}
          height={1}
          style={{ display: "none" }}
        />
      )}

      <style>{`
        .space-dpad { display: flex; }
        @media (hover: hover) and (pointer: fine) { .space-dpad { display: none !important; } }
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "rgba(0,180,255,0.15)",
  border: "2px solid #4af",
  borderRadius: 10,
  color: "#4af",
  fontSize: 24,
  padding: "14px 20px",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};
