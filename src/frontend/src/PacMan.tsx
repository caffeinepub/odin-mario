import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";

// Maze: 1=wall, 0=empty, 2=pellet, 3=powerPellet, 4=ghostHouse
const MAZE_TEMPLATE: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  [1, 1, 1, 1, 2, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 1, 0, 1, 4, 4, 4, 4, 4, 1, 0, 1, 2, 1, 1, 1, 1],
  [0, 0, 0, 0, 2, 0, 0, 1, 4, 4, 4, 4, 4, 1, 0, 0, 2, 0, 0, 0, 0],
  [1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 3, 2, 1, 2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 1, 2, 3, 1],
  [1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1],
  [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const ROWS = MAZE_TEMPLATE.length;
const COLS = MAZE_TEMPLATE[0].length;
const HUD_HEIGHT = 60;

type Dir = { x: number; y: number };
const DIR_RIGHT: Dir = { x: 1, y: 0 };
const DIR_LEFT: Dir = { x: -1, y: 0 };
const DIR_UP: Dir = { x: 0, y: -1 };
const DIR_DOWN: Dir = { x: 0, y: 1 };

interface Ghost {
  x: number;
  y: number;
  px: number;
  py: number;
  dir: Dir;
  color: string;
  frightened: boolean;
  eaten: boolean;
  moveTimer: number;
  moveInterval: number;
}

type GamePhase =
  | "start"
  | "username"
  | "playing"
  | "dead"
  | "levelComplete"
  | "gameOver"
  | "leaderboard";

interface ScoreEntry {
  playerName: string;
  score: bigint;
}

function cloneMaze(): number[][] {
  return MAZE_TEMPLATE.map((row) => [...row]);
}

function countPellets(maze: number[][]): number {
  let count = 0;
  for (const row of maze) {
    for (const cell of row) {
      if (cell === 2 || cell === 3) count++;
    }
  }
  return count;
}

export default function PacMan({ onBack }: { onBack?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    phase: "start" as GamePhase,
    maze: cloneMaze(),
    totalPellets: countPellets(MAZE_TEMPLATE),
    pelletsLeft: countPellets(MAZE_TEMPLATE),
    score: 0,
    lives: 3,
    level: 1,
    px: 10,
    py: 16,
    ppx: 10,
    ppy: 16,
    pDir: DIR_RIGHT as Dir,
    pNextDir: DIR_RIGHT as Dir,
    pMoveTimer: 0,
    pMoveInterval: 10,
    mouthAngle: 0,
    mouthDir: 1,
    frightenedTimer: 0,
    ghostEatChain: 0,
    ghosts: [] as Ghost[],
    deadTimer: 0,
    levelTimer: 0,
    blinkTimer: 0,
    tokenPrice: "",
    tokenImg: null as HTMLImageElement | null,
    logoImg: null as HTMLImageElement | null,
    frame: 0,
  });

  const [phase, setPhase] = useState<GamePhase>("start");
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
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

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent =
      "@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("odinPacManUsername") || "";
    setUsername(saved);
  }, []);

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

  function initGhosts(level: number): Ghost[] {
    const speed = Math.max(6, 12 - level);
    return [
      {
        x: 9,
        y: 9,
        px: 9,
        py: 9,
        dir: DIR_LEFT,
        color: "#ff0000",
        frightened: false,
        eaten: false,
        moveTimer: 0,
        moveInterval: speed,
      },
      {
        x: 10,
        y: 9,
        px: 10,
        py: 9,
        dir: DIR_RIGHT,
        color: "#ffaacc",
        frightened: false,
        eaten: false,
        moveTimer: 0,
        moveInterval: speed + 1,
      },
      {
        x: 11,
        y: 9,
        px: 11,
        py: 9,
        dir: DIR_UP,
        color: "#00ffff",
        frightened: false,
        eaten: false,
        moveTimer: 0,
        moveInterval: speed + 2,
      },
      {
        x: 10,
        y: 10,
        px: 10,
        py: 10,
        dir: DIR_DOWN,
        color: "#ffaa00",
        frightened: false,
        eaten: false,
        moveTimer: 0,
        moveInterval: speed + 3,
      },
    ];
  }

  function initLevel(level: number) {
    const s = stateRef.current;
    s.maze = cloneMaze();
    s.pelletsLeft = countPellets(s.maze);
    s.px = 10;
    s.py = 16;
    s.ppx = 10;
    s.ppy = 16;
    s.pDir = DIR_RIGHT;
    s.pNextDir = DIR_RIGHT;
    s.pMoveTimer = 0;
    s.pMoveInterval = Math.max(5, 10 - Math.floor(level / 2));
    s.frightenedTimer = 0;
    s.ghostEatChain = 0;
    s.ghosts = initGhosts(level);
  }

  function canMove(maze: number[][], x: number, y: number): boolean {
    if (y < 0 || y >= ROWS) return false;
    const nx = ((x % COLS) + COLS) % COLS;
    return maze[y][nx] !== 1;
  }

  function getOpposite(dir: Dir): Dir {
    return { x: -dir.x, y: -dir.y };
  }

  function ghostAI(ghost: Ghost, s: typeof stateRef.current): Dir {
    const { px, py, maze } = s;
    const dirs: Dir[] = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];
    const opp = getOpposite(ghost.dir);
    const valid = dirs.filter((d) => {
      if (d.x === opp.x && d.y === opp.y) return false;
      const nx = (((ghost.x + d.x) % COLS) + COLS) % COLS;
      const ny = ghost.y + d.y;
      return (
        canMove(maze, nx, ny) &&
        maze[Math.max(0, Math.min(ROWS - 1, ny))][nx] !== 4
      );
    });
    if (valid.length === 0) return opp;
    if (ghost.frightened || ghost.eaten)
      return valid[Math.floor(Math.random() * valid.length)];
    if (ghost.color === "#ff0000") {
      return valid.sort((a, b) => {
        const da = Math.abs(ghost.x + a.x - px) + Math.abs(ghost.y + a.y - py);
        const db = Math.abs(ghost.x + b.x - px) + Math.abs(ghost.y + b.y - py);
        return da - db;
      })[0];
    }
    if (Math.random() < 0.6) {
      return valid.sort((a, b) => {
        const da = Math.abs(ghost.x + a.x - px) + Math.abs(ghost.y + a.y - py);
        const db = Math.abs(ghost.x + b.x - px) + Math.abs(ghost.y + b.y - py);
        return da - db;
      })[0];
    }
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function update() {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    s.frame++;
    s.blinkTimer++;
    s.mouthAngle += 0.15 * s.mouthDir;
    if (s.mouthAngle > 0.4) s.mouthDir = -1;
    if (s.mouthAngle < 0.01) s.mouthDir = 1;
    if (s.frightenedTimer > 0) {
      s.frightenedTimer--;
      if (s.frightenedTimer === 0) {
        for (const g of s.ghosts) {
          g.frightened = false;
          g.eaten = false;
        }
        s.ghostEatChain = 0;
      }
    }
    s.pMoveTimer++;
    if (s.pMoveTimer >= s.pMoveInterval) {
      s.pMoveTimer = 0;
      const nx = (((s.px + s.pNextDir.x) % COLS) + COLS) % COLS;
      const ny = s.py + s.pNextDir.y;
      if (canMove(s.maze, nx, ny)) s.pDir = s.pNextDir;
      const mx = (((s.px + s.pDir.x) % COLS) + COLS) % COLS;
      const my = s.py + s.pDir.y;
      if (canMove(s.maze, mx, my)) {
        s.ppx = s.px;
        s.ppy = s.py;
        s.px = mx;
        s.py = my;
      }
      const cell = s.maze[s.py][s.px];
      if (cell === 2) {
        s.maze[s.py][s.px] = 0;
        s.score += 10;
        s.pelletsLeft--;
      } else if (cell === 3) {
        s.maze[s.py][s.px] = 0;
        s.score += 50;
        s.pelletsLeft--;
        s.frightenedTimer = 300;
        s.ghostEatChain = 0;
        for (const g of s.ghosts) {
          if (!g.eaten) g.frightened = true;
        }
      }
      if (s.pelletsLeft <= 0) {
        s.phase = "levelComplete";
        s.levelTimer = 120;
        setPhase("levelComplete");
        return;
      }
    }
    for (const g of s.ghosts) {
      g.moveTimer++;
      const effectiveInterval = g.eaten ? 4 : g.moveInterval;
      if (g.moveTimer >= effectiveInterval) {
        g.moveTimer = 0;
        g.dir = ghostAI(g, s);
        const nx = (((g.x + g.dir.x) % COLS) + COLS) % COLS;
        const ny = g.y + g.dir.y;
        if (
          ny >= 0 &&
          ny < ROWS &&
          s.maze[ny][((nx % COLS) + COLS) % COLS] !== 1
        ) {
          g.px = g.x;
          g.py = g.y;
          g.x = nx;
          g.y = ny;
        }
        if (g.eaten && g.x === 10 && g.y === 9) {
          g.eaten = false;
          g.frightened = false;
        }
      }
      if (g.x === s.px && g.y === s.py) {
        if (g.frightened) {
          g.eaten = true;
          g.frightened = false;
          s.ghostEatChain++;
          s.score += 200 * 2 ** (s.ghostEatChain - 1);
        } else if (!g.eaten) {
          s.lives--;
          if (s.lives <= 0) {
            s.phase = "gameOver";
            setPhase("gameOver");
          } else {
            s.phase = "dead";
            s.deadTimer = 90;
            setPhase("dead");
          }
          return;
        }
      }
    }
  }

  function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const s = stateRef.current;
    ctx.clearRect(0, 0, cw, ch);
    const cellW = cw / COLS;
    const cellH = (ch - HUD_HEIGHT) / ROWS;
    const cell = Math.min(cellW, cellH);
    const offX = (cw - cell * COLS) / 2;
    const offY = HUD_HEIGHT + (ch - HUD_HEIGHT - cell * ROWS) / 2;
    if (bgImageRef.current) {
      ctx.globalAlpha = 0.15;
      ctx.drawImage(bgImageRef.current, 0, 0, cw, ch);
      ctx.globalAlpha = 1.0;
    }
    ctx.fillStyle = "rgba(0,0,17,0.82)";
    ctx.fillRect(0, 0, cw, ch);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = s.maze[row][col];
        const cx = offX + col * cell;
        const cy = offY + row * cell;
        if (v === 1) {
          ctx.fillStyle = "#1a1aaa";
          ctx.fillRect(cx, cy, cell, cell);
          ctx.strokeStyle = "#4444ff";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
        } else if (v === 2) {
          ctx.beginPath();
          ctx.arc(cx + cell / 2, cy + cell / 2, cell * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = "#ffaa44";
          ctx.fill();
        } else if (v === 3) {
          const t = Date.now() / 300;
          const r = cell * 0.22 + Math.sin(t) * cell * 0.05;
          ctx.beginPath();
          ctx.arc(cx + cell / 2, cy + cell / 2, r, 0, Math.PI * 2);
          ctx.fillStyle = "#ffdd00";
          ctx.shadowColor = "#ffaa00";
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (v === 4) {
          ctx.fillStyle = "#220044";
          ctx.fillRect(cx, cy, cell, cell);
        }
      }
    }
    const pl = {
      cx: offX + s.px * cell + cell / 2,
      cy: offY + s.py * cell + cell / 2,
      r: cell * 0.42,
    };
    const angle = Math.atan2(s.pDir.y, s.pDir.x);
    const mouth = s.mouthAngle * Math.PI;
    ctx.beginPath();
    ctx.moveTo(pl.cx, pl.cy);
    ctx.arc(pl.cx, pl.cy, pl.r, angle + mouth, angle + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fillStyle = "#ffdd00";
    ctx.shadowColor = "#ffaa00";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    const eyeAngle = angle - Math.PI / 4;
    ctx.beginPath();
    ctx.arc(
      pl.cx + Math.cos(eyeAngle) * pl.r * 0.5,
      pl.cy + Math.sin(eyeAngle) * pl.r * 0.5,
      pl.r * 0.15,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#000";
    ctx.fill();
    for (const g of s.ghosts) {
      const gx = offX + g.x * cell + cell / 2;
      const gy = offY + g.y * cell + cell / 2;
      const gr = cell * 0.42;
      let color = g.color;
      if (g.eaten) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(gx - gr * 0.25, gy - gr * 0.1, gr * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx + gr * 0.25, gy - gr * 0.1, gr * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0066ff";
        ctx.beginPath();
        ctx.arc(gx - gr * 0.25, gy - gr * 0.1, gr * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx + gr * 0.25, gy - gr * 0.1, gr * 0.1, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (g.frightened) {
        color =
          s.frightenedTimer < 80 && s.blinkTimer % 20 < 10
            ? "white"
            : "#4444ff";
      }
      ctx.beginPath();
      ctx.arc(gx, gy - gr * 0.1, gr, Math.PI, 0);
      ctx.lineTo(gx + gr, gy + gr);
      const segments = 3;
      for (let i = segments; i >= 0; i--) {
        const wx = gx - gr + (i * 2 * gr) / segments;
        const bump = i % 2 === 0 ? gy + gr : gy + gr * 0.6;
        ctx.lineTo(wx, bump);
      }
      ctx.lineTo(gx - gr, gy + gr);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!g.frightened) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(gx - gr * 0.28, gy - gr * 0.2, gr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx + gr * 0.28, gy - gr * 0.2, gr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0000cc";
        ctx.beginPath();
        ctx.arc(gx - gr * 0.28, gy - gr * 0.2, gr * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx + gr * 0.28, gy - gr * 0.2, gr * 0.11, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx - gr * 0.4, gy + gr * 0.1);
        ctx.lineTo(gx - gr * 0.2, gy - gr * 0.1);
        ctx.lineTo(gx, gy + gr * 0.1);
        ctx.lineTo(gx + gr * 0.2, gy - gr * 0.1);
        ctx.lineTo(gx + gr * 0.4, gy + gr * 0.1);
        ctx.stroke();
      }
    }
    drawHUD(ctx, cw, s);
  }

  function drawHUD(
    ctx: CanvasRenderingContext2D,
    cw: number,
    s: typeof stateRef.current,
  ) {
    ctx.fillStyle = "#000022";
    ctx.fillRect(0, 0, cw, HUD_HEIGHT);
    ctx.strokeStyle = "#4444ff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(cw, HUD_HEIGHT);
    ctx.stroke();
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`SCORE: ${s.score}`, 10, 22);
    ctx.fillStyle = "#ffdd00";
    ctx.fillText(`LEVEL ${s.level}`, cw / 2 - 30, 22);
    for (let i = 0; i < s.lives; i++) {
      ctx.beginPath();
      ctx.arc(cw - 20 - i * 22, 20, 8, 0.3, Math.PI * 2 - 0.3);
      ctx.closePath();
      ctx.fillStyle = "#ffdd00";
      ctx.fill();
    }
    if (s.tokenPrice) {
      const txt = `ODINMARIO ${s.tokenPrice}`;
      ctx.font = "10px monospace";
      ctx.fillStyle = "#aaffaa";
      if (s.tokenImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(10, 44, 10, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(s.tokenImg, 0, 34, 20, 20);
        ctx.restore();
        ctx.fillText(txt, 24, 48);
      } else {
        ctx.fillText(txt, 10, 48);
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: game loop intentionally has no deps
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;
    if (s.phase === "dead") {
      s.deadTimer--;
      if (s.deadTimer <= 0) {
        s.px = 10;
        s.py = 16;
        s.pDir = DIR_RIGHT;
        s.pNextDir = DIR_RIGHT;
        s.ghosts = initGhosts(s.level);
        s.frightenedTimer = 0;
        s.phase = "playing";
        setPhase("playing");
      }
    }
    if (s.phase === "levelComplete") {
      s.levelTimer--;
      if (s.levelTimer <= 0) {
        s.level++;
        initLevel(s.level);
        s.phase = "playing";
        setPhase("playing");
      }
    }
    update();
    draw(ctx, canvas.width, canvas.height);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Canvas resize - use container dimensions
  useEffect(() => {
    function resize() {
      const c = canvasRef.current;
      const container = containerRef.current;
      if (!c || !container) return;
      c.width = container.offsetWidth;
      c.height = container.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (phase === "playing" || phase === "dead" || phase === "levelComplete") {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, loop]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
        s.pNextDir = DIR_LEFT;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
        s.pNextDir = DIR_RIGHT;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W")
        s.pNextDir = DIR_UP;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S")
        s.pNextDir = DIR_DOWN;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touchStart = useRef({ x: 0, y: 0 });
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 30) s.pNextDir = DIR_RIGHT;
      else if (dx < -30) s.pNextDir = DIR_LEFT;
    } else {
      if (dy > 30) s.pNextDir = DIR_DOWN;
      else if (dy < -30) s.pNextDir = DIR_UP;
    }
  }

  function startGame(name: string) {
    const s = stateRef.current;
    s.score = 0;
    s.lives = 3;
    s.level = 1;
    initLevel(1);
    s.phase = "playing";
    setPhase("playing");
    void name;
  }

  function handlePlay() {
    const savedName = localStorage.getItem("odinPacManUsername") || "";
    if (savedName) {
      setUsername(savedName);
      startGame(savedName);
    } else {
      setPhase("username");
      stateRef.current.phase = "username";
    }
  }

  function handleSaveName() {
    const name = inputName.trim() || "Player";
    localStorage.setItem("odinPacManUsername", name);
    setUsername(name);
    startGame(name);
  }

  async function handleSubmitScore() {
    const s = stateRef.current;
    const name =
      username || localStorage.getItem("odinPacManUsername") || "Player";
    setSubmitting(true);
    try {
      await actor?.submitScore(name, BigInt(s.score));
      const top = (await actor?.getTop10Scores()) ?? [];
      setScores(top as ScoreEntry[]);
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
    setPhase("leaderboard");
    stateRef.current.phase = "leaderboard";
  }

  async function handleShowLeaderboard() {
    try {
      const top = (await actor?.getTop10Scores()) ?? [];
      setScores(top as ScoreEntry[]);
    } catch (e) {
      console.error(e);
    }
    setPhase("leaderboard");
    stateRef.current.phase = "leaderboard";
  }

  const dpadBtnStyle: React.CSSProperties = {
    background: "rgba(20,20,40,0.85)",
    border: "2px solid #ff6600",
    borderRadius: 10,
    color: "#ff6600",
    fontSize: 24,
    fontWeight: "bold",
    cursor: "pointer",
    touchAction: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    width: 64,
    height: 64,
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
    background: "rgba(0,0,20,0.92)",
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
        background: "#000011",
        overflow: "hidden",
      }}
    >
      {/* Canvas area - takes all remaining space */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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

        {phase === "start" && (
          <div style={overlayStyle}>
            <img
              src="/assets/uploads/19943_11zon-1-1.png"
              alt="Odin"
              style={{
                width: 100,
                height: 100,
                objectFit: "contain",
                marginBottom: 16,
              }}
            />
            <h1
              style={{
                color: "#ff6600",
                fontSize: "clamp(16px,4vw,28px)",
                textShadow: "0 0 20px #ff6600",
                margin: 0,
              }}
            >
              ODIN PAC-MAN
            </h1>
            <p
              style={{
                color: "#ffcc00",
                fontSize: "clamp(9px,2vw,12px)",
                marginTop: 8,
                animation: "blink 1s step-end infinite",
              }}
            >
              Building GameFi project on Odin.fun
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 32,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="pacman.play.primary_button"
                onClick={handlePlay}
                style={{
                  background: "#ff6600",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px 28px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                  fontWeight: "bold",
                }}
              >
                ▶ PLAY
              </button>
              <button
                type="button"
                data-ocid="pacman.leaderboard.secondary_button"
                onClick={handleShowLeaderboard}
                style={{
                  background: "#004488",
                  border: "2px solid #00aaff",
                  borderRadius: 8,
                  color: "white",
                  padding: "12px 28px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                }}
              >
                🏆 LEADERBOARD
              </button>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              <a
                href="https://x.com/odinmariogame"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "white",
                  textDecoration: "none",
                  fontSize: 13,
                  background: "#111",
                  border: "1px solid #444",
                  padding: "6px 14px",
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
                  fontSize: 13,
                  background: "#ffcc00",
                  padding: "6px 14px",
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
                data-ocid="pacman.back.secondary_button"
                onClick={onBack}
                style={{
                  marginTop: 16,
                  background: "transparent",
                  border: "2px solid #666",
                  borderRadius: 8,
                  color: "#aaa",
                  padding: "8px 20px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                ← Back to Mario
              </button>
            )}
          </div>
        )}

        {phase === "username" && (
          <div style={overlayStyle}>
            <h2 style={{ color: "#ffcc00", marginBottom: 16, fontSize: 18 }}>
              Enter Your Name
            </h2>
            <input
              data-ocid="pacman.username.input"
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
                border: "2px solid #ff6600",
                background: "#111",
                color: "white",
                width: 200,
                textAlign: "center",
                outline: "none",
              }}
            />
            <button
              type="button"
              data-ocid="pacman.save_name.primary_button"
              onClick={handleSaveName}
              style={{
                marginTop: 16,
                background: "#ff6600",
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

        {phase === "levelComplete" && (
          <div style={{ ...overlayStyle, background: "rgba(0,50,0,0.85)" }}>
            <h2 style={{ color: "#44ff44", fontSize: 24 }}>Level Complete!</h2>
            <p style={{ color: "white" }}>Score: {stateRef.current.score}</p>
            <p style={{ color: "#ffcc00" }}>Next level starting...</p>
          </div>
        )}

        {phase === "gameOver" && (
          <div style={overlayStyle}>
            <h2 style={{ color: "#ff4444", fontSize: 24, marginBottom: 8 }}>
              GAME OVER
            </h2>
            <p style={{ color: "white", fontSize: 18 }}>
              Score: {stateRef.current.score}
            </p>
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
                data-ocid="pacman.submit_score.primary_button"
                onClick={handleSubmitScore}
                disabled={submitting}
                style={{
                  background: "#ff6600",
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
                data-ocid="pacman.play_again.secondary_button"
                onClick={handlePlay}
                style={{
                  background: "#004488",
                  border: "2px solid #00aaff",
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
                  data-ocid={`pacman.leaderboard.item.${i + 1}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 12px",
                    background:
                      i === 0
                        ? "rgba(255,200,0,0.15)"
                        : "rgba(255,255,255,0.05)",
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: i === 0 ? "#ffcc00" : "white" }}>
                    #{i + 1} {s.playerName}
                  </span>
                  <span style={{ color: "#ff6600", fontWeight: "bold" }}>
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
                data-ocid="pacman.play_again.primary_button"
                onClick={handlePlay}
                style={{
                  background: "#ff6600",
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
                data-ocid="pacman.back_to_menu.secondary_button"
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

      {/* D-PAD for mobile - below the game canvas, NOT overlaying it */}
      {phase === "playing" && isTouchDevice && (
        <div
          style={{
            height: 220,
            background: "#000011",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            borderTop: "1px solid #222244",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "64px 64px 64px",
              gridTemplateRows: "64px 64px 64px",
              gap: 4,
            }}
          >
            <div />
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                stateRef.current.pNextDir = DIR_UP;
                navigator.vibrate?.(30);
              }}
              style={dpadBtnStyle}
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                stateRef.current.pNextDir = DIR_LEFT;
                navigator.vibrate?.(30);
              }}
              style={dpadBtnStyle}
            >
              ◀
            </button>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8 }} />
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                stateRef.current.pNextDir = DIR_RIGHT;
                navigator.vibrate?.(30);
              }}
              style={dpadBtnStyle}
            >
              ▶
            </button>
            <div />
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                stateRef.current.pNextDir = DIR_DOWN;
                navigator.vibrate?.(30);
              }}
              style={dpadBtnStyle}
            >
              ▼
            </button>
            <div />
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
