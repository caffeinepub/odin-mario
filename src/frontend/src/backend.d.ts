import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ScoreEntry {
    score: bigint;
    playerName: string;
}
export interface PvPRoom {
    roomCode: string;
    player1: string;
    player2: string;
    gameType: string;
    gameState: string;
    currentTurn: string;
    status: string;
    winner: string;
}
export interface backendInterface {
    getTop10Scores(): Promise<Array<ScoreEntry>>;
    submitScore(playerName: string, score: bigint): Promise<void>;
    getTokenStatsJson(): Promise<string>;
    clearLeaderboard(): Promise<void>;
    createPvPRoom(player1: string, gameType: string, initialState: string): Promise<string>;
    joinPvPRoom(code: string, player2: string): Promise<boolean>;
    getPvPRoom(code: string): Promise<Option<PvPRoom>>;
    updatePvPState(code: string, playerAddr: string, newState: string, nextTurn: string): Promise<boolean>;
    finishPvPGame(code: string, winner: string): Promise<boolean>;
    getWaitingRoom(gameType: string, excludePlayer: string): Promise<Option<PvPRoom>>;
}
