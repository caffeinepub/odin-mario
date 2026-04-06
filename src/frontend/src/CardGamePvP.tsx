// PeerJS loaded via CDN (see index.html)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Peer = (window as any).Peer;
import { useEffect, useRef, useState } from "react";

// ─── Card Definitions ────────────────────────────────────────────────────────

interface CardDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  applyEffect: (state: CardGameState, actorIsP1: boolean) => CardGameState;
}

interface CardGameState {
  p1Hp: number;
  p2Hp: number;
  p1Shield: boolean;
  p2Shield: boolean;
  p1Poison: number;
  p2Poison: number;
  p1DrawBonus: number;
  p2DrawBonus: number;
  p1Hand: string[];
  p2Hand: string[];
  turnCount: number;
  lastAction: string;
  currentTurn: "p1" | "p2";
}

function clampHp(hp: number): number {
  return Math.min(20, Math.max(0, hp));
}

const ALL_CARDS: CardDef[] = [
  {
    id: "odin_wrath",
    name: "Odin's Wrath",
    emoji: "⚔️",
    description: "Deal 5 damage to opponent",
    color: "#dc2626",
    applyEffect(state, actorIsP1) {
      if (actorIsP1) {
        const dmg = state.p2Shield ? 0 : 5;
        return {
          ...state,
          p2Hp: clampHp(state.p2Hp - dmg),
          p2Shield: false,
          lastAction:
            dmg === 0
              ? "Odin's Wrath blocked by shield!"
              : `Odin's Wrath dealt ${dmg} damage!`,
        };
      }
      const dmg = state.p1Shield ? 0 : 5;
      return {
        ...state,
        p1Hp: clampHp(state.p1Hp - dmg),
        p1Shield: false,
        lastAction:
          dmg === 0
            ? "Odin's Wrath blocked by shield!"
            : `Odin's Wrath dealt ${dmg} damage!`,
      };
    },
  },
  {
    id: "viking_shield",
    name: "Viking Shield",
    emoji: "🛡️",
    description: "Block the next attack",
    color: "#2563eb",
    applyEffect(state, actorIsP1) {
      if (actorIsP1)
        return {
          ...state,
          p1Shield: true,
          lastAction: "Viking Shield raised! Next attack blocked.",
        };
      return {
        ...state,
        p2Shield: true,
        lastAction: "Viking Shield raised! Next attack blocked.",
      };
    },
  },
  {
    id: "thors_hammer",
    name: "Thor's Hammer",
    emoji: "🔨",
    description: "Deal 8 damage to opponent",
    color: "#d97706",
    applyEffect(state, actorIsP1) {
      if (actorIsP1) {
        const dmg = state.p2Shield ? 0 : 8;
        return {
          ...state,
          p2Hp: clampHp(state.p2Hp - dmg),
          p2Shield: false,
          lastAction:
            dmg === 0
              ? "Thor's Hammer blocked by shield!"
              : `Thor's Hammer struck for ${dmg} damage!`,
        };
      }
      const dmg = state.p1Shield ? 0 : 8;
      return {
        ...state,
        p1Hp: clampHp(state.p1Hp - dmg),
        p1Shield: false,
        lastAction:
          dmg === 0
            ? "Thor's Hammer blocked by shield!"
            : `Thor's Hammer struck for ${dmg} damage!`,
      };
    },
  },
  {
    id: "healing_mead",
    name: "Healing Mead",
    emoji: "🍺",
    description: "Restore 4 HP (max 20)",
    color: "#16a34a",
    applyEffect(state, actorIsP1) {
      if (actorIsP1)
        return {
          ...state,
          p1Hp: clampHp(state.p1Hp + 4),
          lastAction: "Healing Mead restores 4 HP!",
        };
      return {
        ...state,
        p2Hp: clampHp(state.p2Hp + 4),
        lastAction: "Healing Mead restores 4 HP!",
      };
    },
  },
  {
    id: "fenrir_bite",
    name: "Fenrir's Bite",
    emoji: "🐺",
    description: "6 damage + 2 poison for 2 turns",
    color: "#7c3aed",
    applyEffect(state, actorIsP1) {
      if (actorIsP1) {
        const dmg = state.p2Shield ? 0 : 6;
        return {
          ...state,
          p2Hp: clampHp(state.p2Hp - dmg),
          p2Shield: false,
          p2Poison: 2,
          lastAction:
            dmg === 0
              ? "Fenrir's Bite blocked (but poison seeps through)!"
              : `Fenrir's Bite: ${dmg} dmg + poisoned for 2 turns!`,
        };
      }
      const dmg = state.p1Shield ? 0 : 6;
      return {
        ...state,
        p1Hp: clampHp(state.p1Hp - dmg),
        p1Shield: false,
        p1Poison: 2,
        lastAction:
          dmg === 0
            ? "Fenrir's Bite blocked (but poison seeps through)!"
            : `Fenrir's Bite: ${dmg} dmg + poisoned for 2 turns!`,
      };
    },
  },
  {
    id: "lightning_bolt",
    name: "Lightning Bolt",
    emoji: "⚡",
    description: "Deal 7 damage, ignores shield",
    color: "#eab308",
    applyEffect(state, actorIsP1) {
      if (actorIsP1)
        return {
          ...state,
          p2Hp: clampHp(state.p2Hp - 7),
          lastAction: "Lightning Bolt ignores shield! 7 damage!",
        };
      return {
        ...state,
        p1Hp: clampHp(state.p1Hp - 7),
        lastAction: "Lightning Bolt ignores shield! 7 damage!",
      };
    },
  },
  {
    id: "mystic_rune",
    name: "Mystic Rune",
    emoji: "🌀",
    description: "Draw 2 extra cards next turn",
    color: "#0891b2",
    applyEffect(state, actorIsP1) {
      if (actorIsP1)
        return {
          ...state,
          p1DrawBonus: state.p1DrawBonus + 2,
          lastAction: "Mystic Rune: draw 2 extra cards next turn!",
        };
      return {
        ...state,
        p2DrawBonus: state.p2DrawBonus + 2,
        lastAction: "Mystic Rune: draw 2 extra cards next turn!",
      };
    },
  },
  {
    id: "berserker_rage",
    name: "Berserker Rage",
    emoji: "🪓",
    description: "Deal 10 damage, lose 3 HP",
    color: "#b91c1c",
    applyEffect(state, actorIsP1) {
      if (actorIsP1) {
        const dmg = state.p2Shield ? 0 : 10;
        return {
          ...state,
          p2Hp: clampHp(state.p2Hp - dmg),
          p2Shield: false,
          p1Hp: clampHp(state.p1Hp - 3),
          lastAction: `Berserker Rage! ${dmg} to opponent, -3 HP to self.`,
        };
      }
      const dmg = state.p1Shield ? 0 : 10;
      return {
        ...state,
        p1Hp: clampHp(state.p1Hp - dmg),
        p1Shield: false,
        p2Hp: clampHp(state.p2Hp - 3),
        lastAction: `Berserker Rage! ${dmg} to opponent, -3 HP to self.`,
      };
    },
  },
];

