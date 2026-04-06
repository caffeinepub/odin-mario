import { useEffect, useRef, useState } from "react";

type Color = "w" | "b";
type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
type Piece = { type: PieceType; color: Color };
type Square = Piece | null;
type Board = Square[][];

interface GameState {
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

function getLegalMoves(
  board: Board,
  row: number,
  col: number,
  enPassant: [number, number] | null,
  castlingRights: GameState["castlingRights"],
): [number, number][] {
  const sq = board[row][col];
  if (!sq) return [];
  const { color } = sq;
  const raw = rawMoves(board, row, col, enPassant);
  const legal: [number, number][] = [];
  for (const [mr, mc] of raw) {
    const nb = cloneBoard(board);
    // En passant capture
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
      // Kingside
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
      // Queenside
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
  castlingRights: GameState["castlingRights"],
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
  const p = piece.type;
  return `${p}${captured ? "x" : ""}${file}${rank}`;
}

function initState(): GameState {
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

const PIECE_VALUES: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000,
};

function evaluateBoard(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) score += PIECE_VALUES[sq.type] * (sq.color === "w" ? 1 : -1);
    }
  }
  return score;
}

function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  enPassant: [number, number] | null,
  castlingRights: GameState["castlingRights"],
): number {
  if (depth === 0) return evaluateBoard(board);
  const color: Color = maximizing ? "w" : "b";
  const allMoves: [number, number, number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const moves = getLegalMoves(board, r, c, enPassant, castlingRights);
        for (const [tr, tc] of moves) allMoves.push([r, c, tr, tc]);
      }
    }
  }
  if (allMoves.length === 0) return maximizing ? -99999 : 99999;
  if (maximizing) {
    let best = Number.NEGATIVE_INFINITY;
    let localAlpha = alpha;
    for (const [sr, sc, tr, tc] of allMoves) {
      const nb = cloneBoard(board);
      const mp = nb[sr][sc]!;
      nb[tr][tc] = mp;
      nb[sr][sc] = null;
      if (mp.type === "P" && (tr === 0 || tr === 7))
        nb[tr][tc] = { type: "Q", color: mp.color };
      const val = minimax(
        nb,
        depth - 1,
        localAlpha,
        beta,
        false,
        null,
        castlingRights,
      );
      best = Math.max(best, val);
      localAlpha = Math.max(localAlpha, best);
      if (beta <= localAlpha) break;
    }
    return best;
  }
  let bestMin = Number.POSITIVE_INFINITY;
  let localBeta = beta;
  for (const [sr, sc, tr, tc] of allMoves) {
    const nb = cloneBoard(board);
    const mp = nb[sr][sc]!;
    nb[tr][tc] = mp;
    nb[sr][sc] = null;
    if (mp.type === "P" && (tr === 0 || tr === 7))
      nb[tr][tc] = { type: "Q", color: mp.color };
    const val = minimax(
      nb,
      depth - 1,
      alpha,
      localBeta,
      true,
      null,
      castlingRights,
    );
    bestMin = Math.min(bestMin, val);
    localBeta = Math.min(localBeta, bestMin);
    if (localBeta <= alpha) break;
  }
  return bestMin;
}

function getBestMove(
  board: Board,
  color: Color,
  depth: number,
  enPassant: [number, number] | null,
  castlingRights: GameState["castlingRights"],
): [number, number, number, number] | null {
  const allMoves: [number, number, number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const moves = getLegalMoves(board, r, c, enPassant, castlingRights);
        for (const [tr, tc] of moves) allMoves.push([r, c, tr, tc]);
      }
    }
  }
  if (allMoves.length === 0) return null;
  const maximizing = color === "w";
  let bestVal = maximizing
    ? Number.NEGATIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  let bestMove = allMoves[Math.floor(Math.random() * allMoves.length)];
  for (const [sr, sc, tr, tc] of allMoves) {
    const nb = cloneBoard(board);
    const mp = nb[sr][sc]!;
    nb[tr][tc] = mp;
    nb[sr][sc] = null;
    if (mp.type === "P" && (tr === 0 || tr === 7))
      nb[tr][tc] = { type: "Q", color: mp.color };
    const val = minimax(
      nb,
      depth - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      !maximizing,
      null,
      castlingRights,
    );
    if (maximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = [sr, sc, tr, tc];
    }
  }
  return bestMove;
}

