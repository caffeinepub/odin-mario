// PeerJS loaded via CDN (see index.html)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Peer = (window as any).Peer;
import { useEffect, useRef, useState } from "react";

// ─── Chess Types & Logic ─────────────────────────────────────────────────────

type Color = "w" | "b";
type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
type Piece = { type: PieceType; color: Color };
type Square = Piece | null;
type Board = Square[][];

interface ChessGameState {
  board: Board;
  turn: Color;
  selected: [number, number] | null;
  validMoves: [number, number][];
  enPassantTarget: [number, number] | null;
  castlingRights: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  status: "playing" | "check" | "checkmate" | "stalemate";
  winner: Color | null;
  moveHistory: string[];
  promotionPending: [number, number] | null;
}

const INIT_BOARD: Board = [
  [
    { type: "R", color: "b" },
    { type: "N", color: "b" },
    { type: "B", color: "b" },
    { type: "Q", color: "b" },
    { type: "K", color: "b" },
    { type: "B", color: "b" },
    { type: "N", color: "b" },
    { type: "R", color: "b" },
  ],
  Array(8)
    .fill(null)
    .map(() => ({ type: "P" as PieceType, color: "b" as Color })),
  ...Array(4)
    .fill(null)
    .map(() => Array(8).fill(null)),
  Array(8)
    .fill(null)
    .map(() => ({ type: "P" as PieceType, color: "w" as Color })),
  [
    { type: "R", color: "w" },
    { type: "N", color: "w" },
    { type: "B", color: "w" },
    { type: "Q", color: "w" },
    { type: "K", color: "w" },
    { type: "B", color: "w" },
    { type: "N", color: "w" },
    { type: "R", color: "w" },
  ],
];

const PIECE_UNICODE: Record<PieceType, Record<Color, string>> = {
  K: { w: "♔", b: "♚" },
  Q: { w: "♕", b: "♛" },
  R: { w: "♖", b: "♜" },
  B: { w: "♗", b: "♝" },
  N: { w: "♘", b: "♞" },
  P: { w: "♙", b: "♟" },
};

const FILE_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((sq) => (sq ? { ...sq } : null)));
}

function findKing(board: Board, color: Color): [number, number] | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === "K" && sq.color === color) return [r, c];
    }
  }
  return null;
}

function rawMoves(
  board: Board,
  row: number,
  col: number,
  enPassant: [number, number] | null,
): [number, number][] {
  const sq = board[row][col];
  if (!sq) return [];
  const { type, color } = sq;
  const moves: [number, number][] = [];
  const opp: Color = color === "w" ? "b" : "w";

  function inBounds(r: number, c: number) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }
  function addIfEmpty(r: number, c: number) {
    if (inBounds(r, c) && !board[r][c]) moves.push([r, c]);
  }
  function addIfCapture(r: number, c: number) {
    if (inBounds(r, c) && board[r][c]?.color === opp) moves.push([r, c]);
  }
  function slide(dr: number, dc: number) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      if (!board[r][c]) {
        moves.push([r, c]);
      } else {
        if (board[r][c]?.color === opp) moves.push([r, c]);
        break;
      }
      r += dr;
      c += dc;
    }
  }

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    addIfEmpty(row + dir, col);
    if (row === startRow && !board[row + dir][col])
      addIfEmpty(row + 2 * dir, col);
    addIfCapture(row + dir, col - 1);
    addIfCapture(row + dir, col + 1);
    if (enPassant) {
      const [er, ec] = enPassant;
      if (row + dir === er && Math.abs(col - ec) === 1) moves.push([er, ec]);
    }
  } else if (type === "N") {
    for (const [dr, dc] of [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]) {
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c) && board[r][c]?.color !== color) moves.push([r, c]);
    }
  } else if (type === "B") {
    slide(-1, -1);
    slide(-1, 1);
    slide(1, -1);
    slide(1, 1);
  } else if (type === "R") {
    slide(-1, 0);
    slide(1, 0);
    slide(0, -1);
    slide(0, 1);
  } else if (type === "Q") {
    slide(-1, -1);
    slide(-1, 1);
    slide(1, -1);
    slide(1, 1);
    slide(-1, 0);
    slide(1, 0);
    slide(0, -1);
    slide(0, 1);
  } else if (type === "K") {
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c) && board[r][c]?.color !== color) moves.push([r, c]);
    }
  }
  return moves;
}

