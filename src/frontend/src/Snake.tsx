import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";

const GRID = 20;
const CELL = 20;
const HUD_HEIGHT = 60;
const CANVAS_SIZE = GRID * CELL;

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

interface Pt {
  x: number;
  y: number;
}

type Phase =
  | "start"
  | "username"
  | "playing"
  | "dead"
  | "gameOver"
  | "leaderboard";

interface ScoreEntry {
  playerName: string;
  score: bigint;
}

function randFood(snake: Pt[]): Pt {
  let pt: Pt;
  do {
    pt = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  } while (snake.some((s) => s.x === pt.x && s.y === pt.y));
  return pt;
}

export default function Snake({ onBack }: { onBack?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const stateRef = useRef({
    phase: "start" as Phase,
    snake: [
      { x: 12, y: 10 },
      { x: 11, y: 10 },
      { x: 10, y: 10 },
    ] as Pt[],
    dir: "RIGHT" as Dir,
    nextDir: "RIGHT" as Dir,
    food: { x: 15, y: 10 } as Pt,
    score: 0,
    level: 1,
    lives: 3,
    foodEaten: 0,
    tickInterval: 150,
    lastTick: 0,
    deadTimer: 0,
    tokenPrice: "",
    tokenImg: null as HTMLImageElement | null,
    frame: 0,
  });

  const [phase, setPhase] = useState<Phase>("start");
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const { actor } = useActor();
  const rafRef = useRef<number>(0);
  const tokenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = "/assets/uploads/19943_11zon-2-1.png";
    img.onload = () => {
      bgImageRef.current = img;
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("odinSnakeUsername") || "";
    setUsername(saved);
  }, []);

  useEffect(() => {
    const s = stateRef.current;
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

  function initGame() {
    const s = stateRef.current;
    s.snake = [
      { x: 12, y: 10 },
      { x: 11, y: 10 },
      { x: 10, y: 10 },
    ];
    s.dir = "RIGHT";
    s.nextDir = "RIGHT";
    s.food = randFood(s.snake);
    s.score = 0;
    s.level = 1;
    s.lives = 3;
    s.foodEaten = 0;
    s.tickInterval = 150;
    s.lastTick = 0;
  }

  function respawn() {
    const s = stateRef.current;
    s.snake = [
      { x: 12, y: 10 },
      { x: 11, y: 10 },
      { x: 10, y: 10 },
    ];
    s.dir = "RIGHT";
    s.nextDir = "RIGHT";
    s.food = randFood(s.snake);
  }

  function tick() {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    s.dir = s.nextDir;
    const head = s.snake[0];
    let nx = head.x;
    let ny = head.y;
    if (s.dir === "UP") ny--;
    else if (s.dir === "DOWN") ny++;
    else if (s.dir === "LEFT") nx--;
    else nx++;
    // Wall collision
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      s.lives--;
      if (s.lives <= 0) {
        s.phase = "gameOver";
        setPhase("gameOver");
      } else {
        s.phase = "dead";
        s.deadTimer = 60;
        setPhase("dead");
      }
      return;
    }
    // Self collision
    if (s.snake.some((seg) => seg.x === nx && seg.y === ny)) {
      s.lives--;
      if (s.lives <= 0) {
        s.phase = "gameOver";
        setPhase("gameOver");
      } else {
        s.phase = "dead";
        s.deadTimer = 60;
        setPhase("dead");
      }
      return;
    }
    const ate = nx === s.food.x && ny === s.food.y;
    const newSnake = [{ x: nx, y: ny }, ...s.snake];
    if (!ate) newSnake.pop();
    s.snake = newSnake;
    if (ate) {
      s.score += 10;
      s.foodEaten++;
      s.food = randFood(s.snake);
      if (s.foodEaten % 5 === 0) {
        s.level++;
        s.tickInterval = Math.max(60, s.tickInterval - 15);
      }
    }
  }

  function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const s = stateRef.current;
    ctx.clearRect(0, 0, cw, ch);
    // Background
    if (bgImageRef.current) {
      ctx.globalAlpha = 0.18;
      ctx.drawImage(bgImageRef.current, 0, 0, cw, ch);
      ctx.globalAlpha = 1.0;
    }
    ctx.fillStyle = "rgba(10,10,46,0.7)";
    ctx.fillRect(0, 0, cw, ch);
    // Grid lines
    ctx.strokeStyle = "rgba(0,255,136,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      const x = i * CELL;
      const y = HUD_HEIGHT + i * CELL;
      ctx.beginPath();
      ctx.moveTo(x, HUD_HEIGHT);
      ctx.lineTo(x, HUD_HEIGHT + GRID * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GRID * CELL, y);
      ctx.stroke();
    }
    // Visible wall border
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ff4444";
    ctx.shadowBlur = 8;
    ctx.strokeRect(2, HUD_HEIGHT + 2, GRID * CELL - 4, GRID * CELL - 4);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    // Snake
    for (let i = 0; i < s.snake.length; i++) {
      const seg = s.snake[i];
      const t = 1 - i / s.snake.length;
      const g = Math.round(180 + 75 * t);
      ctx.fillStyle = i === 0 ? "#00ff88" : `rgb(0,${g},100)`;
      ctx.shadowColor = i === 0 ? "#00ff88" : "transparent";
      ctx.shadowBlur = i === 0 ? 8 : 0;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(
        seg.x * CELL + pad,
        HUD_HEIGHT + seg.y * CELL + pad,
        CELL - pad * 2,
        CELL - pad * 2,
        i === 0 ? 4 : 3,
      );
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // Eyes on head
    if (s.snake.length > 0) {
      const head = s.snake[0];
      const hx = head.x * CELL + CELL / 2;
      const hy = HUD_HEIGHT + head.y * CELL + CELL / 2;
      const eyePositions =
        s.dir === "RIGHT"
          ? [
              { ex: hx + 3, ey: hy - 3 },
              { ex: hx + 3, ey: hy + 3 },
            ]
          : s.dir === "LEFT"
            ? [
                { ex: hx - 3, ey: hy - 3 },
                { ex: hx - 3, ey: hy + 3 },
              ]
            : s.dir === "UP"
              ? [
                  { ex: hx - 3, ey: hy - 3 },
                  { ex: hx + 3, ey: hy - 3 },
                ]
              : [
                  { ex: hx - 3, ey: hy + 3 },
                  { ex: hx + 3, ey: hy + 3 },
                ];
      for (const { ex, ey } of eyePositions) {
        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#000";
        ctx.fill();
      }
    }
    // Food (Bitcoin coin)
    const fx = s.food.x * CELL + CELL / 2;
    const fy = HUD_HEIGHT + s.food.y * CELL + CELL / 2;
    const t2 = Date.now() / 400;
    const pulse = 1 + Math.sin(t2) * 0.08;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, CELL * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = "#ff8800";
    ctx.shadowColor = "#ff8800";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `bold ${CELL * 0.5}px monospace`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₿", 0, 1);
    ctx.restore();
    // HUD
    drawHUD(ctx, cw, s);
    // Dead flash overlay
    if (s.phase === "dead" && s.deadTimer > 0 && s.deadTimer % 10 < 5) {
      ctx.fillStyle = "rgba(255,50,50,0.2)";
      ctx.fillRect(0, HUD_HEIGHT, cw, ch - HUD_HEIGHT);
    }
  }

  function drawHUD(
    ctx: CanvasRenderingContext2D,
    cw: number,
    s: typeof stateRef.current,
  ) {
    ctx.fillStyle = "#050520";
    ctx.fillRect(0, 0, cw, HUD_HEIGHT);
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(cw, HUD_HEIGHT);
    ctx.stroke();
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${s.score}`, 10, 22);
    ctx.fillStyle = "#00ff88";
    ctx.textAlign = "center";
    ctx.fillText(`LEVEL ${s.level}`, cw / 2, 22);
    // Lives (hearts)
    ctx.font = "14px monospace";
    for (let i = 0; i < s.lives; i++) {
      ctx.fillText("❤", cw - 16 - i * 22, 22);
    }
    if (s.tokenPrice) {
      const txt = `ODINMARIO ${s.tokenPrice}`;
      ctx.font = "10px monospace";
      ctx.fillStyle = "#aaffaa";
      ctx.textAlign = "left";
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: game loop
  const loop = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;
    s.frame++;
    if (s.phase === "dead") {
      s.deadTimer--;
      if (s.deadTimer <= 0) {
        respawn();
        s.phase = "playing";
        setPhase("playing");
      }
    }
    if (s.phase === "playing") {
      if (ts - s.lastTick >= s.tickInterval) {
        s.lastTick = ts;
        tick();
      }
    }
    draw(ctx, canvas.width, canvas.height);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE + HUD_HEIGHT;
    }
    resize();
  }, []);

  useEffect(() => {
    if (phase === "playing" || phase === "dead") {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, loop]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const d = s.dir;
      if (
        (e.key === "ArrowUp" || e.key === "w" || e.key === "W") &&
        d !== "DOWN"
      )
        s.nextDir = "UP";
      if (
        (e.key === "ArrowDown" || e.key === "s" || e.key === "S") &&
        d !== "UP"
      )
        s.nextDir = "DOWN";
      if (
        (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") &&
        d !== "RIGHT"
      )
        s.nextDir = "LEFT";
      if (
        (e.key === "ArrowRight" || e.key === "d" || e.key === "D") &&
        d !== "LEFT"
      )
        s.nextDir = "RIGHT";
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function startGame(name: string) {
    void name;
    initGame();
    stateRef.current.phase = "playing";
    setPhase("playing");
  }

  function handlePlay() {
    const savedName = localStorage.getItem("odinSnakeUsername") || "";
    if (savedName) {
      setUsername(savedName);
      startGame(savedName);
    } else {
      stateRef.current.phase = "username";
      setPhase("username");
    }
  }

  function handleSaveName() {
    const name = inputName.trim() || "Player";
    localStorage.setItem("odinSnakeUsername", name);
    setUsername(name);
    startGame(name);
  }

  async function handleSubmitScore() {
    const s = stateRef.current;
    const name =
      username || localStorage.getItem("odinSnakeUsername") || "Player";
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
    background: "rgba(10,10,46,0.9)",
    border: "2px solid #00ff88",
    borderRadius: 10,
    color: "#00ff88",
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
        alignItems: "center",
        background: "#0a0a2e",
        overflow: "hidden",
      }}
    >
      {/* Canvas area */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ display: "block", imageRendering: "pixelated" }}
          />

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
                  width: 90,
                  height: 90,
                  objectFit: "contain",
                  marginBottom: 12,
                }}
              />
              <h1
                style={{
                  color: "#00ff88",
                  fontSize: "clamp(18px,4vw,30px)",
                  textShadow: "0 0 20px #00ff88",
                  margin: 0,
                  letterSpacing: 3,
                }}
              >
                ODIN SNAKE
              </h1>
              <p
                style={{
                  color: "#aaffaa",
                  fontSize: 11,
                  marginTop: 6,
                  opacity: 0.8,
                }}
              >
                Collect ₿ Bitcoin coins!
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 28,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  data-ocid="snake.play.primary_button"
                  onClick={handlePlay}
                  style={{
                    background: "#00ff88",
                    border: "none",
                    borderRadius: 8,
                    color: "#0a0a2e",
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
                  data-ocid="snake.leaderboard.secondary_button"
                  onClick={handleShowLeaderboard}
                  style={{
                    background: "#001133",
                    border: "2px solid #00ff88",
                    borderRadius: 8,
                    color: "#00ff88",
                    padding: "12px 28px",
                    cursor: "pointer",
                    fontSize: 14,
                    fontFamily: "monospace",
                  }}
                >
                  🏆 LEADERBOARD
                </button>
              </div>
              {onBack && (
                <button
                  type="button"
                  data-ocid="snake.back.secondary_button"
                  onClick={onBack}
                  style={{
                    marginTop: 16,
                    background: "transparent",
                    border: "2px solid #444",
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
              <h2
                style={{
                  color: "#00ff88",
                  marginBottom: 16,
                  fontSize: 18,
                }}
              >
                Enter Your Name
              </h2>
              <input
                data-ocid="snake.username.input"
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
                  border: "2px solid #00ff88",
                  background: "#050520",
                  color: "white",
                  width: 200,
                  textAlign: "center",
                  outline: "none",
                }}
              />
              <button
                type="button"
                data-ocid="snake.save_name.primary_button"
                onClick={handleSaveName}
                style={{
                  marginTop: 16,
                  background: "#00ff88",
                  border: "none",
                  borderRadius: 8,
                  color: "#0a0a2e",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "monospace",
                  fontWeight: "bold",
                }}
              >
                Save &amp; Play
              </button>
            </div>
          )}

          {phase === "gameOver" && (
            <div style={overlayStyle}>
              <h2
                style={{
                  color: "#ff4444",
                  fontSize: 26,
                  marginBottom: 8,
                  textShadow: "0 0 20px #ff4444",
                }}
              >
                GAME OVER
              </h2>
              <p style={{ color: "white", fontSize: 18 }}>
                Score: {stateRef.current.score}
              </p>
              <p style={{ color: "#00ff88", fontSize: 14 }}>
                Level: {stateRef.current.level}
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
                  data-ocid="snake.submit_score.primary_button"
                  onClick={handleSubmitScore}
                  disabled={submitting}
                  style={{
                    background: "#00ff88",
                    border: "none",
                    borderRadius: 8,
                    color: "#0a0a2e",
                    padding: "10px 24px",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: "bold",
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Submitting..." : "Submit Score"}
                </button>
                <button
                  type="button"
                  data-ocid="snake.play_again.secondary_button"
                  onClick={handlePlay}
                  style={{
                    background: "#001133",
                    border: "2px solid #00ff88",
                    borderRadius: 8,
                    color: "#00ff88",
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
              <h2
                style={{
                  color: "#00ff88",
                  marginBottom: 16,
                  fontSize: 20,
                }}
              >
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
                    data-ocid={`snake.leaderboard.item.${i + 1}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 12px",
                      background:
                        i === 0
                          ? "rgba(0,255,136,0.15)"
                          : "rgba(255,255,255,0.05)",
                      borderRadius: 6,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: i === 0 ? "#00ff88" : "white" }}>
                      #{i + 1} {s.playerName}
                    </span>
                    <span style={{ color: "#ff8800", fontWeight: "bold" }}>
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
                  data-ocid="snake.play_again.primary_button"
                  onClick={handlePlay}
                  style={{
                    background: "#00ff88",
                    border: "none",
                    borderRadius: 8,
                    color: "#0a0a2e",
                    padding: "10px 24px",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  Play Again
                </button>
                <button
                  type="button"
                  data-ocid="snake.back_to_menu.secondary_button"
                  onClick={() => {
                    setPhase("start");
                    stateRef.current.phase = "start";
                  }}
                  style={{
                    background: "#111",
                    border: "2px solid #444",
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
      </div>

      {/* D-PAD for mobile - below game */}
      {(phase === "playing" || phase === "dead") && isTouchDevice && (
        <div
          style={{
            height: 220,
            background: "#050520",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: "100%",
            borderTop: "1px solid #00ff8833",
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
                const s = stateRef.current;
                if (s.dir !== "DOWN") s.nextDir = "UP";
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
                const s = stateRef.current;
                if (s.dir !== "RIGHT") s.nextDir = "LEFT";
                navigator.vibrate?.(30);
              }}
              style={dpadBtnStyle}
            >
              ◀
            </button>
            <div
              style={{ background: "rgba(0,255,136,0.05)", borderRadius: 8 }}
            />
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                const s = stateRef.current;
                if (s.dir !== "LEFT") s.nextDir = "RIGHT";
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
                const s = stateRef.current;
                if (s.dir !== "UP") s.nextDir = "DOWN";
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
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "1px",
          fontFamily: "monospace",
          padding: "4px 0 6px",
        }}
      >
        Built by ODINMARIO
      </div>
    </div>
  );
}
