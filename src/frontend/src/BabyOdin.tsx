import { useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";
import { playEnemyDie, playGameOver, playHit, playJump } from "./utils/sounds";

interface BabyOdinProps {
  onBack: () => void;
}

declare global {
  interface Window {
    __odinUsername?: string;
  }
}

const CANVAS_W = 800;
const CANVAS_H = 400;
const GROUND_Y = CANVAS_H - 60;
const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const _BABY_X = 100; // kept for reference
const BABY_W = 48;
const BABY_H = 52;
const DUCK_H = 30;
const BOSS_TRIGGER_SCORE = 500;

type EnemyType = "troll" | "bat";
type Enemy = {
  x: number;
  y: number;
  w: number;
  h: number;
  type: EnemyType;
  hp: number;
};
type Coin = { x: number; y: number; collected: boolean };
type Cloud = { x: number; y: number; w: number; speed: number };
type IceBall = { x: number; y: number; vx: number; vy: number };
type Boss = {
  active: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invTimer: number;
  shootTimer: number;
  defeated: boolean;
  defeatTimer: number;
  entered: boolean;
  warningTimer: number;
};

interface GameState {
  running: boolean;
  over: boolean;
  score: number;
  lives: number;
  speed: number;
  babyY: number;
  babyVY: number;
  babyX: number;
  jumpsLeft: number;
  legAnim: number;
  isDucking: boolean;
  hammerSwing: number;
  enemies: Enemy[];
  coins: Coin[];
  clouds: Cloud[];
  iceBalls: IceBall[];
  spawnTimer: number;
  coinTimer: number;
  speedTimer: number;
  invincible: number;
  submitted: boolean;
  boss: Boss | null;
  bossTriggered: boolean;
  tick: number;
}

function initState(): GameState {
  return {
    running: false,
    over: false,
    score: 0,
    lives: 3,
    speed: 3,
    babyY: GROUND_Y - BABY_H,
    babyVY: 0,
    babyX: 100,
    jumpsLeft: 2,
    legAnim: 0,
    isDucking: false,
    hammerSwing: 0,
    enemies: [],
    coins: [],
    clouds: [
      { x: 80, y: 40, w: 90, speed: 0.3 },
      { x: 300, y: 70, w: 70, speed: 0.2 },
      { x: 550, y: 30, w: 110, speed: 0.4 },
      { x: 700, y: 60, w: 80, speed: 0.25 },
    ],
    iceBalls: [],
    spawnTimer: 80,
    coinTimer: 60,
    speedTimer: 0,
    invincible: 0,
    submitted: false,
    boss: null,
    bossTriggered: false,
    tick: 0,
  };
}

export default function BabyOdin({ onBack }: BabyOdinProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const tokenLogoRef = useRef<HTMLImageElement | null>(null);
  const babyImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const tokenPriceRef = useRef<string>("--");
  const { actor } = useActor();
  const actorRef = useRef<typeof actor>(null);

  const [phase, setPhase] = useState<
    "username" | "start" | "thanks" | "game" | "gameover" | "leaderboard"
  >("start");
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<
    { name: string; score: number }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const isMobile =
    typeof window !== "undefined" &&
    (window.innerWidth <= 768 || "ontouchstart" in window);

  useEffect(() => {
    if (actor) actorRef.current = actor;
  }, [actor]);

  // Load images
  useEffect(() => {
    const logo = new Image();
    logo.src = "/assets/uploads/19952_11zon-1.jpg";
    logo.onload = () => {
      tokenLogoRef.current = logo;
    };

    const baby = new Image();
    baby.src = "/assets/uploads/20260317_100519.jpg";
    baby.onload = () => {
      babyImgRef.current = baby;
    };

    const bg = new Image();
    bg.src = "/assets/uploads/9c686168-a296-463e-8b45-f650d0f60399-1.png";
    bg.onload = () => {
      bgImgRef.current = bg;
    };
  }, []);

  // Token price fetch
  useEffect(() => {
    const fetchPrice = () => {
      fetch("https://api.odin.fun/v1/token/2ip5")
        .then((r) => r.json())
        .then((d) => {
          if (d?.price != null) {
            const p = d.price / 1000;
            tokenPriceRef.current = p.toFixed(3);
          }
        })
        .catch(() => {});
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 10000);
    return () => clearInterval(iv);
  }, []);

  // Username init
  useEffect(() => {
    const saved = localStorage.getItem("odinmario_username");
    if (saved) {
      setUsername(saved);
      window.__odinUsername = saved;
    } else {
      setPhase("username");
    }
  }, []);

  const saveUsername = () => {
    const u = usernameInput.trim();
    if (!u) return;
    localStorage.setItem("odinmario_username", u);
    setUsername(u);
    window.__odinUsername = u;
    setPhase("start");
  };

  const fetchLeaderboard = async () => {
    if (!actorRef.current) return;
    try {
      const data = await (actorRef.current as any).getLeaderboard("babyodin");
      if (Array.isArray(data)) {
        const sorted = [...data]
          .map((e: any) => ({
            name: e.username || e.name || "?",
            score: Number(e.score),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
        setLeaderboard(sorted);
      }
    } catch {}
  };

  const submitScore = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const uname = username || window.__odinUsername || "Anonymous";
      if (actorRef.current) {
        await (actorRef.current as any).submitScore(
          "babyodin",
          uname,
          BigInt(finalScore),
        );
      }
      await fetchLeaderboard();
      setPhase("leaderboard");
    } catch {
      setPhase("leaderboard");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Game Loop ───────────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: isMobile used in resize
  useEffect(() => {
    if (phase !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas maintaining aspect ratio, centered in viewport
    const resize = () => {
      const dpadH = isMobile ? 160 : 0;
      const availH = window.innerHeight - dpadH;
      const availW = window.innerWidth;
      const scaleByW = availW / CANVAS_W;
      const scaleByH = availH / CANVAS_H;
      const scale = Math.min(scaleByW, scaleByH, 1.5);
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      canvas.style.width = `${CANVAS_W * scale}px`;
      canvas.style.height = `${CANVAS_H * scale}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const s = stateRef.current;
    s.running = true;
    s.over = false;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (down) keysRef.current.add(e.code);
      else keysRef.current.delete(e.code);

      if (down) {
        if (
          (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") &&
          s.running &&
          !s.over
        ) {
          jump();
        }
        if ((e.code === "KeyZ" || e.code === "KeyF") && s.running && !s.over) {
          swingHammer();
        }
      }
    };

    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));

    function jump() {
      const st = stateRef.current;
      if (st.jumpsLeft > 0) {
        st.babyVY = JUMP_FORCE;
        st.jumpsLeft--;
        playJump();
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }

    function swingHammer() {
      const st = stateRef.current;
      st.hammerSwing = 18; // frames
      // Check hit on enemies
      const hitX = st.babyX + BABY_W;
      const hitY = st.babyY;
      const cw = canvas!.width;
      const ch = canvas!.height;
      const scaleX = cw / CANVAS_W;
      const scaleY = ch / CANVAS_H;
      const realHitX = hitX * scaleX;
      const realHitY = hitY * scaleY;
      const hitW = 60 * scaleX;
      const hitH = BABY_H * scaleY;

      st.enemies = st.enemies.filter((en) => {
        const ex = en.x * scaleX;
        const ey = en.y * scaleY;
        const ew = en.w * scaleX;
        const eh = en.h * scaleY;
        const hit =
          ex < realHitX + hitW &&
          ex + ew > realHitX &&
          ey < realHitY + hitH &&
          ey + eh > realHitY;
        if (hit) {
          playHit();
          playEnemyDie();
          st.score += en.type === "troll" ? 50 : 30;
          return false;
        }
        return true;
      });
    }

    function loop() {
      const st = stateRef.current;
      const cw = canvas!.width;
      const ch = canvas!.height;
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;

      const scaleX = cw / CANVAS_W;
      const scaleY = ch / CANVAS_H;
      const groundY = ch - 60 * scaleY;

      if (st.running && !st.over) {
        st.tick++;

        // Duck
        const keys = keysRef.current;
        st.isDucking = keys.has("ArrowDown") || keys.has("KeyS");
        // Horizontal movement
        const MOVE_SPEED = 4;
        if (keys.has("ArrowLeft") || keys.has("KeyA")) {
          st.babyX = Math.max(0, st.babyX - MOVE_SPEED);
        }
        if (keys.has("ArrowRight") || keys.has("KeyD")) {
          st.babyX = Math.min(CANVAS_W - BABY_W, st.babyX + MOVE_SPEED);
        }

        // Hammer cooldown
        if (st.hammerSwing > 0) st.hammerSwing--;

        // Baby physics
        st.babyVY += GRAVITY;
        st.babyY += st.babyVY;
        const babyH = st.isDucking ? DUCK_H : BABY_H;
        if (st.babyY >= GROUND_Y - babyH) {
          st.babyY = GROUND_Y - babyH;
          st.babyVY = 0;
          st.jumpsLeft = 2;
        }
        st.legAnim = (st.legAnim + 1) % 20;

        // Invincibility
        if (st.invincible > 0) st.invincible--;

        // Speed ramp
        st.speedTimer++;
        if (st.speedTimer >= 1800) {
          // 30s at 60fps
          st.speedTimer = 0;
          st.speed = Math.min(st.speed + 0.5, 12);
        }

        // Boss trigger
        if (!st.bossTriggered && st.score >= BOSS_TRIGGER_SCORE) {
          st.bossTriggered = true;
          st.boss = {
            active: true,
            x: CANVAS_W + 100,
            y: GROUND_Y - 110,
            hp: 15,
            maxHp: 15,
            invTimer: 0,
            shootTimer: 120,
            defeated: false,
            defeatTimer: 0,
            entered: false,
            warningTimer: 120,
          };
        }

        // Spawn enemies
        st.spawnTimer--;
        if (st.spawnTimer <= 0) {
          const isBat = Math.random() < 0.4;
          if (isBat) {
            const flyH = 80 + Math.random() * 100;
            st.enemies.push({
              x: CANVAS_W + 20,
              y: GROUND_Y - flyH,
              w: 36,
              h: 28,
              type: "bat",
              hp: 1,
            });
          } else {
            st.enemies.push({
              x: CANVAS_W + 20,
              y: GROUND_Y - 44,
              w: 40,
              h: 44,
              type: "troll",
              hp: 1,
            });
          }
          st.spawnTimer = 60 + Math.floor(Math.random() * 80);
        }

        // Spawn coins
        st.coinTimer--;
        if (st.coinTimer <= 0) {
          st.coins.push({
            x: CANVAS_W + 10,
            y: GROUND_Y - 40 - Math.random() * 100,
            collected: false,
          });
          st.coinTimer = 50 + Math.floor(Math.random() * 60);
        }

        // Move clouds
        for (const cl of st.clouds) {
          cl.x -= cl.speed;
          if (cl.x + cl.w < 0) cl.x = CANVAS_W + cl.w;
        }

        // Move & collide enemies
        const curH = st.isDucking ? DUCK_H : BABY_H;
        const babyRect = {
          x: st.babyX + 8,
          y: st.babyY + 4,
          w: BABY_W - 16,
          h: curH - 8,
        };

        st.enemies = st.enemies.filter((en) => {
          en.x -= st.speed + 1;
          if (en.x + en.w < 0) return false;
          // Collision
          if (st.invincible <= 0) {
            const ex = en.x + 4;
            const ey = en.y + 4;
            const ew = en.w - 8;
            const eh = en.h - 8;
            if (
              babyRect.x < ex + ew &&
              babyRect.x + babyRect.w > ex &&
              babyRect.y < ey + eh &&
              babyRect.y + babyRect.h > ey
            ) {
              // Stomp check: baby falling onto troll
              if (
                en.type === "troll" &&
                st.babyVY > 0 &&
                babyRect.y + babyRect.h < ey + eh / 2
              ) {
                st.score += 50;
                st.babyVY = JUMP_FORCE * 0.7;
                return false;
              }
              st.lives--;
              st.invincible = 120;
              if (navigator.vibrate) navigator.vibrate([40, 20, 40]);
              if (st.lives <= 0) {
                st.over = true;
                st.running = false;
              }
            }
          }
          return true;
        });

        // Move coins
        st.coins = st.coins.filter((c) => {
          if (c.collected) return false;
          c.x -= st.speed;
          if (c.x + 16 < 0) return false;
          // Collect
          if (
            babyRect.x < c.x + 16 &&
            babyRect.x + babyRect.w > c.x &&
            babyRect.y < c.y + 16 &&
            babyRect.y + babyRect.h > c.y
          ) {
            c.collected = true;
            st.score += 10;
            return false;
          }
          return true;
        });

        // Boss
        if (st.boss?.active && !st.boss.defeated) {
          const b = st.boss;
          if (b.warningTimer > 0) {
            b.warningTimer--;
          } else {
            // Enter from right
            if (b.x > CANVAS_W - 160) {
              b.x -= 2;
            } else {
              b.entered = true;
            }
            if (b.invTimer > 0) b.invTimer--;

            // Boss shoots ice
            b.shootTimer--;
            if (b.shootTimer <= 0) {
              b.shootTimer = 90;
              const dx = st.babyX - b.x;
              const dy = st.babyY + BABY_H / 2 - (b.y + 55);
              const dist = Math.sqrt(dx * dx + dy * dy);
              st.iceBalls.push({
                x: b.x,
                y: b.y + 55,
                vx: (dx / dist) * 6,
                vy: (dy / dist) * 6,
              });
            }

            // Hammer hits boss
            if (st.hammerSwing > 10 && b.invTimer <= 0) {
              const hitX = st.babyX + BABY_W;
              const bRight = b.x + 80;
              if (
                hitX > b.x &&
                hitX < bRight &&
                Math.abs(st.babyY - b.y) < 120
              ) {
                b.hp--;
                b.invTimer = 30;
                if (b.hp <= 0) {
                  b.defeated = true;
                  b.defeatTimer = 120;
                  st.score += 200;
                }
              }
            }
          }
        }
        if (st.boss?.defeated && st.boss.defeatTimer > 0) {
          st.boss.defeatTimer--;
          if (st.boss.defeatTimer <= 0) st.boss = null;
        }

        // Ice balls
        st.iceBalls = st.iceBalls.filter((ib) => {
          ib.x += ib.vx;
          ib.y += ib.vy;
          if (ib.x < -20 || ib.x > CANVAS_W + 20 || ib.y > CANVAS_H + 20)
            return false;
          // Collide with baby
          if (st.invincible <= 0) {
            if (
              babyRect.x < ib.x + 10 &&
              babyRect.x + babyRect.w > ib.x - 10 &&
              babyRect.y < ib.y + 10 &&
              babyRect.y + babyRect.h > ib.y - 10
            ) {
              st.lives--;
              st.invincible = 120;
              if (navigator.vibrate) navigator.vibrate([40, 20, 40]);
              if (st.lives <= 0) {
                st.over = true;
                st.running = false;
              }
              return false;
            }
          }
          return true;
        });
      }

      // ─── DRAW ───────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, cw, ch);

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, "#87CEEB");
      sky.addColorStop(1, "#e0f4ff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, ch);

      // Mountains
      ctx.fillStyle = "#a8c4a2";
      ctx.beginPath();
      ctx.moveTo(0, ch - 60 * scaleY);
      const mts = [
        [0.05, 0.45],
        [0.15, 0.3],
        [0.28, 0.5],
        [0.4, 0.28],
        [0.55, 0.45],
        [0.65, 0.32],
        [0.78, 0.48],
        [0.9, 0.3],
        [1, 0.45],
      ];
      for (const [mx, my] of mts) ctx.lineTo(mx * cw, my * ch);
      ctx.lineTo(cw, ch - 60 * scaleY);
      ctx.closePath();
      ctx.fill();

      // Background image (in front of mountains)
      if (bgImgRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        // Draw only in lower portion (ground area) so it appears in front of mountains
        const imgW = bgImgRef.current.naturalWidth || cw;
        const imgH = bgImgRef.current.naturalHeight || ch;
        const aspect = imgW / imgH;
        const drawH = ch * 0.7;
        const drawW = drawH * aspect;
        const drawX = (cw - drawW) / 2;
        const drawY = ch - drawH;
        ctx.drawImage(bgImgRef.current, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      // Clouds
      for (const cl of st.clouds) {
        const cx2 = cl.x * scaleX;
        const cy2 = cl.y * scaleY;
        const cw2 = cl.w * scaleX;
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, cw2 * 0.5, cw2 * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(
          cx2 - cw2 * 0.2,
          cy2 + cw2 * 0.08,
          cw2 * 0.3,
          cw2 * 0.18,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(
          cx2 + cw2 * 0.2,
          cy2 + cw2 * 0.08,
          cw2 * 0.3,
          cw2 * 0.18,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Ground
      const grd = ctx.createLinearGradient(0, groundY, 0, ch);
      grd.addColorStop(0, "#5cb85c");
      grd.addColorStop(0.15, "#4a9a4a");
      grd.addColorStop(1, "#3a7a3a");
      ctx.fillStyle = grd;
      ctx.fillRect(0, groundY, cw, ch - groundY);
      // Grass tufts
      ctx.fillStyle = "#6cd46c";
      for (let gx = 0; gx < cw; gx += 20 * scaleX) {
        ctx.fillRect(gx, groundY, 8 * scaleX, 5 * scaleY);
      }

      // Coins
      for (const coin of st.coins) {
        const cx2 = coin.x * scaleX;
        const cy2 = coin.y * scaleY;
        const cr = 12 * scaleX;
        ctx.fillStyle = "#FF8C00";
        ctx.beginPath();
        ctx.arc(cx2, cy2, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2 * scaleX;
        ctx.stroke();
        ctx.fillStyle = "#FFD700";
        ctx.font = `bold ${Math.floor(13 * scaleX)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("₿", cx2, cy2 + 4 * scaleY);
      }

      // Enemies
      for (const en of st.enemies) {
        const ex = en.x * scaleX;
        const ey = en.y * scaleY;
        const ew = en.w * scaleX;
        const eh = en.h * scaleY;

        if (en.type === "troll") {
          // Body
          ctx.fillStyle = "#4caf50";
          ctx.beginPath();
          ctx.ellipse(
            ex + ew / 2,
            ey + eh * 0.6,
            ew * 0.42,
            eh * 0.45,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          // Head
          ctx.fillStyle = "#66bb6a";
          ctx.beginPath();
          ctx.arc(ex + ew / 2, ey + eh * 0.25, eh * 0.28, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(ex + ew * 0.38, ey + eh * 0.22, 4 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + ew * 0.62, ey + eh * 0.22, 4 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#c62828";
          ctx.beginPath();
          ctx.arc(ex + ew * 0.38, ey + eh * 0.22, 2 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + ew * 0.62, ey + eh * 0.22, 2 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          // Horns
          ctx.fillStyle = "#8d6e63";
          ctx.beginPath();
          ctx.moveTo(ex + ew * 0.3, ey + eh * 0.05);
          ctx.lineTo(ex + ew * 0.2, ey - 4 * scaleY);
          ctx.lineTo(ex + ew * 0.4, ey + eh * 0.1);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ex + ew * 0.7, ey + eh * 0.05);
          ctx.lineTo(ex + ew * 0.8, ey - 4 * scaleY);
          ctx.lineTo(ex + ew * 0.6, ey + eh * 0.1);
          ctx.fill();
        } else {
          // Bat
          ctx.fillStyle = "#4a148c";
          // Wings
          ctx.beginPath();
          ctx.moveTo(ex + ew * 0.5, ey + eh * 0.5);
          ctx.bezierCurveTo(
            ex,
            ey,
            ex - ew * 0.3,
            ey + eh,
            ex + ew * 0.15,
            ey + eh * 0.5,
          );
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ex + ew * 0.5, ey + eh * 0.5);
          ctx.bezierCurveTo(
            ex + ew,
            ey,
            ex + ew * 1.3,
            ey + eh,
            ex + ew * 0.85,
            ey + eh * 0.5,
          );
          ctx.fill();
          // Body
          ctx.fillStyle = "#6a1b9a";
          ctx.beginPath();
          ctx.ellipse(
            ex + ew / 2,
            ey + eh * 0.5,
            ew * 0.25,
            eh * 0.4,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#ff4444";
          ctx.beginPath();
          ctx.arc(ex + ew * 0.38, ey + eh * 0.35, 3 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + ew * 0.62, ey + eh * 0.35, 3 * scaleX, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ice balls
      for (const ib of st.iceBalls) {
        const ibx = ib.x * scaleX;
        const iby = ib.y * scaleY;
        ctx.fillStyle = "#a0d8ef";
        ctx.beginPath();
        ctx.arc(ibx, iby, 8 * scaleX, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Boss
      if (st.boss) {
        const b = st.boss;
        const bx = b.x * scaleX;
        const by = b.y * scaleY;
        const bscale = scaleX;

        if (b.warningTimer > 0 && !b.entered) {
          // Warning banner
          if (Math.floor(b.warningTimer / 8) % 2 === 0) {
            ctx.fillStyle = "rgba(0,0,80,0.7)";
            ctx.fillRect(
              cw / 2 - 160 * scaleX,
              ch / 2 - 22 * scaleY,
              320 * scaleX,
              44 * scaleY,
            );
            ctx.fillStyle = "#a0d8ef";
            ctx.font = `bold ${Math.floor(20 * scaleX)}px 'Bricolage Grotesque', sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("❄️ ICE TROLL BOSS! ❄️", cw / 2, ch / 2 + 7 * scaleY);
          }
        }

        if (!b.defeated) {
          // Giant Ice Troll
          const bw = 90 * bscale;
          const bh = 110 * bscale;
          // Body
          const bodyGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          bodyGrad.addColorStop(0, "#b3e5fc");
          bodyGrad.addColorStop(1, "#0277bd");
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.ellipse(
            bx + bw / 2,
            by + bh * 0.65,
            bw * 0.42,
            bh * 0.4,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          // Head
          ctx.fillStyle = "#b3e5fc";
          ctx.beginPath();
          ctx.arc(bx + bw / 2, by + bh * 0.22, bh * 0.25, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(bx + bw * 0.36, by + bh * 0.2, 6 * bscale, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx + bw * 0.64, by + bh * 0.2, 6 * bscale, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#01579b";
          ctx.beginPath();
          ctx.arc(bx + bw * 0.36, by + bh * 0.2, 3 * bscale, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx + bw * 0.64, by + bh * 0.2, 3 * bscale, 0, Math.PI * 2);
          ctx.fill();
          // Horns
          ctx.fillStyle = "#607d8b";
          ctx.beginPath();
          ctx.moveTo(bx + bw * 0.28, by + bh * 0.04);
          ctx.lineTo(bx + bw * 0.16, by - 12 * bscale);
          ctx.lineTo(bx + bw * 0.4, by + bh * 0.1);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(bx + bw * 0.72, by + bh * 0.04);
          ctx.lineTo(bx + bw * 0.84, by - 12 * bscale);
          ctx.lineTo(bx + bw * 0.6, by + bh * 0.1);
          ctx.fill();
          // HP bar
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(bx, by - 18 * bscale, bw, 10 * bscale);
          ctx.fillStyle = "#4fc3f7";
          ctx.fillRect(
            bx,
            by - 18 * bscale,
            bw * (b.hp / b.maxHp),
            10 * bscale,
          );
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by - 18 * bscale, bw, 10 * bscale);
        } else if (b.defeatTimer > 0) {
          // Defeat flash
          const alpha = b.defeatTimer / 120;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(
            bx + 45 * bscale,
            by + 55 * bscale,
            50 * bscale * (1 - alpha + 0.5),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Baby Odin
      const babyRenderX = st.babyX * scaleX;
      const babyH = (st.isDucking ? DUCK_H : BABY_H) * scaleY;
      const babyW = BABY_W * scaleX;
      const babyRenderY = st.babyY * scaleY;

      const flash =
        st.invincible > 0 && Math.floor(st.invincible / 4) % 2 === 0;

      if (!flash) {
        if (babyImgRef.current) {
          ctx.save();
          if (st.isDucking) {
            ctx.translate(babyRenderX + babyW / 2, babyRenderY + babyH / 2);
            ctx.scale(1, 0.6);
            ctx.drawImage(
              babyImgRef.current,
              -babyW / 2,
              (-babyH / 2 / 0.6) * 0.6,
              babyW,
              (babyH / 0.6) * 0.6 + babyH * 0.2,
            );
          } else {
            ctx.drawImage(
              babyImgRef.current,
              babyRenderX,
              babyRenderY,
              babyW,
              babyH,
            );
          }
          ctx.restore();
        } else {
          // Procedural baby viking
          drawBabyOdinProc(
            ctx,
            babyRenderX,
            babyRenderY,
            babyW,
            babyH,
            st.legAnim,
            st.isDucking,
          );
        }

        // Sword slash effect - dramatic golden sword swing
        if (st.hammerSwing > 0) {
          const progress = 1 - st.hammerSwing / 18;
          // Fade only in last 4 frames
          const swingAlpha = st.hammerSwing > 4 ? 1 : st.hammerSwing / 4;
          const pivotX = babyRenderX + babyW * 0.8;
          const pivotY = babyRenderY + babyH * 0.3;
          // Sword angle sweeps from -1.2 rad (top-right) to 0.8 rad (bottom-right)
          const startAngle = -1.2;
          const endAngle = 0.8;
          const currentAngle = startAngle + (endAngle - startAngle) * progress;
          const swordLen = 55 * scaleX;

          ctx.save();
          ctx.globalAlpha = swingAlpha;

          // Slash trail arc (wide, glowing)
          const trailGrad = ctx.createLinearGradient(
            pivotX - 40 * scaleX,
            pivotY,
            pivotX + 40 * scaleX,
            pivotY + 40 * scaleY,
          );
          trailGrad.addColorStop(0, "rgba(255,215,0,0)");
          trailGrad.addColorStop(0.5, "rgba(255,255,255,0.6)");
          trailGrad.addColorStop(1, "rgba(255,215,0,0.9)");
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 14 * scaleX;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(pivotX, pivotY, swordLen * 0.85, startAngle, currentAngle);
          ctx.stroke();

          // Inner bright core of trail
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 5 * scaleX;
          ctx.beginPath();
          ctx.arc(
            pivotX,
            pivotY,
            swordLen * 0.85,
            Math.max(startAngle, currentAngle - 0.5),
            currentAngle,
          );
          ctx.stroke();

          // Impact sparks at swing tip
          const sx2 = pivotX + Math.cos(currentAngle) * swordLen;
          const sy2 = pivotY + Math.sin(currentAngle) * swordLen;

          // Sword tip sparks
          ctx.fillStyle = "#FFFFFF";
          for (let sp = 0; sp < 7; sp++) {
            const sparkAngle = currentAngle + (sp - 3) * 0.18;
            const sparkDist = swordLen * (0.9 + sp * 0.05);
            const spx = pivotX + Math.cos(sparkAngle) * sparkDist;
            const spy = pivotY + Math.sin(sparkAngle) * sparkDist;
            ctx.beginPath();
            ctx.arc(spx, spy, (4 - sp * 0.3) * scaleX, 0, Math.PI * 2);
            ctx.fillStyle = sp % 2 === 0 ? "#FFFFFF" : "#FFD700";
            ctx.fill();
          }

          // Star burst at tip
          ctx.fillStyle = "#FFF176";
          ctx.beginPath();
          ctx.arc(sx2, sy2, 6 * scaleX, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      // HUD
      drawHUD(ctx, st, cw, ch, scaleX, scaleY);

      // Game over overlay
      if (st.over) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = "#FFD700";
        ctx.font = `bold ${Math.floor(36 * scaleX)}px 'Bricolage Grotesque', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", cw / 2, ch / 2 - 20 * scaleY);
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.floor(18 * scaleX)}px 'Figtree', sans-serif`;
        ctx.fillText(`Score: ${st.score}`, cw / 2, ch / 2 + 15 * scaleY);
        setFinalScore(st.score);
        playGameOver();
        setPhase("gameover");
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    function drawHUD(
      ctx: CanvasRenderingContext2D,
      st: GameState,
      cw: number,
      ch: number,
      scaleX: number,
      scaleY: number,
    ) {
      // Score
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(6, 6, 160 * scaleX, 36 * scaleY);
      ctx.fillStyle = "#FFD700";
      ctx.font = `bold ${Math.floor(18 * scaleX)}px 'Bricolage Grotesque', sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`⭐ ${st.score}`, 14, 28 * scaleY);

      // Lives
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(cw - 110 * scaleX, 6, 104 * scaleX, 36 * scaleY);
      ctx.fillStyle = "#ff6b6b";
      ctx.font = `${Math.floor(18 * scaleX)}px sans-serif`;
      ctx.textAlign = "right";
      let heartsStr = "";
      for (let i = 0; i < st.lives; i++) heartsStr += "❤️";
      ctx.fillText(heartsStr, cw - 10, 28 * scaleY);

      // Speed
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(6, 48 * scaleY, 90 * scaleX, 26 * scaleY);
      ctx.fillStyle = "#a5f3fc";
      ctx.font = `bold ${Math.floor(12 * scaleX)}px 'Figtree', sans-serif`;
      ctx.textAlign = "left";
      const lvl = Math.floor((st.speed - 3) / 0.5) + 1;
      ctx.fillText(`⚡ Spd ${lvl}`, 12, 66 * scaleY);

      // Token price
      const priceStr = `ODINMARIO ${tokenPriceRef.current} sats`;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(6, ch - 44 * scaleY, 220 * scaleX, 30 * scaleY);
      if (tokenLogoRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(24, ch - 28 * scaleY, 11 * scaleX, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          tokenLogoRef.current,
          13,
          ch - 40 * scaleY,
          22 * scaleX,
          22 * scaleY,
        );
        ctx.restore();
      } else {
        ctx.fillStyle = "#FF8C00";
        ctx.beginPath();
        ctx.arc(24, ch - 28 * scaleY, 10 * scaleX, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FFD700";
      ctx.font = `bold ${Math.floor(11 * scaleX)}px 'Figtree', sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(priceStr, 40, ch - 24 * scaleY);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startGame() {
    stateRef.current = initState();
    stateRef.current.running = true;
    setPhase("game");
  }

  // Mobile controls
  function mobileJump() {
    const st = stateRef.current;
    if (st.jumpsLeft > 0) {
      st.babyVY = JUMP_FORCE;
      st.jumpsLeft--;
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }
  function mobileDuck() {
    keysRef.current.add("ArrowDown");
    setTimeout(() => keysRef.current.delete("ArrowDown"), 400);
  }
  function mobileAttack() {
    const st = stateRef.current;
    if (!st.running || st.over) return;
    st.hammerSwing = 18;
    const hitX = st.babyX + BABY_W;
    const hitY = st.babyY;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scaleX = canvas.width / CANVAS_W;
    const scaleY = canvas.height / CANVAS_H;
    st.enemies = st.enemies.filter((en) => {
      const ex = en.x * scaleX;
      const ey = en.y * scaleY;
      const ew = en.w * scaleX;
      const eh = en.h * scaleY;
      const realHitX = hitX * scaleX;
      const realHitY = hitY * scaleY;
      const hitW = 60 * scaleX;
      const hitH = BABY_H * scaleY;
      const hit =
        ex < realHitX + hitW &&
        ex + ew > realHitX &&
        ey < realHitY + hitH &&
        ey + eh > realHitY;
      if (hit) {
        st.score += en.type === "troll" ? 50 : 30;
        return false;
      }
      return true;
    });
  }
  function mobilePressDir(dir: string, down: boolean) {
    const key = `Arrow${dir.charAt(0).toUpperCase()}${dir.slice(1)}`;
    if (down) {
      keysRef.current.add(key);
      if (navigator.vibrate) navigator.vibrate(15);
    } else {
      keysRef.current.delete(key);
    }
  }

  const btnStyle: React.CSSProperties = {
    background: "linear-gradient(135deg,#1a4a1a,#2d7a2d)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 32px",
    fontFamily: "'Bricolage Grotesque',sans-serif",
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 2,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(232,100,10,0.5)",
  };

  const dpadBtnStyle: React.CSSProperties = {
    width: 64,
    height: 64,
    background: "rgba(30,30,30,0.85)",
    color: "#fff",
    border: "2.5px solid rgba(255,215,0,0.8)",
    borderRadius: 14,
    fontSize: 26,
    fontWeight: 900,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    WebkitTapHighlightColor: "transparent",
  };

  // ─── SCREENS ───────────────────────────────────────────────────────────────

  if (phase === "username") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg,#1a4a1a,#2d7a2d)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            borderRadius: 18,
            padding: 36,
            textAlign: "center",
            maxWidth: 360,
            width: "90%",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 8 }}>👶⚔️</div>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              color: "#FFD700",
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 16,
            }}
          >
            Enter Your Username
          </h2>
          <input
            data-ocid="baby_odin.input"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveUsername();
            }}
            placeholder="Your name..."
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "2px solid #FFD700",
              background: "#1a0a00",
              color: "#FFD700",
              fontSize: 16,
              fontFamily: "'Figtree',sans-serif",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />
          <button
            data-ocid="baby_odin.submit_button"
            type="button"
            onClick={saveUsername}
            style={btnStyle}
          >
            START
          </button>
        </div>
      </div>
    );
  }

  if (phase === "start") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(160deg,#1a4a1a 0%,#2d7a2d 40%,#4a9a2a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Home button */}
        <button
          data-ocid="baby_odin.close_button"
          type="button"
          onClick={onBack}
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            border: "2px solid rgba(255,255,255,0.4)",
            borderRadius: 8,
            padding: "6px 14px",
            cursor: "pointer",
            fontFamily: "'Figtree',sans-serif",
            fontSize: 14,
          }}
        >
          🏠 Home
        </button>

        <div
          style={{
            background: "rgba(0,0,0,0.7)",
            borderRadius: 24,
            padding: "32px 36px",
            textAlign: "center",
            maxWidth: 440,
            width: "92%",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {babyImgRef.current ? (
            <img
              src="/assets/uploads/20260317_100519-3-2.jpg"
              alt="Baby Odin"
              style={{
                width: 160,
                height: 160,
                borderRadius: 16,
                objectFit: "contain",
                display: "block",
                margin: "0 auto 12px",
                filter: "drop-shadow(0 0 16px rgba(255,215,0,0.5))",
              }}
            />
          ) : (
            <img
              src="/assets/uploads/20260317_100519-3-2.jpg"
              alt="Baby Odin"
              style={{
                width: 160,
                height: 160,
                borderRadius: 16,
                objectFit: "contain",
                display: "block",
                margin: "0 auto 12px",
                filter: "drop-shadow(0 0 16px rgba(255,215,0,0.5))",
              }}
            />
          )}
          <h1
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              color: "#FFD700",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: 4,
              marginBottom: 6,
              textShadow: "0 0 16px rgba(255,215,0,0.8)",
            }}
          >
            BABY ODIN
          </h1>
          <p
            style={{
              color: "#ffe580",
              fontFamily: "'Figtree',sans-serif",
              fontSize: 14,
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            Thank you for joining the ODINMARIO adventure!
          </p>

          <div
            style={{
              background: "rgba(0,0,0,0.35)",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <p
              style={{
                color: "#fff",
                fontFamily: "'Figtree',sans-serif",
                fontSize: 12,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              <b style={{ color: "#FFD700" }}>SPACE / ↑ / W</b> — Jump (double
              jump!)
              <br />
              <b style={{ color: "#FFD700" }}>↓ / S</b> — Duck (avoid bats!)
              <br />
              <b style={{ color: "#FFD700" }}>Z / F</b> — Swing Hammer 🔨<br />
              <b style={{ color: "#FFD700" }}>Goal:</b> Smash trolls, dodge
              bats, collect ₿ coins!
              <br />
              <b style={{ color: "#FFD700" }}>Boss:</b> Ice Troll appears at 500
              points!
            </p>
          </div>

          <button
            data-ocid="baby_odin.primary_button"
            type="button"
            onClick={startGame}
            style={{ ...btnStyle, fontSize: 18, padding: "14px 48px" }}
          >
            ▶ START GAME
          </button>
        </div>
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 11,
            fontFamily: "'Figtree',sans-serif",
            marginTop: 14,
          }}
        >
          Built by ODINMARIO
        </p>
      </div>
    );
  }

  if (phase === "gameover") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg,#1a0a00,#3a1a00)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            borderRadius: 20,
            padding: "32px 40px",
            textAlign: "center",
            maxWidth: 380,
            width: "90%",
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 8 }}>💀</div>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              color: "#FFD700",
              fontSize: 28,
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            GAME OVER
          </h2>
          <p
            style={{
              color: "#ffe580",
              fontFamily: "'Figtree',sans-serif",
              fontSize: 20,
              marginBottom: 20,
            }}
          >
            Score: <b style={{ color: "#FFD700" }}>{finalScore}</b>
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              data-ocid="baby_odin.submit_button"
              type="button"
              onClick={submitScore}
              disabled={submitting}
              style={{ ...btnStyle, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Submitting..." : "Submit Score"}
            </button>
            <button
              data-ocid="baby_odin.secondary_button"
              type="button"
              onClick={startGame}
              style={{ ...btnStyle, background: "rgba(255,255,255,0.15)" }}
            >
              Play Again
            </button>
            <button
              data-ocid="baby_odin.close_button"
              type="button"
              onClick={onBack}
              style={{ ...btnStyle, background: "rgba(255,255,255,0.1)" }}
            >
              🏠 Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "leaderboard") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg,#1a0a00,#3a1a00)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.8)",
            borderRadius: 20,
            padding: "28px 32px",
            textAlign: "center",
            maxWidth: 400,
            width: "100%",
          }}
        >
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              color: "#FFD700",
              fontSize: 24,
              fontWeight: 900,
              marginBottom: 16,
            }}
          >
            🏆 LEADERBOARD
          </h2>
          {leaderboard.length === 0 ? (
            <p
              data-ocid="baby_odin.empty_state"
              style={{ color: "#888", fontFamily: "'Figtree',sans-serif" }}
            >
              No scores yet.
            </p>
          ) : (
            <div data-ocid="baby_odin.list" style={{ marginBottom: 16 }}>
              {leaderboard.map((entry, i) => (
                <div
                  data-ocid={`baby_odin.item.${i + 1}`}
                  key={entry.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid rgba(255,215,0,0.2)",
                    color: i === 0 ? "#FFD700" : "#fff",
                    fontFamily: "'Figtree',sans-serif",
                    fontSize: 14,
                  }}
                >
                  <span>
                    {i + 1}. {entry.name}
                  </span>
                  <span style={{ color: "#FFD700", fontWeight: 700 }}>
                    {entry.score}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              data-ocid="baby_odin.primary_button"
              type="button"
              onClick={startGame}
              style={btnStyle}
            >
              Play Again
            </button>
            <button
              data-ocid="baby_odin.close_button"
              type="button"
              onClick={onBack}
              style={{ ...btnStyle, background: "rgba(255,255,255,0.1)" }}
            >
              🏠 Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game phase
  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* Canvas container */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          data-ocid="baby_odin.canvas_target"
          style={{ display: "block" }}
        />
        {/* Home button overlay */}
        <button
          data-ocid="baby_odin.close_button"
          type="button"
          onClick={onBack}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "2px solid rgba(255,255,255,0.4)",
            borderRadius: 8,
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "'Figtree',sans-serif",
            fontSize: 13,
            zIndex: 10,
          }}
        >
          🏠
        </button>
        <p
          style={{
            position: "absolute",
            bottom: 4,
            left: 0,
            right: 0,
            textAlign: "center",
            color: "rgba(255,255,255,0.35)",
            fontSize: 10,
            fontFamily: "'Figtree',sans-serif",
            pointerEvents: "none",
          }}
        >
          Built by ODINMARIO
        </p>
      </div>

      {/* Mobile D-pad */}
      {isMobile && (
        <div
          style={{
            background: "rgba(10,10,10,0.92)",
            padding: "12px 20px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* D-pad left */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <button
              data-ocid="baby_odin.button"
              type="button"
              style={dpadBtnStyle}
              onTouchStart={mobileJump}
            >
              ▲
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                data-ocid="baby_odin.button"
                type="button"
                style={dpadBtnStyle}
                onPointerDown={() => mobilePressDir("left", true)}
                onPointerUp={() => mobilePressDir("left", false)}
                onPointerLeave={() => mobilePressDir("left", false)}
              >
                ◀
              </button>
              <button
                data-ocid="baby_odin.button"
                type="button"
                style={dpadBtnStyle}
                onTouchStart={mobileDuck}
              >
                ▼
              </button>
              <button
                data-ocid="baby_odin.button"
                type="button"
                style={dpadBtnStyle}
                onPointerDown={() => mobilePressDir("right", true)}
                onPointerUp={() => mobilePressDir("right", false)}
                onPointerLeave={() => mobilePressDir("right", false)}
              >
                ▶
              </button>
            </div>
          </div>
          {/* Attack right */}
          <button
            data-ocid="baby_odin.primary_button"
            type="button"
            style={{
              ...dpadBtnStyle,
              width: 82,
              height: 82,
              borderRadius: 41,
              fontSize: 32,
              background: "linear-gradient(135deg,#1a4a1a,#2d7a2d)",
              border: "3px solid #FFD700",
              boxShadow: "0 0 20px rgba(255,165,0,0.7)",
              WebkitTapHighlightColor: "transparent",
            }}
            onTouchStart={mobileAttack}
          >
            🔨
          </button>
        </div>
      )}
    </div>
  );
}

function drawBabyOdinProc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  legAnim: number,
  isDucking: boolean,
) {
  const cx = x + w / 2;
  // Body (green tunic)
  ctx.fillStyle = "#4caf50";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.65, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = "#ffe0b2";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.3, h * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Helmet
  ctx.fillStyle = "#9e9e9e";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.22, h * 0.23, Math.PI, 0);
  ctx.fill();
  // Horns
  ctx.fillStyle = "#f5f5f5";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, y + h * 0.2);
  ctx.lineTo(cx - w * 0.38, y + h * 0.06);
  ctx.lineTo(cx - w * 0.15, y + h * 0.22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.22, y + h * 0.2);
  ctx.lineTo(cx + w * 0.38, y + h * 0.06);
  ctx.lineTo(cx + w * 0.15, y + h * 0.22);
  ctx.fill();
  // Eyes
  ctx.fillStyle = "#1565c0";
  ctx.beginPath();
  ctx.arc(cx - w * 0.1, y + h * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + w * 0.1, y + h * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();
  // Shamrock
  ctx.fillStyle = "#43a047";
  ctx.font = `bold ${Math.floor(w * 0.32)}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("☘", cx, y + h * 0.72);
  // Hammer
  ctx.fillStyle = "#795548";
  ctx.fillRect(cx + w * 0.28, y + h * 0.45, 5, h * 0.3);
  ctx.fillStyle = "#607d8b";
  ctx.fillRect(cx + w * 0.18, y + h * 0.43, 22, 10);
  // Boots
  if (!isDucking) {
    const legOffset = Math.sin((legAnim / 20) * Math.PI * 2) * 3;
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(cx - w * 0.2, y + h * 0.85, 10, 12);
    ctx.fillRect(cx + w * 0.05 + legOffset, y + h * 0.85, 10, 12);
  }
}
