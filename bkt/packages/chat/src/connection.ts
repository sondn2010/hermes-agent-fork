// One /api/ws JSON-RPC socket with reconnect. The protocol half (ids, timeouts, server requests,
// open_requests replay, heartbeat) is the desktop's shared JsonRpcRequestChannel, bundled read-only.
import type { GatewayEvent } from "@hermes/shared/gateway-events";
import { JsonRpcRequestChannel, wireFrameText } from "@hermes/shared/json-rpc-channel";
import type { JsonRpcTransport, ServerRequestHandler } from "@hermes/shared/json-rpc-channel";
import { isStableOpen, reconnectBackoffDelayMs } from "@hermes/shared/reconnect-backoff";
import type { ReconnectBackoffOptions } from "@hermes/shared/reconnect-backoff";
import type { ConnectionStatus } from "./reducer";

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "close" | "error" | "message", listener: (event: never) => void): void;
}

export interface GatewayConnectionOptions {
  /** Called for EVERY connect and reconnect: a gated-mode ticket is single-use and short-lived. */
  buildUrl: () => Promise<string>;
  onEvent: (event: GatewayEvent) => void;
  onRequest: ServerRequestHandler;
  onStatus: (status: ConnectionStatus) => void;
  /** After a reconnect (not the first open): re-attach sessions and replay pending approvals. */
  onReconnected: () => void;
  onError?: (message: string) => void;
  socketFactory?: (url: string) => SocketLike;
  backoff?: ReconnectBackoffOptions;
  requestTimeoutMs?: number;
}

const OPEN = 1;

export class GatewayConnection {
  private readonly channel: JsonRpcRequestChannel;
  private socket: SocketLike | null = null;
  private transport: JsonRpcTransport | null = null;
  private attempt = 0;
  private openedAt: number | null = null;
  private everOpened = false;
  private stopped = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  constructor(private readonly options: GatewayConnectionOptions) {
    this.channel = new JsonRpcRequestChannel({
      requestIdPrefix: "bkt",
      // Streamed deltas count as liveness; only a silent drop trips the deadline.
      heartbeatLiveness: "any-inbound",
      requestTimeoutMs: options.requestTimeoutMs,
      onEvent: (event) => {
        if (event.type === "gateway.ready" && (event.payload as { heartbeat?: boolean } | undefined)?.heartbeat === true) {
          this.channel.startHeartbeat();
        }
        options.onEvent(event);
      },
      onHeartbeatFailure: (error) => this.drop(error.message),
      onRequestHandlerError: (error, request) => options.onError?.(`${request.method} handler failed: ${error.message}`),
    });
    this.channel.onRequest(options.onRequest);
  }

  get connected(): boolean {
    return this.channel.connected;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.release(new Error("connection closed"));
    try {
      socket?.close(1000, "bkt-chat closed");
    } catch {
      // already closing
    }
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("connection closed"));
    this.options.onStatus({ state: "closed" });
  }

  /** Resolves once the socket is open (immediately when it already is). */
  whenOpen(): Promise<void> {
    if (this.channel.connected) return Promise.resolve();
    if (this.stopped) return Promise.reject(new Error("connection closed"));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  request<T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    return this.channel.request<T>(method, params, timeoutMs, undefined, () => new Error("Not connected to the Hermes gateway"));
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.options.onStatus(this.everOpened ? { state: "reconnecting", attempt: this.attempt, delayMs: 0, reason: "dialling" } : { state: "connecting" });
    let url: string;
    try {
      url = await this.options.buildUrl();
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : String(error));
      return;
    }
    if (this.stopped) return;
    let socket: SocketLike;
    try {
      socket = this.options.socketFactory ? this.options.socketFactory(url) : (new WebSocket(url) as SocketLike);
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : String(error));
      return;
    }
    const transport: JsonRpcTransport = {
      send: (text) => {
        if (socket.readyState !== OPEN) throw new Error("WebSocket is not open");
        socket.send(text);
      },
    };
    this.socket = socket;
    this.transport = transport;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.openedAt = Date.now();
      this.channel.attach(transport);
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.options.onStatus({ state: "open" });
      for (const waiter of this.waiters.splice(0)) waiter.resolve();
      if (reconnected) this.options.onReconnected();
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      if (this.socket !== socket) return;
      const text = wireFrameText(event.data);
      if (text !== null) this.channel.handleFrame(text);
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.release(new Error("WebSocket closed"));
      this.scheduleReconnect(`closed (${event.code}${event.reason ? ` ${event.reason}` : ""})`);
    });
    socket.addEventListener("error", () => {
      // A close event always follows; reconnect is scheduled there.
    });
  }

  /** Drop the current generation (heartbeat timeout) and redial. */
  private drop(reason: string): void {
    const socket = this.socket;
    if (!socket) return;
    this.release(new Error(reason));
    try {
      socket.close(4000, "heartbeat timeout");
    } catch {
      // already closing
    }
    this.scheduleReconnect(reason);
  }

  private release(error: Error): void {
    this.socket = null;
    if (this.transport && this.channel.owns(this.transport)) this.channel.detach(error);
    this.transport = null;
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped || this.timer) return;
    // A socket that died right after opening counts as a failed attempt (no reset).
    if (isStableOpen(this.openedAt)) this.attempt = 0;
    this.openedAt = null;
    const delayMs = Math.round(reconnectBackoffDelayMs(this.attempt, this.options.backoff));
    this.options.onStatus({ state: "reconnecting", attempt: this.attempt + 1, delayMs, reason });
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delayMs);
  }
}