function isAttackedBy(
  board: Board,
  row: number,
  col: number,
  byColor: Color,
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== byColor) continue;
      const moves = rawMoves(board, r, c, null);
      if (moves.some(([mr, mc]) => mr === row && mc === col)) return true;
    }
  }
  return false;
}

function isInCheck(board: Board, color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isAttackedBy(board, kingPos[0], kingPos[1], color === "w" ? "b" : "w");
}

function getLegalMoves(
  board: Board,
  row: number,
  col: number,
  enPassant: [number, number] | null,
  castlingRights: ChessGameState["castlingRights"],
): [number, number][] {
  const sq = board[row][col];
  if (!sq) return [];
  const { color } = sq;
  const raw = rawMoves(board, row, col, enPassant);
  const legal: [number, number][] = [];
  for (const [mr, mc] of raw) {
    const nb = cloneBoard(board);
    if (
      sq.type === "P" &&
      enPassant &&
      mr === enPassant[0] &&
      mc === enPassant[1]
    ) {
      const capturedRow = color === "w" ? mr + 1 : mr - 1;
      nb[capturedRow][mc] = null;
    }
    nb[mr][mc] = nb[row][col];
    nb[row][col] = null;
    if (!isInCheck(nb, color)) legal.push([mr, mc]);
  }
  // Castling
  if (sq.type === "K" && !isInCheck(board, color)) {
    const backRank = color === "w" ? 7 : 0;
    if (row === backRank && col === 4) {
      const kRight = color === "w" ? castlingRights.wK : castlingRights.bK;
      if (
        kRight &&
        !board[backRank][5] &&
        !board[backRank][6] &&
        !isAttackedBy(board, backRank, 5, color === "w" ? "b" : "w") &&
        !isAttackedBy(board, backRank, 6, color === "w" ? "b" : "w")
      ) {
        legal.push([backRank, 6]);
      }
      const qRight = color === "w" ? castlingRights.wQ : castlingRights.bQ;
      if (
        qRight &&
        !board[backRank][3] &&
        !board[backRank][2] &&
        !board[backRank][1] &&
        !isAttackedBy(board, backRank, 3, color === "w" ? "b" : "w") &&
        !isAttackedBy(board, backRank, 2, color === "w" ? "b" : "w")
      ) {
        legal.push([backRank, 2]);
      }
    }
  }
  return legal;
}

function hasAnyLegalMoves(
  board: Board,
  color: Color,
  enPassant: [number, number] | null,
  castlingRights: ChessGameState["castlingRights"],
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== color) continue;
      if (getLegalMoves(board, r, c, enPassant, castlingRights).length > 0)
        return true;
    }
  }
  return false;
}

function toAlgebraic(
  piece: Piece,
  fromCol: number,
  toRow: number,
  toCol: number,
  captured: boolean,
): string {
  const file = FILE_NAMES[toCol];
  const rank = 8 - toRow;
  if (piece.type === "P") {
    if (captured) return `${FILE_NAMES[fromCol]}x${file}${rank}`;
    return `${file}${rank}`;
  }
  return `${piece.type}${captured ? "x" : ""}${file}${rank}`;
}

function initChessState(): ChessGameState {
  return {
    board: INIT_BOARD.map((row) => row.map((sq) => (sq ? { ...sq } : null))),
    turn: "w",
    selected: null,
    validMoves: [],
    enPassantTarget: null,
    castlingRights: { wK: true, wQ: true, bK: true, bQ: true },
    status: "playing",
    winner: null,
    moveHistory: [],
    promotionPending: null,
  };
}

// ─── Serialization ────────────────────────────────────────────────────────────

interface SerializedChessState {
  board: (string | null)[][];
  turn: Color;
  enPassantTarget: [number, number] | null;
  castlingRights: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  status: ChessGameState["status"];
  winner: Color | null;
  moveHistory: string[];
}