const CARD_IDS = ALL_CARDS.map((c) => c.id);

function getCard(id: string): CardDef {
  return ALL_CARDS.find((c) => c.id === id) ?? ALL_CARDS[0];
}

function shuffleDeck(seed?: number): string[] {
  const deck = [...CARD_IDS, ...CARD_IDS];
  const rng = seed ?? Date.now();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor((((rng * (i + 1)) % 1000) / 1000) * (i + 1)) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCards(count: number, deckSeed: number): string[] {
  const deck = shuffleDeck(deckSeed);
  return deck.slice(0, count);
}

function initCardGame(deckSeed: number): CardGameState {
  const p1Hand = drawCards(4, deckSeed);
  const p2Hand = drawCards(4, deckSeed + 1);
  return {
    p1Hp: 20,
    p2Hp: 20,
    p1Shield: false,
    p2Shield: false,
    p1Poison: 0,
    p2Poison: 0,
    p1DrawBonus: 0,
    p2DrawBonus: 0,
    p1Hand,
    p2Hand,
    turnCount: 1,
    lastAction: "Game started! P1 goes first.",
    currentTurn: "p1",
  };
}

function serializeCardState(state: CardGameState): string {
  return JSON.stringify(state);
}

function deserializeCardState(json: string): CardGameState | null {
  try {
    return JSON.parse(json) as CardGameState;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Phase = "lobby" | "waiting" | "game" | "finished";

interface CardGamePvPProps {
  onBack?: () => void;
  playerAddress?: string;
}

function generatePlayerId() {
  return `Viking${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function CardGamePvP({
  onBack,
  playerAddress,
}: CardGamePvPProps) {
  const myAddress = useRef(
    localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId(),
  );
  const isP1Ref = useRef(false);
  const mountedRef = useRef(true);
  const lastStateRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [lobbyMode, setLobbyMode] = useState<"choose" | "join">("choose");
  const [opponentAddress, setOpponentAddress] = useState("");
  const [gameState, setGameState] = useState<CardGameState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [playingCard, setPlayingCard] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState("");

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
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  function handleCreateRoom() {
    if (!playerAddress) {
      setError("Please connect your wallet first before playing PvP.");
      return;
    }
    // Refresh username at the moment of room creation
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId();
    setLoading(true);
    setError("");
    isP1Ref.current = true;
    const seed = Date.now();
    const initial = initCardGame(seed);
    const initialSerialized = serializeCardState(initial);
    setGameState(initial);
    lastStateRef.current = initialSerialized;
    const shortCode = generateRoomCode();
    const peer = new Peer(`odinmario_pvp_${shortCode.toLowerCase()}`);
    peerRef.current = peer;
    peer.on("open", () => {
      setRoomCode(shortCode);
      setPhase("waiting");
      phaseRef.current = "waiting";
      setLoading(false);
    });
    peer.on("connection", (conn: any) => {
      connRef.current = conn;
      conn.on("open", () => {
        // Host waits for joiner to identify themselves
      });
      conn.on("data", (data: any) => {
        if (data.type === "joined") {
          // Joiner identified — enter game and send init
          if (data.player) setOpponentAddress(data.player);
          setPhase("game");
          phaseRef.current = "game";
          conn.send({
            type: "init",
            state: initialSerialized,
            player: myAddress.current,
          });
        } else if (data.type === "move") {
          const parsed = deserializeCardState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGameState(parsed);
            const isGameOver = parsed.p1Hp <= 0 || parsed.p2Hp <= 0;
            if (isGameOver) {
              const winner =
                parsed.p1Hp <= 0 ? opponentAddress : myAddress.current;
              setWinnerName(winner);
              setPhase("finished");
              phaseRef.current = "finished";
            }
          }
        }
      });
      conn.on("error", (e: any) => setError(`Connection error: ${e}`));
    });
    peer.on("error", (e: any) => {
      setError(`Failed to create room: ${e}`);
      setLoading(false);
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
    // Refresh username at the moment of joining
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId();
    setLoading(true);
    setError("");
    const code = joinCode.trim();
    isP1Ref.current = false;
    const peer = new Peer();
    peerRef.current = peer;
    peer.on("open", () => {
      const conn = peer.connect(
        `odinmario_pvp_${code.toLowerCase()}`,
        undefined,
        { reliable: true },
      );
      connRef.current = conn;
      const joinTimeout = setTimeout(() => {
        setError(
          "Room not found. Make sure the code is correct and the host is still waiting.",
        );
        setLoading(false);
        peer.destroy();
      }, 15000);
      conn.on("open", () => {
        clearTimeout(joinTimeout);
        setRoomCode(code);
        setLoading(false);
        // Send identity to host; wait for host's "init" before entering game
        conn.send({ type: "joined", player: myAddress.current });
      });
      conn.on("data", (data: any) => {
        if (data.type === "init") {
          // Host confirmed — enter game
          const parsed = deserializeCardState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGameState(parsed);
          }
          setPhase("game");
          phaseRef.current = "game";
        } else if (data.type === "move") {
          const parsed = deserializeCardState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGameState(parsed);
            const isGameOver = parsed.p1Hp <= 0 || parsed.p2Hp <= 0;
            if (isGameOver) {
              const winner =
                parsed.p1Hp <= 0 ? myAddress.current : opponentAddress;
              setWinnerName(winner);
              setPhase("finished");
              phaseRef.current = "finished";
            }
          }
        }
      });
      conn.on("error", () => {
        setError("Room not found or connection failed.");
        setLoading(false);
      });
    });
    peer.on("error", () => {
      setError("Room not found or connection failed.");
      setLoading(false);
    });
  }
  const isP1 = isP1Ref.current;

  function getIsMyTurn(state: CardGameState | null): boolean {
    if (!state) return false;
    return (
      (isP1 && state.currentTurn === "p1") ||
      (!isP1 && state.currentTurn === "p2")
    );
  }

  function handlePlayCard(cardId: string) {
    if (!gameState || !roomCode) return;
    if (!getIsMyTurn(gameState)) return;
    setPlayingCard(cardId);

    try {
      const card = getCard(cardId);
      let newState = { ...gameState };
      if (isP1) {
        newState.p1Hand = gameState.p1Hand.filter((id) => id !== cardId);
      } else {
        newState.p2Hand = gameState.p2Hand.filter((id) => id !== cardId);
      }

      newState = card.applyEffect(newState, isP1);

      // Apply poison at end of turn
      if (isP1 && newState.p1Poison > 0) {
        newState = {
          ...newState,
          p1Hp: clampHp(newState.p1Hp - 2),
          p1Poison: newState.p1Poison - 1,
        };
      }
      if (!isP1 && newState.p2Poison > 0) {
        newState = {
          ...newState,
          p2Hp: clampHp(newState.p2Hp - 2),
          p2Poison: newState.p2Poison - 1,
        };
      }

      // Draw new cards
      const seed = Date.now() + newState.turnCount;
      const drawCount = isP1
        ? 4 - newState.p1Hand.length + newState.p1DrawBonus
        : 4 - newState.p2Hand.length + newState.p2DrawBonus;
      const newCards = drawCards(Math.max(0, drawCount), seed);

      if (isP1) {
        newState.p1Hand = [...newState.p1Hand, ...newCards].slice(
          0,
          4 + newState.p1DrawBonus,
        );
        newState.p1DrawBonus = 0;
      } else {
        newState.p2Hand = [...newState.p2Hand, ...newCards].slice(
          0,
          4 + newState.p2DrawBonus,
        );
        newState.p2DrawBonus = 0;
      }

      newState.turnCount += 1;
      newState.currentTurn = isP1 ? "p2" : "p1";

      const isOver = newState.p1Hp <= 0 || newState.p2Hp <= 0;
      const serialized = serializeCardState(newState);
      lastStateRef.current = serialized;

      setGameState(newState);

      if (connRef.current?.open) {
        connRef.current.send({
          type: "move",
          state: serialized,
          player: myAddress.current,
        });
      }

      if (isOver) {
        const winner =
          newState.p1Hp <= 0
            ? isP1
              ? opponentAddress
              : myAddress.current
            : isP1
              ? myAddress.current
              : opponentAddress;
        setWinnerName(winner);
        setPhase("finished");
        phaseRef.current = "finished";
      }
    } finally {
      setPlayingCard(null);
    }
  }

  function resetGame() {
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setPhase("lobby");
    phaseRef.current = "lobby";
    setRoomCode("");
    setGameState(null);
    setError("");
    setOpponentAddress("");
    lastStateRef.current = "";
    setWinnerName("");
    isP1Ref.current = false;
  }

  const truncate = (addr: string) =>
    addr.length > 14 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  const myHp = gameState ? (isP1 ? gameState.p1Hp : gameState.p2Hp) : 20;
  const oppHp = gameState ? (isP1 ? gameState.p2Hp : gameState.p1Hp) : 20;
  const myHand = gameState ? (isP1 ? gameState.p1Hand : gameState.p2Hand) : [];
  const myShield = gameState
    ? isP1
      ? gameState.p1Shield
      : gameState.p2Shield
    : false;
  const myPoison = gameState
    ? isP1
      ? gameState.p1Poison
      : gameState.p2Poison
    : 0;
  const oppPoison = gameState
    ? isP1
      ? gameState.p2Poison
      : gameState.p1Poison
    : 0;
  const oppShield = gameState
    ? isP1
      ? gameState.p2Shield
      : gameState.p1Shield
    : false;
  const isMyTurn = getIsMyTurn(gameState);

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #0d0a1a 0%, #1a0d2e 40%, #0d0d1a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 8px 32px",
        fontFamily: "'Press Start 2P', 'Courier New', monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          data-ocid="cardgame.back.secondary_button"
          onClick={onBack}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            color: "#aaa",
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "'Press Start 2P', monospace",
          }}
        >
          ← HOME
        </button>
        <h1
          style={{
            color: "#ffe066",
            fontSize: "clamp(11px,2.5vw,16px)",
            margin: 0,
            textShadow: "0 0 20px rgba(255,224,102,0.6)",
            letterSpacing: 2,
          }}
        >
          🃏 CARD BATTLE PvP
        </h1>
        <div style={{ width: 80 }} />
      </div>

      {/* LOBBY */}
      {phase === "lobby" && (
        <div
          data-ocid="cardgame.lobby.panel"
          style={{
            background: "rgba(15,10,35,0.97)",
            border: "2px solid rgba(124,58,237,0.5)",
            borderRadius: 16,
            padding: "28px 24px",
            width: "100%",
            maxWidth: 420,
            textAlign: "center",
            boxShadow: "0 0 40px rgba(124,58,237,0.2)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🃏</div>
          <div
            style={{
              color: "#ffe066",
              fontSize: 13,
              marginBottom: 6,
              textShadow: "0 0 12px rgba(255,224,102,0.5)",
            }}
          >
            VIKING CARD BATTLE
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 8,
              marginBottom: 24,
            }}
          >
            Playing as: {truncate(myAddress.current)}
          </div>

          {!playerAddress && (
            <div
              style={{
                background: "rgba(255,180,0,0.15)",
                border: "2px solid rgba(255,180,0,0.6)",
                borderRadius: 10,
                color: "#ffe066",
                fontSize: 8,
                padding: "12px",
                marginBottom: 18,
                fontFamily: "'Press Start 2P', monospace",
                lineHeight: 1.8,
              }}
            >
              ⚠️ Connect your wallet first before playing PvP!
            </div>
          )}

          {lobbyMode === "choose" && (
            <>
              <button
                type="button"
                data-ocid="cardgame.create_room.primary_button"
                onClick={handleCreateRoom}
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading
                    ? "rgba(124,58,237,0.3)"
                    : "linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)",
                  border: "3px solid #ffe066",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 11,
                  padding: "14px 0",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  fontWeight: 700,
                  boxShadow: "0 4px 0 #2d1066, 0 0 20px rgba(124,58,237,0.4)",
                  marginBottom: 12,
                }}
              >
                {loading ? "CREATING..." : "🏠 CREATE ROOM"}
              </button>
              <button
                type="button"
                data-ocid="cardgame.join_room.secondary_button"
                onClick={() => setLobbyMode("join")}
                disabled={loading}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "2px solid rgba(124,58,237,0.5)",
                  borderRadius: 10,
                  color: "#ffe066",
                  fontSize: 11,
                  padding: "12px 0",
                  cursor: "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                🔗 JOIN WITH CODE
              </button>
            </>
          )}

          {lobbyMode === "join" && (
            <>
              <input
                type="text"
                data-ocid="cardgame.room_code.input"
                placeholder="ENTER ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "2px solid rgba(124,58,237,0.6)",
                  borderRadius: 8,
                  color: "#ffe066",
                  fontSize: 14,
                  padding: "12px",
                  fontFamily: "'Press Start 2P', monospace",
                  textAlign: "center",
                  letterSpacing: 4,
                  marginBottom: 12,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                data-ocid="cardgame.join.primary_button"
                onClick={handleJoinRoom}
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading
                    ? "rgba(124,58,237,0.3)"
                    : "linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)",
                  border: "3px solid #ffe066",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 11,
                  padding: "14px 0",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  fontWeight: 700,
                  boxShadow: "0 4px 0 #2d1066",
                  marginBottom: 10,
                }}
              >
                {loading ? "JOINING..." : "✅ JOIN ROOM"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyMode("choose");
                  setError("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,224,102,0.5)",
                  fontSize: 8,
                  cursor: "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  marginBottom: 16,
                }}
              >
                ← BACK
              </button>
            </>
          )}

          {error && (
            <div
              data-ocid="cardgame.error.error_state"
              style={{
                color: "#ff6b6b",
                fontSize: 8,
                padding: "8px",
                background: "rgba(255,50,50,0.1)",
                border: "1px solid rgba(255,50,50,0.3)",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {/* WAITING */}
      {phase === "waiting" && (
        <div
          data-ocid="cardgame.waiting.panel"
          style={{
            background: "rgba(15,10,35,0.97)",
            border: "2px solid rgba(124,58,237,0.5)",
            borderRadius: 16,
            padding: "32px 24px",
            width: "100%",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 0 40px rgba(124,58,237,0.2)",
          }}
        >
          <div
            style={{
              fontSize: 40,
              marginBottom: 16,
              animation: "pulse 1.5s infinite",
            }}
          >
            ⏳
          </div>
          <div
            style={{
              color: "#ffe066",
              fontSize: 11,
              marginBottom: 20,
              letterSpacing: 1,
            }}
          >
            WAITING FOR OPPONENT...
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 8,
              marginBottom: 16,
            }}
          >
            Playing as: {truncate(myAddress.current)}
          </div>
          <div
            style={{
              background: "rgba(124,58,237,0.15)",
              border: "2px solid rgba(124,58,237,0.5)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
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
              color: "rgba(255,255,255,0.4)",
              fontSize: 7,
              marginBottom: 20,
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            Share this code with your opponent to join
          </div>
          <button
            type="button"
            data-ocid="cardgame.cancel.secondary_button"
            onClick={resetGame}
            style={{
              background: "rgba(255,50,50,0.15)",
              border: "2px solid rgba(255,80,80,0.4)",
              borderRadius: 8,
              color: "#ff8888",
              fontSize: 9,
              padding: "8px 20px",
              cursor: "pointer",
              fontFamily: "'Press Start 2P', monospace",
            }}
          >
            CANCEL
          </button>
        </div>
      )}

      {/* GAME */}
      {phase === "game" && gameState && (
        <div
          style={{
            width: "100%",
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Opponent HP */}
          <div
            style={{
              background: "rgba(15,10,35,0.9)",
              border: "2px solid rgba(124,58,237,0.4)",
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ color: "#aaa", fontSize: 8 }}>
                ⚔️ {truncate(opponentAddress || "Opponent")}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {oppShield && (
                  <span style={{ fontSize: 14 }} title="Shielded">
                    🛡️
                  </span>
                )}
                {oppPoison > 0 && (
                  <span style={{ color: "#a855f7", fontSize: 8 }}>
                    ☠️ ×{oppPoison}
                  </span>
                )}
                <span style={{ color: "#ff6b6b", fontSize: 10 }}>
                  ❤️ {oppHp}/20
                </span>
              </div>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(oppHp / 20) * 100}%`,
                  background:
                    oppHp > 10 ? "#22c55e" : oppHp > 5 ? "#eab308" : "#ef4444",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Last action */}
          {gameState.lastAction && (
            <div
              style={{
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#c4b5fd",
                fontSize: 8,
                textAlign: "center",
                fontFamily: "'Figtree', sans-serif",
              }}
            >
              {gameState.lastAction}
            </div>
          )}

          {/* Turn indicator */}
          <div
            style={{
              textAlign: "center",
              fontSize: 9,
              color: isMyTurn ? "#ffe066" : "rgba(255,255,255,0.4)",
              letterSpacing: 2,
              animation: isMyTurn ? "pulse 1s infinite" : "none",
            }}
          >
            {isMyTurn
              ? "🎴 YOUR TURN — Play a card!"
              : "⏳ Waiting for opponent..."}
          </div>

          {/* My hand */}
          <div>
            <div
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 7,
                marginBottom: 8,
                letterSpacing: 1,
              }}
            >
              YOUR HAND
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 8,
              }}
            >
              {myHand.map((cardId, slot) => {
                const cardSlot = slot;
                const card = getCard(cardId);
                const isPlaying = playingCard === cardId;
                return (
                  <button
                    key={`${cardId}-slot-${cardSlot}`}
                    type="button"
                    data-ocid={`cardgame.card.item.${cardSlot + 1}`}
                    onClick={() => handlePlayCard(cardId)}
                    disabled={!isMyTurn || !!playingCard}
                    style={{
                      background: isMyTurn
                        ? `linear-gradient(160deg, ${card.color}33 0%, rgba(15,10,35,0.95) 100%)`
                        : "rgba(15,10,35,0.6)",
                      border: `2px solid ${isMyTurn ? card.color : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 10,
                      padding: "10px 8px",
                      cursor:
                        isMyTurn && !playingCard ? "pointer" : "not-allowed",
                      textAlign: "center",
                      opacity: isMyTurn ? 1 : 0.5,
                      transform: isPlaying ? "scale(0.95)" : "scale(1)",
                      transition: "transform 0.1s ease",
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 4 }}>
                      {card.emoji}
                    </div>
                    <div
                      style={{
                        color: "#fff",
                        fontSize: 7,
                        marginBottom: 4,
                        fontFamily: "'Press Start 2P', monospace",
                      }}
                    >
                      {card.name}
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 6,
                        fontFamily: "'Figtree', sans-serif",
                      }}
                    >
                      {card.description}
                    </div>
                  </button>
                );
              })}
              {myHand.length === 0 && (
                <div
                  data-ocid="cardgame.hand.empty_state"
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    fontSize: 8,
                    padding: 16,
                    textAlign: "center",
                    gridColumn: "1 / -1",
                  }}
                >
                  No cards in hand
                </div>
              )}
            </div>
          </div>

          {/* My HP */}
          <div
            style={{
              background: "rgba(15,10,35,0.9)",
              border: `2px solid ${isMyTurn ? "rgba(124,58,237,0.6)" : "rgba(124,58,237,0.2)"}`,
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ color: "#ffe066", fontSize: 8 }}>
                👤 {truncate(myAddress.current)}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {myShield && <span style={{ fontSize: 14 }}>🛡️</span>}
                {myPoison > 0 && (
                  <span style={{ color: "#a855f7", fontSize: 8 }}>
                    ☠️ ×{myPoison}
                  </span>
                )}
                <span style={{ color: "#22c55e", fontSize: 10 }}>
                  ❤️ {myHp}/20
                </span>
              </div>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(myHp / 20) * 100}%`,
                  background:
                    myHp > 10 ? "#22c55e" : myHp > 5 ? "#eab308" : "#ef4444",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* FINISHED */}
      {phase === "finished" && (
        <div
          data-ocid="cardgame.finished.panel"
          style={{
            background: "rgba(15,10,35,0.97)",
            border: "3px solid #ffe066",
            borderRadius: 20,
            padding: "32px 28px",
            width: "100%",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 0 60px rgba(255,224,102,0.3)",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 12 }}>
            {winnerName === myAddress.current ? "👑" : "💀"}
          </div>
          <div
            style={{
              color: winnerName === myAddress.current ? "#ffe066" : "#ff6b6b",
              fontSize: 16,
              marginBottom: 8,
              textShadow: "0 0 20px currentColor",
            }}
          >
            {winnerName === myAddress.current ? "YOU WIN!" : "OPPONENT WINS!"}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 8,
              marginBottom: 24,
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            {winnerName ? `Winner: ${truncate(winnerName)}` : "Game over"}
          </div>
          <button
            type="button"
            data-ocid="cardgame.play_again.primary_button"
            onClick={resetGame}
            style={{
              background: "linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)",
              border: "3px solid #ffe066",
              borderRadius: 10,
              color: "#fff",
              fontSize: 10,
              padding: "12px 28px",
              cursor: "pointer",
              fontFamily: "'Press Start 2P', monospace",
              boxShadow: "0 4px 0 #2d1066",
            }}
          >
            🃏 PLAY AGAIN
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 8,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "1px",
        }}
      >
        Built by ODINMARIO
      </div>
    </div>
  );
}
