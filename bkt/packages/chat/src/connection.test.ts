import type { ServerRequest } from "@hermes/shared/json-rpc-channel";
import { GatewayConnection } from "./connection";
import type { SocketLike } from "./connection";

type Listener = (event: never) => void;

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  private listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.fire("close", { code: 1006, reason: "" });
  }
  fire(type: string, event: unknown = {}) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const l of this.listeners.get(type) ?? []) (l as (e: unknown) => void)(event);
  }
  receive(frame: unknown) {
    this.fire("message", { data: JSON.stringify(frame) });
  }
}

describe("GatewayConnection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("builds a fresh URL for every reconnect and reports the reconnect", async () => {
    const sockets: FakeSocket[] = [];
    let ticket = 0;
    const reconnected = vi.fn();
    const connection = new GatewayConnection({
      buildUrl: async () => `ws://host/api/ws?ticket=t${++ticket}`,
      socketFactory: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      onEvent: () => undefined,
      onRequest: () => undefined,
      onStatus: () => undefined,
      onReconnected: reconnected,
      backoff: { jitter: false, baseDelayMs: 10 },
    });
    connection.start();
    await vi.runOnlyPendingTimersAsync();
    sockets[0].fire("open");
    expect(reconnected).not.toHaveBeenCalled();

    sockets[0].fire("close", { code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(20);
    expect(sockets.map((s) => s.url)).toEqual(["ws://host/api/ws?ticket=t1", "ws://host/api/ws?ticket=t2"]);
    sockets[1].fire("open");
    expect(reconnected).toHaveBeenCalledTimes(1);
    connection.stop();
  });

  it("re-delivers open_requests from a resume reply to the request handler", async () => {
    let socket: FakeSocket | null = null;
    const requests: ServerRequest[] = [];
    const connection = new GatewayConnection({
      buildUrl: async () => "ws://host/api/ws?token=x",
      socketFactory: (url) => (socket = new FakeSocket(url)),
      onEvent: () => undefined,
      onRequest: (request) => {
        requests.push(request);
      },
      onStatus: () => undefined,
      onReconnected: () => undefined,
    });
    connection.start();
    await vi.runOnlyPendingTimersAsync();
    const s = socket as unknown as FakeSocket;
    s.fire("open");
    const pending = connection.request("session.resume", { session_id: "stored1", profile: "work" });
    const sent = s.sent.find((f) => f.method === "session.resume");
    expect(sent?.params).toEqual({ session_id: "stored1", profile: "work" });
    s.receive({
      jsonrpc: "2.0",
      id: sent?.id,
      result: { session_id: "rt9", open_requests: [{ id: "srq-7", method: "approval", params: { session_id: "rt9", request_id: "ap7" } }] },
    });
    await pending;
    expect(requests.map((r) => [r.id, r.method, r.replayed])).toEqual([["srq-7", "approval", true]]);
    requests[0].respond({ choice: "deny" });
    expect(s.sent[s.sent.length - 1]).toEqual({ jsonrpc: "2.0", id: "srq-7", result: { choice: "deny" } });
    connection.stop();
  });

  it("answers a server request nobody accepts with the -32601 decline", async () => {
    let socket: FakeSocket | null = null;
    const connection = new GatewayConnection({
      buildUrl: async () => "ws://host/api/ws?token=x",
      socketFactory: (url) => (socket = new FakeSocket(url)),
      onEvent: () => undefined,
      onRequest: (request) => request.fail(-32601, `bkt-chat cannot show a ${request.method} request`),
      onStatus: () => undefined,
      onReconnected: () => undefined,
    });
    connection.start();
    await vi.runOnlyPendingTimersAsync();
    const s = socket as unknown as FakeSocket;
    s.fire("open");
    s.receive({ jsonrpc: "2.0", id: "srq-9", method: "sudo", params: { session_id: "rt1" } });
    expect(s.sent[s.sent.length - 1]).toEqual({ jsonrpc: "2.0", id: "srq-9", error: { code: -32601, message: "bkt-chat cannot show a sudo request" } });
    connection.stop();
  });
});