function serializeChessState(gs: ChessGameState): string {
  const serialized: SerializedChessState = {
    board: gs.board.map((row) =>
      row.map((sq) => (sq ? `${sq.type}${sq.color}` : null)),
    ),
    turn: gs.turn,
    enPassantTarget: gs.enPassantTarget,
    castlingRights: gs.castlingRights,
    status: gs.status,
    winner: gs.winner,
    moveHistory: gs.moveHistory,
  };
  return JSON.stringify(serialized);
}

function deserializeChessState(json: string): ChessGameState | null {
  try {
    const s: SerializedChessState = JSON.parse(json);
    const board: Board = s.board.map((row) =>
      row.map((cell) =>
        cell
          ? ({ type: cell[0] as PieceType, color: cell[1] as Color } as Piece)
          : null,
      ),
    );
    return {
      board,
      turn: s.turn,
      selected: null,
      validMoves: [],
      enPassantTarget: s.enPassantTarget,
      castlingRights: s.castlingRights,
      status: s.status,
      winner: s.winner,
      moveHistory: s.moveHistory,
      promotionPending: null,
    };
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Phase = "lobby" | "waiting" | "game" | "finished";

interface ChessPvPProps {
  onBack?: () => void;
  playerAddress?: string;
}

// Use peerjs.com as broker but with our own deterministic peer IDs
// so host and joiner can find each other reliably with a short 6-char code
// PeerJS default cloud server (no custom host - uses peerjs.com cloud by default)
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
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
  return `om-c-${code.toUpperCase()}`;
}

function generatePlayerId() {
  return `Player${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export default function ChessPvP({ onBack, playerAddress }: ChessPvPProps) {
  const myAddress = useRef(
    localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId(),
  );
  const myColorRef = useRef<Color>("w");
  const mountedRef = useRef(true);
  const lastStateRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [lobbyMode, setLobbyMode] = useState<"choose" | "join">("choose");
  const [myColor, setMyColor] = useState<Color>("w");
  const [opponentAddress, setOpponentAddress] = useState("");
  const [gs, setGs] = useState<ChessGameState>(initChessState);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Keep refs in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    myColorRef.current = myColor;
  }, [myColor]);

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
    myColorRef.current = "w";
    setMyColor("w");
    lastStateRef.current = "";
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
      conn.on("open", () => {
        // Host stays in "waiting" until joiner identifies themselves
      });
      conn.on("data", (data: any) => {
        if (data.type === "joined") {
          // Joiner has connected and identified — now enter game
          if (data.player) setOpponentAddress(data.player);
          setPhase("game");
          phaseRef.current = "game";
          conn.send({
            type: "init",
            state: serializeChessState(initChessState()),
            player: myAddress.current,
          });
        } else if (data.type === "move") {
          const parsed = deserializeChessState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGs(parsed);
            if (
              parsed.status === "checkmate" ||
              parsed.status === "stalemate"
            ) {
              setPhase("finished");
              phaseRef.current = "finished";
            }
          }
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
    // Refresh username at the moment of joining
    myAddress.current =
      localStorage.getItem("odinmario_username") ||
      playerAddress ||
      generatePlayerId();
    setLoading(true);
    setError("");
    const code = joinCode.trim().toUpperCase();
    myColorRef.current = "b";
    setMyColor("b");
    lastStateRef.current = "";
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
        // Send our identity to host; wait for host's "init" before entering game
        conn.send({ type: "joined", player: myAddress.current });
      });
      conn.on("data", (data: any) => {
        if (data.type === "init") {
          // Host confirmed the game — now enter game
          const parsed = deserializeChessState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGs(parsed);
          }
          setPhase("game");
          phaseRef.current = "game";
        } else if (data.type === "move") {
          const parsed = deserializeChessState(data.state);
          if (parsed) {
            if (data.player) setOpponentAddress(data.player);
            setGs(parsed);
            if (
              parsed.status === "checkmate" ||
              parsed.status === "stalemate"
            ) {
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

  const isMyTurn = gs.turn === myColor;

  function executeMove(
    prev: ChessGameState,
    sr: number,
    sc: number,
    tr: number,
    tc: number,
  ): ChessGameState {
    const nb = cloneBoard(prev.board);
    const movingPiece = nb[sr][sc]!;
    const captured = nb[tr][tc];
    let newEnPassant: [number, number] | null = null;
    const newCR = { ...prev.castlingRights };

    if (
      movingPiece.type === "P" &&
      prev.enPassantTarget &&
      tr === prev.enPassantTarget[0] &&
      tc === prev.enPassantTarget[1]
    ) {
      const capRow = movingPiece.color === "w" ? tr + 1 : tr - 1;
      nb[capRow][tc] = null;
    }

    if (movingPiece.type === "K") {
      if (movingPiece.color === "w") {
        newCR.wK = false;
        newCR.wQ = false;
      } else {
        newCR.bK = false;
        newCR.bQ = false;
      }
      if (sc === 4 && tc === 6) {
        nb[tr][5] = nb[tr][7];
        nb[tr][7] = null;
      } else if (sc === 4 && tc === 2) {
        nb[tr][3] = nb[tr][0];
        nb[tr][0] = null;
      }
    }
    if (movingPiece.type === "R") {
      if (sr === 7 && sc === 0) newCR.wQ = false;
      if (sr === 7 && sc === 7) newCR.wK = false;
      if (sr === 0 && sc === 0) newCR.bQ = false;
      if (sr === 0 && sc === 7) newCR.bK = false;
    }

    if (movingPiece.type === "P" && Math.abs(tr - sr) === 2) {
      newEnPassant = [(sr + tr) / 2, tc];
    }

    nb[tr][tc] = movingPiece;
    nb[sr][sc] = null;

    // Auto-promote to queen
    if (movingPiece.type === "P" && (tr === 0 || tr === 7)) {
      nb[tr][tc] = { type: "Q", color: movingPiece.color };
    }

    const moveStr = toAlgebraic(movingPiece, sc, tr, tc, !!captured);
    const newHistory = [...prev.moveHistory, moveStr].slice(-20);
    const nextTurn: Color = prev.turn === "w" ? "b" : "w";

    const inCheck = isInCheck(nb, nextTurn);
    const anyMoves = hasAnyLegalMoves(nb, nextTurn, newEnPassant, newCR);

    let status: ChessGameState["status"] = "playing";
    let winner: Color | null = null;
    if (!anyMoves) {
      if (inCheck) {
        status = "checkmate";
        winner = prev.turn;
      } else {
        status = "stalemate";
      }
    } else if (inCheck) {
      status = "check";
    }

    return {
      board: nb,
      turn: nextTurn,
      selected: null,
      validMoves: [],
      enPassantTarget: newEnPassant,
      castlingRights: newCR,
      status,
      winner,
      moveHistory: newHistory,
      promotionPending: null,
    };
  }

  function handleSquareClick(row: number, col: number) {
    if (!isMyTurn) return;
    if (gs.status !== "playing" && gs.status !== "check") return;
    const sq = gs.board[row][col];

    if (gs.selected) {
      const [sr, sc] = gs.selected;
      const isValid = gs.validMoves.some(
        ([mr, mc]) => mr === row && mc === col,
      );
      if (isValid) {
        const newGs = executeMove(gs, sr, sc, row, col);
        setGs(newGs);

        // Send move via PeerJS
        const serialized = serializeChessState(newGs);
        lastStateRef.current = serialized;
        const isGameOver =
          newGs.status === "checkmate" || newGs.status === "stalemate";
        if (connRef.current?.open) {
          connRef.current.send({
            type: "move",
            state: serialized,
            player: myAddress.current,
          });
        }
        if (isGameOver) {
          setPhase("finished");
          phaseRef.current = "finished";
        }
        return;
      }
      if (sq && sq.color === gs.turn) {
        const moves = getLegalMoves(
          gs.board,
          row,
          col,
          gs.enPassantTarget,
          gs.castlingRights,
        );
        setGs((prev) => ({
          ...prev,
          selected: [row, col],
          validMoves: moves,
        }));
        return;
      }
      setGs((prev) => ({ ...prev, selected: null, validMoves: [] }));
      return;
    }

    if (sq && sq.color === myColor) {
      const moves = getLegalMoves(
        gs.board,
        row,
        col,
        gs.enPassantTarget,
        gs.castlingRights,
      );
      setGs((prev) => ({ ...prev, selected: [row, col], validMoves: moves }));
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
    setGs(initChessState());
    setError("");
    setOpponentAddress("");
    lastStateRef.current = "";
    setMyColor("w");
    myColorRef.current = "w";
  }

  const LIGHT = "#f7b731";
  const DARK = "#e8621a";
  const SELECTED = "rgba(255,230,0,0.7)";
  const VALID_DOT = "rgba(30,180,30,0.6)";
  const CHECK_RED = "rgba(220,30,30,0.6)";

  const kingPos = findKing(gs.board, gs.turn);
  const kingInCheck = gs.status === "check" || gs.status === "checkmate";

  const truncate = (addr: string) =>
    addr.length > 14 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  const isFlipped = myColor === "b";
  const displayBoard = isFlipped
    ? [...gs.board].reverse().map((row) => [...row].reverse())
    : gs.board;

  function toActualCoords(
    displayRow: number,
    displayCol: number,
  ): [number, number] {
    if (isFlipped) return [7 - displayRow, 7 - displayCol];
    return [displayRow, displayCol];
  }

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #0a0a1a 0%, #0d1a2e 50%, #0a0a1a 100%)",
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
          maxWidth: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          data-ocid="chesspvp.back.secondary_button"
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
            color: "#f7b731",
            fontSize: "clamp(12px,3vw,18px)",
            margin: 0,
            textShadow: "0 0 20px rgba(240,217,181,0.6)",
            letterSpacing: 2,
          }}
        >
          ₿ BITCOIN CHESS PvP
        </h1>
        <div style={{ width: 80 }} />
      </div>

      {/* LOBBY */}
      {phase === "lobby" && (
        <div
          data-ocid="chesspvp.lobby.panel"
          style={{
            background: "rgba(15,15,40,0.95)",
            border: "2px solid rgba(181,136,99,0.5)",
            borderRadius: 16,
            padding: "28px 24px",
            width: "100%",
            maxWidth: 420,
            textAlign: "center",
            boxShadow: "0 0 40px rgba(181,136,99,0.2)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>♟️</div>
          <div
            style={{
              color: "#f7b731",
              fontSize: 14,
              marginBottom: 6,
              textShadow: "0 0 12px rgba(240,217,181,0.4)",
            }}
          >
            ₿ BITCOIN CHESS PvP
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 8,
              marginBottom: 24,
              letterSpacing: 1,
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
                data-ocid="chesspvp.create_room.primary_button"
                onClick={handleCreateRoom}
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading
                    ? "rgba(181,136,99,0.3)"
                    : "linear-gradient(180deg, #f39c12 0%, #c05000 100%)",
                  border: "3px solid #f7b731",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 11,
                  padding: "14px 0",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  fontWeight: 700,
                  boxShadow: "0 4px 0 #7c3100, 0 0 20px rgba(181,136,99,0.4)",
                  marginBottom: 12,
                }}
              >
                {loading ? "CREATING..." : "🏠 CREATE ROOM"}
              </button>
              <button
                type="button"
                data-ocid="chesspvp.join_room.secondary_button"
                onClick={() => setLobbyMode("join")}
                disabled={loading}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "2px solid rgba(181,136,99,0.5)",
                  borderRadius: 10,
                  color: "#f7b731",
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
                data-ocid="chesspvp.room_code.input"
                placeholder="ENTER ROOM CODE"
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                maxLength={6}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "2px solid rgba(181,136,99,0.6)",
                  borderRadius: 8,
                  color: "#f7b731",
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
                data-ocid="chesspvp.join.primary_button"
                onClick={handleJoinRoom}
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading
                    ? "rgba(181,136,99,0.3)"
                    : "linear-gradient(180deg, #f39c12 0%, #c05000 100%)",
                  border: "3px solid #f7b731",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 11,
                  padding: "14px 0",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Press Start 2P', monospace",
                  fontWeight: 700,
                  boxShadow: "0 4px 0 #7c3100",
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
                  color: "rgba(240,217,181,0.5)",
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
              data-ocid="chesspvp.error.error_state"
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
          data-ocid="chesspvp.waiting.panel"
          style={{
            background: "rgba(15,15,40,0.95)",
            border: "2px solid rgba(181,136,99,0.5)",
            borderRadius: 16,
            padding: "32px 24px",
            width: "100%",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 0 40px rgba(181,136,99,0.2)",
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
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            Playing as: {truncate(myAddress.current)}
          </div>
          <div
            style={{
              background: "rgba(181,136,99,0.15)",
              border: "2px solid rgba(181,136,99,0.5)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              color: "#f7b731",
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
            data-ocid="chesspvp.cancel.secondary_button"
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
      {phase === "game" && (
        <div
          style={{
            width: "100%",
            maxWidth: 600,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Status bar */}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* My info */}
            <div
              style={{
                background: isMyTurn
                  ? "rgba(181,136,99,0.3)"
                  : "rgba(0,0,0,0.4)",
                border: `2px solid ${isMyTurn ? "#f39c12" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 8,
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>
                {myColor === "w" ? "♔" : "♚"}
              </span>
              <div>
                <div style={{ color: "#f7b731", fontSize: 7 }}>YOU</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 6 }}>
                  {truncate(myAddress.current)}
                </div>
              </div>
              {isMyTurn && (
                <span
                  style={{
                    background: "#22c55e",
                    color: "#fff",
                    fontSize: 6,
                    padding: "2px 6px",
                    borderRadius: 4,
                    animation: "pulse 1s infinite",
                  }}
                >
                  YOUR TURN
                </span>
              )}
            </div>

            {/* Turn indicator */}
            <div
              style={{
                color:
                  gs.status === "check"
                    ? "#ff6b6b"
                    : gs.status === "checkmate"
                      ? "#ff4444"
                      : "rgba(255,255,255,0.6)",
                fontSize: 8,
                textAlign: "center",
              }}
            >
              {gs.status === "checkmate"
                ? "CHECKMATE!"
                : gs.status === "stalemate"
                  ? "STALEMATE!"
                  : gs.status === "check"
                    ? "CHECK!"
                    : isMyTurn
                      ? "YOUR MOVE"
                      : "OPPONENT..."}
            </div>

            {/* Opponent info */}
            <div
              style={{
                background: !isMyTurn
                  ? "rgba(181,136,99,0.3)"
                  : "rgba(0,0,0,0.4)",
                border: `2px solid ${!isMyTurn ? "#f39c12" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 8,
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#f7b731", fontSize: 7 }}>OPPONENT</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 6 }}>
                  {truncate(opponentAddress || "Unknown")}
                </div>
              </div>
              <span style={{ fontSize: 18 }}>
                {myColor === "w" ? "♚" : "♔"}
              </span>
            </div>
          </div>

          {/* Board */}
          <div
            style={{
              display: "inline-block",
              border: "3px solid #f39c12",
              borderRadius: 4,
              boxShadow:
                "0 0 40px rgba(243,156,18,0.4), 0 0 80px rgba(243,156,18,0.1)",
              overflow: "hidden",
            }}
          >
            {displayBoard.map((row, dRowIdx) => (
              <div
                key={`rank-${isFlipped ? 7 - dRowIdx : dRowIdx}`}
                style={{ display: "flex" }}
              >
                {row.map((sq, dColIdx) => {
                  const [actualRow, actualCol] = toActualCoords(
                    dRowIdx,
                    dColIdx,
                  );
                  const isLight = (actualRow + actualCol) % 2 === 0;
                  const isSelected =
                    gs.selected?.[0] === actualRow &&
                    gs.selected?.[1] === actualCol;
                  const isValidMove = gs.validMoves.some(
                    ([mr, mc]) => mr === actualRow && mc === actualCol,
                  );
                  const isKingCheck =
                    kingInCheck &&
                    kingPos?.[0] === actualRow &&
                    kingPos?.[1] === actualCol;
                  let bg = isLight ? LIGHT : DARK;
                  if (isSelected) bg = SELECTED;
                  else if (isKingCheck) bg = CHECK_RED;
                  const squareSize = "min(11vw, 60px)";
                  return (
                    <button
                      type="button"
                      key={`${actualRow}-${actualCol}`}
                      data-ocid={`chesspvp.board.item.${actualRow * 8 + actualCol + 1}`}
                      onClick={() => handleSquareClick(actualRow, actualCol)}
                      style={{
                        outline: "none",
                        cursor: isMyTurn ? "pointer" : "default",
                        padding: 0,
                        width: squareSize,
                        height: squareSize,
                        background: bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      {!isLight && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "clamp(14px, 4vw, 28px)",
                            color: "#fff",
                            opacity: 0.12,
                            pointerEvents: "none",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            zIndex: 0,
                          }}
                        >
                          ₿
                        </div>
                      )}
                      {isValidMove && !sq && (
                        <div
                          style={{
                            width: "30%",
                            height: "30%",
                            borderRadius: "50%",
                            background: VALID_DOT,
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      {isValidMove && sq && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            border: "4px solid rgba(30,180,30,0.7)",
                            borderRadius: 2,
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      {sq && (
                        <span
                          style={{
                            fontSize: "clamp(20px, 5.5vw, 38px)",
                            lineHeight: 1,
                            color: sq.color === "w" ? "#fff" : "#111",
                            textShadow:
                              sq.color === "w"
                                ? "0 1px 3px rgba(0,0,0,0.9), 0 0 1px #000"
                                : "0 1px 3px rgba(255,255,255,0.3)",
                            position: "relative",
                            zIndex: 1,
                            filter:
                              sq.color === myColor ? "none" : "opacity(0.85)",
                          }}
                        >
                          {PIECE_UNICODE[sq.type][sq.color]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Move history */}
          <div
            style={{
              background: "rgba(0,0,20,0.8)",
              border: "1px solid rgba(243,156,18,0.3)",
              borderRadius: 8,
              padding: "10px 12px",
              width: "100%",
              maxHeight: 80,
              overflowY: "auto",
            }}
          >
            <div style={{ color: "#f39c12", fontSize: 8, marginBottom: 6 }}>
              MOVE HISTORY
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {gs.moveHistory.length === 0 ? (
                <span
                  data-ocid="chesspvp.moves.empty_state"
                  style={{ color: "#444", fontSize: 8 }}
                >
                  No moves yet
                </span>
              ) : (
                gs.moveHistory.map((move, i) => (
                  <span
                    key={`move-${i}-${move}`}
                    data-ocid={`chesspvp.moves.item.${i + 1}`}
                    style={{
                      color: i % 2 === 0 ? "#ddd" : "#999",
                      fontSize: 8,
                      background: "rgba(255,255,255,0.05)",
                      padding: "2px 5px",
                      borderRadius: 3,
                    }}
                  >
                    {i + 1}. {move}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* FINISHED */}
      {phase === "finished" && (
        <div
          data-ocid="chesspvp.finished.panel"
          style={{
            background: "rgba(15,15,40,0.97)",
            border: "3px solid #f39c12",
            borderRadius: 20,
            padding: "32px 28px",
            width: "100%",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 0 60px rgba(181,136,99,0.4)",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 12 }}>
            {gs.winner === myColor
              ? "👑"
              : gs.status === "stalemate"
                ? "🤝"
                : "💀"}
          </div>
          <div
            style={{
              color:
                gs.winner === myColor
                  ? "#ffe066"
                  : gs.status === "stalemate"
                    ? "#aaa"
                    : "#ff6b6b",
              fontSize: 16,
              marginBottom: 8,
              textShadow: "0 0 20px currentColor",
            }}
          >
            {gs.status === "stalemate"
              ? "DRAW!"
              : gs.winner === myColor
                ? "YOU WIN!"
                : "OPPONENT WINS!"}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 8,
              marginBottom: 24,
            }}
          >
            {gs.status === "checkmate" ? "Checkmate" : "Stalemate"}
          </div>
          <button
            type="button"
            data-ocid="chesspvp.play_again.primary_button"
            onClick={resetGame}
            style={{
              background: "linear-gradient(180deg, #f39c12 0%, #c05000 100%)",
              border: "3px solid #f7b731",
              borderRadius: 10,
              color: "#fff",
              fontSize: 10,
              padding: "12px 28px",
              cursor: "pointer",
              fontFamily: "'Press Start 2P', monospace",
              boxShadow: "0 4px 0 #7c3100",
            }}
          >
            ₿ PLAY AGAIN
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