export default function Chess({ onBack }: { onBack?: () => void }) {
  const [gs, setGs] = useState<GameState>(initState);
  const [difficulty, setDifficulty] = useState<
    "human" | "easy" | "medium" | "hard"
  >("human");
  const [vsComputer, setVsComputer] = useState(false);
  const aiThinkingRef = useRef(false);

  useEffect(() => {
    if (!vsComputer) return;
    if (gs.turn !== "b") return;
    if (gs.status !== "playing" && gs.status !== "check") return;
    if (aiThinkingRef.current) return;
    aiThinkingRef.current = true;
    const delay =
      difficulty === "easy" ? 300 : difficulty === "medium" ? 500 : 700;
    const depth = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
    setTimeout(() => {
      setGs((prev) => {
        if (prev.turn !== "b") {
          aiThinkingRef.current = false;
          return prev;
        }
        const move =
          difficulty === "easy"
            ? (() => {
                const allMoves: [number, number, number, number][] = [];
                for (let r = 0; r < 8; r++)
                  for (let c = 0; c < 8; c++) {
                    if (prev.board[r][c]?.color === "b") {
                      for (const [tr2, tc2] of getLegalMoves(
                        prev.board,
                        r,
                        c,
                        prev.enPassantTarget,
                        prev.castlingRights,
                      ))
                        allMoves.push([r, c, tr2, tc2]);
                    }
                  }
                return allMoves.length > 0
                  ? allMoves[Math.floor(Math.random() * allMoves.length)]
                  : null;
              })()
            : getBestMove(
                prev.board,
                "b",
                depth,
                prev.enPassantTarget,
                prev.castlingRights,
              );
        if (!move) {
          aiThinkingRef.current = false;
          return prev;
        }
        const [sr, sc, tr, tc] = move;
        const result = executeMove(prev, sr, sc, tr, tc);
        aiThinkingRef.current = false;
        return result;
      });
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.turn, gs.status, vsComputer, difficulty]);

  function handleSquareClick(row: number, col: number) {
    if (vsComputer && gs.turn === "b") return; // AI's turn
    if (gs.status !== "playing" && gs.status !== "check") return;
    if (gs.promotionPending) return;
    const sq = gs.board[row][col];

    // If a piece is already selected
    if (gs.selected) {
      const [sr, sc] = gs.selected;
      const isValid = gs.validMoves.some(
        ([mr, mc]) => mr === row && mc === col,
      );
      if (isValid) {
        // Execute move
        setGs((prev) => executeMove(prev, sr, sc, row, col));
        return;
      }
      // Clicking own piece => reselect
      if (sq && sq.color === gs.turn) {
        const moves = getLegalMoves(
          gs.board,
          row,
          col,
          gs.enPassantTarget,
          gs.castlingRights,
        );
        setGs((prev) => ({ ...prev, selected: [row, col], validMoves: moves }));
        return;
      }
      // Clicking empty or enemy non-move => deselect
      setGs((prev) => ({ ...prev, selected: null, validMoves: [] }));
      return;
    }

    // No selection yet
    if (sq && sq.color === gs.turn) {
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

  function executeMove(
    prev: GameState,
    sr: number,
    sc: number,
    tr: number,
    tc: number,
  ): GameState {
    const nb = cloneBoard(prev.board);
    const movingPiece = nb[sr][sc]!;
    const captured = nb[tr][tc];
    let newEnPassant: [number, number] | null = null;
    let promotionPending: [number, number] | null = null;
    const newCR = { ...prev.castlingRights };

    // En passant capture
    if (
      movingPiece.type === "P" &&
      prev.enPassantTarget &&
      tr === prev.enPassantTarget[0] &&
      tc === prev.enPassantTarget[1]
    ) {
      const capRow = movingPiece.color === "w" ? tr + 1 : tr - 1;
      nb[capRow][tc] = null;
    }

    // Castling
    if (movingPiece.type === "K") {
      if (movingPiece.color === "w") {
        newCR.wK = false;
        newCR.wQ = false;
      } else {
        newCR.bK = false;
        newCR.bQ = false;
      }
      if (sc === 4 && tc === 6) {
        // Kingside
        nb[tr][5] = nb[tr][7];
        nb[tr][7] = null;
      } else if (sc === 4 && tc === 2) {
        // Queenside
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

    // Pawn double push => set en passant
    if (movingPiece.type === "P" && Math.abs(tr - sr) === 2) {
      newEnPassant = [(sr + tr) / 2, tc];
    }

    nb[tr][tc] = movingPiece;
    nb[sr][sc] = null;

    // Pawn promotion
    if (movingPiece.type === "P" && (tr === 0 || tr === 7)) {
      // Auto-promote to queen
      nb[tr][tc] = { type: "Q", color: movingPiece.color };
      promotionPending = null;
    }

    const moveStr = toAlgebraic(movingPiece, sc, tr, tc, !!captured);
    const newHistory = [...prev.moveHistory, moveStr].slice(-20);
    const nextTurn: Color = prev.turn === "w" ? "b" : "w";

    const inCheck = isInCheck(nb, nextTurn);
    const anyMoves = hasAnyLegalMoves(nb, nextTurn, newEnPassant, newCR);

    let status: GameState["status"] = "playing";
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
      promotionPending,
    };
  }

  function newGame() {
    setGs(initState());
  }

  const LIGHT = "#f0d9b5";
  const DARK = "#b58863";
  const SELECTED = "rgba(255,230,0,0.7)";
  const VALID_DOT = "rgba(30,160,30,0.55)";
  const CHECK_RED = "rgba(220,30,30,0.6)";

  const kingPos = findKing(gs.board, gs.turn);
  const kingInCheck = gs.status === "check" || gs.status === "checkmate";

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        background: "#0a0a2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "monospace",
        overflowY: "auto",
        paddingBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(0,0,30,0.9)",
          borderBottom: "1px solid #333",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        {onBack && (
          <button
            type="button"
            data-ocid="chess.back.secondary_button"
            onClick={onBack}
            style={{
              background: "transparent",
              border: "2px solid #555",
              borderRadius: 8,
              color: "#aaa",
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "monospace",
            }}
          >
            ← Back
          </button>
        )}
        <h1
          style={{
            color: "#f0d9b5",
            fontSize: "clamp(14px,3vw,22px)",
            margin: 0,
            textShadow: "0 0 16px rgba(240,217,181,0.5)",
            letterSpacing: 3,
            flex: 1,
            textAlign: "center",
          }}
        >
          ♟ ODIN CHESS
        </h1>
        <button
          type="button"
          data-ocid="chess.new_game.secondary_button"
          onClick={newGame}
          style={{
            background: "#b58863",
            border: "none",
            borderRadius: 8,
            color: "white",
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        >
          New Game
        </button>
      </div>

      {/* Turn indicator */}
      <div
        style={{
          padding: "8px 16px",
          color: gs.turn === "w" ? "#f0d9b5" : "#333",
          background: gs.turn === "w" ? "#555" : "#eee",
          borderRadius: 8,
          marginTop: 10,
          fontSize: 14,
          fontWeight: "bold",
          letterSpacing: 1,
          textAlign: "center",
          minWidth: 160,
        }}
      >
        {gs.status === "checkmate"
          ? `${gs.winner === "w" ? "White" : "Black"} wins! Checkmate!`
          : gs.status === "stalemate"
            ? "Stalemate! Draw!"
            : gs.status === "check"
              ? `${gs.turn === "w" ? "White" : "Black"}'s Turn – CHECK!`
              : `${gs.turn === "w" ? "White" : "Black"}'s Turn`}
      </div>

      {/* Game Mode Selector */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 4,
          marginTop: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          padding: "0 8px",
        }}
      >
        <button
          type="button"
          data-ocid="chess.vs_human.toggle"
          onClick={() => {
            setVsComputer(false);
            setGs(initState());
            aiThinkingRef.current = false;
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: "bold",
            background: !vsComputer ? "#b58863" : "#333",
            color: !vsComputer ? "white" : "#aaa",
          }}
        >
          2 Players
        </button>
        <button
          type="button"
          data-ocid="chess.vs_easy.toggle"
          onClick={() => {
            setVsComputer(true);
            setDifficulty("easy");
            setGs(initState());
            aiThinkingRef.current = false;
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: "bold",
            background:
              vsComputer && difficulty === "easy" ? "#4caf50" : "#333",
            color: vsComputer && difficulty === "easy" ? "white" : "#aaa",
          }}
        >
          vs CPU Easy
        </button>
        <button
          type="button"
          data-ocid="chess.vs_medium.toggle"
          onClick={() => {
            setVsComputer(true);
            setDifficulty("medium");
            setGs(initState());
            aiThinkingRef.current = false;
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: "bold",
            background:
              vsComputer && difficulty === "medium" ? "#ff9800" : "#333",
            color: vsComputer && difficulty === "medium" ? "white" : "#aaa",
          }}
        >
          vs CPU Medium
        </button>
        <button
          type="button"
          data-ocid="chess.vs_hard.toggle"
          onClick={() => {
            setVsComputer(true);
            setDifficulty("hard");
            setGs(initState());
            aiThinkingRef.current = false;
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: "bold",
            background:
              vsComputer && difficulty === "hard" ? "#f44336" : "#333",
            color: vsComputer && difficulty === "hard" ? "white" : "#aaa",
          }}
        >
          vs CPU Hard
        </button>
      </div>

      {/* Main layout: board + history */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "center",
          padding: "0 8px",
        }}
      >
        {/* Board */}
        <div
          style={{
            display: "inline-block",
            border: "3px solid #b58863",
            borderRadius: 4,
            boxShadow: "0 0 30px rgba(181,136,99,0.4)",
            overflow: "hidden",
          }}
        >
          {gs.board.map((row, rowIdx) => (
            <div key={`rank-${8 - rowIdx}`} style={{ display: "flex" }}>
              {row.map((sq, colIdx) => {
                const isLight = (rowIdx + colIdx) % 2 === 0;
                const isSelected =
                  gs.selected?.[0] === rowIdx && gs.selected?.[1] === colIdx;
                const isValidMove = gs.validMoves.some(
                  ([mr, mc]) => mr === rowIdx && mc === colIdx,
                );
                const isKingCheck =
                  kingInCheck &&
                  kingPos?.[0] === rowIdx &&
                  kingPos?.[1] === colIdx;
                let bg = isLight ? LIGHT : DARK;
                if (isSelected) bg = SELECTED;
                else if (isKingCheck) bg = CHECK_RED;
                const squareSize = "min(10vw, 56px)";
                return (
                  <button
                    type="button"
                    key={`${FILE_NAMES[colIdx]}${8 - rowIdx}`}
                    data-ocid={`chess.board.item.${rowIdx * 8 + colIdx + 1}`}
                    onClick={() => handleSquareClick(rowIdx, colIdx)}
                    style={{
                      outline: "none",
                      cursor: "pointer",
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
                          border: "4px solid rgba(30,160,30,0.7)",
                          borderRadius: 2,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {sq && (
                      <span
                        style={{
                          fontSize: "clamp(20px,5.5vw,36px)",
                          lineHeight: 1,
                          color: sq.color === "w" ? "#fff" : "#111",
                          textShadow:
                            sq.color === "w"
                              ? "0 1px 3px rgba(0,0,0,0.8), 0 0 1px #000"
                              : "0 1px 3px rgba(255,255,255,0.3)",
                          position: "relative",
                          zIndex: 1,
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

        {/* Move history panel */}
        <div
          style={{
            background: "rgba(0,0,20,0.85)",
            border: "1px solid #b58863",
            borderRadius: 8,
            padding: "12px 14px",
            minWidth: 140,
            maxWidth: 160,
            maxHeight: 480,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              color: "#b58863",
              fontSize: 12,
              fontWeight: "bold",
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            MOVES
          </div>
          {gs.moveHistory.length === 0 && (
            <div
              data-ocid="chess.moves.empty_state"
              style={{ color: "#555", fontSize: 11 }}
            >
              No moves yet
            </div>
          )}
          {gs.moveHistory.map((move, i) => (
            <div
              key={`move-${i}-${move}`}
              data-ocid={`chess.moves.item.${i + 1}`}
              style={{
                display: "flex",
                gap: 8,
                fontSize: 12,
                padding: "2px 4px",
                background:
                  i === gs.moveHistory.length - 1
                    ? "rgba(181,136,99,0.2)"
                    : "transparent",
                borderRadius: 4,
              }}
            >
              <span style={{ color: "#555", minWidth: 20 }}>{i + 1}.</span>
              <span style={{ color: i % 2 === 0 ? "#eee" : "#aaa" }}>
                {move}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Game over overlay */}
      {(gs.status === "checkmate" || gs.status === "stalemate") && (
        <div
          data-ocid="chess.result.panel"
          style={{
            marginTop: 16,
            background: "rgba(0,0,30,0.95)",
            border: "2px solid #b58863",
            borderRadius: 12,
            padding: "20px 32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>
            {gs.status === "checkmate" ? "👑" : "🤝"}
          </div>
          <div
            style={{
              color: "#f0d9b5",
              fontSize: 20,
              fontWeight: "bold",
              marginBottom: 16,
            }}
          >
            {gs.status === "checkmate"
              ? `${gs.winner === "w" ? "White" : "Black"} Wins!`
              : "Draw by Stalemate"}
          </div>
          <button
            type="button"
            data-ocid="chess.new_game.primary_button"
            onClick={newGame}
            style={{
              background: "#b58863",
              border: "none",
              borderRadius: 8,
              color: "white",
              padding: "10px 28px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: "bold",
            }}
          >
            Play Again
          </button>
        </div>
      )}

      <div
        style={{
          textAlign: "center",
          marginTop: 16,
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: "1px",
        }}
      >
        Built by ODINMARIO
      </div>
    </div>
  );
}
