import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface ScoreEntry {
    score: bigint;
    playerName: string;
}
export interface PvPRoom {
    status: string;
    winner: string;
    currentTurn: string;
    player1: string;
    player2: string;
    gameState: string;
    gameType: string;
    roomCode: string;
}
export interface http_header {
    value: string;
    name: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface backendInterface {
    clearLeaderboard(): Promise<void>;
    createPvPRoom(player1: string, gameType: string, initialState: string): Promise<string>;
    finishPvPGame(code: string, winner: string): Promise<boolean>;
    getPvPRoom(code: string): Promise<PvPRoom | null>;
    getTokenStatsJson(): Promise<string>;
    getTop10Scores(): Promise<Array<ScoreEntry>>;
    getWaitingRoom(gameType: string, excludePlayer: string): Promise<PvPRoom | null>;
    joinPvPRoom(code: string, player2: string): Promise<boolean>;
    submitScore(playerName: string, score: bigint): Promise<void>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updatePvPState(code: string, playerAddr: string, newState: string, nextTurn: string): Promise<boolean>;
}
