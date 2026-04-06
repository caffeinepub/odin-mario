declare module "peerjs" {
  interface PeerOptions {
    host?: string;
    port?: number;
    path?: string;
    key?: string;
    debug?: number;
    config?: RTCConfiguration;
    secure?: boolean;
  }

  interface DataConnection {
    peer: string;
    open: boolean;
    on(event: "open", cb: () => void): void;
    on(event: "data", cb: (data: unknown) => void): void;
    on(event: "close", cb: () => void): void;
    on(event: "error", cb: (err: Error) => void): void;
    send(data: unknown): void;
    close(): void;
  }

  class Peer {
    constructor(id?: string, options?: PeerOptions);
    id: string;
    on(event: "open", cb: (id: string) => void): void;
    on(event: "connection", cb: (conn: DataConnection) => void): void;
    on(event: "error", cb: (err: Error) => void): void;
    on(event: "close", cb: () => void): void;
    connect(peer: string, options?: unknown, meta?: unknown): DataConnection;
    destroy(): void;
  }

  export default Peer;
}
