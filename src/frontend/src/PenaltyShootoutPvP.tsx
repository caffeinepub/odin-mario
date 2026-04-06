// PeerJS loaded via CDN (see index.html)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Peer = (window as any).Peer;
import { useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction = "left" | "center" | "right";
type Phase = "lobby" | "waiting" | "game" | "ended";

interface RoundResult {
  kickDir: Direction;
  diveDir: Direction;
  goal: boolean;
  kickerIsP1: boolean;
}

interface PenaltyState {
  p1Score: number;
  p2Score: number;
  round: number;
  // kickerIsP1 means P1 kicks this round
  kickerIsP1: boolean;
  phase: "choosing" | "result" | "done";
  p1Choice: Direction | null;
  p2Choice: Direction | null;
  lastResult: RoundResult | null;
  winner: "p1" | "p2" | null;
}

const WIN_SCORE = 5;
const MAX_ROUNDS = 20;

function initPenaltyState(): PenaltyState {
  return {
    p1Score: 0,
    p2Score: 0,
    round: 1,
    kickerIsP1: true,
    phase: "choosing",
    p1Choice: null,
    p2Choice: null,
    lastResult: null,
    winner: null,
  };
}

function resolveRound(state: PenaltyState): PenaltyState {
  const { p1Choice, p2Choice, kickerIsP1 } = state;
  if (!p1Choice || !p2Choice) return state;

  const kickDir = kickerIsP1 ? p1Choice : p2Choice;
  const diveDir = kickerIsP1 ? p2Choice : p1Choice;
  const goal = kickDir !== diveDir;

  let p1Score = state.p1Score;
  let p2Score = state.p2Score;
  if (goal) {
    if (kickerIsP1) p1Score++;
    else p2Score++;
  }

  let winner: "p1" | "p2" | null = null;
  if (p1Score >= WIN_SCORE) winner = "p1";
  else if (p2Score >= WIN_SCORE) winner = "p2";
  else if (state.round >= MAX_ROUNDS) {
    winner = p1Score > p2Score ? "p1" : p2Score > p1Score ? "p2" : null;
  }

  const lastResult: RoundResult = { kickDir, diveDir, goal, kickerIsP1 };

  return {
    p1Score,
    p2Score,
    round: state.round + 1,
    kickerIsP1: !kickerIsP1, // swap roles
    phase: winner ? "done" : "result",
    p1Choice: null,
    p2Choice: null,
    lastResult,
    winner,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Use peerjs.com as broker but with our own deterministic peer IDs
// so host and joiner can find each other reliably with a short 6-char code
const PEER_CONFIG = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  },
  debug: 0,
};

/** Generate a short 6-character room code (e.g. "AB3K7M") */
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Convert a 6-char room code to a deterministic PeerJS peer ID.
 *  Host registers this ID; joiner connects to this same ID. */
function roomCodeToPeerId(code: string): string {
  return `odinm-penalty-${code.toUpperCase()}`;
}

function generatePlayerId(): string {
  return `player_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PenaltyShootoutPvPProps {
  onBack: () => void;
  playerAddress?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PenaltyShootoutPvP({
  onBack,
  playerAddress,
}: PenaltyShootoutPvPProps) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const phaseRef = useRef<Phase>("lobby");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opponentAddress, setOpponentAddress] = useState("");
  const [gameState, setGameState] = useState<PenaltyState>(initPenaltyState());
  const [myChoice, setMyChoice] = useState<Direction | null>(null);
  const [showResult, setShowResult] = useState(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const isP1Ref = useRef(true);
  const myAddress = useRef(
    localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId(),
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      myAddress.current;
  }, [playerAddress]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const isP1 = isP1Ref.current;

  // ─── Networking ─────────────────────────────────────────────────────────

  function handleCreateRoom() {
    if (!playerAddress) {
      setError("Please connect your wallet first before playing PvP.");
      return;
    }
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId();
    setLoading(true);
    setError("");
    isP1Ref.current = true;
    // Generate a short code and register the EXACT peer ID so joiner can find us
    const code = generateRoomCode();
    const peerId = roomCodeToPeerId(code);
    // Destroy any previous peer first
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    const peer = new Peer(peerId, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      setRoomCode(code);
      setPhase("waiting");
      phaseRef.current = "waiting";
      setLoading(false);
    });

    peer.on("connection", (conn: any) => {
      connRef.current = conn;
      conn.on("open", () => {});
      conn.on("data", (data: any) => {
        if (data.type === "joined") {
          if (data.player) setOpponentAddress(data.player);
          const init = initPenaltyState();
          setGameState(init);
          setMyChoice(null);
          setPhase("game");
          phaseRef.current = "game";
          conn.send({ type: "init", state: init, player: myAddress.current });
        } else if (data.type === "kick_choice" || data.type === "dive_choice") {
          handleOpponentChoice(data.dir as Direction);
        }
      });
      conn.on("error", (e: any) => setError(`Connection error: ${e}`));
    });

    peer.on("error", (e: any) => {
      const msg = String(e);
      if (msg.includes("unavailable-id") || msg.includes("ID is taken")) {
        // Code collision, auto-retry with a new code
        peer.destroy();
        peerRef.current = null;
        handleCreateRoom();
      } else {
        setError(`Failed to create room: ${msg}`);
        setLoading(false);
      }
    });
  }

  function handleJoinRoom() {
    if (!playerAddress) {
      setError("Please connect your wallet first before playing PvP.");
      return;
    }
    if (!joinCode.trim()) {
      setError("Enter a room code");
      return;
    }
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId();
    setLoading(true);
    setError("");
    const code = joinCode.trim().toUpperCase();
    isP1Ref.current = false;
    // Destroy any previous peer first
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    const peer = new Peer(undefined, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      // Connect to the host's deterministic peer ID derived from the room code
      const hostPeerId = roomCodeToPeerId(code);
      const conn = peer.connect(hostPeerId, { reliable: true } as any);
      connRef.current = conn;
      let joined = false;
      const joinTimeout = setTimeout(() => {
        if (!joined) {
          setError(
            "Room not found. Make sure the code is correct and the host is still waiting.",
          );
          setLoading(false);
          peer.destroy();
        }
      }, 20000);

      conn.on("open", () => {
        joined = true;
        clearTimeout(joinTimeout);
        setRoomCode(code);
        setLoading(false);
        conn.send({ type: "joined", player: myAddress.current });
      });

      conn.on("data", (data: any) => {
        if (data.type === "init") {
          if (data.player) setOpponentAddress(data.player);
          setGameState(data.state as PenaltyState);
          setMyChoice(null);
          setPhase("game");
          phaseRef.current = "game";
        } else if (data.type === "kick_choice" || data.type === "dive_choice") {
          handleOpponentChoice(data.dir as Direction);
        }
      });

      conn.on("error", () => {
        clearTimeout(joinTimeout);
        setError("Room not found or connection failed.");
        setLoading(false);
      });
    });

    peer.on("error", (e: any) => {
      const msg = String(e);
      if (msg.includes("peer-unavailable")) {
        setError(
          "Room not found. Make sure the code is correct and the host is still waiting.",
        );
      } else {
        setError(`Connection failed: ${msg}`);
      }
      setLoading(false);
    });
  }

  // Called when we receive opponent's choice
  function handleOpponentChoice(dir: Direction) {
    setGameState((prev) => {
      const isMyP1 = isP1Ref.current;
      const updated: PenaltyState = {
        ...prev,
        p1Choice: isMyP1 ? prev.p1Choice : dir,
        p2Choice: isMyP1 ? dir : prev.p2Choice,
      };
      const bothChose = updated.p1Choice !== null && updated.p2Choice !== null;
      if (bothChose) {
        return triggerResolve(updated);
      }
      return updated;
    });
  }

  function triggerResolve(state: PenaltyState): PenaltyState {
    const resolved = resolveRound(state);
    setShowResult(true);
    // After 2.5s transition to next round
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setShowResult(false);
      if (resolved.winner) {
        setPhase("ended");
        phaseRef.current = "ended";
      } else {
        setMyChoice(null);
      }
      setGameState({ ...resolved, phase: "choosing" });
    }, 2500);
    return resolved;
  }

  // Called when local player submits their choice
  function handleSubmitChoice(dir: Direction) {
    if (myChoice !== null || showResult) return;
    setMyChoice(dir);

    const isMyP1 = isP1Ref.current;
    const msgType =
      isMyP1 === gameState.kickerIsP1 ? "kick_choice" : "dive_choice";
    // Send to opponent
    if (connRef.current) {
      connRef.current.send({ type: msgType, dir });
    }

    setGameState((prev) => {
      const updated: PenaltyState = {
        ...prev,
        p1Choice: isMyP1 ? dir : prev.p1Choice,
        p2Choice: isMyP1 ? prev.p2Choice : dir,
      };
      const bothChose = updated.p1Choice !== null && updated.p2Choice !== null;
      if (bothChose) {
        return triggerResolve(updated);
      }
      return updated;
    });
  }

  function handlePlayAgain() {
    const init = initPenaltyState();
    setGameState(init);
    setMyChoice(null);
    setShowResult(false);
    setPhase("game");
    phaseRef.current = "game";
    if (connRef.current) {
      connRef.current.send({
        type: "restart",
        state: init,
        player: myAddress.current,
      });
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const truncate = (addr: string) =>
    addr.length > 14 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  const amIKicker = isP1 === gameState.kickerIsP1;
  const myLabel = truncate(myAddress.current || "You");
  const opponentLabel = truncate(opponentAddress || "Opponent");
  const myScore = isP1 ? gameState.p1Score : gameState.p2Score;
  const opponentScore = isP1 ? gameState.p2Score : gameState.p1Score;
  const iWon = gameState.winner === (isP1 ? "p1" : "p2");

  // ─── Render ───────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    width: "100vw",
    minHeight: "100vh",
    background:
      "linear-gradient(160deg, #0a1a0a 0%, #0d2010 50%, #0a1a0a 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    fontFamily: "'Press Start 2P', monospace",
    color: "#fff",
    padding: "16px 12px 32px",
    boxSizing: "border-box",
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          data-ocid="penalty.secondary_button"
          onClick={onBack}
          style={{
            background: "rgba(0,0,0,0.5)",
            border: "2px solid rgba(34,197,94,0.5)",
            borderRadius: 8,
            color: "#22c55e",
            fontSize: 10,
            fontFamily: "'Press Start 2P', monospace",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          ← BACK
        </button>
        <div
          style={{
            fontSize: 14,
            fontFamily: "'Press Start 2P', monospace",
            color: "#ffe066",
            textShadow: "2px 2px 0 #7a5000",
            textAlign: "center",
          }}
        >
          ⚽ PENALTY SHOOTOUT
        </div>
        <div style={{ width: 80 }} />
      </div>

      {/* ── LOBBY ───────────────────────────────────────────────────── */}
      {phase === "lobby" && (
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "rgba(0,0,0,0.5)",
            border: "2px solid rgba(34,197,94,0.4)",
            borderRadius: 16,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 52 }}>⚽</div>
          <div
            style={{
              color: "#22c55e",
              fontSize: 11,
              fontFamily: "'Press Start 2P', monospace",
              textAlign: "center",
              lineHeight: 1.7,
            }}
          >
            Challenge a friend!
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
              textAlign: "center",
              lineHeight: 1.8,
            }}
          >
            First to score 5 goals wins.
            <br />
            Each round: kicker picks direction,
            <br />
            keeper picks dive. Roles swap each round.
          </div>

          {!playerAddress && (
            <div
              style={{
                background: "rgba(255,100,0,0.15)",
                border: "1px solid rgba(255,100,0,0.5)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#fbbf24",
                fontSize: 8,
                fontFamily: "'Press Start 2P', monospace",
                textAlign: "center",
                lineHeight: 1.8,
              }}
            >
              ⚠️ Connect your wallet first to play PvP!
            </div>
          )}

          <button
            type="button"
            data-ocid="penalty.primary_button"
            onClick={handleCreateRoom}
            disabled={loading}
            style={{
              background: loading
                ? "rgba(34,197,94,0.2)"
                : "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
              border: "3px solid #ffe066",
              borderRadius: 8,
              color: "#fff",
              fontSize: 10,
              fontFamily: "'Press Start 2P', monospace",
              padding: "10px 20px",
              cursor: loading ? "not-allowed" : "pointer",
              width: "100%",
              boxShadow: "0 4px 0 #065f46",
              textShadow: "1px 1px 0 rgba(0,0,0,0.5)",
            }}
          >
            {loading ? "Creating..." : "🏟️ CREATE ROOM"}
          </button>

          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
            }}
          >
            — or join a room —
          </div>

          <div
            style={{ display: "flex", gap: 8, width: "100%", maxWidth: 320 }}
          >
            <input
              data-ocid="penalty.input"
              type="text"
              placeholder="ENTER CODE"
              maxLength={6}
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                )
              }
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.5)",
                border: "2px solid rgba(34,197,94,0.5)",
                borderRadius: 8,
                color: "#ffe066",
                fontSize: 11,
                fontFamily: "'Press Start 2P', monospace",
                padding: "8px 12px",
                outline: "none",
                letterSpacing: 3,
              }}
            />
            <button
              type="button"
              data-ocid="penalty.secondary_button"
              onClick={handleJoinRoom}
              disabled={loading}
              style={{
                background: loading
                  ? "rgba(0,0,0,0.3)"
                  : "linear-gradient(180deg, #166534 0%, #14532d 100%)",
                border: "2px solid rgba(34,197,94,0.6)",
                borderRadius: 8,
                color: "#22c55e",
                fontSize: 9,
                fontFamily: "'Press Start 2P', monospace",
                padding: "8px 12px",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 3px 0 #052e16",
              }}
            >
              JOIN
            </button>
          </div>

          {error && (
            <div
              data-ocid="penalty.error_state"
              style={{
                color: "#f87171",
                fontSize: 8,
                fontFamily: "'Press Start 2P', monospace",
                textAlign: "center",
                lineHeight: 1.7,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── WAITING ─────────────────────────────────────────────────── */}
      {phase === "waiting" && (
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "rgba(0,0,0,0.5)",
            border: "2px solid rgba(34,197,94,0.4)",
            borderRadius: 16,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 48 }}>⏳</div>
          <div
            style={{
              color: "#22c55e",
              fontSize: 10,
              fontFamily: "'Press Start 2P', monospace",
              textAlign: "center",
            }}
          >
            Waiting for opponent...
          </div>
          <div
            style={{
              background: "rgba(0,0,0,0.6)",
              border: "2px solid #ffe066",
              borderRadius: 8,
              padding: "12px 24px",
              color: "#ffe066",
              fontSize: 18,
              fontFamily: "'Press Start 2P', monospace",
              letterSpacing: 4,
            }}
          >
            {roomCode}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
              textAlign: "center",
            }}
          >
            Share this code with your opponent
          </div>
          <button
            type="button"
            data-ocid="penalty.cancel_button"
            onClick={() => {
              if (peerRef.current) peerRef.current.destroy();
              setPhase("lobby");
              phaseRef.current = "lobby";
              setRoomCode("");
            }}
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "2px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              color: "rgba(255,255,255,0.5)",
              fontSize: 9,
              fontFamily: "'Press Start 2P', monospace",
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
        </div>
      )}

      {/* ── GAME ────────────────────────────────────────────────────── */}
      {phase === "game" && (
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          {/* Scoreboard */}
          <div
            data-ocid="penalty.panel"
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(0,0,0,0.6)",
              border: "2px solid rgba(34,197,94,0.4)",
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 8,
                  color: isP1 ? "#22c55e" : "rgba(255,255,255,0.5)",
                  marginBottom: 4,
                }}
              >
                {myLabel} {isP1 ? "(YOU)" : ""}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "#ffe066",
                  textShadow: "2px 2px 0 #7a5000",
                }}
              >
                {gameState.p1Score}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 7,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 2,
                }}
              >
                ROUND {gameState.round}
              </div>
              <div style={{ fontSize: 20 }}>⚽</div>
              <div
                style={{
                  fontSize: 7,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 2,
                }}
              >
                FIRST TO {WIN_SCORE}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 8,
                  color: !isP1 ? "#22c55e" : "rgba(255,255,255,0.5)",
                  marginBottom: 4,
                }}
              >
                {opponentLabel} {!isP1 ? "(YOU)" : ""}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "#ffe066",
                  textShadow: "2px 2px 0 #7a5000",
                }}
              >
                {gameState.p2Score}
              </div>
            </div>
          </div>

          {/* Goal Net */}
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "rgba(0,0,0,0.4)",
              border: "3px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "12px 0 8px",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Net grid lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "30px 20px",
                pointerEvents: "none",
              }}
            />
            {/* Role indicator */}
            <div
              style={{
                fontSize: 9,
                color: amIKicker ? "#fbbf24" : "#60a5fa",
                marginBottom: 8,
                position: "relative",
              }}
            >
              {amIKicker ? "🦶 YOU ARE THE KICKER" : "🧤 YOU ARE THE KEEPER"}
            </div>

            {/* Round result overlay */}
            {showResult && gameState.lastResult && (
              <div
                data-ocid="penalty.success_state"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.75)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    marginBottom: 8,
                  }}
                >
                  {gameState.lastResult.goal ? "⚽" : "🧤"}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: gameState.lastResult.goal ? "#22c55e" : "#60a5fa",
                    textShadow: "2px 2px 0 rgba(0,0,0,0.8)",
                  }}
                >
                  {gameState.lastResult.goal ? "GOAL!" : "SAVED!"}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.6)",
                    marginTop: 8,
                  }}
                >
                  Kick: {gameState.lastResult.kickDir.toUpperCase()} | Dive:{" "}
                  {gameState.lastResult.diveDir.toUpperCase()}
                </div>
              </div>
            )}

            {/* Goal posts */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 2,
                marginBottom: 4,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 48,
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: 260,
                  height: 4,
                  background: "rgba(255,255,255,0.7)",
                  alignSelf: "flex-start",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: 4,
                  height: 48,
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: 2,
                }}
              />
            </div>

            {/* Goalkeeper silhouette */}
            <div
              style={{
                fontSize: 28,
                marginTop: -8,
                marginBottom: 4,
                position: "relative",
              }}
            >
              🧤
            </div>

            {/* Ball */}
            <div
              style={{
                fontSize: 24,
                marginBottom: 4,
                position: "relative",
              }}
            >
              ⚽
            </div>
          </div>

          {/* Choice buttons */}
          {!showResult && (
            <div
              style={{
                width: "100%",
                maxWidth: 480,
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                {myChoice !== null
                  ? "⏳ Waiting for opponent..."
                  : amIKicker
                    ? "🦶 Pick your kick direction:"
                    : "🧤 Pick your dive direction:"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
                {(["left", "center", "right"] as Direction[]).map((dir) => {
                  const icon =
                    dir === "left" ? "⬅️" : dir === "center" ? "⬆️" : "➡️";
                  const label = dir.toUpperCase();
                  const chosen = myChoice === dir;
                  return (
                    <button
                      key={dir}
                      type="button"
                      data-ocid={`penalty.${dir}.button`}
                      onClick={() => handleSubmitChoice(dir)}
                      disabled={myChoice !== null}
                      style={{
                        flex: 1,
                        background: chosen
                          ? "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)"
                          : myChoice !== null
                            ? "rgba(0,0,0,0.3)"
                            : "linear-gradient(180deg, #166534 0%, #14532d 100%)",
                        border: chosen
                          ? "3px solid #ffe066"
                          : "2px solid rgba(34,197,94,0.5)",
                        borderRadius: 10,
                        color: chosen
                          ? "#fff"
                          : myChoice !== null
                            ? "rgba(255,255,255,0.3)"
                            : "#22c55e",
                        cursor: myChoice !== null ? "not-allowed" : "pointer",
                        padding: "12px 8px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        transition: "transform 0.1s",
                        boxShadow: chosen
                          ? "0 0 12px rgba(34,197,94,0.5)"
                          : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (myChoice === null)
                          e.currentTarget.style.transform = "scale(1.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "";
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <span
                        style={{
                          fontSize: 8,
                          fontFamily: "'Press Start 2P', monospace",
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Waiting message */}
          {myChoice !== null && !showResult && (
            <div
              data-ocid="penalty.loading_state"
              style={{
                fontSize: 8,
                color: "#ffe066",
                textAlign: "center",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              Waiting for opponent's choice...
            </div>
          )}
        </div>
      )}

      {/* ── ENDED ───────────────────────────────────────────────────── */}
      {phase === "ended" && (
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "rgba(0,0,0,0.6)",
            border: `2px solid ${iWon ? "rgba(34,197,94,0.7)" : "rgba(248,113,113,0.5)"}`,
            borderRadius: 16,
            padding: "32px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
            boxShadow: iWon
              ? "0 0 40px rgba(34,197,94,0.3)"
              : "0 0 40px rgba(248,113,113,0.2)",
          }}
        >
          <div style={{ fontSize: 56 }}>{iWon ? "🏆" : "😔"}</div>
          <div
            style={{
              fontSize: 16,
              color: iWon ? "#22c55e" : "#f87171",
              textShadow: iWon ? "2px 2px 0 #065f46" : "2px 2px 0 #7f1d1d",
              textAlign: "center",
            }}
          >
            {iWon ? "YOU WIN!" : "YOU LOSE!"}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
            }}
          >
            Final Score: {myScore} - {opponentScore}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              data-ocid="penalty.primary_button"
              onClick={handlePlayAgain}
              style={{
                background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                border: "3px solid #ffe066",
                borderRadius: 8,
                color: "#fff",
                fontSize: 9,
                fontFamily: "'Press Start 2P', monospace",
                padding: "10px 18px",
                cursor: "pointer",
                boxShadow: "0 4px 0 #065f46",
              }}
            >
              ⚽ PLAY AGAIN
            </button>
            <button
              type="button"
              data-ocid="penalty.cancel_button"
              onClick={onBack}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "2px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.6)",
                fontSize: 9,
                fontFamily: "'Press Start 2P', monospace",
                padding: "10px 18px",
                cursor: "pointer",
              }}
            >
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
